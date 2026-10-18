import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLocalQuotationMode } from '../app/quotation-demo-server.mjs';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { createQuotationAdvisor } from '../app/quotation-advisor.mjs';

// Local judge flow: --catalogue=<private .local catalogue> or --fixture (deterministic test catalogue). Loopback only.
try {
  validateLocalQuotationMode();
  const args = process.argv.slice(2);
  if (args.some(arg => !arg.startsWith('--catalogue=') && !arg.startsWith('--port=') && arg !== '--fixture')
    || new Set(args.map(arg => arg.split('=')[0])).size !== args.length) throw Error();
  const input = args.find(arg => arg.startsWith('--catalogue='))?.slice(12); const fixture = args.includes('--fixture');
  const port = Number(args.find(arg => arg.startsWith('--port='))?.slice(7) ?? 8094);
  if (Boolean(input) === fixture || !Number.isInteger(port) || port < 1024 || port > 65535) throw Error();
  let catalogue;
  if (fixture) catalogue = (await import('../tests/fixtures/altovo-catalogue.mjs')).altovoCatalogueFixture();
  else {
    const root = await realpath(fileURLToPath(new URL('../', import.meta.url))); const local = resolve(root, '.local');
    if (await realpath(local) !== local) throw Error();
    const path = await realpath(resolve(root, input)); const part = relative(local, path);
    if (!part || part === '..' || part.startsWith('..' + sep) || isAbsolute(part)) throw Error();
    catalogue = JSON.parse(await readFile(path, 'utf8'));
  }
  const advisor = await createQuotationAdvisor();
  const server = createBookingDemoServer({ catalogue, advisor });
  server.on('error', () => { console.error('Local booking demo could not start. Check the selected port and catalogue.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Booking demo ready at http://127.0.0.1:${port}/ · ${fixture ? 'test fixture' : 'private catalogue'} · selection only`));
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
} catch { console.error('Use --fixture or a private .local catalogue, in a loopback-only development environment.'); process.exitCode = 1; }
