# Booking and decision contract v1

This application contract implements sections 2, 3, 5, 6, 8 and 9 of the agreed prototype plan. It is independent of any Altovo wire format. Public jury facts, identifiers and transactions are fictional; private adapters must validate authorised source responses before producing this shape.

## Terms and money

A **booking version** is an immutable snapshot of the active single-room hotel booking. An **offer version** is an immutable snapshot of a complete rate for that booking's dates and occupancy. An **equivalent** offer requires evidence for the same hotel, equivalent room and preserved known features; a room-matcher's comparable label alone supplies no permission.

**Retail total** is the customer's whole-stay total, including known taxes and fees. **Supplier cost** is the agency's cost with its own currency. **Net saving** is the amount the agency commits to refund to the traveller after relevant costs. Supplier margin gain is a separate calculation and never substitutes for a customer refund quote.

All amounts are safe integers in minor units. Currency metadata is `{code:"USD",minorUnit:2}` in the demo. Every amount carries an explicit currency or is grouped with an explicit currency. Unknown amounts are `null`, never zero. No FX conversion is allowed in v1: any decision-relevant mismatched currency is blocked. Supplier cost can legitimately use another currency only when it is retained for reporting and excluded from refund arithmetic; a calculation that needs it must remain blocked without an agreed conversion policy.

`retail` is `{totalMinor,currency,taxesMinor,feesMinor,includedInTotal:true}`. Taxes and fees describe components already included in total and must not be added twice. Unknown taxes/fees or whether the total includes them blocks execution. `supplierCost` is `{totalMinor,currency}` and cannot be relabelled retail.

`refundQuote` is `{status,basis,originalRetailMinor,replacementRetailMinor,originalCancellationMinor,switchFeesMinor,refundProcessingMinor,netSavingMinor,currency,source}`. The implemented demo basis is `retail-difference`:

```text
netSavingMinor = originalRetailMinor - replacementRetailMinor
                - originalCancellationMinor - switchFeesMinor - refundProcessingMinor
```

The quote must match both retail snapshots, the original's current cancellation penalty and the agency policy evidence. Each relevant cost must be explicit. A verified quote authorises no transaction. Live refund accounting and settlement mapping remain unresolved. Another agency basis requires a separately documented contract; supplier savings alone do not prove retail savings.

## Canonical records

See the complete fictional JSON in [jury-booking.json](../fixtures/jury-booking.json). Required record fields are:

| Record | Fields and meaning |
| --- | --- |
| Fixture envelope | `schemaVersion:1`, `scenarioId`, `isFictional:true`, `mode:"public-jury"`, `description`, `currency`, `agencyMinimumSavingMinor`, `agencyMinimumSource`, `booking`, `offers[]`, `preferences`, `approvals[]`, `scenarios[]`, `provenance` |
| Booking | `bookingId`, positive integer `version`, `scope:"standalone-hotel"`, `roomCount:1`, `hotel:{id,name}`, `stay`, `occupancy`, `room`, `retail`, `supplierCost`, `cancellation`, `source`, `fulfilment` |
| Stay | Authoritative `checkin` and `checkout` civil dates (YYYY-MM-DD), `timeZone` IANA zone. Never derive stay dates from cancellation tiers. |
| Occupancy | `adults` count, complete `childAges[]` and `infantAges[]` at travel. Adult ages are omitted from the public record. Historical search requires age arrays; the private adapter must resolve that requirement from authorised facts without manufactured defaults. |
| Room | `name`, `conditions:{boardBasis,bedType,nonSmoking,accessible,view,roomSizeSqm}`; scalar values or `null` for unknown. More confirmed conditions may be added. No free-text model output replaces verification. |
| Offer | `offerId`, `version`, bound `bookingVersion`, `category`, `hotel`, `stay`, `occupancy`, `room`, `equivalence`, `identity`, `retail`, `supplierCost`, `cancellation`, `checkedAt`, `expiresAt`, `checkKind`, `refundQuote` |
| Offer category | `equivalent`, `different-room`, `different-hotel`. `equivalence` separately states `verified`, `different` or `unknown`; category is presentation, not execution authority. |
| Complete identity | `searchId`, `hotelId`, exact opaque `offerToken`, `supplierCode`, `sourceId`, `contractId`, `roomIndex`, `roomTypeId`, `shoppingId`, `prebookId`. Last two are null before final checking. Preserve all other adapter-required identifiers and never truncate, rebuild or reuse across expired searches. |
| Preferences | Positive integer `version`, `essentialRequirements` scalar map, `automaticEquivalentSwitches` boolean, `minimumSavingMinor`, `notificationFrequency:"weekly"\|"daily"\|"offers-only"`, `continueMonitoring` boolean |
| Source/evidence | Safe source kind/reference, capture/check time, and per-field mapping or unresolved status. No raw personal data, supplier booking codes, tokens or credentials in public documents. |
| Fulfilment | Public fixture `{status:"simulated-fulfilled",liveVerified:false}`. Live status and room status are preserved separately by a private adapter; no live success predicate is yet accepted. |

Known baseline room features remain constraints on automatic equivalence even when a customer deletes or changes a prefilled essential. Customer requirements add constraints; removing a requirement cannot silently authorise a downgrade. A known baseline difference can be presented as a specific alternative requiring approval. A mismatch against a current customer essential blocks execution until the customer separately corrects that requirement. Unknown essential or baseline conditions block execution pending evidence, including after specific approval.

## Cancellation time and flexibility

`cancellation` is `{refundability:"refundable"\|"non-refundable"\|"unknown",freeUntil,timeZone,schedule[]}`. Each schedule tier is `{from,to,penaltyMinor,currency}`. The canonical interval is **[from,to)**; contiguous tiers cannot overlap or leave gaps in the decision horizon. Times have explicit UTC Z or a numeric offset and the schedule records an IANA timezone. The free deadline is an instant; display it in the stated zone. At exactly `freeUntil`, the penalty tier applies and original price monitoring is no longer eligible.

Naive timestamps are rejected unless a documented source field explicitly establishes UTC and the adapter records that mapping. Null source currency or missing tier price/currency is unresolved; never borrow a convenient currency silently. A boolean free-cancellation flag alone cannot prove unchanged flexibility. Both contiguous schedules must cover the current instant through at least the start of the checkout civil date in the stay timezone. This boundary is an explicitly conservative minimum, not an inferred hotel checkout clock. The original's complete declared policy tail establishes the remaining horizon; the replacement must cover the later of that tail and the checkout minimum. A shortened tail, gap or missing post-free terms within that horizon is unknown and blocks execution before any authority is considered, including a valid specific approval. Automatic switching requires a still-free original window and a verified replacement schedule with the same or later free deadline and no worse penalty at every boundary in the original horizon. Fully known reduced flexibility remains an alternative requiring offer-specific approval.

A replacement's current baseline and free deadline govern continued monitoring. An approved non-refundable replacement ends ordinary monitoring; recovery of an unresolved operation continues.

## Authority and revalidation

Standing permission uses an explicit affirmative confirmation record separate from preferences:

```json
{
  "approvalId": "DEMO_STANDING_001",
  "type": "standing",
  "scope": "equivalent-only",
  "permissionVersion": 1,
  "bookingId": "DEMO_BOOKING_001",
  "bookingVersion": 1,
  "preferenceVersion": 2,
  "confirmed": true,
  "confirmedAt": "2026-10-12T02:10:00Z",
  "revokedAt": null
}
```

A false preference needs no confirmation record. Setting the boolean true alone grants no authority. Server confirmation must bind the current booking/preference versions and be affirmative; reject stale versions. Future replacement monitoring needs an explicitly recorded permission carry-forward under the agreed scope, never an accidentally reused old booking-version approval.

Specific approval is `{approvalId,type:"offer",scope:"selected-offer",bookingId,bookingVersion,preferenceVersion,offerId,offerVersion,materialFingerprint,confirmed:true,confirmedAt,expiresAt,revokedAt:null}`. The fingerprint covers booking identity/version, complete offer identity/version, dates, occupancy, room facts/equivalence, retail totals, included components, supplier-cost pairs, cancellation schedules, refund quote and preference constraints/version. Checked time and display text are not material by themselves. Advice, selection, silence and T&C acceptance create no permission.

Revalidation returns a new offer version. Any material change invalidates the relevant specific approval and returns the offer for renewed approval, even if its new price still meets the threshold. It cannot be hidden by reusing an old offer version. Standing authority must be re-evaluated against changed facts; a materially changed selected offer requires renewed offer approval rather than executing from stale selection. Execution remains revalidate → secure replacement → verify fulfilment → cancel original → verify cancellation → process refund. Saving secured, refund pending and refund completed are distinct states. Unknown cancellation goes to agency exception and is checked before retrying.

## Domain and public runtime seam

Recommended deterministic exports from `app/domain/decision.mjs`:

```js
evaluateOffer({ booking, offer, preferences, agencyMinimumSavingMinor, approvals = [], now })
// { action: "automatic" | "approval-required" | "blocked", reasons: string[], netSavingMinor: number | null, authority: "standing" | "offer-approval" | null }
validatePreferences(preferences, { booking, agencyMinimumSavingMinor })
// normalized preferences including version; throws code INVALID_PREFERENCES with details
materialFingerprint({ booking, offer, preferences }) // stable SHA-256 hex of material facts
isApprovalValid(approval, { booking, offer, preferences, now }) // boolean
```

The server assigns preference version `current+1`; the validator defaults absent version to 1 for standalone callers. Meeting the saving threshold includes equality and uses max(agency minimum, customer minimum). A specific approval is validated only against checked, otherwise eligible facts; it cannot bypass missing money, currency, dates/occupancy, expiry or unknown conditions. The `automatic` result means execution is authorised; `authority:"standing"` or `authority:"offer-approval"` must distinguish standing automatic permission from an individually approved alternative. An offer version greater than 1 conservatively requires a renewed specific approval in this prototype, including when unchanged metadata could otherwise have been reused. Fictional confirmations use demoNow as confirmedAt and may separately store actual recordedAt; private confirmations use real time.

Public runtime routes are application routes, not Altovo endpoints: bootstrap loads only allowlisted scenarios; enrolment accepts preferences and a separate equivalent-only permission confirmation; selection stores offerId/bookingVersion without granting authority; advice receives the chosen facts and customer message. None calls live booking, cancellation or refund endpoints.

## Field provenance and live gates

All fixture leaves default to `provenance.default = fictional-demo / jury-booking-v1 / liveVerified:false`. Policy decisions trace to the agreed plan; schema names are application-owned. This default covers every fictional identifier, name, date, amount, condition, simulated check, expected outcome and simulated fulfilment flag. The table maps the corresponding live fields without asserting present-day behaviour.

| Canonical fields | Located evidence | Required unresolved live mapping |
| --- | --- | --- |
| scope, roomCount, identifiers/version | Agreed plan §2; HOTEL_BOOKING_FLOW §2 and §8 | Operator booking product must actually be hotel-only and one room; local versions are application generated. No public real identifier. |
| hotel, identity.* | EASYGDS_HOTEL_API_GUIDE §5.3, §6.2, §7.3; HOTEL_BOOKING_FLOW §8 rows 16–19 | Preserve all tenant-specific identifiers. Historical room_type_id is unstable; id equality proves no room equivalence. shopping/prebook ids must remain private. |
| stay, occupancy | HOTEL_BOOKING_FLOW §1 row 2b, §2, §8 rows 8c/19; API guide §5.2 | Authoritative operator dates/travellers; birthday-to-age policy and complete children/infants. Retrieve alone lacks dates. No inferred dates/ages. |
| room.conditions, equivalence | scraper room-matching-typesafe.md §Composition, §Production integration notes; room-match.js composition | Advisory matcher permits unknown caveats. Application explicitly rejects unknown essential facts; live mapping still needs verified room evidence. |
| retail.* | API guide §1.2 tenant caveat, §6.3–6.4; BOOKING_FLOW §2, §8 rows 11/18/20 | Bind each retail amount to actual retail tenant currency and taxes/fees. Historical responses disagree; request currency, supplier currency and old_amount are not safe substitutes. |
| supplierCost.* | API guide §6.3; BOOKING_FLOW §9 R1/R2 | Preserve bound supplier-total currency; rate lists may lack supplier amounts; no-markup tenant is not retail evidence. |
| cancellation.* | API guide §6.5, §7.3; BOOKING_FLOW §2, §8 row 8 | Rates may use original_cancellations with UTC field names, retrieve enriched tiers. Null currencies and endpoint-specific rounding need resolution. The historical UTC assertion supports a mapping candidate, not an unchecked naive timestamp. |
| checkedAt, expiresAt, checkKind | API guide §5.3 expire_at, §7.3; agreed plan §6/8 | Capture actual check time, session/offer expiry, and final-check facts; teaser excluded. API prebook creates a shopping session and is not assumed read-only. |
| refundQuote.* | Agreed plan §1/6; BOOKING_FLOW §9 R1 explicitly concerns margin optimisation | Agency must verify traveller refund accounting, cancellation costs, extra fees and settlement. Historical wallet refunds do not establish traveller payment receipt. |
| preferences/approvals | Agreed plan §3/5/6 | Application-owned confirmed input and versions; authenticated confirmation/current versions are required. |
| fulfilment.* | BOOKING_FLOW §3 steps 7–9, §8 row 15 | Historical confirmed intermediate / vouchered terminal claim remains unresolved live. Generic success and room-level success are separate statuses. Cancellation eligibility/locked-state claims conflict and need verification. |

Located references (read-only, not imported implementation):
- [Scraper comparison reference](C:/Users/pohli/Sites/scraper/comparison-logic.md:5) links the booking agent API guide.
- [Hotel API guide](C:/Users/pohli/Sites/booking_agent/docs/EASYGDS_HOTEL_API_GUIDE.md:336) describes the later flat offers response and prebook offer_id.
- [Hotel booking flow](C:/Users/pohli/Sites/booking_agent/docs/HOTEL_BOOKING_FLOW.md:12) identifies retrieval and operator details, with historical tenant-dependent conflicts.
- [Room-matching research](C:/Users/pohli/Sites/scraper/room-matching-typesafe.md:134) documents advisory caveat policies.

Historical documented paths are hotel retrieve `POST {app_url}/v2/shopping/hotels/book/retrieve`, operator detail `GET {app_url}/bookings?booking_code=...`, search `POST {app_url}/v2/products/hotels/availabilities`, rates `POST {app_url}/v2/products/hotels/availabilities/rates`, and prebook `POST {app_url}/v2/shopping/hotels/prebook`. These were located in the references, not probed here. Host, method safety, current shape, permissions and status semantics must be verified by Task 2. This contract authorises no live prebook or transactions.

## Demo policy

The fictional baseline is USD 600.00. The configurable demo agency minimum is USD 25.00, with an explicit USD 5.00 switching fee and zero known original cancellation/refund-processing cost while free. The customer may raise the minimum. None of these values establishes a production policy. The fixture's initial automatic permission is false and approvals are empty.

The explicit frozen `demoNow:2026-10-12T03:00:00Z` governs public fictional eligibility only. Cards display the actual fictional checkedAt and label the simulated clock; do not refresh checkedAt or hide expiry to imply a live check. Private integrations and session expiry use real wall time.
