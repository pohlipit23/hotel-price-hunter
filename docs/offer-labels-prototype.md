# Offer label and savings prototype

Three visual variants of the existing booking/results page, selected with
`?variant=ribbon`, `?variant=band` and `?variant=comparison`. A floating previous /
next selector keeps the choice shareable without resetting the simulated session.
This branch is a throwaway design reference, awaiting the user's choice.

All variants preserve RoomDrop branding, the booking-first layout, photographs,
hotel headings, exact USD 55 / 75 / 85 after-fee savings, cancellation labels and
selected-offer review/approval behavior. Explicit `Save USD …` labels distinguish
savings from new booking prices. The first result matches the booked room facts;
the second changes room type at the same hotel; the third changes hotel and does
not claim room equivalence. Labels use words as well as color.

- A: diagonal photograph ribbon plus a full relationship sentence in the body.
- B: a full-width category band above each horizontal photo card.
- C: an accent edge and explicit Hotel / Room comparison rows.

The separate phone-preview wrapper injects these assets into the existing frozen
customer page. Normal application HTML does not import them. Only the isolated
memory-backed fictional preview is affected; no cloud update is part of this work.
The existing simulated process remains manual. Customer-facing background
orchestration is a separate behavior change, not implemented by this prototype.

For a future customer flow, the recommendation is review and explicit approval
once, followed by background checks/progress. Material changes or uncertain
outcomes must still stop for appropriate customer/agency attention; pending refunds
must remain pending until settlement proof.

Choose or combine a label direction before integrating a production version.

Local isolated Chromium checks passed all three variants at 320, 375, 768 and
1280 pixels (12 combinations): exact savings, review amount/explicit approval,
no layout overflow, read-only variant switching and stable URL selection on reload.
No browser errors or external requests occurred. Mobile screenshots for all three
and the desktop ribbon were visually inspected. This is preview evidence, not a
cloud deployment or changed transaction behavior. Safe local evidence is under
`.local/offer-labels-qa/` in the main workspace.
