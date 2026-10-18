# Shared Gemini support chat

The approved customer UI keeps RoomDrop's ticket cards and saving stamps, with lighter typography and a shorter confirmation button. A floating Ask Gemini button opens a corner dialog on desktop and full-screen chat on mobile. The compact inline widget shows the latest reply and shares its draft and conversation with the dialog.

The [approved prompts and agent instructions](https://chatgpt.com/space/page_adab7719730481919b5bf86fe00e8122) are copied into `app/prompts/stay-chat.txt` and `app/prompts/stay-chat-opening.txt`. The existing selected-quotation adviser remains available separately.

## Context and requests

`POST /api/booking-demo/chat` uses the existing visitor session, exact origin, CSRF token and snapshot version. Its JSON body contains `pageContext` (`drops-overview` or `drop-detail`), `intent` (`opening` or `question`), and `snapshotVersion`. Detail requests require `optionId`; questions require a message of up to 1,200 characters. Opening requests use the server-owned template and reject caller-supplied message text. Caller-supplied facts and history are rejected.

The server derives overview context from the same eligibility rule as the displayed cards. Detail context contains only the selected displayed drop and starting option. Shared server history retains four completed exchanges; replies from another page, drop or snapshot are excluded from model context. The UI keeps at most 40 turns in memory and marks their comparison context. Neither transcript survives a full reload or creates durable chat storage.

Opening guidance is requested on customer engagement, never page load, widget mount or navigation. Successful openings are cached per scope, selected drop and snapshot. Both surfaces share one in-flight request. Navigation aborts the client request and discards late responses; a cancelled or failed opening is not a successful cached answer. Reopening a completed conversation adds no generation. Selecting a suggested question fills the composer without submitting it.

The existing four-per-visitor/minute, twenty-per-instance/minute and two-concurrent-call limits are shared with legacy advice. Provider timeout remains twenty seconds with no automatic retries. No booking, cancellation, payment, refund, consent or monitoring authority is added.

## Response boundary

Gemini chooses a recommendation, grounded reasons and combinations of concise support phrases for the current comparison. The schema restricts text segments to server-owned `availablePhrases`, fact references to `availableFacts`, and the optional priority question to `availableQuestions`. The server validates the result and limits the final rendered reply to three statements, 70 words and one question. Statements are joined as flowing sentences: the fees caveat is said once, a difference that follows its estimate reads "That's ...", and repeated statements are dropped. This prevents arbitrary prose from claiming a completed booking, a refund or an invented monetary amount. It also avoids a currency-word blacklist rejecting ordinary words such as “all” and “try”.

On the wire, each segment is `{id}` referencing the combined `availableStatements` map. Short IDs keep literal support text out of schema enums and remove ambiguous text/fact pairings. The schema enumerates current drop and reason IDs, explains their recommendation relationship, and requires empty arrays when there are no displayed drops. The application still validates the expanded 70-word limit. See the [Google structured output guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output) for the provider contract.

Context-specific phrases weigh the lower estimate against cancellation flexibility and room or meal details that still need checking. The approved prompt directs the model to help choose using relevant pros and cons, rather than explain labels or repeat the page. Financial statements use application-formatted amount/currency pairs; cancellation flags do not become complete policies and room or meal labels do not prove equivalence.

Invalid output, timeout, session expiry, provider failure and rate limits remain visible and do not alter a room choice. Inline failure status stays visible even when an earlier reply exists.

## Local verification

18 October 2026, Asia/Kuala_Lumpur. No deployment or live model call was performed for this change.

- Final normal-host Node suite: **291 passed, zero failures, six existing Firestore-emulator integration tests skipped**, 297 total. Evidence: `.local/chat-ui/unit-final.tap`. The sandbox run's five temporary-file failures passed on the normal Windows host; their production code was unchanged.
- New chat tests: **27 passed**. They cover current-page scope, hidden-option exclusion, session/CSRF/origin/snapshot guards, privacy/history bounds, rates/concurrency, immutable confirmations, canonical money facts, invalid references and arbitrary financial/state prose rejection.
- Supported-browser UI checks with a visibly labelled injected provider: **36 assertions** and **15 geometry samples**, including overview/detail, shared drafts and transcript, error visibility, cached reopening, unchecked cancellation consent, keyboard focus, Escape/return focus, navigation while a response is pending, 320/390/768/1024/1440px layouts, launcher clearance and a reduced mobile viewport. Evidence: `.local/chat-ui/browser-checks.json` and viewport screenshots in that directory.
- Independent review findings about packaging, invisible options, prose claims, ordinary currency words, inline errors and meal-label semantics were addressed. Both release allowlists include the new chat helper, prompts and shared eligibility module.

The UI and server paths are verified locally with injected responses. The new structured response schema still needs a separately authorised, bounded real-Gemini semantic check before release. The existing live-call allowances are not reused. Runtime identity, service settings, private agency/watch services and production data were not changed.
