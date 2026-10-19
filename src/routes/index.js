import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { isAuthenticated, isAdmin, validate } from '../middleware/auth.js';
import { isStaff, can } from '../middleware/permissions.js';
import * as staff from '../controllers/staff.js';
import * as auth from '../controllers/auth.js';
import * as cat from '../controllers/catalog.js';
import * as ord from '../controllers/orders.js';
import * as dl from '../controllers/downloads.js';
import * as usr from '../controllers/user.js';
import * as adm from '../controllers/admin.js';
import * as blog from '../controllers/blog.js';
import * as rev from '../controllers/reviews.js';
import * as cms from '../controllers/cms.js';
import * as cp from '../controllers/coupons.js';
import * as inv from '../controllers/invoice.js';
import * as rep from '../controllers/reports.js';
import { settingsSchema } from '../services/site.js';
import { cache, clearCache } from '../utils/cache.js';
import { upload } from '../services/storage.js';

const r = Router();
r.get('/health', (_q, res) => res.json({ success: true, message: 'OK', data: { status: 'up', time: new Date() } })); // for uptime monitors / load balancers
const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: { success: false, message: 'Too many OTP requests', data: null } });

r.post('/auth/send-otp', otpLimiter, validate(auth.phoneSchema), auth.sendOtp);
r.post('/auth/verify-otp', validate(auth.verifySchema), auth.verifyOtp);
r.post('/auth/logout', isAuthenticated, auth.logout);
r.get('/auth/me', isAuthenticated, auth.me);

r.get('/blog', cache(30), blog.list); r.get('/blog/:slug', cache(30), blog.one);
r.get('/site', cache(60), cms.site); r.get('/pages/:slug', cache(60), cms.page);
r.post('/contact', rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: { success: false, message: 'Too many messages, try later', data: null } }), validate(cms.contactSchema), cms.contact);
r.get('/files/cover/:id', cat.cover); r.get('/products/:id/reviews', rev.list); r.post('/products/:id/reviews', isAuthenticated, validate(rev.reviewSchema), rev.save);
r.get('/products', cache(30), cat.list); r.get('/products/:id/also-bought', cache(60), cat.alsoBought); r.get('/products/:id', cache(30), cat.one); r.get('/categories', cache(60), cat.categoryList);

r.post('/orders', isAuthenticated, validate(ord.createSchema), ord.createOrder);
r.get('/orders/verify/:txn', isAuthenticated, ord.verifyPayment);
r.post('/coupons/quote', isAuthenticated, validate(ord.quoteSchema), ord.quote);
r.post('/orders/phonepe-callback', ord.callback);
r.get('/me/orders', isAuthenticated, usr.myOrders);
r.get('/me/orders/:id/invoice', isAuthenticated, inv.mine);
r.get('/me/downloads', isAuthenticated, usr.myDownloads);
r.get('/me/wishlist', isAuthenticated, usr.wishlist);
r.post('/me/wishlist/:id', isAuthenticated, usr.toggleWish);
r.get('/downloads/:id/link', isAuthenticated, dl.getLink);
r.get('/downloads/:id/sample', isAuthenticated, dl.sampleLink);
r.get('/downloads/file', dl.stream);

const a = Router(); a.use(isAuthenticated, isStaff);
// Each admin section needs its own permission (the admin has all; staff get what the admin ticks). /stats is open to all staff.
Object.entries({ products: 'products', categories: 'categories', orders: 'orders', users: 'students', reviews: 'reviews', coupons: 'coupons', blog: 'blog', pages: 'pages', messages: 'messages', reports: 'reports', settings: 'settings' }).forEach(([path, perm]) => a.use(`/${path}`, can(perm)));
a.use('/staff', isAdmin);
a.get('/staff', staff.list); a.post('/staff', validate(staff.staffSchema), staff.create); a.put('/staff/:id', validate(staff.staffSchema), staff.update); a.delete('/staff/:id', staff.remove);
a.use((req, res, next) => { if (req.method !== 'GET') res.on('finish', clearCache); next(); }); // content changed -> drop cached public pages
a.get('/settings', cms.adminSettings); a.put('/settings', validate(settingsSchema), cms.saveSite); a.post('/settings/logo', upload, cms.setLogo); a.delete('/settings/logo', cms.removeLogo);
a.get('/pages', cms.adminPages); a.post('/pages', validate(cms.pageSchema), cms.createPage); a.put('/pages/:id', validate(cms.pageSchema), cms.updatePage); a.delete('/pages/:id', cms.deletePage);
a.get('/reports', rep.summary); a.get('/reports/orders.csv', rep.exportCsv);
a.get('/coupons', cp.list); a.post('/coupons', validate(cp.couponSchema), cp.create); a.put('/coupons/:id', validate(cp.couponSchema), cp.update); a.delete('/coupons/:id', cp.remove);
a.get('/messages', cms.adminMessages); a.patch('/messages/:id', cms.markRead); a.delete('/messages/:id', cms.removeMessage);
a.get('/stats', adm.stats); a.get('/products', adm.listProducts); a.get('/orders/:id', adm.orderDetail); a.post('/orders/:id/refund', isAdmin, validate(adm.refundSchema), adm.refundOrder); a.get('/orders/:id/invoice', inv.admin); a.patch('/users/:id', adm.setUserBlocked); a.get('/reviews', rev.adminList); a.get('/orders', adm.listOrders); a.patch('/orders/:id', adm.setOrderStatus); a.get('/users', adm.listUsers);
a.post('/products', upload, adm.createProduct); a.put('/products/:id', upload, adm.updateProduct); a.delete('/products/:id', adm.deleteProduct);
a.get('/blog', blog.adminList); a.post('/blog', upload, blog.create); a.put('/blog/:id', upload, blog.update); a.delete('/blog/:id', blog.remove);
a.delete('/reviews/:id', rev.adminRemove);
a.post('/categories', adm.createCategory); a.delete('/categories/:id', adm.deleteCategory);
r.use('/admin', a);
export default r;
