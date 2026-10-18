import { readFile } from 'node:fs/promises';
import { createBookingDemoServer } from './booking-demo-server.mjs';
import { validateCloudQuotationMode } from './quotation-demo-server.mjs';
import { createQuotationAdvisor } from './quotation-advisor.mjs';

// The judge catalogue wins when packaged; otherwise the single display snapshot is served as before.
async function releaseData() {
  const read = name => readFile(new URL('../release/' + name, import.meta.url), 'utf8');
  try { return { catalogue: JSON.parse(await read('booking-catalogue.json')) }; }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  return { snapshot: JSON.parse(await read('booking-demo.json')) };
}
try {
  validateCloudQuotationMode(process.env);
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error();
  const data = await releaseData();
  const advisor = await createQuotationAdvisor();
  const server = createBookingDemoServer({ ...data, environment: process.env, advisor });
  server.on('error', () => { console.error('Booking demo could not start.'); process.exitCode = 1; });
  server.listen(port, '0.0.0.0', () => console.log('Booking demo ready; room confirmation only.'));
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
} catch { console.error('Booking startup refused: verify the customer deployment profile and display snapshot.'); process.exitCode = 1; }
