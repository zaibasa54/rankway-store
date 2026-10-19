import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db, users } from '../db/index.js';
import { ApiError, wrap } from '../utils/respond.js';

export const isAuthenticated = wrap(async (req, _res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) throw new ApiError(401, 'Login required');
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch { throw new ApiError(401, 'Session expired'); }
  [req.user] = await db.select().from(users).where(eq(users.id, payload.id));
  if (!req.user || req.user.isBlocked) throw new ApiError(401, 'Account unavailable');
  next();
});
export const isAdmin = (req, _res, next) =>
  req.user?.role === 'admin' ? next() : next(new ApiError(403, 'Admin access only'));
export const validate = (schema) => (req, _res, next) => { req.body = schema.parse(req.body); next(); };
