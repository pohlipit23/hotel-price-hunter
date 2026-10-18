# Altovo requote and confirm-quote routes for a trave10 B2B agent

Research for issue #5 (child of map #2). Question: which Altovo routes could turn a chosen
**Drop** into an Altovo quotation for a B2B agent on tenant `trave10`
(`trave10.app.altovostaging.com`), and what do they require?

Source: the Altovo repo at `C:\Users\pohli\Sites\altovo-gitlab\altovo`, commit `169c3725`
(2026-10-18). Read only; no calls were made to any Altovo host, so nothing here is verified
live. Paths below are relative to that repo.

Terms follow `GLOSSARY.md`: **Original Booking** (the agent's Altovo quotation), **Drop
Watch**, **Drop** (a cheaper equivalent offer presented as a possible rebooking).

## Answer in one paragraph

Only `POST /shopping/requote-candidate` turns a chosen offer into a new Altovo quotation
without moving money, and it lives on the privileged TravelDesk host only. On staging its
fleet-level gates are open for every tenant, so trave10 is not blocked by flags, but the call
needs a `type=traveldesk` partner key bound to the trave10 agent, which only an Altovo System
admin can mint, and the Drop must be a different offer for the **same hotel** that is still
present in a fresh Altovo re-search at the moment of the call. `POST /shopping/confirm-quote`
(and its deprecated twin `POST /bookings/{code}/confirm`) books and charges the agent's
balance, so it is out of scope for RoomDrop. The storefront `/shopping/quote-confirm` is
usable by a logged-in trave10 agent today with no key, but it converts a quote into a paid
booking; the only key-free way to get a Drop into a quotation is the ordinary storefront
flow (search, cart, payment page, "Save as Quotation"), which produces an unlinked new quote.

## The routes

| Route | Host (staging) | Moves money | Key / login | Gates | trave10 agent can use it? |
|---|---|---|---|---|---|
| `POST /shopping/requote-candidate` | `traveldesk-api.altovostaging.com` only | No | `type=traveldesk`, agent-bound partner key | kill switch + per-tenant opt-in (both open on staging) | Yes, once a System admin mints the key |
| `POST /shopping/confirm-quote` | `traveldesk-api.altovostaging.com` only | **Yes** (books + debits agent balance) | same | same | Technically yes; out of scope (charges) |
| `POST /bookings/{code}/confirm` (deprecated) | `traveldesk-api.altovostaging.com` only | **Yes**, no price ceiling | same | same, plus a legacy fallback flag | Out of scope |
| storefront `/shopping/quote-confirm?code=` | `trave10.app.altovostaging.com` | Yes at checkout | B2B agent login | none beyond login | Yes; ends in a paid booking |
| storefront "Save as Quotation" | `trave10.app.altovostaging.com` | No | B2B agent login | none beyond login | Yes; new quote, no lineage link |

### 1. `POST /shopping/requote-candidate` (Flow 3)

What it does: loads the Original Booking with its saved cart, re-runs the saved hotel search,
checks the chosen `candidate_offer_id` is among the fresh offers for that hotel, adds it to a
**fresh** shopping session, carries over every other product and the travelers and contact,
then calls engine `POST /bookings/quote` with `replaces_booking_code` and
`replaces_shopping_id`. It returns `{booking_code, shopping_id, replaces_booking_code,
status:"quote"}`. It "NEVER charges (no max_total)".
(`services/partner-api/src/partner_api_svc/domains/confirm.py`, `requote_candidate` and
`_run_requote`, lines 671-851.)

Request body: `booking_code`, `candidate_offer_id`, `idempotency_key`, all required
(`confirm.py` lines 693-697).

Requirements, in the order the code checks them:

1. **Fleet kill switch and per-tenant opt-in.** Same gate as confirm-quote
   (`confirm_quote_enabled_for`, `confirm.py` lines 84-104, 690-691): env
   `ALTOVO_PARTNER_CONFIRM_QUOTE_ENABLED=1` AND the tenant is either on
   `ALTOVO_PARTNER_CONFIRM_QUOTE_APP_IDS` (`*` means every tenant) or has the
   `partner_confirm_quote` feature flag on. Otherwise `501 not enabled for this tenant`.
   - The flag is `tier="money"`, default off, and its description says it covers
     confirm-quote, requote-candidate and the deprecated quote-confirm
     (`services/platform/src/platform_svc/domains/core/feature_flags_registry.py` lines 371-384).
     The flag is read from platform, cached 60s, and fails closed
     (`services/partner-api/src/partner_api_svc/app_flags.py`).
   - **Staging:** the CDK sets both env vars on the `traveldesk-api` service for any
     non-production stage, and the allow-list defaults to `*` when the deploy passes no value
     (`infra/cdk/lib/compute-stack.ts` lines 439-467, 581-605). The staging deploy job does not
     pass `traveldeskConfirmAppIds` (only the production job does, `.gitlab-ci.yml` lines
     955-956), so on staging every tenant, trave10 included, passes this gate without any flag
     change. `docs/staging-urls.md` agrees: confirm is "ENABLED on the TravelDesk API host
     only".
2. **TravelDesk host and key type.** The confirm router is mounted only when
   `ALTOVO_PARTNER_SURFACE=traveldesk` (`services/partner-api/src/partner_api_svc/app.py`
   lines 304-308); it is physically absent from `partner-api.altovostaging.com`. On that host
   `require_partner` 403s any key whose `type` is not `traveldesk`
   (`services/partner-api/src/partner_api_svc/auth.py`, `require_partner`). Staging host:
   `https://traveldesk-api.altovostaging.com` (`docs/staging-urls.md`).
3. **Agent-bound key.** `if not principal.agent_id: forbidden(...)` (`confirm.py` lines
   700-701). An app-only key is refused.
4. **Ownership.** The booking's `agent_id` must equal the key's agent, and its `app_id` the
   key's app (`confirm.py` lines 710-715). So the key must be bound to the same trave10 agent
   that created the Original Booking.
5. **Cart shape.** The quote must contain a `hotel` or `stopover` cart item, and nothing but
   hotel, stopover and flight (otherwise 422 or 501) (`confirm.py` lines 721-733).
6. **The candidate must still exist.** `_add_candidate_hotel` re-searches the **same
   `hotel_id`** and returns empty unless `candidate_offer_id` is among the fresh offers; the
   result is then `status:"candidate_unavailable"`, not an error (`confirm.py` lines 782-791,
   854-876). Co-products that are now gone also give `candidate_unavailable`.

Key minting: `POST /partner-tokens {app_id, agent_id, type:"traveldesk", label}` on the core
gateway, System scope only; a `type=traveldesk` key is "System-only" and app admins are
refused. The raw key is shown once
(`docs/partner-api/partner-onboarding-manual.md` sections 2-4;
`docs/TravelDesk/ENABLE-A-TENANT.md` step 1). Note the manual still says keys are stored in
Redis; the auth module docstring says platform tokens are now Postgres-backed (ADR-046).

Side effects worth knowing:

- Engine `POST /bookings/quote` auto-fires a TravelDesk webhook only when the tenant has a
  corporate (TravelDesk) config; otherwise it returns silently
  (`services/engine/src/engine_svc/domains/engine/shopping_booking.py`,
  `autofire_traveldesk_webhook`, lines 186-222). Whether trave10 has that config is not in
  the repo.
- The new quote is linked to the Original Booking through the CE-6 quote lineage
  (`replaces_booking_code`), which `_lineage_root` later walks (`confirm.py` lines 143-169).
- The new quote is exactly the thing confirm-quote would later charge against; the code says
  so as the reason requote-candidate shares the money gate (`confirm.py` lines 687-689).

### 2. `POST /shopping/confirm-quote` (Flows 1 and 2)

Re-shop, re-select the **same** quoted offer, ceiling check against `max_total` in one
currency, then `POST /shopping/book` with `method:"b2b-balance"`, which debits the agent
balance (`confirm.py` lines 193-316, 461-562). Body: `booking_code`, `max_total`, `currency`,
`idempotency_key`; `reselect` must be `same_offer`. Same gates as requote-candidate (flags,
TravelDesk host, agent-bound `traveldesk` key, ownership).

If the quoted hotel offer has been withdrawn it returns `offer_changed` with `candidates[]`
(fresh offers for the same hotel) and does not charge; it never auto-substitutes
(`confirm.py` lines 413-449, 607-643). That `candidates[]` list is the designed source of
`candidate_offer_id` for requote-candidate. But if the quoted offer is still on sale and under
`max_total`, the same call books and charges.

For RoomDrop: out of scope. The map rules out converting the quotation into a supplier
booking, and this route does exactly that.

`POST /bookings/{code}/confirm` is the deprecated predecessor with "NO price ceiling", behind
the same per-tenant gate plus the legacy `ALTOVO_PARTNER_TRAVELDESK_CONFIRM_ENABLED` fallback
(`services/partner-api/src/partner_api_svc/domains/traveldesk.py` lines 98-119, 588-608).
Also out of scope.

### 3. Storefront `/shopping/quote-confirm?code=<booking_code>`

A client page in the storefront `(shell)` tree, which always acts as the Agent
(`apps/storefront/lib/auth.ts`, `activeScope`). It loads the quote with its cart, refuses
anything whose status is not `quote`, clears the cart, re-runs each item's search, and
re-selects **the quoted inventory or nothing**: hotels must match room, board and
refundability (`pickReshopOffer`). On a miss it lands the agent on the live results listing
for that product. On success it hands off to the normal checkout (cart, travelers, payment)
(`apps/storefront/app/(shell)/shopping/quote-confirm/page.tsx` lines 110-129, 223-248,
380-458; `docs/knowledge-base/quotations-feature.md`, "Confirm (convert)").

A trave10 B2B agent can open it with their normal storefront login; no partner key and no
flag. But its purpose is to produce a paid booking, and it will not put a Drop (a different
offer) in the cart for you. It also does not link a resulting quote back to the original.

### 4. Storefront "Save as Quotation" (not asked, but the key-free path)

On the storefront payment page, Agents get a "Save as Quotation" button that calls engine
`POST /bookings/quote`: a booking with `status='quote'`, no payment, no supplier booking
(`docs/knowledge-base/quotations-feature.md`, "How a quote is created"). A trave10 agent
can build the Drop's room in the storefront and save it as a new quotation with no Altovo
change at all. The result has no `replaces_booking_code` lineage to the Original Booking.

### Cart expiry (the "~25 minute" figure)

The code default is **20 minutes**: `SHOPPING_TTL = 60 * 20` and
`expire_at = now + SHOPPING_TTL` when a shopping is created without one
(`services/platform/src/platform_svc/domains/core/shoppings.py` lines 66, 293). The "~25-min"
figure appears only in prose (`quote-confirm/page.tsx` docstring,
`docs/knowledge-base/quotations-feature.md`). The engine rejects a shopping whose `expire_at`
has passed (`services/engine/src/engine_svc/domains/engine/shopping_cart.py`).

Consequences:

- An Original Booking's own cart is dead about 20 minutes after it was saved, which is why
  every route above re-searches instead of resuming. confirm-quote has a fast path only while
  the session is still live (`_price_live_cart`, `confirm.py` lines 349-369).
- requote-candidate always mints a fresh session, so the original cart's expiry does not block
  it. The **new** quotation's cart will itself expire 20 minutes later; the quotation record
  stays.
- Hotel rate ids are supplier-session scoped and "gone on a fresh search nearly every time"
  (`quotations-feature.md`; `quote-confirm/page.tsx` lines 121-123). requote-candidate matches
  the candidate by exact offer id after its own re-search, so a candidate id captured earlier
  (from an `offer_changed` response or a separate search) may already be stale. This is the
  biggest practical risk for the route and cannot be settled without a live call.

## What this means for turning a Drop into an Altovo quotation

- **Feasible without Altovo code changes:** requote-candidate on the TravelDesk staging host,
  because staging already opens both money gates to `*`. Needed from Altovo operations: one
  `type=traveldesk` key bound to the trave10 agent that owns the Original Booking (System
  admin action). Whether minting a key counts as the "tenant config change" the map forbids
  is a decision for the map, not this research.
- **Constraint on what a Drop can be:** a different offer for the **same hotel**, with the
  same dates and occupancy as the saved search (the route replays the saved search payload).
  A cheaper room at a different hotel cannot go through requote-candidate.
- **Constraint on where the Drop's offer id comes from:** it must be an id Altovo's own
  re-search returns at call time. A Drop found by a non-Altovo rate source has no usable
  `candidate_offer_id`. The designed source is confirm-quote's `offer_changed.candidates[]`,
  which is unusable here because the same call charges when the quoted offer is still on sale.
  The traveldesk key also works on the hotel search routes (`/hotels/search`,
  `/hotels/search/{search_id}/rooms` in `domains/hotels.py`), but whether those return the
  same offer ids that `_search_hotel_offers` matches against is not verified.
- **Never call** confirm-quote or `/bookings/{code}/confirm` from RoomDrop: both debit the
  trave10 agent's balance.
- **Fallback with zero Altovo involvement:** the agent rebuilds the Drop in the trave10
  storefront and uses "Save as Quotation". Manual, unlinked to the Original Booking, but
  inside the map's "booking app used unchanged" rule.

## Open points (need a live check or a decision)

- Whether trave10 exists as a served tenant with a funded agent; staging serves every tenant
  (`STAGING_ENGINE_SERVED_APP_IDS: "*"`, `docs/knowledge-base/engine-served-tenants.md`), but
  `docs/staging-urls.md` still carries the older "only demo can transact" note.
- Whether trave10 has a TravelDesk corporate config (decides if requote fires a webhook).
- Whether a candidate offer id survives requote-candidate's own re-search often enough to be
  usable.
