# RoomDrop curated judge flow: verification evidence

Contract: `docs\public-demo-firestore-spec.md`. Tasks: `tasks\todo.md`. Each part
records evidence only in its own section. No section is evidence of a deployment,
a production import or a new live call.

## Part 1 - Sample preparation and judge setup through Drop Watch armed

Owner: Claude, worktree `.local\roomdrop-part1`, branch `claude/roomdrop-part1-armed`.

### F0: Capture and scaffolding audit (18 October 2026)

Method: read-only local inspection of key names, provenance fields and file
hashes. No Altovo, Gateway or Gemini call, no Firestore read or write. Private
payload values are not copied here; only key names, scenario characteristics and
SHA-256 digests of the whole local files.

#### Local captures (ignored, never tracked)

`git check-ignore -v` in the shared checkout matches `.gitignore:9:.local/` for
every file below, and `git ls-files .local` is empty in both the shared checkout
and this worktree.

| File (under the shared checkout `.local\`) | Bytes | Modified | SHA-256 |
| --- | --- | --- | --- |
| `altovo-sample\AIRB000179.projection.json` | 1851 | 2026-10-18 19:11 | `1edc7b2832737a689047b13607a148fef97546a5ed0fe1ab7dc78ad689b74264` |
| `altovo-sample\AIRB000180.projection.json` | 2149 | 2026-10-18 19:11 | `8eb6e0d8caf0a46b852cac57d133653c8b17e75f674512d9be18dd855d6f73eb` |

Provenance recorded inside both projections: `source: altovo-staging`,
`tenantHost: air1.app.altovostaging.com`, read through the share-token JSON route
on `readAt: 2026-10-18` (date only, no time of day). Each says contact, agent,
supplier ids, prebook tokens and `json_url` were not stored. No share token is
stored. The tenant host is recorded provenance, not tenancy proof: tenancy rests
on the owner-approved code list (now enforced by `--approved-codes`, see F1).

Allowlisted keys present (names only):

- top level: `source`, `tenantHost`, `readPath`, `readAt`, `note`, `booking`,
  `hotel`, `room`, `price`, `cancellation`, `absent`;
- `booking`: `code`, `status`, `currency`, `retailTotal`, `travelStart`,
  `travelEnd`, `createdAt`;
- `hotel`: `name`, `star`, `countryCode`, `cityCode`, `checkin`, `checkout`,
  `roomCount`, `paxCount`, `nightCount`, `supplierSource`, `gatewayHotelId`; plus
  `provider` (AIRB000179 only) and `checkinTime`/`checkoutTime` (AIRB000180 only);
- `room`: `name`, `boardBasis`, `boardCode`, `bed` (null in both);
- `price`: `supplierCurrency`, `supplierTotal`, `fxRate`, `retailTotal`,
  `agentMarkup`, `markup`, `tax` (all three fees are 0 in both);
- `cancellation`: `offerNonRefundable`, `offerFreeCancellation`,
  `offerFreeCancellationDeadline`, `productFreeCancellation`,
  `productFreeCancellationDeadline`, `cancellationDeadline`, `schedule[]`
  (`utcFrom`, `utcTo`, `penaltySupplier`, `penaltyRetail`); plus
  `supplierCancellationDeadline` and `buffer` (AIRB000180 only);
- `absent` (declared not supplied): cart items, nationality, residency, child
  ages, adult/child split.

Supplier-side fields (`provider`, `supplierSource`) stay in `.local` only; the
adapter does not carry them into a baseline. AIRB000179's offer deadline is the
`1970-01-01 00:00` sentinel; AIRB000180's offer deadline is naive local time.
Both have offset-bearing UTC schedules.

#### Gateway captures

There is no Gateway capture for AIRB000179 or AIRB000180. The Gateway files that
exist locally are older (16 October) live-engine and quotation-demo observations
for other hotels and stays (stays from 2026-11-12 and 2027-01-21, quotation
DEMOP010223). Neither Gateway hotel id of the two curated codes occurs in them.
They are not Drops for this catalogue and must not be reused as such. Hashes are
recorded for integrity only:

| File (under `.local\`) | Bytes | SHA-256 |
| --- | --- | --- |
| `live-engine\gateway-observation-8f237d31-1b66-4600-9fd4-c255a861911a.json` | 171439 | `4f68e4f41d47564f3da23f67f9d938e10dd1870676a80ec1684b1c92ba16f5b4` |
| `live-engine\gateway-observation-db07af15-72bb-4122-9277-aa6dad4081f1.json` | 426006 | `1bed51170d7db162bbdff750101c51c19596a5cdb7282e7f4ff2ebc09deb84ad` |
| `live-engine\direct-gateway-5d553881-884b-4fa0-aebd-a1d2cebbef7e-private.json` | 406109 | `968c652285ab6f69cb814da5c5314f9cc5ab5cdac0670b7ac9c9adc0f657c9c6` |
| `live-engine\direct-gateway-5d553881-884b-4fa0-aebd-a1d2cebbef7e-private-wire.json` | 392300 | `3ec2e54fbb891ff39e8062b373b7f232a7c5d18a0da7b12df7d881e7a85876a5` |
| `live-engine\direct-gateway-final-projection-private.json` | 414791 | `bf9f9a691ac953156eec4abbad5c430ba020cf66beda7efa991e17dada6e503a` |
| `quotation-demo\gateway-input-DEMOP010223.json` | 187 | `739e56aefafd242180f6ceb2488e8b79e29365de80007a5b732b240f9a590791` |
| `gateway-rate-input.json` | 188 | `62d2dca6949de254cf924526af7cd61e44c64313e066a7a89280285cf9f5e4f1` |

The shared checkout's `.local\altovo-catalogue\` does not exist: no prepared
catalogue has been written.

#### Base-snapshot scaffolding (authored by neither part; reviewed, not proof)

- `app\domain\altovo-quotation.mjs`: share-projection adapter (`altovoBaseline`,
  `watchBlocker`). Before F1 it accepted naive schedule times as local time, read
  a missing `offerNonRefundable` as refundable, and had no conflict, contiguity,
  provenance or FX-binding checks. F1 fixed these.
- `scripts\prepare-altovo-catalogue.mjs`: owner-run preparation. Before F1 it had
  no dry run (without `--execute` it only listed requirements), no approved code
  list and no per-code capture record. A failed search already blocked the whole
  run.
- `tests\fixtures\altovo-catalogue.mjs`: tracked copies of the two projections'
  allowlisted display facts (no tokens, contacts or supplier source names). The
  three Drops for AIRB000180 are invented fixture rates, not captures.
- `app\public\drop-watch.js` (stateless rules: 14-day closing-soon, the 10.00
  agency minimum, `qualifyingDrops`) and `app\public\booking-judge.js` (catalogue,
  booked, setup and check screens).
- `app\booking-demo-server.mjs` (rewrites `/api/booking-demo/*`) and the
  catalogue `GET`, `/q/<code>` and `/watch` branches of
  `app\quotation-demo-server.mjs`. Sessions, `byCode[code].watch`, confirmations
  and rate limits live in a process-local Map (64 sessions, 1 hour). The hosted
  catalogue is a file baked into the image (`release\booking-catalogue.json`,
  not tracked). The watch is a single in-memory assignment. It is lost on
  restart and has no content or Drop-set version.
- Tests: `tests\altovo-quotation.test.mjs`, `tests\booking-catalogue.test.mjs`,
  `tests\booking-judge.browser.mjs` (port 0, fixture catalogue).

Gaps for later Part 1 tasks: no Firestore session or catalogue authority (F2,
F3a, F5a); no card photo (chosen by index parity), city name or scenario label
(S0.5, F4a); a missing capture is indistinguishable from an empty one at the
server and UI (F2, F4a); the UI shows an unknown `freeUntil` as "No free
cancellation" rather than unknown (F7a).

Base snapshot test run before any Part 1 change (worktree at `3c07af3`):

- `node --test .\tests\booking-catalogue.test.mjs`: tests 8, pass 8, fail 0,
  skipped 0.
- `node --test .\tests\altovo-quotation.test.mjs`: tests 5, pass 5, fail 0.

### S0.1: Scenario slots of the two existing projections

| Slot | Filled by | Facts (UTC) | Remaining evidence |
| --- | --- | --- | --- |
| Refundable, armable | AIRB000180 (Bangkok, MYR, breakfast, 1 night, 1 adult) | zero-penalty tier ends 2027-02-14T16:58:59Z; offset deadlines agree | Matching Gateway Drop capture (S0.4) |
| Non-refundable, cannot start | AIRB000179 (Kuala Lumpur, MYR, breakfast, 1 night, 1 adult) | `offerNonRefundable: true`, one fully charged tier | None: packaged with no search |
| Free cancellation closing soon | Gap | AIRB000180 would only become closing-soon from 2027-01-31; real dates are not altered to fake it | Owner-created quotation |
| Variety: city, currency or board | Partial: two cities | Both MYR, both breakfast, both 1 night and 1 adult, both 5-star | Owner-created quotations |

Owner-created quotation needs for S0.2 (air1 staging, `status='quote'`, one room,
1 to 4 adults, explicit UTC cancellation schedule):

1. A refundable quotation whose free-cancellation deadline falls within 14 days of
   the planned judging window (closing soon, still armable).
2. Two or three further refundable quotations that add variety: another city, a
   board other than breakfast (for example room only), more than one night or
   two adults, and a different booking currency if the air1 agency can quote one.
3. Optionally a refundable quotation whose free window has already ended, if a
   real one exists. This is only needed if the owner wants that state shown.

Each new code needs an owner-approved code list entry, a sanitised projection
(S0.3), and for armable entries a bounded Gateway capture (S0.4). The coverage
matrix stays open until those exist. These two samples prove mechanics only.

### F1: Adapter and capture preparation

`tests\altovo-catalogue.test.mjs` is a new file. The existing
`tests\altovo-quotation.test.mjs` is kept and still passes. One of its fixtures
now sets `offerFreeCancellation: false`, because a free-cancellation flag with
every tier charged is a conflict, and conflicts stay unknown.

It covers:

- naive schedule instants refused;
- a missing or non-boolean non-refundable flag leaves cancellation unknown;
- six conflicting-fact cases;
- the 1970 sentinel and naive offer deadlines ignored;
- overlapping or gapped tiers, and penalty money/currency bindings;
- schedule coverage at arm time;
- retail/source/FX bindings;
- missing core facts with reasons;
- absent display facts listed in `notSupplied`;
- provenance and agency defaults (`searchContextSource: agency-default`,
  `occupancySource: agency-default-adults-only`);
- preparation:
  - a dry run that makes no upstream call and writes nothing;
  - the approved-code list;
  - an injected Gateway search that uses only the my/my adults-only defaults;
  - per-code capture records (`not-searched`, `observed`, `observed-empty`);
  - failed searches (HTTP, application failure, hotel mapping) leave the run
    blocked with no catalogue file;
  - cannot-start entries prepared with no network call;
  - the display-safe public projection (`deploymentCatalogue`), which drops
    private references and the capture record.

Commands (worktree, 18 October 2026, after commit `4393134`):

- `node --test .\tests\altovo-catalogue.test.mjs .\tests\altovo-quotation.test.mjs .\tests\booking-catalogue.test.mjs`:
  tests 28, pass 28, fail 0, skipped 0.
- `node .\tests\booking-judge.browser.mjs`: exit 0. It listens on port 0 and
  writes screenshots to the worktree's ignored `.local\judge-flow\browser`.
- Local dry run of the real projections. This ran in-process: `main` was called
  with `root` set to the shared checkout and a `fetchImpl` that throws on any
  call. Result: `status: validated`, AIRB000179 `NON_REFUNDABLE` with no planned
  search, AIRB000180 armable with one planned search. Both pass the zero-fee FX
  binding. No file was written.

Still open:

- no live S0.2 to S0.4 step has run;
- no Drops exist for AIRB000180;
- card photo, city name and scenario label are curated S0.5 facts and are not
  part of the bundle yet.
