# Integration feasibility evidence

Recorded: 12 October 2026, 22:47–22:53 Asia/Kuala_Lumpur. This records the starting environment; later local setup may supersede it.

Fixture-based implementation can proceed. Live Altovo retrieval/search, fulfilment verification and live Gemini remain incomplete. No production booking, search, final-check or model call was made in this audit. No cloud resources, billing or IAM were changed.

## Evidence and scope

The agreed prototype plan and `tasks/plan.md`/`tasks/todo.md` were inspected. The synced project `sources/` directory is empty. These local **read-only references were found**, rather than downloaded or modified:

- `C:/Users/pohli/Sites/scraper/comparison-logic.md`: line 6 points to the booking guide; lines 22–45 describe IAM/tenant configuration; lines 144–190 describe rates and teaser limitations.
- `C:/Users/pohli/Sites/booking_agent/docs/EASYGDS_HOTEL_API_GUIDE.md`: historical production verification dated **20 July 2026**, search/rates/prebook; scope excludes booking retrieval. Sections 1, 5–7 and 10 explain tenant, occupancy, price/currency and cancellation differences.
- `C:/Users/pohli/Sites/booking_agent/docs/HOTEL_BOOKING_FLOW.md`: endpoint map, retrieval, historical statuses and deviations; section 8 includes historical staging/production captures. This is documentation evidence, **not a current live response**.
- `C:/Users/pohli/Sites/scraper/room-matching-typesafe.md`, `room-matching-v4-plan.md`, `AGENTS.md`: matching methodology is advisory; a match classification cannot confer customer permission or prove preserved cancellation flexibility.

Only configuration key names/presence were inspected in scraper `.env`. Existing credential values were neither printed nor copied. Host names documented for one tenant are not authority to retrieve another tenant's bookings. No authorised booking code, customer-facing tenant ownership or zero-markup-to-retail mapping was supplied for this prototype.

## Altovo checks

| Check | Attempted? | Result | Evidence / blocker |
| --- | --- | --- | --- |
| Historical documentation discovery | Yes | Success | Paths above; missing link recovered through scraper reference. |
| Existing credential availability | Local inspection only | Key names present | Scraper has `EASYGDS_API_URL`, IAM/email/password/scope/territory keys. Availability does not establish current validity or target authority. |
| Booking generic lookup / operator detail / hotel retrieval | No | Blocked | Owner-authorised tenant, booking and credential mapping absent. Historical `GET /v2/bookings`, `GET /bookings`, `POST /v2/shopping/hotels/book/retrieve` documented. |
| Availability / full rates | No | Blocked | Original stay dates, complete occupancy/child ages and authorised tenant missing. Historical POST paths `/v2/products/hotels/availabilities` and `/availabilities/rates` documented. |
| Final checking | No | Blocked | Only documented candidate is `POST /v2/shopping/hotels/prebook`; guide section 7 says it commits an offer to a short-lived single-use shopping session and locks price. This changes shopping state and is excluded from the read-only allowlist. Need a documented noncommitting check, or separately authorised hold scope. |
| `confirmed` → `vouchered` semantics | No live observation | Unverified live gate | Historical flow section 5 distinguishes intermediate `confirmed` from terminal `vouchered`; generic endpoint can report `success` with a different enum. Never collapse these into verified fulfilment. |

### Unresolved data mapping gates

1. **Retrieval completeness:** historical hotel-specific retrieve omits stay dates and travellers. The historical operator `GET /bookings?booking_code=…` supplies dates, travellers, retail currency and products. Never infer arrival from a cancellation tier boundary. Check standalone single-room scope before ingestion.
2. **Complete offer identity:** retain opaque identifiers unmodified in private memory/storage, bound to tenant/search/hotel/supplier and occupancy. July guide uses flat `offers[]` and `rooms[].offer_id` for prebook; older flow uses `rooms[].rates[]`, room and rate identifiers. No current response established which applies.
3. **Money:** July guide pairs display `price_info` with `currency_info.conversion`, and supplier amounts with supplier currency. Earlier flow reports materially different regimes, including null supplier amounts and two tenants. Neither supplier cost reduction nor System-account markup proves customer refund. Current retail/cost/fee/currency evidence and agency settlement mapping remain required.
4. **Cancellation:** `cancellations[]` may be empty while `original_cancellations[]` contains tiers. Null penalty currency, absent/null deadline, supplier-specific timezone and free-cancellation booleans need explicit interpretation. Unknown timezone or amount currency blocks automation. Earlier claims of UTC are historical evidence, not permission to append `Z` to naive timestamps.
5. **Room equivalence:** identity, board, bed configuration, view, occupancy, essentials and flexibility need explicit known/match/unknown/mismatch evidence. Scraper matching precision is not an execution gate.
6. **Search completeness:** teaser prices are indicative. Historical guides disagree about `progress` reliability; verify full rate identity, complete pricing and freshness rather than asserting successful comparison from a lead price.

## Local runtime and cloud prerequisites

| Check | Attempted? | Verified result |
| --- | --- | --- |
| Normal PowerShell tool resolution | Yes | Node `24.11.1`; Docker CLI `29.6.2`; Google Cloud SDK `563.0.0`. |
| Java / Firebase | Yes, local PATH/config/install-root checks | Neither on PATH. `JAVA_HOME`, Firebase global package/config and emulator cache absent; common Java/Adoptium install roots absent. This is a setup gap, not a prohibition on local dependency installation. |
| Docker daemon | Yes | Sandbox denied the Docker Desktop pipe; normal host PowerShell confirmed Linux engine `29.6.2`, Docker Desktop `4.84.0`. Installed and usable on the host. |
| Existing Docker image names | Yes, read-only host list | Includes `node:24-slim`, `node:20-alpine`, `altovo-search-radar:local`; no explicitly Firebase/emulator-labelled image. Image internals were not inspected. |
| gcloud active account | Yes | Sandbox account query could not access normal config; normal host PowerShell returned **one active account**. Identity/token deliberately suppressed. |
| gcloud selected project / Run region / AI region | Yes | Unset on the host. |
| ADC file | Yes, fixed metadata only | Existing `authorized_user` ADC; quota project `pohlschmidt-digital`. This is credential metadata, **not an authorised Hotel Price Hunter application target**. |
| Visible account/project billing metadata | Yes, separately authorised by user | Four accessible active projects; zero accessible billing accounts. Billing describe succeeded for all four projects: one billing-enabled, three disabled. No names, IDs or billing account identities retained. |
| Intended application project, enabled services, Firestore database region | No | User requests a fresh project with free credits; target, eligibility and billing setup remain unresolved. No project was inferred from ADC quota metadata. |
| Live Gemini through Vertex | No | Blocked pending authorised project, model/location, verified service/billing/access and working ADC. Authentication presence alone does not prove inference permission. |
| Browser bootstrap availability | Yes, filesystem read only | Bundled browser `scripts/browser-client.mjs` exists and is readable. The runtime worker's Node bootstrap EPERM is not evidence of a missing plugin. Browser execution was not tested here. |

The current Firebase general installation page says Java 11+, while the Firestore-specific page warns of Java 21 for current/upcoming releases. Use **Java 21+** for the local emulator setup and record the exact CLI/emulator versions that actually run. A `demo-` Firebase project permits emulator work without a real Firebase project. Set `FIRESTORE_EMULATOR_HOST` without a scheme and require explicit emulator configuration in local mode so missing configuration cannot silently fall through to production.

Current official Gemini quickstart URLs redirect to Gemini Enterprise Agent Platform documentation. Its samples still show `GoogleGenAI({ vertexai: true, project, location })` but also show different environment/model examples. Do not auto-migrate the agreed architecture or assume a sample model's availability. Select and prove the authorised project's actual model/location using the official SDK and a fixture-only request.

### Fresh project and free-credit request

The user requested a fresh project that provides free credits, then authorised inspection of visible account history because prior use was uncertain. On **12 October 2026 at 22:52 Kuala Lumpur time**, normal host CLI metadata reads succeeded: four active accessible projects, no accessible billing accounts, and one billing-enabled / three billing-disabled projects. Zero accessible billing accounts means none returned by the caller's permission-limited account listing; it does **not** prove the user has never had an account or paid use. A billing-enabled project likewise does not reveal whether its billing account is trial or paid, whether it belongs to this user, or whether trial credits remain.

Google's current offer is **$300 for 90 days for an eligible new customer**, attached to a Free Trial billing account rather than renewed for each new project. Eligibility requires never having been a paying Google Cloud, Google Maps Platform or Firebase user and never having signed up for the Free Trial. The account/project CLI metadata checked here does not expose remaining promotional credit, prior signup history or personal eligibility. No signup, payment verification, paid upgrade, project creation or billing association was attempted. The account's authenticated Billing/Free Trial console or signup eligibility decision remains necessary; project creation alone cannot prove or grant credits.

## Reproducible bounded checks

`node scripts/probe-altovo.mjs` is offline by default and prints only configuration presence and prerequisites. Supported read operations are `lookup`, `detail`, `retrieve`, `search` and `rates`. Execution requires `--execute --operation=<operation> --input=<private-json-path>`, `HPH_ALTOVO_READ_AUTHORISED=yes`, an existing bearer token in `HPH_ALTOVO_READ_TOKEN`, and an exact documented `HPH_ALTOVO_BASE_URL` from the fixed allowlist. It does not load scraper secrets, log in, follow redirects, retry, prebook, book, cancel or refund. One hotel/single-room search has a fixed input schema; input identifiers are passed intact and never printed. Output contains fixed field-presence metadata and HTTP status only. This diagnostic does **not** capture a full private contract or establish currency/condition mappings; those require a separate approved sanitisation step when live access is established.

`./scripts/check-gcp.ps1` defaults to local presence metadata and makes no cloud request. `-ReadCloud -ProjectId <explicit-existing-project> -AuthorisedProject` permits only project describe, billing describe, enabled-service listing and Firestore database metadata listing. Raw stderr, account identity, billing account identity and secrets are suppressed. It neither prints access tokens nor creates/enables resources. Cloud read failures must remain failures, not implicit absence or permission to provision. Normal host PowerShell may be necessary because installed CLI configuration/logging and the Docker pipe are sandbox-restricted.

Validation completed: Node syntax check passed; offline mode made no request; `prebook` and `cancel` were refused; `--execute --operation=retrieve` without credentials/authority/input was blocked; PowerShell parser reported zero errors; default local mode made no cloud request and `-ReadCloud` without an authorised project was blocked. No live network branch was exercised. Neither dry-run output nor a mocked check satisfies live API or Gemini acceptance criteria.

## Remaining evidence needed

- Resolution of the requested fresh-project/free-credit eligibility and billing setup; an explicitly designated application project, location/model choice, enabled API metadata, effective ADC/model access and a live fixture-only Gemini response.
- Authorised customer-facing Altovo tenant, one standalone single-room booking, safe credential source and current read contracts. Existing historical booking codes in reference documents were not reused.
- Current search/rates and noncommitting final-check captures proving complete identifiers, original occupancy including child ages, amount/currency pairing and cancellation timezone/schedule.
- Agency customer-price/refund accounting and fulfilment semantics verified through authorised existing booking observation.

## Official sources checked on 12 October 2026

- [gcloud enabled services read](https://docs.cloud.google.com/sdk/gcloud/reference/services/list), [billing describe](https://docs.cloud.google.com/sdk/gcloud/reference/billing/projects/describe), [Firestore database listing](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/databases/list).
- [Firebase emulator installation](https://firebase.google.com/docs/emulator-suite/install_and_configure), [Firestore emulator / demo projects](https://firebase.google.com/docs/emulator-suite/connect_firestore).
- [Google Gen AI JavaScript SDK](https://github.com/googleapis/js-genai), [ADC setup](https://docs.cloud.google.com/docs/authentication/provide-credentials-adc), [current redirected Gemini quickstart](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start).
- [Billing account listing permission limits](https://docs.cloud.google.com/billing/docs/reference/rest/v1/billingAccounts/list), [Free Trial eligibility/credit terms](https://docs.cloud.google.com/free/docs/free-cloud-features), [signup FAQs](https://cloud.google.com/signup-faqs).
