import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, reviews, users, orders, orderItems, products } from '../db/index.js';
import { ok, ApiError, wrap } from '../utils/respond.js';

export const reviewSchema = z.object({ rating: z.coerce.number().int().min(1, 'Pick 1 to 5 stars').max(5), comment: z.string().max(1000).optional() });
const isId = (s) => /^[0-9a-f-]{36}$/i.test(s);

async function recalc(productId) { // keep the product's rating summary in sync
  const [a] = await db.select({ avg: sql`coalesce(avg(rating),0)::float`, n: sql`count(*)::int` }).from(reviews).where(eq(reviews.productId, productId));
  const ratingAvg = Math.round(a.avg * 10) / 10;
  await db.update(products).set({ ratingAvg, ratingCount: a.n }).where(eq(products.id, productId));
  return { ratingAvg, ratingCount: a.n };
}
export const list = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(404, 'Not found');
  const rows = await db.select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt, phone: users.phone })
    .from(reviews).innerJoin(users, eq(users.id, reviews.userId)).where(eq(reviews.productId, req.params.id)).orderBy(desc(reviews.createdAt)).limit(50);
  ok(res, { items: rows.map(({ phone, ...r }) => ({ ...r, author: `••••${phone.slice(-4)}` })) }); // phone numbers stay private
});
export const save = wrap(async (req, res) => {
  const pid = req.params.id;
  if (!isId(pid)) throw new ApiError(404, 'Not found');
  const [own] = await db.select({ x: orders.id }).from(orders).innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.userId, req.user.id), eq(orders.status, 'paid'), eq(orderItems.productId, pid))).limit(1);
  if (!own) throw new ApiError(403, 'Only students who bought this product can review it');
  const { rating, comment } = req.body;
  const [old] = await db.select().from(reviews).where(and(eq(reviews.userId, req.user.id), eq(reviews.productId, pid)));
  if (old) await db.update(reviews).set({ rating, comment: comment || null }).where(eq(reviews.id, old.id));
  else await db.insert(reviews).values({ userId: req.user.id, productId: pid, rating, comment: comment || null });
  ok(res, await recalc(pid), old ? 'Review updated' : 'Thanks for your review!', old ? 200 : 201);
});
export const adminRemove = wrap(async (req, res) => {
  const [r] = await db.delete(reviews).where(eq(reviews.id, req.params.id)).returning();
  if (r) await recalc(r.productId);
  ok(res, null, 'Review removed');
});
export const adminList = wrap(async (_q, res) => ok(res, await db.select({
  id: reviews.id, rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt, product: products.title, phone: users.phone,
}).from(reviews).innerJoin(products, eq(products.id, reviews.productId)).innerJoin(users, eq(users.id, reviews.userId)).orderBy(desc(reviews.createdAt)).limit(300)));
