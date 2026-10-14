# Independent flexibility and agency review

Review date: 15 October 2026. Fixed baseline: `aef6754617df5c34113a034eb30ec77d2cf3ac9f`. Scope: local non-refundable selected-offer consent and protected, read-only fictional agency review against `flexibility-agency-contract.md`.

## Final verdict

**APPROVE for the authorized local source slice. No remaining actionable findings.** All three review findings below were corrected, independently reproduced against a copied final source snapshot, and tested with deliberate regressions. This verdict does not approve deployment or any production agency identity provider.

## Resolved findings

**[P1] Recheck operator authorization after protected storage returns — `app/server.mjs:180` and `app/server.mjs:200`.** Both handlers initially authenticated before awaiting storage, then returned case data without checking expiry or revocation again. Six independent synthetic HTTP probes reproduced `200` plus protected case data when the operator session expired, rotated, or logged out during the list or detail storage await. The final handlers reauthenticate the original token after storage and before projecting records or issuing a cursor. All six probes now receive `401`; removing those final checks makes all six fail again.

**[P2] Bind reduced-flexibility acknowledgement in the shared approval validator — `app/domain/decision.mjs:82`.** An otherwise current non-refundable selected-offer receipt lacking `acceptReducedFlexibility` passed the shared binding validator and could be classified as automatic by `evaluateOffer`. The command and advance handlers had separate checks, limiting exposure, but the contract requires the current approval binding itself to reject every value except literal `true`. The final validator rejects missing, false, null, numeric, string, array and object acknowledgements; independently constructing these receipts now passes the negative assertions. Removing the binding condition makes the test fail again.

**[P2] Serve the documented agency page route — `app/server.mjs:310`.** The agency browser acceptance opens `/agency`, while the initial server mapped only `/` to its HTML page and rejected extensionless `/agency`. The final mapping serves `/agency.html` at `/agency`. The independent HTTP test verifies a `200` public login shell with no credential, customer capability or protected case payload, plus no-store and frame-ancestor protection. Removing the alias makes the test fail again.

## Evidence and coverage

Source inspection covered authentication enablement, credential generation, HTTP authorization and CSRF, JSON validation, DTO construction, case indexing and bounded pagination, selected-offer hashing/replay/reservation, promotion/recovery, and customer/agency UI. The reviewer used the built-in system review-agent workflow and security/test guidance. No source or repository tests were edited by the reviewer.

Independent experiments are confined to ignored `.local/flexibility-review/`. They generate their own synthetic credentials and never read the manual operator configuration, cloud credentials or environment files. The final suite ran against copied frozen application sources: **13/13 checks passed**, including six expiry/rotation/logout races; eight nonliteral acknowledgement variants; spoofed customer/header and malformed-query denial before storage; exact summary/detail projections and capability stripping; unchanged customer state; atomic memory-index collision failure; bounded, opaque, expired, rotated-session and changed-limit cursor rejection; public static shell; and unsafe provider configuration denial.

**6/6 meaningful mutants were detected**: removing final authentication, removing acknowledgement binding, spreading detail fields into the summary, removing cursor session ownership, exposing the private agency case alias in customer state, and removing the agency page route. Evidence files are `.local/flexibility-review/final-results.json`, `mutation-results.json` and `source-hashes.json`; reproducible experiment entrypoints are `checks.mjs` and `mutations.mjs`. SHA-256 comparisons confirm the inspected live authentication, server, domain, storage and customer/agency UI source files match the copied final snapshot.

The coordinator's implementation, browser and emulator evidence is separate. This review does not establish production identity, tenant membership, deployment, supplier execution, historical case backfill or live money movement. The in-memory storage collision check will not be represented as Firestore transaction proof.
