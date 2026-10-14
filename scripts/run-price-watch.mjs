import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStorage } from '../app/storage.mjs';
import { checkPriceWatch, prepareWatchDigests, watchAliases, fixtureWatchProvider } from '../app/domain/price-watch.mjs';

export function validateWorkerEnvironment(environment, args) {
  if (environment.K_SERVICE || environment.NODE_ENV === 'production') throw new Error('Local watch worker prohibits production.');
  if (!/^demo-[a-z0-9-]+$/.test(environment.GOOGLE_CLOUD_PROJECT ?? '') || !/^(localhost|127\.0\.0\.1):\d{1,5}$/.test(environment.FIRESTORE_EMULATOR_HOST ?? '')) throw new Error('Local watch worker requires an explicit demo project and loopback Firestore emulator.');
  if (args.length !== 1 || !['--once', '--loop'].includes(args[0])) throw new Error('Select exactly --once or --loop.');
  const scenario = environment.PRICE_WATCH_FIXTURE_OUTCOME ?? 'offers-found';
  if (!['offers-found', 'no-saving', 'failed'].includes(scenario)) throw new Error('Use an allowlisted local watch fixture outcome.');
  return { loop: args[0] === '--loop', provider: input => {
    const source = fixtureWatchProvider(input);
    if (source.status !== 'complete' || scenario === 'offers-found') return source;
    return scenario === 'no-saving' ? { status: 'complete', offers: [] } : { status: 'failed', reason: 'PROVIDER_FAILED' };
  } };
}

/** A bounded private discovery pass. Its cursor never crosses the HTTP/log boundary. */
export async function runPriceWatchPass({ storage, fixture, now = () => new Date(), provider = fixtureWatchProvider, after = null } = {}) {
  let cursor = after; let pages = 0; let examined = 0; const results = []; const recordedAt = now().toISOString();
  while (pages++ < 10) {
    const entries = await storage.listWatches({ limit: 50, after: cursor });
    if (!entries.length) { cursor = null; break; }
    for (const entry of entries) {
      examined++;
      cursor = entry.watchId;
      const captured = entry.state;
      if (!captured || !captured.priceWatch?.enabled || captured.priceWatch.watchId !== entry.watchId || Date.parse(captured.expiresAt) <= Date.parse(recordedAt)) continue;
      const aliases = watchAliases();
      const expected = { ...structuredClone(captured.priceWatch), bookingVersion: captured.booking.version };
      let result;
      try {
        await storage.update(entry.visitorId, current => {
          result = checkPriceWatch(current, { expected, expectedPreferenceVersion: captured.preferences.version, expectedBooking: captured.booking, expectedPreferences: captured.preferences, fixture, recordedAt, aliases, provider, now });
          return prepareWatchDigests(result.state, { recordedAt: now().toISOString(), aliases });
        });
        results.push({ runId: result.run.runId, status: result.run.status, reasonCodes: result.run.reasonCodes, replayed: result.replayed });
      } catch (error) {
        results.push({ status: 'failed', reasonCodes: [error.code === 'WATCH_CAPACITY_REACHED' ? error.code : 'STORAGE_UNAVAILABLE'] });
      }
    }
    if (entries.length < 50) { cursor = null; break; }
  }
  return { after: cursor, examined, results };
}

export async function startPriceWatchWorker(environment = process.env, args = process.argv.slice(2)) {
  const options = validateWorkerEnvironment(environment, args);
  const storage = await createStorage(environment);
  const fixture = JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8'));
  let stopped = false; let timer; let wake; let after = null;
  const stop = () => { stopped = true; clearTimeout(timer); wake?.(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    do {
      const pass = await runPriceWatchPass({ storage, fixture, provider: options.provider, after });
      after = pass.after;
      console.log(JSON.stringify({ stage: 'watch-pass-completed', examined: pass.examined, results: pass.results }));
      if (!options.loop || stopped) break;
      await new Promise(resolveWait => { wake = resolveWait; timer = setTimeout(resolveWait, 60000); });
      wake = null;
    } while (!stopped);
  } finally {
    clearTimeout(timer); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); await storage.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startPriceWatchWorker().catch(() => { console.error('Local watch worker failed. Check its explicit emulator/demo configuration.'); process.exitCode = 1; });
}
