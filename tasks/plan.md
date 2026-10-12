# Hotel Price Hunter: proposed starting plan

Status: approved by the user; first milestone implementation in progress on `codex/customer-flow`.
Reviewed: 12 October 2026, Asia/Kuala_Lumpur.

## Recommendation

Start by defining the booking/offer contract and checking Altovo read-only feasibility. Then deliver one complete public demo path: an anonymised refundable booking, enrolment, one grounded Gemini comparison, and persisted preferences. Add the simulated switching lifecycle next. Preserve the current Booking changes visual direction.

The agreed prototype plan supplies the product requirements. This document orders implementation; it does not replace those requirements or authorise deployment, publication, live transactions, or sending email.

## Evidence reviewed

- Agreed plan: `C:/Users/pohli/.codex/.chatgpt-projects/g-p-6acc4eb559288191a742ed7b1ec78751/hotel-price-hunter-plan.md`.
- Current repository: `README.md`, `package.json`, `wrangler.toml`, `scripts/build.mjs`, `src/pitch.html`, `worker/index.js`, and the design index.
- The checkout was clean on `main`. The current implementation is a static Cloudflare Worker with shared authentication and fictional offers. There are no live Altovo/Gemini integrations, persistent enrolment, monitoring jobs, or transaction workflow. There is a build command but no test command.
- The mirrored project `sources/` directory is empty. The plan mentions linked booking documentation without supplying a link. Local scraper room-matching research files were located, but their contents and API behaviour have not been validated in this review.
- Current official requirements: [Themes](https://aibuildercup.com/themes.html) and [FAQ](https://aibuildercup.com/Faqs.html). Google AI and Google Cloud deployment are required; the FAQ excludes solutions built primarily on other clouds and requires a public repository, deployed prototype, deck and video under three minutes. The new application should visibly distinguish its own implementation from existing Altovo dependencies.
- The dated participation capture records submission closing at **19 October 2026, 02:29 Kuala Lumpur time**. That is a local 12 October snapshot, not a fresh authenticated dashboard verification. Plan to finish on 18 October and recheck the dashboard before relying on the cutoff.

## Findings that affect the first build

1. **Runtime gap.** Cloudflare hosts the existing pitch UI; the planned application belongs on Google Cloud. Reuse the visual assets in a Cloud Run application. Avoid adding the application backend to the Worker and moving it later.
2. **Permission gap.** The UI currently says customers approve every change and never changes the active booking. The agreed plan requires separately confirmed standing permission for equivalent automatic switches, while alternatives need individual approval.
3. **Price contract gap.** The UI calculates savings as a subtraction from a fixed USD 600 baseline. Define customer total price, currency, fees, cancellation costs and the agency refund calculation before claiming a net saving. Supplier cost savings alone do not prove a traveller refund. No mixed-currency comparison without an agreed conversion policy.
4. **Integration evidence gap.** Verify retrieval, complete rate identifiers, occupancy including child ages, cancellation schedules and final offer checking. Historical `confirmed` versus terminal `vouchered` semantics remain unverified. Unknown essential conditions must prevent automatic switching.
5. **Demonstration gap.** The present selection acknowledgement does not demonstrate replacement, cancellation or refund states. Build a persisted simulation whose decisions and transitions are shared by scheduled checks and the labelled advance-demo control.

## Initial architecture and boundaries

- One Cloud Run application serves the mobile UI and server endpoints. Firestore stores booking versions, preferences, approval records, offers and operation history. Keep this as one application initially.
- Gemini through Vertex AI receives validated booking/offer facts and explains tradeoffs. Application rules calculate money, classify eligibility and enforce permissions. Gemini cannot create transaction authority or invent missing conditions.
- Define separate booking-read, offer-search/revalidate and transaction interfaces. Public jury mode uses allowlisted anonymised fixtures and simulated transactions. Private research mode uses authorised read-only Altovo access and separate protected routes/data. Never offer arbitrary real-booking lookup publicly or pass raw personal data into public scenarios.
- Standalone single-room bookings only. Preserve dates, occupancy, essential conditions, complete supplier identifiers and timezone-aware cancellation schedules.
- Equivalent automatic switches require affirmative standing permission, sufficient net saving, verified equivalence and unchanged flexibility. Unknown facts block automation. Different rooms/hotels and reduced flexibility require explicit offer-specific approval.
- Transaction sequence: revalidate, secure replacement, verify fulfilment, cancel original, verify cancellation, process refund. A changed offer invalidates the relevant approval. Cancellation uncertainty enters an agency exception state; it does not imply savings secured or refund completed.
- Continued monitoring uses the replacement's baseline and deadline. A non-refundable replacement ends price monitoring after explicit approval; unresolved recovery operations continue.
- Introduce Cloud Scheduler and Cloud Tasks after the first complete simulation works. Repeated invocations must be idempotent. Real email delivery can follow the notification record/outbox implementation.

## Delivery order

Detailed tasks for the first milestone are in `tasks/todo.md`.

1. **Contract and feasibility:** inspect the missing references, define canonical data and decision examples, perform authorised read-only API probes and verify GCP/Vertex prerequisites. If Altovo access is unavailable, document the limitation and continue the public flow with fixtures; private retrieval remains incomplete.
2. **First working customer path:** confirmation page -> dismissible invitation -> enrolment -> persisted preferences -> grounded Gemini comparison retaining the selected offer in view. All three offer categories have representation; no transaction claims yet.
3. **Simulated equivalent saving:** one daily-check decision produces an eligible offer and executes the full simulated operation with distinct saving/refund states. Repeating the trigger cannot create a second replacement or refund. The replacement becomes the monitored booking when permitted.
4. **Remaining jury scenarios:** non-refundable advice/approval, material revalidation change requiring new approval, uncertain cancellation in the agency view. Include failure/no-saving updates without presenting a failed check as a successful search.
5. **Operational and submission proof:** scheduled trigger, controlled task retries, notification preferences and records, protected private read-only retrieval, authorised Cloud Run deployment, public-repository sanitisation, deck and a roughly 2:45 demo video. Verify the deployed version and submission fields; do not infer that a submission was received.

## First milestone acceptance

- A user can decline or complete enrolment against an anonymised single-room booking. Essential requirements are editable; automatic-switch permission is explicitly confirmed; saving threshold cannot drop below the agency minimum; notification frequency is stored; continued monitoring defaults on.
- Refresh preserves enrolment and the selected comparison. Gemini answers from the booking, preferences and checked offer facts, can recommend keeping flexibility, and never predicts future prices. Model failure leaves the booking and preferences intact.
- Money/permission rules are tested independently of Gemini. Public routes expose no private booking retrieval or real transaction calls. Mobile runtime checks cover the invitation, enrolment and comparison flow.

## Risks and prerequisites

| Unknown | Required evidence | What can proceed without it |
| --- | --- | --- |
| Altovo access and response contracts | Authorised booking, search and final-check captures, sanitised and timestamped | Fixture-based public customer flow |
| Equivalent-room proof | Explicit essential-condition mapping; unknown/mismatch examples | Advice-only comparisons |
| Fulfilment status semantics | Current documentation plus live read-only status evidence | Simulated fulfilment with an explicit unverified live gate |
| Customer price/refund accounting | Agency mapping of retail total, costs and refund amount | Explicit fixture prices and simulated settlement |
| GCP project, billing, region, Vertex access | Read-only prerequisite check; any provisioning separately authorised | Local implementation with a model adapter |
| Email delivery | Provider/configuration plus authorised test delivery | Notification records and preview |

Proposed demonstration assumption: use one explicit currency and an agency minimum represented in the fixture. The minimum value and anonymised booking must be chosen before money examples are treated as accepted behaviour. Do not invent a production threshold.

## Next concrete action

Complete Task 1: a compact data/decision contract grounded in the available references, with a fixture and examples of automatic eligibility, approval required and blocked execution. Then attempt Task 2's authorised read-only probes. This resolves the most expensive assumptions before adding a chat interface or background infrastructure.
