# Hotel Price Hunter

One Node application serves the mobile public jury flow and its API, with Firestore persistence and server-side Gemini advice through Vertex AI. It covers enrolment, editable requirements, separately confirmed equivalent-switch permission, saved comparisons, grounded advice, and a persisted fictional switch with distinct replacement, cancellation and refund stages. Scheduled monitoring and email delivery remain future work.

Only the allowlisted [anonymised jury fixture](fixtures/jury-booking.json) is public. All booking/rate facts and the USD 25 agency minimum are fictional demonstration settings. Supplier identities are fictional. There is no arbitrary booking lookup, private retrieval route, or live transaction adapter.

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

Enrolment and selection return the full bootstrap state. Enrolment compares both incoming source preference versions inside the Firestore transaction; a concurrent update or replay fails with `409 PREFERENCES_VERSION_CHANGED` and preserves the newer state. Reload and review the current preferences and separately reconfirm permission; never automatically resubmit a stale request. Standing records retain `sourcePreferenceVersion`, bind the booking and newly saved `preferenceVersion`, use the public fictional `confirmedAt` and actual `recordedAt`, and are invalidated by later preference/permission changes. An offer-specific approval cannot be submitted through these endpoints.

### Simulated switch

Save explicit equivalent-only permission, choose a demo journey and use **Advance demo** to persist one stage at a time. The fixed journeys are equivalent saving, changed terms requiring renewed approval, and uncertain cancellation with reconciliation. Every journey starts from the same fictional equivalent offer; the client cannot supply supplier outcomes or create authority. Selection and advice alone do not start a switch.

The successful journey records revalidation, replacement, fulfilment verification, cancellation request, verified cancellation, then a separate simulated refund receipt. The original remains active until cancellation is verified. At that point the replacement becomes the active version, the USD 55 saving is secured in the simulation and the refund is pending. Only the final stage marks the simulated refund completed. Refresh restores progress; a repeated intent or stage cannot create another replacement/refund. Changed material facts stop before replacement; unknown cancellation secures no saving until a separate observation resolves the recorded intent. Recovery never creates a second cancellation request.

Continued monitoring applies to the replacement baseline after a successful switch. Turning it off leaves the original enrolled watch active until its deadline. Original offers are removed after promotion rather than presented as new savings against the replacement. This slice adds no live supplier adapter, automated scheduler or real payment. See [the simulation contract](docs/simulated-switch-contract.md) and [local verification setup](docs/simulation-verification-setup.md).

The final local simulation checks passed 87/87 tests against the Firestore emulator, 15 new real-browser checks, the two existing browser regressions and a local Docker build/emulator smoke. [The verification report](docs/simulation-verification.md) records exact evidence and limits; [backend](docs/review-simulation.md) and [UI](docs/review-simulation-ui.md) independent reviews cover the guards and recovery display. This new simulation/UI has not been deployed to the existing private cloud service. Its local review configuration keeps Gemini unconfigured; earlier live cloud advice evidence is separate in [private-cloud-verification.md](docs/private-cloud-verification.md).

Relevant primary documentation: [Cloud Run container contract](https://docs.cloud.google.com/run/docs/container-contract), [Firestore server library](https://docs.cloud.google.com/firestore/native/docs/create-database-server-client-library), [Firestore emulator](https://docs.cloud.google.com/firestore/native/docs/emulator), [Google emulator Docker image](https://github.com/GoogleCloudPlatform/cloud-sdk-docker), [Google Gen AI SDK](https://github.com/googleapis/js-genai), and [structured model output](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output).

## Existing pitch and design references

The proposed deployment to project `sincere-apex-511418-p0` is documented in [the staged deployment plan](docs/deployment-plan.md). `./scripts/prepare-cloud.ps1` is offline/dry-run by default and prints the reviewed commands. Provisioning, image upload, private deployment and final public access remain gated by explicit approval and verified trial/access prerequisites; the cloud environment template contains no credentials.

The original Cloudflare pitch remains in `src/pitch.html`, `worker/index.js` and `designs/`. `npm run build` regenerates only the Worker HTML; `npm run dev:pitch` starts its separate local Worker. Its existing username/password configuration remains separate from the jury application. `npm run deploy:pitch` is the existing publication path and requires separate deployment authorisation.

The [previous hosted pitch](https://hotel-price-hunter-pitch.clear-olm-9015.chatgpt.site) is not the new application. The [design snapshots](designs/README.md) preserve Travel journal, Clean comparison and Booking changes. See [the data contract](docs/data-contract.md), [decision examples](docs/decision-examples.md) and [integration evidence](docs/integration-feasibility.md) for current live integration limits.
