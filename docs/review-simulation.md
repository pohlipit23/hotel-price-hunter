# Independent review: persisted simulated equivalent switch

Reviewed 14 October 2026 against fixed base `40f77e5a6a2a2d41b76f631d5e2396d974bb1a9d`, including the new simulation domain, UI module and tests. The coordinator subsequently saved the reviewed backend in commit `2ab44dd`. This review covers the original approved prototype plan, `docs/data-contract.md`, `docs/simulated-switch-contract.md`, the domain/API implementation, the customer display source and relevant verification. Application files, tests and Git state were not changed by this reviewer. Independent experiments and mutation copies are confined to ignored `.local/review-simulation/`.

## Verdict and findings

**Backend APPROVED for the bounded fictional slice. No remaining actionable P1/P2 finding in the reviewed source.** Final browser acceptance is owned by the separate QA worker; this document does not claim browser verification or approve deployment, supplier execution, public access or live model calls.

The following issues found during review are resolved in the inspected implementation:

- **P2: stale proposed refund after material revalidation.** The changed-price scenario originally retained the initiating USD 55 proposal while the final checked quote was USD 50. `app/domain/simulation.mjs:173` now derives the proposed amount from the checked decision; the material-change test and independent reservation test verify USD 50 without a secured-saving claim.
- The coordinator's original-watch continuation and revoked-record carry findings are also resolved: disabling continuation affects the promoted baseline, and carry uses `isApprovalValid` rather than counting an approval-shaped object. Independent tests verified original-watch eligibility and rejection of a record with `revokedAt` during cancellation observation.

No cosmetic findings are elevated into blockers.

## Independently executed evidence

All tests below use fictional fixtures and isolated copies. No paid model, supplier, email, deployment or cloud-resource operation was performed.

| Check | Actual result | Evidence |
| --- | --- | --- |
| Copied checked-in simulation suite | 8 passed, 0 failed, 0 skipped | `.local/review-simulation/baseline.log` |
| Fresh independent guard cases | 8 passed, 0 failed, 0 skipped | `.local/review-simulation/independent.test.mjs` |
| Remove current-authority stop | Mutation killed: 7 passed, 1 failed, 0 skipped | `.local/review-simulation/remove-current-authority-stop.log` |
| Remove verified-fulfilment cancellation gate | Mutation killed: 7 passed, 1 failed, 0 skipped | `.local/review-simulation/remove-cancellation-fulfilment-gate.log` |
| Remove operation revision CAS | Mutation killed: 7 passed, 1 failed, 0 skipped | `.local/review-simulation/remove-current-operation-cas.log` |

Each mutation changed the isolated module and caused the intended existing test to fail. The isolated source was restored after each run; no implementation file was mutated. This is three targeted mutation experiments, not a project-wide mutation score.

The eight independent cases prove deterministic repeated callback output with no input mutation; exact original initiating replay after promotion and permission/preference changes; expiry blocking before replacement; booking/preference version changes stopping a secured journey before cancellation; revoked-record rejection during permission carry while cancellation observation continues; old unknown-command replay followed by same-intent recovery after deadline/offer expiry; private dedupe/request/permission snapshot exclusion from the public operation; and reservation retention after a material-change stop.

## Source coverage and limitations

Intent identity binds visitor scope, scenario, original booking/version and trusted offer/version. Canonical payload hashing includes the preference version. Existing-intent lookup precedes current authority/version validation, allowing exact historical replay after promotion while rejecting changed payload. Source-version reservations survive stopped/completed journeys. Stage command receipts preserve current state on old-command replay; operation revision CAS protects new commands.

The server validates origin, CSRF, strict request fields and ownership. Its shared update wrapper checks wall-clock session expiry and initializes the persisted aggregate inside the atomic update. Enrolment, selection and advice validate the current persisted booking; late advice checks current booking/preferences/revision before responding. Public snapshots remain the fictional allowlisted journey, with no private lookup or arbitrary supplier-result input.

Final revalidation preserves complete unchanged rate identity/version and records separate check evidence. Changed material facts produce version 2 and stop before replacement. Authority is rechecked before securing/fulfilment/cancellation request. A generic reservation cannot satisfy the cancellation fulfilment gate. Original cancellation observation atomically promotes the replacement and marks refund pending; settlement is a separate stage. Unknown cancellation preserves the original, no secured saving and no started refund. Recovery observes its recorded intent instead of issuing another mutation; refund recovery continues after revocation/expiry. Promoted current offers are empty, selection is cleared and standing carry retains derived provenance.

Customer source uses persisted server stages, current snapshots and separate proposed/secured/refund labels. It preserves a pending command for uncertain HTTP results, disables controls while a request is in flight, refreshes revision errors and renders text through DOM text nodes. Real keyboard, reload, mobile/desktop, screenshot and browser-error acceptance remains the QA worker's separate evidence.

The coordinator reported the completed final actual emulator full-suite run: **87 passed, 0 failed, 0 skipped**, followed by backend savepoint `2ab44dd`. This reviewer did not repeat that full suite; these totals are coordinator evidence, separate from the independently executed checks above. A fresh UI reviewer and QA worker own final customer-interface and runtime acceptance. Review of `FirestoreStorage.update` confirms aggregate updates use the existing transaction seam; the independent deterministic callback experiment does not itself prove emulator transaction behavior.

All receipts, fulfilment observations, cancellations and refunds are fictional. They prove the application's local simulated ordering and deduplication, not supplier exactly-once effects, live terminal fulfilment, customer payment settlement, scheduled monitoring or real notification delivery. A real adapter still requires a durable outbound-intent and reconciliation design outside transaction callbacks.

