import { readFile } from 'node:fs/promises';
import { createQuotationDemoServer, createHostedQuotationDemoServer } from './quotation-demo-server.mjs';

const assets = new Map([
  ['/', ['booking.html', 'text/html']], ['/booking.js', ['booking.js', 'text/javascript']],
  ['/booking-live.js', ['booking-live.js', 'text/javascript']], ['/booking-live-data.js', ['booking-live-data.js', 'text/javascript']],
  ['/booking-judge.js', ['booking-judge.js', 'text/javascript']], ['/drop-watch.js', ['drop-watch.js', 'text/javascript']],
  ['/drop-eligibility.js', ['drop-eligibility.js', 'text/javascript']],
  ['/booking.css', ['booking.css', 'text/css']], ['/pricing.js', ['pricing.js', 'text/javascript']],
  ['/watch.js', ['watch.js', 'text/javascript']], ['/stay-photos.js', ['stay-photos.js', 'text/javascript']],
  ['/stay-advice.js', ['stay-advice.js', 'text/javascript']], ['/stay-advice.css', ['stay-advice.css', 'text/css']],
  ['/assets/roomdrop-logo.png', ['assets/roomdrop-logo.png', 'image/png']],
  ['/assets/roomdrop-key-icon.png', ['assets/roomdrop-key-icon.png', 'image/png']],
  ['/assets/illustrative-stays.jpg', ['assets/illustrative-stays.jpg', 'image/jpeg']],
  // Reviewed S0.5 catalogue photos: hotel photos for every card, booked-room photos where one was approved.
  ...['179-hotel', '180-hotel', '181-hotel', '181-room', '182-hotel', '182-room', '183-hotel', '184-hotel']
    .map(name => [`/assets/roomdrop-airb000${name}.jpg`, [`assets/roomdrop-airb000${name}.jpg`, 'image/jpeg']]),
]);
// Booking API paths map one to one onto the quotation API; query strings never match and stay unavailable.
const bookingApi = /^\/api\/booking-demo(\/(?:confirm|advice|chat|catalogue|q\/[A-Z0-9]{4,20}(?:\/(?:watch|confirm|advice|chat))?))?$/;
export function createBookingDemoServer({ bundle, snapshot, catalogue, reviewedCatalogue, environment, now, advisor, sessionStorage, bookingStorage } = {}) {
  const server = environment ? createHostedQuotationDemoServer({ snapshot, catalogue, reviewedCatalogue, environment, now, advisor, sessionStorage, bookingStorage })
    : createQuotationDemoServer({ bundle, catalogue, reviewedCatalogue, now, advisor, sessionStorage, bookingStorage });
  const mode = catalogue || bookingStorage ? 'catalogue' : 'single';
  const delegate = server.listeners('request')[0];
  server.removeListener('request', delegate);
  server.on('request', async (req, res) => {
    const api = bookingApi.exec(req.url);
    if (api) { req.url = '/api/quotation-demo' + (api[1] ?? ''); return delegate(req, res); }
    if (req.url === '/health' || req.url === '/healthz') return delegate(req, res);
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
    // frame-src: only the demo video on the judge closeout (privacy-enhanced YouTube embed).
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (environment) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const port = server.address()?.port;
    const validHost = environment ? req.headers.host === new URL(environment.APP_ORIGIN).host
      : ['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && [`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host);
    if (!validHost) { res.writeHead(403); return res.end('Booking unavailable.'); }
    if (req.method !== 'GET' || !assets.has(req.url)) { res.writeHead(404); return res.end('Page unavailable.'); }
    try {
      const [path, type] = assets.get(req.url);
      let content = await readFile(new URL('./public/' + path, import.meta.url));
      if (req.url === '/') content = content.toString().replace('<body>', `<body data-live-booking="true" data-booking-mode="${mode}">`).replace('Fictional demo', 'Booking demo')
        .replace('</head>', '<link rel="stylesheet" href="/stay-advice.css"></head>')
        .replace(/\s*<link[^>]+https:\/\/fonts\.[^>]+>/g, '');
      res.writeHead(200, { 'Content-Type': type + (type.startsWith('text/') ? '; charset=utf-8' : '') }); res.end(content);
    } catch { res.writeHead(503); res.end('Booking unavailable. Please reload.'); }
  });
  return server;
}
