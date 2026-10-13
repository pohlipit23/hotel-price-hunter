# Independent private cloud review

Final verdict: **APPROVE the current private infrastructure, static-source and liveness scope on `hotel-price-hunter-00006-hfm`.** The deployed `/health` repair resolved the original finding. Public release, database/customer-flow/model acceptance and independently observed trial credit coverage are outside this verdict. The final checkpoint below supersedes the initial pending/failure checkpoints.

Reviewed 13 October 2026, Asia/Kuala_Lumpur. Release source: isolated private-cloud-deployment worktree at reviewed commit 9c98ede plus the bounded stream-capture fix below. Main checkout design assets and unrelated dirty/untracked work are outside this release and remain untouched.

## Execution capture patch

Verdict: APPROVE the one-line scripts/prepare-cloud.ps1:47 change from merged stderr/stdout to stdout-only capture with stderr suppressed. The native exit-status and strict JSON parsing guards remain intact. This corrects successful metadata commands that emit progress on stderr without treating a failed command as empty/absent state.

Independent evidence: a native cmd.exe fixture emitted valid empty-array JSON on stdout and Listing items progress on stderr with exit 0. The prior merged-stream helper failed JSON parsing; the updated helper parsed the empty array. A second native fixture returned exit 7 and valid JSON-looking stdout: the updated helper still threw its nonzero-exit error. PowerShell AST produced zero diagnostics, and the existing 29 offline guard/build fixtures passed against the isolated patched candidate. Fake commands exercised permission, project, database, private/public identity, environment, revision and build-context/cleanup guards; no genuine cloud, Docker or model commands ran in these tests. Scratch evidence remains ignored .local/review-cloud in the original workspace; the actual release source was not edited by this reviewer.

This patch approval is a correctness review, not additional execution authority. Root approval governs continuation of the already approved private provisioning/image upload/deployment and bounded three-call model validation. Public IAM publication is outside that authority.

## Actual private deployment

Pending the runtime worker's URL, immutable digest and Ready revision event. No actual deployed-state verdict is inferred from offline fixtures. Independent read-only checks will cover the fixed project, enabled APIs, Singapore Native Standard delete-protected Firestore, immutable registry/digest, exact runtime/custom roles, Ready image/account/origin/environment/resource controls and private invoker policy. Anonymous denial and authenticated static/liveness HTTP checks are allowed; this reviewer will make zero model calls so the shared three-call budget remains with the assigned integration worker.

The human accepted the credit-funded deployment bundle. Active trial classification, remaining credit balance/expiry and no-charge coverage have not been independently observed; no billing upgrade is authorised by this review.

## Independent actual-state checkpoint

Checked **13 October 2026, 23:17–23:22 Kuala Lumpur** against actual Google Cloud metadata and authenticated HTTP. Verdict: infrastructure, private access, immutable image provenance and static release source **PASS**; private liveness acceptance has an actionable failure below. No model calls, application mutations, cloud mutations, new image builds or token/account output occurred. The normal-host read-only gcloud escalation was necessary because the sandbox denied its existing credential-cache/log access; no CLI configuration, ADC or quota setting was changed.

Target is ACTIVE project `sincere-apex-511418-p0`, number `977401667230`. All six required APIs are enabled. Default database is `FIRESTORE_NATIVE`, `STANDARD`, `asia-southeast1`, `DELETE_PROTECTION_ENABLED`, with `freeTier:true`. The Singapore Docker repository `hotel-price-hunter` has immutable tags. Runtime account `hotel-price-hunter-runtime` is enabled and has exactly the two reviewed unconditional direct project grants: `roles/datastore.user` and the project `hotelPriceHunterPredict` role. That GA/non-deleted custom role contains exactly `aiplatform.endpoints.predict` and `serviceusage.services.use`. Inherited/resource-level authority was not exhaustively audited.

Private canonical URL: `https://hotel-price-hunter-2qbcpylngq-as.a.run.app`. Service latest-created/latest-ready and 100% traffic agree on `hotel-price-hunter-00002-plm`; Ready, ConfigurationsReady and RoutesReady are True. Service input image is the approved OCI index digest below; revision status resolves its verified linux/amd64 child. Exactly one app container uses the dedicated runtime account, port 8080, CPU 1, 512Mi, concurrency 4 and timeout 30 seconds. Service/revision maximums are both 1; CPU throttling is true, startup CPU boost false. Minimum annotations are omitted after the explicit minimum-zero deployment and therefore use Cloud Run's zero default. Network ingress is all; invoker IAM is not disabled, and service IAM has no bindings. Anonymous canonical root returned 403.

Exactly five literal environment values match production/project/global/model/canonical origin. No secret valueFrom, emulator/ADC/key variables, extra container, volumes or credential mounts exist in the observed service template. Runtime/storage/model access is not established merely by this configuration.

### Verified OCI relationship

The raw registry index was fetched using the CLI access token only in process memory. HTTP 200 response media type is `application/vnd.oci.image.index.v1+json`; SHA-256 of its actual raw bytes is:

- Approved input index: `sha256:6d27cbe0f79b7cb62f643bd7d34977d224a3185ffab4eec358f16686194fdc8f`.
- Its `linux/amd64` application manifest descriptor: `sha256:70119ab3a3b0f55a6d3176f2e3b236c7d5b62f3cf0c0039ec071b22f51ebc808`, type `application/vnd.oci.image.manifest.v1+json`.
- Actual Ready revision `status.imageDigest` is that exact application manifest.
- The second `unknown/unknown` descriptor is `sha256:96d4086bfeed66c738602d7092e304f5c983a5cdf732cde802f032e752730f1e`, labelled `attestation-manifest` and explicitly referencing the application child.

The different service-input and resolved-revision digests are therefore proven index/child provenance, not an unexplained mismatch or a claim that their bytes are equal.

### Verified deployed static source

A read-only diff confirmed the isolated application/runtime/container/fixture files are unchanged from approved source `9c98ede`. Authenticated HTTPS assets all returned 200; exact downloaded byte hashes match that isolated source. Main checkout design changes and untracked work were not inspected or included.

| Route | Bytes | Matching source and deployed SHA-256 |
| --- | ---: | --- |
| `/` | 8017 | `0d3d2b809a78ffd76a4dcb8b0e9b88aefb189da155450c5479184512b54ac7d3` |
| `/booking.js` | 23148 | `e7adba5992c4ec50376222f48924918300a50d5611bdcd0e6a425b0b8ad3f2db` |
| `/booking.css` | 10573 | `7b67820f8669b1275e95cd728632d94d4b2f17f32a247ed35d099ff1678f88e2` |

### Actionable finding

**P2 — The sole liveness route uses a reserved Cloud Run path.** `app/server.mjs:149` exposes only GET `/healthz`. Actual authenticated and anonymous requests to that canonical route return Google-front-end HTML 404; the same authenticated token reaches application root with 200, so this is not inferred token failure. Google documents that some z-ending URL paths are reserved and recommends avoiding all such paths. Add a nonreserved `/health` route, preserve local `/healthz` compatibility if useful, update deployment verification/docs, run the focused server regression, and review/rebuild/deploy a newly pinned private image under root authority before claiming the planned HTTP liveness check passed. [Cloud Run reserved URL paths](https://docs.cloud.google.com/run/docs/known-issues).

The reviewer made no app change or redeployment. Authenticated liveness JSON, real Firestore application persistence, three bounded live model checks and full private customer-path acceptance remain unverified at this checkpoint. Successful static delivery does not close those rows. Active trial classification/remaining balance/expiry and no-charge coverage remain independently unobserved.

## Bounded health-alias repair review

Root authorised the minimal isolated repair after the actual Cloud Run failure. Reviewed diff changes only the GET liveness path condition to accept `/health` and `/healthz` with the same response body; adds one regression; and documents deployed `/health` usage. No authentication, exact-origin/CSRF, storage/model authority, customer flow or public IAM change is included.

Verdict: **APPROVE this bounded repair for the root-approved replacement private release.** Independent focused regression passed 1/1; complete server test suite passed 11 with 0 failures and 1 explicitly skipped emulator integration case. The new regression requires both paths to return identical 200 JSON, no visitor cookie, and zero storage/model calls. Read-only diff check was clean. No application source was edited by the reviewer, and unrelated main checkout assets/tests remain untouched.

The deployment finding is not marked resolved by a local pass. Await a new immutable index/child provenance chain and private Ready revision, then independently verify authenticated canonical `/health` 200 JSON, anonymous denial, source hashes and unchanged private controls. No extra model generation is permitted to this reviewer.

## Final private infrastructure and liveness verdict

Independently rechecked **13 October 2026, 23:33 Kuala Lumpur**. **APPROVE the actual private infrastructure/static/liveness scope.** Original reserved-path finding is now **resolved on the deployed release**. No remaining actionable issue was found in this scope. This is not public-release approval, live model success, database persistence proof, customer-flow completion or independently observed trial/credit coverage.

Latest-created/latest-ready/100%-traffic revision is **`hotel-price-hunter-00004-gn5`**, with Ready/ConfigurationsReady/RoutesReady True. Canonical origin is unchanged. Exact five-value literal production environment, dedicated identity, no secret/emulator/ADC/mount/extra-container configuration, private invoker policy, two unconditional direct project roles and GA two-permission prediction role were freshly read again and match the approved configuration. CPU 1, memory 512Mi, concurrency 4, timeout 30, port 8080, service/revision max 1, request-based CPU and boost off remain unchanged; minimum omission retains zero default.

**Authenticated GET `/health` now returns 200 JSON** `{status:'ok',storage:'firestore',model:'configured-unverified'}`. Anonymous GET `/health` returns **403**. The three authenticated static assets still return 200 and match every approved source hash in the earlier table. The health response reports configured model state and process/storage mode only; it makes no model request or claim of database/model reachability. Reviewer total model calls remain **zero**.

New immutable release provenance was independently proven from actual raw registry data:

- Approved service input index: `sha256:561278f1d47e504d5e7a392bd6fdb83d9a1855d84bc3bb8817abc413ca59d8b5`.
- SHA-256 of fetched raw index bytes and HTTP `Docker-Content-Digest` header both equal that index exactly; media type is `application/vnd.oci.image.index.v1+json`.
- Sole `linux/amd64` application descriptor: `sha256:2a5cd528ee49b7d5eda6b2df5667bd495935a9ac5ca91c28b0d9f5afbad1fc9d`, type `application/vnd.oci.image.manifest.v1+json`.
- Actual Ready revision `status.imageDigest` resolves to that exact child.
- Companion `unknown/unknown` attestation manifest: `sha256:a29f1529237a5db3344176dbeab61f91ec7294b897a8bf02ff97053a26720c00`, explicitly referencing that child.

Release source remains reviewed `9c98ede` plus the approved stdout capture correction and minimal health alias/regression/docs repair. The previous immutable release was preserved. Main checkout UI changes and unknown/untracked work were not altered or added to this image.

Coverage stops at private infrastructure, identity/direct grants, production boundaries, immutable image/source provenance, denied anonymous access and authenticated static/liveness serving. The integration worker owns separately authorised persistent-state/authority checks and at most three fixture-only model generations. Full public browser checks and public invocation require a separate human decision. Remaining balance/trial classification and inherited/resource-level authority remain explicitly limited as above.


## Applied factor-repair release: one fresh zero-generation baseline

Independently checked **14 October 2026, 00:32 Kuala Lumpur**. Current private release is **`hotel-price-hunter-00006-hfm`**; latest-created/latest-ready agree, all Ready conditions are True, and it receives 100% traffic. Canonical URL remains `https://hotel-price-hunter-2qbcpylngq-as.a.run.app`. **PASS** for the bounded private metadata, liveness, static-source and immutable-provenance scope. No cloud/application mutations, public invocation or generation occurred in this review.

Fresh metadata again shows exactly one container, the dedicated runtime account, five exact literal environment values (production/project/global/3.1 Flash-Lite/canonical origin), no secret/ADC/emulator/mounts, CPU 1, memory 512Mi, port 8080, concurrency 4, timeout 30, service/revision max 1, request-based CPU and boost off. Minimums retain zero defaults. Service IAM has no bindings and invoker checks are not disabled. Runtime direct project roles remain exactly unconditional datastore.user plus hotelPriceHunterPredict; custom role remains GA with exactly predict/serviceuse permissions.

Authenticated GET `/health` returned **200** with `{status:'ok',storage:'firestore',model:'configured-unverified'}`; anonymous GET `/health` returned **403**. Authenticated root, booking.js and booking.css each returned **200**, retaining all three exact source hashes from the original approved `9c98ede` UI table. This baseline requests neither bootstrap/state mutation nor advice generation.

Independent new provenance:

- Service input/raw OCI index: `sha256:f6cf23de9be7c44cb419263441c29761efa71c5f923a9bea8aed33c3a5f2433d`.
- Actual fetched raw bytes SHA-256 and HTTP Docker-Content-Digest header both equal that input exactly; type `application/vnd.oci.image.index.v1+json`.
- Sole linux/amd64 application child: `sha256:d033885504ac7493d0c3d1f65c06e23f1184a390d19925b3e61e61c05d66375c`, type OCI image manifest, matching actual Ready revision status.imageDigest.
- Unknown/unknown attestation: `sha256:d70f01094a3cd86e7d9238588b0213c413fd9cb78a52833add30ae3465161d34`, explicitly referencing that application child.

The applied source includes the independently approved internal factor protocol and canonical currency argument while preserving the reviewed health alias and frozen UI/domain/package/container/fixture boundary. Code review and private rollout are now applied; **post-repair live semantic acceptance remains unverified**. Original actual three-call semantic failures remain historical evidence. Global authorised generation budget is still exhausted **3/3**; any additional two-call retest requires a new explicit user approval. Reviewer generation count remains zero. Independently observed active trial/balance/expiry, inherited/resource-level authority, public browser release and full milestone completion remain outside this verdict.

