import crypto from 'crypto';
import axios from 'axios';
import { ApiError } from '../utils/respond.js';
// Env: PHONEPE_MERCHANT_ID, PHONEPE_SALT_KEY, PHONEPE_SALT_INDEX. PHONEPE_ENV toggles sandbox/production.
const base = () => process.env.PHONEPE_ENV === 'production'
  ? 'https://api.phonepe.com/apis/hermes' : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
const sign = (b64, path) =>
  crypto.createHash('sha256').update(b64 + path + process.env.PHONEPE_SALT_KEY).digest('hex') + '###' + process.env.PHONEPE_SALT_INDEX;
// Turn a PhonePe/axios failure into a readable API error (shown in the toast and the server log).
const fail = (e) => { const d = e.response?.data; throw new ApiError(502, `PhonePe: ${d?.message || d?.code || e.message}`); };

export async function initiatePayment({ order, user }) {
  const api = process.env.API_URL || 'http://localhost:5000';
  const body = {
    merchantId: process.env.PHONEPE_MERCHANT_ID, merchantTransactionId: order.merchantTransactionId,
    merchantUserId: String(user.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 36), // PhonePe accepts alphanumeric only (no hyphens)
    amount: Math.round(order.amount * 100), // paise
    redirectUrl: `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/status?txn=${order.merchantTransactionId}`,
    redirectMode: 'REDIRECT', callbackUrl: `${api}/api/orders/phonepe-callback`,
    paymentInstrument: { type: 'PAY_PAGE' },
  };
  const b64 = Buffer.from(JSON.stringify(body)).toString('base64');
  try {
    const { data } = await axios.post(`${base()}/pg/v1/pay`, { request: b64 }, { headers: { 'X-VERIFY': sign(b64, '/pg/v1/pay'), 'Content-Type': 'application/json' } });
    return data.data.instrumentResponse.redirectInfo.url;
  } catch (e) { fail(e); }
}
// Full refund of a paid order. PhonePe processes it asynchronously; the money returns to the buyer's payment source.
export async function refundPayment(order, amount = order.amount) {
  const body = {
    merchantId: process.env.PHONEPE_MERCHANT_ID, merchantUserId: String(order.userId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 36), originalTransactionId: order.merchantTransactionId,
    merchantTransactionId: 'RF' + crypto.randomBytes(8).toString('hex'), amount: Math.round(amount * 100), callbackUrl: `${process.env.API_URL || 'http://localhost:5000'}/api/orders/phonepe-callback`,
  };
  const b64 = Buffer.from(JSON.stringify(body)).toString('base64');
  try {
    const { data } = await axios.post(`${base()}/pg/v1/refund`, { request: b64 }, { headers: { 'X-VERIFY': sign(b64, '/pg/v1/refund'), 'Content-Type': 'application/json' } });
    if (data.success === false) throw new ApiError(502, `PhonePe: ${data.message || data.code}`);
    return body.merchantTransactionId;
  } catch (e) { if (e instanceof ApiError) throw e; fail(e); }
}
export async function checkStatus(txn) {
  const path = `/pg/v1/status/${process.env.PHONEPE_MERCHANT_ID}/${txn}`;
  try {
    const { data } = await axios.get(base() + path, { headers: { 'X-VERIFY': sign('', path), 'X-MERCHANT-ID': process.env.PHONEPE_MERCHANT_ID } });
    return data; // data.code === 'PAYMENT_SUCCESS' => paid
  } catch (e) { fail(e); }
}
