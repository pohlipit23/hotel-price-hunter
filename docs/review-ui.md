# Independent UI and specification review

Reviewed 12 October 2026 on `codex/customer-flow`, against the final frozen UI and the local Node application plus Firestore emulator. Scope: `app/public/booking.html`, `booking.css`, `booking.js`, `tests/ui.browser.mjs`, and `docs/ui-verification.md`; requirements from the agreed prototype plan, `tasks/plan.md`, `tasks/todo.md`, and `docs/data-contract.md`. The Booking changes design was inspected as the visual reference.

**Verdict: approve the local fixture-based customer UI. No unresolved actionable UI findings. Live grounded Gemini acceptance remains unverified; this review does not close that milestone requirement.**

## Findings resolved during review

**P2 — natural requirement labels created false offer mismatches.** The earlier UI presented canonical meal/bed/view codes in free text and saved edited strings verbatim. A customer entering “Breakfast” for BREAKFAST silently blocked the equivalent fixture offer because `app/domain/decision.mjs:181` requires exact equality. Independent domain reproduction returned `approval-required` for canonical BREAKFAST but `blocked` with `ESSENTIAL_REQUIREMENT_MISMATCH` for Breakfast. The final UI defines readable choices in `app/public/booking.js:5`, renders canonical select values at line 147, and preserves their typed scalars at line 201. Unknown and already saved custom values remain explicit; there is no arbitrary normalization. The final independent browser run verified readable labels, canonical persistence through save/refresh, equivalent eligibility after an unchanged save, and blocking after the genuine Room only requirement change. The final enrolment screenshot was visually inspected.

**P2 — selected offer identity disappeared from the compact mobile comparison.** The earlier compact CSS hid both hotel and room labels while the comparison title scrolled away. The customer could see generic price labels but could not identify the selected alternative during the conversation. The final implementation adds a concise selected hotel/room line at `app/public/booking.html:41`, populated in `booking.js:240` and displayed by `booking.css:4`. The browser regression now checks that identity, both totals, net refund and cancellation terms remain fully visible while the question is focused. Independent rerun passed; final mobile screenshot was visually inspected.

## Verification evidence

An isolated named temporary Chrome session (`hph-review-ui`) visited only `http://localhost:8080`. No personal browser profile, account storage, cookies or external/model requests were inspected. Browser plugin instructions were read first; the coordinator and UI worker had established its runtime import failure. The installed Playwright CLI ran in normal Windows PowerShell after the sandbox launch reproduced Chrome's crashpad pipe failure.

The final browser harness was copied to ignored `.local/review-ui/flow.mjs`, with screenshots redirected to reviewer-owned paths. Its independent execution returned `status: passed`, no client runtime errors and no failures. It exercised:

- Automatic invitation, primary focus, keyboard trap, Escape and Not now with unchanged booking total.
- Editable prefilled essentials with readable canonical choices, unchanged-save equivalent eligibility, genuine changed-requirement blocking, minimum refund enforcement, separate affirmative standing permission and persisted preferences.
- Two tabs sharing the local demo session: one revokes standing permission, the other's stale affirmative save receives real `409 PREFERENCES_VERSION_CHANGED`; latest values reload, stale confirmation is cleared and no automatic resubmission occurs.
- Three refundable offer categories, explicit non-refundable interest, restored selection after refresh and unchanged standing permission.
- Actual unconfigured advice endpoint returning `503 ADVICE_UNAVAILABLE`; visible honest error with persisted booking, preferences and selected comparison intact.
- Customer HTML rendered as text; unknown facts clearly shown with switch blocked.
- No horizontal overflow and fully visible selected identity, current/proposed totals, refund and terms while the question is focused at widths 320, 390, 768, 1024 and 1440 pixels.

Final sticky-summary geometry was top/bottom `0/305`, `0/291.5`, `0/255.5`, `20/344` and `20/344` at those widths. Reviewer-owned screenshots are `.local/review-ui/harness-mobile-booking.png`, `harness-mobile-enrolment.png`, `harness-mobile-conversation.png` and `harness-desktop-comparison.png`; enrolment, conversation and desktop comparison were visually inspected.

Additional independent checks in `.local/review-ui/extra.mjs` passed reverse Tab wrapping, weekly default, a valid false automatic setting, focus return to the live rerendered selected offer after hiding the comparison, and prevention of a cross-offer selection race during a delayed real advice request. A 390-by-500 viewport check confirmed the compact identity, refund and cancellation summary remained visible, though the typing area is tighter. This is a simulated short viewport, not physical-device keyboard evidence.

A targeted local browser-response mutation in `.local/review-ui/mutation.mjs` inverted the separate-confirmation guard without editing implementation files. The unchanged condition displayed the confirmation error with zero enrolment requests; the inverted condition sent one enrolment request and failed the guard assertion. The targeted regression killed the mutation. Only isolated local fictional-session data was affected.

## Review axes and boundaries

- **Correctness/spec:** false permission is valid, true requires separate confirmation, stale consent cannot replay, selection grants no authority, all three required categories and relevant money/refund/cancellation/check-time facts are visible. Essential edits are explicitly explained as additional requirements; baseline features remain constraints enforced by the domain layer.
- **Readability/architecture:** a small dependency-free DOM client consumes server decisions rather than recalculating execution authority; enrolment, selection and advice are distinct endpoints. Existing CSS is compact and less convenient to maintain, but it introduces no functional or scope regression warranting a blocker.
- **Security:** customer, server and model text use `textContent`/DOM construction. No client secret, arbitrary booking lookup or transaction control appears in the reviewed UI. Server/API authorization is covered by the separate runtime review.
- **Performance:** local UI uses a bounded fixture offer set; no polling or external assets were added. Pending operations share a guard that prevents overlapping selection/advice state changes.
- **Honesty:** fiction, frozen demo checks, comparison-only behavior, no transaction and unavailable-model states are explicit. No simulated response is presented as live Gemini.

This review covers local browser behavior and the first customer UI slice. It does not verify live Gemini, real supplier retrieval/revalidation, scheduled monitoring, email delivery, simulated execution/refund lifecycle, deployment or physical mobile devices. The user-facing live-model success criterion and later milestone requirements remain open.
