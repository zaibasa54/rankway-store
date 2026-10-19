import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import routes from './routes/index.js';
import * as seo from './controllers/seo.js';
import * as pre from './controllers/prerender.js';
import { notFound, errorHandler } from './middleware/error.js';

// Refuse to start in production with demo/default settings (protects buyers from going live insecurely).
if (process.env.NODE_ENV === 'production') {
  const weak = (v) => !v || /^change_me/.test(v) || v.length < 24;
  const bad = [weak(process.env.JWT_SECRET) && 'JWT_SECRET (use 24+ random characters)', weak(process.env.DOWNLOAD_SECRET) && 'DOWNLOAD_SECRET (use 24+ random characters)', process.env.DEMO_MODE === 'true' && 'DEMO_MODE must be false (it shows OTPs on screen)'].filter(Boolean);
  if (bad.length) { process.stderr.write(`Unsafe production config:\n - ${bad.join('\n - ')}\n`); process.exit(1); }
  if (process.env.PHONEPE_ENV !== 'production') process.stderr.write('Warning: PHONEPE_ENV is not "production", so payments are sandbox only.\n');
}
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // allow cover images on the frontend origin
// Allow the configured client URL; in development also any localhost / 127.0.0.1 port.
const allowed = (o) => !o || o === process.env.CLIENT_URL?.replace(/\/$/, '') || (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https:'],
    },
  },
}));
app.use(compression());
app.use(express.json());
// Global per-IP limit protects the server from floods; tune max for your traffic.
app.use('/api', rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }));
app.use(morgan('dev'));
app.get('/sitemap.xml', seo.sitemap); app.get('/robots.txt', seo.robots); // point your frontend domain's /sitemap.xml and /robots.txt here (see docs)
// HTML with link-preview tags for crawlers; the frontend's nginx sends bot traffic here (see docs/05-deployment.md)
app.get('/prerender/product/:id', pre.product); app.get('/prerender/blog/:slug', pre.blog); app.get('/prerender/p/:slug', pre.page);
app.use('/api', routes);
// Serve the built frontend (copied into backend/public) and support page refreshes
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^\/(?!api|prerender|sitemap\.xml|robots\.txt).*/, (_req, res) =>
    res.sendFile(path.join(publicDir, 'index.html'))
  );
}
app.use(notFound);
app.use(errorHandler);
app.listen(process.env.PORT || 5000, () => process.stdout.write(`API running on port ${process.env.PORT || 5000}\n`));
