# Highest-drop hero release

Prepared and deployed 16 October 2026, Asia/Kuala_Lumpur. After the initial upload
approval rejection, the user approved the exact image/destination and ten-visitor
baseline request with "Deploy the updates." The highest-drop hero is now ready
as `hotel-price-hunter-00010-dht` with 100% traffic. See the
[execution and acceptance record](roomdrop-hero-execution.md).

| Pin | Value |
| --- | --- |
| Clean source | `901a5b4a34eb6518c02f9d8076899d766e65e85a` |
| Frozen checkout | `.local/roomdrop-hero-release` |
| Context SHA-256 | `6d54942fb386ffc11d865b29dbd1e3659d37ad50b7e4c665277ef7cf22a65fd3` |
| Local image | `roomdrop-customer-hero:901a5b4a34eb-6d54942fb386` |
| Image digest | `sha256:cc20e5a08ce487d460b5c9491b9faa6fbba04908f965ae2c3f8da12be3ad41c6` |
| Configuration digest | `sha256:86aed1bb4d44c039e68defb4b6eced8fb6161d8beb482bde34fb11b69133ba7d` |
| Registry destination | `asia-southeast1-docker.pkg.dev/sincere-apex-511418-p0/hotel-price-hunter/roomdrop` |
| New tag | `roomdrop-901a5b4a34eb-6d54942fb386` |
| Customer service | `hotel-price-hunter`, `asia-southeast1`, `sincere-apex-511418-p0` |
| Operator | `pete@altovo.com` |
| Expected previous revision | `hotel-price-hunter-00009-hgw` |
| Recovery digest | `sha256:b3d1a382767e2d3bf600d270df59aebde63e2f94ddee98b6ff8d00ab7fc43397` |

Only two packaged frontend files differ from the previous release. The hero now
uses the highest verified net saving among main refundable offers, with matching
photo, hotel, room and price. It retains a small original-booking reference and
falls back to the current booking when no offer is eligible. No backend changed.

Local browser acceptance passed 13 groups, 96 layouts and 32 screenshots, including
changed ranking and no-offer fixtures, with no runtime errors. Node tests passed
189 with six emulator integration skips. The new image passed page, health and
bootstrap checks in a network-disabled read-only test-memory container; all five
served frontend hashes match the clean checkout. Syntax/whitespace checks pass.

After explicit image/destination approval, use isolated short-lived registry
authentication, independently retrieve/hash registry manifest and configuration
bytes, refresh cloud preflight and stop on drift. Update only the customer image
by its verified immutable digest, then compare service settings, private IAP,
project grants, agency/watch configuration and saved-data fingerprints.

Preserve all existing runtime settings and access. No watch execution, Scheduler,
new identity/grant, API enablement, model/supplier/email call, booking transaction,
source push, public access or billing change is included. Restoration requires
separate authorization. Signed-in live acceptance and inherited IAM visibility
retain the limitations in the [previous deployment record](roomdrop-b1-execution.md).

New ignored evidence/scripts use `.local/hero-*`; historical B1 records remain
unchanged. The cloud-before result is retained as `.local/hero-final-cloud-before.json`
when its checks succeed; it must be refreshed before the eventual update.

The read-only preflight stopped at `BASELINE_DATA`: visitor count changed from
9 to 10 since the previous deployment. An independent aggregate reread at
`2026-10-16T04:03:08.367Z` confirmed this change. Agency-case count/hash and watch
checkpoint hash match, and all preceding service/access/configuration checks
passed. Evidence: `.local/hero-data-drift.json`. Aggregate hashes do not establish
whether the nine earlier records changed. No saved-data write was performed.
The user's subsequent deployment confirmation accepted the current ten-visitor
snapshot. The refreshed preflight checked that exact observed snapshot, and the
post-deployment comparison confirmed it remained unchanged. Historical evidence
and the original drift checker remain intact.
