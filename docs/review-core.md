# Independent core review

Reviewed and independently rechecked 12 October 2026. Final verdict: **approve the bounded core fixes**; both original required findings are resolved, with no new required finding in the corrected scope. This review covers the completed domain/fixture/contract and bounded integration-probe work only. Backend, UI, live Gemini, Firestore runtime and browser verification require their own review.

## Fix verification

The corrected `app/domain/decision.mjs:91` defines the checkout civil-date minimum in the declared stay timezone. Policy validation at line 120 rejects a tail that ends before its required horizon. The checks at lines 187–189 validate the original through that minimum and the replacement through the later of the minimum and the original's declared tail, before consulting any authority. `docs/data-contract.md:48` explicitly documents this boundary and treats an unresolved local boundary as unknown policy. The minimum does not infer a hotel checkout clock; live adapters must supply complete authoritative policy facts.

The **exact original P1 reproduction** now returns `{action:"blocked",reasons:["UNKNOWN_CANCELLATION_POLICY"],netSavingMinor:5500,authority:null}` despite a valid specific approval. Added tests independently cover no approval, valid specific approval, truncated original policy, replacement tail shorter than the original declared tail, and the precise Kuala Lumpur checkout-date boundary. Fully known earlier deadlines and higher penalties still require offer-specific approval; their existing positive approval test passes.

The **exact original P2 mutation** now fails the new matching-invalid-calendar test: **30 passed, 1 failed**. Its assertion requires `INVALID_STAY` and excludes `STAY_MISMATCH`, so an unrelated mismatch cannot conceal loss of semantic calendar validation.

Independent current baseline: `node --test tests/decision.test.mjs tests/money.test.mjs` passed **31/31**. An additional isolated booking-version authority mutation was killed by **12 failing tests**. Both disposable domain copies were restored afterward. A focused scratch boundary check covered eight explicit zones: UTC, Kuala Lumpur, Kathmandu, Adelaide, Auckland, New York, Los Angeles and Berlin. In every case, the exact local-midnight policy end qualified under standing permission; an original policy ending one second earlier was blocked even with valid specific approval. This covers UTC, positive/negative offsets, fractional offsets and the November daylight-saving offsets in those zones; it is not exhaustive historical timezone testing.

Only this review report and ignored `.local/review-core/` scratch were written by the reviewer. Production source, tests and Git state were not edited. Live integrations and runtime/UI coverage limits below remain unchanged.

## Original findings — resolved

### P1 — Block incomplete replacement cancellation schedules before consulting approval

Location: `C:/Users/pohli/Sites/hotel-price-hunter/app/domain/decision.mjs:104` through the policy return at line 112; authority is then accepted at lines 182–183.

`cancellationFacts` checks that a tier covers the current instant and that the listed tiers are contiguous. It does not establish policy coverage through the stay/required decision horizon. `preservesFlexibility` notices a missing future tier, but returns false, which classifies missing policy as an alternative. A valid specific approval then authorises execution despite the unknown future cancellation facts. The contract says unknown or inconsistent schedules block execution, including after specific approval.

Exact reproduction, using the unchanged fixture and `now:2026-10-12T02:30:00Z`:

1. Use `fixture.offers[0]` with the original stay of 12–15 November 2026.
2. Set replacement `cancellation.schedule` to one tier `{from:"2026-10-12T00:00:00Z",to:"2026-10-13T02:00:00Z",penaltyMinor:0,currency:"USD"}` and `freeUntil` to `2026-10-13T02:00:00Z`.
3. Add a confirmed selected-offer approval bound to current booking/preference/offer versions and `materialFingerprint(input)`, confirmed at `2026-10-12T02:10:00Z`, expiring at `2026-10-13T02:00:00Z`, with `revokedAt:null`.
4. `evaluateOffer` returns `{action:"automatic",reasons:[],netSavingMinor:5500,authority:"offer-approval"}`.

Cancellation terms after 13 October, including the entire actual stay, remain unknown. Fix: define the required cancellation-policy horizon explicitly and validate both policies cover it before authority checks. Reject missing coverage as `UNKNOWN_CANCELLATION_POLICY`; reserve offer approval for fully known reduced flexibility. Add regression cases for an incomplete replacement tail both with and without specific approval and for an incomplete original tail. Preserve the existing [from,to) boundary semantics.

### P2 — Prove calendar validation with matching invalid booking and offer dates

Location: `C:/Users/pohli/Sites/hotel-price-hunter/tests/decision.test.mjs:113` (the single-room/date/occupancy test); validator at `app/domain/decision.mjs:142`.

The existing invalid-stay-date case changes only the offer's date. `STAY_MISMATCH` therefore blocks it even if semantic calendar validation is removed. An isolated mutation replacing `!civilDate(stay?.checkin) || !civilDate(stay?.checkout)` with string-type checks passes all 26 focused tests. This experiment proves the suite does not protect the implemented stay calendar gate.

Fix: set both booking and offer to the same invalid calendar dates (for example check-in `2026-02-30`, check-out `2026-03-02`), with otherwise valid standing permission, and assert blocking specifically includes `INVALID_STAY`. Cover invalid checkout and reversed/equal dates independently of a stay mismatch. The present implementation rejects invalid civil dates correctly; this finding concerns regression coverage.

## Verification and five-axis coverage

- **Correctness/spec:** traced the agreed plan, `tasks/plan.md`, `tasks/todo.md`, `docs/data-contract.md`, `docs/decision-examples.md` and the complete fictional fixture. Checked retail refund arithmetic, explicit costs, currency matching, agency/customer threshold equality, scope/dates/occupancy, known baseline preservation, customer essential mismatches, unknown equivalence, standing versus specific authority, versions/fingerprints, current/expiry times, timezone presence and cancellation boundaries. Two required findings above.
- **Readability:** core helpers, reason codes and authority labels are clear. No required readability finding.
- **Architecture:** money and permission decisions remain independent of Gemini, supplier calls and UI; fictional/public facts and unresolved live mappings are explicitly separated. No required architecture finding in this reviewed scope.
- **Security:** inspected the fixed Altovo host/operation allowlists, explicit authority/token/input prerequisites, no login, redirect rejection, fixed input shape and suppressing raw identifiers/response errors. No booking, cancellation, refund or stateful prebook endpoint is allowed. GCP script permits metadata reads only after an explicit project/authority switch; default is local metadata. No new source-backed security finding in this scope.
- **Performance:** bounded in-memory domain work and a single non-retried probe request. No required performance finding for the fixed public fixture scope. Live response sizes and operational workloads were not exercised.

Initial-review historical evidence: `node --test tests/decision.test.mjs tests/money.test.mjs` passed **26/26**. An isolated mutation inverting `approval.bookingVersion !== booking?.version` was killed: **9 tests failed**. The original calendar mutation survived: **26/26 passed**. The recheck above supersedes these counts and confirms both findings resolved.

All scratch files are under ignored `.local/review-core/`. `check.mjs` reproduces the now-blocked incomplete-policy outcome; `calendar-mutation.mjs` reproduces the now-killed coverage mutation; `timezone-recheck.mjs` checks the explicit zone boundaries above. Mutation output is in `snapshot/mutation-output.txt` and `snapshot/calendar-mutation-output.txt`. The adversarial scratch also observes a null approval array entry throws; current public server records are internally constructed, so this was not promoted to a required product-path finding.

Offline probe validation: default lookup reported `not-attempted/offline`; `prebook` and `cancel` were blocked; execute/retrieve without authority, token and private input was blocked. PowerShell parser reported **zero errors** for `scripts/check-gcp.ps1`. Credential values were not read or printed. No network probe, live transaction, OCR, deployment, push, cloud resource mutation or Git-state mutation occurred. Existing live Altovo/GCP/Vertex blockers in `docs/integration-feasibility.md` remain unverified by this review.
