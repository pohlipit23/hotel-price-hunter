# Non-refundable approval and local agency review

Frozen implementation contract, 15 October 2026. This extends [booking-postcard-contract.md](booking-postcard-contract.md) and [simulated-switch-contract.md](simulated-switch-contract.md). It supersedes their non-refundable selected-offer exclusion for the single fictional `DEMO_NON_REFUNDABLE` offer. All other postcard, money, authority, recovery and replay requirements remain. This document records the coordinator's chosen seam; it is a specification, not verification evidence.

The authorised slice is local source, tests and browser acceptance. It grants no live supplier action, Google Cloud change, identity grant, deployment, Git publication or model generation. All five previously approved Vertex attempts are exhausted. Existing advice APIs remain, but the new customer and agency flows make no AI calls.

## Customer experience and consequence

Keep the three existing refundable alternatives as the normal postcard. Put the optional fourth alternative in a collapsed native `details` section. No fourth card appears by default, and the section never opens automatically. No questionnaire, customer settings form, chat, scenario selector or `/demo-lab` is added. Preserve the approved RoomDrop wordmark, ivory key icon and ink/coral/ivory palette.

`DEMO_NON_REFUNDABLE` is Example Harbour Hotel, Deluxe King, city view, with the existing dates and occupancy. Its whole-stay customer retail total is USD 480 (`48000` minor units); the potential refund after USD 5 fees is USD 115 (`11500` minor units). Use trusted retail and refund-quote amounts, never supplier cost. Label it `Same hotel`, `Equivalent room` and `Non-refundable`; room equivalence does not imply equal flexibility.

Review states that the replacement has no free cancellation and that normal price monitoring ends after the successful replacement is promoted, once original cancellation is verified. Before promotion, the original booking and its monitoring state remain authoritative. Merely comparing, selecting, opening/closing the section, going back, keeping the booking or reloading grants no authority and does not end monitoring.

The review includes a separate, initially unchecked acknowledgement: `I understand that this booking is non-refundable and price monitoring will end after the replacement becomes active.` Approval requires this acknowledgement and the existing deliberate approve action. Never infer the acknowledgement from selection, an enabled button, a previous offer's review, a standing permission or a stored preference. Reset it on a new comparison; an uncertain same-command retry preserves only the already submitted exact body and key.

Show the non-refundable refund as potential until cancellation proof; keep saving secured and refund pending/completed separate. The review displays `Net saving after fees`, `-USD 115` and `Potential refund after USD 5 fees`.

## Selected-offer HTTP seam

`simulation.offerApprovalIntents.DEMO_NON_REFUNDABLE` is eligible only when the current trusted original booking is refundable, all essential conditions/cancellation/refund facts are known, the offer is current, net saving meets the existing threshold and the source booking version is unclaimed. Standing permission alone cannot approve reduced flexibility. Unknown facts remain blocked even after acknowledgement.

The non-refundable intent has the existing bindings and one extra literal field:

```js
{
  offerId: 'DEMO_NON_REFUNDABLE',
  offerVersion: 1,
  bookingVersion: 1,
  preferenceVersion: 1,
  materialFingerprint: '<server-computed sha256>',
  confirmed: true,
  acceptReducedFlexibility: true,
  idempotencyKey: '<server-issued sha256>'
}
```

`POST /api/offer-approvals` sends exactly the first seven fields above, with `idempotencyKey` moved to the required `Idempotency-Key` header. The three refundable requests retain exactly their original six body fields; `acceptReducedFlexibility` is rejected on a refundable request. Missing, false, null, numeric or string acknowledgements on the non-refundable request are validation failures. No client-supplied price, eligibility, supplier outcome or monitoring override is accepted.

Persist the literal acknowledgement in the immutable selected-offer approval receipt and include it in exact request hashing/replay. It is bounded to that offer, booking/preference/offer versions, material fingerprint and approval expiry. The material fingerprint already binds trusted cancellation schedules and refund facts; reduced-flexibility approval validity additionally requires `acceptReducedFlexibility === true`. Changing cancellation terms, versions, the fingerprint or the acknowledgement cannot reuse the old approval. It grants no standing authority, preference change or continuation scope.

Keep the existing atomic approval/start/source-version reservation, exact same-command replay, mismatch errors, origin/JSON/customer-session/CSRF checks and storage-failure behavior. Replaying a saved initiating command after promotion returns current state without a second operation. New concurrent approvals for the same source version remain rejected.

## Monitoring and recovery

Non-refundable successful promotion sets normal monitoring to `{status:'ended', reason:'NON_REFUNDABLE_BASELINE'}` regardless of `enrolled` or `preferences.continueMonitoring`. Check the non-refundable baseline before the ordinary `NOT_ENROLLED` and continuation-preference branches. `permissionRecord` is cleared; selected-offer authority never carries to the replacement. The stored enrolment and preferences need not be altered to represent this consequence.

Approval, revalidation and merely securing a replacement do not promote it. Fulfilment proof must precede original cancellation; cancellation proof must precede promotion and secured saving. Unknown original cancellation leaves the original active, enters an agency exception, secures no saving and starts no refund. A later deliberate reconciliation observes the already recorded cancellation intent; it does not create another cancellation request.

Recorded cancellation reconciliation and refund settlement continue past the normal monitoring deadline or later approval revocation. Ending monitoring creates no new replacement/cancellation authority. Pre-cancellation authority or fulfilment stops remain distinct from unknown cancellation. Preserve backend-injected material-change and uncertain-cancellation fixtures without exposing a customer scenario UI.

## Agency authentication boundary

Agency cases are read-only fictional operations in this slice. `GET /agency` may serve a public login shell; no protected case data, credential, role grant or activation secret appears in its HTML, JavaScript, bootstrap or static assets. Customer session cookies grant no operator access.

Authentication is denied by default. An absent/disabled agency configuration keeps protected agency APIs closed (`503 AGENCY_UNAVAILABLE`); an enabled configuration with a missing, invalid, expired or revoked operator session returns `401 AGENCY_SESSION_REQUIRED`. Never use client role fields, browser claims, visitor cookies, arbitrary headers, forwarded identity or a forwarded address as authentication.

The only implemented provider is explicitly enabled **local fixture review**. Configuration requires all of:

- A loopback application listener and matching loopback `APP_ORIGIN`.
- Firestore emulator storage in an explicit `demo-` project namespace.
- Neither `NODE_ENV=production` nor `K_SERVICE`.
- A separately generated 256-bit operator passphrase, with a server-side scrypt digest and constant-time verification.

Invalid enablement fails closed. A loopback origin by itself does not restrict a `0.0.0.0` listener. Startup may create the local review configuration outside storage transaction callbacks. The user's manual-access file is `.local/agency-review.json`, already covered by `.local/` ignore rules. Keep it untracked; never print its secret, include it in screenshots/evidence, return it from APIs or embed it in static code. Tests inject their own credentials. This configuration changes no cloud credential, IAM grant or public access setting.

Successful login generates a new opaque 256-bit server-side operator session and revokes the previous session presented for rotation. Use an HttpOnly, SameSite=Strict cookie scoped to `/api/agency`, Secure when HTTPS is used. Enforce a 30-minute absolute expiry on every protected request using actual time, independent of the fictional demo clock and cookie lifetime. Sessions and pagination cursors are in-memory, bounded and invalidated on process restart. Expired entries are removed. Operator session identity and CSRF tokens are independent of customer state. Login has a strict local limit of ten attempts per fifteen minutes and generic failures; never log credentials or accept forwarded headers as limiter identity.

This proves only local credential/session handling. Production operator identity, token verification, tenant/role membership, resource authorisation, deployment/session persistence and shared rate limiting remain explicit future gates. No real IAM integration is validated or enabled by this slice. Public and Cloud Run agency APIs remain closed until a separately authorised verified provider is implemented.

## Agency HTTP seam

Keep the existing `{error:{code,message,details?}}` envelope, 16 KiB JSON limit, security headers and `Cache-Control: no-store`. Authenticate before reading case storage or disclosing whether a case exists. Login and logout require the exact configured origin and reject cross-site requests. Logout also requires the current operator `X-CSRF-Token`; case APIs have no mutation action.

| Route | Request and response |
| --- | --- |
| `POST /api/agency/session` | Exactly `{passphrase}`; successful login returns the safe session shape below and sets/rotates the operator cookie. |
| `GET /api/agency/session` | Current authenticated session metadata only; no visitor state. |
| `DELETE /api/agency/session` | No JSON body required; exact origin and operator CSRF header; revoke session and clear cookie. Successful response `{authenticated:false}`. |
| `GET /api/agency/cases?limit=20&cursor=<opaque>` | Only `limit` and `cursor` query parameters; integer limit 1–50, default 20. Return `{cases:[summary],nextCursor:null|string}`. |
| `GET /api/agency/cases/:caseId` | Authenticated exact opaque case lookup; return `{case:detail}` or generic 404. |

Safe session shape:

```js
{
  authenticated: true,
  role: 'agency-reviewer',
  mode: 'local-fixture-review',
  expiresAt: '<actual ISO instant>',
  csrfToken: '<operator-session CSRF token>'
}
```

The role is a server-selected label after actual authentication, never an input. Sending it as a header/body cannot grant access. Unknown agency mutation routes cannot reach customer commands.

Each list summary has exactly `caseId`, `isSimulated:true`, `status`, `stage`, `hotelName`, `updatedAt`, `reasonCodes`, `cancellationStatus`, `savingSecured`, `refundStatus` and `monitoringStatus`. Use null for an absent cancellation status. `hotelName` is the source booking's fictional hotel.

Detail explicitly allowlists these nested fields:

```js
{
  caseId, isSimulated: true, status, stage, revision, reasonCodes,
  sourceBooking: { version, hotelName, roomName, refundability },
  replacement: null /* or {hotelName, roomName, refundability,
                            fulfilmentStatus, fulfilmentVerified} */,
  authority: { type, scope, confirmed, bookingVersion, offerVersion,
               preferenceVersion, /* acceptReducedFlexibility only if present */
               expiresAt, revokedAt, valid, reasonCodes },
  cancellation: null /* or {status, originalActive, proofPresent,
    observations:[{status, demoAt, recordedAt, isSimulated, proofPresent}]} */,
  savingSecured,
  refund: { status, amountMinor, currency },
  monitoring: { status, reason },
  history: [{ sequence, stage, status, demoAt, recordedAt, message }]
}
```

`authority.valid` describes current authority binding; a false binding after successful promotion does not block recovery/refund or imply that the original approval was absent. Differentiate recorded authority loss, missing fulfilment proof and unknown cancellation using actual reason codes. Proof booleans represent saved simulated evidence, never live supplier verification. `originalActive` remains true until saved original-cancellation proof. Null/missing data must not fabricate proof, money or approval.

Build every object from the allowlist rather than spreading storage state or reusing the broader customer-operation serializer. Omit visitor/document/session IDs, customer CSRF, cookies, credentials, internal locators, operation IDs, approval IDs, receipt/intent IDs, initiating keys, request/material hashes, command maps, raw source/offer snapshots, supplier identities/tokens/cost and private booking data. Existing operation and proof IDs incorporate the initiating key, so even apparently harmless proof identifiers are excluded. History messages are fixed application messages rendered as text.

## Private case index and pagination

Maintain a private `agencyCases` index for **new** fictional operations only. Each index row has an independently random opaque `caseId` and an internal visitor-document/operation locator. Generate the case ID once before a retryable visitor-update callback; use the same value across retries. Atomically write the index row and visitor operation in the existing storage transaction. Failure must leave neither a false case nor a successful-looking operation response. Mirror these semantics in the injected memory storage.

Case listing queries this index in stable document order with a bounded limit plus at most one look-ahead row. Detail follows one private locator to one visitor document and checks that the referenced fictional operation exists. Never scan the entire visitor collection to find an operation. Index rows and document positions never appear in responses. Existing historical operations have no promised backfill or completeness; local acceptance uses operations created after this seam.

Pagination uses random opaque tokens in an expiring server-side map bound to the authenticated operator session, mapped to the private index position and limit. Bound map size and token length. Tokens from another/expired/revoked session, changed limit or malformed input reject; raw/base64 visitor IDs cannot serve as cursors. Listing performs no customer mutation and does not create bootstrap sessions, approvals or recoveries. Authentication failure must perform no protected storage lookup.

## Agency UI and required evidence

The agency page labels the mode `Local fixture review` and all effects simulated. Show login, current expiry/logout, bounded case list and deliberate detail opening. Show actual exception reasons, original-active state, fulfilment/cancellation proof, authority binding, saving/refund state and collapsed history. Provide no operator advance, cancel, refund or approval button. Customer recovery remains the existing explicitly guarded customer action.

Stable agency DOM hooks are `agency-login`, `agency-passphrase`, `agency-login-submit`, `agency-session`, `agency-logout`, `agency-cases`, `agency-case-detail`, `agency-next-page` and `agency-message`. Preserve the postcard's existing stable hooks. Use accessible labels and text rendering; never put credentials in URL, local/session storage or post-login page content.

Required domain/API evidence includes non-refundable explicit acknowledgement, every invalid acknowledgement type, refundable compatibility, exact replay/mismatch/concurrent reservation, stale material/versions, no standing grant, current-authority recheck and non-refundable monitoring priority for enrolled/unenrolled and continue-monitoring on/off. Verify recovery/refund after ordinary authority/deadline changes without a second cancellation request.

Required agency evidence includes disabled/default denial, production/nonloopback/nonemulator denial, spoofed-role/header/customer-cookie denial, actual successful login, expiry/rotation/logout/CSRF, no unauthenticated storage read, rate limiting, strict case projection, case-ID/cursor non-disclosure, bounded pages and cross-session/expired cursor rejection. Prove atomic index behavior and persistence against the emulator, not only the memory fake. Browser acceptance covers the collapsed fourth offer, separate unchecked acknowledgement, persisted manual stages/ended-monitoring/refund, protected login and read-only exception detail at mobile and desktop widths. Label fixtures, emulator/browser results and any unavailable coverage separately. None establishes deployed agency access, real identity or live supplier behavior.
