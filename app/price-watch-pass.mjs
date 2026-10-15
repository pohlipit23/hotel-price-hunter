import { checkPriceWatch, prepareWatchDigests, watchAliases, fixtureWatchProvider } from './domain/price-watch.mjs';

/** Shared bounded discovery engine. Only whole successful pages advance its private cursor. */
export async function runPriceWatchPass({ storage, fixture, now = () => new Date(), provider = fixtureWatchProvider,
  after = null, maxPages = 10, stopReason = () => null, onPageCompleted = async () => {} } = {}) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) throw new Error('Use one to ten bounded pages.');
  let cursor = after; let pages = 0; let examined = 0; const results = [];
  const recordedAt = now().toISOString();
  const outcome = reason => ({ after: cursor, pages, examined, results, reason, ok: ['SWEEP_COMPLETED', 'PAGE_LIMIT'].includes(reason) });
  while (pages < maxPages) {
    let reason = stopReason();
    if (reason) return outcome(reason);
    let entries;
    try { entries = await storage.listWatches({ limit: 50, after: cursor }); }
    catch { return outcome('STORAGE_UNAVAILABLE'); }
    reason = stopReason();
    if (reason) return outcome(reason);
    for (const entry of entries) {
      reason = stopReason();
      if (reason) return outcome(reason);
      examined++;
      const captured = entry.state;
      if (!captured || !captured.priceWatch?.enabled || captured.priceWatch.watchId !== entry.watchId || Date.parse(captured.expiresAt) <= Date.parse(recordedAt)) continue;
      const aliases = watchAliases();
      const expected = { ...structuredClone(captured.priceWatch), bookingVersion: captured.booking.version };
      let result;
      try {
        await storage.update(entry.visitorId, current => {
          // A retryable callback must also observe termination before doing more work.
          if (stopReason()) { const error = new Error('Watch pass stopped.'); error.code = 'WATCH_PASS_STOPPED'; throw error; }
          result = checkPriceWatch(current, { expected, expectedPreferenceVersion: captured.preferences.version, expectedBooking: captured.booking, expectedPreferences: captured.preferences, fixture, recordedAt, aliases, provider, now });
          return prepareWatchDigests(result.state, { recordedAt: now().toISOString(), aliases });
        });
        results.push({ runId: result.run.runId, status: result.run.status, reasonCodes: result.run.reasonCodes, replayed: result.replayed });
      } catch (error) {
        if (error.code === 'WATCH_PASS_STOPPED') return outcome(stopReason() || 'INTERRUPTED');
        if (error.code !== 'WATCH_CAPACITY_REACHED') return outcome('STORAGE_UNAVAILABLE');
        results.push({ status: 'failed', reasonCodes: ['WATCH_CAPACITY_REACHED'] });
      }
    }
    reason = stopReason();
    if (reason) return outcome(reason);
    let next = entries.length < 50 ? null : entries.at(-1).watchId;
    // The final full page may also be the end. Probe one unprocessed locator so
    // an exactly-full sweep resets now instead of consuming the next daily run.
    // This adds one bounded read, never another page of work. A failed probe
    // leaves this whole page behind the previous durable checkpoint for replay.
    if (next !== null && pages + 1 === maxPages) {
      try { if (!(await storage.listWatches({ limit: 1, after: next })).length) next = null; }
      catch { return outcome('STORAGE_UNAVAILABLE'); }
      reason = stopReason();
      if (reason) return outcome(reason);
    }
    try { await onPageCompleted(next); }
    catch (error) { return outcome(error.code === 'CHECKPOINT_CONFLICT' ? 'CHECKPOINT_CONFLICT' : 'CHECKPOINT_UNAVAILABLE'); }
    cursor = next; pages++;
    if (next === null) return outcome('SWEEP_COMPLETED');
  }
  return outcome('PAGE_LIMIT');
}
