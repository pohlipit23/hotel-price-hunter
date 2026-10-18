import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBookingDemoServer } from './booking-demo-server.mjs';
import { validateCloudQuotationMode } from './quotation-demo-server.mjs';
import { createQuotationAdvisor } from './quotation-advisor.mjs';

export function validateCatalogueManifest(manifest) {
  if (!manifest || Object.keys(manifest).sort().join() !== 'entries,schemaVersion' || manifest.schemaVersion !== 1
    || !Array.isArray(manifest.entries) || !manifest.entries.length || manifest.entries.length > 20
    || new Set(manifest.entries.map(entry => entry?.code)).size !== manifest.entries.length
    || manifest.entries.some(entry => !entry || Object.keys(entry).sort().join() !== 'code,contentVersion,dropSetVersion'
      || !/^[A-Z0-9]{4,20}$/.test(entry.code) || !/^[a-zA-Z0-9._:-]{1,128}$/.test(entry.contentVersion ?? '')
      || !/^[a-zA-Z0-9._:-]{1,128}$/.test(entry.dropSetVersion ?? ''))) throw Error('CATALOGUE_MANIFEST_INVALID');
  return manifest;
}
async function createStores(environment) {
  // Part 1 owns these factories. Never fall back if they or Firestore are unavailable.
  const [{ Firestore }, { createBookingStorage }, { createFirestoreSessionStorage }] = await Promise.all([
    import('@google-cloud/firestore'), import('./booking-storage.mjs'), import('./quotation-session-storage.mjs'),
  ]);
  const firestore = new Firestore({ projectId: environment.GOOGLE_CLOUD_PROJECT });
  try {
    return { bookingStorage: createBookingStorage({ firestore }), sessionStorage: createFirestoreSessionStorage({ firestore }),
      close: () => firestore.terminate() };
  } catch (failure) { await firestore.terminate(); throw failure; }
}
async function loadCatalogue(bookingStorage) {
  const { loadHostedCatalogue } = await import('./booking-storage.mjs');
  const manifest = validateCatalogueManifest(JSON.parse(await readFile(new URL('../release/booking-catalogue-manifest.json', import.meta.url), 'utf8')));
  const loaded = await loadHostedCatalogue(bookingStorage);
  if (!Array.isArray(loaded?.entries) || loaded.entries.length !== manifest.entries.length) throw Error('CATALOGUE_UNAVAILABLE');
  const entries = manifest.entries.map(pin => {
    const entry = loaded.entries.find(entry => entry.code === pin.code);
    if (!entry || entry.contentVersion !== pin.contentVersion || entry.dropSetVersion !== pin.dropSetVersion) throw Error('CATALOGUE_UNAVAILABLE');
    return entry;
  });
  return { entries };
}
const listenOn = (server, port) => new Promise((resolve, reject) => {
  server.once('error', reject); server.listen(port, '0.0.0.0', () => { server.removeListener('error', reject); resolve(); });
});
export async function startHostedDemo({ environment = process.env, signals = process, storesFactory = createStores,
  catalogueLoader = loadCatalogue, advisorFactory = createQuotationAdvisor, serverFactory = createBookingDemoServer,
  listen = listenOn, log = console.log } = {}) {
  validateCloudQuotationMode(environment);
  const port = Number(environment.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('INVALID_PORT');
  let stores, server, stopping;
  const stop = () => stopping ??= (async () => {
    signals.removeListener('SIGTERM', onSignal); signals.removeListener('SIGINT', onSignal);
    try {
      if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    } finally { await stores?.close(); }
  })();
  const onSignal = () => { void stop().catch(() => log('RoomDrop shutdown: storage unavailable.')); };
  try {
    stores = await storesFactory(environment);
    if (!stores?.bookingStorage || !stores.sessionStorage || typeof stores.close !== 'function') throw Error('DURABLE_STORAGE_REQUIRED');
    const catalogue = await catalogueLoader(stores.bookingStorage);
    if (!Array.isArray(catalogue?.entries) || !catalogue.entries.length || catalogue.entries.length > 20) throw Error('CATALOGUE_UNAVAILABLE');
    const advisor = await advisorFactory({ environment });
    server = serverFactory({ catalogue, sessionStorage: stores.sessionStorage, bookingStorage: stores.bookingStorage, environment, advisor });
    await listen(server, port);
    server.on('error', () => { log('RoomDrop runtime stopped: service unavailable.'); onSignal(); });
    signals.once('SIGTERM', onSignal); signals.once('SIGINT', onSignal);
    log('RoomDrop ready; captured replay and selection only.');
    return { server, stop };
  } catch (failure) { await stop(); throw failure; }
}
export async function runHostedDemo(options) {
  try { return await startHostedDemo(options); }
  catch { console.error('RoomDrop startup refused: verify the customer profile, catalogue manifest and durable storage.'); process.exitCode = 1; }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await runHostedDemo();
