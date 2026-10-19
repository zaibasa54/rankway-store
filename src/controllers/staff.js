import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, users } from '../db/index.js';
import { PERMS } from '../middleware/permissions.js';
import { isId } from '../utils/validate.js';
import { ok, ApiError, wrap } from '../utils/respond.js';

export const staffSchema = z.object({
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +919876543210').optional(),
  permissions: z.array(z.enum(PERMS)).max(PERMS.length),
});
const cols = { id: users.id, phone: users.phone, role: users.role, permissions: users.permissions, createdAt: users.createdAt };
export const list = wrap(async (_q, res) => ok(res, await db.select(cols).from(users).where(inArray(users.role, ['admin', 'staff'])).orderBy(desc(users.createdAt))));
export const create = wrap(async (req, res) => {
  const { phone, permissions } = req.body;
  if (!phone) throw new ApiError(422, 'Phone number is required');
  const [ex] = await db.select().from(users).where(eq(users.phone, phone));
  if (ex?.role === 'admin') throw new ApiError(409, 'That number is already the admin');
  const [u] = ex ? await db.update(users).set({ role: 'staff', permissions }).where(eq(users.id, ex.id)).returning(cols)
    : await db.insert(users).values({ phone, role: 'staff', permissions, isVerified: true }).returning(cols);
  ok(res, u, 'Staff member added. They log in with their phone number.', 201); // staff sign in with the normal OTP login
});
export const update = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(404, 'Not found');
  const [u] = await db.update(users).set({ permissions: req.body.permissions }).where(and(eq(users.id, req.params.id), eq(users.role, 'staff'))).returning(cols);
  if (!u) throw new ApiError(404, 'Staff member not found');
  ok(res, u, 'Permissions updated');
});
export const remove = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(404, 'Not found');
  await db.update(users).set({ role: 'student', permissions: [] }).where(and(eq(users.id, req.params.id), eq(users.role, 'staff')));
  ok(res, null, 'Staff access removed');
});
