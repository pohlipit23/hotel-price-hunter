# RoomDrop postcard verification

Verified locally on 15 October 2026 against the approved [postcard contract](booking-postcard-contract.md). All bookings, supplier effects and refunds are fictional. The real local Firestore emulator supplied persistence; Gemini was unconfigured and no live model requests were made.

## Browser acceptance

[tests/postcard.browser.mjs](../tests/postcard.browser.mjs) returned `status: passed`: 11 acceptance groups, 21 stage snapshots, 16 responsive checks and zero browser runtime errors. Every approved offer received one explicit selected-offer approval at `ready`, followed by six separate manual advances through final revalidation, replacement, fulfilment, cancellation request, verified cancellation/pending refund and completed refund.

| Selected offer | Whole-stay replacement | Net refund after USD 5 fees | Final state |
| --- | --- | --- | --- |
| Equivalent room | USD 540 | USD 55 | Replacement active; simulated refund completed |
| Different room | USD 520 | USD 75 | Replacement active; simulated refund completed |
| Different hotel | USD 510 | USD 85 | Replacement active; simulated refund completed |

The browser checks proved that selection/review, keep, back and reload send no approval/start/advance; selection survives reload; offer approval preserves unenrolled status, preferences and standing permission; original booking/refund remain unchanged before verified cancellation; pending and completed refunds survive reload; and completed operations cannot advance. History stays collapsed during progress and opens by keyboard.

Recovery checks passed for committed-but-lost approval/advance responses with exact-command replay, passive reload reconciliation, concurrent tabs, double clicks, stale different-offer claims returning 409, fresh fictional visitors discarding another visitor's pending commands, and a competing offer winning while the losing response remains uncertain.

Booking, review, pending-refund and OS-dark-preference views were checked at 320, 390, 768 and 1440 pixels. No document overflow or clipped controls occurred. Alternative photos stayed landscape and left of hotel/room/pill text. The approved ivory palette remained light under OS dark preference. Failed photo loads displayed an honest unavailable-photo fallback and usable approval controls. Obsolete invitation, questionnaire, settings, chat and scenario controls were absent.

Eight screenshots were captured and visually inspected: booking, each of the three offer reviews, pending refund, completed refund, 320-pixel dark preference and unavailable photos. Ignored local evidence is in `.playwright-cli/postcard-verification-result.json`, `.playwright-cli/postcard-browser-output.txt` and `.playwright-cli/postcard-*.png`.

## Approved brand assets

Public files exactly match the approved source files by SHA-256:

| Asset | SHA-256 |
| --- | --- |
| Wordmark | `FBF3DEBCA23AEB003805A4D513593933CAB5178246287EC18163BC5CD6224084` |
| Ivory key icon | `7069932965E19938362E72642C121189359BDBA508925D7A37A2AE843D1E9E79` |

## Test replacement and limits

The old `ui.browser.mjs`, `ui-city.browser.mjs` and `simulation.browser.mjs` harnesses required the user-removed modal, questionnaire, settings, conversation and customer scenario selector. They were retired only after the replacement postcard harness passed. This removes obsolete DOM requirements, rather than disabling tests. All Node domain/API/persistence tests remain; the coordinator separately ran the complete real-emulator suite and reported 102 passed, zero failed and zero skipped. Legacy material-change and unknown-cancellation recovery fixtures remain covered there. This browser run does not claim live supplier, model, production or deployment verification.

The comprehensive browser run preceded the final safety-reason copy change and a final shared-domain confirmation guard. The HTTP guard was already active during the browser run. The final source was covered by the coordinator's domain/API suite and source presentation checks, then rebuilt and exercised through a fresh full selected-offer journey in both the final image and the restarted local app. The final stopped/paused reason copy was reviewed by source checks; this report does not claim an additional real-browser stopped-state fixture run.

## Final image and retained app

The final Docker image `hotel-price-hunter-postcard-qa:local` built successfully. An owned QA container shared the existing emulator's network namespace, retaining the runtime's required loopback emulator address. It had zero mounts and zero published ports. A fresh different-hotel approval and six separate advance commands completed with USD 510 as the replacement total and USD 85 as the completed simulated refund. Health reported `firestore-emulator` and `unconfigured`; served brand assets matched the approved hashes. An initial bridge-IP startup attempt correctly failed the loopback-only emulator configuration check; no safeguard was relaxed.

The retained host app was restarted after final source freeze and passed the same fresh full journey and asset/health checks. Its retained command session is `79442` at `http://localhost:8080`. The old owned app session `71206` was stopped. Ignored evidence is `.playwright-cli/postcard-container-result.json` and `.playwright-cli/postcard-final-host-smoke.json`.

The owned QA container and QA browser sessions were removed/closed; the pre-existing `hotel-price-hunter-firestore` emulator remained running. The retained host app remains available for user review. No credential mounts, cloud operations, registry publication or deployment were performed.

## Reproduction

Start the app with the explicit local emulator/unconfigured-model settings in [simulation-verification-setup.md](simulation-verification-setup.md), then use an isolated Playwright CLI Chrome session:

```powershell
playwright-cli -s=hph-postcard-qa open about:blank --browser=chrome
playwright-cli -s=hph-postcard-qa run-code --filename=tests/postcard.browser.mjs
```

Require the returned result's `status` to equal `passed`; a captured diagnostic result with `status: failed` is a failure even if the CLI successfully transports it. Sandbox launch/import limitations required the user's normal Windows PowerShell environment with an isolated temporary profile. The CLI evaluation environment omits `URL` and ordinary timer globals, so the harness uses string parsing and Playwright waits.
