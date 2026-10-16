# Private live engine comparison

16 October 2026. Approved direction: read one owner-authorised standalone,
single-room booking and compare full live EasyGDS rates before enabling a schedule.

The owner subsequently selected **Demo.apps**. An unauthenticated read at
`2026-10-16` verified `https://demo.apps.easygds.com/api/docs/api.json` returns
HTTP 200 and OpenAPI 3.0.3 with 172 paths. All five allowlisted read paths are
published there. The exact tenant base is `https://demo.apps.easygds.com/api`;
this does not establish authenticated booking/rate access.

## First slice

Use the existing retrieval/search contracts in `docs/data-contract.md` and
`docs/integration-feasibility.md`. Implement a private local runner and reusable
read adapter, separately from the public fictional customer routes. No live data
is inserted into `jury-booking`, Firestore visitor state or simulated operations.

The owner selects the tenant, booking and local credential source. Never infer
ownership from a historical booking code or from available credentials. Existing
bearer credentials remain in process memory/environment. Normal IAM sign-in may
obtain a short-lived token only from the explicitly selected local credential
file; no automatic credential discovery or source-file modification occurs. No prebook,
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

## Local runner

`node scripts/check-live-rates.mjs` is offline by default and prints configuration
presence only. Offline mode never reads credentials or logs in.

Once the owner has selected a booking and credential source, put the selected
booking input in ignored `.local/live-engine-input.json`:

```json
{
  "baseUrl": "https://demo.apps.easygds.com/api",
  "bookingCode": "OWNER_SELECTED_BOOKING",
  "timeZone": "OWNER_VERIFIED_HOTEL_TIMEZONE"
}
```

The actual hotel timezone is required; no Malaysia timezone is inferred from the
operator's location. Supply the existing short-lived bearer token in process
environment `HPH_ALTOVO_READ_TOKEN`, the same exact base URL in
`HPH_ALTOVO_BASE_URL`, and `HPH_ALTOVO_READ_AUTHORISED=yes`. Never put a token in
command arguments. Then:

```powershell
node scripts/check-live-rates.mjs --execute --input=.local/live-engine-input.json
```

Alternatively, after the owner approves the exact existing credential source,
omit `HPH_ALTOVO_READ_TOKEN` and add
`--credentials-file=C:/path/to/owner-selected/.env`. This reads only that file,
uses its explicit `EASYGDS_IAM_URL`, `EASYGDS_EMAIL`, `EASYGDS_PASSWORD` (or
`EASYGDS_SECRET_KEY`), `EASYGDS_SCOPE_TYPE` and `EASYGDS_FLOW_TYPE`, and signs in
once through the fixed production IAM `/auth` endpoint. No default account or
scope is supplied. Ambiguous secret values are rejected. The access token stays
in memory; refresh tokens/account data are discarded and never saved. Credential
file and bearer-token modes are mutually exclusive. Invalid booking/timezone/input
is rejected before authentication. This is the engine's existing authentication,
not a new customer sign-in flow.

Add `--save` to retain a new exclusive observation file under ignored
`.local/live-engine/`. It preserves full opaque rate identities and the selected
booking code for private inspection, strips traveler/contact/payment data, and
cannot be served by the public application. The terminal contains aggregate
counts/gates only. Treat this file as private, not a jury fixture or public report.
No response body is saved on failure and no existing report is overwritten.

Current supported mapping requires a single `BookingProduct.product_code=hotel`,
exact civil stay dates, typed travelers with explicit room index and known age
or birthday, one retrieved room, matching booking/shopping/hotel identities and
hotel status `vouchered`. `success` on the generic endpoint does not establish
hotel fulfilment. The first current response must verify the historical extended
date/traveler fields: Demo.apps' published `BookingDetail` schema does not specify
those fields. Its generic response need not contain a hotel member: the operator
product provides explicit hotel-scope evidence before hotel retrieval. Missing
required mapping fields stop the pipeline before search rather than inventing facts.

Full rates currently require the historically observed flat `offers[]` shape;
the current published rates response is only `type: object`. Display currency
uses a string `currency_info.conversion` paired with `price_info.total_amount`;
supplier cost uses a separate string `currency_info.original`. The published
shared schema instead calls one field `origin`; this discrepancy remains an
explicit mapping gate, and missing supplier-currency evidence stays null.
No response alias or currency conversion is inferred. The observation marks all
live mappings unverified until the selected tenant's actual response is reviewed.

Use `node --test tests/live-engine.test.mjs tests/live-comparison.test.mjs
tests/live-engine-cli.test.mjs` for focused checks (one physical command line).
The end-to-end HTTP case uses a local fixture server, not the live engine.
