# Google setup checkpoint and approval scope

15 October 2026, Asia/Kuala_Lumpur. This checkpoint continues [the private agency deployment proposal](agency-iap-deployment.md). Cloud setup is awaiting approval of the exact API/IAM/service scope below.

## Verified access and current state

- The user corrected the intended Google account to **pete@altovo.com**. It had no saved CLI credentials. The user completed Google's browser sign-in; `gcloud auth list` now reports that account active. No application-default credential update was requested or performed.
- Google UserInfo independently returned that same verified email and hosted domain `altovo.com`. The stable subject mapping is retained only in ignored local configuration. The access token was used in memory for the fixed Google endpoint and never saved or printed. No API key or service-account key is needed.
- Explicit account-scoped reads confirm project `sincere-apex-511418-p0`, number `977401667230`, ACTIVE under organization `222849345270` (`altovo.com`). The signed-in user has the existing project Owner grant; this work did not assign it.
- Billing is enabled. The user confirmed trial credits are available; the credit balance was not independently observed. No billing linkage, upgrade or payment setting changed.
- Cloud Run, Firestore, IAM and Artifact Registry APIs are enabled. IAP API enablement is still pending. The dedicated reader account and agency service were absent at preflight.
- The image repository is the existing immutable-tag Docker repository `hotel-price-hunter` in `asia-southeast1`. The customer service remains `hotel-price-hunter`, ready revision `hotel-price-hunter-00006-hfm`. Before-change service/IAM snapshots were saved under ignored `.local/`.

The account cannot read organization IAM: Google returned permission denial for `222849345270:getIamPolicy`. No organization permission was granted to bypass that. The new verifier fails closed for complete policy review and can explicitly collect `metadata-partial` evidence with `fullAcceptance:false`. A separately prepared runtime probe can test actual bounded reads and guarded update/delete denials, but cannot establish an exhaustive inherited-policy inventory or create-permission denial.

## Exact proposed cloud changes

Only after explicit approval, use **pete@altovo.com**, always naming the fixed project and Singapore region:

1. Enable `iap.googleapis.com`; create its Google-managed service identity if required. The installed SDK lacks its beta component, so the reviewed plan uses Google's fixed Service Usage REST endpoint for identity creation rather than installing/updating the SDK.
2. Create `roomdrop-agency-reader@sincere-apex-511418-p0.iam.gserviceaccount.com` and grant exactly `roles/datastore.viewer` on this project. **This is read access across the project's Firestore data, not one collection.** No write, model or administrative role is granted to that account.
3. Upload one reviewed local RoomDrop image under a new immutable agency tag. Use account-scoped short-lived registry authentication in memory and a nonce-owned ignored Docker configuration directory; validate ownership/path before cleanup. Preserve global Docker settings and local ADC. Record and independently verify the uploaded registry digest before deployment.
4. Deploy only the new `hotel-price-hunter-agency` service in `asia-southeast1`, with IAP and the invoker check enabled. Set minimum zero, maximum one service/revision instance, 1 vCPU, 512 MiB, concurrency four, request-based CPU, no startup CPU boost and a 30-second timeout. These limits reduce use but are not a hard spending cap.
5. Grant `roles/run.invoker` only to `service-977401667230@gcp-sa-iap.iam.gserviceaccount.com` on the new service. After source/configuration/private-access verification, grant `roles/iap.httpsResourceAccessor` only to `user:pete@altovo.com` on that agency IAP resource. No public or domain-wide grant is proposed. Organization-policy visibility remains explicitly unverified.
6. Create, execute once and remove one task-owned `roomdrop-agency-reader-check-*` Cloud Run job using the same reader identity and reviewed image. It checks the metadata identity, a limit-one index query, a confirmed-absent random document read, and explicit permission-denied responses to preconditioned update/delete requests. Preconditions prevent document creation/deletion even if the account unexpectedly has write authority. No booking or fixture data is changed.

The existing customer service and its IAM, production supplier access, emails, billing settings and exhausted model-call budgets are outside this change. The agency runtime contains no Gemini model configuration. Actual Google/IAP browser acceptance and safe private case reads follow deployment; local tests are not a substitute.

## Automatic approval boundary

An attempted combined enable-IAP/create-reader/grant-viewer command was rejected **before launch** by automatic approval review. The reason was that the exact persistent cloud mutations and the project-wide Firestore grant had not been explicitly approved. No API, account, role, image upload or service mutation occurred. The rejected command was not split or retried through another path.

The next human decision is approval of the concrete scope above, including project-wide Firestore read access and the limited new service/job costs. The setup bundle and verifier remain offline/read-only unless their explicit modes and separately approved external actions are selected.

## Prepared verification

`scripts/prepare-agency-cloud.ps1` emits offline command arrays and gates; it has no cloud execution switch. `scripts/verify-agency-cloud.mjs` keeps new source/context/digest/service/operator/customer pins separate from the historical cloud verifier. `scripts/check-agency-reader.mjs` is guarded for its explicit one-shot job and outputs statuses only. The reader probe source is passed as a reviewed job command override; it is not added to the application image context and no debug endpoint is introduced.

The 17 new focused tests passed in both coordinator and independent-review runs. Two isolated guard mutations were detected. The complete emulator-enabled suite passed **176/176**, zero failures/cancellations/skips, in 125.4 seconds using the isolated `demo-roomdrop-iap-qa` namespace and an unconfigured model. Source syntax and whitespace checks passed. See [the independent review](review-agency-cloud-setup.md). The exact local source/context/image checkpoint and generated plan are retained under ignored `.local/agency-cloud-ready.json` and `.local/agency-cloud-plan.json`; these are local preparation evidence, not uploaded registry/deployed pins. No cloud success is inferred from a generated plan.

Sources: [Google service identity](https://docs.cloud.google.com/run/docs/securing/service-identity), [Cloud Run IAP](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run), [Google UserInfo](https://developers.google.com/identity/openid-connect/reference), [service-identity creation](https://docs.cloud.google.com/service-usage/docs/reference/rest/v1beta1/services/generateServiceIdentity).
