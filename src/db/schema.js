import { pgTable, uuid, text, integer, boolean, timestamp, real, primaryKey, customType, jsonb } from 'drizzle-orm/pg-core';
// Everything (including PDFs and covers) lives in Neon, so no other storage service is needed.
const bytea = customType({
  dataType: () => 'bytea',
  toDriver: (v) => '\\x' + Buffer.from(v).toString('hex'),
  fromDriver: (v) => (typeof v === 'string' ? Buffer.from(v.replace(/^\\x/, ''), 'hex') : v),
});
const id = () => uuid('id').primaryKey().defaultRandom();
const created = () => timestamp('created_at').defaultNow().notNull();

export const users = pgTable('users', {
  id: id(), phone: text('phone').notNull().unique(), name: text('name'),
  role: text('role').notNull().default('student'), // student | staff | admin
  permissions: text('permissions').array().default([]), // sections a staff member may use
  isVerified: boolean('is_verified').default(false), isBlocked: boolean('is_blocked').default(false), createdAt: created(),
});
export const otps = pgTable('otps', {
  phone: text('phone').primaryKey(), hash: text('hash').notNull(), attempts: integer('attempts').default(0), expiresAt: timestamp('expires_at').notNull(),
});
export const categories = pgTable('categories', { id: id(), name: text('name').notNull().unique(), slug: text('slug').unique(), icon: text('icon') });
export const files = pgTable('files', { id: id(), kind: text('kind').notNull(), mime: text('mime'), size: integer('size'), data: bytea('data').notNull(), createdAt: created() });
export const products = pgTable('products', {
  id: id(), title: text('title').notNull(), description: text('description'), type: text('type').default('pdf'),
  price: integer('price').default(0), mrp: integer('mrp'), isFree: boolean('is_free').default(false),
  categoryId: uuid('category_id').references(() => categories.id), tags: text('tags').array().default([]),
  coverFileId: uuid('cover_file_id'), previewFileId: uuid('preview_file_id'), // optional free sample PDF (login required to download)
  pdfFileId: uuid('pdf_file_id'), // pdfFileId is PRIVATE, stripped from public responses
  downloadCount: integer('download_count').default(0), ratingAvg: real('rating_avg').default(0), ratingCount: integer('rating_count').default(0),
  isActive: boolean('is_active').default(true), isFeatured: boolean('is_featured').default(false), createdAt: created(),
});
export const orders = pgTable('orders', {
  id: id(), userId: uuid('user_id').references(() => users.id).notNull(), amount: integer('amount').notNull(), // rupees
  status: text('status').notNull().default('pending'), // pending | paid | failed | refunded
  billingState: text('billing_state'), // buyer's state, chosen at checkout (for the GST split)
  refundTxnId: text('refund_txn_id'), refundedAt: timestamp('refunded_at'), refundedAmount: integer('refunded_amount').default(0), // total refunded so far (partial refunds allowed)
  invoiceNo: integer('invoice_no').unique(), // assigned when the order is paid
  couponCode: text('coupon_code'), discount: integer('discount').default(0), // amount is the final price paid
  merchantTransactionId: text('merchant_transaction_id').notNull().unique(), phonepeTransactionId: text('phonepe_transaction_id'), createdAt: created(),
});
export const orderItems = pgTable('order_items', {
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }), productId: uuid('product_id').notNull().references(() => products.id),
  price: integer('price'), // price at purchase time (reports stay correct if you change prices later)
}, (t) => ({ pk: primaryKey({ columns: [t.orderId, t.productId] }) }));
export const posts = pgTable('posts', {
  id: id(), title: text('title').notNull(), slug: text('slug').notNull().unique(), excerpt: text('excerpt'), content: text('content').notNull().default(''),
  coverFileId: uuid('cover_file_id'), tags: text('tags').array().default([]), status: text('status').notNull().default('draft'), // draft | published
  publishedAt: timestamp('published_at'), createdAt: created(), updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const settings = pgTable('settings', { key: text('key').primaryKey(), value: jsonb('value').notNull(), updatedAt: timestamp('updated_at').defaultNow().notNull() });
export const pages = pgTable('pages', {
  id: id(), slug: text('slug').notNull().unique(), title: text('title').notNull(), content: text('content').notNull().default(''),
  template: text('template').notNull().default('default'), // default | contact
  status: text('status').notNull().default('published'), seoDescription: text('seo_description'), sortOrder: integer('sort_order').default(0),
  createdAt: created(), updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const messages = pgTable('messages', {
  id: id(), name: text('name').notNull(), email: text('email'), phone: text('phone'), message: text('message').notNull(), isRead: boolean('is_read').default(false), createdAt: created(),
});
export const coupons = pgTable('coupons', {
  id: id(), code: text('code').notNull().unique(), type: text('type').notNull().default('percent'), // percent | flat
  value: integer('value').notNull(), minAmount: integer('min_amount').default(0), maxDiscount: integer('max_discount'), maxUses: integer('max_uses'),
  usedCount: integer('used_count').default(0), expiresAt: timestamp('expires_at'), isActive: boolean('is_active').default(true), createdAt: created(),
});
// A bundle is a product (type 'bundle') that gives access to several other products.
export const bundleItems = pgTable('bundle_items', {
  bundleId: uuid('bundle_id').notNull().references(() => products.id, { onDelete: 'cascade' }), productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.bundleId, t.productId] }) }));
export const refunds = pgTable('refunds', {
  id: id(), orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }), amount: integer('amount').notNull(), txnId: text('txn_id'), createdAt: created(),
});
export const reviews = pgTable('reviews', {
  id: id(), userId: uuid('user_id').references(() => users.id), productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(), comment: text('comment'), createdAt: created(),
});
export const wishlistItems = pgTable('wishlist_items', {
  userId: uuid('user_id').notNull().references(() => users.id), productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.productId] }) }));
export const downloadHistory = pgTable('download_history', {
  id: id(), userId: uuid('user_id').references(() => users.id), productId: uuid('product_id').references(() => products.id), ip: text('ip'), createdAt: created(),
});
