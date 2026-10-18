# Highest-drop hero deployment

16 October 2026, Asia/Kuala_Lumpur. The user approved deployment after the
[exact image/destination and ten-visitor baseline request](roomdrop-hero-release.md).

| Pin | Value |
| --- | --- |
| Source | `901a5b4a34eb6518c02f9d8076899d766e65e85a` |
| Context SHA-256 | `6d54942fb386ffc11d865b29dbd1e3659d37ad50b7e4c665277ef7cf22a65fd3` |
| Registry | `asia-southeast1-docker.pkg.dev/sincere-apex-511418-p0/hotel-price-hunter/roomdrop` |
| Verified digest | `sha256:cc20e5a08ce487d460b5c9491b9faa6fbba04908f965ae2c3f8da12be3ad41c6` |
| Configuration digest | `sha256:86aed1bb4d44c039e68defb4b6eced8fb6161d8beb482bde34fb11b69133ba7d` |
| Service/project/region | `hotel-price-hunter` / `sincere-apex-511418-p0` / `asia-southeast1` |
| Operator | `pete@altovo.com` |
| Origin | `https://hotel-price-hunter-2qbcpylngq-as.a.run.app` |
| Ready revision, 100% traffic | `hotel-price-hunter-00010-dht` |
| Recovery revision | `hotel-price-hunter-00009-hgw` |
| Recovery digest | `sha256:b3d1a382767e2d3bf600d270df59aebde63e2f94ddee98b6ff8d00ab7fc43397` |

The exact image was uploaded using isolated short-lived authentication with
credential cleanup. A separate registry command hashed the returned manifest and
configuration and verified source/context labels. Registry lineage passed.
The sole image-only service update succeeded. Preflight passed 40 checks at
`2026-10-16T04:16:53.544Z`; after-state passed **40/40 checks**, zero failures, at
`2026-10-16T04:18:07.346Z`. The ready revision receives 100% untagged traffic at the
unchanged origin with the exact approved digest. Only the image and gcloud's
generated revision nonce differ in the service spec. Runtime identity, literal
model-free environment, resource/scaling settings, customer Run/IAP bindings,
project grants, agency configuration/IAP and watch configuration/IAM/status match.
The ten visitors' projected data, agency-case index and watch checkpoint hashes
match the accepted before-state. Anonymous root/bootstrap return Google sign-in
redirects (302). The watch job still has one execution and daily Scheduler is absent.

The accepted saved-data baseline contains ten visitor records, one agency-case
index entry and the unchanged watch checkpoint, as recorded in
`.local/hero-data-drift.json`. The release must preserve those projected booking,
operations, price-watch and index fields and checkpoint hashes through deployment.
This acceptance does not establish whether the earlier nine visitors changed
before the baseline was accepted.

Signed-in live visual/HTTP acceptance remains pending because the supported
browser runtime could not be imported (EPERM). Local B1 browser acceptance passed
13 groups and 96 layouts; package page/health/bootstrap and served-file checks
passed separately. These do not substitute for a signed live check. Inherited
IAM visibility retains its known organization-policy limitation.

No agency/watch mutation, watch execution, Scheduler creation, identity/grant,
API enablement, model/supplier/email call, booking transaction, source push,
public access or billing change is part of this release. No restoration is
authorized or performed.

Evidence: `.local/hero-release-upload-result.json`,
`hero-release-independent-registry-{evidence,result}.json`,
`hero-release-independent-{approved-manifest,runtime-manifest,config}.json`,
`hero-final-cloud-before.json`, `hero-release-deploy-ledger.json`,
`hero-release-deploy-service.json`, `hero-final-cloud-after.json` and the prepared
`hero-approved-*.{mjs,ps1}` scripts. Historical B1 verifiers remain unchanged.
