# Private customer and watch-job rollout

15 October 2026, Asia/Kuala_Lumpur. The user replied **go ahead** to the concrete
[scoped rollout](roomdrop-cloud-setup.md): image upload, private customer IAP,
dedicated watch writer/trigger identities and grants, Scheduler API enablement,
bounded job deployment and one execution after customer/agency acceptance.
Recurring Scheduler creation/activation remains outside that approval.

## Deployed candidate

| Item | Observed value |
| --- | --- |
| Project / account / region | `sincere-apex-511418-p0` / `pete@altovo.com` / `asia-southeast1` |
| Clean source | `c9a7d7f139309763b0f5133fdb647eff0a85a462` |
| Retained source | `C:/Users/pohli/Sites/hotel-price-hunter/.local/roomdrop-watch-release` |
| Actual 32-file context SHA-256 | `6c49c8eef25752206e5e860480375f88b5d4fd43e7ac85ac212c6af8e787325c` |
| Immutable registry tag | `roomdrop-c9a7d7f13930-6c49c8eef257` under the existing repository's `roomdrop` image path |
| Uploaded and deployed manifest | `sha256:16340ebd837d00988d4ef0779e2ae8a0579011f8813f4b577d23099723c6a4d0` |
| Independently hashed OCI config | `sha256:d3c7556ba51898e1a1e6e081509ea246999c9d78c324914f9ce9dda96733c46d` |
| Customer revision | `hotel-price-hunter-00007-lrm`, Ready, latest created/ready, 100% untagged traffic |
| Customer origin | `https://hotel-price-hunter-2qbcpylngq-as.a.run.app` |
| Watch job | `roomdrop-price-watch`; one approved execution `roomdrop-price-watch-vm4f2` completed |

An independent read-only worker retrieved the registry manifest and config from
fixed endpoints with redirects disabled, hashed the raw bytes and verified source/
context labels, single Linux/AMD64 image, user `node`, `/app`, inherited entrypoint,
default server command and absence of model/credential/emulator image configuration.
The frozen source helper accepted that evidence without weakening source guards.

Registry authentication used the explicitly selected operator's short-lived token
only in memory/stdin and a fresh nonce-owned ignored Docker configuration directory.
Cleanup verified its absolute location, ownership and absence of reparse points
before literal-path removal. The global Docker configuration hash was unchanged.
No service-account key, ADC change or source push was used.

## Exact runtime and direct access

The customer retains `hotel-price-hunter-runtime` and has exactly four literal
application environment values: production mode, fixed project, customer surface
and exact canonical origin. Gemini settings were removed. The account's historical
model role is unchanged; it grants no new inference budget. Customer settings are
minimum zero/maximum one service and revision instance, 1 CPU, 512 MiB, concurrency
four, 30-second timeout, generation two, request-based CPU and no startup boost.

IAP protects the whole customer service; the invoker check remains enabled.
Its only direct Run invoker is the IAP service agent. Its only direct IAP accessor
is `user:pete@altovo.com`. Anonymous root and bootstrap requests return Google
sign-in redirects, not customer data. These gateway checks are not signed browser
acceptance. Visitor cookies, origin and CSRF protections remain application guards.

The new `roomdrop-watch-writer` has only project `roles/datastore.user` in the
observed direct grants. This reads/writes all project Firestore data, as explicitly
approved. The new `roomdrop-watch-trigger` has only job-scoped `roles/run.invoker`
and no project datastore/model/override role. Neither has user-managed keys or direct
delegation bindings. The Google-managed Scheduler service agent received its normal
`roles/cloudscheduler.serviceAgent` role with API enablement; no custom broad role
was substituted.

The job uses the dedicated watch writer, the exact uploaded digest, command `node`
and argument `scripts/run-price-watch-job.mjs`. It has one task, parallelism one,
one retry, a 300-second task timeout, 1 CPU and 512 MiB. Its four configured values
are production mode, fixed project, explicit job enablement and simulated-fixture
provider mode. Cloud Run supplies the reserved job identity. No model, credential,
emulator, secret or mounted configuration exists. Deployment did not execute it.

Scheduler API enablement is complete. `roomdrop-daily-watch` is confirmed absent;
no recurring trigger or local automation was created.

## Independent verification and preserved boundaries

Before granting human customer access, the independent verifier passed **44/44**
supported checks. After the exact operator grant it passed **4/4** narrow checks:
operator-only access plus unchanged customer/Run IAM, job/IAM and project grants.
The agency revision/configuration/Run and IAP policy fingerprints are unchanged,
as are the agency reader's and existing customer's project grants. Only the approved
writer grant and Google-managed Scheduler agent role were added at project level.

Reports retain `metadata-partial`, `fullAcceptance:false` and the known organization
IAM visibility limit. This does not claim an exhaustive inherited-policy audit.
The Firestore database and immutable repository protections remain verified.
The dependency audit found zero vulnerabilities. The exact application candidate
retains its earlier **194/194** emulator verification and independent package review.
After the operator-tooling correction and before the subsequent local UI work, the complete main-checkout emulator-enabled
suite passed **195/195**, zero failures/skips, in 113.6 seconds; its safe output is
`.local/roomdrop-post-rollout-regression.log`. This does not substitute local tests
for the pending genuine customer and cloud job-runtime checks.

One operator-tooling defect surfaced: the prepared job IAM command contained
`--condition=None`, which that command does not support. It failed client-side
before changing policy. The same approved unconditional job-scoped grant succeeded
after omitting that unsupported flag. The main generator has a durable fix and
a regression that failed before correction; the focused suite passes **7/7**.
The frozen image/source checkout remains untouched. See the
[official job-binding command](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/add-iam-policy-binding).
Its frozen generator therefore still contains the historical unsupported flag;
do not replay that command unchanged or edit the frozen release to hide the history.

Safe ignored evidence includes `roomdrop-preflight.json`, restoration pins,
`roomdrop-upload-result.json`, `roomdrop-independent-registry-{evidence,result}.json`,
raw registry bytes, `roomdrop-independent-cloud-{before-access,after-access}.json`
and the non-running job/role observations under `.local/`. No credentials or raw
Google subject identifiers are printed in reports or committed.

## Live acceptance and the one approved execution

The supported Browser runtime import failed with EPERM before bootstrap. The
Computer Use browser-state request then timed out waiting for app approval, before
page interaction. No browser input, cookie/token extraction, profile copy or sign-in
workaround occurred. The user responded **Completed all checks** to one bundled
acceptance request:

1. Sign in as `pete@altovo.com` at the customer origin, enable **Watch for better
   rates**, reload and confirm saved consent.
2. Deliberately approve one simulated switch and continue its separate stages until
   the simulated refund completes.
3. Confirm that case in the separate agency service's **Saved cases** view.

This is direct human-reported functional acceptance, without an automated signed
capture or raw authenticated HTTP record. The user subsequently reported too much
UI text and unclear customer steps; that usability work is tracked separately in
[customer-clarity-contract.md](customer-clarity-contract.md). It does not change the
deployed source or broaden cloud authority.

The coordinator then submitted the approved job exactly once using an exclusive
execution ledger. Execution `roomdrop-price-watch-vm4f2` completed with one successful
task and one attempt. The independent read-only worker passed **20/20** checks for
the job/execution identity, exact image/configuration, task completion, sanitized
application result, persisted records/checkpoint and absent Scheduler. The source
and runtime are still the approved `c9a7d7f` candidate.

The application logged `SWEEP_COMPLETED`, one page/one examined watch, one recorded
result and no replay. Its provider outcome was **failed `SOURCE_UNAVAILABLE`** for
the promoted booking: `searched:false`, zero offers, no no-saving claim. This is the
documented fixture-provider limitation, recorded truthfully rather than treated as
a successful rate search. One preview-only event was persisted; no delivery was
attempted. The private checkpoint is durable at revision one with no resume cursor.

Three same-execution log entries were read with complete bounded pagination. Earlier
empty log scans and protobuf-shape parser issues are retained separately; they did
not indicate a cloud failure and did not cause a rerun. Task retry/exit-code values
were omitted as protobuf defaults; zero is inferred only alongside completed-task
success, a completion timestamp and the successful execution count.

Safe final evidence is `.local/roomdrop-watch-once-ledger.json`,
`roomdrop-human-acceptance.json` and `roomdrop-independent-once-final-result.json`.
The one-execution approval is spent. Do not rerun or reset its ledger. Scheduler
remains absent; recurring activation still needs separate approval.

No active schedule, real supplier action, actual payment/refund, model generation,
email, public access, source push or billing upgrade occurred. Organization IAM
coverage remains partial. Historical agency sign-in proof remains separate.
