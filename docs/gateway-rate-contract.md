# Direct single-hotel gateway rates

16 October 2026. Current read-only rate source following the owner's direction to
call the Supplier Gateway directly. This supersedes bulk engine rates as the
preferred source-only probe. Original booking retrieval/customer retail accounting
remain separate; the public fictional customer flow is unchanged.

## Calls and credentials

The fixed production origin is `https://hotel-offer.gateway.easygds.com`.

| Need | Call | Required response |
| --- | --- | --- |
| Authenticate once per private execution | `POST /api/v2/login`, `{email,password}` from an explicitly selected file | `success:true`, `data.auth_token`; token remains in memory |
| Rates for exactly one known hotel | `POST /api/v2/search-by-id` with the hotel ID, dates, one room's occupancy, nationality/residence and fresh trace/session context | `success:true`, `request_id`, source/room/rate data |

The rate request uses `x-key` = selected gateway email and `x-access-token` =
gateway token. IAM bearer tokens are not substituted. The scraper IAM account
returned gateway `user not found`; the owner then explicitly selected
`C:/Users/pohli/Sites/booking_agent/input/env.gateway.txt`, which authenticated.
No source credential file is copied, edited or printed.

`price_comparison:false` avoids requesting the extra comparison index. The initial
implementation permits one hotel, one room, explicit nationality/residence, known
child/infant ages and bounded supplier filters. It requests no package and never
calls prebook, book, retrieve, cancel or refund. Gateway read transport has a
four-MiB streamed-body limit, a 45-second deadline, no redirects or automatic retries.

The request/response contracts originate from
`../booking_agent/input/[EasyGDS] Gateway API.postman_collection.json` and its
environment host definitions. The documented hyphenated `search-by-id` route is
verified against the live service; the older camel-case reference is not used.

## Retained shape

`app/domain/gateway-rates.mjs` projects the response into:

```text
context  hotel, stay, occupancy, nationality/residence, request ID, check time
sources  supplier/source/contract and supplier-hotel identifiers, once per source
rooms    room name/type/index and source reference, once per room entry
offers   source/room references, opaque rate_detail, board, money and terms
```

No hotel images/content, account email, guest/contact/payment data, client IP,
user agent or application session value enters that projection. Complete opaque
selection identities remain in the private snapshot, never terminal output.
This is a fact projection, not a compression claim; its descriptive field names
and explicit unknowns can make its JSON larger than the already concise gateway
wire response. No full snapshot is currently sent to a browser.

Keep `price`, `net_price`, `gross_price` and conditional recommended selling price
distinct. Integer minor units are emitted only when the amount's precision is
exactly representable in its bound currency. Extra decimal precision is retained
under `moneyPrecisionEvidence`; no rounding rule is invented. Missing net/gross
stays null even if a generic `price` exists. These values do not establish the
original booking's customer retail refund.

Cancellation flags, raw deadlines/tiers and fee facts remain evidence. Do not add
a timezone suffix, assume tier currency from the rate currency, treat absent fees
as zero or infer full refundability from a boolean. Customer refund stays null
and the observation stays non-actionable. `progress:0` with returned rates does
not establish an empty search or complete supplier coverage.

## Reusable private runner

`node scripts/check-gateway-rates.mjs` is offline by default. Explicit execution
requires both private `.local` input and an owner-selected credential file. It is
denied in production/Cloud Run. The credential file can use `email: ...` and
`password: ...`, or explicit `EASYGDS_EMAIL`/`EASYGDS_PASSWORD` environment-file
keys. There is no automatic source/account fallback.

The private input contains only:

```json
{
  "hotelId": "21122615",
  "checkin": "2026-11-12",
  "checkout": "2026-11-15",
  "adults": 2,
  "childAges": [],
  "infantAges": [],
  "nationality": "my",
  "countryResidence": "my"
}
```

These are labelled test-search facts, not original-booking evidence. The local
runner supplies a fresh random session ID, a fixed probe user agent and synthetic
loopback IP; it does not collect a traveller's IP or identity. Any future customer
integration needs its separately verified context/authority contract.

```powershell
node scripts/check-gateway-rates.mjs --execute --save --input=.local/gateway-rate-input.json --credentials-file=C:/Users/pohli/Sites/booking_agent/input/env.gateway.txt
```

`--save` creates an exclusive normalised snapshot below ignored
`.local/live-engine/`. Terminal output is limited to aggregate counts/status and
the owned report path. The command itself is opt-in and makes a fresh rate read;
use the saved snapshot for later inspections rather than querying again.

See [verification and live evidence](gateway-rate-verification.md).
