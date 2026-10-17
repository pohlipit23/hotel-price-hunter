import { readFile } from 'node:fs/promises';
import { createBookingDemoServer } from './booking-demo-server.mjs';
import { validateCloudQuotationMode } from './quotation-demo-server.mjs';

try {
  validateCloudQuotationMode(process.env);
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error();
  const snapshot = JSON.parse(await readFile(new URL('../release/booking-demo.json', import.meta.url), 'utf8'));
  const server = createBookingDemoServer({ snapshot, environment: process.env });
  server.on('error', () => { console.error('Booking demo could not start.'); process.exitCode = 1; });
  server.listen(port, '0.0.0.0', () => console.log('Booking demo ready; room confirmation only.'));
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
} catch { console.error('Booking startup refused: verify the customer deployment profile and display snapshot.'); process.exitCode = 1; }
