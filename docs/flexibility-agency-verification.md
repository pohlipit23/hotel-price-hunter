# Local non-refundable and agency review verification

Acceptance against the frozen [contract](flexibility-agency-contract.md), 15 October 2026. Local browser acceptance and container/emulator smoke passed against the frozen source. The coordinator's backend worker separately reported the full emulator-enabled Node suite passing 113 tests with zero skips; this QA worker did not rerun it.

## Observed evidence

- New browser acceptance passed five groups: default three alternatives; native collapsed fourth offer; keyboard acknowledgement initially unchecked and reset on new comparison/reload; passive selection/keep/reload; all six manual stages in each of three monitoring settings. Original USD 600 remains active until cancellation proof; then USD 480 becomes active, USD 115 is first pending and later completed, and monitoring ends with `NON_REFUNDABLE_BASELINE` even when unenrolled or continuation is off.
- Protected browser acceptance used an actual generated local credential. Unauthenticated, spoofed-header and real fictional customer-cookie requests returned 401. Twenty-four new indexed operations were paged in bounded groups of twenty with no duplicate case IDs. Safe list/detail projections were checked. The UI showed actual persisted unknown cancellation, changed-material stop, revoked standing authority with a secured/unverified replacement, a separate unenrolled paused case, and completed non-refundable refund. Keyboard detail focus, collapsed history and absence of operator mutation buttons passed. Actual logout revoked access and cleared protected DOM; an intercepted 401 separately proved stale UI clearing.
- Twenty-seven geometry checks passed at 320, 390 and 1440 pixels across customer and agency surfaces. Customer review and readable mobile/desktop agency detail screenshots were visually inspected. Nine journey screenshots plus two focused detail screenshots exclude populated password fields. The new browser run recorded zero runtime errors and zero advice/model requests.
- The original `tests/postcard.browser.mjs` was preserved and passed all eleven regression groups, including the original three refundable refunds, lost-response exact retries, concurrent tabs, double-click guards, identity changes, stale competing offers, dark preference and unavailable illustrative photos. Its sixteen geometry checks also passed.
- Docker build passed for image `hotel-price-hunter:flexibility-agency-qa`. An owned container used the existing `hotel-price-hunter-firestore` network namespace and loopback port 8082, with no mounts or published ports. Its explicit `NODE_ENV=test` override enabled the emulator laboratory configuration; this is not a production emulator claim. Agency mode was absent and protected cases returned `503 AGENCY_UNAVAILABLE`. Emulator bootstrap, all six non-refundable stages and persisted refresh passed with USD 480 / USD 115 / completed refund / ended monitoring. The QA container was removed; the existing emulator remains.

Safe local evidence lives in ignored `.local/flexibility-agency-browser-result.json` and `.local/postcard-regression-browser-result.json`, with screenshots under ignored `.playwright-cli/`. No credential, cookie or operator CSRF value appears in those results.

The browser runtime import failed with `EPERM` at its installed `browser-client.mjs`. The fallback used the existing Playwright installation in the normal Windows environment, an isolated temporary browser, and the tracked `tests/flexibility-agency.browser.mjs` harness. An ignored runner read the ignored manual-access credential file directly into process memory. Credentials were never printed, placed in command arguments/environment variables, embedded into test source, inspected through browser storage, or captured in screenshots. All owned browser contexts/processes were closed.

## Retained local demo

The user's demo remains at [RoomDrop](http://localhost:8080/) and [Agency review](http://localhost:8080/agency). The app binds `127.0.0.1` and uses exact `APP_ORIGIN=http://localhost:8080`, a `demo-` project and the existing loopback Firestore emulator. Reviewer mode is explicitly `local-review`; Gemini is unconfigured. Final health and agency shell both returned 200. The app is retained in session 53012.

The generated 256-bit passphrase is available for manual retrieval from ignored `.local/agency-review.json`; its value is deliberately absent here. The credential file was verified ignored. Operator sessions/cursors invalidate on app restart. New fictional cases remain persisted in the emulator; historical index completeness is not promised.

## Boundaries

This acceptance proves only local fictional flows against the Firestore emulator. It does not establish deployed operator identity, cloud access, real supplier effects or live exactly-once behavior. Historical operations are not backfilled into the new private case index.

The browser uses only existing customer APIs to create fictional exceptions. A revoked-authority case has an actually secured replacement with fulfilment not yet verified; it is distinct from a backend-injected `FULFILMENT_UNVERIFIED` failure. Actual session expiry and injected fulfilment failure belong to domain/API tests; the browser's HTTP 401 interception proves only protected UI clearing. The coordinator owns the final domain/API/emulator suite; this worker does not duplicate it.

No model generation, email, deployment, cloud command, Git publication or OCR is part of this QA work.
