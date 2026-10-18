import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../scripts/prepare-quotation-demo.mjs';

test('quotation preparation is offline by default and rejects cloud/unknown arguments before credential access', async () => {
  assert.equal((await main([], { fetchImpl: () => assert.fail('offline must not fetch') })).status, 'not-attempted');
  for (const [args, env] of [[['--book'], {}], [['--execute'], {}], [['--execute', '--code=TEST'], { K_SERVICE: 'cloud' }]]) {
    assert.equal((await main(args, { env, fetchImpl: () => assert.fail('invalid activation must not fetch') })).status, 'blocked');
  }
});

test('quotation preparation performs only existing login, quote GET and gateway rate reads, then writes a private selection bundle', async t => {
  const root = await mkdtemp(join(tmpdir(), 'roomdrop-quote-prepare-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.local'));
  await writeFile(join(root, '.local', 'engine.env'), 'EASYGDS_EMAIL=owner@example.invalid\nEASYGDS_PASSWORD=PRIVATE-secret\nEASYGDS_SCOPE_TYPE=System\nEASYGDS_FLOW_TYPE=Basic\nEASYGDS_IAM_URL=https://iam.services.easygds.com/api');
  await writeFile(join(root, '.local', 'gateway.txt'), 'email: owner@example.invalid\npassword: PRIVATE-secret');
  const quote = { code: 'TEST', status: 'quote', currency_code: 'AED', total_amount: 350, access_token: 'PRIVATE-token', contact: { email: 'PRIVATE-email' },
    travel_start_date: '2027-01-21', travel_end_date: '2027-01-22', products: [{ product_code: 'hotel' }], cart_items: [{ product_code: 'hotel',
      search: { payload: { country_code: 'MY', territory: 'MY', travelers: [{ type: 'adult', room: 1 }] } }, product: { id: 'h', name: 'Hotel', room_count: 1,
        checkin_date: '2027-01-21', checkout_date: '2027-01-22', currency_info: { original: 'USD', conversion: 'AED', rate: 3.5 }, price_info: { total_amount: 350 },
        selected_offer: { price: 100, currency: 'USD', rooms: [{ idx: 1, name: 'Original' }] } } }] };
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ path: url.pathname, method: options.method });
    let value;
    if (url.pathname === '/api/auth') value = { access_token: 'engine-token' };
    else if (url.pathname === '/api/bookings') { assert.equal(url.searchParams.get('cart_items_appended'), 'true'); value = quote; }
    else if (url.pathname === '/api/v2/login') value = { success: true, data: { auth_token: 'gateway-token' } };
    else if (url.pathname === '/api/v2/search-by-id') {
      const body = JSON.parse(options.body); assert.deepEqual(body.ids, ['h']); assert.equal(body.checkin, '2027-01-21');
      value = { success: true, request_id: 'PRIVATE-request', data: [{ hotel_id: 'supplier-hotel', easygds_id: 'h', eps_id: 'h', source_id: 's', supplier_code: 's',
        rooms: [{ idx: 1, room_type_id: 'r', room_name: 'New room', rates: [{ rate_detail: 'PRIVATE-rate', price: 80, currency: 'USD', free_cancellation: true }] }] }] };
    } else assert.fail('unexpected upstream operation');
    return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  };
  const report = await main(['--execute', '--code=TEST', '--engine-credentials-file=.local/engine.env', '--gateway-credentials-file=.local/gateway.txt'], { root, env: {}, fetchImpl });
  assert.equal(report.status, 'prepared'); assert.equal(report.optionCount, 1); assert.equal(report.reservationCreated, false);
  assert.equal(requests.length, 4); assert.equal(requests[1].method, 'GET');
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE-|owner@example/);
  const snapshot = JSON.parse(await readFile(report.privateSnapshot, 'utf8'));
  assert.doesNotMatch(JSON.stringify(snapshot.baseline), /PRIVATE-|contact|access_token/);
  assert.equal(snapshot.transactionMode, 'selection-only'); assert.equal(snapshot.privateReferences[snapshot.options[0].optionId].rateDetail, 'PRIVATE-rate');
});
