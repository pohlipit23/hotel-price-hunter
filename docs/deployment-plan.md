# First-milestone Google Cloud deployment proposal

Prepared **13 October 2026, Asia/Kuala_Lumpur**. This is a reviewable preparation bundle; no provisioning, image push, deployment, IAM/billing changes, or model generation has been executed by it.

## Fixed target and decisions

| Item | Proposed value and reason |
| --- | --- |
| Project | `sincere-apex-511418-p0`, number `977401667230`, explicitly supplied by the user and verified ACTIVE. Every cloud command names this project; local ADC quota/defaults cannot select another target. |
| Cloud Run | `hotel-price-hunter` in `asia-southeast1` (Singapore), supported and close to Kuala Lumpur; Singapore is a Tier 2 Cloud Run region. [Locations](https://docs.cloud.google.com/run/docs/locations) |
| Database | Firestore **Standard, Native mode, `(default)`**, `asia-southeast1`, delete protection enabled. The existing server uses the default database. Database location is immutable; inspect existing state after API enablement and stop on a different type/location. [Firestore locations](https://docs.cloud.google.com/firestore/native/docs/locations), [creation flags](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/databases/create) |
| Image registry | Docker repository `hotel-price-hunter` in `asia-southeast1`, immutable tags. Initial reviewed tag `milestone-20261013`; build the approved source locally, then push only the image and deploy its registry-verified SHA-256 digest. A changed release needs a new tag. [Immutable tags](https://docs.cloud.google.com/sdk/gcloud/reference/artifacts/repositories/create) |
| Runtime identity | New user-managed `hotel-price-hunter-runtime@sincere-apex-511418-p0.iam.gserviceaccount.com`; no service-account key, default Compute identity, Owner or Editor role. [Cloud Run service identity](https://docs.cloud.google.com/run/docs/securing/service-identity) |
| Gemini | Google **`gemini-3.1-flash-lite`**, Vertex **`global`** endpoint. Official card lists GA, structured output/system instructions, global/us/eu, and retirement no earlier than 7 May 2027. This does **not** mean model processing is in Singapore. Only anonymised jury facts may enter this endpoint. Project/model access remains unverified. [Model card](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-flash-lite) |
| Avoid near-retirement model | `gemini-2.5-flash-lite` retires 20 October 2026; do not select a stale quickstart default just before the submission. [Lifecycle](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions) |
| Service controls | 1 vCPU, 512 MiB, request-based CPU, startup CPU boost off, concurrency 4, service minimum 0 and maximum 1, revision maximum 1, 30-second request timeout; port 8080. Service-level maximum covers traffic across revisions. [Instance limits](https://docs.cloud.google.com/run/docs/configuring/max-instances), [deployment flags](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy) |
| Public ingress | Network ingress `all` with Cloud Run invoker IAM **enabled** initially. Public `allUsers` invoker is a separate final stage after exact origin and private verification. No custom domain, DNS change or external booking path. [Public invocation](https://docs.cloud.google.com/run/docs/authenticating/public) |

The application remains the implemented first milestone: frozen fictional booking/offer clock, customer enrolment, saved comparison and Gemini explanation. Replacement, cancellation, refund, Scheduler, Tasks and email delivery are not implemented or provisioned by this bundle.

## Current evidence and prerequisites

[Cloud prerequisite evidence](cloud-prerequisites.md) records the read-only target checks. Billing is enabled and its account is OPEN in MYR; **trial status, remaining credits and eligibility are not proven by those metadata fields**. Cloud Run, Firestore, Artifact Registry, Vertex, IAM and Cloud Resource Manager APIs are disabled; Service Usage is enabled. API-disabled resource reads do not prove that databases, services or repositories are absent.

The existing CLI identity has the recorded required project permissions. Existing local ADC refreshes but has none of the tested target permissions, and its quota project remains `pohlschmidt-digital`. This plan does not alter ADC, CLI defaults, billing linkage, free-trial activation or account upgrade. The attached Cloud Run identity will obtain its own credentials for Firestore/Vertex. Local ADC reauthentication would be a separately authorised action if later needed. Never set `GOOGLE_APPLICATION_CREDENTIALS` on this service. [Service identity credential guidance](https://docs.cloud.google.com/run/docs/securing/service-identity)

Before any `-Execute`: obtain explicit user approval for the named provisioning/image upload/private deployment actions and confirm an eligible active Free Trial with remaining usable credits in the authenticated billing console. Google trial credits are attached to billing eligibility, not renewed by creating a project. This plan does not infer or promise fresh USD 300 credits and never activates a paid upgrade. Google Gemini through Vertex is the intended Google model path; no AI Studio Gemini API or partner model is substituted. [Free Trial exclusions and terms](https://docs.cloud.google.com/free/docs/free-cloud-features)

Minimal API enablement: `run.googleapis.com`, `firestore.googleapis.com`, `artifactregistry.googleapis.com`, `aiplatform.googleapis.com`, `iam.googleapis.com`, `cloudresourcemanager.googleapis.com`. Existing Service Usage is used for enablement. Local Docker builds avoid Cloud Build, source staging buckets and build-service-account grants. Scheduler/Tasks APIs remain unnecessary for this milestone.

## Least runtime authority

Grant only these project-scoped roles to the dedicated runtime account:

- `roles/datastore.user`: application data reads/writes/transactions in this dedicated project; no database provisioning or IAM administration. There is no client Firestore SDK or public database access. Server libraries use IAM, so frontend security rules are not the server authority. [Firestore server IAM](https://docs.cloud.google.com/firestore/native/docs/security/iam)
- `projects/sincere-apex-511418-p0/roles/hotelPriceHunterPredict`: one small custom role containing exactly `aiplatform.endpoints.predict` and `serviceusage.services.use`. It gives inference and API consumption, without the resource creation permissions of the broad `roles/aiplatform.user`. No tool, deployment, booking or refund authority enters model context. [Custom prediction permission example](https://docs.cloud.google.com/vertex-ai/docs/general/access-control)

The read-only permission audit verified CLI `iam.roles.create/get/update`; both custom-role permissions are GA. `customRolesSupportLevel` was omitted, whose documented default is `SUPPORTED`. That is documented support inference, not proof of role creation or successful inference. The script rechecks testable-permission support/API enablement before role creation and checks exact direct project grants, account metadata and the custom role again before deployment/publication. Inherited folder/organisation grants are not exhaustively audited by these direct-project checks; private verification must establish effective runtime access and review any inherited authority before release. A conflicting existing role, account ownership/name, broad runtime role, service identity, repository configuration, or database location/type/edition/delete protection stops execution; the script never silently reconfigures another resource. [Permission support enum](https://docs.cloud.google.com/iam/docs/reference/rest/v1/permissions/queryTestablePermissions)

Cloud Run's managed service agent retrieves a same-project registry image; do not grant registry writer, service-agent roles or key creation to the application identity. The existing operator handles API/resource/IAM changes and image upload through its own approved authority, with `actAs` on the runtime identity. If a permission is denied, stop and identify the exact prerequisite rather than assigning Owner/Editor.

## Review and staged execution

`scripts/prepare-cloud.ps1` is **offline by default**, including each selected phase: it only prints the fixed proposed commands. It makes no network calls or filesystem/configuration mutations in preview. Preview first:

```powershell
./scripts/prepare-cloud.ps1
./scripts/prepare-cloud.ps1 -Phase DeployPrivate
```

Execution examples below are pending human approval. The `ApprovalReference` documents the already supplied user approval; passing a switch cannot create permission. Each mutation stage must fall within that approval. `TrialConfirmed` represents separately verified active eligibility/credit evidence; it does not query or activate a trial.

1. **Provision:** verify fixed project number/state and billing enabled; enable the six APIs; list resources successfully; create only missing matching resources; stop on 403, SERVICE_DISABLED, malformed metadata or any conflict. API propagation failures require a later explicit retry, not inferred absence. The stage is not an atomic cloud transaction: a later failure can leave earlier approved resources in place.

   ```powershell
   ./scripts/prepare-cloud.ps1 -Phase Provision -Execute -TrialConfirmed -ApprovalReference 'user-approved provisioning scope and date'
   ```

2. **BuildImage:** review/test the precise application source and Docker context first. The existing `.dockerignore` denies the full context except package manifests, `app/**`, and the explicitly fictional jury fixture. The script verifies that allowlist and rejects credential-like files under the allowed app path. Manual content review must still catch embedded secrets or PII; a filename check is not a secret scanner. It does not send `.env`, ADC, `.git`, scripts, docs or external supplier data to the image. No `--source` deployment is used.

   ```powershell
   ./scripts/prepare-cloud.ps1 -Phase BuildImage -Execute -TrialConfirmed -ApprovalReference 'user-approved local image build and registry upload'
   ```

   The Docker credential helper uses an isolated, ignored `.local/cloud-docker-auth-<nonce>` `DOCKER_CONFIG`; global Docker and gcloud configuration are untouched. The original environment is restored and the task-owned auth directory is removed in `finally`, after checking its resolved workspace parent, non-reparse directories and ownership marker. Tokens are never printed or mounted in the image. Record the registry digest printed by the stage; an immutable tag collision stops rather than overwrites a release.

3. **DeployPrivate:** require the reviewed registry digest. Inspect an existing named service for private IAM and the approved identity; stop on public access or a name collision. Reject additional containers, any volume/mount, secret-sourced environment, or unexpected credential/emulator/environment field rather than clearing another configuration. Deploy with no unauthenticated access and strict placeholder `APP_ORIGIN=https://origin-not-ready.invalid`. Read `status.url`, validate its HTTPS `*.run.app` canonical origin, then update `APP_ORIGIN` to exactly that origin while invocation remains private. A placeholder never permits arbitrary origins; customer writes are unavailable until the exact origin is set. The script verifies the resulting complete known literal environment and absence of secret/volume sources; `--set-env-vars` alone is not assumed to clear secret-sourced fields. This stage makes no model request and does not publish.

   ```powershell
   ./scripts/prepare-cloud.ps1 -Phase DeployPrivate -Execute -TrialConfirmed -ImageDigest 'sha256:<64 reviewed hex characters>' -ApprovalReference 'user-approved private deployment'
   ```

4. **Stop for private verification.** Record the latest Ready revision, matching digest, exact origin, attached identity, resource limits and evidence below. Public permission is a separate decision. A revision change after verification invalidates the release checkpoint.

5. **Publish only the verified revision after explicit public-access approval:** provide the exact verified revision and digest. The script checks latest-created=latest-ready=verified revision, Ready status, 100% traffic, the image digest, runtime identity, private IAM and exact canonical origin before adding only `allUsers` → `roles/run.invoker` on this service. It never disables invoker IAM checks. `PrivateVerificationPassed` is a human evidence gate, not an automated claim that UI/model checks occurred.

   ```powershell
   ./scripts/prepare-cloud.ps1 -Phase Publish -Execute -TrialConfirmed -PrivateVerificationPassed -VerifiedRevision 'hotel-price-hunter-<verified-revision>' -ImageDigest 'sha256:<64 reviewed hex characters>' -ApprovalReference 'user-approved public jury publication after private evidence'
   ```

The script is deliberately not a CI auto-release or a recurring job. It contains no billing account linkage, credit activation, paid upgrade, local ADC change, real supplier retrieval/transaction, email delivery or model generation command.

## Verification evidence required before publication

Use the same immutable image. Existing local tests, container and emulator results establish local behaviour; they do not establish cloud resource readiness or live Gemini.

| Check | Concrete proof |
| --- | --- |
| Private image/service configuration | `status.url`, latest Ready revision/digest, attached dedicated account, exact `APP_ORIGIN`, IAM still private, production env with no `FIRESTORE_EMULATOR_HOST`/ADC/token/key, min/max/concurrency/CPU/memory/timeout match plan. |
| Runtime and database | Authenticated HTTPS health responds 200 and reports `firestore` (health is liveness only). Bootstrap succeeds against real Firestore with the allowlisted fictional scenario and labelled frozen `demoNow`; no pretend live rate check. |
| Persisted and isolated visitor state | Authenticated API client retains cookie+CSRF token; enrol/confirm a source preference version, select an offer, reload; second cookie remains unenrolled. Create a new private revision using the same digest/exact origin (a separately approved service update), then reload using the first cookie and prove persistence. Do not claim two-instance proof while max=1; local two-server emulator evidence remains separately labelled. |
| Origin and authority | Post from the canonical origin with CSRF succeeds; wrong origin/token fails; source-version stale affirmative replay after revocation returns 409 without restoring permission. Selection/advice creates no offer approval. |
| Live Google Gemini | Only after trial/access and test-call approval: at most **three** fixture-only questions, one each for equivalent saving/refund breakdown, uncertain plans/non-refundable flexibility, and unknown condition. Keep one provider request per question (existing adapter has retry attempts=1, max output 800, 20-second limit). Record model/location, response outcome and grounded facts; 503/timeout is a failure/blocker, not mock success. Do not retry silently or send customer data. |
| Private static UI | Use authenticated API/HTTP checks for protected routes and resource delivery. `gcloud run services proxy` can inspect static UI locally, but its localhost browser origin cannot perform customer mutations against the canonical production `APP_ORIGIN`. Never loosen exact-origin/CSRF for the proxy. Final anonymous mobile/desktop UI checks follow authorised publication. |
| Anonymous public check | Fresh browser/no credentials opens the canonical URL, sees explicit jury/snapshot labels, completes enrolment and refresh, retains selection, renders advice as text, and has no private lookup/PII/token exposure. Do not add further generation calls during this UI check without accounting for the three-call validation limit or obtaining additional approval. |

For private API checks, obtain a CLI identity token directly into a process variable and use an authenticated HTTPS client with `Origin=<canonical service origin>`, a cookie jar and bootstrap CSRF. Never echo the token, embed it in files/URLs/browser screenshots, or return it in logs. Cloud Run IAM protects the service until publication; the runtime service account separately controls Firestore/Vertex. A browser proxy is not a reason to change production origin validation.

## Cost controls and containment

The current standard global Gemini 3.1 Flash-Lite text price is **USD 0.25 per million input tokens and USD 1.50 per million output tokens**, including billed reasoning. As an illustration, three questions at 4,000 input and 800 output tokens each total about USD 0.0066 for model tokens; this is an assumed-token example, not a measured bill or overall cost guarantee. MYR billing uses the applicable currency SKU. Cloud Run, Firestore operations/storage, registry storage, logging and network can add charges. [Current Google model pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)

Minimum zero/request-based CPU and maximum one reduce resource consumption; max instances can briefly be exceeded and is **not a hard spending cap**. The implemented eight advice requests per visitor per minute and 800-output-token bound do not create a project-wide budget: a public visitor can acquire a new cookie. There is no global generation-cost cutoff in the current application. Public exposure therefore needs explicit acceptance of that limitation or a separately scoped cost gate before publication. [Cloud Run limit caveat](https://docs.cloud.google.com/run/docs/configuring/max-instances)

Recommend a separately authorised project-scoped low billing budget with actual/forecast alerts (for example MYR 25, subject to the user's choice). Alerts are notifications, **not spending caps**; they do not stop resources or model requests. Do not treat free-tier eligibility or promotional credits as unlimited consumption. No budget or billing change is created by this script. [Budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)

If public access must be contained after authorisation:

```powershell
./scripts/prepare-cloud.ps1 -Phase DisablePublic -Execute -ApprovalReference 'user-approved removal of public invocation'
```

This removes only this service's `allUsers` invoker binding; it does not delete Firestore data, disable shared APIs, remove billing, stop other services or perform refund/booking operations. Containment can run after trial expiry, without a `TrialConfirmed` claim. Before later updates, retain the previously verified revision/digest and exact origin; rollback traffic only through a separately approved reviewed command. Delete-protected Firestore and immutable registry images require deliberate follow-up cleanup; the bundle contains no resource deletion.

## Preparation verification

PowerShell AST parsing passed with no diagnostics. Offline previews of Plan, Provision, BuildImage, DeployPrivate, Publish and DisablePublic passed while mock `gcloud` and `docker` functions would throw if invoked. A missing-approval Execute attempt was rejected before external commands. These checks validate local preparation/guards, not API enablement, IAM creation, registry upload, cloud deployment or live model access.
