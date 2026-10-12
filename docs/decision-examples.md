# Fictional decision examples

All amounts below are USD, in a single-room fictional stay from 12 to 15 November 2026 at Example Harbour Hotel. The baseline retail total is USD 600.00, supplier cost is USD 450.00, and free cancellation ends 10 November 2026 at 18:00 Asia/Kuala_Lumpur (10:00Z). No example uses a real booking or performs a live transaction.

The configurable demo minimum is USD 25.00. Every quote deducts an explicit USD 5.00 switching fee; original cancellation and refund-processing costs are explicit zero during the free window. This is a fictional retail-difference refund policy, not agency production accounting.

| Offer / category | Replacement retail | Net traveller refund quote | Decision |
| --- | ---: | ---: | --- |
| DEMO_EQUIVALENT / same hotel, equivalent room | 540.00 | 55.00 | Approval required with initial preferences. Automatic eligible only after separate affirmative standing permission for current booking/preference version. |
| DEMO_DIFFERENT_ROOM / same hotel, Premier room | 520.00 | 75.00 | Specific approval required, even with standing equivalent permission. |
| DEMO_DIFFERENT_HOTEL / Example Garden Hotel | 510.00 | 85.00 | Specific approval required, even if every essential requirement matches. |
| DEMO_NON_REFUNDABLE / same equivalent room | 480.00 | 115.00 | Specific approval required for lost flexibility; explain that normal monitoring ends after replacement. Uncertain plans may support keeping the current booking. |
| DEMO_REVALIDATION_CHANGE / Premier room | 520.00 → 545.00 | 75.00 → 50.00 | Version 1 approval cannot approve version 2. Return changed price/refund to customer for renewed approval. |
| DEMO_UNKNOWN_CONDITION / bed unknown | 500.00 | 95.00 estimated from fixture quote | Block execution until bed evidence exists. A low price or specific approval cannot turn an unknown essential into a verified fact. |

“Automatic eligible” is a deterministic authorisation result, not fulfilment, savings secured or a completed refund. Gemini explains facts and tradeoffs; it does not calculate money, fill missing conditions, predict future prices or grant authority.

## Boundaries to demonstrate

- Exactly USD 25.00 net meets the demo minimum; USD 24.99 does not. A raised customer minimum wins over the agency minimum.
- A supplier cost decrease with unchanged retail price does not create a traveller refund. A missing fee is unknown, not zero.
- A USD retail total and EUR decision-relevant cancellation/refund amount cannot be subtracted in v1. No display currency assumption or research FX rate may make it eligible.
- Deleting breakfast from customer essentials still preserves the confirmed baseline breakfast requirement for automatic equivalence. A known loss requires specific approval; an unknown breakfast fact blocks execution.
- Same free-cancellation flag with an earlier deadline or higher penalty requires specific approval. Missing timezone, a malformed/gapped schedule or unknown penalty currency blocks execution.
- At 2026-11-10T09:59:59Z the original is still free; at 10:00:00Z the monitoring window has ended. The IANA display zone cannot change that instant.
- Offer selection, a chat acknowledgement, silence or T&C acceptance never grants permission. Standing permission false is a valid preference and needs no confirmation.
- Date/occupancy mismatch, unsupported multi-room/package booking, missing complete offer identity or an expired offer blocks execution.
- An expired/revoked approval or mismatched booking/preference/offer version cannot be reused. Renewed material facts receive a new version/fingerprint.

## Later simulation assertions

Use the shared decision process for a scheduled check and labelled advance-demo control. Preserve each stage: revalidate; secure replacement; verify fulfilment; cancel original; verify cancellation; then refund pending/completed. Repeated triggers share the same immutable operation intent and cannot produce another replacement or refund.

For uncertain cancellation, retain both booking references privately, record the attempted original cancellation and enter agency exception. Do not declare saving secured or refund complete. Reconcile the unknown effect before retrying; recovery continues after normal monitoring ends.

After an approved refundable switch, the replacement becomes the active baseline and monitoring uses its deadline if continued monitoring is enabled. Specific approval grants no future standing permission. A non-refundable replacement stops normal monitoring only after explicit approval and fulfilment; unresolved recovery work still continues.

## Verification trace

The fixture supplies three refundable categories plus non-refundable, revalidation-change, unknown-condition and cancellation-uncertainty scenarios. Each example traces to agreed plan §2 (single-room dates/occupancy), §5 (permission/equivalence), §6 (revalidation/order/refunds) and §8 (complete identifiers, conservative unknowns). Field-level fictional provenance and unresolved live mappings are recorded in [data-contract.md](data-contract.md). No current API behaviour or live fulfilment status was verified by these examples.
