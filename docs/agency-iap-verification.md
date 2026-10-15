# Agency IAP local verification

15 October 2026, Asia/Kuala_Lumpur. Scope: the user-selected Google IAP provider, a separate agency-only application surface, managed-access display and an offline private-deployment proposal. Actual Google sign-in and cloud deployment remain unverified.

## Runtime tests

The final full Node suite passed **159/159**, with zero failures, cancellations or skips, in 87.2 seconds. The 142-test existing baseline had also passed before final integration. The final run included all existing emulator integration cases and 17 new provider/API tests.

Run from the workspace in normal Windows PowerShell:

```powershell
$env:GOOGLE_CLOUD_PROJECT='demo-roomdrop-iap-qa'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8081'
$env:RUN_FIRESTORE_INTEGRATION='1'
$env:GOOGLE_CLOUD_LOCATION=''
$env:GEMINI_MODEL=''
npm test
```

The separate demo project namespace isolates regression fixtures from the retained worker's `demo-hotel-price-hunter` namespace. No worker was stopped. Socket/container access required the normal host environment; sandbox access denials were not treated as test results.

The new provider tests use generated test-only EC keys and real `OAuth2Client.getIapPublicKeys` / `verifySignedJwtWithCertsAsync` behavior through an injected public-key transport. No actual JWT, Google account, ADC, model, supplier or public-key network request is involved. Tests cover malformed/duplicate/unsigned headers, forged signatures and wrong algorithm/issuer/audience/subject; strict time types/lifetime/expiry; configuration denial; cached-key freshness, Age, no-store, one-hour cap, coalesced refresh, malformed responses and an observed three-second hung-fetch timeout.

HTTP tests cover the small agency route allowlist before any customer storage work, safe session responses without cookies/identity/CSRF, denied application sign-in/logout, per-request verification, private cursor subject/assertion/page-size/expiry binding, key failure and hard expiry after list/detail storage waits. Actual deployed reader permissions are a release gate; these tests use the explicit in-memory storage double. Existing Firestore tests separately retain real emulator concurrency and persistence coverage.

Test-first evidence: provider tests initially failed because the module did not exist; service integration tests initially exposed the missing agency boundary. After implementation, the focused and final suites passed. [Independent review](review-agency-iap.md) records its separate allowlist mutation experiment.

## Browser evidence

`node tests/agency-iap.browser.mjs` passed its isolated browser acceptance. It serves actual agency HTML/JS/CSS with intercepted fictional API responses, not genuine IAP. It verifies managed controls and read-only renewal, keyboard case review/pagination, denied/expired/unavailable/transport failure clearing, delayed list/detail rejection after expiry, initial non-JSON denial, and preserved synthetic local login/CSRF logout/expiry.

Twenty-four geometry checks passed at 320/390/768/1440px. The two managed-access screenshots were visually inspected. Safe ignored evidence is `.local/agency-iap-ui/result.json`, `iap-list.png` and `iap-detail.png`. The in-app Browser runtime bootstrap failed before setup with EPERM; the agent read its troubleshooting guidance and used the installed Playwright package with an isolated temporary browser in normal Windows PowerShell. No personal browser state or real credential entered that harness.

All three preserved integrated browser harnesses passed once against the retained app and existing emulator:

| Harness | Scenario groups | Geometry checks | Screenshots |
| --- | ---: | ---: | ---: |
| Postcard | 11 | 16 | 8 |
| Flexibility / agency | 5 | 27 | 9 |
| Price watch | 17 | 15 | 6 |

The integrated agency run verified actual local passphrase login/logout and access revocation, bounded pagination, safe case projections and 126 simulated indexed cases. Its intercepted 401 check remains UI-clearing evidence, separate from genuine API revocation. The live local shell identifies `local-review` correctly. All three reported zero browser errors and zero model requests. Safe results are the existing ignored `.local/postcard-regression-browser-result.json`, `.local/flexibility-agency-browser-result.json` and `.local/price-watch-browser-result.json`; screenshots remain under `.playwright-cli/`. Representative customer and agency captures were inspected. Combined with the seven new mocked-IAP browser groups, this is 40 browser groups and 82 geometry checks; it is not live Google identity proof.

## Packaging and retained runtime

Local image `hotel-price-hunter:agency-iap-qa` built successfully with the existing allowlisted Docker context. `npm ci --omit=dev --ignore-scripts` installed 121 packages and reported zero audited vulnerabilities. Image ID: `sha256:83899dd8246e210e1105400b23821cc1092c9406d9abedb15ce510c242f05aed`. This is a local image ID, not a published registry digest or deployed source pin.

A task-owned temporary container ran the actual production startup with synthetic operator configuration, no network, mounts, credentials or published ports. It served the agency shell with the correct mode and returned health `{status:ok,storage:firestore,model:unconfigured}`. Customer pages/APIs were denied, missing/unsigned identity failed, and application session mutations were denied. The configured Firestore client made no database call. This packaging check cannot establish signed identity or Firestore reachability. The container was stopped/removed after checking its ownership label; the existing emulator was untouched.

Only the verified retained app process was restarted to load the reviewed server/shell integration; saved emulator data and the worker were preserved. New retained app session: **58369** at [RoomDrop](http://localhost:8080/) and [agency review](http://localhost:8080/agency), loopback only with the original local-review provider. Gemini remains unconfigured. Restart invalidates prior local operator sessions/cursors; login uses the existing ignored local configuration.

Syntax checks and `git diff --check` pass. No model generation, external OCR, email, real supplier action, source push, IAM/billing change, cloud resource creation or deployment occurred. Actual IAP sign-in, OAuth setup, operator principals/subjects, runtime IAM and new private-release verification remain in [the deployment proposal](agency-iap-deployment.md). The older cloud verifier and exhausted inference ledgers remain intact.
