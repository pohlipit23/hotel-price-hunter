# Handoff: Original Booking setup and judge flow (18 October 2026)

From the Claude session that charted the booking-setup map. Read this, then
`docs/public-demo-firestore-spec.md` (the latest spec) and `GLOSSARY.md`.
No application code has been written for this yet.

## Where things live

- Wayfinder map (GitHub): https://github.com/pohlipit23/hotel-price-hunter/issues/2
  - Closed: share-link read (#4), requote routes (#5), sample capture (#3).
  - Open: booking facts contract (#6), invitation and identity (#7),
    setup screens prototype (#8), when a Drop becomes an Altovo quotation (#9).
- Research branches (never merge): `research/altovo-share-link-read`,
  `research/altovo-requote-routes`.
- Glossary: `GLOSSARY.md` - Original Booking, Current Booking, Drop Watch, Drop.
- Captured samples (ignored, never commit): `.local/altovo-sample/`
  - `AIRB000179.projection.json` - Grand Hyatt KL, non-refundable (cannot start).
  - `AIRB000180.projection.json` - Siam Kempinski Bangkok, free cancellation
    until 2027-02-14T16:58:59Z (armable).
  - Each holds only allowlisted display facts plus `hotel.gatewayHotelId`
    (the EasyGDS/Gateway hotel id: 5232813 and 3135840).

## Settled decisions

- The booking app is separate and unchanged: a B2B agent creates a real
  quotation in the Altovo storefront. **Tenant is now air1**
  (`air1.app.altovostaging.com`, B2B agent login), not trave10.
- The real Altovo quotation stands in for the Original Booking; it is never
  converted into a supplier booking.
- Handoff mechanism: Altovo share link. `GET /api/bookings/share-token?code=`
  (needs the agent session) returns a 7-day, unrevocable token;
  `GET /api/v2/bookings/json?code&token` returns the booking with no login.
  Verified live on air1 for both samples.
- The customer arms the Drop Watch. Setup ends at "watch armed"; scheduler,
  live rates and email are out of scope.
- Drops are the cheaper offers presented to the customer (not "alternative
  quotations"). Only `POST /shopping/requote-candidate` could later turn a Drop
  into an Altovo quotation without moving money; confirm-quote charges and must
  never be called.

## Judge flow for the hackathon (approved by the user, not yet in the spec)

1. **Snapshot, not live reads.** Capture each quotation's projection once now
   and store it as an immutable Firestore record. Judges never trigger an Altovo
   call; share tokens expire in 7 days and need an agent login to mint. The page
   states the quotation was captured from Altovo staging on a given date.
2. **About 6 curated quotations, each with a job**: refundable/armable,
   non-refundable/cannot-start (AIRB000179), free cancellation closing soon,
   and variety in city, currency or board. Each card labels the state it shows.
   The user creates them in Altovo; capture them like the two samples.
3. **Start page = card grid** (photo, city, dates, price, scenario label). No
   free-text code lookup; only curated codes open.
4. **Per-session Drop Watch.** Booking facts and Drops are shared and immutable;
   each judge's Drop Watch setup (consent, minimum saving) and Drop choice live
   in their own anonymous session, so judges on the same quotation do not
   overwrite each other. This changes the spec, which currently puts the Drop
   Watch setup on the booking record.
5. **Drops captured per quotation.** Capture real cheaper offers once per
   refundable quotation via the existing Gateway search (reuse the Gateway half
   of `scripts/prepare-quotation-demo.mjs` with a baseline built from the
   projection). Arming runs an immediate "first check" that replays those
   captured offers, so Drops appear within seconds, labelled as a replayed check.
6. **Confirmation page** is RoomDrop-styled ("Your agency booked this"), shows
   the Original Booking with one primary "Set up a drop" button and a small note
   that it is a staging quotation standing in for a confirmed booking. No Altovo
   or AirBorneo branding. Ticket and Stamp style, low text.

Then: setup screens (consent, minimum saving, armed) -> replayed first check ->
existing Deals -> Review -> Confirmed screens.

## Spec changes to make in `docs/public-demo-firestore-spec.md`

- Records enter through a guarded admin import of curated projections (back to
  the original spec's import discipline), not a public runtime intake. Public
  requests can only open curated codes. Keep share-link intake as the documented
  future path.
- Move Drop Watch setup from `roomdropBookingsV1/{code}` to the session,
  keyed by booking code (`session.byCode[code]`).
- Add per-booking scenario label and catalogue listing for the start page.
- Add the replayed first check: arming returns Drops from the captured set,
  filtered by `isDisplayedDrop` and the chosen minimum saving.
- Tenant references: air1.

## Facts that bite

- Share-link body has no `cart_items`: no nationality, residency or child ages;
  occupancy is `pax_count` only. `quotationBaseline()` cannot parse it; write an
  Altovo adapter. For Gateway search default nationality/residency to `my`/`my`
  and record that as an agency default.
- Cancellation fields conflict. AIRB000179's offer `free_cancellation_deadline`
  is the sentinel `1970-01-01 00:00` while product deadlines carry a real date.
  The offer-level deadline also lacks a timezone on AIRB000180. Trust
  `non_refundable` and the `cancellations[].utc_*` schedule.
- The response is unmasked (contacts, supplier net, a tenant-wide legacy
  `json_url` token). Store allowlisted fields only.
- The share-token lookup crosses tenants; a host check alone does not prove tenant.
- Hosted runtime constraints: `validateCloudQuotationMode` forbids
  `FIRESTORE_EMULATOR_HOST` and credentials env; `validateDeploymentSnapshot`
  allows max 3 options and rejects private-looking key names (including
  `guest*`, `contact`, `address`, `token`, `sourceId`, `supplierCode`).
  `booking-demo-server.mjs` has a static asset allowlist and rewrites exact
  URLs; the quotation server rejects any query string. New routes should be
  path-based, e.g. `/api/booking-demo/q/<code>`.
- Gateway credentials file used before:
  `C:/Users/pohli/Sites/booking_agent/input/env.gateway.txt` (never print it).

## Boundaries

Staging only; never production Altovo; no Altovo code or tenant config changes;
never call confirm-quote; do not commit `.local/`; ask before deploys, IAM/TTL
changes or production Firestore imports.
