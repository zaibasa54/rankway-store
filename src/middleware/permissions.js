import { ApiError } from '../utils/respond.js';
// Staff accounts only get the sections an admin ticks for them. The admin can do everything.
export const PERMS = ['products', 'categories', 'orders', 'students', 'reviews', 'coupons', 'blog', 'pages', 'messages', 'reports', 'settings'];
export const isStaff = (req, _res, next) => (['admin', 'staff'].includes(req.user?.role) ? next() : next(new ApiError(403, 'Staff access only')));
export const can = (perm) => (req, _res, next) => (req.user?.role === 'admin' || req.user?.permissions?.includes(perm) ? next() : next(new ApiError(403, "You don't have permission for this section")));
