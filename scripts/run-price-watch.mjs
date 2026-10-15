import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStorage } from '../app/storage.mjs';
import { fixtureWatchProvider } from '../app/domain/price-watch.mjs';
import { runPriceWatchPass } from '../app/price-watch-pass.mjs';
export { runPriceWatchPass } from '../app/price-watch-pass.mjs';

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

export async function startPriceWatchWorker(environment = process.env, args = process.argv.slice(2),
  { storageFactory = createStorage, fixture: injectedFixture, now, signals = process, log = value => console.log(JSON.stringify(value)) } = {}) {
  const options = validateWorkerEnvironment(environment, args);
  const storage = await storageFactory(environment);
  let stopped = false; let timer; let wake; let after = null;
  const stop = () => { stopped = true; clearTimeout(timer); wake?.(); };
  signals.once('SIGINT', stop); signals.once('SIGTERM', stop);
  try {
    const fixture = injectedFixture ?? JSON.parse(await readFile(new URL('../fixtures/jury-booking.json', import.meta.url), 'utf8'));
    do {
      const pass = await runPriceWatchPass({ storage, fixture, provider: options.provider, after, now, stopReason: () => stopped ? 'INTERRUPTED' : null });
      after = pass.after;
      log({ stage: pass.ok ? 'watch-pass-completed' : 'watch-pass-failed', reason: pass.reason, examined: pass.examined, results: pass.results });
      if (!pass.ok && !options.loop) throw new Error('Local watch pass failed.');
      if (!options.loop || stopped) break;
      await new Promise(resolveWait => { wake = resolveWait; timer = setTimeout(resolveWait, 60000); });
      wake = null;
    } while (!stopped);
  } finally {
    clearTimeout(timer); signals.removeListener('SIGINT', stop); signals.removeListener('SIGTERM', stop); await storage.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startPriceWatchWorker().catch(() => { console.error('Local watch worker failed. Check its explicit emulator/demo configuration.'); process.exitCode = 1; });
}
