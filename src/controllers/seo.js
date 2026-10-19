import { eq, sql } from 'drizzle-orm';
import { db, products, posts, pages } from '../db/index.js';
import { wrap } from '../utils/respond.js';

const base = () => (process.env.SITE_URL || process.env.CLIENT_URL || '').replace(/\/$/, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let memo = { exp: 0, xml: '' }; // rebuilt at most every 10 minutes
export const sitemap = wrap(async (_q, res) => {
  if (memo.exp < Date.now()) {
    const [prods, blog, pgs] = await Promise.all([
      db.select({ id: products.id, at: products.createdAt }).from(products).where(eq(products.isActive, true)),
      db.select({ slug: posts.slug, at: posts.updatedAt }).from(posts).where(eq(posts.status, 'published')),
      db.select({ slug: pages.slug, at: pages.updatedAt }).from(pages).where(eq(pages.status, 'published'))]);
    const urls = [['/', 1], ['/shop', 0.9], ['/blog', 0.7], ...prods.map((p) => [`/product/${p.id}`, 0.8, p.at]), ...blog.map((p) => [`/blog/${p.slug}`, 0.6, p.at]), ...pgs.map((p) => [`/p/${p.slug}`, 0.4, p.at])];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, pr, at]) => `<url><loc>${esc(base() + u)}</loc>${at ? `<lastmod>${new Date(at).toISOString().slice(0, 10)}</lastmod>` : ''}<priority>${pr}</priority></url>`).join('\n')}\n</urlset>`;
    memo = { exp: Date.now() + 600000, xml };
  }
  res.type('application/xml').send(memo.xml);
});
export const robots = (_q, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /cart\nDisallow: /login\nSitemap: ${base()}/sitemap.xml\n`);
