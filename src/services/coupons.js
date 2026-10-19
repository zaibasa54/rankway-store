import { and, eq } from 'drizzle-orm';
import { db, coupons, orders } from '../db/index.js';
import { ApiError } from '../utils/respond.js';
import { calcDiscount } from '../utils/pricing.js';
// Validates a coupon for this student + cart and returns the discount. Always recomputed on the server.
export async function applyCoupon(rawCode, subtotal, userId) {
  const code = String(rawCode || '').trim().toUpperCase();
  const [c] = await db.select().from(coupons).where(eq(coupons.code, code));
  if (!c || !c.isActive) throw new ApiError(400, 'Invalid coupon code');
  if (c.expiresAt && c.expiresAt < new Date()) throw new ApiError(400, 'This coupon has expired');
  if (c.maxUses != null && c.usedCount >= c.maxUses) throw new ApiError(400, 'This coupon has been fully redeemed');
  if (subtotal < (c.minAmount || 0)) throw new ApiError(400, `Add items worth ₹${c.minAmount} or more to use this coupon`);
  const [used] = await db.select({ x: orders.id }).from(orders).where(and(eq(orders.userId, userId), eq(orders.couponCode, c.code), eq(orders.status, 'paid'))).limit(1);
  if (used) throw new ApiError(400, 'You have already used this coupon');
  const d = calcDiscount(c, subtotal);
  return { code: c.code, discount: d, total: subtotal - d };
}
