import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runHostedDemo } from './booking-cloud.mjs';
export { startHostedDemo as startHostedQuotationDemo } from './booking-cloud.mjs';

// Keep the historical entrypoint name on the same curated RoomDrop customer surface.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await runHostedDemo();
