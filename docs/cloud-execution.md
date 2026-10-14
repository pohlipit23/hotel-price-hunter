# Private deployment execution evidence

Executed **13 October 2026, Asia/Kuala_Lumpur**. Target project only: `sincere-apex-511418-p0` / `977401667230`.

**Current verification update, 14 October:** private revision `hotel-price-hunter-00006-hfm` passed cloud persistence/security checks and both newly authorised failed-case live retests. Full responses passed root and fresh independent semantic review, recorded in `docs/review-live-advice.md` and `docs/private-cloud-verification.md`. Original three-call evidence remains unchanged; separate exhausted ledgers are 3/3 and 2/2, five total. Generation is stopped. This does not authorise public access or establish trial credit balance. Operator stages and their zero-generation statements below describe their original execution times.

The human's **13 October “go ahead with the approved plan”** followed the coordinator's explicit bundled request to confirm usable trial credits and approve Singapore resources, image upload, private deployment and at most three anonymised Gemini verification questions. Credit confirmation is **user-confirmation evidence only**: remaining balance, trial classification and expiry were not independently observed. Billing was rechecked enabled before each stage. No billing link or paid upgrade was performed.

The operator used normal-host Windows PowerShell and the reviewed deployment script. Image source was isolated checkpoint `9c98ede278dc5a93c9563e729dbe7df8d594bfb6` at `C:/Users/pohli/.codex/worktrees/private-cloud-deployment/hotel-price-hunter`. Current checkout UI changes and unknown-owner `tests/presentation.test.mjs` were preserved, not run/staged/deleted, and absent from the image snapshot. No source Git push occurred.

## Provisioning and first private deployment

| Stage | Actual result |
| --- | --- |
| Fixed target/billing guard | Passed before each stage: exact project number, ACTIVE lifecycle and billing enabled. Account/payment identities suppressed. |
| Six API enablement | Completed: Run, Firestore, Artifact Registry, Vertex (`aiplatform`), IAM, Cloud Resource Manager. No Cloud Build/Scheduler/Tasks setup. |
| Firestore `(default)` | Created following successful empty listing; independent metadata confirms **FIRESTORE_NATIVE**, **STANDARD**, **asia-southeast1**, **DELETE_PROTECTION_ENABLED**. |
| Artifact Registry | `hotel-price-hunter`, Singapore, **DOCKER**, **immutableTags=true**, verified after creation. |
| Runtime identity | `hotel-price-hunter-runtime@sincere-apex-511418-p0.iam.gserviceaccount.com`, matching enabled app account. |
| Runtime grants | Exactly the two reviewed direct project grants, without conditional/unrelated grants: `roles/datastore.user` and `projects/sincere-apex-511418-p0/roles/hotelPriceHunterPredict`. Custom role is GA/non-deleted with exactly `aiplatform.endpoints.predict` + `serviceusage.services.use`. Script rechecked metadata/grants before deployment. |
| First image | Immutable tag `milestone-20261013`, index digest **`sha256:6d27cbe0f79b7cb62f643bd7d34977d224a3185ffab4eec358f16686194fdc8f`**; registry verified. |
| First private deployment | Ready revision **`hotel-price-hunter-00002-plm`** after origin update, latest-created=latest-ready, Ready=True, 100% traffic. Metadata observed `2026-10-13T15:16:49Z`. |
| Canonical origin | **`https://hotel-price-hunter-2qbcpylngq-as.a.run.app`**, exact `APP_ORIGIN` while invocation remains private. |
| Public authority | No service `allUsers`/`allAuthenticatedUsers` invoker binding, invoker IAM enabled. No Publish/DisablePublic/resource-deletion command executed. |

Full registry image path: `asia-southeast1-docker.pkg.dev/sincere-apex-511418-p0/hotel-price-hunter/app@<digest>`.

Observed production configuration: one container, no volumes/mounts or secret-sourced env; exactly five literal env values: `NODE_ENV=production`, target `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=global`, `GEMINI_MODEL=gemini-3.1-flash-lite`, canonical `APP_ORIGIN`. No emulator, ADC, token or API-key variable.

Observed controls: CPU `1`, memory `512Mi`, concurrency `4`, timeout `30s`, container port `8080`, service maximum `1`, revision maximum `1`, CPU throttling `true`, startup CPU boost `false`, ingress `all`. Service minimum annotation is omitted after the explicit `--min=0` deployment flag; Google's documented default is zero. This is not a separately observed numeric min annotation. [Minimum-instance default](https://docs.cloud.google.com/run/docs/configuring/min-instances)

## Bounded script capture correction

Initial Provision enabled the six APIs and created Firestore, then stopped before registry creation: native Artifact Registry list exited 0 with valid stdout `[]`, but a single non-error stderr progress line contaminated strict JSON because the original helper used `2>&1`.

Only the isolated capture line changed to `2>$null`, preserving native nonzero-exit rejection, strict JSON and all target/resource/IAM/origin guards. The native offline fixture reproduced failure before the fix and passed afterward: valid JSON stdout plus progress stderr succeeds, native exit 7 still throws. Fresh independent review reran **29/29 guard/build fixtures**, AST zero diagnostics, and approved; the coordinator authorised continuation. Provision resumed idempotently and reused the verified database.

Diagnostics printed only fixed-field shape/count metadata; temporary stderr files were removed with literal-path commands. No token, raw ADC, account identity or payment data was printed. [PowerShell streams](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_output_streams), [redirection](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_redirection)

## Credential/configuration preservation

Image upload used nonce-owned ignored `DOCKER_CONFIG` and the existing CLI credential helper. Observed before/after global Docker configuration hashes were equal; the prior environment was restored and temporary auth directory count was zero. CLI project/Run region remained unset. Local ADC remains `authorized_user` with its original quota project `pohlschmidt-digital`; neither local ADC nor quota configuration was changed or included in the image. No service-account key was created.

The allowlisted image context was checked against the approved source: nine app files, fictional `jury-booking` fixture, no customer field, zero embedded known credential-pattern matches. Filename/content heuristics supplement the independent source review; they do not establish an exhaustive secret scan. Dirty main-checkout UI and tests were excluded by the isolated source checkpoint.

## Approved image index and runtime child provenance

Cloud Run's service template retained the requested OCI index digest `6d27cbe...fdc8f`; the resolved revision image/status digest was `70119ab...c808`. This was not accepted blindly.

A read-only registry-v2 HTTPS request used the existing CLI access token only in memory, disabled redirects, emitted no credential, and hashed the returned index bytes. They exactly matched approved index `sha256:6d27cbe0f79b7cb62f643bd7d34977d224a3185ffab4eec358f16686194fdc8f`, OCI schema 2 / `application/vnd.oci.image.index.v1+json`. The two descriptors were:

- Sole runnable **linux/amd64** manifest: **`sha256:70119ab3a3b0f55a6d3176f2e3b236c7d5b62f3cf0c0039ec071b22f51ebc808`**, matching the resolved Cloud Run revision.
- **unknown/unknown** attestation descriptor: `sha256:96d4086bfeed66c738602d7092e304f5c983a5cdf732cde802f032e752730f1e`.

The independent reviewer proved the same relationship. No image upload, revision change or global credential configuration was needed for this read. [OCI index descriptors](https://github.com/opencontainers/image-spec/blob/main/image-index.md), [registry authentication](https://docs.cloud.google.com/artifact-registry/docs/docker/authentication)

## Narrow Cloud Run health compatibility repair

Independent checks obtained authenticated 200 on root/static resources with matching approved source, but `/healthz` returned GFE HTML404 before reaching the application. Google's known issues describe reserved paths ending in `z`. This blocked private acceptance; it was not reported as a passing health check. [Reserved paths](https://docs.cloud.google.com/run/docs/known-issues)

The coordinator authorised only an isolated alias: `GET /health` reaches the identical liveness handler while `/healthz` remains for local compatibility. Red regression first got `/health` 404 rather than 200. Green server tests passed **11**, with **one explicitly skipped emulator integration**; the new test proves identical JSON for both aliases, no visitor cookie, and zero storage/model calls. No UI/domain/permission/origin behaviour changed.

The independent reviewer approved the one-line handler diff, focused regression and deployment note; the coordinator authorised continuation under the existing private-functional setup scope. A replacement image was built/uploaded and deployed privately without changing IAM permissions, model authority, exact origin or resource limits. The original tag/index remains intact.

Current repaired release, observed **2026-10-13T15:30:21Z**:

| Field | Actual repaired value |
| --- | --- |
| Source delta | `9c98ede278dc5a93c9563e729dbe7df8d594bfb6` plus the single `/health` alias handler line. Test/doc/capture fixes do not enter the image except the handler line. Current UI edits remain excluded. |
| Immutable tag | `milestone-20261013-health`. |
| Approved registry index | **`sha256:561278f1d47e504d5e7a392bd6fdb83d9a1855d84bc3bb8817abc413ca59d8b5`**. |
| Sole linux/amd64 manifest | **`sha256:2a5cd528ee49b7d5eda6b2df5667bd495935a9ac5ca91c28b0d9f5afbad1fc9d`**, matching revision spec and status image digest. |
| unknown/unknown attestation | `sha256:a29f1529237a5db3344176dbeab61f91ec7294b897a8bf02ff97053a26720c00`. |
| Current Ready revision | **`hotel-price-hunter-00004-gn5`**, latest-created=latest-ready, Ready=True, 100% traffic. |
| Canonical APP_ORIGIN | Unchanged **`https://hotel-price-hunter-2qbcpylngq-as.a.run.app`**; remains private. |
| Actual liveness | Authenticated **`GET /health` → 200** JSON `{status:"ok",storage:"firestore",model:"configured-unverified"}`. Liveness is side-effect-free and does not establish model success or customer-flow database persistence. |
| Auth/config cleanup | Second upload again verified global Docker configuration unchanged, prior `DOCKER_CONFIG` restored, temporary auth directory count zero. |

The replacement OCI index was independently fetched read-only with an in-memory CLI token, redirects disabled, and exact byte SHA-256 checked against the approved index. It contains exactly the listed runnable Linux/AMD64 child plus attestation; no digest mismatch was waived. New model inference and Firestore customer-flow proof remain assigned to the coordinator's verification worker.

## Acceptance boundary and model budget

This operator has made **zero model generation calls**. The global team budget remains at most three, assigned by the coordinator to the verification worker only after private baseline readiness. Actual cloud Firestore customer-flow persistence and live Vertex advice are not claimed by this operator's resource metadata. Independent baseline/model evidence is a separate report.

Stop at private deployment. Public access, real Altovo retrieval/transactions, email, paid upgrade and source push remain outside this execution. No deletion/rollback of approved resources occurred after the initial parser failure. Trial credit balance and actual billed costs remain unobserved, and maximum-one resources are not a hard spending cap.

## Semantic adviser repair private release

The first three approved actual Vertex responses consumed the global **3/3** budget; technical baseline passed but semantic findings remained (preference-dependent non-refundable monitoring and USD 9500 instead of USD 95 from minor units). Corrected advice was prepared and independently reviewed **offline**, not regenerated against live Google. Full details and exact legacy replays are in [advice-grounding-repair.md](advice-grounding-repair.md).

The final SDK internal contract is **`{recommendation,reasonCodes}`**, limited to one–three distinct currently grounded catalogue factors. No arbitrary model prose/cash/authority state reaches the user; strict keys, actual factor gates and blocked recommendation policy reject old/unknown/contradictory replies. Application code produces all visible wording, exact currency/major money, truthful blocked explanations and normal-monitoring/recovery/approval-alone facts. The public client shape remains the same four fields; SDK max output 800, retry attempts one and request timeout stay fixed.

After independent review (29 passed, zero failed, one explicit emulator skip; blocked-recommendation mutation caught), the coordinator authorised the necessary private functional repair. Only BuildImage and DeployPrivate ran; no re-provisioning, extra grants/resources, public change or generation.

| Current release field | Verified value |
| --- | --- |
| Source | Approved `9c98ede` plus `/health` alias and reviewed factor/explicit-currency adviser repair; original main city-layout UI excluded. |
| Immutable tag | `milestone-20261013-advice`; both earlier tags retained. |
| Approved index | **`sha256:f6cf23de9be7c44cb419263441c29761efa71c5f923a9bea8aed33c3a5f2433d`**. |
| Linux/AMD64 runtime child | **`sha256:d033885504ac7493d0c3d1f65c06e23f1184a390d19925b3e61e61c05d66375c`**, exact revision spec/status match. |
| Attestation | unknown/unknown `sha256:d70f01094a3cd86e7d9238588b0213c413fd9cb78a52833add30ae3465161d34`. |
| Ready revision | **`hotel-price-hunter-00006-hfm`**, latest-created=latest-ready, Ready=True and 100% traffic, observed `2026-10-13T16:30:05Z` (**14 October 00:30 KL**). |
| Canonical origin | Unchanged `https://hotel-price-hunter-2qbcpylngq-as.a.run.app`; strict matching APP_ORIGIN and private invoker retained. |
| Identity/env/limits | Same dedicated account, exact five literal envs, no secret/mount sources; same CPU/memory/concurrency/timeout/min/max/throttling/boost controls. No widening of runtime authority. |
| Credential cleanup | Upload verified global Docker config unchanged, environment restored and temporary auth directory count zero. |
| Generation | **Zero additional calls**. Original global budget spent; no post-repair live semantic acceptance claimed. |

Read-only registry-v2 retrieval again used credentials only in memory with redirects off; raw index bytes matched the approved SHA and descriptor listed exactly the resolved runtime child plus attestation. The coordinator-assigned verifier will perform a **zero-generation** baseline against this pin. Only after that concrete result can the user approve bounded additional retests of the two failed cases. Public publication, billing upgrade, real Altovo/email operations and source push remain unauthorised.
