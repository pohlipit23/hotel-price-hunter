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

1. Edit `src/pitch.html`.
2. Run `npm run build` to regenerate the Worker HTML.
3. Copy `.dev.vars.example` to `.dev.vars` and set local credentials.
4. Run `npx wrangler dev`.

## Deploy to Cloudflare Workers

Run `npx wrangler secret put PITCH_USERNAME` and `npx wrangler secret put PITCH_PASSWORD`, then `npx wrangler deploy`.

Credentials are runtime secrets. Do not commit `.dev.vars` or real passwords. The server refuses access if credentials are not configured.

Existing hosted demo: https://hotel-price-hunter-pitch.clear-olm-9015.chatgpt.site
