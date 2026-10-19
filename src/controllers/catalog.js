import { and, eq, ilike, gte, lte, desc, sql, ne } from 'drizzle-orm';
import { isId } from '../utils/validate.js';
import { db, products, categories, files, bundleItems, orders, orderItems } from '../db/index.js';
import { pub } from '../utils/product.js';
import { ok, ApiError, wrap } from '../utils/respond.js';

export const list = wrap(async (req, res) => {
  const { q, category, free, min, max, page = 1, limit = 12 } = req.query;
  const c = [eq(products.isActive, true)];
  if (q) c.push(ilike(products.title, `%${q}%`));
  if (category) c.push(eq(products.categoryId, category));
  if (free === 'true') c.push(eq(products.isFree, true));
  if (min) c.push(gte(products.price, +min));
  if (max) c.push(lte(products.price, +max));
  const where = and(...c);
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(products).where(where).orderBy(desc(products.createdAt)).limit(+limit).offset((page - 1) * limit),
    db.select({ n: sql`count(*)::int` }).from(products).where(where)]);
  ok(res, { items: rows.map(pub), total: n, pages: Math.ceil(n / limit) });
});
export const one = wrap(async (req, res) => {
  const [p] = await db.select().from(products).where(eq(products.id, req.params.id));
  if (!p) throw new ApiError(404, 'Not found');
  const out = pub(p);
  if (p.type === 'bundle') out.includes = (await db.select({ p: products }).from(bundleItems).innerJoin(products, eq(products.id, bundleItems.productId)).where(eq(bundleItems.bundleId, p.id))).map((r) => pub(r.p));
  ok(res, out);
});
// "Students also bought": products that appear most often in paid orders that also contain this product.
export const alsoBought = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(404, 'Not found');
  const rows = await db.select({ p: products }).from(orderItems)
    .innerJoin(orders, and(eq(orders.id, orderItems.orderId), eq(orders.status, 'paid')))
    .innerJoin(products, eq(products.id, orderItems.productId))
    .where(and(ne(orderItems.productId, req.params.id), eq(products.isActive, true), sql`${orderItems.orderId} in (select order_id from order_items where product_id = ${req.params.id})`))
    .groupBy(products.id).orderBy(desc(sql`count(*)`)).limit(8);
  ok(res, rows.map((r) => pub(r.p)));
});
export const categoryList = wrap(async (_q, res) => ok(res, await db.select().from(categories)));
// Cover images are public; PDFs are never served from here.
export const cover = wrap(async (req, res) => {
  const [f] = await db.select().from(files).where(and(eq(files.id, req.params.id), eq(files.kind, 'cover')));
  if (!f) throw new ApiError(404, 'Not found');
  res.set({ 'Content-Type': f.mime, 'Cache-Control': 'public, max-age=31536000, immutable' }).send(f.data);
});
