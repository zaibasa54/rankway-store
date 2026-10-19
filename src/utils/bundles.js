// Order rows for a cart: every cart item at its price, plus the products inside any bundle at price 0
// (so the student can download them, while revenue is counted once on the bundle).
export function orderRows(items, members = []) {
  const rows = items.map((p) => ({ productId: p.id, price: p.price })), have = new Set(items.map((p) => p.id));
  for (const m of members) if (!have.has(m.productId)) { have.add(m.productId); rows.push({ productId: m.productId, price: 0 }); }
  return rows;
}
