# Independent price-watch review

15 October 2026. Comparison: `9ca79a10fe5363f1146cea36a13722953832952e` and the coordinator-frozen local price-watch additions. System `review-agent` workflow; no external OCR. App source, existing tests, Git state and operator configuration were not changed by this reviewer.

## Verdict

No findings. APPROVE the reviewed local source, subject to the separate integration/process/browser evidence owned by the coordinator. The final price-watch domain SHA256 is `9983DF5D7C4999940E38C2906BD172A73236DE2764E0C29472B1393B9FD6B239`, matching the independently tested frozen copy.

## Repaired finding

[P2, fixed and independently verified] Allocate enough independent notification aliases for every due digest — `app/domain/price-watch.mjs`

`watchAliases()` reserves eight notification IDs, while `prepareWatchDigests()` can append more than eight due groups. Nine legitimate weekly no-saving opt-ins, separated by stop/re-enable actions with different hourly anchors, leave only 17 commands, nine runs and 18 events. At the due pass, the ninth digest reuses a notification alias, throws `WATCH_CAPACITY_REACHED`, and rolls back the daily check and every digest. Retries repeat the failure despite available ledger capacity. Reserve enough independent aliases outside the retryable callback, or allocate distinct public aliases deterministically from an independent per-transaction seed.

The reproduction is the `nine real weekly re-enable anchors` test in `.local/review-watch/independent.test.mjs`; it failed against the first frozen copy with `A notification alias could not be recorded.` The final implementation reserves 256 independent aliases outside the retryable callback. All nine digest previews now prepare successfully; the three ledger caps remain 256. Reverting the pool to eight is detected by the reproduction.

## Verified coverage

All 14 independent tests pass with zero skips: old consent replay after stop; new visitor key rejection; quote expiry after preparation; actual cancellation deadline and Kuala Lumpur midnight after preparation; private identity projection; consent/preference/booking/operation races after storage await; unsupported promoted source in all executable fixture modes; stop and replay with full ledgers; immutable pending/completed stage snapshots and replay; manual recovery at notification capacity; truthful pre-cancellation agency exception wording; USD/JPY/KWD precision; ten-page index bounds; notification session expiry after an awaited read; nine due weekly digest anchors; atomic index collision rejection.

All 11 targeted copied-source mutants are killed by the final 14-test suite: consent replay resurrection, missing post-preparation cutoff, stale quote clock, full provenance disclosure, missing same-version preference guard, unsupported local source, capacity blocking refund, false unknown-cancellation wording, two-decimal currency assumption, an eleventh index page, and the undersized digest alias pool. Mutants and copies are confined to ignored `.local/review-watch/`.

Initial source observations concerning clock freshness, full provenance hashes, quote expiry, and unsupported-source outcome overrides were repaired before the frozen probes. The coordinator's agency-exception wording and currency fixes were independently verified by those probes.

The complete domain/storage/worker/server additions and UI diff were inspected against the frozen contract and baseline. Existing agency authentication, separation of customer credentials from agency case locators, protected projections, selected-offer authority, frozen simulation clock and manual operation routes remain intact. The Docker packaging change includes only the new allowlisted worker script; its default production rejection remains active.

Reproduce locally with `node --test .local/review-watch/independent.test.mjs` and `node .local/review-watch/mutations.mjs`. This reviewer wrote only this report and ignored review copies/tests/results.

## Limits

These tests use fictional fixtures, copied source, the memory storage double and local HTTP only. Actual Firestore emulator integration, worker process restart/timer acceptance, browser acceptance and OCR are separate coordinator-owned evidence. This review establishes no live supplier, model, email, deployment, public access, production operator identity or cloud scheduler behavior.
