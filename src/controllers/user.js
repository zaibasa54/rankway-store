import { eq, and, ne } from 'drizzle-orm';
import { db, orders, orderItems, products, wishlistItems } from '../db/index.js';
import { pub } from '../utils/product.js';
import { ok, wrap } from '../utils/respond.js';

export const myOrders = wrap(async (req, res) => {
  const rows = await db.select({ o: orders, p: products }).from(orders).leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .leftJoin(products, eq(products.id, orderItems.productId)).where(eq(orders.userId, req.user.id));
  const m = new Map();
  rows.forEach(({ o, p }) => { if (!m.has(o.id)) m.set(o.id, { ...o, products: [] }); if (p) m.get(o.id).products.push(pub(p)); });
  ok(res, [...m.values()].sort((a, b) => b.createdAt - a.createdAt));
});
export const myDownloads = wrap(async (req, res) => {
  const rows = await db.selectDistinct({ p: products }).from(orders).innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(products.id, orderItems.productId)).where(and(eq(orders.userId, req.user.id), eq(orders.status, 'paid'), ne(products.type, 'bundle')));
  ok(res, rows.map((r) => pub(r.p)));
});
export const wishlist = wrap(async (req, res) => ok(res,
  (await db.select({ p: products }).from(wishlistItems).innerJoin(products, eq(products.id, wishlistItems.productId)).where(eq(wishlistItems.userId, req.user.id))).map((r) => pub(r.p))));
export const toggleWish = wrap(async (req, res) => {
  const k = and(eq(wishlistItems.userId, req.user.id), eq(wishlistItems.productId, req.params.id));
  const [has] = await db.select().from(wishlistItems).where(k);
  if (has) await db.delete(wishlistItems).where(k); else await db.insert(wishlistItems).values({ userId: req.user.id, productId: req.params.id });
  ok(res, { wished: !has }, has ? 'Removed' : 'Added');
});
