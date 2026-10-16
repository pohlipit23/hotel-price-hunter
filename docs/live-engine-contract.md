# Private live engine comparison

16 October 2026. Approved direction: read one owner-authorised standalone,
single-room booking and compare full live EasyGDS rates before enabling a schedule.

## First slice

Use the existing retrieval/search contracts in `docs/data-contract.md` and
`docs/integration-feasibility.md`. Implement a private local runner and reusable
read adapter, separately from the public fictional customer routes. No live data
is inserted into `jury-booking`, Firestore visitor state or simulated operations.

The owner selects the tenant, booking and local credential source. Never infer
ownership from a historical booking code or from available credentials. Existing
bearer credentials remain in process memory/environment. No login, prebook,
booking, cancellation, refund, email, model request or cloud change is included.

Read operations are limited to generic lookup, operator detail, hotel retrieval,
one single-hotel availability request and one full-rates request. Fixed HTTPS
tenant origins, exact input schemas, request deadlines, bounded JSON responses,
no redirects, and no automatic retries constrain the external boundary. Supplier
errors produce fixed codes rather than raw response bodies or request URLs.

Preserve opaque search/hotel/offer/supplier/source/contract/room identifiers in
private memory. Strip traveler names, contact/payment data and credentials from
all retained reports. The terminal reports aggregate status and reason codes only.
Private optional reports belong under ignored `.local/`, never public routes.

## Comparison evidence

Search the retrieved hotel's exact authorised dates, occupancy/child ages and
currency. Verify booking code and hotel identity across responses. Operator stay
dates are authoritative; cancellation dates never stand in for stay dates.
Ambiguous booking/product/occupancy shapes stop before searching and name the
unresolved mapping. No fabricated ages, currency conversions or default dates.

Only detailed rate totals are comparisons; availability teaser prices do not
establish a saving. Bind display amounts to their display currency and supplier
amounts separately to supplier currency. Reject ambiguous currencies, invalid
precision, expired sessions and identity mismatches. Historical response shapes
are candidates until a selected tenant's current response verifies them.

A price difference is distinct from a verified customer refund. The existing
decision core still requires verified refund costs, room conditions/equivalence
and complete cancellation schedules. Missing evidence stays unknown/blocked;
live search alone grants no execution authority. All live observations are
read-only and non-actionable, using actual request and observation times.

## Verification and remaining gates

Tests must prove default denial, fixed operations/hosts, exact schemas, deadline
and response limits, safe failures, complete rate identity, amount/currency
pairing, no invented refund and separation from the public simulation. Run the
existing Node regression suite. A controlled local HTTP test verifies the actual
fetch/parser path separately from external response stubs.

Actual live acceptance additionally requires the owner's tenant/booking and
credential-source selection, successful authorised calls, timestamped sanitised
evidence and confirmation of the observed mapping. A passing stub cannot close
that gate. Live monitoring's durable asynchronous claim/lease protocol, actual-time
offer approval/revalidation, deployment and scheduling remain subsequent slices.
