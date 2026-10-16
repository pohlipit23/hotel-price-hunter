import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../scripts/check-live-rates.mjs';

test('live runner is offline by default even when all credential variables are present', async () => {
  const report = await main([], { env: { HPH_ALTOVO_READ_AUTHORISED: 'yes', HPH_ALTOVO_READ_TOKEN: 'PRIVATE', HPH_ALTOVO_BASE_URL: 'PRIVATE' },
    fetchImpl: () => assert.fail('offline must not fetch') });
  assert.equal(report.mode, 'offline');
  assert.equal(report.status, 'not-attempted');
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
});

test('runner rejects missing authority, cloud activation and unknown flags without reading private files', async () => {
  for (const [args, env] of [[['--execute', '--input=.local/test.json'], {}],
    [['--execute', '--input=.local/test.json'], { NODE_ENV: 'production' }],
    [['--execute', '--input=.local/test.json'], { K_SERVICE: 'private-service' }],
    [['--execute', '--input=.local/test.json'], { CLOUD_RUN_JOB: 'private-job' }],
    [['--execute', '--prebook'], {}], [['--execute', '--input=a', '--input=b'], {}]]) {
    const report = await main(args, { env, fetchImpl: () => assert.fail('must not fetch') });
    assert.equal(report.status, 'blocked');
  }
});

test('private input must stay inside ignored .local and match the selected tenant without extra PII', async t => {
  const root = await mkdtemp(join(tmpdir(), 'roomdrop-live-input-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.local'));
  const env = { HPH_ALTOVO_READ_AUTHORISED: 'yes', HPH_ALTOVO_READ_TOKEN: 'DO-NOT-DISCLOSE-TOKEN', HPH_ALTOVO_BASE_URL: 'https://bonus.apps.easygds.com/api' };
  const fetchImpl = () => assert.fail('invalid input must not fetch');
  await writeFile(join(root, 'public.json'), '{}');
  const outside = await main(['--execute', '--input=public.json'], { root, env, fetchImpl });
  assert.equal(outside.status, 'blocked');
  for (const input of [{ baseUrl: 'https://mh1.apps.easygds.com/api', bookingCode: 'TEST', timeZone: 'Asia/Kuala_Lumpur' },
    { baseUrl: env.HPH_ALTOVO_BASE_URL, bookingCode: 'DO-NOT-DISCLOSE-BOOKING', timeZone: 'Asia/Kuala_Lumpur', contact: 'DO-NOT-DISCLOSE-CONTACT' }]) {
    await writeFile(join(root, '.local', 'input.json'), JSON.stringify(input));
    const report = await main(['--execute', '--input=.local/input.json'], { root, env, fetchImpl });
    assert.equal(report.status, 'blocked');
    assert.equal(report.reason, 'INVALID_PRIVATE_INPUT');
    assert.doesNotMatch(JSON.stringify(report), /DO-NOT-DISCLOSE/);
  }
});

test('executed runner reports only aggregates and saves an observation solely on explicit --save', async t => {
  const root = await mkdtemp(join(tmpdir(), 'roomdrop-live-save-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.local'));
  const baseUrl = 'https://bonus.apps.easygds.com/api'; const bookingCode = 'OWNER-SELECTED-BOOKING';
  await writeFile(join(root, '.local', 'input.json'), JSON.stringify({ baseUrl, bookingCode, timeZone: 'Asia/Kuala_Lumpur' }));
  const documents = [
    { booking_code: bookingCode, shopping_id: 'private-shopping', hotel: { id: 'h' } },
    { code: bookingCode, products: [{ product_code: 'hotel' }], travel_start_date: '2026-11-12', travel_end_date: '2026-11-15',
      currency_code: 'USD', travelers: [{ type: 'adult', age: 35, room_idx: 1, name: 'DO-NOT-DISCLOSE-NAME' }] },
    { booking_code: bookingCode, shopping_id: 'private-shopping', status: 'vouchered', hotel: { id: 'h', rooms: [{ idx: 1 }],
      price_info: { total_amount: 600 }, currency_info: { conversion: 'USD' } } },
    { search_id: 'private-search', expire_at: '2026-10-17T05:00:00Z', product_code: 'hotel', hotels: [{ id: 'h' }] },
    { id: 'h', offers: [] },
  ];
  const env = { HPH_ALTOVO_READ_AUTHORISED: 'yes', HPH_ALTOVO_READ_TOKEN: 'DO-NOT-DISCLOSE-TOKEN', HPH_ALTOVO_BASE_URL: baseUrl };
  let index = 0;
  const options = { root, env, now: () => new Date('2026-10-16T05:00:00Z'),
    fetchImpl: async () => new Response(JSON.stringify(documents[index++ % 5]), { headers: { 'content-type': 'application/json' } }) };
  const first = await main(['--execute', '--input=.local/input.json'], options);
  assert.equal(first.status, 'observed');
  assert.equal(first.rateCount, 0);
  assert.equal(first.privateReport, undefined);
  assert.deepEqual(await readdir(join(root, '.local')), ['input.json']);
  const second = await main(['--execute', '--save', '--input=.local/input.json'], options);
  assert.equal(second.status, 'observed');
  assert.doesNotMatch(JSON.stringify(second), /OWNER-SELECTED-BOOKING|DO-NOT-DISCLOSE|private-search|private-shopping/);
  const observation = JSON.parse(await readFile(join(root, second.privateReport), 'utf8'));
  assert.equal(observation.booking.bookingId, bookingCode);
  assert.doesNotMatch(JSON.stringify(observation), /DO-NOT-DISCLOSE/);
  assert.equal(observation.transactionAuthority, null);

  await writeFile(join(root, '.local', 'credentials.env'), [
    'EASYGDS_IAM_URL=https://iam.services.easygds.com/api', 'EASYGDS_EMAIL=test@example.invalid',
    'EASYGDS_PASSWORD=DO-NOT-DISCLOSE-PASSWORD', 'EASYGDS_SCOPE_TYPE=System', 'EASYGDS_FLOW_TYPE=Basic',
  ].join('\n'));
  const fileEnv = { ...env }; delete fileEnv.HPH_ALTOVO_READ_TOKEN;
  let authCalls = 0;
  const fileOptions = { ...options, env: fileEnv, fetchImpl: async (url, init) => {
    if (url.origin === 'https://iam.services.easygds.com') {
      authCalls++; assert.equal(JSON.parse(init.body).secret_key, 'DO-NOT-DISCLOSE-PASSWORD');
      return new Response(JSON.stringify({ access_token: 'DO-NOT-DISCLOSE-TOKEN' }), { headers: { 'content-type': 'application/json' } });
    }
    return options.fetchImpl(url, init);
  } };
  const credentialsArg = '--credentials-file=.local/credentials.env';
  const fileReport = await main(['--execute', '--input=.local/input.json', credentialsArg], fileOptions);
  assert.equal(fileReport.status, 'observed');
  assert.equal(authCalls, 1);
  assert.doesNotMatch(JSON.stringify(fileReport), /DO-NOT-DISCLOSE/);
  await writeFile(join(root, '.local', 'input.json'), JSON.stringify({ baseUrl, bookingCode, timeZone: 'UNKNOWN' }));
  const invalid = await main(['--execute', '--input=.local/input.json', credentialsArg], fileOptions);
  assert.equal(invalid.status, 'blocked');
  assert.equal(authCalls, 1, 'invalid input cannot authenticate');
});
