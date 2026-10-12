# Intended Google Cloud project prerequisites

Read-only evidence recorded **13 October 2026, 02:32–02:41 Asia/Kuala_Lumpur**. The user supplied project number `977401667230` after requesting a fresh project with free credits. The checks below used existing normal-host PowerShell credentials. No API, billing, IAM, ADC/quota setting or cloud resource was changed, and no model generation was attempted.

## Verified target and billing

| Check | Result |
| --- | --- |
| Number → ID | `977401667230` → `sincere-apex-511418-p0`, verified by `gcloud projects describe`, not inferred from browser URL. |
| Lifecycle | `ACTIVE`. |
| Created | `2026-10-12T18:25:34.793Z`, or **13 October 02:25:34 Kuala Lumpur**. |
| Project billing | Enabled; billing account attached. |
| Billing account metadata | Read succeeded; account is open, currency `MYR`. Identity, account ID and payment details suppressed. |
| Free Trial / promotional credits | **Unverified.** The billing account resource checked does not expose trial/paid classification, remaining promotional balance, expiry or prior eligibility. Open/enabled billing and a newly created project do not prove free credits. |

Google documents remaining trial credit/days in the authenticated billing console; promotional credit details include scope and expiry. That evidence remains necessary before a credit-funded inference/deployment claim. The account's project number alone does not authorise a paid upgrade, API enablement, resource creation or model generation. [Free Trial terms](https://docs.cloud.google.com/free/docs/free-cloud-features), [credit visibility](https://docs.cloud.google.com/billing/docs/how-to/resolve-issues), [billing account API](https://docs.cloud.google.com/billing/docs/reference/rest/v1/billingAccounts).

## Enabled APIs and resource evidence

The service listing succeeded and returned **23 enabled services**. Application prerequisites:

| API | Enabled |
| --- | --- |
| `serviceusage.googleapis.com` | Yes |
| `aiplatform.googleapis.com` | No |
| `firestore.googleapis.com` | No |
| `run.googleapis.com` | No |
| `artifactregistry.googleapis.com` | No |
| `cloudbuild.googleapis.com` | No |
| `iam.googleapis.com` | No |
| `cloudresourcemanager.googleapis.com` | No |
| `cloudscheduler.googleapis.com` | No |
| `cloudtasks.googleapis.com` | No |

Firestore database listing was **attempted and failed with HTTP 403 `SERVICE_DISABLED`**. Database count, type, region and `(default)` existence remain **unknown**; this failure is not evidence of an empty project. Cloud Run services and Artifact Registry repositories were **not queried** while their APIs were disabled; names/collisions remain unverified. Publisher model listing was **not attempted** because the Vertex API is disabled.

IAM service-account metadata listing **succeeded** despite IAM not appearing enabled in the intended project's listing: **one existing service account**, no `hotel-price-hunter-runtime` account. The existing account's grants and suitability as runtime identity were not established, and its identity was not retained. This successful metadata read does not imply an application runtime or permission to create/change IAM. [Service listing](https://docs.cloud.google.com/sdk/gcloud/reference/services/list), [Firestore listing](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases/list).

## CLI and ADC are separate access paths

- CLI selected project and Cloud Run region remain unset. Every project read used the explicit intended ID; no global configuration was changed.
- Existing local ADC is `authorized_user` and refreshes successfully. Its quota project remains **`pohlschmidt-digital`**, and no `GOOGLE_APPLICATION_CREDENTIALS` override is present. The ADC file did not expose an account-identity field; no claim that the identities differ is made.
- The official read-only project `testIamPermissions` API verified **all 16 tested permissions for the CLI caller**, and **none for the existing ADC caller**. Token refresh is not application access. The result is an effective target-access mismatch as well as an old quota-project setting.

| Tested permission group | CLI | Existing ADC |
| --- | --- | --- |
| `resourcemanager.projects.get`, `resourcemanager.projects.setIamPolicy` | Present | Absent |
| `serviceusage.services.list`, `.use`, `.enable` | Present | Absent |
| `aiplatform.endpoints.predict` | Present | Absent |
| `datastore.databases.list`, `.create`; `datastore.entities.get`, `.create` | Present | Absent |
| `run.services.get`, `.create` | Present | Absent |
| `iam.serviceAccounts.create`, `.actAs` | Present | Absent |
| `artifactregistry.repositories.create`, `cloudbuild.builds.create` | Present | Absent |

This is a bounded effective-permission test, not a complete IAM audit or an inference success. An initial candidate test included an unsupported permission and returned HTTP 400; the corrected valid set above succeeded under both credential paths. No IAM grant was added. [Permission-test API](https://docs.cloud.google.com/resource-manager/reference/rest/v1/projects/testIamPermissions).

**Narrow runtime custom-role feasibility:** a further read-only test verified CLI `iam.roles.create`, `.get`, `.update`. Testable-permission metadata for project number `977401667230` returned both proposed permissions, `aiplatform.endpoints.predict` and `serviceusage.services.use`, at launch stage **GA**. The prediction permission reported `apiDisabled=true`; service usage did not report a disabled flag. Both omitted `customRolesSupportLevel`. The official enum defines `SUPPORTED` as its default, so treating the omitted field as default support is an explicit inference from documented API semantics, not an observed role-creation success. The proposed custom role contains those two permissions; Firestore access is a separate scoped grant. No role was created, and deployment must verify the resulting permission set and actual inference after approved setup. [Testable-permission fields and support defaults](https://docs.cloud.google.com/iam/docs/reference/rest/v1/permissions/queryTestablePermissions).

**Auth options:** the current local ADC cannot perform intended-project inference. For a local live call, establish ADC for an identity already authorised for the intended project, or explicitly approve minimum required grants to the intended ADC identity; then repeat effective-permission checks. Only after explicit approval should its quota project be set to `sincere-apex-511418-p0`, or overridden for this app through a supported per-process quota setting. Changing quota alone cannot fix missing permissions; `serviceusage.services.use` is required on the quota project. Alternatively, **leave local ADC entirely unchanged and validate through an approved private Cloud Run deployment with an attached dedicated service account**. That path does not require changing local ADC or copying it into the container, but the new runtime identity and grants still require scoped provisioning approval and subsequent live proof. [ADC](https://docs.cloud.google.com/docs/authentication/provide-credentials-adc), [quota project requirements](https://docs.cloud.google.com/docs/quotas/set-quota-project), [ADC quota command](https://docs.cloud.google.com/sdk/gcloud/reference/auth/application-default/set-quota-project).

## Proposed locations and model; no live availability claim

The dry-run deployment proposal uses **Singapore `asia-southeast1`** for Cloud Run, Firestore and registry. Cloud Run documents Singapore under **Tier 2 pricing**; Firestore documents Singapore as a regional location. The actual project database location remains unknown until its API is enabled under approved scope and a successful metadata read follows. Check before creating: a database's location cannot later be changed. [Cloud Run regions](https://docs.cloud.google.com/run/docs/locations), [Firestore locations](https://docs.cloud.google.com/firestore/native/docs/locations).

The current official model card documents **`gemini-3.1-flash-lite`**, GA, with system instructions and structured output, available at **`global`, `us`, `eu`**. It is a suitable candidate for bounded fixture advice; project access, quota and credit coverage are still unverified. Proposed `GOOGLE_CLOUD_LOCATION=global` is separate from the Singapore application/database location and does not promise Singapore model processing. The old `gemini-2.5-flash-lite` card lists retirement **20 October 2026**, so it is unsuitable as the new deployment default. The 3.1 card lists retirement **7 May 2027 or later**. [3.1 Flash-Lite card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite), [2.5 card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-flash-lite), [model endpoints](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations).

The formerly Vertex-branded documentation currently redirects to Gemini Enterprise Agent Platform. The existing application uses the Google Gen AI SDK's Vertex option; no architecture migration, alternate Gemini API key or billing service was introduced during this audit.

## Reproduction and proposed approval scope

These are bounded read-only commands; output avoids account/token/payment identity:

```powershell
gcloud projects describe 977401667230 --format="json(projectId,projectNumber,lifecycleState,createTime)" --quiet
gcloud billing projects describe sincere-apex-511418-p0 --format="json(billingEnabled)" --quiet
gcloud services list --enabled --project=sincere-apex-511418-p0 --format="value(config.name)" --quiet
```

Permission tests used tokens only in process memory and emitted permission booleans. Do not print tokens, raw ADC or account identity to reproduce them. The CLI identity and ADC must be tested separately.

After authenticated credit confirmation and a concrete approved deployment plan, the minimum next scope is:

1. Authorise necessary API enablement for Vertex, Firestore, Run, Artifact Registry and IAM; verify prerequisites required by the exact deployment commands. Scheduler/Tasks belong to a later milestone. Local Docker build can avoid Cloud Build for this tranche.
2. Prefer the attached-runtime-service-account validation path so local ADC, emulator configuration and global CLI project remain unchanged. A local live-call path instead requires separate ADC access/quota authority.
3. Successfully list databases, Run services, registry repositories and runtime accounts before naming or creating resources. Confirm Singapore native Firestore, registry and dedicated runtime identity; use minimum documented runtime grants rather than copying administrator privileges.
4. After approved resource setup, permit bounded fixture-only live Gemini validation with explicit model/location/output limits. Metadata and permissions alone cannot satisfy this criterion.
5. Approve private deployment and its concrete configuration separately; publication/public invoker grants remain separate explicit authority. Record actual deployed URL, persistence/model evidence and costs/credits without treating a local emulator as cloud deployment.

The scoped provisioning bundle is authored separately in `docs/deployment-plan.md` and `scripts/prepare-cloud.ps1`; inspect its dry-run output before any mutation. This audit authorises none of those operations.
