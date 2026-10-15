# Private customer clarity release

16 October 2026, Asia/Kuala_Lumpur. The user explicitly **Approved** the exact
[customer-only release](customer-clarity-release.md). The existing private customer
service was updated; agency, watch-job and access changes were outside this scope.

## Released candidate

| Item | Verified value |
| --- | --- |
| Project / operator / region | `sincere-apex-511418-p0` / `pete@altovo.com` / `asia-southeast1` |
| Clean source | `16adf72b26d445ea9a5502dface2afd7771bf49d` |
| Retained checkout | `C:/Users/pohli/Sites/hotel-price-hunter/.local/roomdrop-ui-release` |
| Actual 32-file context SHA-256 | `180c227be4390eacdc9510859382ee75f3d841a303e350b57a5017af1361d507` |
| Immutable tag | `roomdrop-16adf72b26d4-180c227be439` under the existing private `hotel-price-hunter/roomdrop` image path |
| Registry and runtime digest | `sha256:9f6f5c33d904139e166f842fde496f79431e229085dbd7bb9b4a2e5eef01e38f` |
| Independently hashed OCI configuration | `sha256:fbc81073aa0f0ae9857ba04cebc29cc30b1c355e2e5f0b9ab647a2bd50299615` |
| Ready customer revision | `hotel-price-hunter-00008-87j` |
| Canonical customer origin | `https://hotel-price-hunter-2qbcpylngq-as.a.run.app` |
| Previous customer revision | `hotel-price-hunter-00007-lrm` |
| Previous customer digest | `sha256:16340ebd837d00988d4ef0779e2ae8a0579011f8813f4b577d23099723c6a4d0` |

The frozen source/context check passed before upload and again before the update.
The uploader checked the exact local image, used the fixed operator's short-lived
token through stdin and a nonce-owned ignored Docker configuration directory, then
removed that directory after path/ownership/reparse-point checks. Global Docker
configuration was unchanged. No key or ADC configuration was created.

A separate read-only registry pass fetched and hashed the actual manifest and
configuration bytes from fixed endpoints, with redirects disabled. Both digests,
source/context labels and existing lineage checks passed before deployment. This
was a separate verification command, not a new agent review. The prior independent
UI review and local test results remain in
[customer-clarity-verification.md](customer-clarity-verification.md).

## Update and verification

The sole service mutation used `gcloud run services update hotel-price-hunter`
with the verified `--image` digest and explicit account/project/region. No settings
or IAM update flags were supplied. The command is documented in Google's
[service update reference](https://docs.cloud.google.com/sdk/gcloud/reference/run/services/update).
A before-state snapshot and exclusive submission ledger were retained. No retry
or second revision update was submitted.

The first after-state comparison caught the changed `client.knative.dev/nonce`
label as configuration drift. Exact inspection showed only that regenerated CLI
nonce and the approved image differed in the service spec. The new local checker
now normalizes only those two fields and compares every remaining spec field;
a copied-object memory-limit mutation was rejected. Historical verifiers and
frozen release checkouts were not changed. The fresh complete read-only pass then
passed **40/40** checks, with no failures, at `2026-10-15T16:06:36.284Z`
(16 October locally).

The retained before-state checks establish private IAP, exact customer runtime
identity/environment/limits, a ready revision and full untagged traffic. Saved
fixture checks cover all nine existing visitor documents' booking, operation and
watch fields, the one agency-case index entry and the persisted watch checkpoint.
Their aggregate counts/hashes match after deployment. Agency service/Run IAM and
IAP fingerprints, job configuration/IAM/status, project grants and customer Run/IAP
bindings are unchanged. The job still has exactly one execution and the daily
Scheduler is absent. Both anonymous root and bootstrap return Google sign-in
redirects (302). The ready customer revision receives 100% untagged traffic with
the approved digest, existing identity, four model-free literal environment values
and unchanged resource limits. These machine checks retain `metadata-partial` and
`fullAcceptance:false` for the known inherited-IAM and signed-browser limits.

## Signed browser acceptance and authority

Browser connection failed with EPERM while importing its supported runtime, before
page interaction. No browser session, cookie, profile or token workaround was used.
The revised live customer's signed visual acceptance is **pending human
confirmation**. Earlier human acceptance applies to the previous customer source;
local browser tests are not a live signed capture for this revision.

Refresh the customer origin while signed in as `pete@altovo.com` and confirm the
shorter Price watch, single Choose / Review / Switch & refund guide and clear
saved/completed state. This acceptance requires no new watch consent, booking
approval or simulation advance. Do not repeat transactions to check this release.

The watch job keeps its previous `c9a7d7f` image and spent one-execution approval.
Scheduler remains outside the approved scope. No model, supplier, payment, email,
source push, public access, new identity/grant, API enablement or billing change
was authorized or performed. Organization IAM visibility remains partial; metadata
verification does not claim exhaustive inherited-policy acceptance.

The before-state source revision and digest above remain restoration pins. If
restoration becomes necessary, prepare the previous immutable image update against
the saved service/IAM baseline; preserve private access and the unchanged data.
No restoration was needed or executed.

Ignored evidence: `.local/clarity-cloud-before.json`, `clarity-upload-result.json`,
`clarity-independent-{approved-manifest,runtime-manifest,config}.json`,
`clarity-independent-registry-{evidence,result}.json`, `clarity-deploy-ledger.json`,
`clarity-deploy-service.json`, `clarity-spec-diff.json` and
`clarity-cloud-after.json`. These are separate from the historical rollout evidence.
