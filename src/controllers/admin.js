import { z } from 'zod';
import { eq, sql, desc, and } from 'drizzle-orm';
import { db, products, orders, orderItems, users, categories, files, downloadHistory, bundleItems, refunds } from '../db/index.js';
import { refundAmount } from '../utils/pricing.js';
import { inArray, ne } from 'drizzle-orm';
import { persist, saveFile, fetchPdf, removeFiles } from '../services/storage.js';
import { refundPayment } from '../services/phonepe.js';
import { pub } from '../utils/product.js';
import { isId } from '../utils/validate.js';
import { ok, ApiError, wrap } from '../utils/respond.js';

const bool = (v) => v === true || v === 'true';
const fields = (b) => ({
  ...(b.title !== undefined && { title: b.title }), ...(b.description !== undefined && { description: b.description }),
  ...(b.type && { type: b.type }), ...(b.price !== undefined && { price: +b.price }), ...(b.mrp && { mrp: +b.mrp }),
  ...(b.categoryId && { categoryId: b.categoryId }), ...(b.isActive !== undefined && { isActive: bool(b.isActive) }), ...(b.isFeatured !== undefined && { isFeatured: bool(b.isFeatured) }),
  ...(b.tags !== undefined && { tags: b.tags.split(',').map((t) => t.trim()).filter(Boolean) }),
});
// PDF source: uploaded file (from computer) OR a Google Drive / direct link that the server downloads.
async function fileInputs(req) {
  const out = await persist(req.files);
  if (!out.pdfFileId && req.body.driveUrl?.trim()) out.pdfFileId = await saveFile('pdf', 'application/pdf', await fetchPdf(req.body.driveUrl.trim()));
  return out;
}

const idList = (v) => { try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? [...new Set(a.filter(isId))] : []; } catch { return []; } };
async function checkMembers(ids) { // bundles can only contain normal (non-bundle) products
  if (ids.length < 2) throw new ApiError(422, 'Pick at least 2 products for a bundle');
  const found = await db.select({ id: products.id }).from(products).where(and(inArray(products.id, ids), ne(products.type, 'bundle')));
  if (found.length !== ids.length) throw new ApiError(422, 'A bundle can only contain regular products');
}
export const listProducts = wrap(async (_q, res) => {
  const [rows, links] = await Promise.all([
    db.select({ p: products, size: files.size }).from(products).leftJoin(files, eq(files.id, products.pdfFileId)).orderBy(desc(products.createdAt)), db.select().from(bundleItems)]);
  ok(res, rows.map(({ p, size }) => ({ ...pub(p), hasFile: !!p.pdfFileId, fileSize: size || 0, bundleIds: links.filter((l) => l.bundleId === p.id).map((l) => l.productId) })));
});
export const createProduct = wrap(async (req, res) => {
  const f = fields(req.body);
  if (!f.title?.trim()) throw new ApiError(422, 'Title is required');
  if (!(f.price > 0)) throw new ApiError(422, 'Price must be greater than 0');
  const bundle = f.type === 'bundle', members = idList(req.body.bundleIds);
  if (bundle) await checkMembers(members);
  const fi = bundle ? await persist({ cover: req.files?.cover }) : await fileInputs(req); // a bundle has no PDF of its own
  if (!bundle && !fi.pdfFileId) throw new ApiError(422, 'Upload a PDF or paste a Google Drive link');
  const [p] = await db.insert(products).values({ ...f, ...fi }).returning();
  if (bundle) await db.insert(bundleItems).values(members.map((id) => ({ bundleId: p.id, productId: id })));
  ok(res, pub(p), 'Product created', 201);
});
export const updateProduct = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(404, 'Not found');
  const [old] = await db.select().from(products).where(eq(products.id, req.params.id));
  if (!old) throw new ApiError(404, 'Not found');
  const f = fields(req.body);
  if (f.price !== undefined && !(f.price > 0)) throw new ApiError(422, 'Price must be greater than 0');
  const bundle = (f.type || old.type) === 'bundle';
  const fi = bundle ? await persist({ cover: req.files?.cover }) : await fileInputs(req);
  if (bundle && req.body.bundleIds !== undefined) {
    const members = idList(req.body.bundleIds); await checkMembers(members.filter((id) => id !== old.id));
    await db.delete(bundleItems).where(eq(bundleItems.bundleId, old.id));
    await db.insert(bundleItems).values(members.map((id) => ({ bundleId: old.id, productId: id })));
  }
  const dropSample = bool(req.body.removeSample) && !fi.previewFileId; // admin ticked "remove sample"
  const [p] = await db.update(products).set({ ...f, ...fi, ...(dropSample && { previewFileId: null }) }).where(eq(products.id, old.id)).returning();
  await removeFiles(fi.pdfFileId && old.pdfFileId, fi.coverFileId && old.coverFileId, (fi.previewFileId || dropSample) && old.previewFileId); // drop replaced files
  ok(res, pub(p), 'Product updated');
});
// Products that already have orders/downloads are hidden instead of deleted, so purchase history stays intact.
export const deleteProduct = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(404, 'Not found');
  const [p] = await db.select().from(products).where(eq(products.id, req.params.id));
  if (!p) throw new ApiError(404, 'Not found');
  const [[o], [d]] = await Promise.all([
    db.select({ x: orderItems.orderId }).from(orderItems).where(eq(orderItems.productId, p.id)).limit(1),
    db.select({ x: downloadHistory.id }).from(downloadHistory).where(eq(downloadHistory.productId, p.id)).limit(1)]);
  if (o || d) { await db.update(products).set({ isActive: false }).where(eq(products.id, p.id)); return ok(res, { hidden: true }, 'Has purchases, so it was hidden instead'); }
  await db.delete(products).where(eq(products.id, p.id));
  await removeFiles(p.pdfFileId, p.coverFileId, p.previewFileId);
  ok(res, { hidden: false }, 'Deleted');
});

export const createCategory = wrap(async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) throw new ApiError(422, 'Name is required');
  ok(res, (await db.insert(categories).values({ name: name.trim(), slug: name.toLowerCase().replace(/\W+/g, '-') }).returning())[0], 'Created', 201);
});
export const deleteCategory = wrap(async (req, res) => { await db.delete(categories).where(eq(categories.id, req.params.id)); ok(res, null, 'Deleted'); });

export const listOrders = wrap(async (_q, res) => ok(res, await db.select({
  id: orders.id, amount: orders.amount, status: orders.status, createdAt: orders.createdAt, phone: users.phone,
  items: sql`(select count(*)::int from ${orderItems} where ${orderItems.orderId} = ${orders.id})`,
}).from(orders).innerJoin(users, eq(users.id, orders.userId)).orderBy(desc(orders.createdAt)).limit(300)));
export const orderDetail = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(404, 'Order not found');
  const [o] = await db.select({ id: orders.id, amount: orders.amount, status: orders.status, txn: orders.merchantTransactionId, phonepeTxn: orders.phonepeTransactionId, createdAt: orders.createdAt, phone: users.phone, coupon: orders.couponCode, discount: orders.discount, refundTxn: orders.refundTxnId, refundedAmount: orders.refundedAmount })
    .from(orders).innerJoin(users, eq(users.id, orders.userId)).where(eq(orders.id, req.params.id));
  if (!o) throw new ApiError(404, 'Order not found');
  const items = await db.select({ id: products.id, title: products.title, price: sql`coalesce(${orderItems.price}, ${products.price})` }).from(orderItems).innerJoin(products, eq(products.id, orderItems.productId)).where(eq(orderItems.orderId, o.id));
  ok(res, { ...o, products: items, refunds: await db.select().from(refunds).where(eq(refunds.orderId, o.id)).orderBy(desc(refunds.createdAt)) });
});
// Admin-only. Refunds all or part of a paid order through PhonePe. The amount is reserved first (so a double click can't refund twice) and released if PhonePe says no.
// Download access ends only when the full amount has been refunded.
export const refundSchema = z.object({ amount: z.coerce.number().optional() });
export const refundOrder = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(404, 'Order not found');
  const [o] = await db.select().from(orders).where(eq(orders.id, req.params.id));
  if (!o) throw new ApiError(404, 'Order not found');
  if (o.status !== 'paid') throw new ApiError(409, 'Only paid orders can be refunded');
  const plan = refundAmount(o.amount, o.refundedAmount, req.body.amount);
  if (plan.error) throw new ApiError(409, plan.error);
  const [held] = await db.update(orders).set({ refundedAmount: sql`coalesce(${orders.refundedAmount}, 0) + ${plan.amt}` })
    .where(and(eq(orders.id, o.id), eq(orders.status, 'paid'), sql`coalesce(${orders.refundedAmount}, 0) + ${plan.amt} <= ${orders.amount}`)).returning();
  if (!held) throw new ApiError(409, 'This order changed. Reload and try again.');
  let txn;
  try { txn = await refundPayment(o, plan.amt); }
  catch (e) { await db.update(orders).set({ refundedAmount: sql`coalesce(${orders.refundedAmount}, 0) - ${plan.amt}` }).where(eq(orders.id, o.id)); throw e; }
  await db.insert(refunds).values({ orderId: o.id, amount: plan.amt, txnId: txn });
  const full = held.refundedAmount >= o.amount;
  const [u] = await db.update(orders).set({ refundTxnId: txn, refundedAt: new Date(), ...(full && { status: 'refunded' }) }).where(eq(orders.id, o.id)).returning();
  ok(res, u, full ? 'Full refund requested with PhonePe' : `Partial refund of ₹${plan.amt} requested with PhonePe`);
});
export const setOrderStatus = wrap(async (req, res) => {
  if (!isId(req.params.id) || !['pending', 'paid', 'failed'].includes(req.body.status)) throw new ApiError(422, 'Invalid order or status');
  ok(res, (await db.update(orders).set({ status: req.body.status }).where(eq(orders.id, req.params.id)).returning())[0]);
});

export const listUsers = wrap(async (_q, res) => ok(res, await db.select({
  id: users.id, phone: users.phone, isBlocked: users.isBlocked, createdAt: users.createdAt,
  paidOrders: sql`(select count(*)::int from ${orders} where ${orders.userId} = ${users.id} and ${orders.status} = 'paid')`,
  spent: sql`(select coalesce(sum(${orders.amount}),0)::int from ${orders} where ${orders.userId} = ${users.id} and ${orders.status} = 'paid')`,
}).from(users).where(eq(users.role, 'student')).orderBy(desc(users.createdAt))));
export const setUserBlocked = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(404, 'Not found');
  const [u] = await db.update(users).set({ isBlocked: bool(req.body.isBlocked) }).where(and(eq(users.id, req.params.id), eq(users.role, 'student'))).returning({ id: users.id, isBlocked: users.isBlocked });
  if (!u) throw new ApiError(404, 'Student not found');
  ok(res, u, u.isBlocked ? 'Student blocked' : 'Student unblocked');
});

export const stats = wrap(async (_q, res) => {
  const [[s], [p], [u], [d]] = await Promise.all([
    db.select({ revenue: sql`coalesce(sum(amount - coalesce(refunded_amount, 0)),0)::int`, orders: sql`count(*)::int` }).from(orders).where(eq(orders.status, 'paid')),
    db.select({ n: sql`count(*)::int` }).from(products),
    db.select({ n: sql`count(*)::int` }).from(users).where(eq(users.role, 'student')),
    db.select({ n: sql`coalesce(sum(download_count),0)::int` }).from(products)]);
  ok(res, { ...s, products: p.n, users: u.n, downloads: d.n });
});
