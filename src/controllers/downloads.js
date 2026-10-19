import jwt from 'jsonwebtoken';
import { and, eq, sql } from 'drizzle-orm';
import { db, orders, orderItems, products, files, downloadHistory } from '../db/index.js';
import { isId } from '../utils/validate.js';
import { ok, ApiError, wrap } from '../utils/respond.js';

// Step 1 (authenticated): verify ownership, return a 60-second signed link.
export const getLink = wrap(async (req, res) => {
  const [p] = await db.select().from(products).where(eq(products.id, req.params.id));
  if (!p) throw new ApiError(404, 'Not found');
  const [own] = await db.select({ x: orders.id }).from(orders).innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.userId, req.user.id), eq(orders.status, 'paid'), eq(orderItems.productId, p.id))).limit(1);
  if (!own) throw new ApiError(403, 'Purchase required'); // login + paid order always required
  const t = jwt.sign({ u: req.user.id, p: p.id }, process.env.DOWNLOAD_SECRET, { expiresIn: '60s' });
  ok(res, { url: `/api/downloads/file?t=${t}` });
});
// Free sample: any logged-in student, no purchase needed (still requires registration).
export const sampleLink = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(404, 'Not found');
  const [p] = await db.select().from(products).where(and(eq(products.id, req.params.id), eq(products.isActive, true)));
  if (!p?.previewFileId) throw new ApiError(404, 'This product has no free sample');
  ok(res, { url: `/api/downloads/file?t=${jwt.sign({ u: req.user.id, p: p.id, s: 1 }, process.env.DOWNLOAD_SECRET, { expiresIn: '60s' })}` });
});
// Step 2: stream the file. Real storage reference is never exposed; purchases are counted, samples are not.
export const stream = wrap(async (req, res) => {
  let c; try { c = jwt.verify(req.query.t, process.env.DOWNLOAD_SECRET); } catch { throw new ApiError(401, 'Link expired'); }
  const [p] = await db.select().from(products).where(eq(products.id, c.p));
  const fileId = c.s ? p?.previewFileId : p?.pdfFileId;
  const [f] = fileId ? await db.select().from(files).where(eq(files.id, fileId)) : [];
  if (!f) throw new ApiError(404, 'File missing');
  if (!c.s) await Promise.all([
    db.update(products).set({ downloadCount: sql`${products.downloadCount} + 1` }).where(eq(products.id, p.id)),
    db.insert(downloadHistory).values({ userId: c.u, productId: p.id, ip: req.ip })]);
  const label = c.s ? `${p.title} (sample)` : p.title, plain = label.replace(/[^\w.\- ]+/g, '').trim() || 'download'; // ASCII fallback + UTF-8 name
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${plain}.pdf"; filename*=UTF-8''${encodeURIComponent(label)}.pdf` }).send(f.data);
});
