import 'dotenv/config';
import { eq, sql, inArray, and, isNull, ne } from 'drizzle-orm';
import { demoPdf } from './demoPdf.js';
import { db, users, categories, products, posts, pages, bundleItems, files } from '../db/index.js';
await db.insert(users).values({ phone: process.env.ADMIN_PHONE || '+919999999999', role: 'admin', isVerified: true }).onConflictDoNothing();
for (const name of ['Physics', 'Chemistry', 'Maths', 'Biology']) await db.insert(categories).values({ name, slug: name.toLowerCase() }).onConflictDoNothing();
const cats = await db.select().from(categories);
const c = (n) => cats.find((x) => x.name === n)?.id;
const [{ n }] = await db.select({ n: sql`count(*)::int` }).from(products);
if (!n) { // demo catalog so the storefront isn't empty (add real PDFs from the admin API)
  const d = 'Complete chapter-wise notes with solved examples, previous-year questions and quick revision sheets. Instant digital delivery.';
  await db.insert(products).values([
    ['Physics Mastery: Mechanics & Waves', 'Physics', 399, 799, 4.7, 1280, true], ['Organic Chemistry Made Simple', 'Chemistry', 349, 699, 4.5, 940, true],
    ['Calculus Crash Course', 'Maths', 299, 599, 4.8, 2210, true], ['NEET Biology 10,000 MCQs', 'Biology', 449, 899, 4.6, 1760, false],
    ['JEE Maths Formula Handbook', 'Maths', 0, 199, 4.4, 5300, false], ['Physics Formula Sheet (Free)', 'Physics', 0, 99, 4.3, 4100, false],
    ['Periodic Table Quick Revision', 'Chemistry', 0, 99, 4.2, 3200, false], ['Human Physiology Illustrated', 'Biology', 499, 999, 4.9, 870, true],
  ].map(([title, cat, price, mrp, r, dl, feat]) => ({ title, description: d, categoryId: c(cat), price, mrp, isFree: price === 0, ratingAvg: r, ratingCount: Math.round(dl / 6), downloadCount: dl, isFeatured: feat, tags: [cat.toLowerCase(), 'notes'] })));
}
// Everything is paid: any demo item still at price 0 gets a price (real products must be priced in the admin).
await db.update(products).set({ price: 99, isFree: false }).where(eq(products.price, 0));
await db.update(products).set({ title: 'Physics Formula Sheet' }).where(eq(products.title, 'Physics Formula Sheet (Free)'));
const [{ bn }] = await db.select({ bn: sql`count(*)::int` }).from(products).where(eq(products.type, 'bundle'));
if (!bn) { // demo bundle: three products sold together at a discount
  const parts = await db.select().from(products).where(inArray(products.title, ['Calculus Crash Course', 'JEE Maths Formula Handbook', 'Physics Mastery: Mechanics & Waves']));
  if (parts.length >= 2) {
    const worth = parts.reduce((t, p) => t + p.price, 0);
    const [b] = await db.insert(products).values({ title: 'JEE Starter Bundle', description: 'Our best-selling JEE titles in one pack. Buy together and save.', type: 'bundle', price: Math.round(worth * 0.7), mrp: worth, categoryId: parts[0].categoryId, ratingAvg: 4.8, ratingCount: 96, downloadCount: 640, isFeatured: true, tags: ['bundle', 'jee'] }).returning();
    await db.insert(bundleItems).values(parts.map((p) => ({ bundleId: b.id, productId: p.id })));
  }
}
const [{ pn }] = await db.select({ pn: sql`count(*)::int` }).from(posts);
if (!pn) await db.insert(posts).values({ title: '5 Study Tips to Crack JEE & NEET', slug: '5-study-tips-to-crack-jee-neet', status: 'published', publishedAt: new Date(), tags: ['study', 'tips'],
  excerpt: 'Simple, proven habits that top rankers follow every single day.', content: '## Plan your week\n\nBreak every subject into small chapters and assign each one a day.\n\n## What works\n\n- Revise within 24 hours\n- Solve **previous-year papers**\n- Keep a formula sheet handy\n\nStay consistent and the results will follow.' });
const [{ pg }] = await db.select({ pg: sql`count(*)::int` }).from(pages);
if (!pg) { // starter legal/info pages: the admin edits these from Admin -> Pages (replace with your own legal text!)
  const note = '\n\n*Edit this page from Admin -> Pages.*';
  await db.insert(pages).values([
    { slug: 'about', title: 'About us', sortOrder: 1, content: '## Who we are\n\nWe help students learn faster with carefully prepared study material.\n\n## Why choose us\n\n- Instant digital delivery\n- Secure payments\n- Quality checked content' + note },
    { slug: 'contact', title: 'Contact us', template: 'contact', sortOrder: 2, content: 'Questions about an order or a product? Send us a message and we will reply as soon as we can.' },
    { slug: 'privacy-policy', title: 'Privacy Policy', sortOrder: 3, content: '## Information we collect\n\nWe collect your phone number to create your account and send one-time passwords. We do not sell your data.\n\n## Payments\n\nPayments are processed by PhonePe. We never store card or UPI details.' + note },
    { slug: 'terms-and-conditions', title: 'Terms & Conditions', sortOrder: 4, content: '## Using the store\n\nAll products are digital and for personal use only. Sharing or reselling files is not allowed.\n\n## Accounts\n\nYou are responsible for activity on your account.' + note },
    { slug: 'refund-policy', title: 'Refund Policy', sortOrder: 5, content: '## Digital products\n\nBecause files are delivered instantly, purchases are generally non-refundable. If a file is damaged or missing, contact us and we will fix it.' + note },
  ]);
}
// Products without a file (the demo ones) get a small demo PDF, so buying and downloading works end to end.
for (const p of await db.select().from(products).where(and(isNull(products.pdfFileId), ne(products.type, 'bundle')))) {
  const data = demoPdf(p.title), [f] = await db.insert(files).values({ kind: 'pdf', mime: 'application/pdf', size: data.length, data }).returning({ id: files.id });
  await db.update(products).set({ pdfFileId: f.id }).where(eq(products.id, p.id));
}
process.stdout.write('Seeded\n');
