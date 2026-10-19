// Tiny in-memory response cache for PUBLIC GET endpoints. Absorbs traffic spikes so the database isn't hit on every visit.
// The admin panel clears it whenever content changes (see routes), so edits show up immediately.
const store = new Map();
export const clearCache = () => store.clear();
export const cache = (ttl = 30) => (req, res, next) => {
  if (req.method !== 'GET') return next();
  const key = req.originalUrl, hit = store.get(key);
  if (hit && hit.exp > Date.now()) return res.set('X-Cache', 'HIT').status(200).type('json').send(hit.body);
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 200) {
      store.set(key, { exp: Date.now() + ttl * 1000, body: JSON.stringify(body) });
      if (store.size > 500) store.delete(store.keys().next().value); // cap memory
      res.set('Cache-Control', `public, max-age=${Math.min(ttl, 10)}`);
    }
    return json(body);
  };
  next();
};
