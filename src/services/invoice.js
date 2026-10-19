import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, orders, orderItems, products, users } from '../db/index.js';
import { getSettings } from './site.js';
import { splitGst, gstBreakup } from '../utils/pricing.js';

// Gives a paid order the next invoice number (sequential, never reused). The unique index guards against two orders racing.
export async function ensureInvoiceNo(order) {
  if (order.invoiceNo || order.status !== 'paid') return order;
  for (let i = 0; i < 3; i++) {
    try {
      const [o] = await db.update(orders).set({ invoiceNo: sql`(select coalesce(max(${orders.invoiceNo}), 0) + 1 from ${orders})` })
        .where(and(eq(orders.id, order.id), isNull(orders.invoiceNo))).returning();
      return o || order;
    } catch (e) { if ((e.code ?? e.cause?.code) !== '23505') throw e; }
  }
  return order;
}
// Everything the invoice page needs. Product prices are GST-inclusive: taxable value = total / (1 + rate).
export async function buildInvoice(order) {
  const o = await ensureInvoiceNo(order);
  const [[u], items, s] = await Promise.all([
    db.select({ phone: users.phone }).from(users).where(eq(users.id, o.userId)),
    db.select({ id: products.id, title: products.title, price: sql`coalesce(${orderItems.price}, ${products.price})` }).from(orderItems).innerJoin(products, eq(products.id, orderItems.productId)).where(and(eq(orderItems.orderId, o.id), sql`coalesce(${orderItems.price}, ${products.price}) > 0`)), // bundle members (price 0) are not separate lines
    getSettings()]);
  const b = s.business, rate = +b.gstRate || 0, { taxable, gst } = splitGst(o.amount, rate);
  return {
    id: o.id, status: o.status, date: o.createdAt, phone: u?.phone, items, discount: o.discount || 0, coupon: o.couponCode, subtotal: o.amount + (o.discount || 0), total: o.amount, refunded: o.refundedAmount || 0,
    number: o.invoiceNo ? `${b.invoicePrefix || 'INV'}-${new Date(o.createdAt).getFullYear()}-${String(o.invoiceNo).padStart(5, '0')}` : null,
    rate, taxable, gst, buyerState: o.billingState, breakup: gstBreakup(gst, b.state, o.billingState), taxInvoice: !!b.gstin, txn: o.merchantTransactionId, business: b, brandName: s.brand.name,
  };
}
