# Curated RoomDrop verification

## Part 2 - 18 October 2026

Worktree: `.local\roomdrop-part2`, branch `codex/roomdrop-part2-app`.
Base: `3c07af3`. Binding storage interface: v1 supplied by Claude through the user.
All runtime tests and evidence below are local. No live capture, model call,
production import, source push, deployment, IAM/TTL change or Scheduler execution.

| Boundary | Result | Evidence |
| --- | --- | --- |
| Node regressions, including Part 2 emulator cases | Pass: 331 tests, 325 passed, 0 failed, 6 skipped | `.local\part2-node-tests-final.log` |
| Part 2 transactions on real Firestore | Pass: independent clients, hashed test cookie ids, concurrent confirmations, allowance contention, context restart | `quotation-session-actions.test.mjs` with `RUN_ROOMDROP_PART2_FIRESTORE=1` |
| Durable confirm/chat HTTP on real Firestore | Pass: separate servers/clients, restart recovery, stored follow-up context, unchanged watch/shared records | `quotation-durable-actions.test.mjs`, contract-v1 adapters over test-owned emulator documents |
| Full existing judge UI | Pass: 320/768/1440 px | `.local\judge-flow\browser\result.json`, 27 screenshots; memory arm |
| Part 2 UI | Pass: 320/768/1024/1440 px, keyboard, refresh, isolation, rearm, empty/unavailable, no external requests | `.local\part2-browser\result.json`, 24 screenshots; memory arm and injected model |
| Historical single-snapshot booking UI | Pass: 320/768/1440 px | `.local\restore-booking-ui\browser\result.json`; synthetic two-Drop snapshot, no live rates |
| Hosted startup | Pass with injected factories; storage failure precedes model/listen, stores close once, invalid production/emulator profiles rejected | `quotation-cloud.test.mjs` |
| Manifest and dependency closure | Pass with explicitly injected Part 1 source doubles | `public-demo-release.test.mjs`; output is `test-prepared-offline`, no registry tag |
| Test-source Docker build and bounded startup failure | Pass: read-only/network-disabled container refuses unavailable storage with exit 1 and a safe diagnostic | `.local\part2-test-docker-build.log`, `.local\part2-test-image-failure.log`; test-only image, not release proof |
| Actual integrated browser persistence | Blocked | `.local\part2-firestore-browser\result.json`: `PART1_DEPENDENCIES_UNAVAILABLE`; zero accepted checks |
| Combined exact-source image and production candidate | Blocked | Part 1 session/bootstrap/arm modules are absent from this branch; no merge/rebase is authorised |

The final exact-commit release-preparation probe also failed closed as intended:
`SOURCE_DEPENDENCY_MISSING` for Part 1's `app/booking-storage.mjs`.
Evidence: `.local\part2-release-gate.log`. It emitted no successful release manifest.

The emulator is the existing Docker container `roomdrop-part2-firestore`, bound to
`127.0.0.1:8281`, project `demo-roomdrop-part2`. Tests create unique namespaces and
delete only their own documents. They do not flush the emulator or touch the
Part 1/8081 containers. Browser servers allocate port 0. Manual booking/quotation
ports remain 8294/8293, and the separate simulation app uses 8290.

One early full run had an unrelated failure in the unchanged IAP claim-timing
test (`agency-iap-auth.test.mjs:72`). That file passed alone and subsequent full
runs passed. No agency/auth code or test was changed. An initial browser assertion
also caught changed empty-state copy; the corrected copy preserves the existing
phrase and explicitly says the check is captured. Final browser results above pass.

The earlier frozen memory-source image at source `7da023e` built and passed a
network-disabled smoke. It was superseded by the manifest/Firestore entrypoint
change and is not a Part 2 release candidate. Its historical logs are
`.local\part2-docker-build.log` and `.local\part2-image-smoke.log`.

### Remaining integration work

Part 1's storage implementation is progressing separately. No Part 1 source was
copied into this worktree and no research branch was merged. The durable routes
use contract-v1 `get`/`transact`, `getBooking`/`getDrops` and the hosted loader.
The current GET/watch branches remain the base snapshot's memory implementation.
They must be reconciled with Part 1 after the user's integration go-ahead.

Part 1's per-code bootstrap must spread
`publicPostWatchState({ scope, bundle })` from `quotation-session-actions.mjs`.
That projection hides stale confirmations and returns bounded conversation only
for the current watch. Do not expose the whole session or advice counters.
Run the integrated browser gate after this hookup; it checks actual restart,
two judges, two codes, context, rearm and immutable shared facts.

All original Part 2 acceptance checkboxes remain open pending that proof. The
six-curated-quotation content matrix and production importer/TTL approval are
separate Part 1/release prerequisites; synthetic rate fixtures cannot close them.

### Reproduction

```powershell
Set-Location 'C:\Users\pohli\Sites\hotel-price-hunter\.local\roomdrop-part2'
$env:GOOGLE_CLOUD_PROJECT='demo-roomdrop-part2'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8281'
$env:RUN_ROOMDROP_PART2_FIRESTORE='1'
Remove-Item Env:RUN_FIRESTORE_INTEGRATION -ErrorAction SilentlyContinue
npm.cmd test
node tests\booking-after-watch.browser.mjs
# Requires actual Part 1 modules integrated into this worktree:
node tests\booking-firestore.browser.mjs
git diff --check
```

`RUN_FIRESTORE_INTEGRATION` stays unset here because the unrelated historical
daily-watch test binds explicitly to 8081 / `demo-roomdrop-iap-qa`. The six inherited
integration skips are reported as skips. Memory tests are not Firestore proof.
