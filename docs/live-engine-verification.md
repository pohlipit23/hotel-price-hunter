# Private live engine integration checkpoint

16 October 2026, Asia/Kuala_Lumpur. Local adapter/runner implemented; actual
booking and full-rate acceptance remains pending owner-selected input/access.

## Implemented and verified locally

- `app/live-engine.mjs`: fixed HTTPS tenant allowlist, five exact read operations,
  input validation, 45-second request deadlines, four-MiB streamed JSON limit,
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

The focused suite passes **23/23**, zero skips. Tests first failed for absent
functionality and additional product/identifier/mapping guards, then passed after
implementation. The complete Node suite passes **212**, zero failures, with the
existing **six emulator integration checks skipped** (218 total). Evidence:
`.local/live-engine/regression-final.tap`. No emulator/storage implementation was
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

## Pending live acceptance

The follow-up request asks for one authorised standalone single-room Demo.apps
booking and confirmation of the existing local credential source (proposed:
`C:/Users/pohli/Sites/scraper/.env`). The owner has selected the tenant only so far.
No IAM login or authenticated booking/search/rates call was attempted.

After the owner supplies that context, verify the actual hotel timezone, execute
the bounded read pipeline, resolve current response mappings from evidence and
retain a private normalised observation. Only then can live UI/monitoring wiring
be verified. The deployed demo, cloud configuration, Scheduler, live supplier
transactions, model budget and notification delivery have not changed.

See [the contract and commands](live-engine-contract.md).
