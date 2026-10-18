import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runHostedDemo } from './booking-cloud.mjs';
import { createHostedQuotationDemoServer } from './quotation-demo-server.mjs';

// Both hosted surfaces share the same Firestore-only startup and shutdown boundary.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await runHostedDemo({ serverFactory: createHostedQuotationDemoServer });
