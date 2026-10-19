import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db, pages, messages } from '../db/index.js';
import { getSettings, saveSettings } from '../services/site.js';
import { persist, removeFiles } from '../services/storage.js';
import { isId } from '../utils/validate.js';
import { ok, ApiError, wrap } from '../utils/respond.js';

const withLogo = (s) => ({ ...s, brand: { ...s.brand, logoUrl: s.brand.logoFileId ? `/api/files/cover/${s.brand.logoFileId}` : null } });
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
async function uniqueSlug(base, ignoreId) {
  let s = base, i = 1;
  for (;;) { const [x] = await db.select({ id: pages.id }).from(pages).where(eq(pages.slug, s)); if (!x || x.id === ignoreId) return s; s = `${base}-${++i}`; }
}

// ---- public ----
export const site = wrap(async (_q, res) => {
  const [s, list] = await Promise.all([getSettings(),
    db.select({ slug: pages.slug, title: pages.title, template: pages.template }).from(pages).where(eq(pages.status, 'published')).orderBy(asc(pages.sortOrder), asc(pages.title))]);
  ok(res, { ...withLogo(s), pages: list });
});
export const page = wrap(async (req, res) => {
  const [p] = await db.select().from(pages).where(and(eq(pages.slug, req.params.slug), eq(pages.status, 'published')));
  if (!p) throw new ApiError(404, 'Page not found');
  ok(res, p);
});
export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80), email: z.string().trim().email('Enter a valid email').or(z.literal('')).optional(),
  phone: z.string().trim().max(20).optional(), message: z.string().trim().min(5, 'Write a short message').max(2000),
});
export const contact = wrap(async (req, res) => { await db.insert(messages).values(req.body); ok(res, null, 'Thanks! We will get back to you soon.', 201); });

// ---- admin: settings ----
export const adminSettings = wrap(async (_q, res) => ok(res, withLogo(await getSettings())));
export const saveSite = wrap(async (req, res) => ok(res, withLogo(await saveSettings(req.body)), 'Settings saved'));
export const setLogo = wrap(async (req, res) => {
  const { coverFileId } = await persist(req.files);
  if (!coverFileId) throw new ApiError(422, 'Choose an image file');
  const old = (await getSettings()).brand.logoFileId;
  await saveSettings({ brand: { logoFileId: coverFileId } });
  await removeFiles(old);
  ok(res, withLogo(await getSettings()), 'Logo updated');
});
export const removeLogo = wrap(async (_q, res) => {
  const old = (await getSettings()).brand.logoFileId;
  await saveSettings({ brand: { logoFileId: null } });
  await removeFiles(old);
  ok(res, withLogo(await getSettings()), 'Logo removed');
});

// ---- admin: pages ----
export const pageSchema = z.object({
  title: z.string().trim().min(2, 'Title is required').max(120), slug: z.string().trim().max(80).optional(), content: z.string().max(100000).optional(),
  template: z.enum(['default', 'contact']).optional(), status: z.enum(['published', 'draft']).optional(), seoDescription: z.string().max(300).optional(), sortOrder: z.coerce.number().int().optional(),
});
export const adminPages = wrap(async (_q, res) => ok(res, await db.select().from(pages).orderBy(asc(pages.sortOrder), asc(pages.title))));
export const createPage = wrap(async (req, res) => {
  const { slug, ...b } = req.body;
  const [p] = await db.insert(pages).values({ ...b, slug: await uniqueSlug(slugify(slug || b.title)) }).returning();
  ok(res, p, 'Page created', 201);
});
export const updatePage = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw new ApiError(404, 'Page not found');
  const { slug, ...b } = req.body;
  const set = { ...b, updatedAt: new Date(), ...(slug && { slug: await uniqueSlug(slugify(slug), req.params.id) }) };
  const [p] = await db.update(pages).set(set).where(eq(pages.id, req.params.id)).returning();
  if (!p) throw new ApiError(404, 'Page not found');
  ok(res, p, 'Page updated');
});
export const deletePage = wrap(async (req, res) => { if (isId(req.params.id)) await db.delete(pages).where(eq(pages.id, req.params.id)); ok(res, null, 'Page deleted'); });

// ---- admin: contact inbox ----
export const adminMessages = wrap(async (_q, res) => ok(res, await db.select().from(messages).orderBy(desc(messages.createdAt)).limit(300)));
export const markRead = wrap(async (req, res) => { if (isId(req.params.id)) await db.update(messages).set({ isRead: true }).where(eq(messages.id, req.params.id)); ok(res, null); });
export const removeMessage = wrap(async (req, res) => { if (isId(req.params.id)) await db.delete(messages).where(eq(messages.id, req.params.id)); ok(res, null, 'Message deleted'); });
