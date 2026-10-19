import multer from 'multer';
import axios from 'axios';
import { eq } from 'drizzle-orm';
import { db, files } from '../db/index.js';
import { ApiError } from '../utils/respond.js';
import { driveDirect } from '../utils/drive.js';

const MAX = 50 * 1024 * 1024; // 50 MB per file (stored inside Neon)
// Uploads are held in memory, validated, then saved to the `files` table.
export const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: MAX },
  fileFilter: (_r, f, cb) => cb(null, ['pdf', 'preview'].includes(f.fieldname) ? f.mimetype === 'application/pdf' : f.mimetype.startsWith('image/')),
}).fields([{ name: 'pdf', maxCount: 1 }, { name: 'preview', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);

export const assertPdf = (b) => { if (!b || b.subarray(0, 4).toString() !== '%PDF') throw new ApiError(422, 'That file is not a valid PDF'); };
export async function saveFile(kind, mime, data) {
  const [r] = await db.insert(files).values({ kind, mime, size: data.length, data }).returning({ id: files.id });
  return r.id;
}
export async function removeFiles(...ids) { for (const id of ids.filter(Boolean)) await db.delete(files).where(eq(files.id, id)); }

// Save the cover / PDF that came with the multipart request.
export async function persist(f = {}) {
  const out = {};
  if (f.cover) out.coverFileId = await saveFile('cover', f.cover[0].mimetype, f.cover[0].buffer);
  if (f.pdf) { assertPdf(f.pdf[0].buffer); out.pdfFileId = await saveFile('pdf', 'application/pdf', f.pdf[0].buffer); }
  if (f.preview) { assertPdf(f.preview[0].buffer); out.previewFileId = await saveFile('pdf', 'application/pdf', f.preview[0].buffer); } // optional free sample
  return out;
}

const PRIVATE_HOST = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/i;
// Download a PDF from a link (admin only). Drive files must be shared as "Anyone with the link".
export async function fetchPdf(link) {
  let url; try { url = new URL(driveDirect(link)); } catch { throw new ApiError(422, 'Enter a valid link'); }
  if (!/^https?:$/.test(url.protocol) || PRIVATE_HOST.test(url.hostname)) throw new ApiError(422, 'That link is not allowed');
  try {
    const r = await axios.get(url.href, { responseType: 'arraybuffer', maxContentLength: MAX, maxBodyLength: MAX, timeout: 90000, maxRedirects: 5 });
    const buf = Buffer.from(r.data);
    if (buf.subarray(0, 4).toString() !== '%PDF') throw new ApiError(422, 'The link did not return a PDF. For Google Drive, set sharing to "Anyone with the link" (files over ~25 MB: upload from your computer instead).');
    return buf;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(422, /maxContentLength|exceeded/i.test(e.message) ? 'File is larger than 50 MB' : 'Could not download the file from that link');
  }
}
