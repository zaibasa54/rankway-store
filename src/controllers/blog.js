import { and, desc, eq, sql } from 'drizzle-orm';
import { db, posts } from '../db/index.js';
import { persist } from '../services/storage.js';
import { pubPost } from '../utils/product.js';
import { ok, ApiError, wrap } from '../utils/respond.js';

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'post';
async function uniqueSlug(base, ignoreId) {
  let s = base, i = 1;
  for (;;) { const [x] = await db.select({ id: posts.id }).from(posts).where(eq(posts.slug, s)); if (!x || x.id === ignoreId) return s; s = `${base}-${++i}`; }
}
const fields = (b) => ({
  ...(b.title !== undefined && { title: b.title.trim() }), ...(b.excerpt !== undefined && { excerpt: b.excerpt }), ...(b.content !== undefined && { content: b.content }),
  ...(b.status && { status: b.status === 'published' ? 'published' : 'draft' }),
  ...(b.tags !== undefined && { tags: b.tags.split(',').map((t) => t.trim()).filter(Boolean) }),
});

// ---- public ----
export const list = wrap(async (req, res) => {
  const { page = 1, limit = 9 } = req.query, where = eq(posts.status, 'published');
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(posts).where(where).orderBy(desc(posts.publishedAt)).limit(+limit).offset((page - 1) * limit),
    db.select({ n: sql`count(*)::int` }).from(posts).where(where)]);
  ok(res, { items: rows.map(({ content, ...p }) => pubPost(p)), total: n, pages: Math.ceil(n / limit) });
});
export const one = wrap(async (req, res) => {
  const [p] = await db.select().from(posts).where(and(eq(posts.slug, req.params.slug), eq(posts.status, 'published')));
  if (!p) throw new ApiError(404, 'Post not found');
  ok(res, pubPost(p));
});
// ---- admin ----
export const adminList = wrap(async (_q, res) => ok(res, (await db.select().from(posts).orderBy(desc(posts.createdAt))).map(pubPost)));
export const create = wrap(async (req, res) => {
  const f = fields(req.body);
  if (!f.title || f.title.length < 3) throw new ApiError(422, 'Title is required');
  const [p] = await db.insert(posts).values({ ...f, slug: await uniqueSlug(slugify(f.title)), ...(await persist(req.files)), publishedAt: f.status === 'published' ? new Date() : null }).returning();
  ok(res, pubPost(p), 'Post created', 201);
});
export const update = wrap(async (req, res) => {
  const [old] = await db.select().from(posts).where(eq(posts.id, req.params.id));
  if (!old) throw new ApiError(404, 'Post not found');
  const f = fields(req.body);
  const publishedAt = f.status === 'published' ? old.publishedAt || new Date() : f.status === 'draft' ? null : old.publishedAt;
  const slug = req.body.slug ? await uniqueSlug(slugify(req.body.slug), old.id) : old.slug;
  const [p] = await db.update(posts).set({ ...f, slug, publishedAt, ...(await persist(req.files)), updatedAt: new Date() }).where(eq(posts.id, old.id)).returning();
  ok(res, pubPost(p), 'Post updated');
});
export const remove = wrap(async (req, res) => { await db.delete(posts).where(eq(posts.id, req.params.id)); ok(res, null, 'Post deleted'); });
