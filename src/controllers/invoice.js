import { and, eq } from 'drizzle-orm';
import { db, orders } from '../db/index.js';
import { buildInvoice } from '../services/invoice.js';
import { isId } from '../utils/validate.js';
import { ok, ApiError, wrap } from '../utils/respond.js';
const find = async (id, userId) => {
  if (!isId(id)) throw new ApiError(404, 'Invoice not found');
  const [o] = await db.select().from(orders).where(userId ? and(eq(orders.id, id), eq(orders.userId, userId)) : eq(orders.id, id));
  if (!o) throw new ApiError(404, 'Invoice not found');
  return o;
};
export const mine = wrap(async (req, res) => {
  const o = await find(req.params.id, req.user.id);
  if (o.status !== 'paid') throw new ApiError(403, 'Invoice is available after payment');
  ok(res, await buildInvoice(o));
});
export const admin = wrap(async (req, res) => ok(res, await buildInvoice(await find(req.params.id))));
