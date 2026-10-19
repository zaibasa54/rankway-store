// Quick installation check against a RUNNING API:  npm run smoke
// Needs DEMO_MODE=true to log in as admin automatically (otherwise only the public checks run).
try { await import('dotenv/config'); } catch { /* optional: reads backend/.env when dotenv is installed */ }
const API = process.env.SMOKE_API || `http://localhost:${process.env.PORT || 5000}`;
const phone = process.env.ADMIN_PHONE || '+919999999999';
let failed = 0;
const say = (s) => process.stdout.write(s + '\n');
const check = (name, pass, note = '') => { if (!pass) failed++; say(`${pass ? ' OK ' : 'FAIL'}  ${name}${note ? '  - ' + note : ''}`); };
const call = async (path, { token, method = 'GET', body } = {}) => {
  try {
    const r = await fetch(API + path, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body) });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, json, text };
  } catch (e) { return { status: 0, json: null, text: String(e.message) }; }
};
say(`Smoke test against ${API}\n`);
const h = await call('/api/health'); check('API is up (/api/health)', h.status === 200, h.status ? '' : 'cannot reach the API. Is "npm run dev" running?');
if (!h.status) process.exit(1);
check('Site settings load', (await call('/api/site')).json?.data?.brand?.name);
check('Categories load', Array.isArray((await call('/api/categories')).json?.data));
check('Products load', Array.isArray((await call('/api/products')).json?.data?.items));
check('Blog loads', Array.isArray((await call('/api/blog')).json?.data?.items));
check('Sitemap is served', (await call('/sitemap.xml')).text.includes('<urlset'));
check('Admin routes reject visitors', (await call('/api/admin/stats')).status === 401);
const otp = await call('/api/auth/send-otp', { method: 'POST', body: { phone } });
const code = otp.json?.data?.demoOtp;
if (!code) say(`SKIP  admin checks (no demo OTP: set DEMO_MODE=true, or status ${otp.status})`);
else {
  const login = await call('/api/auth/verify-otp', { method: 'POST', body: { phone, otp: code } });
  const token = login.json?.data?.token;
  check(`Admin login (${phone})`, !!token && login.json.data.user.role === 'admin', token ? '' : login.json?.message);
  if (token) {
    check('Admin stats', (await call('/api/admin/stats', { token })).json?.data?.products !== undefined);
    check('Admin product list', Array.isArray((await call('/api/admin/products', { token })).json?.data));
    check('Coupons list', Array.isArray((await call('/api/admin/coupons', { token })).json?.data));
    check('Reports', (await call('/api/admin/reports', { token })).json?.data?.totals !== undefined);
  }
}
say(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
