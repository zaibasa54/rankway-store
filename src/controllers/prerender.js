import { and, eq } from 'drizzle-orm';
import { db, products, posts, pages } from '../db/index.js';
import { getSettings } from '../services/site.js';
import { pageHtml } from '../utils/prerender.js';
import { isId } from '../utils/validate.js';
import { wrap } from '../utils/respond.js';

const site = () => (process.env.SITE_URL || process.env.CLIENT_URL || '').replace(/\/$/, '');
const apiBase = () => (process.env.API_URL || '').replace(/\/$/, '');
const img = (id) => (id ? `${apiBase()}/api/files/cover/${id}` : null);
const send = (res, html) => res.set('Cache-Control', 'public, max-age=300').type('html').send(html);
const missing = (res) => res.status(404).type('text/plain').send('Not found');

export const product = wrap(async (req, res) => {
  if (!isId(req.params.id)) return missing(res);
  const [[p], s] = await Promise.all([db.select().from(products).where(and(eq(products.id, req.params.id), eq(products.isActive, true))), getSettings()]);
  if (!p) return missing(res);
  send(res, pageHtml({ title: `${p.title} · ${s.brand.name}`, description: p.description || '', image: img(p.coverFileId), url: `${site()}/product/${p.id}`, type: 'product', siteName: s.brand.name, body: p.description || '' }));
});
export const blog = wrap(async (req, res) => {
  const [[p], s] = await Promise.all([db.select().from(posts).where(and(eq(posts.slug, req.params.slug), eq(posts.status, 'published'))), getSettings()]);
  if (!p) return missing(res);
  send(res, pageHtml({ title: `${p.title} · ${s.brand.name}`, description: p.excerpt || p.content, image: img(p.coverFileId), url: `${site()}/blog/${p.slug}`, type: 'article', siteName: s.brand.name, body: p.content }));
});
export const page = wrap(async (req, res) => {
  const [[p], s] = await Promise.all([db.select().from(pages).where(and(eq(pages.slug, req.params.slug), eq(pages.status, 'published'))), getSettings()]);
  if (!p) return missing(res);
  send(res, pageHtml({ title: `${p.title} · ${s.brand.name}`, description: p.seoDescription || p.content, url: `${site()}/p/${p.slug}`, siteName: s.brand.name, body: p.content }));
});
