import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, coupons } from '../db/index.js';
import { isId } from '../utils/validate.js';
import { ok, ApiError, wrap } from '../utils/respond.js';

const n = (min = 0) => z.coerce.number().int().min(min);
export const couponSchema = z.object({
  code: z.string().trim().min(3, 'Code needs 3+ characters').max(30).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, - and _ only'),
  type: z.enum(['percent', 'flat']), value: n(1), minAmount: n(0).optional(), maxDiscount: n(1).nullable().optional(), maxUses: n(1).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(), isActive: z.boolean().optional(),
}).refine((d) => d.type !== 'percent' || d.value <= 90, { message: 'Percent discount must be 90 or less', path: ['value'] });
const row = (b) => ({ ...b, code: b.code.toUpperCase(), expiresAt: b.expiresAt ? new Date(b.expiresAt) : null, minAmount: b.minAmount || 0, maxDiscount: b.maxDiscount ?? null, maxUses: b.maxUses ?? null });

export const list = wrap(async (_q, res) => ok(res, await db.select().from(coupons).orderBy(desc(coupons.createdAt))));
export const create = wrap(async (req, res) => ok(res, (await db.insert(coupons).values(row(req.body)).returning())[0], 'Coupon created', 201));
export const update = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(404, 'Coupon not found');
  const [c] = await db.update(coupons).set(row(req.body)).where(eq(coupons.id, req.params.id)).returning();
  if (!c) throw new ApiError(404, 'Coupon not found');
  ok(res, c, 'Coupon updated');
});
export const remove = wrap(async (req, res) => { if (isId(req.params.id)) await db.delete(coupons).where(eq(coupons.id, req.params.id)); ok(res, null, 'Coupon deleted'); });
