# Quotation-backed room selection demo

The owner chose to continue with the supplied quotation and replace the starting
record later. The demo uses its actual hotel, dates, one-room occupancy and quoted
retail amount, then reads alternatives through the direct gateway. It ends with
room-selection confirmation. It does not reserve, prebook, rebook, cancel, pay,
refund or modify the quotation.

## Source and comparison

`quotationBaseline` is the replaceable starting-record adapter. It requires one
unconverted `quote` record, one hotel product/cart item and one selected room.
`GET /bookings?booking_code=CODE&cart_items_appended=true` reads the existing
cart/search facts; no hotel-book/retrieve or shopping mutation is needed.
Names, contacts, payment information, quotation access tokens and guest IDs are
never retained in the prepared bundle. Adult occupancy uses the saved search's
traveller types/count; child/infant ages must be explicit. The saved search's
country/territory supplies the original rate-search context, rather than guessing
it from the guests' mixed nationalities.

The gateway request binds that exact hotel, stay, occupancy and search context.
An observation from a different hotel/date/party/context is rejected. The normal
read sequence is engine IAM login, quote GET, gateway login and one direct
`search-by-id`. Credential sources remain explicitly selected and separate.

The quotation's retail total and supplier amount/currency are separately bound.
The gateway's generic `price` is a source observation, not a verified new retail
offer. Its decimal precision is preserved. Display conversion uses the exact
exchange rate saved with the quotation, with integer-rational multiplication and
half-up rounding solely for the labelled converted estimate. It does not apply
the original promotion/discount to a replacement or invent a new markup/fee policy.
The UI labels the difference as indicative, before final retail pricing/fees;
customer refund remains null.

At most three observed options are shown. Lower converted source estimates are
preferred; within those, free-cancellation flags are preferred, followed by price.
Exact displayed room-name/board/flag duplicates are collapsed for presentation,
not classified as verified room equivalence. Non-refundable/unestablished
flexibility requires a separate acknowledgement. If no lower estimate exists,
the available observations may be shown without a saving claim. Missing source
amount/currency/reference facts do not produce an invented option.

## Selection-only UI and server

The dedicated local UI reuses the existing RoomDrop tokens, logo and illustrative
photo asset without changing the concurrently edited main customer flow. It has
Options → Review → Confirmed screens, explicit demo acknowledgement and a final
statement that no hotel reservation was created. Photographs remain illustrative.

The server reads one prepared private bundle; it makes no upstream requests.
Only its small static allowlist and the following local APIs exist:

- `GET /api/quotation-demo`: safe quotation/option projection and current session.
- `POST /api/quotation-demo/confirm`: exact option alias, snapshot version and
  literal demo acknowledgement; separate reduced-flexibility acknowledgement
  where necessary. Requires the loopback origin, HttpOnly SameSite cookie and CSRF.

There is no arbitrary quotation lookup, gateway token, supplier selection token,
booking endpoint or transaction action in this service. A repeat confirmation
returns the existing receipt for that selection. Refresh restores it during the
one-hour in-memory session; restarting the server clears demo sessions. No
production persistence claim is made. The final receipt is
`demo-selection-confirmed`, with `reservationCreated:false` and
`quoteModified:false`, and contains no booking reference.

The executable rejects production, Cloud Run and non-loopback activation. The
existing public jury fixture/runtime and deployed customer/agency services remain
separate. Future hosting/authentication or real booking execution needs its own
contract and deployment scope.

## Prepare and review

The quotation code is a runtime argument so another quotation can replace it
without changing UI or source. Substitute the owner-selected code for `CODE`:

```powershell
node scripts/prepare-quotation-demo.mjs --execute --code=CODE --engine-credentials-file=C:/Users/pohli/Sites/scraper/.env --gateway-credentials-file=C:/Users/pohli/Sites/booking_agent/input/env.gateway.txt
node scripts/serve-quotation-demo.mjs --snapshot=.local/quotation-demo/quotation-demo-UUID.json --port=8094
```

Preparation is offline by default. Explicit execution saves a new exclusive
bundle under ignored `.local/quotation-demo/`; the supplied code, private source
references and actual rate values stay out of checked-in fixtures and source.
Opening/reloading the UI uses the captured snapshot, not another live search.
The capture time and estimate limitations remain visible.

See [verification](quotation-demo-verification.md).
