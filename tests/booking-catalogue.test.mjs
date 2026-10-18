import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { createQuotationDemoServer, createHostedQuotationDemoServer, deploymentCatalogue } from '../app/quotation-demo-server.mjs';
import { altovoCatalogueFixture, FIXTURE_CHECKED_AT } from './fixtures/altovo-catalogue.mjs';

const OPEN = 'AIRB000180'; const BLOCKED = 'AIRB000179';
async function app(t, { now = () => new Date('2026-10-20T00:00:00Z'), advisor } = {}) {
  const server = createBookingDemoServer({ catalogue: altovoCatalogueFixture(), now, advisor });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const visitor = async () => {
    const response = await fetch(origin + '/api/booking-demo/catalogue');
    const cookie = response.headers.get('set-cookie').split(';')[0]; const list = await response.json();
    const get = async code => fetch(origin + '/api/booking-demo/q/' + code, { headers: { Cookie: cookie } });
    const post = (code, action, body, headers = {}) => fetch(`${origin}/api/booking-demo/q/${code}/${action}`, { method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': list.csrfToken, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { cookie, list, get, post };
  };
  return { origin, visitor };
}
const snapshotOf = code => altovoCatalogueFixture().entries.find(entry => entry.code === code).bundle.snapshotVersion;
const arm = (minimumSavingMinor, code = OPEN) => ({ snapshotVersion: snapshotOf(code), consent: true, minimumSavingMinor });

test('catalogue lists public booking facts with blockers and tags derived at request time', async t => {
  const { origin, visitor } = await app(t);
  const { list } = await visitor();
  assert.equal(typeof list.csrfToken, 'string');
  assert.doesNotMatch(JSON.stringify(list), /FIXTURE-PRIVATE|privateReferences|rateDetail/);
  const open = list.entries.find(entry => entry.code === OPEN); const blocked = list.entries.find(entry => entry.code === BLOCKED);
  assert.deepEqual({ blocker: open.blocker, tag: open.tag, optionCount: open.optionCount, freeUntil: open.cancellation.freeUntil },
    { blocker: null, tag: 'ready', optionCount: 3, freeUntil: '2027-02-14T16:58:59.000Z' });
  assert.equal(open.hotel.name, 'Siam Kempinski Hotel Bangkok'); assert.deepEqual(open.quotedRetail, { totalMinor: 233552, currency: 'MYR' });
  assert.deepEqual({ blocker: blocked.blocker, tag: blocked.tag, nonRefundable: blocked.cancellation.nonRefundable }, { blocker: 'NON_REFUNDABLE', tag: 'cannot-start', nonRefundable: true });
  const root = await (await fetch(origin)).text();
  assert.match(root, /data-booking-mode="catalogue"/); assert.doesNotMatch(root, /quotation|quote-|fonts.googleapis/i);
  for (const path of ['/api/booking-demo', '/api/booking-demo/confirm', '/api/booking-demo/catalogue?code=X', '/api/booking-demo/q/AIRB000180?x=1', '/drop-watch.js?x'])
    assert.ok([400, 404].includes((await fetch(origin + path)).status), path);
  assert.equal((await fetch(origin + '/drop-watch.js')).status, 200); assert.equal((await fetch(origin + '/booking-judge.js')).status, 200);
});

test('closing-soon and ended windows come from the injected clock', async t => {
  const soon = await app(t, { now: () => new Date('2027-02-05T00:00:00Z') });
  assert.equal((await soon.visitor()).list.entries.find(entry => entry.code === OPEN).tag, 'closing-soon');
  const ended = await app(t, { now: () => new Date('2027-02-15T00:00:00Z') });
  const entry = (await ended.visitor()).list.entries.find(item => item.code === OPEN);
  assert.deepEqual([entry.blocker, entry.tag], ['FREE_CANCELLATION_ENDED', 'cannot-start']);
});

test('per-code read returns the public bundle for that code only; unknown codes are 404', async t => {
  const { visitor } = await app(t);
  const v = await visitor();
  const data = await (await v.get(OPEN)).json();
  assert.equal(data.code, OPEN); assert.equal(data.baseline.quotationCode, OPEN); assert.equal(data.options.length, 3);
  assert.equal(data.csrfToken, v.list.csrfToken); assert.equal(data.watch, null); assert.equal(data.confirmation, null);
  assert.equal(data.blocker, null); assert.equal(data.agencyMinimumSavingMinor, 1000); assert.equal(data.checkedAt, FIXTURE_CHECKED_AT);
  assert.doesNotMatch(JSON.stringify(data), /FIXTURE-PRIVATE|privateReferences|rateDetail|sourceId/);
  assert.equal((await (await v.get(BLOCKED)).json()).blocker, 'NON_REFUNDABLE');
  for (const code of ['AIRB999999', 'airb000180', 'AIRB000180/extra']) assert.equal((await v.get(code)).status, 404, code);
  assert.equal((await v.post('AIRB999999', 'watch', arm(5000))).status, 404);
});

test('arming a Drop Watch needs consent, a minimum at or above the agency floor, a current snapshot and an open booking', async t => {
  const { origin, visitor } = await app(t);
  const v = await visitor();
  const expectError = async (response, status, code) => { assert.equal(response.status, status); assert.equal((await response.json()).error.code, code); };
  await expectError(await v.post(OPEN, 'watch', { ...arm(5000), consent: false }), 400, 'WATCH_CONSENT_REQUIRED');
  await expectError(await v.post(OPEN, 'watch', { snapshotVersion: snapshotOf(OPEN), minimumSavingMinor: 5000 }), 400, 'WATCH_CONSENT_REQUIRED');
  await expectError(await v.post(OPEN, 'watch', arm(999)), 400, 'MINIMUM_SAVING_INVALID');
  await expectError(await v.post(OPEN, 'watch', arm(1500.5)), 400, 'MINIMUM_SAVING_INVALID');
  await expectError(await v.post(OPEN, 'watch', arm('5000')), 400, 'MINIMUM_SAVING_INVALID');
  await expectError(await v.post(OPEN, 'watch', { ...arm(5000), email: 'x' }), 400, 'INVALID_WATCH');
  await expectError(await v.post(OPEN, 'watch', { ...arm(5000), snapshotVersion: 'old' }), 409, 'SNAPSHOT_CHANGED');
  assert.equal((await v.post(OPEN, 'watch', arm(5000), { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await v.post(OPEN, 'watch', arm(5000), { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await v.post(OPEN, 'watch', arm(5000), { 'Content-Type': 'text/plain' })).status, 400);
  assert.equal((await fetch(origin + '/api/booking-demo/q/' + OPEN + '/watch', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(arm(5000)) })).status, 403);
  const blocked = await v.post(BLOCKED, 'watch', arm(5000, BLOCKED));
  assert.equal(blocked.status, 409); assert.deepEqual((({ code, reason }) => ({ code, reason }))((await blocked.json()).error), { code: 'WATCH_CANNOT_START', reason: 'NON_REFUNDABLE' });
  assert.equal((await (await v.get(OPEN)).json()).watch, null);

  const armed = await (await v.post(OPEN, 'watch', arm(5000))).json();
  assert.equal(armed.watch.minimumSavingMinor, 5000); assert.equal(armed.watch.armedAt, '2026-10-20T00:00:00.000Z');
  assert.deepEqual(armed.watch.firstCheck, { replayed: true, checkedAt: FIXTURE_CHECKED_AT, dropOptionIds: ['option-fixture-final-deluxe', 'option-fixture-flex-premier'] });
  assert.deepEqual(armed.dropOptionIds, ['option-fixture-final-deluxe', 'option-fixture-flex-premier']);
  assert.deepEqual((await (await v.get(OPEN)).json()).watch, armed.watch);
  assert.deepEqual((await (await v.post(OPEN, 'watch', arm(25000))).json()).dropOptionIds, []);
  assert.deepEqual((await (await v.post(OPEN, 'watch', arm(1000))).json()).dropOptionIds.length, 3);
  assert.equal((await (await v.get(OPEN)).json()).watch.minimumSavingMinor, 1000);
});

test('confirmation needs an armed Drop Watch and a Drop that watch found', async t => {
  const { visitor } = await app(t);
  const v = await visitor();
  const confirm = optionId => v.post(OPEN, 'confirm', { optionId, snapshotVersion: snapshotOf(OPEN), acceptedDemoOnly: true });
  const before = await confirm('option-fixture-flex-premier');
  assert.equal(before.status, 409); assert.equal((await before.json()).error.code, 'WATCH_NOT_ARMED');
  await v.post(OPEN, 'watch', arm(5000));
  assert.equal((await confirm('option-fixture-flex-suite')).status, 404);
  assert.equal((await v.post(OPEN, 'confirm', { optionId: 'option-fixture-final-deluxe', snapshotVersion: snapshotOf(OPEN), acceptedDemoOnly: true })).status, 400);
  const result = await (await confirm('option-fixture-flex-premier')).json();
  assert.equal(result.confirmation.optionId, 'option-fixture-flex-premier');
  assert.equal(result.confirmation.reservationCreated, false); assert.equal(result.confirmation.quoteModified, false); assert.equal(result.confirmation.customerRefund, null);
  assert.deepEqual((await (await v.get(OPEN)).json()).confirmation, result.confirmation);
  assert.equal((await v.post(BLOCKED, 'confirm', { optionId: 'option-fixture-flex-premier', snapshotVersion: snapshotOf(BLOCKED), acceptedDemoOnly: true })).status, 409);
});

test('watches and confirmations are isolated per code and per session', async t => {
  const { visitor } = await app(t);
  const a = await visitor(); const b = await visitor();
  await a.post(OPEN, 'watch', arm(1000));
  await a.post(OPEN, 'confirm', { optionId: 'option-fixture-flex-premier', snapshotVersion: snapshotOf(OPEN), acceptedDemoOnly: true });
  const mine = await (await a.get(OPEN)).json();
  assert.equal(mine.watch.minimumSavingMinor, 1000); assert.equal(mine.confirmation.optionId, 'option-fixture-flex-premier');
  const other = await (await a.get(BLOCKED)).json(); assert.equal(other.watch, null); assert.equal(other.confirmation, null);
  const theirs = await (await b.get(OPEN)).json(); assert.equal(theirs.watch, null); assert.equal(theirs.confirmation, null);
  assert.notEqual(a.list.csrfToken, b.list.csrfToken);
  assert.equal((await b.post(OPEN, 'watch', arm(1000), { 'X-CSRF-Token': a.list.csrfToken })).status, 403);
});

test('catalogue chat is scoped to the code and its armed Drops', async t => {
  const calls = [];
  const advisor = { available: true, status: 'test-injected', chat: async input => { calls.push(input); return { reply: 'Test reply' }; } };
  const { visitor } = await app(t, { advisor });
  const v = await visitor();
  await v.post(OPEN, 'watch', arm(5000));
  const ok = await v.post(OPEN, 'chat', { snapshotVersion: snapshotOf(OPEN), pageContext: 'drops-overview', intent: 'opening' });
  assert.equal(ok.status, 200);
  assert.deepEqual(calls[0].options.map(option => option.optionId), ['option-fixture-final-deluxe', 'option-fixture-flex-premier']);
  assert.equal(calls[0].baseline.quotationCode, OPEN);
  assert.equal((await v.post(OPEN, 'chat', { snapshotVersion: snapshotOf(OPEN), pageContext: 'drop-detail', optionId: 'option-fixture-flex-suite', intent: 'opening' })).status, 404);
  assert.equal((await v.post(OPEN, 'chat', { snapshotVersion: snapshotOf(BLOCKED), pageContext: 'drops-overview', intent: 'opening' })).status, 409);
});

test('hosted catalogue strips private references and refuses private keys, mismatched codes and mixed inputs', async t => {
  const environment = { NODE_ENV: 'production', K_SERVICE: 'hotel-price-hunter', GOOGLE_CLOUD_PROJECT: 'sincere-apex-511418-p0', APP_SURFACE: 'customer', APP_ORIGIN: 'https://hotel-price-hunter-2qbcpylngq-as.a.run.app' };
  const catalogue = deploymentCatalogue(altovoCatalogueFixture());
  assert.deepEqual(catalogue.map(entry => entry.code), [OPEN, BLOCKED]);
  assert.doesNotMatch(JSON.stringify(catalogue), /FIXTURE-PRIVATE|privateReferences|rateDetail|blocker/);
  const withKey = structuredClone(catalogue); withKey[0].snapshot.baseline.guestName = 'x';
  assert.throws(() => createHostedQuotationDemoServer({ catalogue: withKey, environment }));
  const nested = structuredClone(catalogue); nested[1].snapshot.baseline.cancellation.contactEmail = 'x';
  assert.throws(() => createHostedQuotationDemoServer({ catalogue: nested, environment }));
  const mismatch = structuredClone(catalogue); mismatch[0].code = 'AIRB000999';
  assert.throws(() => createHostedQuotationDemoServer({ catalogue: mismatch, environment }));
  assert.throws(() => createHostedQuotationDemoServer({ catalogue: [...catalogue, catalogue[0]], environment }));
  assert.throws(() => createHostedQuotationDemoServer({ catalogue: [{ ...catalogue[0], blocker: null }], environment }));
  assert.throws(() => createHostedQuotationDemoServer({ catalogue, snapshot: catalogue[0].snapshot, environment }));
  assert.throws(() => createHostedQuotationDemoServer({ catalogue: altovoCatalogueFixture().entries.map(({ code, bundle }) => ({ code, snapshot: bundle })), environment }));
  assert.throws(() => createQuotationDemoServer({ catalogue: { schemaVersion: 1, entries: [{ code: 'AIRB000999', bundle: altovoCatalogueFixture().entries[0].bundle }] } }));

  const server = createBookingDemoServer({ catalogue, environment, now: () => new Date('2026-10-20T00:00:00Z') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const host = new URL(environment.APP_ORIGIN).host;
  const body = await new Promise((resolve, reject) => {
    const req = request(`http://127.0.0.1:${server.address().port}/api/booking-demo/catalogue`, { headers: { Host: host } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, cookie: res.headers['set-cookie']?.[0], json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    }); req.on('error', reject); req.end();
  });
  assert.equal(body.status, 200); assert.match(body.cookie, /; Secure/); assert.equal(body.json.entries.length, 2);
});
