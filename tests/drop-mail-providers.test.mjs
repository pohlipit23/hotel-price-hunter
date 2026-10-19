import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
import { createMemorySessionStorage } from '../app/quotation-session-storage.mjs';
import { DROP_MAIL_TASK_PATH, createCloudTasksDeferral, createCloudflareTransport, createDropMailerFromEnvironment, createMemoryDropMailStore,
  createTaskVerifier, dropMailSettings } from '../app/drop-mail.mjs';
import { NOW, listen, plannedBookings, visit } from './fixtures/roomdrop-harness.mjs';

// The Cloudflare Email Service transport, the Cloud Tasks deferral and its OIDC-verified callback, with stubbed
// fetch, access tokens and ID token verification only: no network call leaves these tests.
const ACCOUNT = 'a'.repeat(32);
const TOKEN = 'cf-token-PRIVATE-0123456789';
const QUEUE = 'projects/sincere-apex-511418-p0/locations/asia-southeast1/queues/roomdrop-drop-mail';
const ORIGIN = 'https://hotel-price-hunter-2qbcpylngq-as.a.run.app';
const INVOKER = 'roomdrop-tasks@sincere-apex-511418-p0.iam.gserviceaccount.com';
const MESSAGE = { to: 'judge@example.test', subject: 'Subject', html: '<p>Hi</p>', text: 'Hi' };
const KEY = 'mail-' + 'b'.repeat(32);
function stubFetch(reply) {
  const calls = [];
  const fetch = async (url, options) => { calls.push({ url, ...options, json: JSON.parse(options.body) }); return reply(url, calls.length); };
  return { fetch, calls };
}
const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const delivered = () => respond(200, { success: true, errors: [], messages: [], result: { delivered: ['judge@example.test'], permanent_bounces: [], queued: [] } });

test('the Cloudflare transport posts the documented REST body with a bearer token and maps failures to bounded codes', async () => {
  const stub = stubFetch(delivered);
  const transport = createCloudflareTransport({ accountId: ACCOUNT, token: TOKEN, from: 'roomdrop@mail.08-08-08.com', fetch: stub.fetch });
  assert.deepEqual(await transport.send({ ...MESSAGE, sendAt: null, idempotencyKey: KEY }), { id: KEY });
  const [call] = stub.calls;
  assert.equal(call.url, `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/email/sending/send`); assert.equal(call.method, 'POST');
  assert.deepEqual(call.headers, { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
  assert.deepEqual(call.json, { ...MESSAGE, from: 'roomdrop@mail.08-08-08.com', headers: { 'X-RoomDrop-Mail-Id': KEY } });
  assert.ok(call.signal instanceof AbortSignal);
  await assert.rejects(transport.send({ ...MESSAGE, sendAt: '2026-10-20T00:01:00.000Z', idempotencyKey: KEY }), { code: 'MAIL_SCHEDULING_UNSUPPORTED' });
  for (const [reply, code] of [[() => respond(500, { success: false, errors: [{ code: 1, message: 'PRIVATE judge@example.test' }], result: null }), 'MAIL_PROVIDER_REFUSED'],
    [() => respond(429, { success: false, errors: [{ code: 10004, message: 'email.sending.error.throttled' }], result: null }), 'MAIL_PROVIDER_THROTTLED'],
    [() => respond(200, { success: true, result: { delivered: [], permanent_bounces: ['judge@example.test'], queued: [] } }), 'MAIL_BOUNCED'],
    [() => { throw Error('PRIVATE network ' + TOKEN); }, 'MAIL_PROVIDER_UNAVAILABLE'], [() => new Response('not json', { status: 502 }), 'MAIL_PROVIDER_UNAVAILABLE']]) {
    const failing = createCloudflareTransport({ accountId: ACCOUNT, token: TOKEN, from: 'roomdrop@mail.08-08-08.com', fetch: stubFetch(reply).fetch });
    await assert.rejects(failing.send({ ...MESSAGE, sendAt: null, idempotencyKey: KEY }), error => error.code === code && !/PRIVATE|judge@|cf-token/.test(error.message));
  }
  for (const options of [{ accountId: 'short' }, { token: '' }, { from: 'not-an-address' }]) {
    assert.throws(() => createCloudflareTransport({ accountId: ACCOUNT, token: TOKEN, from: 'roomdrop@mail.08-08-08.com', ...options }), { code: 'DROP_MAIL_CONFIG_INVALID' });
  }
});

test('the Cloud Tasks deferral enqueues one OIDC task per mailId at sendAt; a 409 means already queued', async () => {
  const stub = stubFetch(() => respond(200, { name: 'task' }));
  const deferral = createCloudTasksDeferral({ queue: QUEUE, url: ORIGIN + DROP_MAIL_TASK_PATH, serviceAccountEmail: INVOKER, fetch: stub.fetch, accessToken: async () => 'gcp-access' });
  const sendAt = new Date('2026-10-20T00:01:00Z');
  assert.deepEqual(await deferral.defer({ message: MESSAGE, sendAt, idempotencyKey: KEY }), { id: KEY }); assert.equal(deferral.status, 'scheduled');
  const [call] = stub.calls;
  assert.equal(call.url, `https://cloudtasks.googleapis.com/v2/${QUEUE}/tasks`); assert.equal(call.headers.Authorization, 'Bearer gcp-access');
  const { task } = call.json;
  assert.equal(task.name, `${QUEUE}/tasks/${KEY}`); assert.equal(task.scheduleTime, '2026-10-20T00:01:00.000Z');
  assert.deepEqual(task.httpRequest.oidcToken, { serviceAccountEmail: INVOKER, audience: ORIGIN });
  assert.deepEqual([task.httpRequest.url, task.httpRequest.httpMethod], [ORIGIN + DROP_MAIL_TASK_PATH, 'POST']);
  assert.deepEqual(JSON.parse(Buffer.from(task.httpRequest.body, 'base64').toString('utf8')), { ...MESSAGE, idempotencyKey: KEY });
  const queued = createCloudTasksDeferral({ queue: QUEUE, url: ORIGIN + DROP_MAIL_TASK_PATH, serviceAccountEmail: INVOKER, fetch: stubFetch(() => respond(409, {})).fetch, accessToken: async () => 'x' });
  await queued.defer({ message: MESSAGE, sendAt, idempotencyKey: KEY });
  const refused = createCloudTasksDeferral({ queue: QUEUE, url: ORIGIN + DROP_MAIL_TASK_PATH, serviceAccountEmail: INVOKER, fetch: stubFetch(() => respond(403, {})).fetch, accessToken: async () => 'x' });
  await assert.rejects(refused.defer({ message: MESSAGE, sendAt, idempotencyKey: KEY }), { code: 'MAIL_QUEUE_REFUSED' });
  for (const options of [{ queue: 'roomdrop' }, { url: 'http://insecure.example' + DROP_MAIL_TASK_PATH }, { url: ORIGIN + '/elsewhere' }, { serviceAccountEmail: 'judge@example.test' }]) {
    assert.throws(() => createCloudTasksDeferral({ queue: QUEUE, url: ORIGIN + DROP_MAIL_TASK_PATH, serviceAccountEmail: INVOKER, ...options }), { code: 'DROP_MAIL_CONFIG_INVALID' });
  }
});

test('the task verifier accepts only a Google ID token for this audience from the configured invoker', async () => {
  const good = { aud: ORIGIN, iss: 'https://accounts.google.com', email: INVOKER, email_verified: true };
  const seen = [];
  const verifier = payload => createTaskVerifier({ audience: ORIGIN, serviceAccountEmail: INVOKER, verifyIdToken: async options => { seen.push(options); return payload; } });
  assert.equal(await verifier(good)('Bearer a.b.c'), true); assert.deepEqual(seen[0], { idToken: 'a.b.c', audience: ORIGIN });
  for (const patch of [{ aud: 'https://evil.example' }, { iss: 'https://evil.example' }, { email: 'other@sincere-apex-511418-p0.iam.gserviceaccount.com' }, { email_verified: false }]) {
    assert.equal(await verifier({ ...good, ...patch })('Bearer a.b.c'), false, JSON.stringify(patch));
  }
  for (const header of [undefined, '', 'a.b.c', 'Basic a.b.c', 'Bearer not-a-jwt']) assert.equal(await verifier(good)(header), false);
  const throwing = createTaskVerifier({ audience: ORIGIN, serviceAccountEmail: INVOKER, verifyIdToken: async () => { throw Error('bad signature'); } });
  assert.equal(await throwing('Bearer a.b.c'), false);
});

const cloudEnvironment = { DROP_MAIL_ENABLED: 'true', DROP_MAIL_FROM: 'roomdrop@mail.08-08-08.com', MAIL_PEPPER: 'p'.repeat(40), DROP_MAIL_TRANSPORT: 'cloudflare',
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_EMAIL_TOKEN: TOKEN, DROP_MAIL_DEFERRAL: 'cloud-tasks', DROP_MAIL_TASKS_QUEUE: QUEUE, DROP_MAIL_TASKS_INVOKER: INVOKER, APP_ORIGIN: ORIGIN };
test('Cloudflare and Cloud Tasks settings are complete or refused; hosted runs allow inline or cloud-tasks only', () => {
  const settings = dropMailSettings(cloudEnvironment, { hosted: true });
  assert.deepEqual([settings.transport, settings.deferral, settings.queue, settings.invoker, settings.origin], ['cloudflare', 'cloud-tasks', QUEUE, INVOKER, ORIGIN]);
  assert.equal(dropMailSettings({ ...cloudEnvironment, DROP_MAIL_DEFERRAL: undefined }, { hosted: true }).deferral, 'inline');
  for (const patch of [{ CLOUDFLARE_ACCOUNT_ID: undefined }, { CLOUDFLARE_EMAIL_TOKEN: 'short' }, { DROP_MAIL_DEFERRAL: 'later' }, { DROP_MAIL_TASKS_QUEUE: 'queue' },
    { DROP_MAIL_TASKS_INVOKER: 'judge@example.test' }, { APP_ORIGIN: 'http://127.0.0.1:8080' }]) {
    assert.throws(() => dropMailSettings({ ...cloudEnvironment, ...patch }), { code: 'DROP_MAIL_CONFIG_INVALID' }, JSON.stringify(patch));
  }
  assert.throws(() => dropMailSettings({ ...cloudEnvironment, DROP_MAIL_DEFERRAL: 'provider' }, { hosted: true }), { code: 'DROP_MAIL_CONFIG_INVALID' });
});

test('end to end with stubs: the arm queues one task, the verified callback sends once through Cloudflare, retries stay single', async t => {
  let providerDown = false;
  const stub = stubFetch(url => url.startsWith('https://cloudtasks.googleapis.com/') ? respond(200, { name: 'task' })
    : providerDown ? respond(500, { success: false, errors: [], result: null }) : delivered());
  const mail = createDropMailerFromEnvironment(cloudEnvironment, { store: createMemoryDropMailStore({ environment: {}, now: NOW }), now: NOW, fetch: stub.fetch,
    accessToken: async () => 'gcp-access', verifyIdToken: async ({ idToken }) => idToken === 'good.id.token'
      ? { aud: ORIGIN, iss: 'https://accounts.google.com', email: INVOKER, email_verified: true } : { aud: ORIGIN, iss: 'https://accounts.google.com', email: 'judge@example.test', email_verified: true } });
  const bookingStorage = plannedBookings();
  const origin = await listen(t, createBookingDemoServer({ bookingStorage, sessionStorage: createMemorySessionStorage({ now: NOW }), now: NOW, mail }));
  const { contentVersion } = await bookingStorage.getBooking('AIRB000180');
  const judge = await visit(origin);
  const receipt = await (await judge.post('AIRB000180', 'watch', { snapshotVersion: contentVersion, consent: true, minimumSavingMinor: 5000, deliveryEmail: 'judge@example.test' })).json();
  assert.equal(receipt.watch.delivery.status, 'scheduled'); assert.equal(stub.calls.length, 1);
  const { task } = stub.calls[0].json; const body = Buffer.from(task.httpRequest.body, 'base64').toString('utf8');
  const callback = (authorization, payload = body) => fetch(origin + DROP_MAIL_TASK_PATH, { method: 'POST', body: payload,
    headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) } });
  for (const authorization of [undefined, 'Bearer other.id.token']) assert.equal((await callback(authorization)).status, 401);
  assert.equal((await callback('Bearer good.id.token', JSON.stringify({ ...JSON.parse(body), cc: 'x@example.test' }))).status, 400);
  providerDown = true; assert.equal((await callback('Bearer good.id.token')).status, 503);
  providerDown = false;
  assert.deepEqual(await (await callback('Bearer good.id.token')).json(), { status: 'sent' });
  assert.deepEqual(await (await callback('Bearer good.id.token')).json(), { status: 'duplicate' });
  const sends = stub.calls.filter(call => call.url.startsWith('https://api.cloudflare.com/'));
  assert.equal(sends.length, 2); assert.equal(sends.at(-1).json.to, 'judge@example.test'); assert.match(sends.at(-1).json.html, /#inbox-AIRB000180~/);
  // Without the cloud-tasks deferral the callback route does not exist.
  const plain = await listen(t, createBookingDemoServer({ bookingStorage, sessionStorage: createMemorySessionStorage({ now: NOW }), now: NOW }));
  assert.equal((await fetch(plain + DROP_MAIL_TASK_PATH, { method: 'POST', headers: { Authorization: 'Bearer good.id.token' } })).status, 404);
});
