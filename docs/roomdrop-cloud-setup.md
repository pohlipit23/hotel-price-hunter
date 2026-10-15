# Private RoomDrop customer and daily watch proposal

Prepared 15 October 2026. **Offline only; no cloud operation is authorised or
executed by this bundle.** The authoritative scope is
[daily-watch-cloud-contract.md](daily-watch-cloud-contract.md). This is a private,
single-operator fictional demo, restricted to `pete@altovo.com`, with simulated
checks and no model, email, payment or supplier call.

## Requested next execution scope

The locally verified candidate is source `c9a7d7f139309763b0f5133fdb647eff0a85a462`
and local build manifest
`sha256:16340ebd837d00988d4ef0779e2ae8a0579011f8813f4b577d23099723c6a4d0`.
[The verification record](daily-watch-cloud-verification.md) pins its retained clean
checkout, actual build context and local image. No uploaded digest is yet observed.

The requested approval bundle is: upload this candidate to the fixed immutable image
path below; verify its exact registry bytes; update the existing customer privately
behind IAP for `pete@altovo.com`; create the two named watch identities and exact grants;
enable only the Scheduler API if needed; deploy the bounded watch job; and execute
that job **once** after genuine customer consent and customer/agency acceptance.
One execution permits at most two task attempts because the job has one retry.
Stop on any image/source/identity/policy mismatch. Preserve the agency service and
both historical release checkouts. The known inherited-IAM visibility limit remains
explicit, rather than requiring a broader organization grant.

This request excludes creating/activating the recurring schedule. That needs a later
approval after acceptance. Watch writer access is project-wide Firestore read/write;
the trigger gets only job-scoped invocation. The exact resources, identities and
limits are listed below. No supplier/model/email/real transaction, source push,
public access or billing upgrade is proposed.

Every proposed cloud command explicitly selects account `pete@altovo.com`, project
`sincere-apex-511418-p0` (number `977401667230`, organization `222849345270`) and
the Singapore resource location `asia-southeast1`. Global API/IAM commands have no
region flag; each structured command carries the fixed region as metadata. There
is no executable switch, local recurring automation, Cloud Tasks setup or cloud
fallback in the generator.

## Reviewable offline output

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-roomdrop-cloud.ps1
```

The result is JSON with argument arrays, named phases, explicit approval gates,
identities, limits and deferred activation commands. It does not call gcloud or
Docker, create credential directories or write plan files. The default plan uses
unusable source/digest placeholders and reports `readyForDeploymentReview=false`.
No command should be copied for execution until its gate has passed and the user
has separately approved its exact external scope and cost.

The ordinary plan excludes `OneShot` and `ActivateScheduler`. Selecting one of
those phases still only prints commands. Neither phase selection nor local
validation grants authority to execute them.

## Exact reviewed source and independently observed digest

After review, commit the complete milestone and retain its clean checkout; do not
build the dirty development checkout. The source pin must equal its exact HEAD.
The new `scripts/roomdrop-source-plan.mjs` checks tracked cleanliness and rejects
untracked files that would enter the image, symlinks, credential-named context
files, changed Docker allowlists and changed Dockerfile instructions. It hashes
actual local context bytes (including `.dockerignore`, `Dockerfile`, package/lock,
all `app` files, the fictional fixture and both worker scripts), with separate
Dockerfile/ignore hashes. `designs/brand/`, tests, docs and `.local/` are excluded
from the image. These filename checks supplement source review; they are not an
exhaustive secret scan. Git cleanliness alone is not a substitute for reviewing
the actual context bytes.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-roomdrop-cloud.ps1 -Phase Build -SourceCommit '<reviewed 40-character HEAD>'
```

The immutable image path is
`asia-southeast1-docker.pkg.dev/sincere-apex-511418-p0/hotel-price-hunter/roomdrop`.
The tag contains the source/context prefixes. Build one `linux/amd64` image with
provenance disabled, exact source/context OCI labels and user `node`. Upload,
including all registry authentication, needs separate approval. The prepared
isolated Docker `--config` directory has a fresh ownership nonce; do not change
global Docker credentials. Use the fixed account's short-lived access token only
in memory and through login stdin. Before cleanup verify its resolved absolute
path is a direct `.local/roomdrop-docker-auth-<nonce>` child, has no reparse points
and has the exact owner marker; remove only that directory using literal paths.

After an approved upload, a separate read-only reviewer must independently obtain
the registry digest and raw manifest/config bytes from this exact image, hash
them, and check source/context labels, architecture, runtime user/entrypoint,
command and absence of model/credential/emulator image environment. Tokens must
stay in memory, redirects disabled, and no raw credentials may enter evidence.
Store the reviewed bytes and a descriptor in ignored `.local/`, for example:

```json
{
  "image": "asia-southeast1-docker.pkg.dev/sincere-apex-511418-p0/hotel-price-hunter/roomdrop",
  "observedAt": "2026-10-15T00:00:00Z",
  "imageDigest": "sha256:<independently observed 64 hex characters>",
  "runtimeDigest": "sha256:<runnable manifest 64 hex characters>",
  "approvedManifestPath": "roomdrop-approved-manifest.json",
  "runtimeManifestPath": "roomdrop-runtime-manifest.json",
  "configPath": "roomdrop-config.json"
}
```

Paths resolve relative to that descriptor. For a single manifest, approved and
runtime paths/digests are identical. For an index, require exactly one runnable
Linux/AMD64 manifest and at most one correctly bound attestation. The helper
reuses the existing pure registry lineage checks without changing the historical
agency source guard. The observed timestamp and local files record the reviewer's
observation; local byte verification does not perform or prove a new registry read.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-roomdrop-cloud.ps1 -SourceCommit '<reviewed 40-character HEAD>' -ImageDigest 'sha256:<observed 64 hex characters>' -RegistryEvidenceFile '.local/roomdrop-registry-evidence.json'
```

A digest without source and evidence is rejected. Source mismatch, dirty tracked
files or changed registry/config bytes are rejected. The resulting local
`readyForDeploymentReview=true` means these local pins passed; cloud metadata,
IAM, billing, signed browser acceptance and external execution remain pending.
Deployment always uses the digest, never a tag. Preserve the historical customer
and agency release checkouts/verifiers exactly; the historical agency verifier
intentionally rejects this new build allowlist.

## Target services and direct grants

| Resource | Identity / scope | Prepared controls |
| --- | --- | --- |
| Existing customer `hotel-price-hunter` | Existing `hotel-price-hunter-runtime@sincere-apex-511418-p0.iam.gserviceaccount.com` | Own IAP gate; operator resource accessor; IAP service-agent invoker only; no public invoker |
| Existing agency `hotel-price-hunter-agency` | Existing dedicated `roomdrop-agency-reader` | Record before/after baseline; customer changes do not update its service, identity or IAM |
| Job `roomdrop-price-watch` | New `roomdrop-watch-writer@sincere-apex-511418-p0.iam.gserviceaccount.com` | Sole proposed project grant `roles/datastore.user`; no model role |
| Scheduler `roomdrop-daily-watch` | New `roomdrop-watch-trigger@sincere-apex-511418-p0.iam.gserviceaccount.com` | Sole proposed direct grant `roles/run.invoker` on that job only; no datastore/model/override permission |

`roles/datastore.user` is **project-wide Firestore read/write access**, including
all visitor state, indexes and checkpoints. It is not collection-scoped. The
existing customer's historical model permission remains part of its retained
identity; no new model grant is proposed and no model configuration is deployed.
No service-account keys, ADC updates, broad project invoker role or extra
delegation role is proposed. The operator must already have the required deploy
and `iam.serviceAccounts.actAs` permissions. Verify Google's Scheduler service
agent retains `roles/cloudscheduler.serviceAgent`; do not grant that role to the
trigger account or replace it with a broad role.

Customer settings are minimum zero/maximum one at service and revision levels,
1 CPU, 512 MiB, concurrency four, 30-second request timeout, request-based CPU,
startup boost disabled and generation two. Its environment is replaced with
exactly `NODE_ENV=production`, `GOOGLE_CLOUD_PROJECT=sincere-apex-511418-p0`,
`APP_SURFACE=customer`, and
`APP_ORIGIN=https://hotel-price-hunter-2qbcpylngq-as.a.run.app`. Remove previous
model settings and secret/mount configuration. Re-observe the canonical URL and
require exact equality before operator acceptance; a mismatch blocks rollout.
IAP protects the whole customer service while visitor cookies, exact-origin and
CSRF guards continue protecting customer state. This is not multi-user customer
account authentication. Grant only `user:pete@altovo.com` the customer resource
`roles/iap.httpsResourceAccessor` role; this is separate from agency access.

The job overrides command/args to `node scripts/run-price-watch-job.mjs`, with no
application arguments, one task, parallelism one, one retry, 300-second timeout,
1 CPU and 512 MiB. Its exact configured environment is `NODE_ENV=production`,
the fixed project, `PRICE_WATCH_JOB_ENABLED=true` and
`PRICE_WATCH_PROVIDER_MODE=simulated-fixture`. Cloud Run itself supplies
`CLOUD_RUN_JOB=roomdrop-price-watch`; never set reserved job/runtime variables.
The job uses attached identity and has no advisor, supplier or email adapter.
Deploying it does not execute it; no `--execute-now` flag is prepared.

## Acceptance before scheduling

1. Independently verify fixed project, billing, enabled APIs, existing protected
   Firestore database/immutable registry, before-state source/image/config/IAM,
   inherited-policy coverage and retained customer identity. Unknown API, auth or
   network errors cannot count as resource absence. The known organization IAM
   visibility gap must remain explicit; never fabricate complete access proof.
2. Confirm the scheduler is absent. If a matching owned scheduler already exists,
   pause it and independently require `PAUSED` before acceptance. An unexpected
   resource or binding is a blocker requiring a reviewed resolution. Do not
   silently reuse a collision, delete access or grant broader permissions.
3. Obtain explicit approval for customer update, image upload, API/IAM changes,
   attached identities and costs. Apply only the approved phases. Independently
   verify exact deployed digest/revision/env/limits, IAP and direct policies,
   anonymous denial, operator sign-in and actual fictional customer persistence.
   Verify agency revision/config/IAM and signed access remain unchanged.
4. Separately approve and run exactly one bounded watch execution with no
   overrides. Inspect the resulting Cloud Run execution through completion and
   aggregate safe counts; verify real Firestore dedupe/checkpoint writes,
   restart/replay and consent/expiry behavior. Submission acknowledgement is not
   processing success. Emulator tests do not close these cloud acceptance gates.
5. Obtain explicit recurring activation approval for **08:00 daily,
   Asia/Kuala_Lumpur**. Only now create the scheduler. The fixed OAuth POST URL is
   `https://run.googleapis.com/v2/projects/sincere-apex-511418-p0/locations/asia-southeast1/jobs/roomdrop-price-watch:run`,
   body exactly `{}`, content type JSON, OAuth cloud-platform scope and trigger
   identity above. No OIDC, input/command/env override or dynamic URL is allowed.

Google documents Scheduler `state` as output-only and the create command has no
paused-at-create option. Therefore **leave it absent during acceptance**, then
create it only after activation approval; do not create then pause, invent a
paused flag, or rely on a distant initial schedule. Creation may submit work as
soon as the next approved schedule arrives. For an existing paused scheduler,
independently verify its complete exact target/configuration before proposing a
separately approved resume; this bundle does not silently resume it.

Scheduler trigger retries are zero to avoid duplicate submissions after an
ambiguous acknowledgement; its HTTP attempt deadline is 30 seconds. The job may
retry its failed task once. Scheduler's no-overlapping-request behavior does not
prevent overlapping Cloud Run executions because the API acknowledges submission
before processing finishes. Firestore checkpoint revision comparisons and daily
intents handle that overlap. To stop new submissions use the prepared
`PauseScheduler` phase, then require observed `PAUSED`. Pausing does not terminate
an already submitted Cloud Run execution.

Watch each Cloud Run execution's outcome and safe aggregate counts, plus sweep
lag. Each execution handles at most ten pages of 50 locators; 500 entries is not
a daily SLA at arbitrary index sizes. Failed/interrupted pages retain the prior
checkpoint; committed checks dedupe on replay and capacity/provider terminal
results remain truthful. No private locators, resume cursor, credential-bearing
exceptions or customer fields belong in logs. Resource limits reduce use but are
not a spending cap.

## Official references checked for this preparation

- [Cloud Run IAP flags, IAP service agent and resource access](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run)
- [Cloud Run job deployment flags and command/args behavior](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/deploy)
- [Cloud Run scheduled jobs and job-scoped invoker](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule)
- [Cloud Scheduler HTTP creation, OAuth, retry and deadline flags](https://docs.cloud.google.com/sdk/gcloud/reference/scheduler/jobs/create/http)
- [Scheduler Job schema: state is output-only](https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs#Job)
- [Run v2 jobs.run request body and overrides](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.jobs/run)

Local acceptance is separate from pending cloud evidence. Run
`node --test tests/roomdrop-cloud-plan.test.mjs` for fixed target/identity/limit,
offline/default-denial, scheduler race and source/registry tamper checks. No cloud
read, resource mutation, upload, model/supplier/email call or source push is part
of that test.
