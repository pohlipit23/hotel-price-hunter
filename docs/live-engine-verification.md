# Private live engine integration checkpoint

Current source checkpoint: the owner-selected direct gateway route is verified
in [gateway-rate-verification.md](gateway-rate-verification.md). The engine's
four-MiB bound is restored; the optional rooms GET has local tests only. The
earlier engine-only counts and approval states below are historical checkpoints,
not the current gateway connection status.

16 October 2026, Asia/Kuala_Lumpur. Local adapter/runner implemented; actual
booking and full-rate acceptance remains pending. Scraper credentials and a live
availability response are now verified; detailed rates are not yet verified.

## Implemented and verified locally

- `app/live-engine.mjs`: fixed HTTPS tenant allowlist, five exact read operations,
  input validation, 45-second request deadlines, four-MiB JSON limit for ordinary
  reads and a separate sixteen-MiB local patch for full rates,
  no redirects/retries, and fixed error codes. Optional ordinary IAM sign-in uses
  only explicitly selected credentials, returns one in-memory access token and
  discards refresh/account data. No transaction operation exists in the adapter.
- `app/domain/live-comparison.mjs`: matches booking/shopping/hotel identities,
  standalone single-room scope, actual dates/occupancy, session expiry and complete
  flat-rate identities. Exact minor-unit parsing never rounds ambiguous amounts
  or converts currencies. Display price differences and supplier costs remain
  distinct. Missing room/cancellation/refund evidence stays blocked in the
  existing decision core; all observations are non-actionable.
- `scripts/check-live-rates.mjs`: offline by default; explicit local-only execute
  mode, private input path and tenant binding, optional owner-selected credential
  file, and exclusive optional reports below ignored `.local/live-engine/`.
  Traveler names, birthdays, contact/payment fields and credentials are omitted.
  Terminal output contains aggregate counts/gates, not real booking/rate IDs.

The focused suite contains **24 passing checks**, zero skips. Tests first failed for absent
functionality and additional product/identifier/mapping guards, then passed after
implementation. The complete Node suite passes **213**, zero failures, with the
existing **six emulator integration checks skipped** (219 total). Current evidence:
`.local/live-engine/regression-scraper-20261016.tap`; the previous
`regression-final.tap` remains historical. No emulator/storage implementation was
changed. Syntax and targeted whitespace checks pass. Direct CLI offline execution
reports configuration presence and makes no network call.

One test exercises actual HTTP fetch, response parsing and all five read steps
against a **local fixture server**. Other boundary tests inject responses. These
are not successful live EasyGDS booking/rate evidence. No browser UI changed in
this slice; the public application still uses its fictional fixture and routes.
Unrelated ongoing customer UI/branding/release changes were preserved.

## Current tenant evidence

The owner selected Demo.apps. Unauthenticated normal-host requests to
`https://demo.apps.easygds.com/api/docs/api.json` and `/docs/api.json` returned
HTTP 200, OpenAPI 3.0.3, 172 paths. The current published API lists all five
read endpoints. A local copy with examples/defaults removed is retained at
`.local/live-engine/demo-openapi.json`, SHA-256
`8cefe84cd7cb1bd0256d320d1bb624c15479a2a27f35e91ba9bd83182ff9479e`.

The documented operator product schema establishes `product_code`; generic
booking lookup need not contain a hotel object. Operator dates/travelers and
full-rate response details remain underspecified. The shared currency schema's
`origin` field differs from historical `original`. These gaps remain explicit
mapping gates until selected-tenant responses are inspected; no alias, monetary
conversion, refund, timezone or fulfilment guarantee was inferred.

## Scraper credential and availability check

The owner explicitly authorised `C:/Users/pohli/Sites/scraper/.env`. One normal-host
execution from `2026-10-16T10:06:56.359Z` to `10:07:15.662Z` authenticated through
the configured IAM and obtained a Demo.apps availability response containing the
requested hotel. Credentials/tokens stayed in memory and were not printed/saved.

This was a source-only test: Four Seasons Hotel Kuala Lumpur, catalogue ID
`21122615` verified in the scraper catalogue, 12–15 November 2026, MYR, one room,
two test adults aged 18 (the scraper's test default), no children/infants. These
are explicit test-search facts, not a retrieved customer's booking/occupancy.
The scraper smoke file's 15–16 October stay was not reused as a current booking.
No original booking was compared and no saving/refund claim follows.

The subsequent detailed-rates request exceeded the four-MiB streamed-body guard.
It was refused before JSON parsing; no complete rate body or rate count was
obtained. The safe historical summary is
`.local/live-engine/demo-source-only-summary-20261016.json`. Its `rates` flag
remained `not-attempted` because the old script assigned success only after
parsing; the `RESPONSE_TOO_LARGE` reason establishes that a rate request was
actually attempted. It must not be interpreted as zero rate requests.

The local patch accepts rate JSON above four MiB with a sixteen-MiB hard limit,
while other operations retain four MiB. A failing-then-passing regression covers
both successful larger JSON and oversized advertised/actual rate bodies. This
is an ingestion ceiling, not a payload-size optimization. A repeat live command
was rejected in the approval prompt before process creation; it made no further
calls. No live retest, new sign-in, booking probe or alternate access path followed.

## Pending live acceptance and response shape

The comparison draft still reconstructs canonical per-offer context for the
existing decision core and repeats hotel/stay/occupancy in its private output.
The owner questioned that size. The proposed smaller external shape is shared
context once plus compact room/board/price/cancellation offer rows, with opaque
engine references private and a short filtered list for a future customer view.
That projection has not been implemented or browser-verified. The rejected raw
rate response has not been inspected, so the cause of its upstream size is
unknown. Smaller application output would not itself reduce upstream bytes.

Full-rate inspection/retest remains stopped after the approval rejection. A
separate owner-selected standalone single-room booking is still required to
verify retrieval and actual original-versus-replacement comparisons.

After the owner supplies that context, verify the actual hotel timezone, execute
the bounded read pipeline, resolve current response mappings from evidence and
retain a private normalised observation. Only then can live UI/monitoring wiring
be verified. The deployed demo, cloud configuration, Scheduler, live supplier
transactions, model budget and notification delivery have not changed.

See [the contract and commands](live-engine-contract.md).
