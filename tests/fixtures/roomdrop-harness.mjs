// Shared HTTP and Firestore-emulator harness for the Part 1 booking server tests.
// Emulator helpers touch only per-test `test-<uuid>-roomdrop` collections and delete them afterwards.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createBookingStorage, createRoomdropFirestore, planCatalogueImport } from '../../app/booking-storage.mjs';
import { createFirestoreSessionStorage } from '../../app/quotation-session-storage.mjs';

export const NOW = () => new Date('2026-10-20T00:00:00Z');
export const integration = { skip: !process.env.RUN_FIRESTORE_INTEGRATION };
export const curated = () => JSON.parse(readFileSync(new URL('./curated-bookings.json', import.meta.url), 'utf8'));
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

// A judge's browser: the catalogue read opens (or, given a cookie, restores) the session.
export async function visit(origin, { cookie: saved } = {}) {
  const response = await fetch(origin + '/api/booking-demo/catalogue', { headers: saved ? { Cookie: saved } : {} });
  const cookie = saved ?? response.headers.get('set-cookie')?.split(';')[0]; const list = await response.json();
  const get = async code => fetch(origin + '/api/booking-demo/q/' + code, { headers: { Cookie: cookie } });
  const post = (code, action, body, headers = {}) => fetch(`${origin}/api/booking-demo/q/${code}/${action}`, { method: 'POST',
    headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': list.csrfToken, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { cookie, list, get, post, response };
}

// Recomputes a prepared bundle's integrity hash after a test edits it, exactly as preparation does.
export function rehash(bundle) {
  const { schemaVersion, transactionMode, baseline, options, checkedAt, completeness, customerRefund, reservationCreated } = bundle;
  bundle.snapshotVersion = sha256(JSON.stringify({ schemaVersion, transactionMode, baseline, options, checkedAt, completeness, customerRefund, reservationCreated }));
  return bundle;
}

// Read-only stand-in with booking storage's read interface, built from the same import plan, for
// HTTP tests that run without the emulator. Tests only; production never has a memory catalogue.
export function plannedBookings(input = curated()) {
  const plan = planCatalogueImport(input); const records = new Map(plan.map(item => [item.code, item]));
  return {
    async listCatalogue() {
      return plan.map(item => ({ code: item.code, order: item.booking.card.order, contentVersion: item.contentVersion, dropSetVersion: item.dropSetVersion, card: item.booking.card }))
        .sort((a, b) => a.order - b.order);
    },
    async getBooking(code) {
      const item = records.get(code); if (!item) return null;
      const bundle = { schemaVersion: 1, snapshotVersion: item.contentVersion, transactionMode: 'selection-only', baseline: item.booking.baseline,
        options: item.drops.map(drop => drop.facts), checkedAt: item.dropSet.checkedAt, completeness: item.dropSet.completeness, customerRefund: null, reservationCreated: false };
      return { code, contentVersion: item.contentVersion, dropSetVersion: item.dropSetVersion, bundle, capture: { status: item.dropSet.capture.status, capturedAt: item.dropSet.capture.capturedAt } };
    },
  };
}

// Imports `input` into a fresh test prefix with the guarded importer and returns two clients.
// `storage(client, now)` gives the storage pair one app instance would hold.
export async function emulatorCatalogue(t, input = curated()) {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const first = await createRoomdropFirestore(process.env); const second = await createRoomdropFirestore(process.env);
  const prefix = `test-${randomUUID()}-roomdrop`;
  t.after(async () => {
    for (const name of ['BookingsV1', 'PublicSessionsV1', 'PublicSessionsV1Capacity']) await first.recursiveDelete(first.collection(prefix + name));
    await Promise.all([first.terminate(), second.terminate()]);
  });
  const report = await createBookingStorage({ firestore: first, prefix }).importBundle(input, { execute: true });
  const storage = (firestore, now = NOW) => ({ bookingStorage: createBookingStorage({ firestore, prefix }), sessionStorage: createFirestoreSessionStorage({ firestore, prefix, now }) });
  return { first, second, prefix, report, storage, versions: Object.fromEntries(report.entries.map(entry => [entry.code, entry])) };
}
