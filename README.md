# Hotel Price Hunter

Mobile-first prototype for comparing an existing hotel booking with cheaper or better alternatives until its free-cancellation deadline.

## Prototype

- Current reservation as the comparison baseline.
- Same hotel and room, other rooms at the same hotel, and other hotels.
- Total price, net saving, room differences and cancellation conditions.
- Comparison sheet and simulated offer selection.
- Shared username/password checked on the server.

All hotels, rates and notification behaviour are illustrative. There are no live Altovo or Gemini integrations, transactions or notifications. Hotel photography is externally hosted and credited in the interface.

## Edit and run

Requires Node.js 22 or later.

1. Edit files in `src/` (`pitch.html` is the original; `keep.html`, `ledger.html` and `rooms.html` are full restyles; `login-*.html` are the matching sign-in screens).
2. Run `npm run build` to regenerate the Worker HTML.
3. Copy `.dev.vars.example` to `.dev.vars` and set local credentials.
4. Run `npx wrangler dev`.

After sign-in, use the **Compare designs** bar or open:

| Route | Version |
| --- | --- |
| `/` | Original (booking-changes) |
| `/keep` | Quiet concierge — photo of the held stay, list of changes, thumb bar |
| `/ledger` | Savings-first ledger of today’s checks and finds |
| `/rooms` | One-thumb swipe across the three rooms |

Unauthenticated visits to those routes show the matching login screen. The original layout is unchanged aside from the comparison bar.

You can also open the HTML files in `src/` directly, or serve them with `python3 -m http.server`.

## Deploy to Cloudflare Workers

Run `npx wrangler secret put PITCH_USERNAME` and `npx wrangler secret put PITCH_PASSWORD`, then `npx wrangler deploy`.

Credentials are runtime secrets. Do not commit `.dev.vars` or real passwords. The server refuses access if credentials are not configured.

Existing hosted demo: https://hotel-price-hunter-pitch.clear-olm-9015.chatgpt.site

## Design alternatives

Live restyles ship with the Worker (see routes above). Older standalone snapshots remain in [designs/](designs/README.md): Travel journal, Clean comparison, and Booking changes. The original hosted prototype still uses Booking changes.
