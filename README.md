# RoomDrop · Hotel Price Hunter prototype

**Current production AI:** the existing booking review now uses **Gemini 3.8 Flash** (`gemini-3.8-flash`, global, LOW thinking). Open a drop and use **Ask Gemini**. Revision `hotel-price-hunter-00015-b8d` is live with all traffic; 270 regression tests and three real production advice checks passed. The booking layout, public access and agency/watch/data boundaries were preserved. See [production release](docs/gemini-production-release.md), [earlier evaluation](docs/gemini-38-evaluation.md) and `.env.quotation.example`.

The Gemini stay adviser restores the original hackathon AI requirement in selected-room review. Travellers ask about price, room/meal differences and uncertain plans, with two previous exchanges retained per option. Gemini understands the priority and selects grounded recommendations; application code renders prices and enforces selection-only authority. See [the contract](docs/quotation-gemini-contract.md) and [initial restoration verification](docs/quotation-gemini-verification.md). Historical milestone/deployment paragraphs below describe earlier releases.

For an authorised live quotation-advice run, use the existing project, approved `GOOGLE_CLOUD_LOCATION` / `GEMINI_MODEL`, attached identity or local ADC, and explicit `QUOTATION_ADVICE_ENABLED=true`. Start with `node --env-file-if-exists=.env scripts/serve-quotation-demo.mjs --snapshot=.local/quotation-demo/DEMOP010223-selected-bundle.json --port=8094`. No startup/page-load generation occurs. Never add browser keys or reuse the exhausted historical inference allowance. The quotation image now packages the pinned SDK dependencies; deployment needs both the reviewed image and explicit model configuration. Historical booking/Firestore milestones below describe the separate earlier server.

One Node application serves the mobile public jury flow and its API, with Firestore persistence and server-side Gemini advice through Vertex AI. The approved RoomDrop customer flow starts from the current booking and three horizontal photographic alternatives, using hotel-name headings and relationship pills. The selected-offer review shows net savings and captures explicit approval directly, without a requirements/settings form. Distinct replacement, cancellation and refund stages persist across refresh. Existing enrolment, standing-permission and advice APIs remain available; scheduled monitoring and email delivery remain future work.

Only the allowlisted [anonymised jury fixture](fixtures/jury-booking.json) is public. All booking/rate facts and the USD 25 agency minimum are fictional demonstration settings. Supplier identities are fictional. There is no arbitrary booking lookup, private retrieval route, or live transaction adapter.

The initial RoomDrop customer release `c9a7d7f` established its own private Google IAP gate for `pete@altovo.com`; the agency service remains a separate reader. Independent image/runtime/direct-access verification passed **44+4** checks within the explicit inherited-IAM limit. The user confirmed the live watch/switch/agency check; one approved job execution then passed **20/20** checks and persisted the expected unsupported-replacement fixture outcome. The watch job retains that source; the customer clarity release is described below. Scheduler remains absent, Gemini disabled and notifications preview-only. See [the initial execution record](docs/roomdrop-cloud-execution.md), [daily job contract](docs/daily-watch-cloud-contract.md) and [offline setup bundle](docs/roomdrop-cloud-setup.md).

The [private customer app](https://hotel-price-hunter-2qbcpylngq-as.a.run.app/) now runs the approved clarity revision `hotel-price-hunter-00008-87j`, with shorter watch copy, one three-step guide, explicit next-action labels and a clean completed state. [Local verification](docs/customer-clarity-verification.md) records the UI, keyboard and refund/consent regressions. [Release checks](docs/customer-clarity-execution.md) pass **40/40**, including preserved data, private access and unchanged agency/watch configuration. Signed-in visual confirmation of this new revision remains pending; browser automation could not connect.

The subsequent [B1 customer redesign](docs/roomdrop-b1-verification.md) is integrated in local source and the temporary phone preview. Photo tickets, negative saving stamps, offer filters and illustrated review facts carry through the customer flow. Watch consent is explicit; approval retries survive Back and reload. Simulated transaction steps remain manual inside a Demo only disclosure. The [verified B1 image](docs/roomdrop-b1-release.md) is prepared locally and awaits deployment approval; the private cloud service still has the earlier clarity design.

The current [three-option mobile refinement](docs/three-drop-options-verification.md) keeps a slim existing-booking summary above the best overall, same-hotel and same-room drops, including overlapping winners. Non-refundable offers carry a Final drop warning and explicit watch-ending acknowledgement. Standard buttons with small room-key icons open review and approve separately; the mobile approval bar, readable penalties and visible return focus remain. This refinement is available in the fictional temporary preview and has not been deployed to Cloud Run.

The public fixture uses a labelled frozen `demoNow` for decisions. Its original `checkedAt` and `expiresAt` stay intact; displaying a snapshot does not perform a live supplier check. Visitor expiry, request limits, and audit `recordedAt` use actual wall time. Any future private/live flow must use actual time for offer and permission validity.

## Local application

Requires Node.js 22 or later. Dependencies are pinned to the official `@google-cloud/firestore` and `@google/genai` libraries. Installation scripts are disabled; no generated native dependency is required.

```powershell
npm ci --ignore-scripts
Copy-Item .env.example .env
```

Start the Firestore emulator in a separate terminal. If Java 21 and the Google Cloud CLI emulator component are already installed:

```powershell
npm run emulator
```

Alternatively Docker provides the official Google emulator image, including Java, without changing the host installation:

```powershell
docker run --name hotel-price-hunter-firestore --label com.hotel-price-hunter.owner=runtime -d -p 127.0.0.1:8081:8081 gcr.io/google.com/cloudsdktool/google-cloud-cli:563.0.0-emulators gcloud emulators firestore start --host-port=0.0.0.0:8081 --project=demo-hotel-price-hunter --quiet
docker logs hotel-price-hunter-firestore
npm start
```

Open [the local application](http://localhost:8080). `APP_ORIGIN` must match the URL used in the browser; writes require its exact origin, the visitor cookie and the bootstrap CSRF token. `npm run dev` enables Node's file watcher.

State persists in Firestore across application restarts and is isolated by a random HttpOnly, SameSite visitor cookie. Production cookies use Secure. A new browser session/cookie creates a separate scenario; no personal identity is collected. Visitor state expires after 30 days; expired state is inaccessible and may be purged by a separately configured Firestore TTL policy. Emulator contents normally disappear when its process/container is removed. Stop only the task-owned emulator when finished:

```powershell
docker stop hotel-price-hunter-firestore
```

The executable always uses Firestore and never silently falls back to memory. In-memory storage is an explicit injectable test double. A database outage returns `STORAGE_UNAVAILABLE`, not a fake save success.

## Gemini and Google Cloud configuration

Live advice requires an authorised existing `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL`, enabled Vertex AI access and Application Default Credentials locally, or an appropriate attached service account on Cloud Run. Set the approved values in ignored `.env`; do not place tokens or browser API keys in the source. The example project ID is only an emulator namespace and does not select a live Google Cloud project.

No model request is made during startup or bootstrap. `configured-unverified` describes configuration, not successful live access. Missing configuration and provider failures return `503 ADVICE_UNAVAILABLE`; saved preferences, selected comparison and the active booking survive. Mock tests are labelled test injection and are not live model proof.

Gemini receives a bounded anonymised comparison, the application-calculated decision and an allowlisted refund quote containing the bound retail totals, cancellation/switch/refund costs, net saving, currency and provenance. This lets it explain the fixture's USD 60 price difference, USD 5 switch fee and USD 55 refund without raw supplier payloads or tokens. It has no tools or transaction permission. The model can explain differences, recommend keeping flexibility, and identify unknowns; it cannot alter enrolment or approvals. Questions are limited to 1,200 characters and eight advice requests per visitor per minute using an atomic Firestore counter. Provider calls have a 20 second timeout and no automatic retries. Returned JSON is validated and rendered as plain text. Do not send personal information in the public question box.

The container follows the Cloud Run ingress contract: bind `0.0.0.0` at `PORT` (default 8080), use Firestore rather than the temporary filesystem, and close on SIGTERM. `APP_ORIGIN` is required in production. No deployment is performed by these instructions.

```powershell
docker build -t hotel-price-hunter:local .
```

For a local container smoke check against the existing emulator, share its network namespace and explicitly override production mode. The emulator port is loopback-only on the host. This command has no live credentials or model configuration:

```powershell
docker run --name hotel-price-hunter-container-check --label com.hotel-price-hunter.owner=runtime --network container:hotel-price-hunter-firestore -d -e NODE_ENV=development -e GOOGLE_CLOUD_PROJECT=demo-hotel-price-hunter -e FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 -e APP_ORIGIN=http://localhost:8080 hotel-price-hunter:local
docker exec hotel-price-hunter-container-check node -e "fetch('http://localhost:8080/healthz').then(r=>r.json()).then(console.log)"
docker stop hotel-price-hunter-container-check
```

## Verification

```powershell
npm test
```

This runs deterministic decision, money, server, storage and adapter tests. Emulator integration cases are explicitly skipped unless requested. With the emulator running, run the real Firestore persistence and HTTP isolation checks:

```powershell
$env:GOOGLE_CLOUD_PROJECT='demo-hotel-price-hunter'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8081'
$env:RUN_FIRESTORE_INTEGRATION='1'
npm run test:runtime
```

These checks verify cross-client writes, atomic updates, and restored enrolment/comparison through a new application server. They test an emulator, not deployed Firestore or live Gemini. `npm run test:firestore` runs storage tests using `.env`; the integration case requires `RUN_FIRESTORE_INTEGRATION=1`.

## Public API

All errors use `{error:{code,message,details?}}`. JSON bodies are limited to 16 KiB. Mutation requests require `Origin`, the `hph_visitor` cookie and `X-CSRF-Token`. The only source scenario is `jury-booking`.

| Endpoint | Contract |
| --- | --- |
| `GET /healthz` | Process liveness and storage/model mode; no claim of database or model reachability. |
| `GET /api/bootstrap?scenario=jury-booking` | Booking, checked offers with deterministic decisions, demo clock/provenance, saved preferences, permission record, selection and CSRF token. |
| `POST /api/enrolment` | `{bookingVersion,preferences,permissionConfirmation?}`; `preferences.version` must match the saved version before assigning the next version. Confirmation when automatic permission is true: `{confirmed:true,version:1,bookingVersion,preferenceVersion,scope:'equivalent-only'}`, with `preferenceVersion` matching the same saved source version. |
| `POST /api/selection` | `{bookingVersion,offerId}`; persists comparison only and grants no permission. |
| `POST /api/advice` | `{bookingVersion,offerId,message}`; persists the comparison, returns `{advice:{summary,recommendation,tradeoffs,uncertainties},decision,offerId,source,permissionsChanged:false}`. No chat transcript is persisted. |
| `POST /api/switches` | `{scenarioId,offerId,offerVersion,bookingVersion,preferenceVersion}` with the server-issued `Idempotency-Key`; records one authorised fictional equivalent-switch intent. |
| `POST /api/switches/:operationId/advances` | `{expectedOperationRevision}`; commits one next simulated stage or reconciles a recorded unknown cancellation. Repeating a committed command returns current saved state without repeating the effect. |
| `POST /api/offer-approvals` | `{offerId,offerVersion,bookingVersion,preferenceVersion,materialFingerprint,confirmed:true}` with the server-issued `Idempotency-Key`; atomically records approval for this selected refundable offer and one simulated operation. It grants no standing permission or preference changes. |

The optional non-refundable alternative uses the same versioned approval request with an additional literal `acceptReducedFlexibility:true`. Its review requires a separate acknowledgement of lost free cancellation and the end of normal monitoring after successful promotion. Refundable requests reject that extra field. The original remains active until cancellation proof; non-refundable promotion ends monitoring even if continuation was enabled. Reconciliation and refund recovery continue independently.

Enrolment and selection return the full bootstrap state. Enrolment compares both incoming source preference versions inside the Firestore transaction; a concurrent update or replay fails with `409 PREFERENCES_VERSION_CHANGED` and preserves the newer state. Reload and review the current preferences and separately reconfirm permission; never automatically resubmit a stale request. Standing records retain `sourcePreferenceVersion`, bind the booking and newly saved `preferenceVersion`, use the public fictional `confirmedAt` and actual `recordedAt`, and are invalidated by later preference/permission changes. An offer-specific approval cannot be submitted through these endpoints.

### Simulated switch

Review a selected alternative, use **Approve simulated switch**, then **Continue simulation** to persist one stage at a time. The three customer choices are an equivalent room, a different room at the same hotel and a different hotel, with fictional net refunds of USD 55, USD 75 and USD 85. Existing standing-flow API scenarios still cover changed terms requiring renewed approval and uncertain cancellation with reconciliation. The customer cannot supply supplier outcomes or create authority through selection, back, keep or reload.

The successful journey records revalidation, replacement, fulfilment verification, cancellation request, verified cancellation, then a separate simulated refund receipt. The original remains active until cancellation is verified. At that point the replacement becomes the active version, the USD 55 saving is secured in the simulation and the refund is pending. Only the final stage marks the simulated refund completed. Refresh restores progress; a repeated intent or stage cannot create another replacement/refund. Changed material facts stop before replacement; unknown cancellation secures no saving until a separate observation resolves the recorded intent. Recovery never creates a second cancellation request.

Continued monitoring applies to the replacement baseline after a successful switch. Turning it off leaves the original enrolled watch active until its deadline. Original offers are removed after promotion rather than presented as new savings against the replacement. This slice adds no live supplier adapter, automated scheduler or real payment. See [the simulation contract](docs/simulated-switch-contract.md) and [local verification setup](docs/simulation-verification-setup.md).

The final RoomDrop checks passed 102/102 tests against the Firestore emulator, 11 real-browser acceptance groups with 21 stage snapshots and 16 responsive checks, and local Docker/restarted-host journey checks. [The postcard contract](docs/booking-postcard-contract.md), [verification report](docs/booking-postcard-verification.md) and [independent review](docs/review-booking-postcard.md) record exact evidence and boundaries. The user-requested removal of the old modal/questionnaire/settings/chat/scenario UI supersedes its three DOM-specific browser harnesses; `tests/postcard.browser.mjs` covers the replacement flow, and all domain/API tests remain. Run it in the isolated Playwright CLI session documented in the report. Earlier [simulation evidence](docs/simulation-verification.md) remains historical. This new simulation/UI has not been deployed to the existing private cloud service. The local review configuration keeps Gemini unconfigured; earlier live cloud advice evidence is separate in [private-cloud-verification.md](docs/private-cloud-verification.md).

## Local agency review and non-refundable scenario

The subsequent local slice passed 113/113 emulator-enabled Node tests, the new non-refundable/operator browser checks and the unchanged postcard regression. [Its verification record](docs/flexibility-agency-verification.md) and [independent review](docs/review-flexibility-agency.md) distinguish actual browser/emulator evidence from source-only checks.

`/agency` is a read-only view of newly indexed fictional operations, including unresolved cancellation, fulfilment/authority gaps, and saving/refund states. It requires separate operator access. The login shell contains no credentials; protected APIs deny access by default. The `local-review` passphrase provider supports local fixture review only: production, Cloud Run, non-loopback binding and non-emulator activation are rejected. Existing historical operations are not backfilled.

Create the ignored local access configuration once, without printing its generated passphrase:

```powershell
node scripts/setup-agency-review.mjs
```

To run local review, use the documented emulator/demo environment, set `AGENCY_AUTH_MODE=local-review`, `BIND_HOST=127.0.0.1` and `APP_ORIGIN=http://localhost:8080`, then start the app. Retrieve the passphrase manually from ignored `.local/agency-review.json` and enter it at `/agency`; never paste it into tracked files, command arguments or reports. Operator sessions last 30 minutes and invalidate on restart/reauthentication. The case APIs are read-only, paginated and strip all visitor/session credentials and internal mutation identifiers.

### Google IAP operator identity

An opt-in Google IAP provider is prepared for a **separate agency-only service**, using `APP_SURFACE=agency`, `AGENCY_AUTH_MODE=iap`, an exact `AGENCY_IAP_AUDIENCE` and JSON `AGENCY_IAP_ALLOWED_SUBJECTS`. The customer service cannot activate this mode. Agency APIs verify Google's signed assertion and explicit subject membership on every request; customer mutations and advice are unavailable on that surface. Google manages sign-in, so the agency page offers an access recheck instead of a local passphrase or application logout. Cases remain fictional and read-only.

See [the identity contract](docs/agency-iap-contract.md) and [private deployment proposal](docs/agency-iap-deployment.md) for exact configuration, strict expiry, key retrieval, allowlist rollout and separate release gates. Local tests do not establish actual Google browser sign-in, deployed IAM or production supplier access. The existing private cloud release has not been updated.

[Google setup checkpoint](docs/agency-google-setup.md): after explicit scoped approval, the separate [private agency service](https://hotel-price-hunter-agency-2qbcpylngq-as.a.run.app/agency) is deployed with IAP, the dedicated Firestore reader and a direct operator grant for `pete@altovo.com`. Image/source/configuration and unchanged customer-service checks pass within the documented organization-IAM coverage limit. The one-shot reader probe verified actual reads and guarded update/delete denials, then its job was removed. See [the execution record](docs/agency-cloud-execution.md) for signed-browser acceptance status and exact evidence. No API key or service-account key is required.

## Price watch and notification previews

Use **Watch for better rates** to save checks-and-alerts consent and the first simulated check in one action; **Stop watching** revokes it. This grants no switch permission and changes no booking, enrolment or saved stay requirements. Updates are collapsed by default and explicitly preview-only: none are emailed. Daily/weekly/offers-only record policy uses existing saved preferences; manual refund progress and agency-attention records remain evidence-bound.

`POST /api/price-watch` accepts `{bookingVersion,watchVersion,enabled}` plus the bootstrap's server-issued `Idempotency-Key` and normal session/origin/CSRF guards. `GET /api/notifications?limit=20` returns own-session safe previews (limit 1–50). New watch rates have separately generated simulated identities, actual check times and bound money; they are read-only observations and are not passed into the frozen demo approval flow. The original operation clock and approved source snapshots remain unchanged. Unsupported replacement sources record a failed check rather than claiming no saving exists.

With the explicit demo/emulator environment from the local setup, run the packaged local worker once or leave its bounded 60-second polling loop active:

```powershell
node scripts/run-price-watch.mjs --once
node scripts/run-price-watch.mjs --loop
```

Daily intent records, consent/version/deadline checks and immutable previews make restart/retry safe. CLI default/production/cloud or missing emulator configuration is rejected. This is a local worker; no Google Cloud Scheduler/Tasks resource, live provider, email delivery or agent automation is created. See [price-watch-contract.md](docs/price-watch-contract.md), [verification](docs/price-watch-verification.md) and [independent review](docs/review-price-watch.md). Final local verification passed 142 emulator tests with zero skips, 17 new browser groups and the preserved customer/agency regressions; actual host and packaged-worker checks passed.

Relevant primary documentation: [Cloud Run container contract](https://docs.cloud.google.com/run/docs/container-contract), [Firestore server library](https://docs.cloud.google.com/firestore/native/docs/create-database-server-client-library), [Firestore emulator](https://docs.cloud.google.com/firestore/native/docs/emulator), [Google emulator Docker image](https://github.com/GoogleCloudPlatform/cloud-sdk-docker), [Google Gen AI SDK](https://github.com/googleapis/js-genai), and [structured model output](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output).

## Existing pitch and design references

The proposed deployment to project `sincere-apex-511418-p0` is documented in [the staged deployment plan](docs/deployment-plan.md). `./scripts/prepare-cloud.ps1` is offline/dry-run by default and prints the reviewed commands. Provisioning, image upload, private deployment and final public access remain gated by explicit approval and verified trial/access prerequisites; the cloud environment template contains no credentials.

The original Cloudflare pitch remains in `src/pitch.html`, `worker/index.js` and `designs/`. `npm run build` regenerates only the Worker HTML; `npm run dev:pitch` starts its separate local Worker. Its existing username/password configuration remains separate from the jury application. `npm run deploy:pitch` is the existing publication path and requires separate deployment authorisation.

The [previous hosted pitch](https://hotel-price-hunter-pitch.clear-olm-9015.chatgpt.site) is not the new application. The [design snapshots](designs/README.md) preserve Travel journal, Clean comparison and Booking changes. See [the data contract](docs/data-contract.md), [decision examples](docs/decision-examples.md) and [integration evidence](docs/integration-feasibility.md) for current live integration limits.
