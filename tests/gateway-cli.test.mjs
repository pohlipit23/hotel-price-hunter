import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../scripts/check-gateway-rates.mjs';

test('gateway runner defaults offline and denies cloud/unknown operations without credential reads', async () => {
  const offline = await main([], { fetchImpl: () => assert.fail('offline must not fetch') });
  assert.equal(offline.status, 'not-attempted');
  for (const [args, env] of [[['--book'], {}], [['--execute'], {}], [['--execute', '--input=a', '--credentials-file=b'], { NODE_ENV: 'production' }],
    [['--execute', '--input=a', '--credentials-file=b'], { K_SERVICE: 'service' }]]) {
    const report = await main(args, { env, fetchImpl: () => assert.fail('invalid activation must not fetch') });
    assert.equal(report.status, 'blocked');
  }
});

test('gateway runner executes one direct search, keeps identifiers private and saves only projected rate facts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'roomdrop-gateway-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.local'));
  await writeFile(join(root, '.local', 'credential.txt'), 'email: owner@example.invalid\npassword: DO-NOT-DISCLOSE\n');
  const input = { hotelId: 'hotel-A', checkin: '2026-11-12', checkout: '2026-11-15', adults: 2, childAges: [], infantAges: [], nationality: 'my', countryResidence: 'my' };
  await writeFile(join(root, '.local', 'input.json'), JSON.stringify(input));
  let calls = 0; let requestBody;
  const fetchImpl = async (url, options) => {
    calls++;
    const data = url.pathname.endsWith('/login') ? { success: true, data: { auth_token: 'DO-NOT-DISCLOSE-TOKEN' } }
      : { success: true, request_id: 'private-request', progress: 0, data: [{ hotel_id: 'supplier-hotel', easygds_id: 'hotel-A', eps_id: 'hotel-A',
        source_id: 'private-source', supplier_code: 'private-supplier', rooms: [{ idx: 1, room_type_id: 'private-room', room_name: 'Deluxe',
          images: ['DO-NOT-DISCLOSE-IMAGE'], rates: [{ currency: 'USD', net_price: 100, gross_price: 120, rate_detail: 'private-rate-token',
            email_asgard: 'DO-NOT-DISCLOSE-EMAIL', cancellations: [] }] }] }] };
    if (!url.pathname.endsWith('/login')) requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  };
  const report = await main(['--execute', '--save', '--input=.local/input.json', '--credentials-file=.local/credential.txt'],
    { root, env: {}, fetchImpl, now: () => new Date('2026-10-16T10:00:00Z') });
  assert.equal(report.status, 'observed'); assert.equal(calls, 2); assert.equal(report.rateCount, 1);
  assert.deepEqual(requestBody.ids, ['hotel-A']); assert.equal(requestBody.price_comparison, false);
  assert.equal(requestBody.rooms[0].adults, 2); assert.equal(report.customerRefundVerified, false);
  assert.doesNotMatch(JSON.stringify(report), /DO-NOT-DISCLOSE|owner@example|private-rate-token|private-source|private-request/);
  const saved = JSON.parse(await readFile(join(root, report.privateReport), 'utf8'));
  assert.equal(saved.offers[0].rateDetail, 'private-rate-token');
  assert.doesNotMatch(JSON.stringify(saved), /DO-NOT-DISCLOSE|owner@example|images|email_asgard/);
});

test('gateway runner rejects non-private input and wrong/extra search fields before authenticating', async t => {
  const root = await mkdtemp(join(tmpdir(), 'roomdrop-gateway-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.local'));
  await writeFile(join(root, '.local', 'input.json'), JSON.stringify({ hotelId: 'h', checkin: '2026-02-30', price: 1 }));
  const args = ['--execute', '--input=.local/input.json', '--credentials-file=missing.txt'];
  const report = await main(args, { root, env: {}, fetchImpl: () => assert.fail('invalid input must not authenticate') });
  assert.equal(report.status, 'blocked'); assert.equal(report.reason, 'INVALID_GATEWAY_INPUT');
});
