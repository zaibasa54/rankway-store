import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, settings } from '../db/index.js';

export const FONTS = ['Inter', 'Poppins', 'Montserrat', 'Plus Jakarta Sans', 'DM Sans', 'Nunito', 'Raleway', 'Lora', 'Playfair Display', 'Merriweather', 'Space Grotesk', 'Outfit'];
// Everything the admin can customise without touching code. Stored as one JSON document in the `settings` table.
export const DEFAULTS = {
  brand: { name: 'RankWay', tagline: 'Premium PDFs & Books for students', logoFileId: null },
  theme: { color: '#6366f1', fontBody: 'Inter', fontHeading: 'Plus Jakarta Sans' },
  header: { showCategories: true, menu: [{ label: 'Blog', url: '/blog' }, { label: 'About', url: '/p/about' }, { label: 'Contact', url: '/p/contact' }], announcement: { enabled: false, text: '', link: '' } },
  footer: {
    about: 'Premium study material, delivered instantly after payment.', copyright: '',
    menu: [{ label: 'About us', url: '/p/about' }, { label: 'Contact', url: '/p/contact' }, { label: 'Privacy Policy', url: '/p/privacy-policy' }, { label: 'Terms & Conditions', url: '/p/terms-and-conditions' }, { label: 'Refund Policy', url: '/p/refund-policy' }],
    social: [],
  },
  contact: { email: '', phone: '', whatsapp: '', address: '', hours: '' },
  home: { badge: 'Trusted by 10,000+ students', title: 'Study smarter with premium PDFs & books', subtitle: 'Notes, formula sheets and MCQ banks for JEE, NEET and boards. Pay once, download instantly.', showPerks: true, showBlog: true },
  features: { blog: true, reviews: true, wishlist: true },
  // Printed on invoices. Prices are treated as GST-inclusive; set gstRate to 0 if you are not GST registered.
  business: { legalName: '', gstin: '', address: '', state: '', gstRate: 0, invoicePrefix: 'INV', invoiceNote: 'This is a computer generated invoice.' },
};
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = isObj(b[k]) && isObj(a?.[k]) ? merge(a[k], b[k]) : b[k]; return o; };

const link = z.object({ label: z.string().trim().min(1).max(40), url: z.string().trim().max(300).regex(/^(\/|https?:\/\/|mailto:|tel:|#)/, 'Links must start with /, http(s)://, mailto: or tel:') });
const str = (n) => z.string().max(n);
export const settingsSchema = z.object({
  brand: z.object({ name: z.string().trim().min(1).max(40), tagline: str(120), logoFileId: z.string().uuid().nullable() }).partial(),
  theme: z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a valid color'), fontBody: z.enum(FONTS), fontHeading: z.enum(FONTS) }).partial(),
  header: z.object({ showCategories: z.boolean(), menu: z.array(link).max(10), announcement: z.object({ enabled: z.boolean(), text: str(200), link: str(300) }).partial() }).partial(),
  footer: z.object({ about: str(400), copyright: str(200), menu: z.array(link).max(12), social: z.array(link).max(8) }).partial(),
  contact: z.object({ email: str(120), phone: str(40), whatsapp: str(40), address: str(300), hours: str(120) }).partial(),
  home: z.object({ badge: str(80), title: str(140), subtitle: str(300), showPerks: z.boolean(), showBlog: z.boolean() }).partial(),
  features: z.object({ blog: z.boolean(), reviews: z.boolean(), wishlist: z.boolean() }).partial(),
  business: z.object({ legalName: str(120), gstin: z.string().trim().toUpperCase().regex(/^$|^[0-9A-Z]{15}$/, 'GSTIN must be 15 characters'), address: str(300), state: str(60), gstRate: z.coerce.number().min(0).max(28), invoicePrefix: str(10), invoiceNote: str(300) }).partial(),
}).partial();

export async function getSettings() {
  const [r] = await db.select().from(settings).where(eq(settings.key, 'site'));
  return merge(DEFAULTS, r?.value || {});
}
export async function saveSettings(patch) {
  const next = merge(await getSettings(), patch);
  await db.insert(settings).values({ key: 'site', value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next, updatedAt: new Date() } });
  return next;
}
