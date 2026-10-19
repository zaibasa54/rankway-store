import crypto from 'crypto';
import { z } from 'zod';
import { eq, and, or, isNotNull, inArray, sql } from 'drizzle-orm';
import { db, orders, orderItems, products, coupons, bundleItems, users } from '../db/index.js';
import { orderRows } from '../utils/bundles.js';
import { INDIAN_STATES } from '../utils/states.js';
import { applyCoupon } from '../services/coupons.js';
import { ensureInvoiceNo } from '../services/invoice.js';
import { notifyOrderPaid } from '../services/sms.js';
import { initiatePayment, checkStatus } from '../services/phonepe.js';
import { ok, ApiError, wrap } from '../utils/respond.js';

export const createSchema = z.object({ productIds: z.array(z.string().uuid()).min(1), couponCode: z.string().max(40).optional(), billingState: z.enum(INDIAN_STATES).optional() });
export const quoteSchema = z.object({ productIds: z.array(z.string().uuid()).min(1), code: z.string().trim().min(1).max(40) });
// Only products that can actually be delivered are sellable: a normal product needs its PDF, a bundle needs none.
const cartItems = (ids) => db.select().from(products).where(and(inArray(products.id, ids), eq(products.isActive, true), or(eq(products.type, 'bundle'), isNotNull(products.pdfFileId))));

export const createOrder = wrap(async (req, res) => {
  const items = await cartItems(req.body.productIds);
  if (!items.length) throw new ApiError(404, 'Products not found');
  if (items.length !== new Set(req.body.productIds).size) throw new ApiError(409, 'Some items in your cart are no longer available. Please review your cart.');
  const subtotal = items.reduce((t, p) => t + (p.price || 0), 0); // price ALWAYS computed server-side
  if (subtotal <= 0) throw new ApiError(400, 'This product is not available for purchase'); // everything is paid
  let discount = 0, couponCode = null;
  if (req.body.couponCode?.trim()) { const q = await applyCoupon(req.body.couponCode, subtotal, req.user.id); discount = q.discount; couponCode = q.code; }
  const amount = subtotal - discount;
  const [order] = await db.insert(orders).values({
    userId: req.user.id, amount, discount, couponCode, billingState: req.body.billingState || null, merchantTransactionId: 'MT' + crypto.randomBytes(8).toString('hex'), status: 'pending',
  }).returning();
  const bundles = items.filter((p) => p.type === 'bundle');
  const members = bundles.length ? await db.select().from(bundleItems).where(inArray(bundleItems.bundleId, bundles.map((b) => b.id))) : [];
  await db.insert(orderItems).values(orderRows(items, members).map((r) => ({ orderId: order.id, ...r })));
  try {
    ok(res, { order, paymentUrl: await initiatePayment({ order, user: req.user }) }, 'Order created', 201);
  } catch (e) { // don't leave a dangling pending order if PhonePe rejected the request
    await db.update(orders).set({ status: 'failed' }).where(eq(orders.id, order.id));
    throw e;
  }
});

// Ask PhonePe for the real status (never trust the browser redirect alone) and update the order.
async function settle(order) {
  if (order.status !== 'pending') return order;
  const r = await checkStatus(order.merchantTransactionId);
  const status = r.code === 'PAYMENT_SUCCESS' ? 'paid' : r.code === 'PAYMENT_PENDING' ? 'pending' : 'failed';
  if (status === 'pending') return order; // still waiting for the bank
  // Only the request that flips pending -> paid/failed runs the follow-ups (coupon count, invoice, SMS), even if the
  // PhonePe callback and the browser redirect arrive at the same moment.
  const [o] = await db.update(orders).set({ status, phonepeTransactionId: r.data?.transactionId }).where(and(eq(orders.id, order.id), eq(orders.status, 'pending'))).returning();
  if (!o) return (await db.select().from(orders).where(eq(orders.id, order.id)))[0];
  if (status === 'paid' && o.couponCode) await db.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.code, o.couponCode)); // count a use only when paid
  if (status === 'paid') {
    await ensureInvoiceNo(o);
    db.select({ phone: users.phone }).from(users).where(eq(users.id, o.userId)).then(([u]) => u && notifyOrderPaid(u.phone, o)).catch(() => {}); // fire and forget
  }
  return o;
}
export const quote = wrap(async (req, res) => {
  const items = await cartItems(req.body.productIds);
  const subtotal = items.reduce((t, p) => t + (p.price || 0), 0);
  ok(res, { ...(await applyCoupon(req.body.code, subtotal, req.user.id)), subtotal });
});
export const verifyPayment = wrap(async (req, res) => {
  const [order] = await db.select().from(orders).where(and(eq(orders.merchantTransactionId, req.params.txn), eq(orders.userId, req.user.id)));
  if (!order) throw new ApiError(404, 'Order not found');
  ok(res, await settle(order));
});
// Server-to-server callback from PhonePe (works even if the student closes the browser).
export const callback = wrap(async (req, res) => {
  const b64 = req.body?.response || '';
  const sig = crypto.createHash('sha256').update(b64 + process.env.PHONEPE_SALT_KEY).digest('hex') + '###' + process.env.PHONEPE_SALT_INDEX;
  if (sig !== req.headers['x-verify']) throw new ApiError(401, 'Invalid signature');
  const txn = JSON.parse(Buffer.from(b64, 'base64').toString() || '{}').data?.merchantTransactionId;
  const [order] = txn ? await db.select().from(orders).where(eq(orders.merchantTransactionId, txn)) : [];
  if (order) await settle(order);
  res.sendStatus(200);
});
