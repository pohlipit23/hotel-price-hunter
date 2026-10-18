import { readFile } from 'node:fs/promises';
import { createHostedQuotationDemoServer, validateCloudQuotationMode } from './quotation-demo-server.mjs';
import { createQuotationAdvisor } from './quotation-advisor.mjs';

try {
  validateCloudQuotationMode(process.env);
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error();
  const snapshot = JSON.parse(await readFile(new URL('../release/quotation-demo.json', import.meta.url), 'utf8'));
  const advisor = await createQuotationAdvisor();
  const server = createHostedQuotationDemoServer({ snapshot, advisor });
  server.on('error', () => { console.error('Hosted quotation demo could not start.'); process.exitCode = 1; });
  server.listen(port, '0.0.0.0', () => console.log(`Quotation demo ready; selection-only captured source; Gemini ${advisor.status}.`));
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
} catch { console.error('Hosted quotation startup refused: verify private customer profile and packaged snapshot.'); process.exitCode = 1; }
