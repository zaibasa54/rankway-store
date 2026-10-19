import axios from 'axios';
import { ApiError } from '../utils/respond.js';
import { orderSmsText } from '../utils/messages.js';
// Pick a provider with SMS_PROVIDER in backend/.env: mock | twilio | msg91 | fast2sms. Credentials are read from env.
// "mock" sends nothing (use with DEMO_MODE=true, which shows the OTP on screen). Test each provider once with your own account before launch.
const digits = (p) => p.replace(/\D/g, '');
export async function sendSms(phone, text, otp) {
  const provider = process.env.SMS_PROVIDER || 'mock';
  try {
    if (provider === 'twilio') {
      await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM, Body: text }), { auth: { username: process.env.TWILIO_ACCOUNT_SID, password: process.env.TWILIO_AUTH_TOKEN } });
    } else if (provider === 'msg91') { // MSG91 OTP API (needs an approved OTP template; its variable must be ##OTP##)
      await axios.post('https://control.msg91.com/api/v5/otp', null, { params: { template_id: process.env.MSG91_TEMPLATE_ID, mobile: digits(phone), authkey: process.env.MSG91_AUTH_KEY, otp } });
    } else if (provider === 'fast2sms') { // Fast2SMS "otp" route (Indian numbers)
      await axios.get('https://www.fast2sms.com/dev/bulkV2', { params: { authorization: process.env.FAST2SMS_KEY, route: 'otp', variables_values: otp, numbers: digits(phone).slice(-10) } });
    }
  } catch (e) {
    process.stderr.write(`SMS error (${provider}): ${e.response?.data ? JSON.stringify(e.response.data) : e.message}\n`);
    throw new ApiError(502, 'Could not send the OTP. Please try again in a moment.');
  }
}

// Order confirmation after a successful payment. Off unless SMS_ORDER_CONFIRMATION=true. NEVER throws: a failed SMS must not affect the order.
// Twilio sends free text. MSG91 / Fast2SMS in India need a DLT-approved template, so set the template variables below (see docs/03).
export async function notifyOrderPaid(phone, { amount }) {
  if (process.env.SMS_ORDER_CONFIRMATION !== 'true') return;
  const provider = process.env.SMS_PROVIDER || 'mock';
  const link = `${(process.env.SITE_URL || process.env.CLIENT_URL || '').replace(/\/$/, '')}/account/downloads`;
  try {
    if (provider === 'twilio') {
      await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM, Body: orderSmsText(amount, link) }), { auth: { username: process.env.TWILIO_ACCOUNT_SID, password: process.env.TWILIO_AUTH_TOKEN } });
    } else if (provider === 'msg91' && process.env.MSG91_ORDER_TEMPLATE_ID) { // template variables are named in MSG91_ORDER_VARS, in order: amount, link
      const [k1, k2] = (process.env.MSG91_ORDER_VARS || 'amount,link').split(',').map((x) => x.trim());
      await axios.post('https://control.msg91.com/api/v5/flow', { template_id: process.env.MSG91_ORDER_TEMPLATE_ID, short_url: '0', recipients: [{ mobiles: digits(phone), [k1]: String(amount), [k2]: link }] },
        { headers: { authkey: process.env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' } });
    } else if (provider === 'fast2sms' && process.env.FAST2SMS_DLT_MESSAGE_ID) { // DLT route: values are filled into the approved template in order: amount|link
      await axios.get('https://www.fast2sms.com/dev/bulkV2', { params: { authorization: process.env.FAST2SMS_KEY, route: 'dlt', sender_id: process.env.FAST2SMS_SENDER_ID, message: process.env.FAST2SMS_DLT_MESSAGE_ID, variables_values: `${amount}|${link}`, numbers: digits(phone).slice(-10) } });
    }
  } catch (e) { process.stderr.write(`Order SMS error (${provider}): ${e.response?.data ? JSON.stringify(e.response.data) : e.message}\n`); }
}
