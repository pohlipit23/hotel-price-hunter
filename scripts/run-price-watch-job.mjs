import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createStorage } from '../app/storage.mjs';
import { runPriceWatchPass } from '../app/price-watch-pass.mjs';

export function validateJobEnvironment(environment, args) {
  if (args.length || environment.NODE_ENV !== 'production' || environment.GOOGLE_CLOUD_PROJECT !== 'sincere-apex-511418-p0'
    || environment.CLOUD_RUN_JOB !== 'roomdrop-price-watch' || environment.PRICE_WATCH_JOB_ENABLED !== 'true'
    || environment.PRICE_WATCH_PROVIDER_MODE !== 'simulated-fixture' || environment.K_SERVICE || environment.K_REVISION
    || environment.FIRESTORE_EMULATOR_HOST || environment.GOOGLE_APPLICATION_CREDENTIALS || environment.PRICE_WATCH_FIXTURE_OUTCOME
    || (environment.STORAGE_MODE && environment.STORAGE_MODE !== 'firestore')
    || Object.entries(environment).some(([key, value]) => value && /(?:GEMINI|VERTEX|OPENAI|ANTHROPIC|MODEL|API_KEY|CREDENTIAL_FILE)/i.test(key))) {
    const error = new Error('Price-watch job activation denied.'); error.code = 'CONFIGURATION_DENIED'; throw error;
  }
}
const countsFor = results => {
  const counts = { recorded: 0, replayed: 0, offersFound: 0, noSaving: 0, failed: 0, skipped: 0, capacity: 0 };
  for (const result of results) {
    if (result.reasonCodes?.includes('WATCH_CAPACITY_REACHED')) { counts.capacity++; continue; }
    counts[result.replayed ? 'replayed' : 'recorded']++;
    const key = { 'offers-found': 'offersFound', 'no-saving': 'noSaving', failed: 'failed', skipped: 'skipped' }[result.status];
    if (key) counts[key]++;
  }
  return counts;
};

/** Injected dependencies are for local tests; the executable always creates Firestore. */
export async function runPriceWatchJob({ storage, fixture, now = () => new Date(), provider,
  shouldStop = () => false, monotonic = () => performance.now() } = {}) {
  const started = monotonic();
  const stopReason = () => shouldStop() ? 'INTERRUPTED' : monotonic() - started >= 270000 ? 'TIME_LIMIT' : null;
  let checkpoint;
  try { checkpoint = await storage.getWatchCheckpoint(); }
  catch { return { ok: false, stage: 'watch-job-failed', reason: 'CHECKPOINT_UNAVAILABLE', pages: 0, examined: 0, counts: countsFor([]) }; }
  const pass = await runPriceWatchPass({ storage, fixture, now, provider, after: checkpoint.after, stopReason,
    onPageCompleted: async after => { checkpoint = await storage.compareAndSetWatchCheckpoint({ revision: checkpoint.revision, after }); } });
  return { ok: pass.ok, stage: pass.ok ? 'watch-job-completed' : 'watch-job-failed', reason: pass.reason,
    pages: pass.pages, examined: pass.examined, counts: countsFor(pass.results) };
}

export async function startPriceWatchJob(environment = process.env, args = process.argv.slice(2),
  { storageFactory = createStorage, fixture, now, monotonic, signals = process, log = value => console.log(JSON.stringify(value)) } = {}) {
  validateJobEnvironment(environment, args);
  let storage; let stopped = false; let result;
  const stop = () => { stopped = true; };
  signals.once('SIGTERM', stop); signals.once('SIGINT', stop);
  try {
    storage = await storageFactory(environment);
    const source = fixture ?? JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8'));
    result = await runPriceWatchJob({ storage, fixture: source, now, monotonic, shouldStop: () => stopped });
  } catch {
    result = { ok: false, stage: 'watch-job-failed', reason: 'STORAGE_UNAVAILABLE', pages: 0, examined: 0, counts: countsFor([]) };
  } finally {
    try { if (storage) await storage.close(); }
    catch { result = { ...result, ok: false, stage: 'watch-job-failed', reason: 'STORAGE_CLOSE_FAILED' }; }
    signals.removeListener('SIGTERM', stop); signals.removeListener('SIGINT', stop);
  }
  log(result);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startPriceWatchJob().then(result => { if (!result.ok) process.exitCode = 1; }).catch(() => {
    console.error(JSON.stringify({ ok: false, stage: 'watch-job-denied', reason: 'CONFIGURATION_DENIED' })); process.exitCode = 1;
  });
}
