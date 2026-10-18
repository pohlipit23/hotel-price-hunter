# B1 private customer deployment

16 October 2026, Asia/Kuala_Lumpur. The user requested deployment of the
[B1 release](roomdrop-b1-release.md), then explicitly confirmed completion after
automatic approval review requested exact image and registry authorization.

The approved image was uploaded to the existing private registry and deployed by
immutable digest using an image-only update of `hotel-price-hunter` in
`asia-southeast1`, project `sincere-apex-511418-p0`, account `pete@altovo.com`.

| Pin | Verified value |
| --- | --- |
| Source | `521fd329db9bef77a14ce03037343f821e98adad` |
| Context SHA-256 | `e5dbf6ca5d6c4415ea6ed2ea6fb52972040763ff7327bb284af12dbe8811bbd3` |
| Registry image | `asia-southeast1-docker.pkg.dev/sincere-apex-511418-p0/hotel-price-hunter/roomdrop` |
| Immutable tag | `roomdrop-521fd329db9b-e5dbf6ca5d6c` |
| Registry/runtime digest | `sha256:b3d1a382767e2d3bf600d270df59aebde63e2f94ddee98b6ff8d00ab7fc43397` |
| Configuration digest | `sha256:6321861de6db89aad45641d528f3c3eadd42b1fda96620252e09941ea212d7c0` |
| Ready revision | `hotel-price-hunter-00009-hgw` |
| Customer origin | `https://hotel-price-hunter-2qbcpylngq-as.a.run.app` |
| Previous revision | `hotel-price-hunter-00008-87j` |
| Recovery digest | `sha256:9f6f5c33d904139e166f842fde496f79431e229085dbd7bb9b4a2e5eef01e38f` |

The uploader verified the frozen source/context and local image, used isolated
short-lived registry authentication, removed its owned authentication directory,
and verified that global Docker configuration was unchanged. A separate registry
command retrieved and hashed manifest/configuration bytes and checked source and
context labels before deployment. The update rechecked source/registry evidence
and the service resource version before its sole submission.

The immediately preceding cloud baseline passed 39 checks at
`2026-10-16T03:24:17.552Z`. It matched the approved previous-release fingerprints
for customer access, project grants, agency, watch job and saved fixture data.
The after-state pass completed at `2026-10-16T03:25:30.547Z`: **40/40 checks
passed**, with zero failures. The new ready revision receives 100% untagged traffic
at the unchanged origin with the approved digest. The service spec differs only
in the image and gcloud's generated revision nonce. Runtime identity, four literal
model-free environment values, resource/scaling settings, customer Run/IAP bindings,
project grants, agency configuration/IAP and watch job configuration/IAM/status
are unchanged. Anonymous root and bootstrap requests return Google sign-in
redirects (302).

The saved-data check covers all nine visitor documents' booking, operations and
price-watch fields, the one agency-case index entry and the watch checkpoint;
counts and hashes match before/after. The watch job still has one execution and
the daily Scheduler remains absent. Verification is `metadata-partial` with
`fullAcceptance:false` because the limits below remain.

## Acceptance limits

The supported browser connection failed with EPERM while importing its runtime,
before page access. Signed-in live visual acceptance, authenticated HTTP health,
served assets and bootstrap checks remain unverified. The prior packaged image
checks passed page/bootstrap and all five frontend hashes using test-memory
storage; those checks do not establish live cloud HTTP acceptance.

Refresh the customer origin while signed in as `pete@altovo.com` and confirm the
B1 photo-ticket page, negative saving stamps, filters and illustrated review.
No new consent, booking approval or simulated switch is required for this check.
Inherited IAM coverage retains the known organization-policy visibility limit.

No agency/watch update, watch execution, Scheduler creation, API enablement, new
grant/identity, model/supplier/email call, transaction, source push, public access
or billing change was performed. Recovery requires separate explicit authority;
no restoration was submitted.

## Evidence

Fresh ignored evidence is retained under `.local/`: `b1-release-upload-result.json`,
`b1-release-independent-{approved-manifest,runtime-manifest,config}.json`,
`b1-release-independent-registry-{evidence,result}.json`,
`b1-final-cloud-before.json`, `b1-final-cloud-after.json`, `b1-release-deploy-ledger.json`,
`b1-release-deploy-service.json`, and the new B1 verification scripts. Historical
verifiers and release checkouts were preserved.
