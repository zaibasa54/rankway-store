import { ZodError } from 'zod';
export const notFound = (req, res) => res.status(404).json({ success: false, message: 'Route not found', data: null });
// Only trust numeric HTTP codes: library errors use string codes (axios 'ERR_BAD_REQUEST', Postgres '23505').
export const errorHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) return res.status(422).json({ success: false, message: err.errors[0].message, data: err.errors });
  const pg = err.code ?? err.cause?.code;
  if (pg === '23505') return res.status(409).json({ success: false, message: 'That already exists', data: null });
  if (pg === '23503') return res.status(409).json({ success: false, message: 'It is still in use by other records', data: null });
  const code = Number.isInteger(err.code) && err.code >= 400 && err.code < 600 ? err.code : 500;
  if (code === 500) process.stderr.write(`${err.stack || err}\n`);
  res.status(code).json({ success: false, message: err.message || 'Server error', data: null });
};
