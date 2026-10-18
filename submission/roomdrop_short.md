# RoomDrop - brief description

RoomDrop lets travellers book a hotel early and still catch the drop. It re-shops the same stay and shows "drops": cheaper rooms at the same hotel and dates, each with a saving stamp and its cancellation and refund caveats. Travellers peek at a drop, ask Gemini about it, acknowledge any lost flexibility and confirm. Agencies can use the same engine to re-shop held bookings, cut supplier cost and raise margin.

The Node.js app runs on **Cloud Run** (asia-southeast1) with a private IAP-protected agency service and a price-watch Cloud Run Job. **Gemini 3.8 Flash on Vertex AI** powers the chat and drop adviser, with schema-bound JSON replies that the server validates against the facts on screen. **Cloud Firestore** stores bookings, drops, Drop Watch consent, sessions and agency cases, using transactions and TTL. **Firebase** is used only for its emulator configuration, to run Firestore locally for development and tests.
