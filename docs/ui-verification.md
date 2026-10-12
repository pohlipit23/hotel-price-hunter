# Customer UI verification

Verified locally on 12 October 2026 against the real Node application at `http://localhost:8080` and the Firestore emulator. Public scenario: `jury-booking`. All booking/rate facts and the frozen demo clock are fictional. Gemini was unconfigured.

`tests/ui.browser.mjs` passed in an isolated Chrome context with no reused personal profile. The in-app Browser plugin could not initialise because its runtime import returned `EPERM`; the documented Playwright CLI fallback ran in normal Windows PowerShell after sandbox Chrome launch failed. No external websites or account data were used.

Reproduce with the local application and emulator running:

```powershell
playwright-cli -s=hph-ui open http://localhost:8080 --browser=chrome
playwright-cli -s=hph-ui run-code --filename=tests/ui.browser.mjs
playwright-cli -s=hph-ui close
```

The harness creates and closes a fresh isolated context per run. It verifies:

- Automatic invitation; focus starts on Yes; Tab stays inside the dialog; Escape and Not now leave the USD 600 booking intact.
- Editable prefilled essential requirements, continued-monitoring default on, agency minimum enforcement, and separate affirmative equivalent-only permission confirmation. Meals, bed type and view display readable choices such as Breakfast included, King bed and City view; their canonical scalar values persist unchanged. An unchanged save preserves the equivalent offer's eligibility under separately confirmed standing permission. Choosing Room only creates a genuine essential mismatch and blocks that offer. Existing custom or unverified scalar requirements remain explicit rather than being normalised into verified facts.
- Saved essentials, minimum and frequency survive refresh. Editing permission clears confirmation. A second tab revokes permission; the old affirmative form receives `409 PREFERENCES_VERSION_CHANGED`, reloads the latest saved values, and requires review without resubmission.
- Three refundable offer categories appear by default. Non-refundable offers require explicit customer interest. Selection survives refresh and creates no switch permission.
- The actual unconfigured model endpoint returns `503 ADVICE_UNAVAILABLE`. The UI states advice is unavailable and keeps the saved preferences, comparison and booking intact. Customer HTML remains text, with no injected DOM elements.
- An offer with an unknown essential condition remains blocked and displays the unverified fact.
- At widths 320, 390, 768, 1024 and 1440 pixels, document width equals viewport width. While the question is focused, selected hotel/room identity, current and proposed totals, net refund and cancellation terms remain fully in the viewport. The compact mobile summary is 305, 291.5 and 255.5 pixels high at the first three widths; desktop summary is 324 pixels high.
- No client JavaScript exceptions occurred. The intentional unavailable-model response is an expected network failure.

Screenshots are local ignored QA artifacts under `.playwright-cli/`: `hph-mobile-booking.png`, `hph-mobile-enrolment.png`, `hph-mobile-conversation.png`, and `hph-desktop-comparison.png`. The booking and enrolment images contain clean customer-facing demo text. The conversation image deliberately includes the HTML-as-text regression input. All four were visually inspected.

This proves the local persisted customer flow and honest model-failure handling. It does not prove live Gemini responses, real supplier checks, scheduled monitoring, email delivery, transaction execution, deployment, or use on a physical mobile device. Live grounded Gemini acceptance remains unverified until the server has an authorised working Vertex configuration.
