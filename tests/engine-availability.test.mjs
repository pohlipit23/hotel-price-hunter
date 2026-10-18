import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { planCatalogueImport } from '../app/booking-storage.mjs';
import { altovoBaseline } from '../app/domain/altovo-quotation.mjs';
import { engineDropBundle, ENGINE_SEARCH_DEFAULTS } from '../app/domain/engine-availability.mjs';
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main as prepareCatalogue } from '../scripts/prepare-altovo-catalogue.mjs';
import { grandHyattProjection, siamKempinskiProjection } from './fixtures/altovo-catalogue.mjs';
import { engineAvailability, engineHotel, engineOffer, engineRates } from './fixtures/engine-rates.mjs';

// Siam Kempinski quotation: MYR 2335.52 retail for 17-18 Feb 2027.
const siam = () => altovoBaseline(siamKempinskiProjection());
const CHECKED_AT = '2026-10-20T00:00:00.000Z';
// The user's chosen engine: air1 staging. Production (mh1) stays supported but unused.
const SOURCE = 'easygds-core-engine-staging-air1'; const HOST = 'air1.stg-apps.easygds.com';
const FREE_THEN_CHARGED = [['2026-10-18T00:00:00', '2027-02-14T16:59:59', 0], ['2027-02-14T16:59:59', '2027-02-17T00:00:00', 403.29]];

test('engine offers cheaper than the quotation become up to three MYR Drops ranked by saving', () => {
  const rates = engineRates('3135840', [
    engineOffer({ id: 'a', room: 'Deluxe Room', total: 1998, tiers: FREE_THEN_CHARGED, images: [{ url: 'https://cdn.example.test/deluxe.jpg' }] }),
    engineOffer({ id: 'b', room: 'Premier Room', board: 'Room Only', total: 2100.5, nonRefundable: true, tiers: [['2026-10-18T00:00:00', '2027-02-17T00:00:00', 2100.5]],
      images: [{ url: 'http://cdn.example.test/insecure.jpg' }] }),
    engineOffer({ id: 'c', room: 'Executive Suite', total: 2400 }),
    engineOffer({ id: 'd', room: 'Deluxe Room', total: 2050, tiers: FREE_THEN_CHARGED }),
    engineOffer({ id: 'e', room: 'Club Room', total: 2200, currency: 'USD' }),
    engineOffer({ id: 'f', room: 'Studio', total: 2300, nonRefundable: true, isNonRefundable: false }),
    engineOffer({ id: 'g', room: 'Garden Room', total: 2250, tiers: [['2026-10-18T00:00:00', '2027-02-17T00:00:00', 500]] }),
  ]);
  const { bundle, imageSources, capture } = engineDropBundle(siam(), rates, { checkedAt: CHECKED_AT, source: SOURCE, host: HOST });
  assert.deepEqual(bundle.options.map(({ optionId, ...option }) => option), [
    { roomName: 'Deluxe Room', board: 'Breakfast', freeCancellation: true, cancellationDeadline: '2027-02-14T16:59:59.000Z', termsVerified: false,
      sourcePrice: { amount: '1998.00', currency: 'MYR' }, estimate: { totalMinor: 199800, currency: 'MYR', isEstimate: true, basis: 'engine-myr-total-before-final-pricing-and-fees' },
      indicativeDifferenceMinor: 33752 },
    { roomName: 'Premier Room', board: 'Room Only', freeCancellation: false, cancellationDeadline: null, termsVerified: false,
      sourcePrice: { amount: '2100.50', currency: 'MYR' }, estimate: { totalMinor: 210050, currency: 'MYR', isEstimate: true, basis: 'engine-myr-total-before-final-pricing-and-fees' },
      indicativeDifferenceMinor: 23502 },
    { roomName: 'Garden Room', board: 'Breakfast', freeCancellation: false, cancellationDeadline: null, termsVerified: false,
      sourcePrice: { amount: '2250.00', currency: 'MYR' }, estimate: { totalMinor: 225000, currency: 'MYR', isEstimate: true, basis: 'engine-myr-total-before-final-pricing-and-fees' },
      indicativeDifferenceMinor: 8552 },
  ]);
  assert.ok(bundle.options.every(option => /^option-[a-f0-9]{32}$/.test(option.optionId)));
  assert.deepEqual([bundle.checkedAt, bundle.completeness, bundle.transactionMode, bundle.customerRefund, bundle.reservationCreated],
    [CHECKED_AT, 'observed-options-only', 'selection-only', null, false]);
  assert.deepEqual(imageSources, { kind: 'remote-source-urls-pending-review', renderable: false, hotel: null,
    drops: bundle.options.map((option, index) => ({ optionId: option.optionId, url: index ? null : 'https://cdn.example.test/deluxe.jpg', caption: null })) });
  assert.deepEqual(capture, { status: 'observed', checkedAt: CHECKED_AT, offerCount: 7, optionCount: 3, searchDefaults: ENGINE_SEARCH_DEFAULTS,
    provenance: { source: SOURCE, host: HOST } });
  // One adult of the agency default age 30, X-Territory MY, MYR, and no nationality field sent.
  assert.deepEqual(ENGINE_SEARCH_DEFAULTS, { occupancy: 'agency-default-adults-only', adultAge: 30, adultAgeSource: 'agency-default',
    territory: 'MY', nationality: 'not-sent', currency: 'MYR', languageCode: 'en-US', source: 'agency-default' });
  assert.doesNotMatch(JSON.stringify(bundle), /contract-fixture|source-fixture|room-type-fixture|cdn\.example/);
});

const SIAM_CARD = { code: 'AIRB000180', order: 1, cityName: 'Bangkok', scenarioLabel: 'Free cancellation', photo: null };
const engineEntry = (offers = [engineOffer({ total: 1998, tiers: FREE_THEN_CHARGED })]) => {
  const { bundle, imageSources, capture } = engineDropBundle(siam(), engineRates('3135840', offers), { checkedAt: CHECKED_AT, source: SOURCE, host: HOST });
  return { code: 'AIRB000180', blocker: null, capture, bundle, imageSources };
};
const plan = entry => planCatalogueImport({ schemaVersion: 1, entries: [entry], cards: [SIAM_CARD] })[0];
const reason = fn => { try { fn(); } catch (error) { return error.code; } return null; };

test('the importer accepts an engine capture and records its engine provenance on every Drop', () => {
  const planned = plan(engineEntry());
  assert.equal(planned.captureStatus, 'observed');
  assert.deepEqual(planned.dropSet.capture, { status: 'observed', reason: null, capturedAt: CHECKED_AT, offerCount: 1,
    searchDefaults: ENGINE_SEARCH_DEFAULTS, provenance: { source: SOURCE, host: HOST } });
  assert.deepEqual(planned.drops.map(drop => [drop.facts.sourcePrice, drop.provenance]), [[{ amount: '1998.00', currency: 'MYR' },
    { source: SOURCE, host: HOST, searchDefaults: ENGINE_SEARCH_DEFAULTS }]]);
  const empty = plan(engineEntry([]));
  assert.deepEqual([empty.captureStatus, empty.drops], ['observed-empty', []]);
});

test('the importer refuses engine captures whose provenance, defaults or MYR amounts do not agree', () => {
  const tampered = {
    'gateway defaults on an engine capture': entry => { entry.capture.searchDefaults = { nationality: 'my', countryResidence: 'my', occupancy: 'agency-default-adults-only', source: 'agency-default' }; },
    'unknown engine host': entry => { entry.capture.provenance.host = 'engine.example.com'; },
    'production host under the staging source': entry => { entry.capture.provenance.host = 'mh1.apps.easygds.com'; },
    'another staging tenant': entry => { entry.capture.provenance.host = 'demo.stg-apps.easygds.com'; },
    'unknown source': entry => { entry.capture.provenance.source = 'somewhere-else'; },
    'extra provenance field': entry => { entry.capture.provenance.searchId = 'x'; },
  };
  for (const [name, patch] of Object.entries(tampered)) {
    const entry = engineEntry(); entry.capture = structuredClone(entry.capture); patch(entry);
    assert.equal(reason(() => plan(entry)), 'CAPTURE_MISMATCH', name);
  }
  // Option money: an engine MYR price must equal its own total; a MYR source price needs the engine basis.
  const rehash = entry => { const { privateReferences, snapshotVersion, ...view } = entry.bundle;
    entry.bundle.snapshotVersion = createHash('sha256').update(JSON.stringify(view)).digest('hex'); return entry; };
  const wrongAmount = engineEntry(); wrongAmount.bundle.options[0].sourcePrice.amount = '1990.00';
  assert.equal(reason(() => plan(rehash(wrongAmount))), 'BUNDLE_INVALID');
  const wrongBasis = engineEntry(); wrongBasis.bundle.options[0].estimate.basis = 'quotation-fx-before-final-pricing-and-fees';
  assert.equal(reason(() => plan(rehash(wrongBasis))), 'BUNDLE_INVALID');
});

// --- Owner-run preparation with --source=engine, against an injected engine only ---
// Staging keys as in the owner's file, including an app URL naming another tenant (ignored: air1 is pinned)
// and a production key (ignored by the staging profile).
const ENGINE_ENV = ['# comment line', 'EASYGDS_STG_EMAIL=owner@example.test\r', 'EASYGDS_STG_SECRET_KEY=fixture-secret', 'EASYGDS_STG_SCOPE_TYPE=System',
  'EASYGDS_STG_FLOW_TYPE=Basic', 'EASYGDS_STG_IAM_URL=https://iam.stg-services.easygds.com/api', 'EASYGDS_STG_APP_URL=https://demo.stg-apps.easygds.com/api',
  'EASYGDS_EMAIL=production@example.test', 'OTHER_KEY=ignored', ''].join('\n');
const PRODUCTION_ENV = ['EASYGDS_API_URL=https://mh1.apps.easygds.com/api\r', 'EASYGDS_IAM_URL=https://iam.services.easygds.com/api',
  'EASYGDS_EMAIL=owner@example.test', 'EASYGDS_PASSWORD=fixture-secret', 'EASYGDS_SCOPE_TYPE=System', 'EASYGDS_FLOW_TYPE=Basic', 'EASYGDS_TERRITORY=', ''].join('\n');
async function workspace(t, { env = ENGINE_ENV, projections = [grandHyattProjection(), siamKempinskiProjection()] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'roomdrop-engine-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.local', 'altovo-sample'), { recursive: true });
  for (const projection of projections) await writeFile(join(root, '.local', 'altovo-sample', `${projection.booking.code}.projection.json`), JSON.stringify(projection));
  await writeFile(join(root, '.local', 'engine.env'), env);
  return root;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// Records every request; `answers` maps a path to a list of responses consumed in order.
function fakeEngine(answers) {
  const calls = []; const queues = Object.fromEntries(Object.entries(answers).map(([path, list]) => [path, [...list]]));
  const fetchImpl = async (url, init) => {
    const u = new URL(url); calls.push({ origin: u.origin, path: u.pathname, search: u.search, method: init.method, headers: init.headers, body: JSON.parse(init.body) });
    const next = queues[u.pathname]?.shift(); if (!next) throw new Error(`unexpected call ${u.pathname}`);
    return next;
  };
  return { calls, fetchImpl };
}
const AUTH = '/api/auth'; const SEARCH = '/api/v2/products/hotels/availabilities'; const RATES = '/api/v2/products/hotels/availabilities/rates';
const authOk = () => json({ access_token: 'fixture-token', exp: 3600 });
const ENGINE_EXECUTE = ['--approved-codes=AIRB000179,AIRB000180', '--source=engine', '--engine-credentials-file=.local/engine.env', '--execute'];
const NOW = () => new Date(CHECKED_AT);
const prepare = (root, engine, sleeps = [], args = ENGINE_EXECUTE) => prepareCatalogue(args, { root, fetchImpl: engine.fetchImpl, now: NOW, env: {}, sleep: async ms => { sleeps.push(ms); } });
const catalogueFiles = async root => { try { return await readdir(join(root, '.local', 'altovo-catalogue')); } catch { return []; } };

test('engine preparation signs in once to air1 staging, re-posts the same search until complete, then reads that hotel\'s rates', async t => {
  const root = await workspace(t);
  const engine = fakeEngine({ [AUTH]: [authOk()],
    [SEARCH]: [json(engineAvailability({ total: 1 })), json(engineAvailability({ total: 1, hotels: [engineHotel('3135840', 'Siam Kempinski Hotel Bangkok')] }))],
    [RATES]: [json(engineRates('3135840', [engineOffer({ total: 1998, tiers: FREE_THEN_CHARGED, images: [{ url: 'https://cdn.example.test/deluxe.jpg' }] })]))] });
  const sleeps = [];
  const report = await prepare(root, engine, sleeps);
  assert.equal(report.status, 'prepared', report.reason);
  assert.deepEqual(engine.calls.map(call => [call.origin, call.path, call.method, call.search]), [
    ['https://iam.stg-services.easygds.com', AUTH, 'POST', ''], ['https://air1.stg-apps.easygds.com', SEARCH, 'POST', ''],
    ['https://air1.stg-apps.easygds.com', SEARCH, 'POST', ''], ['https://air1.stg-apps.easygds.com', RATES, 'POST', '']]);
  assert.deepEqual(engine.calls[0].body, { email: 'owner@example.test', secret_key: 'fixture-secret', scope_type: 'System', flow_type: 'Basic' });
  const search = { checkin_date: '2027-02-17', checkout_date: '2027-02-18', currency_code: 'MYR', language_code: 'en-US',
    rooms: [{ idx: 1, adults: [30], children: [], infants: [] }], hotel_ids: ['3135840'], timeout: 20000 };
  assert.deepEqual([engine.calls[1].body, engine.calls[2].body, engine.calls[3].body], [search, search, { search_id: 'search-fixture', hotel_id: '3135840' }]);
  for (const call of engine.calls.slice(1)) assert.deepEqual(call.headers, { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json;charset=UTF-8', Accept: 'application/json', 'X-Territory': 'MY' });
  assert.deepEqual(sleeps, [3000]);
  assert.deepEqual([report.source, report.engineProfile, report.engineHost], ['engine', 'staging-air1', 'air1.stg-apps.easygds.com']);
  assert.deepEqual(report.entries, [
    { code: 'AIRB000179', hotel: 'Grand Hyatt Kuala Lumpur', blocker: 'NON_REFUNDABLE', capture: 'not-searched', optionCount: 0, imageSources: { hotel: false, drops: 0 } },
    { code: 'AIRB000180', hotel: 'Siam Kempinski Hotel Bangkok', blocker: null, capture: 'observed', optionCount: 1, imageSources: { hotel: false, drops: 1 },
      engineHotelId: '3135840', engineHotelNameMatches: true, searchPosts: 2 }]);
  assert.doesNotMatch(JSON.stringify(report), /fixture-token|fixture-secret|owner@example|production@example|demo\.stg/);
  const written = JSON.parse(await readFile(report.privateCatalogue, 'utf8'));
  assert.doesNotMatch(JSON.stringify(written), /fixture-token|fixture-secret|owner@example|search-fixture/);
  const planned = planCatalogueImport({ schemaVersion: 1, entries: written.entries,
    cards: [{ ...SIAM_CARD, order: 2 }, { code: 'AIRB000179', order: 1, cityName: 'Kuala Lumpur', scenarioLabel: 'Non-refundable', photo: null }] });
  assert.deepEqual(planned.map(entry => entry.captureStatus), ['not-searched', 'observed']);
  assert.deepEqual(planned[1].drops[0].provenance, { source: 'easygds-core-engine-staging-air1', host: 'air1.stg-apps.easygds.com', searchDefaults: ENGINE_SEARCH_DEFAULTS });
});

test('a hotel name mismatch is reported per hotel, with no fallback search under another id', async t => {
  const engine = fakeEngine({ [AUTH]: [authOk()], [SEARCH]: [json(engineAvailability({ hotels: [engineHotel('3135840', 'Some Other Hotel')] }))],
    [RATES]: [json(engineRates('3135840', [engineOffer({ total: 1998 })]))] });
  const report = await prepare(await workspace(t), engine);
  assert.equal(report.status, 'prepared', report.reason);
  assert.deepEqual(report.entries.map(entry => [entry.code, entry.engineHotelId, entry.engineHotelNameMatches]), [['AIRB000179', undefined, undefined], ['AIRB000180', '3135840', false]]);
  assert.deepEqual(engine.calls.filter(call => call.path === SEARCH).map(call => call.body.hotel_ids), [['3135840']]);
});

test('the unused production profile still works when named explicitly', async t => {
  const engine = fakeEngine({ [AUTH]: [authOk()], [SEARCH]: [json(engineAvailability({ hotels: [engineHotel('3135840', 'Siam Kempinski Hotel Bangkok')] }))],
    [RATES]: [json(engineRates('3135840', [engineOffer({ total: 1998 })]))] });
  const report = await prepare(await workspace(t, { env: PRODUCTION_ENV }), engine, [], [...ENGINE_EXECUTE, '--engine-profile=production']);
  assert.equal(report.status, 'prepared', report.reason);
  assert.deepEqual([report.engineProfile, report.engineHost], ['production', 'mh1.apps.easygds.com']);
  assert.deepEqual(engine.calls.map(call => call.origin), ['https://iam.services.easygds.com', 'https://mh1.apps.easygds.com', 'https://mh1.apps.easygds.com']);
  const entry = JSON.parse(await readFile(report.privateCatalogue, 'utf8')).entries[1];
  assert.deepEqual(entry.capture.provenance, { source: 'easygds-core-engine-production', host: 'mh1.apps.easygds.com' });
  // Staging keys do not satisfy the production profile, and production keys do not satisfy staging.
  const refuse = { fetchImpl: async () => { throw new Error('No upstream call is allowed here.'); } };
  assert.equal((await prepare(await workspace(t), refuse, [], [...ENGINE_EXECUTE, '--engine-profile=production'])).reason, 'ENGINE_CREDENTIALS_REQUIRED');
  assert.equal((await prepare(await workspace(t, { env: PRODUCTION_ENV }), refuse)).reason, 'ENGINE_CREDENTIALS_REQUIRED');
});

test('a confirmed 0 of 0 engine search is an empty capture with no rates call; offers with nothing cheaper still count as observed', async t => {
  const empty = fakeEngine({ [AUTH]: [authOk()], [SEARCH]: [json(engineAvailability()), json(engineAvailability())] });
  const root = await workspace(t);
  const report = await prepare(root, empty);
  assert.equal(report.status, 'prepared', report.reason);
  assert.deepEqual(empty.calls.map(call => call.path), [AUTH, SEARCH, SEARCH]);
  const entry = JSON.parse(await readFile(report.privateCatalogue, 'utf8')).entries.find(item => item.code === 'AIRB000180');
  assert.deepEqual([entry.capture.status, entry.capture.offerCount, entry.bundle.options, entry.capture.provenance.source], ['observed-empty', 0, [], 'easygds-core-engine-staging-air1']);
  const dearer = fakeEngine({ [AUTH]: [authOk()], [SEARCH]: [json(engineAvailability({ hotels: [engineHotel('3135840', 'Siam Kempinski Hotel Bangkok')] }))],
    [RATES]: [json(engineRates('3135840', [engineOffer({ total: 2400 })]))] });
  const second = await prepare(await workspace(t), dearer);
  assert.deepEqual([second.entries[1].capture, second.entries[1].optionCount], ['observed', 0]);
});

test('a failed engine search publishes nothing: no retry, no second sign-in, and the failing code is named', async t => {
  const hotel = engineHotel('3135840', 'Siam Kempinski Hotel Bangkok');
  const cases = {
    ENGINE_HTTP_FAILED: { [AUTH]: [authOk()], [SEARCH]: [json({ message: 'Unauthorized' }, 401)] },
    ENGINE_AUTH_FAILED: { [AUTH]: [json({ message: 'locked' }, 403)] },
    ENGINE_SEARCH_INCOMPLETE: { [AUTH]: [authOk()], [SEARCH]: Array.from({ length: 4 }, () => json(engineAvailability({ total: 1 }))) },
    ENGINE_HOTEL_MAPPING_UNVERIFIED: { [AUTH]: [authOk()], [SEARCH]: [json(engineAvailability({ hotels: [engineHotel('999', 'Elsewhere')] }))] },
    ENGINE_RATES_INVALID: { [AUTH]: [authOk()], [SEARCH]: [json(engineAvailability({ hotels: [hotel] }))], [RATES]: [json({ id: '3135840', rooms: [] })] },
  };
  for (const [reason, answers] of Object.entries(cases)) {
    const root = await workspace(t); const engine = fakeEngine(answers); const sleeps = [];
    const report = await prepare(root, engine, sleeps);
    assert.deepEqual([report.status, report.reason, report.failedCode, report.privateCatalogue], ['blocked', reason, 'AIRB000180', undefined], reason);
    assert.equal(engine.calls.filter(call => call.path === AUTH).length, 1, reason);
    assert.deepEqual(await catalogueFiles(root), [], reason);
    assert.doesNotMatch(JSON.stringify(report), /fixture-token|fixture-secret|Unauthorized|\blocked\b|message/, reason);
    if (reason === 'ENGINE_SEARCH_INCOMPLETE') assert.deepEqual([engine.calls.filter(call => call.path === SEARCH).length, sleeps], [4, [3000, 3000, 3000]]);
  }
});

test('engine credentials come only from the named file, with the profile\'s fixed IAM URL and app host, checked before any call', async t => {
  const refuse = { fetchImpl: async () => { throw new Error('No upstream call is allowed here.'); } };
  const broken = {
    ENGINE_CREDENTIALS_REQUIRED: [ENGINE_ENV.replace('EASYGDS_STG_SECRET_KEY=fixture-secret', 'EASYGDS_STG_SECRET_KEY='), ENGINE_ENV.replace(/EASYGDS_STG_EMAIL=[^\n]*\n/, ''),
      ENGINE_ENV.replace(/EASYGDS_STG_IAM_URL=.*\n/, '')],
    ENGINE_CREDENTIALS_INVALID: [ENGINE_ENV.replace('https://iam.stg-services.easygds.com/api', 'https://iam.services.easygds.com/api'),
      `${ENGINE_ENV}EASYGDS_STG_EMAIL=second@example.test\n`, ENGINE_ENV.replace('EASYGDS_STG_FLOW_TYPE=Basic', 'EASYGDS_STG_FLOW_TYPE=Other')],
  };
  for (const [expected, files] of Object.entries(broken)) for (const [index, env] of files.entries()) {
    const report = await prepare(await workspace(t, { env }), refuse);
    assert.deepEqual([report.status, report.reason], ['blocked', expected], `${expected} #${index}`);
  }
  // Production: its API URL comes from the file, so only an https *.apps.easygds.com/api origin is accepted.
  for (const [index, env] of [PRODUCTION_ENV.replace('https://mh1.apps.easygds.com/api', 'https://mh1.apps.easygds.com.example.com/api'),
    PRODUCTION_ENV.replace('https://mh1.apps.easygds.com/api', 'http://mh1.apps.easygds.com/api'),
    PRODUCTION_ENV.replace('https://mh1.apps.easygds.com/api', 'https://air1.stg-apps.easygds.com/api')].entries()) {
    const report = await prepare(await workspace(t, { env }), refuse, [], [...ENGINE_EXECUTE, '--engine-profile=production']);
    assert.deepEqual([report.status, report.reason], ['blocked', 'ENGINE_HOST_NOT_ALLOWED'], `production #${index}`);
  }
  const root = await workspace(t);
  const without = await prepare(root, refuse, [], ['--approved-codes=AIRB000179,AIRB000180', '--source=engine', '--execute']);
  assert.equal(without.reason, 'ENGINE_CREDENTIALS_REQUIRED');
  for (const args of [[...ENGINE_EXECUTE, '--gateway-credentials-file=.local/engine.env'], ['--approved-codes=AIRB000180', '--source=elsewhere'],
    ['--approved-codes=AIRB000179,AIRB000180', '--engine-credentials-file=.local/engine.env', '--execute'],
    ['--approved-codes=AIRB000179,AIRB000180', '--engine-profile=staging-air1']]) {
    assert.equal((await prepare(root, refuse, [], args)).status, 'blocked', args.join(' '));
  }
  assert.equal((await prepare(root, refuse, [], [...ENGINE_EXECUTE, '--engine-profile=demo'])).reason, 'ENGINE_PROFILE_INVALID');
  const dry = await prepare(root, refuse, [], ['--approved-codes=AIRB000179,AIRB000180', '--source=engine']);
  assert.deepEqual([dry.mode, dry.status, dry.source, dry.engineProfile, dry.engineHost, dry.searchDefaults],
    ['dry-run', 'validated', 'engine', 'staging-air1', 'air1.stg-apps.easygds.com', ENGINE_SEARCH_DEFAULTS]);
  assert.deepEqual(dry.entries.map(entry => [entry.code, entry.plannedSearch, entry.engineHotelId]), [['AIRB000179', false, '5232813'], ['AIRB000180', true, '3135840']]);
});
