// Pure price maths, kept separate so it can be unit-tested.
export function calcDiscount(coupon, subtotal) {
  let d = coupon.type === 'percent' ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
  if (coupon.type === 'percent' && coupon.maxDiscount) d = Math.min(d, coupon.maxDiscount);
  return Math.max(0, Math.min(d, subtotal - 1)); // never free: PhonePe needs at least Rs 1
}
// How much to refund now. Returns { amt } or { error }. `requested` empty = refund everything that is left.
export function refundAmount(total, already, requested) {
  const remaining = total - (already || 0);
  if (remaining <= 0) return { error: 'This order is already fully refunded' };
  const amt = requested ?? remaining;
  if (!Number.isInteger(amt) || amt < 1) return { error: 'Enter a whole rupee amount of at least 1' };
  if (amt > remaining) return { error: `Only ₹${remaining} is left to refund` };
  return { amt, remaining };
}
// Same state as the seller -> CGST + SGST (half each); another state -> IGST. Unknown buyer state -> no breakup.
export function gstBreakup(gst, sellerState, buyerState) {
  if (!gst || !sellerState || !buyerState) return null;
  if (sellerState !== buyerState) return { type: 'IGST', igst: gst };
  const half = Math.round((gst / 2) * 100) / 100;
  return { type: 'CGST+SGST', cgst: half, sgst: Math.round((gst - half) * 100) / 100 };
}
// Prices are GST-inclusive: taxable value = total / (1 + rate).
export function splitGst(amount, rate) {
  const r2 = (n) => Math.round(n * 100) / 100, taxable = rate ? r2(amount / (1 + rate / 100)) : amount;
  return { taxable, gst: r2(amount - taxable) };
}
