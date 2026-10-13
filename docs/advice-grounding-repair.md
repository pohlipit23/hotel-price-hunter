# Grounded advice semantic repair

Prepared **14 October 2026, Asia/Kuala_Lumpur**, in the isolated source snapshot. Original live generation budget is exhausted **3/3**. This repair uses **zero additional live calls**. After fresh independent review and coordinator approval it was privately deployed as revision `hotel-price-hunter-00006-hfm`; post-repair live generation remains unapproved and unverified.

The actual private responses in canonical `.local/private-cloud-model-result.json` passed technical checks but failed semantic review: non-refundable monitoring was incorrectly described as preference-dependent; a blocked unknown-bed offer displayed `9500 USD` instead of hypothetical **USD 95.00**. The equivalent response's USD 60 difference minus USD 5 fee = USD 55 was correct. The exact three old advice objects remain verbatim offline replay fixtures; all are now rejected by the revised internal protocol instead of allowing any legacy free prose into the client.

## Final bounded contract

Gemini receives canonical booking/offer/preference/decision facts, explicit role-bound monetary values and monitoring rules. It interprets the question and returns only **`{recommendation,reasonCodes}`**, choosing one to three distinct factors from the offer-specific allowed catalogue. Examples: refund-costs, retain-flexibility, different-room/hotel, verified-equivalent, unknown-essential, below-minimum, expired-cancellation, essential-mismatch, checked-snapshot. Each factor is allowed only when the supplied identity/category/conditions or actual decision reasons substantiate it.

The response JSON schema contains only those two internal fields and an actual allowed-code enum. Exact-key parsing rejects arbitrary prose, old four-field model replies, extra financial/authority flags, unknown/ungrounded/duplicate factors and a consider-offer recommendation for a blocked decision. There is **no arbitrary model text in any visible field** and no state-synonym filter. The model still chooses relevance and recommendation; the application maps selected codes to trusted phrases.

The **external client API remains exactly `summary`, `recommendation`, `tradeoffs`, `uncertainties`**. App-owned monetary explanation occupies tradeoff zero, monitoring consequence tradeoff one, and selected trusted rationale phrases tradeoff two. The list limit cannot hide core facts. No UI or consent/booking/refund authority changed.

The server explicitly passes canonical `{code,minorUnit}` currency from the fixture. The adapter validates currency/precision and retail pairing before generation, formats safe minor integers using BigInt division/remainder, and supplies role/provenance for original/replacement totals, gross difference, cancellation/switch/refund-processing costs and net refund. A positive refund claim requires the same verified quote/retail/currency/cost arithmetic and application decision. Numbers are never accepted merely because they appear in another financial role; wrong fee USD 55/refund USD 5 or EUR 9500 cannot be emitted by this model protocol.

Blocked advice is app-controlled keep-booking. Actual minimum, expired-window and known-mismatch blocks get truthful reason-specific summaries; other blocks get a neutral switching-requirements summary. The unknown-bed explanation requires both the actual unknown-essential reason and a null offer bed that is a saved essential requirement. Known hypothetical USD 95 is labelled arithmetic only, blocked and **not secured**. No switch/refund has occurred.

An approved successful **non-refundable replacement becoming active** ends **normal** monitoring regardless of continued-monitoring preference; required recovery work continues. Comparing or approving alone changes nothing. Verified refundable replacements follow their replacement deadline only when continued monitoring is on; otherwise normal monitoring ends. Expired/unknown policies do not create a verified new cycle. These sentences are deterministic application rules, not model assertions.

## Offline proof and limits

Initial red replays reproduced the old wrong monitoring/USD 9500, role-swapped money, missing precision and blocked-recommendation behaviour. Independent review then found unsupported reimbursement/authority prose and false unknown-facts explanations for known threshold/deadline/mismatch blocks. Those were reproduced before the root-authorised factor protocol replaced free prose; the final contract removes the underlying free-text authority path.

`node --test tests/gemini.test.mjs tests/server.test.mjs`: **29 passed, zero failed, one explicitly skipped emulator integration**. Fake providers/local HTTP only; no live Gemini or production mutation. Coverage includes:

- Exact three legacy actual advice objects rejected, including the previously valid financial prose.
- New valid factors produce USD 55/5/60, non-refundable end for both preference values, and blocked hypothetical USD 95/keep-booking.
- Arbitrary reimbursement/disbursement/permission text, future-price factors, extra authority flags and wrong-role/wrong-currency payloads rejected.
- Actual per-offer factor gates; contradictory blocked recommendation, duplicates/unknown codes and excess factor count rejected.
- Mandatory money/monitoring slots, explicit precision, safe-integer formatting, unknown switch fee and adversarial user question.
- Truthful threshold, expired deadline and known essential mismatch; refundable preferences/deadline.
- Existing no-tools, provider failure, timeout, privacy exclusion, server origin/CSRF and stale-confirmation persistence checks.

SDK output cap **800**, deadline **20 seconds**, provider retry attempts **1**, visitor limit, selection persistence and public response shape remain unchanged. No automatic regeneration or pretend live fallback. Existing raw supplier identity/cost/token exclusion remains.

Changed isolated files: `app/gemini.mjs`, `app/prompts/advice.txt`, `tests/gemini.test.mjs`; `app/server.mjs` adds only the canonical currency argument while preserving the earlier `/health` alias. Main city-layout UI/domain/package/presentation test are untouched. Source stays `9c98ede` plus reviewed health and semantic repairs.

Fresh independent review approved the candidate (29 passed, zero failed, one explicit emulator skip; blocked-recommendation mutation caught; frozen UI/domain/package/fixture boundary verified). The coordinator approved the necessary private repair, then immutable tag **`milestone-20261013-advice`** was uploaded/deployed. Index `sha256:f6cf23de9be7c44cb419263441c29761efa71c5f923a9bea8aed33c3a5f2433d` has one Linux/AMD64 child `sha256:d033885504ac7493d0c3d1f65c06e23f1184a390d19925b3e61e61c05d66375c`, independently byte-hash/descriptor-verified against Ready revision `hotel-price-hunter-00006-hfm`. Origin/SA/limits/private invocation remain unchanged; original images remain. Additional live validation requires new explicit bounded user approval because the original three calls are spent. No post-repair live semantic pass is claimed.
