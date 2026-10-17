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

Release and live verification results are recorded after deployment.
