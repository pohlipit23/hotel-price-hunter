# Direct gateway verification

16 October 2026, Asia/Kuala_Lumpur. Direct gateway source-only reads are verified.
Original-booking comparison, customer refund, public UI and deployment are not
established by this work.

## Live calls

After the owner selected direct gateway access and the exact gateway credential
file, the production adapter authenticated and read one known hotel through
`POST /api/v2/search-by-id`. It did not use the engine availability/rates pair.

Both successful checks used Four Seasons Hotel Kuala Lumpur, catalogue ID
`21122615`, 12–15 November 2026, one room/two test adults, no children/infants,
Malaysia nationality/residence, no package, no supplier restriction and
`price_comparison:false`. These are test inputs, not a retrieved guest booking.
The gateway returned USD; no requested MYR engine currency or conversion policy
was transplanted into the gateway request.

| Evidence | First transport probe | Finished runner verification |
| --- | --- | --- |
| Capture | `5d553881-884b-4fa0-aebd-a1d2cebbef7e` | `db07af15-72bb-4122-9277-aa6dad4081f1` |
| UTC start | `2026-10-16T10:32:07.166Z` | `2026-10-16T15:24:51.503Z` |
| Gateway login | HTTP 200; 851 ms | Successful in the same private execution |
| Direct rate read | HTTP 200; **3,292 ms**, **236,150 decoded bytes** | Successful; **3,983 ms** for login + read + normalisation |
| Observed results | 2 sources, 132 room entries, **301 rates** | 3 sources, 143 room entries, **301 rates** |
| Current source observation | `progress:0`; completeness unverified | Completeness unverified |

Room entries are source-specific; those counts are not verified unique equivalent
room categories. Different source returns between executions do not establish
exhaustive coverage. No comparable completed bulk-engine payload was captured,
so these measurements do not establish an apples-to-apples speed multiplier.

First safe summary: `.local/live-engine/direct-gateway-5d553881-884b-4fa0-aebd-a1d2cebbef7e-summary.json`.
Its `-private-wire.json` retains a credential-free field projection for offline
mapping, and `-private.json` retains the then-current normalisation. The later
saved source snapshot is
`.local/live-engine/gateway-observation-db07af15-72bb-4122-9277-aa6dad4081f1.json`.
Opaque supplier/rate references stay private; credentials and tokens are absent.

## What the actual fields establish

The first capture has 301 complete `rate_detail` selection strings. One source's
124 rates provide explicit net/gross amounts. The other 177 provide a generic
gateway price without net/gross; 176 of those prices carry meaningful extra
decimal places (for example four decimal places in USD), not floating-point dust.
Those decimals are retained, not silently rounded or reclassified as net/retail.
All 301 original generic prices remain available in the private wire projection.

The later finished-runner snapshot has 118 explicit net/gross pairs, 132 generic
prices exactly representable in cents and 169 offers with preserved precision
evidence. Those counts belong to that later snapshot and must not overwrite the
first capture's cohort.

The first capture has cancellation tiers on 300 rates, 480 tiers total; none
explicitly states penalty currency or timezone. The later snapshot has 476 tiers,
22 with currency, none with explicit timezone. No naive timestamp was relabelled
UTC. Fee evidence remains distinct from a verified all-in/refund calculation.
Observations are non-actionable and contain no customer refund claim.

## Tests and limits

The 13 focused gateway checks pass: separate login/token handling, the fixed
single-hotel route/headers, exact request validation, body/deadline guards, safe
errors, input/private-output boundaries, context deduplication, currency/precision
preservation and rejection of foreign hotel mappings. Each implementation slice
was preceded by failing tests. The final shared-checkout Node regression suite
passes **231**, zero failures, with **six existing emulator integration skips**
(237 total), recorded in `.local/live-engine/regression-gateway-release.tap`.
This suite also includes concurrently edited customer UI tests; those changes
were not authored or staged by this integration task.

The temporary sixteen-MiB engine draft was removed. Engine reads retain their
original four-MiB bound; gateway reads also retain four MiB. The optional paged
engine rooms read has local transport tests but has not been runtime-verified;
the owner-directed gateway path supersedes that planned probe.

The scraper account's earlier gateway login returned HTTP 500. One bounded
diagnostic identified `user not found`; no rate request followed with that
account. Only after the owner's explicit selection was the separate gateway
credential file used. Those failed summaries remain under `.local/live-engine/`.

No booking retrieval, prebook/hold, booking, cancellation, refund, email, model
generation, cloud mutation, deployment or public exposure was performed. No
booking code has yet been supplied to bind an original customer retail baseline.
The existing public jury fixture and all unrelated dirty UI/branding/release work
remain separate.
