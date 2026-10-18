import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateLocalQuotationMode } from '../app/quotation-demo-server.mjs';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { createQuotationAdvisor } from '../app/quotation-advisor.mjs';
import { createBookingStorage, createRoomdropFirestore } from '../app/booking-storage.mjs';
import { createFirestoreSessionStorage } from '../app/quotation-session-storage.mjs';
import { main as importMain } from './import-altovo-catalogue.mjs';

// Local judge flow, loopback only, in one of three modes:
//   --fixture                       deterministic test catalogue, memory state
//   --catalogue=<.local file>       private catalogue file, memory state
//   --emulator=127.0.0.1:PORT --project=demo-... [--seed=PATH [--images=PATH]]
//                                   Firestore emulator only: shared records and judge sessions in the emulator,
//                                   so a restart against the same emulator keeps every judge's setup. Seeding runs
//                                   only through the guarded importer (create-only; a replay is `unchanged`).
// Advice stays unconfigured in emulator mode, so no model is ever called.
const refused = (code, reason) => Object.assign(new Error(code), { code, ...(reason ? { reason } : {}) });
const FLAGS = ['--catalogue=', '--port=', '--emulator=', '--project=', '--seed=', '--images='];
const LOOPBACK = /^(?:localhost|127\.0\.0\.1):\d{1,5}$/;

export async function launch(args = process.argv.slice(2), { env = process.env, prefix = 'roomdrop', createFirestore = createRoomdropFirestore,
  importCatalogue = importMain, root = fileURLToPath(new URL('../', import.meta.url)) } = {}) {
  if (args.some(arg => arg !== '--fixture' && !FLAGS.some(flag => arg.startsWith(flag)))
    || new Set(args.map(arg => arg.split('=')[0])).size !== args.length) throw refused('LAUNCH_ARGUMENTS_INVALID');
  const value = flag => args.find(arg => arg.startsWith(flag))?.slice(flag.length);
  const input = value('--catalogue='); const fixture = args.includes('--fixture');
  const emulator = value('--emulator='); const project = value('--project='); const seed = value('--seed='); const images = value('--images=');
  const port = Number(value('--port=') ?? 8094);
  const emulatorMode = emulator !== undefined || project !== undefined;
  if ([Boolean(input), fixture, emulatorMode].filter(Boolean).length !== 1 || (!Number.isInteger(port) || (port !== 0 && (port < 1024 || port > 65535)))
    || (emulatorMode && (emulator === undefined || project === undefined)) || (!emulatorMode && (seed !== undefined || images !== undefined))
    || (images !== undefined && seed === undefined)) throw refused('LAUNCH_ARGUMENTS_INVALID');
  try { validateLocalQuotationMode(env); } catch { throw refused('LOCAL_MODE_REQUIRED'); }

  let options; let firestore = null; let seeded = null;
  if (emulatorMode) {
    if (!LOOPBACK.test(emulator) || !/^demo-[a-z0-9-]{1,40}$/.test(project) || (env.FIRESTORE_EMULATOR_HOST && env.FIRESTORE_EMULATOR_HOST !== emulator)) throw refused('EMULATOR_REQUIRED');
    if (seed !== undefined) {
      seeded = await importCatalogue(['--catalogue=' + seed, ...(images === undefined ? [] : ['--images=' + images]), '--execute',
        '--project=' + project, '--database=(default)', '--emulator=' + emulator], { env, prefix });
      if (seeded.status !== 'imported') throw refused('SEED_REFUSED', seeded.reason ?? 'CATALOGUE_IMPORT_FAILED');
    }
    firestore = await createFirestore({ GOOGLE_CLOUD_PROJECT: project, FIRESTORE_EMULATOR_HOST: emulator });
    options = { bookingStorage: createBookingStorage({ firestore, prefix }), sessionStorage: createFirestoreSessionStorage({ firestore, prefix }),
      advisor: await createQuotationAdvisor({ environment: {} }) };
  } else {
    let catalogue;
    if (fixture) catalogue = (await import('../tests/fixtures/altovo-catalogue.mjs')).altovoCatalogueFixture();
    else {
      const workspace = await realpath(root); const local = resolve(workspace, '.local');
      if (await realpath(local) !== local) throw refused('LAUNCH_ARGUMENTS_INVALID');
      const path = await realpath(resolve(workspace, input)); const part = relative(local, path);
      if (!part || part === '..' || part.startsWith('..' + sep) || isAbsolute(part)) throw refused('LAUNCH_ARGUMENTS_INVALID');
      catalogue = JSON.parse(await readFile(path, 'utf8'));
    }
    options = { catalogue, advisor: await createQuotationAdvisor({ environment: env }) };
  }
  const server = createBookingDemoServer(options);
  try { await new Promise((ready, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ready); }); }
  catch (error) { await firestore?.terminate(); throw error; }
  let closed = null;
  const close = () => closed ??= new Promise(done => { server.closeAllConnections(); server.close(done); }).then(() => firestore?.terminate());
  return { server, origin: `http://127.0.0.1:${server.address().port}`, mode: emulatorMode ? 'emulator' : fixture ? 'fixture' : 'catalogue',
    seed: seeded && { status: seeded.status, entries: seeded.entries.map(({ code, result }) => ({ code, result })) }, close };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const app = await launch();
    if (app.seed) console.log('Seeded through the guarded importer: ' + app.seed.entries.map(entry => `${entry.code} ${entry.result}`).join(', '));
    console.log(`Booking demo ready at ${app.origin}/ · ${{ emulator: 'Firestore emulator', fixture: 'test fixture', catalogue: 'private catalogue' }[app.mode]} · selection only`);
    const stop = () => app.close();
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } catch (error) {
    console.error(`Use --fixture, a private .local catalogue, or --emulator=127.0.0.1:PORT --project=demo-... [--seed=PATH [--images=PATH]], in a loopback-only development environment. (${error.code ?? 'START_FAILED'}${error.reason ? ' ' + error.reason : ''})`);
    process.exitCode = 1;
  }
}
