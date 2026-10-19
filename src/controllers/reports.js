import { and, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { db, orders, orderItems, products, users } from '../db/index.js';
import { ApiError, ok, wrap } from '../utils/respond.js';
import { csvCell } from '../utils/csv.js';

function range(q) {
  const to = q.to ? new Date(`${q.to}T23:59:59.999`) : new Date();
  const from = q.from ? new Date(`${q.from}T00:00:00`) : new Date(to.getTime() - 29 * 864e5);
  if (isNaN(from) || isNaN(to) || from > to) throw new ApiError(422, 'Invalid date range');
  if (to - from > 367 * 864e5) throw new ApiError(422, 'Choose a range of up to 1 year');
  return { from, to };
}
const paidIn = (from, to) => and(eq(orders.status, 'paid'), gte(orders.createdAt, from), lte(orders.createdAt, to));

export const summary = wrap(async (req, res) => {
  const { from, to } = range(req.query), w = paidIn(from, to);
  const day = sql`to_char(date_trunc('day', ${orders.createdAt}), 'YYYY-MM-DD')`;
  const itemRevenue = sql`coalesce(sum(coalesce(${orderItems.price}, ${products.price})), 0)::int`;
  const [[t], daily, top, cps] = await Promise.all([
    db.select({ revenue: sql`coalesce(sum(${orders.amount} - coalesce(${orders.refundedAmount}, 0)), 0)::int`, orders: sql`count(*)::int`, discounts: sql`coalesce(sum(${orders.discount}), 0)::int`, buyers: sql`count(distinct ${orders.userId})::int` }).from(orders).where(w),
    db.select({ day, revenue: sql`sum(${orders.amount} - coalesce(${orders.refundedAmount}, 0))::int`, orders: sql`count(*)::int` }).from(orders).where(w).groupBy(day).orderBy(day),
    db.select({ id: products.id, title: products.title, units: sql`count(*)::int`, revenue: itemRevenue }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).innerJoin(products, eq(products.id, orderItems.productId)).where(and(w, sql`coalesce(${orderItems.price}, ${products.price}) > 0`)).groupBy(products.id, products.title).orderBy(desc(itemRevenue)).limit(10),
    db.select({ code: orders.couponCode, uses: sql`count(*)::int`, discount: sql`sum(${orders.discount})::int` }).from(orders).where(and(w, isNotNull(orders.couponCode))).groupBy(orders.couponCode).orderBy(desc(sql`count(*)`)),
  ]);
  ok(res, { totals: { ...t, avg: t.orders ? Math.round(t.revenue / t.orders) : 0 }, daily, top, coupons: cps });
});

const cell = csvCell;
export const exportCsv = wrap(async (req, res) => {
  const { from, to } = range(req.query);
  const rows = await db.select({
    invoiceNo: orders.invoiceNo, date: orders.createdAt, phone: users.phone, discount: orders.discount, coupon: orders.couponCode, amount: orders.amount, refunded: orders.refundedAmount, status: orders.status, txn: orders.merchantTransactionId, pay: orders.phonepeTransactionId,
    items: sql`coalesce((select string_agg(${products.title}, ' | ') from ${orderItems} join ${products} on ${products.id} = ${orderItems.productId} where ${orderItems.orderId} = ${orders.id}), '')`,
  }).from(orders).innerJoin(users, eq(users.id, orders.userId)).where(and(gte(orders.createdAt, from), lte(orders.createdAt, to))).orderBy(desc(orders.createdAt));
  const head = ['Invoice no', 'Date', 'Phone', 'Items', 'Discount (Rs)', 'Coupon', 'Total (Rs)', 'Refunded (Rs)', 'Status', 'Transaction', 'PhonePe ID'];
  const lines = rows.map((r) => [r.invoiceNo, new Date(r.date).toISOString(), r.phone, r.items, r.discount, r.coupon, r.amount, r.refunded, r.status, r.txn, r.pay].map(cell).join(','));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="orders_${req.query.from || 'last30'}_${req.query.to || 'today'}.csv"` })
    .send('\uFEFF' + [head.join(','), ...lines].join('\r\n')); // BOM so Excel reads UTF-8
});
