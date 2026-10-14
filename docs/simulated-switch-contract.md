# Persisted simulated equivalent switch

Status: implementation contract for the next local slice, 14 October 2026. This extends [data-contract.md](data-contract.md) and delivery step 3 of [plan.md](../tasks/plan.md). All supplier actions and settlement receipts are fictional. This contract creates no live transaction, model call, scheduler, cloud resource, email or Git authority. Preserve the City Escape interface and unrelated design/brand files.

## Scope and ownership seams

The current server returns the original fixture booking and offers on every request. The new slice persists an active booking snapshot and uses it for decisions, enrolment, selection and advice. Existing origin, CSRF, session-expiry, JSON validation and structured error protections apply to both new routes. Firestore remains the runtime store; memory remains an injected test double.

The public scenario allowlist is exactly `equivalent-saving`, `material-change`, `uncertain-cancellation`. All start with the existing `DEMO_EQUIVALENT` offer and require valid current standing equivalent-only permission. Each scenario selects a fixed, server-owned fictional script. Requests cannot contain supplier results, changed prices/rooms, authority flags or a success predicate.

`material-change` produces a new candidate with a changed price and known room fact, version 2, and stops at `awaits-renewed-approval`. There is no approval endpoint in this slice. `uncertain-cancellation` first observes unknown cancellation; a separate advance reconciles the same recorded cancellation intent to a fixed known-success observation. Different-room/hotel and non-refundable execution remain later work.

## Persisted visitor aggregate

Add these fields lazily to existing visitor records inside an atomic update. Existing preferences, permission record, selected offer and session fields remain compatible.

| Field | Contract |
| --- | --- |
| `booking` | Current canonical booking, initially a copy of the fixture; version increases on verified replacement promotion. |
| `offers` | Trusted immutable candidate snapshots bound to the active booking version. Old offers remain in operation evidence, never silently rebased. |
| `bookingHistory` | Original/replacement snapshots, promotion operation ID and cancellation observation. |
| `operations` | Map keyed by deterministic operation ID; stores intent hash, snapshots, receipts and stage history. |
| `activeOperationId` | Current/latest operation ID; unresolved work prevents another operation. |
| `reservedBookingVersions` | Source booking versions already claimed by a successfully initiated operation. Reservation survives blocked, failed and completed outcomes. |
| `monitoring` | `{bookingVersion,status,reason,freeUntil}`; status is `active`, `paused` or `ended`. |

First-slice history is bounded by the fixed fixture journey. Do not evict operation identities/command receipts while their session exists. Session expiry still uses real wall time and does not reset an existing session's reservation. A fresh demo session starts a separate fictional journey. No automatic reset endpoint is added.

Each operation stores `{operationId,scenarioId,bookingId,bookingVersion,offerId,offerVersion,preferenceVersion,revision,status,stage,isSimulated,originalBooking,revalidatedOffer,finalCheckReceipt,replacementBooking,cancellation,refund,savingSecured,reasonCodes,history}`. Initial revision is 0, stage `ready`, status `running`, `isSimulated:true`, `savingSecured:false`. Null snapshots/receipts represent unavailable proof.

`refund` is `{status,amountMinor,currency,receiptId}`: status `not-started`, `pending` or `completed`; amount comes from the verified customer refund quote, never supplier margin. `cancellation` retains one deterministic intent ID and its requested/unknown/verified observations. Every stage history item is `{sequence,stage,status,demoAt,recordedAt,message}`; eligibility uses frozen `demoNow`, audit recording uses real time.

## Public state and commands

Keep the existing public state response. Change `transactionMode` to `simulated`, return the persisted active `booking`/current `offers`, and add:

```js
simulation: {
  scenarioId: 'equivalent-saving', // selected/latest scenario
  nextIntent: { scenarioId, offerId, offerVersion, bookingVersion,
    preferenceVersion, idempotencyKey }, // default scenario; null if unavailable
  scenarios: [{ id, label, intent }], // each allowlisted scenario, same intent shape
  operation: null, // active/latest safe public operation view
  history: [] // its ordered stage/refund history
}
```

The public operation view omits internal request hashes, dedupe maps and session identifiers. All exposed snapshots/receipt IDs are fictional; expose no private supplier data. The UI uses current `simulation.operation` as authoritative.

| Route | Strict request | Response |
| --- | --- | --- |
| `POST /api/switches` | `{scenarioId,offerId,offerVersion,bookingVersion,preferenceVersion}` plus required `Idempotency-Key` matching the server-issued intent key | Current public state; additive `replayed` boolean and optional `replayedCommand`. |
| `POST /api/switches/:operationId/advances` | `{expectedOperationRevision}` positive-or-zero integer | Current public state with the same replay fields. Exactly one next stage or one reconciliation observation per accepted command. |

No arbitrary operation ID, offer or scenario is accepted. The caller's session must own the operation. All input fields and nested schemas are allowlisted. Start validates enrolment, active booking version, current preference version, trusted candidate version and `evaluateOffer(...).authority === 'standing'` inside the atomic callback. Selection/advice alone grant no permission.

The deterministic initiating key binds protocol version, visitor scope, scenario, source booking ID/version and candidate offer ID/material version. The server exposes the safe derived hash; it does not expose the session identifier. It does not include an attempt timestamp/random UUID or current preference version. A canonical request hash includes the complete accepted request, including preference version. Thus retries retain one identity and changed payloads cannot silently acquire the original result.

Inside the atomic callback, first look up an existing key and compare the request hash. Exact replay returns current state with `replayed:true`; changed payload returns `422 IDEMPOTENCY_PAYLOAD_MISMATCH`. Only a new key proceeds to version/authority validation. This order permits replay after booking promotion. New requests against a reserved source version fail; alternate scenario names do not create a second replacement on the same original booking.

An advance command identity is operation ID plus `expectedOperationRevision`. Store its canonical payload hash and a small prior result `{revision,stage,status}`. Exact replay returns current state and that receipt as `replayedCommand`; it never rewinds the displayed operation or advances again. Changed payload under that identity fails with the mismatch error. An unseen revision that differs from the current operation revision fails with `409 OPERATION_VERSION_CHANGED`. Every committed accepted stage increments the operation and visitor revisions once. A completed or stopped operation cannot progress except the explicitly allowed cancellation reconciliation.

Errors retain `{error:{code,message,details?}}`: malformed JSON 400, expired/missing session 401, origin/CSRF 403, unknown scenario/offer/operation 404, stale booking/preferences/operation or `SWITCH_IN_PROGRESS`/`SWITCH_NOT_AUTHORISED` 409, invalid fields/key or payload mismatch 422, storage unavailable 503. Use `INVALID_IDEMPOTENCY_KEY`, `IDEMPOTENCY_PAYLOAD_MISMATCH`, `OPERATION_NOT_FOUND` and `OPERATION_VERSION_CHANGED` consistently. Domain reason codes accompany authority failures; an unavailable store never yields synthetic success.

## Shared transition runner

Server initiation and advance functions are shared domain/application functions. The labelled advance-demo control calls these functions through HTTP; future scheduled checks can call the same functions with the same intent identity and current persisted state. No separate UI-only lifecycle or scheduler exists in this slice.

| Committed stage | Required proof and resulting state |
| --- | --- |
| `ready` | Atomic claim reserves the original version and records trusted input/permission snapshots. No replacement/cancellation/refund yet. |
| `revalidated` | Fictional final check records a distinct receipt, full trusted snapshot, checked time and check kind. Re-evaluate money, conditions, cancellation, expiry and current authority. Changed material version 2 stops as `awaits-renewed-approval`; no secure step occurs. |
| `replacement-secured` | Recheck current versions and standing authority; record one deterministic simulated replacement identity and candidate snapshot. Original remains active. |
| `fulfilment-verified` | Independently verify the replacement's fictional fulfilled status. A reservation or generic success alone is insufficient. Original remains active. |
| `cancellation-requested` | Verify fulfilment and current authority/version gates; record one original-cancellation intent. Original remains the authoritative baseline pending observation. |
| `cancellation-verified` | Known cancellation proof atomically promotes replacement to booking version +1; set `savingSecured:true`, refund `pending`, and monitoring baseline/permission carry-forward. Unknown observation instead commits `agency-exception`, keeps original booking active, `savingSecured:false`, refund `not-started`. |
| `refund-completed` | Record one deterministic simulated refund receipt for the quoted amount/currency, set status `complete`. This is the first refund-completed claim. |

Normal running stages retain status `running`. Defined non-running statuses are `awaits-renewed-approval`, `agency-exception`, `failed`, `complete`. A blocked eligibility recheck before any replacement may end `failed` with explicit reasons. After a replacement exists, loss of permission/current facts or failed fulfilment enters `agency-exception`; never cancel merely to finish the demo. No customer approval is invented.

Unchanged revalidation retains material offer version 1 and complete original rate identity. A separate final-check receipt proves the server compared original/current trusted facts. Time/check-kind/evidence receipt metadata can change without changing material version. Any changed complete rate identity, money, room/equivalence, dates, occupancy, cancellation or refund terms creates version 2. The existing conservative `offer.version > 1` guard remains. No client flag can assert unchanged revalidation.

Every destructive simulation step rechecks versions/authority inside the transaction. Once cancellation is verified, refund completion and unresolved recovery must continue even if monitoring/standing permission is later revoked. Before cancellation verification, monitoring may pause but recovery still checks the recorded intent. Reconciliation never reissues replacement, cancellation or refund mutations whose result is unknown.

## Atomicity and recovery

Use existing `storage.update(id, synchronousChange)`: the one visitor document serializes intent claim, stage CAS, fictional effect receipt, command dedupe, history, booking promotion and refund receipt together. The test-memory implementation must preserve the same atomic semantics. Adapter logic is a synchronous deterministic fixture interpreter returning facts to persist, with no network calls, external mutation, mutable counters, model generation or random identity generation inside the callback.

Firestore can rerun a transaction callback after concurrent edits and commits writes together. Therefore callbacks must be pure and all externally observable fictional results must be stored only through the successful aggregate commit. See the [official Firestore transaction contract](https://docs.cloud.google.com/firestore/native/docs/manage-data/transactions). Two concurrent identical starts/advances produce one committed stage and one replay. Concurrent differing starts cannot both reserve the same original version. A storage failure leaves the preceding committed stage authoritative; retries reuse its command identity.

A future real supplier adapter requires an additional durable claim/outbound-intent/reconciliation design outside transaction callbacks. This simulation's atomic fictional receipts are not proof of live exactly-once supplier effects.

For `uncertain-cancellation`, the unknown observation is a persisted exception event. The next fresh expected-revision advance performs a check of the same cancellation intent and receives the fixed known-cancelled observation; it then commits `cancellation-verified`. Replaying the old unknown command stays a replay. No second cancellation request, refund or replacement occurs. Other unknown outcomes remain stopped with explicit proof gaps rather than automatic retry of mutations.

## Active booking and permission continuation

On verified cancellation, copy replacement hotel/stay/occupancy/room/retail/supplier/cancellation/fictional fulfilment into the active booking, retain logical booking ID, and increment booking version. Keep the original and operation snapshots immutable. Clear stale selection and old active offers. Do not relabel original USD 600.00 as the ongoing baseline or advertise the original offer as another saving against USD 540.00. New searches must explicitly bind to the new baseline; this slice can expose no new current offers.

The initial enrolled watch monitors the original refundable booking until its free deadline. `continueMonitoring` controls continuation after a successful switch; disabling it does not stop the original watch before any switch. After promotion, monitoring uses replacement retail, conditions and free deadline. It is `active` only while `continueMonitoring` is true and the replacement is refundable/currently free; otherwise `ended` or `paused` with a reason. The reservation and unresolved recovery are independent of ordinary monitoring eligibility.

Carry standing equivalent-only permission only when the original confirmed continuation scope supports continued monitoring and current preferences/permission remain valid and unrevoked. Persist a derived record bound to the new booking version/current preference version, retaining original confirmation ID/time, scope and provenance plus `sourceBookingVersion`, `targetBookingVersion`, `carriedAt`. It is explicitly derived permission, not a new customer confirmation. Do not silently reuse an old booking-version approval; never carry offer-specific approval. If the original continuation authority is not evidenced, monitoring may show awaiting confirmation and automation remains unavailable.

## UI and verification

Add a clearly labelled simulated scenario selector and advance-demo control near the existing comparison/history area. Preserve enrolment and City Escape layout. Show the operation stage, original/replacement snapshots and separate labels for saving secured, refund pending and refund completed. Before cancellation proof, use pending/exception wording; USD 55.00 is a proposed refund, not secured saving. Unknown cancellation shows an agency-exception explanation and a distinct recovery advance. Reload restores the same operation/stage/history. Disable control while one request is in flight and refresh on revision errors; server guards remain authoritative.

Focused verification must prove persisted refresh/restart, six ordered happy-path advances, no cancellation before verified fulfilment, promotion only after cancellation verification, separate refund completion, equal intent replay/mismatched payload rejection, concurrent starts/advances, exact old-stage replay, stale booking/preferences/authority rejection, invalid scenario/operation rejection, unchanged final-check receipt/version 1, material-change version 2 stop, unknown cancellation with no secured saving/refund, and same-intent recovery without another mutation. Emulator evidence verifies real transaction behavior; mock persistence alone does not. Browser acceptance covers scenario selection, stage/refund history, reload, keyboard and mobile/desktop layout. No new model or cloud-resource call is part of verification.
