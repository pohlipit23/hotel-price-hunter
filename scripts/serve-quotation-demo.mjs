import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createQuotationDemoServer, validateLocalQuotationMode } from '../app/quotation-demo-server.mjs';

try {
  validateLocalQuotationMode();
  const args = process.argv.slice(2);
  if (args.some(arg => !arg.startsWith('--snapshot=') && !arg.startsWith('--port=')) || new Set(args.map(arg => arg.split('=')[0])).size !== args.length) throw Error();
  const snapshot = args.find(arg => arg.startsWith('--snapshot='))?.slice(11); const port = Number(args.find(arg => arg.startsWith('--port='))?.slice(7) ?? 8093);
  if (!snapshot || !Number.isInteger(port) || port < 1024 || port > 65535) throw Error();
  const root = await realpath(fileURLToPath(new URL('../', import.meta.url))); const local = resolve(root, '.local');
  if (await realpath(local) !== local) throw Error();
  const path = await realpath(resolve(root, snapshot)); const part = relative(local, path);
  if (!part || part === '..' || part.startsWith('..' + sep) || isAbsolute(part)) throw Error();
  const bundle = JSON.parse(await readFile(path, 'utf8')); const server = createQuotationDemoServer({ bundle });
  server.on('error', () => { console.error('Local quotation demo could not start. Check the selected port and snapshot.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Quotation demo ready at http://127.0.0.1:${port}/ · selection only`));
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
} catch { console.error('Use a private .local snapshot and a loopback-only development environment.'); process.exitCode = 1; }
