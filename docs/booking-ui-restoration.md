# Restore the RoomDrop booking interface

The public customer experience uses the existing `booking.html`, `booking.css`
and `booking.js`, including the current compact booking ticket, three drop cards,
savings stamps, key-shaped buttons, comparison receipt and confirmation journey.
The live display controller calls the existing card, photo, amount, stamp and
fact-tile renderers. It does not introduce another visual design. Customer copy
uses booking language throughout.

The selected record is treated as the demo booking. The existing prepared source
snapshot still supplies its actual hotel, stay, occupancy, original price and
three observed room rates. A small presentation adapter supplies those facts to
the existing components. Estimated savings remain the original price minus the
converted source estimate; no final retail price, fee amount, verified room
equivalence, guaranteed refund or full cancellation equivalence is invented.

The distinct drop cards show the greatest estimated saving, an available option
with a free-cancellation flag, then the remaining observed option. This avoids
claiming a verified same-room match. Source cancellation flags are labelled for
review. Unknown/non-refundable flexibility requires explicit acknowledgement.
Confirmation uses the existing bounded session/CSRF/origin protections and stops
before any rebooking. Reload restores the same demo receipt. The original record
remains unchanged, and the server never creates a reservation, cancellation,
payment or refund. Automatic checks are visibly inactive.

`app/booking-demo-server.mjs` exposes only the fixed original UI assets, booking
API aliases and health routes. Existing selection/session handling remains the
backend; legacy presentation routes and transaction routes are unavailable.
`app/booking-cloud.mjs` and `Dockerfile.booking` retain the same bounded production
profile and Node-only image. `scripts/prepare-booking-release.mjs` exports an exact
commit's allowlisted files plus the sanitized display snapshot into an ignored,
hashed build context. The separate, unfinished AI integration is preserved in the
working tree and excluded from this release. Public access and the private agency
boundary remain the owner's approved deployment configuration.

Focused tests cover display calculations, currency mismatch, absence of invented
refund authority, original UI routes, private-field exclusion, denied transaction
routes and CSRF/origin-protected confirmation. Local browser acceptance covers
320/768/1440 pixels, real drop buttons and savings stamps, responsive geometry,
keyboard entry, cancellation acknowledgement, confirmation, reload and return
focus. Detailed local evidence is under `.local/restore-booking-ui/`.

## Published and verified

Published to https://hotel-price-hunter-2qbcpylngq-as.a.run.app/ on 17 October 2026.
Source: `0fcbbeb059140ece8536f909181978e19ae34067`.
Ready revision: `hotel-price-hunter-00013-dv9`, receiving 100% of traffic.
Image index: `sha256:dbcc7dfbb65a87723ea7748b0e800df865ccf0642d6d75387be98deb4b41979c`.
Runtime child: `sha256:fcb8c95c5c5899a8b27958f04ed95faada915d7235a706ce7096c31e1086a83f`.
Context SHA-256: `cbd838db31051d1edb9d4a54185251d82f466ec2b0a553307ade3cf5692ad212`.
Display snapshot SHA-256: `8fe12f79f9910d9ca9123ff2069d349f3e11909c1e1f36d9708539663fb5f6f4`.

The local regression passed 263 tests with six existing skips and zero failures.
The original six-width in-memory UI acceptance flow also passed. Focused HTTP and
display tests plus three-width browser acceptance passed against the exact frozen
source, excluding unrelated working-tree code. The image passed a read-only,
network-disabled container smoke including confirmation with no reservation or
record modification. Independent registry manifest/config bytes verified its
source/context/snapshot labels and default booking entry point. Isolated upload
credentials were removed and the global Docker configuration remained unchanged.

Live anonymous browser acceptance passed at 320, 768 and 1440 pixels: real drop
cards and saving stamps, review, cancellation acknowledgement, confirmation,
reload and return focus. No page/console errors or external requests occurred.
Customer text contained no source-record type terminology or fictional-record
labels. Mobile drop cards and review, and desktop drop cards, were visually
inspected. The displayed estimated savings are AED 217.55, AED 7.82 and AED 207.34.

Final cloud verification at 13:01 UTC confirmed the approved runtime digest,
ready revision/full traffic and anonymous HTTP 200 root/API/health. Only the image
and revision nonce differ in the customer service specification. Public access,
agency configuration/policies, project IAM, watch job, absent Scheduler and saved
data fingerprints are unchanged. The registry upload timestamp and Firestore's
moving retention timestamp/etag are the same documented observation exclusions.
The retained organization-IAM read limitation remains a scope limitation of the
metadata audit; public browser acceptance is recorded independently.

Release evidence and the previous image/configuration for recovery are under
`.local/booking-release-17b24688-3554-462c-91ed-f50be0b43ae4/`, including
`cloud-before.json`, `cloud-after.json`, `registry-result.json`,
`deployment-request.json`, `deployment-result.json` and `live-browser/result.json`.
Confirmation still creates no actual reservation, cancellation, payment or refund.

## Drop-card badge removal

The owner requested removal of the room-detail verification label. Source
`cae2b32f763b318793b064d8f680d86fb285e427` omits the unverified photo badge; review
details and all data/eligibility handling are unchanged. Published revision
`hotel-price-hunter-00014-p9g` receives full traffic. Image index:
`sha256:107c79148e2482bda21d411c4592aba0db0c7e8890f4244cc36773ada591bd36`.
Only the card script differs in the frozen context; the display snapshot and all
other packaged files are identical. Network-disabled container confirmation and
local/live 320/768/1440 browser checks passed, explicitly asserting zero photo
category badges and absence of the removed text. Savings, review, consent,
confirmation, reload and return focus still pass with no browser errors. Runtime
and public-access settings were preserved and the agency configuration is
unchanged. Evidence: `.local/booking-release-8bbfc97a-469e-44fd-90f5-ff9fef23d23d/`.
