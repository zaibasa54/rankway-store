import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, users, otps } from '../db/index.js';
import { sendSms } from '../services/sms.js';
import { ok, ApiError, wrap } from '../utils/respond.js';

export const phoneSchema = z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +919876543210') });
export const verifySchema = phoneSchema.extend({ otp: z.string().length(6) });
const hash = (phone, otp) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(phone + otp).digest('hex');

export const sendOtp = wrap(async (req, res) => {
  const { phone } = req.body;
  const otp = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + (+process.env.OTP_TTL_MIN || 5) * 60000);
  await db.insert(otps).values({ phone, hash: hash(phone, otp), expiresAt }).onConflictDoUpdate({ target: otps.phone, set: { hash: hash(phone, otp), expiresAt, attempts: 0 } });
  await sendSms(phone, `Your login code is ${otp}. Valid for ${process.env.OTP_TTL_MIN || 5} minutes.`, otp);
  ok(res, process.env.DEMO_MODE === 'true' ? { demoOtp: otp } : null, 'OTP sent');
});

export const verifyOtp = wrap(async (req, res) => {
  const { phone, otp } = req.body;
  const [rec] = await db.select().from(otps).where(eq(otps.phone, phone));
  if (!rec || rec.expiresAt < new Date()) throw new ApiError(400, 'OTP expired. Request a new one');
  if (rec.attempts >= 5) throw new ApiError(429, 'Too many attempts');
  if (rec.hash !== hash(phone, otp)) {
    await db.update(otps).set({ attempts: rec.attempts + 1 }).where(eq(otps.phone, phone));
    throw new ApiError(400, 'Incorrect OTP');
  }
  await db.delete(otps).where(eq(otps.phone, phone));
  const [user] = await db.insert(users).values({ phone, isVerified: true }).onConflictDoUpdate({ target: users.phone, set: { isVerified: true } }).returning();
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
  ok(res, { token, user }, 'Logged in');
});
export const me = (req, res) => ok(res, req.user);
export const logout = (_req, res) => ok(res, null, 'Logged out'); // stateless JWT: client discards token
