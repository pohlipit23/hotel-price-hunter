import test from 'node:test';
import assert from 'node:assert/strict';
import { altovoBaseline, watchBlocker } from '../app/domain/altovo-quotation.mjs';
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main as prepareCatalogue, parseContrasts } from '../scripts/prepare-altovo-catalogue.mjs';
import { deploymentCatalogue } from '../app/quotation-demo-server.mjs';
import { grandHyattProjection, siamKempinskiProjection } from './fixtures/altovo-catalogue.mjs';

// Sanitised projections only: the fixture builders copy allowlisted facts, never tokens or supplier ids.
const at = value => new Date(value);
const code = fn => { try { fn(); } catch (error) { return error.code; } return null; };

// A throwaway workspace with its own ignored .local folder, so tests never touch real captures.
async function workspace(t, projections = [grandHyattProjection(), siamKempinskiProjection()]) {
  const root = await mkdtemp(join(tmpdir(), 'roomdrop-catalogue-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.local', 'altovo-sample'), { recursive: true });
  for (const projection of projections) await writeFile(join(root, '.local', 'altovo-sample', `${projection.booking.code}.projection.json`), JSON.stringify(projection));
  await writeFile(join(root, '.local', 'gateway.txt'), 'email: owner@example.test\npassword: fixture-password\n');
  return root;
}
const refuseNetwork = () => { throw new Error('No upstream call is allowed here.'); };
const NOW = () => new Date('2026-10-20T00:00:00Z');
const APPROVED = '--approved-codes=AIRB000179,AIRB000180';

test('schedule instants without an explicit UTC offset are refused, never given a guessed timezone', () => {
  for (const naive of ['2027-02-14T16:58:59', '2027-02-14 16:58:59']) {
    const projection = siamKempinskiProjection(); projection.cancellation.schedule[0].utcTo = naive; projection.cancellation.schedule[1].utcFrom = naive;
    assert.equal(code(() => altovoBaseline(projection)), 'ALTOVO_CANCELLATION_UNVERIFIED', naive);
  }
});

test('a missing non-refundable flag leaves cancellation unknown even with a zero-penalty tier', () => {
  for (const flag of [undefined, null, 'false', 0]) {
    const projection = siamKempinskiProjection(); projection.cancellation.offerNonRefundable = flag;
    const baseline = altovoBaseline(projection);
    assert.deepEqual([baseline.cancellation.nonRefundable, baseline.cancellation.freeUntil, baseline.freeCancellation, baseline.cancellationDeadline], [null, null, false, null], String(flag));
    assert.equal(baseline.cancellation.status, 'unknown');
    assert.equal(watchBlocker(baseline, at('2026-10-20T00:00:00Z')), 'CANCELLATION_FACTS_UNKNOWN');
  }
});

test('conflicting cancellation facts stay unknown instead of picking a side', () => {
  const conflicts = {
    'non-refundable flag with a free tier': p => { p.cancellation.offerNonRefundable = true; },
    'non-refundable flag with a free-cancellation flag': () => { const p = grandHyattProjection(); p.cancellation.offerFreeCancellation = true; return p; },
    'refundable free-cancellation flag but every tier charged': p => { p.cancellation.schedule[0].penaltyRetail = 100; },
    'free tier contradicted by a false product flag': p => { p.cancellation.productFreeCancellation = false; },
    'offset deadline disagrees with the free tier end': p => { p.cancellation.cancellationDeadline = '2027-02-13T16:58:59+00:00'; },
    'free tier after a charged tier': p => { const [free, charged] = p.cancellation.schedule;
      p.cancellation.schedule = [{ ...charged, utcFrom: free.utcFrom, utcTo: '2026-12-01T00:00:00+00:00' }, { ...free, utcFrom: '2026-12-01T00:00:00+00:00', utcTo: charged.utcTo }]; },
  };
  for (const [name, patch] of Object.entries(conflicts)) {
    const base = siamKempinskiProjection(); const projection = patch(base) ?? base;
    const baseline = altovoBaseline(projection);
    assert.deepEqual([baseline.cancellation.status, baseline.cancellation.nonRefundable, baseline.cancellation.freeUntil], ['unknown', null, null], name);
    assert.equal(watchBlocker(baseline, at('2026-10-20T00:00:00Z')), 'CANCELLATION_FACTS_UNKNOWN', name);
  }
});

test('schedules must be contiguous and their penalties bound to the right currency and total', () => {
  const broken = {
    overlap: p => { p.cancellation.schedule[1].utcFrom = '2027-02-14T10:00:00+00:00'; },
    gap: p => { p.cancellation.schedule[1].utcFrom = '2027-02-15T00:00:00+00:00'; },
    'retail penalty above the retail total': p => { p.cancellation.schedule[1].penaltyRetail = 2335.53; },
    'retail penalty finer than the booking currency': p => { p.cancellation.schedule[1].penaltyRetail = 2335.515; },
    'supplier penalty not valid in the supplier currency': p => { p.cancellation.schedule[1].penaltySupplier = 'USD 573.81'; },
    'supplier penalty above the supplier total': p => { p.cancellation.schedule[1].penaltySupplier = 600; },
  };
  for (const [name, patch] of Object.entries(broken)) {
    const projection = siamKempinskiProjection(); patch(projection);
    assert.equal(code(() => altovoBaseline(projection)), 'ALTOVO_CANCELLATION_UNVERIFIED', name);
  }
});

test('retail and source money stay bound to their own currencies and the quotation FX rate', () => {
  const zeroFees = p => { Object.assign(p.price, { agentMarkup: 0, markup: 0, tax: 0 }); return p; };
  const baseline = altovoBaseline(zeroFees(siamKempinskiProjection()));
  assert.deepEqual([baseline.quotedRetail, baseline.quotedSource, baseline.fx],
    [{ totalMinor: 233552, currency: 'MYR' }, { totalMinor: 57381, currency: 'USD' }, { from: 'USD', to: 'MYR', rate: '4.0702006077', source: 'quotation' }]);
  const broken = {
    'lower-case booking currency': p => { p.booking.currency = 'myr'; },
    'unknown supplier currency': p => { p.price.supplierCurrency = 'XYZ'; },
    'retail total finer than the currency': p => { p.booking.retailTotal = 2335.525; p.price.retailTotal = 2335.525; },
    'price retail total disagrees with the booking': p => { p.price.retailTotal = 2335.53; },
    'zero FX rate': p => { p.price.fxRate = 0; },
    'exponent FX rate': p => { p.price.fxRate = 1e-7; },
    'text FX rate': p => { p.price.fxRate = 'about 4'; },
    'fee-free retail not explained by source times FX': p => { zeroFees(p); p.price.fxRate = 4.5; },
  };
  for (const [name, patch] of Object.entries(broken)) {
    const projection = siamKempinskiProjection(); patch(projection);
    assert.equal(code(() => altovoBaseline(projection)), 'ALTOVO_PRICE_UNVERIFIED', name);
  }
});

test('missing core facts are refused with a reason; absent optional display facts are labelled not supplied', () => {
  const missing = {
    ALTOVO_QUOTE_SCOPE_UNVERIFIED: [p => { delete p.booking.code; }, p => { p.booking.status = 'booked'; }],
    ALTOVO_PROVENANCE_UNVERIFIED: [p => { delete p.source; }, p => { p.tenantHost = 'trave10.app.altovo.com'; }, p => { delete p.readAt; }, p => { p.readAt = 'yesterday'; }],
    ALTOVO_ROOM_UNVERIFIED: [p => { delete p.hotel.gatewayHotelId; }, p => { delete p.hotel.name; }],
    ALTOVO_STAY_UNVERIFIED: [p => { delete p.booking.travelEnd; }],
    ALTOVO_OCCUPANCY_UNVERIFIED: [p => { delete p.hotel.paxCount; }],
    ALTOVO_PRICE_UNVERIFIED: [p => { delete p.booking.currency; }, p => { delete p.price.supplierTotal; }],
    ALTOVO_CANCELLATION_UNVERIFIED: [p => { delete p.cancellation; }],
  };
  for (const [expected, patches] of Object.entries(missing)) for (const patch of patches) {
    const projection = siamKempinskiProjection(); patch(projection);
    assert.equal(code(() => altovoBaseline(projection)), expected, `${expected} ${patch}`);
  }
  const sparse = siamKempinskiProjection(); delete sparse.room.name; delete sparse.room.boardBasis; delete sparse.hotel.star; delete sparse.hotel.cityCode;
  const baseline = altovoBaseline(sparse);
  assert.deepEqual([baseline.room, baseline.hotel.star, baseline.hotel.cityCode], [{ name: null, board: null }, null, null]);
  assert.deepEqual(baseline.notSupplied, ['nationality', 'countryResidence', 'childAges', 'adultChildSplit', 'room.name', 'room.board', 'hotel.star', 'hotel.cityCode']);
});

test('provenance and the my/my adults-only search are recorded as agency defaults, not source facts', () => {
  const baseline = altovoBaseline(siamKempinskiProjection());
  assert.deepEqual(baseline.source, { system: 'altovo-staging', tenantHost: 'air1.app.altovostaging.com', readAt: '2026-10-18' });
  assert.deepEqual([baseline.searchContext, baseline.searchContextSource, baseline.occupancy, baseline.occupancySource],
    [{ nationality: 'my', countryResidence: 'my' }, 'agency-default', { adults: 1, childAges: [], infantAges: [] }, 'agency-default-adults-only']);
  assert.deepEqual(baseline.notSupplied, ['nationality', 'countryResidence', 'childAges', 'adultChildSplit']);
});

test('a Drop Watch cannot start at a moment the schedule does not cover', () => {
  const baseline = altovoBaseline(siamKempinskiProjection());
  assert.equal(watchBlocker(baseline, at('2026-10-18T11:03:18Z')), 'CANCELLATION_FACTS_UNKNOWN');
  assert.equal(watchBlocker(baseline, at('2026-10-18T11:03:19Z')), null);
});

test('the 1970 sentinel and naive offer deadlines are ignored; matching offset deadlines are accepted', () => {
  const hyatt = altovoBaseline(grandHyattProjection());
  assert.deepEqual([hyatt.cancellation.status, hyatt.cancellation.nonRefundable, hyatt.cancellation.freeUntil], ['known', true, null]);
  const siam = siamKempinskiProjection();
  Object.assign(siam.cancellation, { offerFreeCancellationDeadline: '2027-02-10 23:59:59', productFreeCancellation: true,
    productFreeCancellationDeadline: '2027-02-14T16:58:59+00:00', cancellationDeadline: '2027-02-14T16:58:59Z', supplierCancellationDeadline: '2027-02-14T16:58:59+00:00' });
  const baseline = altovoBaseline(siam);
  assert.deepEqual([baseline.cancellation.status, baseline.cancellation.freeUntil], ['known', '2027-02-14T16:58:59.000Z']);
  siam.cancellation.offerFreeCancellationDeadline = '1970-01-01 00:00'; siam.cancellation.cancellationDeadline = '1970-01-01T00:00:00+00:00';
  assert.equal(altovoBaseline(siam).cancellation.freeUntil, '2027-02-14T16:58:59.000Z');
});

test('dry-run validates approved local projections and plans searches without upstream calls or writes', async t => {
  const root = await workspace(t);
  const report = await prepareCatalogue([APPROVED], { root, fetchImpl: refuseNetwork, now: NOW, env: {} });
  assert.equal(report.mode, 'dry-run'); assert.equal(report.status, 'validated');
  assert.deepEqual(report.entries, [
    { code: 'AIRB000179', hotel: 'Grand Hyatt Kuala Lumpur', blocker: 'NON_REFUNDABLE', plannedSearch: false },
    { code: 'AIRB000180', hotel: 'Siam Kempinski Hotel Bangkok', blocker: null, plannedSearch: true },
  ]);
  assert.deepEqual(report.searchDefaults, { nationality: 'my', countryResidence: 'my', occupancy: 'agency-default-adults-only', source: 'agency-default' });
  assert.deepEqual((await readdir(join(root, '.local'))).sort(), ['altovo-sample', 'gateway.txt']);
});

test('preparation refuses projections outside the owner-approved code list and needs the list before reading', async t => {
  const root = await workspace(t);
  const run = args => prepareCatalogue(args, { root, fetchImpl: refuseNetwork, now: NOW, env: {} });
  assert.deepEqual([(await run([])).status, (await run([])).entries], ['not-attempted', undefined]);
  assert.equal((await run(['--approved-codes=AIRB000180'])).reason, 'ALTOVO_CODE_NOT_APPROVED');
  assert.equal((await run(['--approved-codes=AIRB000179,AIRB000180,AIRB000181'])).reason, 'ALTOVO_PROJECTION_MISSING');
  for (const list of ['', 'airb000179', 'AIRB000179,AIRB000179']) assert.equal((await run([`--approved-codes=${list}`])).reason, 'APPROVED_CODES_INVALID', list);
  const renamed = await workspace(t, [grandHyattProjection()]);
  await writeFile(join(renamed, '.local', 'altovo-sample', 'AIRB000999.projection.json'), JSON.stringify(siamKempinskiProjection()));
  assert.equal((await prepareCatalogue(['--approved-codes=AIRB000179,AIRB000999'], { root: renamed, fetchImpl: refuseNetwork, now: NOW, env: {} })).reason, 'ALTOVO_PROJECTION_MISMATCH');
});

test('--contrast names one difference per approved code and anything else is refused before any read', async t => {
  const root = await workspace(t);
  const run = args => prepareCatalogue([APPROVED, ...args], { root, fetchImpl: refuseNetwork, now: NOW, env: {} });
  const planned = await run(['--contrast=AIRB000180:cancellation']);
  assert.equal(planned.status, 'validated', planned.reason);
  assert.deepEqual(planned.entries.map(entry => [entry.code, entry.contrast]), [['AIRB000179', undefined], ['AIRB000180', 'cancellation']]);
  assert.deepEqual(parseContrasts('AIRB000179:meals,AIRB000180:room', ['AIRB000179', 'AIRB000180']), { AIRB000179: 'meals', AIRB000180: 'room' });
  assert.deepEqual(parseContrasts(undefined, ['AIRB000180']), {});
  for (const list of ['', 'AIRB000180', 'AIRB000180:', 'AIRB000180:view', 'AIRB000180:Meals', 'airb000180:meals', 'AIRB000181:meals', 'AIRB000180:meals:room',
    'AIRB000180:meals,AIRB000180:room', 'AIRB000180:meals,', ' AIRB000180:meals']) {
    const refused = await run([`--contrast=${list}`]);
    assert.deepEqual([refused.status, refused.reason, refused.entries], ['blocked', 'CONTRAST_INVALID', undefined], list);
  }
  // Like every flag, it may appear once.
  assert.equal((await run(['--contrast=AIRB000180:meals', '--contrast=AIRB000180:room'])).reason, 'ALTOVO_CATALOGUE_PREPARATION_FAILED');
  assert.match((await prepareCatalogue([], { root, fetchImpl: refuseNetwork, now: NOW, env: {} })).requirements.join('\n'), /--contrast=CODE:meals\|room\|cancellation/);
});

// Injected Gateway: records every request and answers login and search-by-id from test data only.
function fakeGateway(searchBody) {
  const calls = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ path: new URL(url).pathname, body });
    if (new URL(url).pathname === '/api/v2/login') return json({ success: true, data: { auth_token: 'fixture-token' } });
    return typeof searchBody === 'function' ? searchBody(body, json) : json(searchBody);
  };
  return { calls, fetchImpl };
}
const rate = (price, extra = {}) => ({ currency: 'USD', price, rate_detail: `RD-PRIVATE-${price}`, contract_id: 'contract-private', board_basis: 'Breakfast',
  free_cancellation: true, free_cancellation_deadline: '2027-02-10T16:59:59Z', ...extra });
const searchResult = rates => ({ success: true, request_id: 'request-fixture', data: rates.length ? [{ easygds_id: '3135840', source_id: 'source-private',
  supplier_code: 'SUPPLIER-PRIVATE', hotel_id: 'hotel-private', rooms: [{ idx: 1, room_name: 'Deluxe Room', room_type_id: 'room-type-private', rates }] }] : [] });
const EXECUTE = [APPROVED, '--execute', '--gateway-credentials-file=.local/gateway.txt'];
const catalogueFiles = async root => { try { return await readdir(join(root, '.local', 'altovo-catalogue')); } catch { return []; } };

test('execute searches only armable quotations with the agency defaults and records each capture outcome', async t => {
  const root = await workspace(t);
  const gateway = fakeGateway(searchResult([rate(500), rate(520, { board_basis: 'Room only', free_cancellation: false })]));
  const report = await prepareCatalogue(EXECUTE, { root, fetchImpl: gateway.fetchImpl, now: NOW, env: {} });
  assert.equal(report.status, 'prepared', report.reason);
  const searches = gateway.calls.filter(call => call.path === '/api/v2/search-by-id');
  assert.equal(searches.length, 1);
  assert.deepEqual([searches[0].body.ids, searches[0].body.nationality, searches[0].body.country_residence, searches[0].body.rooms],
    [['3135840'], 'my', 'my', [{ idx: 1, adults: 1, children: [], infants: [] }]]);
  const written = JSON.parse(await readFile(report.privateCatalogue, 'utf8'));
  const byCode = Object.fromEntries(written.entries.map(entry => [entry.code, entry]));
  assert.deepEqual(byCode.AIRB000179.capture, { status: 'not-searched', reason: 'NON_REFUNDABLE' });
  assert.deepEqual(byCode.AIRB000180.capture, { status: 'observed', checkedAt: '2026-10-20T00:00:00.000Z', offerCount: 2, optionCount: 2, searchDefaults: {
    nationality: 'my', countryResidence: 'my', occupancy: 'agency-default-adults-only', source: 'agency-default' } });
  assert.deepEqual(report.entries.map(entry => [entry.code, entry.capture]), [['AIRB000179', 'not-searched'], ['AIRB000180', 'observed']]);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|fixture-token|fixture-password/);
});

test('execute builds each third Drop with its code\'s --contrast, meals first otherwise', async t => {
  // The Siam booking is a refundable Executive Suite with breakfast at USD 573.81: two perfect matches, then one-way near-matches.
  const response = searchResult([rate(480)]);
  response.data[0].rooms = [{ idx: 1, room_name: 'Executive Suite', room_type_id: 'suite-a',
    rates: [rate(480), rate(540, { board_basis: 'Room Only' }), rate(545, { free_cancellation: false, free_cancellation_deadline: null })] },
  { idx: 1, room_name: 'Executive, Suite', room_type_id: 'suite-b', rates: [rate(490)] }];
  const third = async args => {
    const root = await workspace(t);
    const report = await prepareCatalogue([...EXECUTE, ...args], { root, fetchImpl: fakeGateway(response).fetchImpl, now: NOW, env: {} });
    assert.equal(report.status, 'prepared', report.reason);
    const options = JSON.parse(await readFile(report.privateCatalogue, 'utf8')).entries.find(entry => entry.code === 'AIRB000180').bundle.options;
    return [report.entries.map(entry => entry.contrast), options.map(option => [option.roomName, option.board, option.freeCancellation, option.sourcePrice.amount])];
  };
  const best = [['Executive Suite', 'Breakfast', true, '480.00'], ['Executive, Suite', 'Breakfast', true, '490.00']];
  assert.deepEqual(await third([]), [[undefined, undefined], [...best, ['Executive Suite', 'Room Only', true, '540.00']]]);
  assert.deepEqual(await third(['--contrast=AIRB000180:cancellation']), [[undefined, 'cancellation'], [...best, ['Executive Suite', 'Breakfast', false, '545.00']]]);
});

test('a valid zero-result search is recorded as empty, while a failed search publishes nothing', async t => {
  const empty = await workspace(t);
  const report = await prepareCatalogue(EXECUTE, { root: empty, fetchImpl: fakeGateway(searchResult([])).fetchImpl, now: NOW, env: {} });
  assert.equal(report.status, 'prepared', report.reason);
  const entry = JSON.parse(await readFile(report.privateCatalogue, 'utf8')).entries.find(item => item.code === 'AIRB000180');
  assert.deepEqual([entry.capture.status, entry.capture.offerCount, entry.bundle.options], ['observed-empty', 0, []]);
  const failures = {
    GATEWAY_HTTP_FAILED: (body, json) => json({ success: false }, 500),
    GATEWAY_APPLICATION_FAILED: (body, json) => json({ success: false, message: 'no' }),
    GATEWAY_HOTEL_MAPPING_UNVERIFIED: (body, json) => json({ ...searchResult([rate(500)]), data: [{ ...searchResult([rate(500)]).data[0], easygds_id: '999' }] }),
  };
  for (const [reason, answer] of Object.entries(failures)) {
    const root = await workspace(t);
    const failed = await prepareCatalogue(EXECUTE, { root, fetchImpl: fakeGateway(answer).fetchImpl, now: NOW, env: {} });
    assert.deepEqual([failed.status, failed.reason, failed.privateCatalogue], ['blocked', reason, undefined], reason);
    assert.deepEqual(await catalogueFiles(root), [], reason);
  }
});

test('cannot-start quotations are packaged without any upstream call or credentials', async t => {
  const root = await workspace(t, [grandHyattProjection()]);
  const report = await prepareCatalogue(['--approved-codes=AIRB000179', '--execute'], { root, fetchImpl: refuseNetwork, now: NOW, env: {} });
  assert.equal(report.status, 'prepared', report.reason);
  assert.deepEqual(report.entries, [{ code: 'AIRB000179', hotel: 'Grand Hyatt Kuala Lumpur', blocker: 'NON_REFUNDABLE', capture: 'not-searched', optionCount: 0, imageSources: { hotel: false, drops: 0 } }]);
  const refused = await prepareCatalogue(['--approved-codes=AIRB000179', '--execute'], { root, fetchImpl: refuseNetwork, now: NOW, env: { K_SERVICE: 'x' } });
  assert.equal(refused.status, 'blocked');
});

// Gateway image shapes: hotel `avatar.urls.{sm,md,lg}` (mirrored as `avatar.sm/md/lg`), room `images[]` with `urls` and `caption`.
const urls = name => ({ sm: `https://img.example.test/${name}-sm.jpg`, md: `https://img.example.test/${name}-md.jpg`, lg: `https://img.example.test/${name}-lg.jpg` });
const withImages = (result, { avatar, roomImages = [] } = {}) => {
  const [source] = result.data; source.avatar = avatar;
  source.rooms = roomImages.map((images, index) => ({ ...source.rooms[0], room_name: `Room ${index + 1}`, room_type_id: `room-type-${index}`,
    images, rates: source.rooms[0].rates.filter((_, rateIndex) => rateIndex === index) }));
  return result;
};
const prepareWith = async (t, response) => {
  const root = await workspace(t);
  const report = await prepareCatalogue(EXECUTE, { root, fetchImpl: fakeGateway(response).fetchImpl, now: NOW, env: {} });
  assert.equal(report.status, 'prepared', report.reason);
  return { report, written: JSON.parse(await readFile(report.privateCatalogue, 'utf8')) };
};
const siamEntry = written => written.entries.find(entry => entry.code === 'AIRB000180');

test('a capture keeps the hotel and each Drop photo as remote source URLs for a later reviewed download, never as renderable fields', async t => {
  const response = withImages(searchResult([rate(500), rate(510, { board_basis: 'Room only' })]), {
    avatar: { caption: null, id: null, urls: urls('hotel'), file_ids: null, ...urls('hotel') },
    roomImages: [[{ caption: 'Deluxe twin', urls: urls('room-a') }, { caption: 'Second', urls: urls('room-a2') }], []],
  });
  const { written, report } = await prepareWith(t, response);
  const siam = siamEntry(written);
  const [first, second] = siam.bundle.options;
  assert.deepEqual(siam.imageSources, {
    kind: 'remote-source-urls-pending-review', renderable: false,
    hotel: { url: 'https://img.example.test/hotel-md.jpg', caption: null },
    drops: [{ optionId: first.optionId, url: 'https://img.example.test/room-a-md.jpg', caption: 'Deluxe twin' },
      { optionId: second.optionId, url: null, caption: null }],
  });
  // The cannot-start quotation had no search, so no source photo is known.
  assert.deepEqual(written.entries.find(entry => entry.code === 'AIRB000179').imageSources,
    { kind: 'remote-source-urls-pending-review', renderable: false, hotel: null, drops: [] });
  // Bundles stay exactly as before: image sources sit beside them, outside the integrity hash.
  assert.doesNotMatch(JSON.stringify(siam.bundle), /img\.example/);
  assert.deepEqual(report.entries.map(entry => [entry.code, entry.imageSources]), [['AIRB000179', { hotel: false, drops: 0 }], ['AIRB000180', { hotel: true, drops: 1 }]]);
});

test('image sources accept https only, fall back md, lg, sm, and record a missing avatar or empty images as null', async t => {
  const insecure = withImages(searchResult([rate(500), rate(510, { board_basis: 'Room only' })]), {
    avatar: { caption: 'Front', urls: { md: 'http://img.example.test/hotel-md.jpg', lg: 'https://img.example.test/hotel-lg.jpg' } },
    roomImages: [[{ caption: 'x', urls: { md: 'javascript:alert(1)', lg: '//img.example.test/a.jpg', sm: 'https://user:pw@img.example.test/a.jpg' } }],
      [{ urls: { sm: 'https://img.example.test/room-b-sm.jpg' } }]],
  });
  const siam = siamEntry((await prepareWith(t, insecure)).written);
  assert.deepEqual(siam.imageSources.hotel, { url: 'https://img.example.test/hotel-lg.jpg', caption: 'Front' });
  assert.deepEqual(siam.imageSources.drops.map(drop => [drop.url, drop.caption]), [[null, null], ['https://img.example.test/room-b-sm.jpg', null]]);
  const flatAvatar = withImages(searchResult([rate(500)]), { avatar: { urls: null, md: 'https://img.example.test/flat-md.jpg' }, roomImages: [[]] });
  assert.deepEqual(siamEntry((await prepareWith(t, flatAvatar)).written).imageSources.hotel, { url: 'https://img.example.test/flat-md.jpg', caption: null });
  for (const avatar of [undefined, null, 'https://img.example.test/not-an-object.jpg', { urls: { md: 'ftp://img.example.test/a.jpg' } }]) {
    const missing = siamEntry((await prepareWith(t, withImages(searchResult([rate(500)]), { avatar, roomImages: [undefined] }))).written);
    assert.deepEqual([missing.imageSources.hotel, missing.imageSources.drops.map(drop => drop.url)], [null, [null]], String(avatar));
  }
});

test('prepared bundles project to a display-safe public catalogue with private supplier fields left behind', async t => {
  const root = await workspace(t);
  const report = await prepareCatalogue(EXECUTE, { root, fetchImpl: fakeGateway(searchResult([rate(500), rate(510, { board_basis: 'Room only' })])).fetchImpl, now: NOW, env: {} });
  const written = JSON.parse(await readFile(report.privateCatalogue, 'utf8'));
  assert.match(JSON.stringify(written), /RD-PRIVATE-500/);
  const publicCatalogue = deploymentCatalogue(written);
  assert.deepEqual(publicCatalogue.map(entry => entry.code), ['AIRB000179', 'AIRB000180']);
  assert.doesNotMatch(JSON.stringify(publicCatalogue), /PRIVATE|private|fixture-token|request-fixture|capture/);
  const siam = publicCatalogue[1].snapshot;
  assert.deepEqual([siam.baseline.searchContextSource, siam.baseline.occupancySource, siam.baseline.source.readAt], ['agency-default', 'agency-default-adults-only', '2026-10-18']);
  assert.deepEqual(siam.options.map(option => [option.sourcePrice, option.estimate.currency]), [[{ amount: '500.00', currency: 'USD' }, 'MYR'], [{ amount: '510.00', currency: 'USD' }, 'MYR']]);
});
