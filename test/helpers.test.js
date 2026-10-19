import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcDiscount, splitGst } from '../src/utils/pricing.js';
import { driveDirect } from '../src/utils/drive.js';
import { csvCell } from '../src/utils/csv.js';
import { can, isStaff } from '../src/middleware/permissions.js';

test('percent coupon', () => assert.equal(calcDiscount({ type: 'percent', value: 20 }, 500), 100));
test('percent coupon respects the max discount cap', () => assert.equal(calcDiscount({ type: 'percent', value: 50, maxDiscount: 80 }, 500), 80));
test('flat coupon larger than the cart never makes it free', () => assert.equal(calcDiscount({ type: 'flat', value: 1000 }, 300), 299));
test('discount is never negative', () => assert.equal(calcDiscount({ type: 'flat', value: 0 }, 300), 0));
test('GST split of an inclusive price', () => assert.deepEqual(splitGst(118, 18), { taxable: 100, gst: 18 }));
test('no GST when the rate is 0', () => assert.deepEqual(splitGst(250, 0), { taxable: 250, gst: 0 }));

test('Google Drive share links become direct downloads', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz';
  const want = `https://drive.google.com/uc?export=download&id=${id}`;
  assert.equal(driveDirect(`https://drive.google.com/file/d/${id}/view?usp=sharing`), want);
  assert.equal(driveDirect(`https://drive.google.com/open?id=${id}`), want);
  assert.equal(driveDirect('https://example.com/a.pdf'), 'https://example.com/a.pdf');
});

test('CSV cells are escaped and formula-safe', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
});

const run = (mw, user) => { let err; mw({ user }, {}, (e) => { err = e; }); return err; };
test('admin passes every permission check', () => assert.equal(run(can('settings'), { role: 'admin' }), undefined));
test('staff only get the sections they were given', () => {
  const staff = { role: 'staff', permissions: ['products'] };
  assert.equal(run(can('products'), staff), undefined);
  assert.equal(run(can('orders'), staff)?.code, 403);
});
test('students cannot enter the admin area', () => assert.equal(run(isStaff, { role: 'student' })?.code, 403));

import { orderRows } from '../src/utils/bundles.js';
test('a bundle adds its products at price 0', () => {
  const rows = orderRows([{ id: 'b', price: 500 }], [{ bundleId: 'b', productId: 'p1' }, { bundleId: 'b', productId: 'p2' }]);
  assert.deepEqual(rows, [{ productId: 'b', price: 500 }, { productId: 'p1', price: 0 }, { productId: 'p2', price: 0 }]);
});
test('a product bought alone and inside the bundle is not duplicated', () => {
  const rows = orderRows([{ id: 'b', price: 500 }, { id: 'p1', price: 300 }], [{ bundleId: 'b', productId: 'p1' }, { bundleId: 'b', productId: 'p2' }]);
  assert.equal(rows.filter((r) => r.productId === 'p1').length, 1);
  assert.equal(rows.find((r) => r.productId === 'p1').price, 300);
});
test('a normal cart is unchanged', () => assert.deepEqual(orderRows([{ id: 'a', price: 99 }]), [{ productId: 'a', price: 99 }]));

import { gstBreakup } from '../src/utils/pricing.js';
test('same state splits GST into CGST + SGST', () => assert.deepEqual(gstBreakup(18, 'Kerala', 'Kerala'), { type: 'CGST+SGST', cgst: 9, sgst: 9 }));
test('odd paise are not lost in the CGST/SGST split', () => { const b = gstBreakup(0.05, 'Goa', 'Goa'); assert.equal(Math.round((b.cgst + b.sgst) * 100) / 100, 0.05); });
test('another state is IGST', () => assert.deepEqual(gstBreakup(18, 'Kerala', 'Goa'), { type: 'IGST', igst: 18 }));
test('no breakup when a state is unknown', () => { assert.equal(gstBreakup(18, 'Kerala', null), null); assert.equal(gstBreakup(18, '', 'Goa'), null); });

import { pageHtml } from '../src/utils/prerender.js';
test('prerender HTML escapes user text and carries the preview tags', () => {
  const html = pageHtml({ title: 'A "great" <book>', description: 'x & y', image: 'https://e.com/i.png', url: 'https://e.com/product/1' });
  assert.ok(html.includes('og:title" content="A &quot;great&quot; &lt;book&gt;"'));
  assert.ok(html.includes('og:image" content="https://e.com/i.png"'));
  assert.ok(!html.includes('<book>'));
});

import { orderSmsText } from '../src/utils/messages.js';
test('order SMS contains the amount and the download link', () => {
  const t = orderSmsText(499, 'https://shop.example/account/downloads');
  assert.ok(t.includes('Rs 499') && t.includes('https://shop.example/account/downloads'));
});

import { refundAmount } from '../src/utils/pricing.js';
test('refund defaults to everything that is left', () => assert.deepEqual(refundAmount(500, 0, undefined), { amt: 500, remaining: 500 }));
test('partial refund then the rest', () => { assert.equal(refundAmount(500, 0, 200).amt, 200); assert.deepEqual(refundAmount(500, 200, undefined), { amt: 300, remaining: 300 }); });
test('cannot refund more than is left, or twice in full', () => {
  assert.ok(refundAmount(500, 200, 400).error.includes('300'));
  assert.ok(refundAmount(500, 500, undefined).error);
  assert.ok(refundAmount(500, 0, 0).error);
});

import { demoPdf } from '../src/utils/demoPdf.js';
test('demo PDF is a well-formed single page file', () => {
  const s = demoPdf('Physics (Part 1)').toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4') && s.includes('Physics \\(Part 1\\)') && s.trimEnd().endsWith('%%EOF'));
  const at = Number(s.match(/startxref\n(\d+)/)[1]);
  assert.equal(s.slice(at, at + 4), 'xref'); // the cross-reference table is where the file says it is
});
