# Gemini 3.8 Flash: integration and live evaluation

**Production update, 18 October:** this evaluated adviser is now deployed in the existing booking review. [Production release](gemini-production-release.md) records the source/image/revision, three additional successful production checks and unchanged agency/watch/data boundaries. The remaining-release section below describes the earlier evaluation checkpoint.

17 October 2026. The user approved evaluating Gemini 3.8 Flash with “Ok. Go ahead with it”, following the proposed three-case check and model recommendation. **All three real Vertex AI requests passed.** No deployment, IAM change, supplier call, booking, cancellation, payment or refund occurred.

## Application configuration

The quotation adviser now targets `gemini-3.8-flash` in `global`. Production startup rejects another model or location when quotation advice is enabled. The original fictional-booking adviser, historical deployment configuration and five-call inference ledgers are unchanged.

The pinned `@google/genai` 2.28.0 SDK supports the required `thinkingConfig.thinkingLevel`; it remains pinned. Quotation generation uses `LOW` thinking, structured JSON and a 2,048-token output cap. Deprecated sampling settings are removed. Existing twenty-second provider timeout, single attempt/no retries and HTTP request guards remain. Configuration is documented in `.env.quotation.example`; it contains no credentials. Local evaluation injects only an existing named-account auth client into the real SDK, with its short-lived token kept in memory; it does not replace transport with a test provider or alter ADC. Cloud Run continues to use its attached identity when this candidate is deployed.

Official sources: [Gemini 3.8 migration guidance](https://ai.google.dev/gemini-api/docs/generate-content/whats-new-gemini-3.8), [Google Cloud model specifications and global availability](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash).

## Real model results

Calls used the actual quotation HTTP advice route, native SDK/Vertex provider and the already-public display snapshot. Each attempt was reserved before sending it. The single-use runner disables provider retries and cannot reopen its ledger. All three responses were HTTP 200, `source:vertex-gemini`, `selectionChanged:false`, with provider-reported `modelVersion:gemini-3.8-flash`.

| Case | Actual model selection | Semantic review of complete customer reply |
| --- | --- | --- |
| Price | `consider-option`, priority `price`; `lower-estimate`, `terms-unverified` | Pass. AED 7.85 is an indicative difference before final retail pricing/fees, with no verified saving or refund. |
| Uncertain dates, non-refundable option | `keep-quotation`, priority `flexibility`; `reduced-flexibility`, `quotation-flexibility` | Pass. Recommends retaining flexibility and distinguishes the starting quotation from a reservation. AED 217.55 remains indicative only. |
| Room and meals | `consider-option`, priority `room-details`; `different-room-label`, `different-board-label`, `terms-unverified` | Pass. Identifies label differences, requires checking meal inclusion and does not assert equivalence or an upgrade. |

Gemini chose the priority/recommendation/reasons; application-owned text supplied financial and authority statements. A post-evaluation state read confirmed that confirmation remained null. The price and room questions shared the same selected option, exercising bounded previous-exchange context. The complete safe replies and source/snapshot bindings are retained in `.local/gemini-38/live-allowance.json`. **New allowance: 3/3 consumed, zero retries.** Historical allowances remain separately exhausted at 5/5. No more generation is authorised by this evaluation.

Project: `sincere-apex-511418-p0`; location `global`; operator `pete@altovo.com`. The observed provider version establishes actual 3.8 use. Operator access does not establish the deployed service identity's current model permissions; those require release verification. These three scenarios do not prove arbitrary conversational coverage or current supplier availability.

## Local checks and packaging

The focused adapter, HTTP/cloud-profile and original adviser regressions passed **39/39 with zero skips**. The migration test first failed on the missing thinking configuration, then passed with explicit LOW thinking and without sampling settings. The earlier complete restoration suite passed 266/266; that historical result is not presented as a rerun of concurrent booking-flow work now in this checkout.

The updated narrow allowlist image `roomdrop-gemini-38:local` built successfully, excluding unrelated new booking files and credentials. Manifest list: `sha256:a8e7ec72089114174af738bfe8d8b71eeb41d67e756ad82c792354ba4e0a0faf`. Working-tree source hashes are retained in `.local/gemini-38/context-manifest.json`; this local smoke image is not a clean-commit cloud release. The real production entrypoint started in a task-owned read-only container with networking disabled; internal HTTP health returned `status:ok`, `surface:quotation-demo`, three options and `model.status:configured-unverified`. This packaging check generated no request. The task container was removed after verification.

## Release still pending

The public service remains on its previous model-free quotation release. Live evaluation did not upload or deploy the candidate or enable a public inference endpoint. The next release must freeze/review clean source and image/configuration, preserve the existing customer/agency/watch boundaries, enable the explicit 3.8 model values and verify the actual public journey using a newly authorised inference allowance. No automatic fallback to an older model is configured.
