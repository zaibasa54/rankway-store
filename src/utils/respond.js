// Unified API response: { success, message, data }
export const ok = (res, data = null, message = 'OK', code = 200) => res.status(code).json({ success: true, message, data });
export class ApiError extends Error { constructor(code, message) { super(message); this.code = code; } }
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
