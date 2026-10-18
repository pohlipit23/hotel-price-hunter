import { readFile } from 'node:fs/promises';
import { createQuotationDemoServer, createHostedQuotationDemoServer } from './quotation-demo-server.mjs';

const assets = new Map([
  ['/', ['booking.html', 'text/html']], ['/booking.js', ['booking.js', 'text/javascript']],
  ['/booking-live.js', ['booking-live.js', 'text/javascript']], ['/booking-live-data.js', ['booking-live-data.js', 'text/javascript']],
  ['/drop-eligibility.js', ['drop-eligibility.js', 'text/javascript']],
  ['/booking.css', ['booking.css', 'text/css']], ['/pricing.js', ['pricing.js', 'text/javascript']],
  ['/watch.js', ['watch.js', 'text/javascript']], ['/stay-photos.js', ['stay-photos.js', 'text/javascript']],
  ['/stay-advice.js', ['stay-advice.js', 'text/javascript']], ['/stay-advice.css', ['stay-advice.css', 'text/css']],
  ['/assets/roomdrop-logo.png', ['assets/roomdrop-logo.png', 'image/png']],
  ['/assets/roomdrop-key-icon.png', ['assets/roomdrop-key-icon.png', 'image/png']],
  ['/assets/illustrative-stays.jpg', ['assets/illustrative-stays.jpg', 'image/jpeg']],
]);
export function createBookingDemoServer({ bundle, snapshot, environment, now, advisor } = {}) {
  const server = environment ? createHostedQuotationDemoServer({ snapshot, environment, now, advisor }) : createQuotationDemoServer({ bundle, now, advisor });
  const delegate = server.listeners('request')[0];
  server.removeListener('request', delegate);
  server.on('request', async (req, res) => {
    const api = { '/api/booking-demo': '/api/quotation-demo', '/api/booking-demo/confirm': '/api/quotation-demo/confirm', '/api/booking-demo/advice': '/api/quotation-demo/advice', '/api/booking-demo/chat': '/api/quotation-demo/chat' };
    if (Object.hasOwn(api, req.url)) { req.url = api[req.url]; return delegate(req, res); }
    if (req.url === '/health' || req.url === '/healthz') return delegate(req, res);
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (environment) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const port = server.address()?.port;
    const validHost = environment ? req.headers.host === new URL(environment.APP_ORIGIN).host
      : ['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && [`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host);
    if (!validHost) { res.writeHead(403); return res.end('Booking unavailable.'); }
    if (req.method !== 'GET' || !assets.has(req.url)) { res.writeHead(404); return res.end('Page unavailable.'); }
    try {
      const [path, type] = assets.get(req.url);
      let content = await readFile(new URL('./public/' + path, import.meta.url));
      if (req.url === '/') content = content.toString().replace('<body>', '<body data-live-booking="true">').replace('Fictional demo', 'Booking demo')
        .replace('</head>', '<link rel="stylesheet" href="/stay-advice.css"></head>')
        .replace(/\s*<link[^>]+https:\/\/fonts\.[^>]+>/g, '');
      res.writeHead(200, { 'Content-Type': type + (type.startsWith('text/') ? '; charset=utf-8' : '') }); res.end(content);
    } catch { res.writeHead(503); res.end('Booking unavailable. Please reload.'); }
  });
  return server;
}
