# Persisted fictional switch verification

Verified locally on 14 October 2026 at `http://localhost:8080`, using the actual Node application and existing Firestore emulator at `127.0.0.1:8081`. `/health` reported `firestore-emulator` and `unconfigured`. Gemini remained disabled. All booking, supplier, cancellation and refund outcomes below are fictional.

## Results

- The backend worker's final integrated emulator suite passed **87 tests, zero skipped**. This included the real persistence/HTTP integration cases; the browser worker did not duplicate that run.
- `tests/simulation.browser.mjs` passed **15 checks**, with zero client JavaScript exceptions. The retained sanitized result is `.playwright-cli/simulation-verification-result.json`.
- Existing `tests/ui.browser.mjs` passed unchanged: invitation focus/trap/dismissal, essentials, minimum refund, separate permission confirmation, refresh persistence, stale two-tab conflict, non-refundable opt-in, unavailable local advice, text safety and unknown-fact blocking. Responsive comparison checks passed at 320, 390, 768, 1024 and 1440 pixels.
- Existing `tests/ui-city.browser.mjs` passed unchanged: gallery focus, four images, featured selection, blocked-refund suppression/restoration, image failure handling, light theme and the same five widths.
- The local Docker image `hotel-price-hunter:simulation-qa` built successfully. Its isolated smoke check used the emulator network, internal port 8082 and no published ports or credentials. Health, actual Firestore bootstrap, all three scenarios, the USD 600 starting booking and the final pending-command UI module passed. Gemini was unconfigured and no model requests were made.

## Journey evidence

| Journey | Verified outcome |
| --- | --- |
| Equivalent saving | A comparison or unchecked confirmation grants no authority. Explicit equivalent-only permission enables keyboard start. Six separate advances revalidate, secure the replacement, verify fulfilment, request cancellation, verify cancellation and complete the refund. |
| Saving secured, refund pending | Original remains USD 600 until cancellation verification. The verified replacement becomes USD 540, old offers/comparison retire, and USD 55 remains **pending** across refresh. Completion requires another advance and saves a simulated receipt. Continued monitoring uses the replacement booking/version/deadline. |
| Material change | Final checked price becomes USD 545 and room size changes from 32 to 38 m². Proposed refund recalculates to USD 50. Renewed approval is required; no replacement, cancellation or secured saving appears. The safety stop persists across refresh. |
| Uncertain cancellation | The original stays active at USD 600, cancellation is unknown, saving is unsecured and refund has not started. Reconciliation observes the same cancellation intent and replacement, then promotes the USD 540 booking with a pending refund before separate completion. |

Actual browser request interception let the server commit start/advance commands before dropping their responses. Retry replayed the same command without duplicate intent or progress; refresh reconciled the saved command. Concurrent tab inputs converged on one revision. Foreground double-click and stale-tab replay recorded only one advance. Revoking permission in another tab stopped before replacement.

Two review regressions also passed against the real app: replacing only the synthetic visitor cookie discarded an old pending start/advance without an automatic write, and a held losing scenario request received a real server 409 before its response was dropped. Reload then displayed the winning saved journey, without the losing retry or another transaction. The competing-request test has a 30-second gate timeout and releases/unroutes its held request in `finally`.

## Visual checks and reproduction

Simulation start, pending refund and material safety stop had no horizontal overflow or clipped controls at **320, 390 and 1440 pixels**. Keyboard activation worked. The City Escape hotel/room photography and light design remained intact. Five screenshots were personally inspected:

- `.playwright-cli/simulation-start-mobile.png`
- `.playwright-cli/simulation-refund-pending-mobile.png`
- `.playwright-cli/simulation-material-change-320.png`
- `.playwright-cli/simulation-cancellation-unknown-mobile.png`
- `.playwright-cli/simulation-refund-completed-desktop.png`

Use the explicit emulator/model-disabled environment in [the setup note](simulation-verification-setup.md), then run the three browser harnesses in an isolated session. The in-app runtime import is blocked by host `EPERM`; normal-host Windows PowerShell with the installed isolated Playwright CLI worked. No personal browser profile or identity tokens were used, and the new simulation harness blocks non-local browser requests.

The bounded competing-request regression also passed after its timeout/cleanup was added. The exact task-owned smoke container was stopped and removed, and isolated browser session `hph-simulation-qa` was closed. Final health still reported `firestore-emulator` and `unconfigured`.

The local application is intentionally retained for review in command session **31194**. The pre-existing emulator remains running. These results establish the persisted fictional flow; they do not establish real supplier execution, refunds, live model behavior, deployment or public access.
