# Altovo share-link read: what it returns and how long it lasts

Resolves issue #4 (child of map #2). Research date 2026-10-18. Read-only code reading; no network calls to Altovo were made, so reachability claims are inferred from code and infra config, not tested.

Paths below are relative to the Altovo repo `C:\Users\pohli\Sites\altovo-gitlab\altovo`. Shorthand under `services\platform\src\platform_svc\domains\core\`: **B** = `bookings.py`, **S** = `booking_shared.py`, **W** = `booking_writes.py`. RoomDrop paths refer to branch `codex/customer-flow`.

## Gist

The share link gives a stateless 7-day, non-revocable token that reads the whole booking JSON (quotes included) with nothing masked, but its shape is **not** what `quotationBaseline()` consumes today: it has no `cart_items`, so no `search.payload` (travelers, nationality, residency), and products carry `product.code` rather than `product_code`. An intake adapter is needed, and nationality/residency are simply absent from the share read.

## 1. Minting the token

- Route `GET /bookings/share-token?code=<booking code>` (B:1945-2006). Requires a platform login Bearer JWT (B:1970; `auth.py:149-182`). Any scope (System, App, Agent, Customer) may mint, subject to the normal booking read policy `apply_booking_read_policy` (S:1365-1460) and `confine_to_customer_site` (B:217-236, applied B:1985). The anonymous retail-shopper account cannot mint (`auth.py:103-123`). Denied or unknown code both return `{}` (B:1983-1995).
- Response `{"code", "token", "expires_in"}` (B:1998-2006).
- Token is a stateless HMAC, not a JWT: `<exp>.<nonce>.<sig>`, `sig = HMAC-SHA256(settings.SECRET_KEY, "code|action|exp|nonce")`, action `"bookings/json"` (S:269-286). It embeds only booking code, action and expiry: no tenant, app or user.

## 2. Lifetime and revocation

- TTL: `SHARE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60` (B:94), used at B:1997. Exactly 7 days from mint; `expires_in` tells the caller.
- Revocation: none. Verification checks format, expiry and signature only (S:289-305). Not stored (no DB, no Redis), not single-use, not invalidated by logout, cancellation, status change or quote conversion. Only a `SECRET_KEY` rotation kills it (and every other token).
- Implication for RoomDrop: read once at intake and persist the facts; after day 7 a running Drop Watch cannot re-read the Original Booking through this link (open point on map #2).

## 3. The read: `GET /v2/bookings/json?code&token`

- Handler B:2044-2070. Looks the booking up by `code` across all tenants (B:2053-2057), then `verify_booking_capability(token, code, "bookings/json")` (B:2064-2066). No session, cookie or tenant header needed. Errors are HTTP 400 `"Booking not found"` vs `"Invalid token"` (B:2059, B:2068).
- Works for quotations: no status filter (B:1974-1995, B:2053-2070). Quote statuses (`quote`, `quote-approved`, `quote-rejected`) also get `quotation_pdf_url` (S:1215-1218).
- Body is `_serialize_booking_json` (B:1918-1942), identical to v1 `/bookings/json`:
  - Booking: `BOOKING_FIELDS` (S:453-461) incl. `code`, `status`, `currency_code`, `total_amount`, `app_id`, `agent_id`, `shopping_id`, `created_at`; plus `contact` (decrypted), `payment` (minus `credit_card`), `json_url`, `pdf_url`, `voucher_pdf_url`, `quotation_pdf_url` (quotes), `invoice_*`, `travel_start_date`, `travel_end_date` (S:1159-1250).
  - `products[]`: `BOOKING_PRODUCT_FIELDS` (S:469-473): `status`, `free_cancellation`, `free_cancellation_deadline`, `data`, `currency_info`, `supplier_code`, `product_ref`, `shopping_item_id`, ...; plus `product {id, code, name, icon}`, `pdf_url`, `error_message` (S:937-983). Hotel `data` is enriched with Olympus content (S:975-979).
  - Hotel `products[].data` is the engine cart item's `product` stored as-is (W:3673-3739); key reference `contracts\golden\engine\engine_cart.altovo.json`. It holds `id`, `name`, `room_count`, `checkin_date`/`checkout_date`, `price_info.total_amount` (retail) and `supplier_*` amounts, `currency_info {rate, original, conversion}`, `selected_offer {price, currency, rooms[] {idx, name, room_name, board_basis, occupancy {adults, children, infants}}, free_cancellation, free_cancellation_deadline, cancellations[] }`.
  - **Not returned**: `cart_items` (only on the authed `GET /bookings` with `cart_items_appended`, B:362-380), hence no `search.payload.travelers`, `country_code` (nationality) or `territory` (residency); those live on the cart item next to `product`, not inside it (golden cart lines ~5079-5102). Travelers are computed but dropped (B:1930-1941).
- Timezones: DB datetime columns (`created_at`, `free_cancellation_deadline`) carry the `CORE_WIRE_TZ` offset, default Europe/London (`serialization.py:21,32-36`; `settings.py:96-98`). Strings inside `data` are mostly naive; only `cancellations[].utc_*` are explicit UTC. The column `free_cancellation_deadline` is copied from `data.cancellation_deadline` (W:3734-3739).

## 4. Masking on token reads: none

- `booking_product_to_json(session, bp, app.secret_key)` is called without `hide_supplier_errors` (B:1927), so `redact_supplier_money(..., allowed=True)` is a no-op (S:517-521, 983). Supplier net amounts, `supplier_code`/name, and raw supplier error text are all returned.
- PII returned: decrypted `contact` (name, email, phone, address) and `payment.contact` (S:607-628, 742-784). Only `credit_card` is removed.
- Extra exposure: the response's `json_url` (S:1187-1202) in the default legacy mode carries an app-wide hash token that opens every booking in the tenant via v1 `/bookings/json` (B:2031-2041; S:308-324). `pdf_url`-family tokens never expire (S:806-855).
- RoomDrop must treat the raw response as secret, keep it server-side, and persist only an allowlisted subset (no contact, payment, `*_url`, supplier money).

## 5. Host per tenant and reachability

- Edge CloudFront function maps Host to app id via a key-value store and sets `X-App-Id` (`infra\cdk\lib\edge-stack.ts:182-229`). Hosts: storefront `*.app.<apex>`, API gateway `api.<apex>` (edge-stack.ts:100-105).
- The storefront proxies `/api/*` to the gateway (`apps\storefront\app\api\[...path]\route.ts:160-167`); the share link itself is `${window.location.origin}/thank-you?code=...&t=<token>` (`apps\storefront\app\r\thank-you\page.tsx:389-405`), and the page calls `/api/v2/bookings/json` (`apps\storefront\lib\services\index.ts:1947-1954`).
- So for staging trave10: `https://trave10.app.altovostaging.com/api/v2/bookings/json?code=...&token=...` (or directly on `api.altovostaging.com`). Inferred, not tested. The platform route does not pin tenant, so either host should resolve it.
- CORS: none on platform or gateway (`services\platform\src\platform_svc\app.py:258-290`; `services\gateway\src\gateway_svc\app.py:152-156`). A browser on another origin cannot read it; a server can. Storefront CSRF check skips GET (`apps\storefront\lib\server\csrf.ts:26-28`).
- Server-to-server is fine, but the WAF blocks requests with no `User-Agent` (`infra\cdk\lib\waf-stack.ts:48-53,167-171,304-322`). Rate limits 50,000/5 min per host and 10,000/5 min per IP+host (waf-stack.ts:129-160, 336-350).

## 6. Mapping onto `quotationBaseline()` (`app/domain/quotation-demo.mjs:11-43`)

Today `quotationBaseline` is fed by the authed engine read `GET /bookings?booking_code&cart_items_appended=true` (`scripts/prepare-quotation-demo.mjs:35`, `app/live-engine.mjs:5,25`). Against the share-link body (`p = products[0]`, `d = p.data`, `o = d.selected_offer`):

| Baseline field / check | Today reads | Share-link source | Status |
|---|---|---|---|
| scope: `code`, `status === 'quote'` | `quote.code`, `quote.status` | same | OK |
| scope: not converted | `quote.quotation_converted_booking_code` | not in `BOOKING_FIELDS` | absent, check passes vacuously |
| scope: one hotel product | `products[0].product_code` | `products[0].product.code` | renamed, adapter needed |
| scope: one hotel cart item | `cart_items[0]` | none | missing, use `products[0]` instead |
| `hotel.id`, `hotel.name`, `room_count` | `cart_items[0].product.*` | `d.id`, `d.name`, `d.room_count` | OK via `data` |
| one room, `idx === 1` | `product.selected_offer.rooms` | `o.rooms` | OK |
| `stay.checkin/checkout` | `travel_start_date`/`travel_end_date` + `checkin_date`/`checkout_date` | same + `d.checkin_date`/`d.checkout_date` | OK |
| `quotedRetail` | `quote.total_amount` + `currency_code`, cross-checked with `price_info.total_amount` | same + `d.price_info.total_amount` | OK |
| `quotedSource` | `selected_offer.price`/`currency` | `o.price`/`o.currency` | OK (supplier net also present, unmasked) |
| `fx` | `product.currency_info` | `d.currency_info` (also `p.currency_info`) | OK |
| `occupancy` adults/childAges/infantAges | `cart_items[0].search.payload.travelers` (with ages) | only `o.rooms[0].occupancy {adults, children, infants}` counts | **counts only, no child ages** |
| `searchContext.nationality` | `search.payload.country_code` | none | **missing** |
| `searchContext.countryResidence` | `search.payload.territory` | none | **missing** |
| room `name`, `board` | `rooms[0].room_name ?? name`, `board_basis` | same under `o.rooms[0]` | OK |
| `freeCancellation` | `selected_offer.free_cancellation` | `o.free_cancellation` or row `p.free_cancellation` | OK |
| `cancellationDeadline` | `selected_offer.free_cancellation_deadline` (naive string) | same, or row `p.free_cancellation_deadline` (London-offset ISO) | OK, pick one and record tz |
| cancellation schedule | not used | `o.cancellations[]` with `utc_*` | available |
| booking status | `status` | `status`, `p.status` | OK |

## Gaps and open questions

1. Nationality and residency are not in the share read. Options: agent enters them in RoomDrop at handoff, default from tenant, or use the authed `GET /bookings?cart_items_appended=true` (needs an Altovo login server-side, outside "share link only").
2. Child ages: share read gives counts only. Unless `rooms[].paxes` is filled (not for quotes, per `docs\knowledge-base\hotel-free-cancellation-deadline-source.md:36-42`), child ages must be asked or the watch limited to adults-only/no-child quotes.
3. `quotationBaseline` needs a share-link variant (or an adapter shaping the share body into its expected input) rather than reuse as-is.
4. 7-day TTL with no refresh path from RoomDrop: re-reads after expiry are impossible without a new mint by an authenticated Altovo user.
5. The response over-shares (PII, supplier net, a tenant-wide `json_url` token). Store an allowlist only; never forward the raw body to the browser or logs.
6. Reachability and the `User-Agent` requirement are inferred from code; confirm with one staging read.
