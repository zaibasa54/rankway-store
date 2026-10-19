// Minimal HTML for link previews and crawlers (WhatsApp, Facebook, Google...). Real visitors are sent on to the app.
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function pageHtml({ title, description = '', image, url, type = 'website', siteName = '', body = '' }) {
  const d = esc(description.slice(0, 200));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="description" content="${d}"><link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="${esc(type)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${d}"><meta property="og:url" content="${esc(url)}">
${siteName ? `<meta property="og:site_name" content="${esc(siteName)}">` : ''}${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<script>if(!/bot|crawl|spider|facebookexternalhit|whatsapp|telegram|slack|twitter|linkedin|discord/i.test(navigator.userAgent))location.replace(${JSON.stringify(url).replace(/</g, '\\u003c')})</script></head>
<body><h1>${esc(title)}</h1><p>${esc(body.slice(0, 600))}</p><p><a href="${esc(url)}">Open</a></p></body></html>`;
}
