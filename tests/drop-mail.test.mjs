import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { armDropWatch } from '../app/domain/booking-drop-watch.mjs';
import { dropMailMessage, REPLAY_LABEL } from '../app/domain/drop-mail-template.mjs';
import { DROP_MAIL_LIMITS, addressKey, createCaptureTransport, createDisabledTransport, createDropMailer, createDropMailerFromEnvironment,
  createFirestoreDropMailStore, createMailToken, createMemoryDropMailStore, dropMailFacts, dropMailSettings, hashMailToken, mailIdFor,
  normalizeAddress, planReservation } from '../app/drop-mail.mjs';
import { createRoomdropFirestore } from '../app/booking-storage.mjs';
import { createFirestoreSessionStorage } from '../app/quotation-session-storage.mjs';
import { integration, plannedBookings } from './fixtures/roomdrop-harness.mjs';

// Drop email alerts (app/drop-mail.mjs, app/domain/drop-mail-template.mjs). Synthetic addresses only (example.test).
const SIAM = 'AIRB000180';
const ORIGIN = 'https://hotel-price-hunter-2qbcpylngq-as.a.run.app';
const PEPPER = 'p'.repeat(40);
const ARMED = new Date('2026-10-20T00:00:00Z');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const SESSION = sha256('session-one');
async function armed(minimumSavingMinor = 5000, email = 'judge@example.test') {
  const booking = await plannedBookings().getBooking(SIAM);
  const session = { csrfToken: 'c'.repeat(64), expiresAt: ARMED.getTime() + 3_600_000, byCode: {} };
  armDropWatch(session, { code: SIAM, booking, at: ARMED,
    request: { snapshotVersion: booking.contentVersion, minimumSavingMinor, expectedRevision: null, deliveryEmail: email } });
  const card = (await plannedBookings().listCatalogue()).find(entry => entry.code === SIAM).card;
  return { booking, session, card, watch: session.byCode[SIAM].watch };
}
const facts = async (minimum, email) => {
  const { booking, watch, card, session } = await armed(minimum, email);
  return dropMailFacts({ booking, watch, card, origin: ORIGIN, code: SIAM, token: 't'.repeat(43), expiresAt: session.expiresAt });
};

// ---- Template ----
test('the Drop email is a light-only, table-built HTML email with the minus stamp, the replay label and a plain-text part', async () => {
  const message = dropMailMessage(await facts(5000));
  assert.equal(message.kind, 'drop');
  // Savings 231.23 and 121.33 MYR qualify at 50.00; the best matched Drop leads, its saving as a minus stamp.
  assert.equal(message.subject, '-121 MYR on your Siam Kempinski Hotel Bangkok stay');
  assert.match(message.html, /<meta name="color-scheme" content="light only">/);
  assert.match(message.html, /<table role="presentation"/); assert.doesNotMatch(message.html, /<(script|form|iframe|input)\b/i);
  assert.match(message.html, />-121<\/div>/); assert.match(message.html, /text-decoration:line-through;">MYR 2,335\.52</);
  assert.match(message.html, /\+ 1 more drop waiting/);
  for (const output of [message.html, message.text]) assert.ok(output.includes(REPLAY_LABEL));
  assert.ok(message.html.includes(`href="${ORIGIN}/#inbox-${SIAM}~${'t'.repeat(43)}"`));
  // Every image is absolute from the app origin and has alt text; the hotel photo keeps its reviewed alt.
  const images = [...message.html.matchAll(/<img [^>]*>/g)].map(match => match[0]);
  assert.ok(images.length >= 2);
  for (const image of images) { assert.match(image, new RegExp(`src="${ORIGIN}/assets/`)); assert.match(image, /alt="[^"]*"/); }
  assert.ok(message.html.includes('alt="Siam Kempinski Hotel Bangkok and its pool gardens"'));
  assert.match(message.text, /^Your room dropped: -121 MYR$/m); assert.match(message.text, new RegExp(`See my drops: ${ORIGIN}/#inbox-`));
  assert.match(message.html, /max-width:560px/); assert.doesNotMatch(message.html + message.text + message.subject, /[–—]/);
});

test('with nothing above the minimum the email says so honestly: no saving, no stamp amount, the same replay label', async () => {
  const message = dropMailMessage(await facts(10_000_00));
  assert.equal(message.kind, 'nothing-yet');
  assert.equal(message.subject, 'No drop yet on your Siam Kempinski Hotel Bangkok stay');
  assert.match(message.html, /No drop yet/); assert.match(message.html, />On<\/div>\s*<div[^>]*>Watching<\/div>/);
  assert.match(message.html, /Nothing at least <strong[^>]*>-10,000 MYR<\/strong> in this check/);
  assert.doesNotMatch(message.html, /line-through|Your room dropped|more drop/);
  assert.ok(message.html.includes(REPLAY_LABEL)); assert.ok(message.text.includes(REPLAY_LABEL));
  assert.match(message.text, /^Open my Drop Watch: https:/m);
});

test('the template carries no judge-supplied text: only catalogue facts and the masked address', async () => {
  const message = dropMailMessage(await facts(5000, '"><img src=x onerror=alert(1)>@example.test'));
  for (const output of [message.html, message.text, message.subject]) {
    assert.doesNotMatch(output, /onerror|<img src=x/);
  }
  assert.ok(message.html.includes('Someone armed this Drop Watch with &quot;***@example.test.'));
  assert.ok(message.text.includes('Someone armed this Drop Watch with "***@example.test.'));
  // The template refuses links off the app origin, a foreign photo host and unparseable facts.
  const good = await facts(5000);
  for (const patch of [{ origin: 'https://evil.example' }, { link: 'https://evil.example/#inbox-AIRB000180~x' }, { origin: 'http://hotel.example' },
    { photo: { url: 'https://evil.example/a.jpg', alt: '' } }, { maskedEmail: 'judge@example.test' }, { drops: [{ ...good.drops[0], savingMinor: 0 }] }]) {
    assert.throws(() => dropMailMessage({ ...good, ...patch }), { code: 'DROP_MAIL_INVALID' });
  }
});

// ---- Tokens, addresses and configuration ----
test('link tokens are 32 random bytes in base64url; only their sha256 is ever stored', () => {
  const { token, hash } = createMailToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/); assert.equal(hash, sha256(token)); assert.equal(hashMailToken(token), hash);
  assert.notEqual(createMailToken().token, token);
  for (const bad of [undefined, '', 'x'.repeat(42), 'x'.repeat(44), 'x'.repeat(42) + '=', { token }]) assert.equal(hashMailToken(bad), null);
  assert.match(mailIdFor(SESSION, SIAM, 1), /^mail-[a-f0-9]{32}$/); assert.notEqual(mailIdFor(SESSION, SIAM, 1), mailIdFor(SESSION, SIAM, 2));
});

test('addresses normalise for caps (case, spaces, +tags, Gmail dots) and are keyed by a peppered HMAC', () => {
  assert.equal(normalizeAddress('  John.Doe+promo@GoogleMail.com '), 'johndoe@gmail.com');
  assert.equal(normalizeAddress('J.Doe+x@Example.Test'), 'j.doe@example.test');
  assert.equal(normalizeAddress('+only@example.test'), '+only@example.test');
  assert.equal(addressKey('JohnDoe@gmail.com', PEPPER), addressKey('john.doe+drops@googlemail.com', PEPPER));
  assert.notEqual(addressKey('judge@example.test', PEPPER), addressKey('judge@example.test', 'q'.repeat(40)));
  assert.match(addressKey('judge@example.test', PEPPER), /^[a-f0-9]{64}$/);
  assert.throws(() => addressKey('judge@example.test', 'short'), { code: 'DROP_MAIL_CONFIG_INVALID' });
  assert.throws(() => normalizeAddress('no-at-sign'), { code: 'DELIVERY_EMAIL_INVALID' });
});

test('Drop email is off by default; on needs a sender, a pepper and a named transport; hosted never captures', () => {
  const on = { DROP_MAIL_ENABLED: 'true', DROP_MAIL_FROM: 'drops@roomdrop.example', MAIL_PEPPER: PEPPER, DROP_MAIL_TRANSPORT: 'capture' };
  assert.equal(dropMailSettings({}), null); assert.equal(dropMailSettings({ DROP_MAIL_ENABLED: 'false', MAIL_PEPPER: PEPPER }), null);
  assert.deepEqual(dropMailSettings(on), { transport: 'capture', from: on.DROP_MAIL_FROM, pepper: PEPPER });
  assert.equal(dropMailSettings({ ...on, DROP_MAIL_TRANSPORT: 'disabled' }, { hosted: true }).transport, 'disabled');
  for (const patch of [{ DROP_MAIL_ENABLED: 'yes' }, { DROP_MAIL_ENABLED: '' }, { DROP_MAIL_FROM: 'not-an-address' }, { MAIL_PEPPER: 'short' },
    { DROP_MAIL_TRANSPORT: undefined }, { DROP_MAIL_TRANSPORT: 'smtp' }]) {
    assert.throws(() => dropMailSettings({ ...on, ...patch }), { code: 'DROP_MAIL_CONFIG_INVALID' });
  }
  assert.throws(() => dropMailSettings(on, { hosted: true }), { code: 'DROP_MAIL_CONFIG_INVALID' });
  assert.equal(createDropMailerFromEnvironment({}, {}), null);
  assert.throws(() => createDropMailerFromEnvironment(on, {}), { code: 'DROP_MAIL_CONFIG_INVALID' });
  assert.throws(() => createCaptureTransport({ environment: { K_SERVICE: 'hotel-price-hunter' } }));
  assert.throws(() => createMemoryDropMailStore({ environment: { NODE_ENV: 'production' } }));
});

// ---- Caps and delivery ----
function mailer({ limits, transport = createCaptureTransport({ from: 'drops@roomdrop.example', environment: {} }), clock = { time: ARMED.getTime() }, ...options } = {}) {
  const now = () => new Date(clock.time);
  const store = createMemoryDropMailStore({ environment: {}, now, limits });
  return { store, transport, clock, mail: createDropMailer({ store, transport, pepper: PEPPER, now, ...options }) };
}
async function deliver(mail, { session = SESSION, revision = 1, email = 'judge@example.test', minimum = 5000, expiresAt = ARMED.getTime() + 3_600_000 } = {}) {
  const { booking, card, watch } = await armed(minimum, email);
  return mail.deliver({ sessionId: session, expiresAt, code: SIAM, watch: { ...watch, revision }, booking, card, origin: ORIGIN });
}

test('one email per arm revision, scheduled a minute out with a stable idempotency key; at most two per session', async () => {
  const { mail, transport, store } = mailer();
  const first = await deliver(mail);
  assert.deepEqual(first, { status: 'scheduled', mailId: mailIdFor(SESSION, SIAM, 1) });
  assert.equal(await deliver(mail), null); assert.equal(transport.sent.length, 1);
  const [sent] = transport.sent;
  assert.deepEqual(Object.keys(sent).sort(), ['from', 'html', 'id', 'idempotencyKey', 'sendAt', 'subject', 'text', 'to']);
  assert.equal(sent.sendAt, '2026-10-20T00:01:00.000Z'); assert.equal(sent.idempotencyKey, first.mailId); assert.equal(sent.to, 'judge@example.test');
  // The stored link is the token's digest, never the token, and lives exactly as long as the session.
  const token = /#inbox-AIRB000180~([A-Za-z0-9_-]{43})"/.exec(sent.html)[1];
  const link = await store.peek(sha256(token));
  assert.deepEqual(link, { sourceSessionId: SESSION, code: SIAM, watchRevision: 1, mailId: first.mailId, expiresAt: ARMED.getTime() + 3_600_000, uses: 0, maxUses: 3 });
  assert.equal(store.documents.links.has(token), false);
  assert.deepEqual((await deliver(mail, { revision: 2 })).status, 'scheduled');
  assert.deepEqual(await deliver(mail, { revision: 3 }), { status: 'capped' });
  assert.equal(transport.sent.length, 2);
  // Every stored record carries ttlAt: links and session counts at the session's end, day counters at UTC midnight.
  assert.equal(store.documents.sessions.get(SESSION).ttlAt.toISOString(), '2026-10-20T01:00:00.000Z');
  for (const name of ['ledger', 'capacity']) for (const value of store.documents[name].values()) assert.equal(value.ttlAt.toISOString(), '2026-10-21T00:00:00.000Z');
  for (const value of store.documents.links.values()) assert.equal(value.ttlAt.toISOString(), '2026-10-20T01:00:00.000Z');
});

test('at most three emails per normalised address a day and fifty in all; the next day starts again', async () => {
  const { mail, clock } = mailer();
  const sessions = [1, 2, 3, 4].map(index => sha256('judge-' + index));
  const statuses = [];
  for (const [index, session] of sessions.entries()) statuses.push((await deliver(mail, { session, email: index % 2 ? 'Judge+x@example.test' : 'judge@example.test' })).status);
  assert.deepEqual(statuses, ['scheduled', 'scheduled', 'scheduled', 'capped']);
  clock.time += 86_400_000;
  assert.equal((await deliver(mail, { session: sessions[3], expiresAt: clock.time + 3_600_000 })).status, 'scheduled');
  const daily = mailer({ limits: { ...DROP_MAIL_LIMITS, perDay: 2 } });
  const results = [];
  for (const index of [1, 2, 3]) results.push((await deliver(daily.mail, { session: sha256('daily-' + index), email: `judge${index}@example.test` })).status);
  assert.deepEqual(results, ['scheduled', 'scheduled', 'capped']);
  assert.deepEqual(planReservation({ session: null, ledger: { day: '2026-10-19', count: 3 }, capacity: null },
    { sessionId: SESSION, code: SIAM, watchRevision: 1, mailId: 'm', expiresAt: 1, time: ARMED.getTime() }).outcome, { status: 'reserved', mailId: 'm' });
});

test('a failed, slow or disabled transport never throws: the outcome is failed, and a disabled one spends no cap', async () => {
  const broken = mailer({ transport: { name: 'broken', async send() { throw Error('PRIVATE-provider'); } } });
  assert.deepEqual(await deliver(broken.mail), { status: 'failed', mailId: mailIdFor(SESSION, SIAM, 1) });
  const slow = mailer({ timeoutMs: 20, transport: { name: 'slow', send: () => new Promise(() => {}) } });
  const started = Date.now(); assert.equal((await deliver(slow.mail)).status, 'failed'); assert.ok(Date.now() - started < 2000);
  const disabled = mailer({ transport: createDisabledTransport() });
  assert.deepEqual(await deliver(disabled.mail), { status: 'failed' }); assert.equal(disabled.store.documents.links.size, 0);
  // Sending now instead of provider scheduling reports sent, with no sendAt.
  const now = mailer({ deferral: 'now' });
  assert.equal((await deliver(now.mail)).status, 'sent'); assert.equal(now.transport.sent[0].sendAt, null);
  // A session about to end gets no email: the link would be dead on arrival.
  assert.deepEqual(await deliver(mailer().mail, { expiresAt: ARMED.getTime() + 120_000 }), { status: 'capped' });
  assert.throws(() => createDropMailer({ store: broken.store, transport: createDisabledTransport(), pepper: PEPPER, deferral: 'later' }));
});

// ---- Real Firestore emulator: the fork transaction and ttlAt, test-owned collections only ----
test('Firestore: an inbox link forks the source session once per use, copies one code, keeps the expiry and sets ttlAt', integration, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const firestore = await createRoomdropFirestore(process.env); const prefix = `test-${randomUUID()}-roomdrop`;
  t.after(async () => {
    for (const name of ['PublicSessionsV1', 'PublicSessionsV1Capacity', 'DropMailV1', 'DropMailSessionsV1', 'DropMailLedgerV1', 'DropMailCapacityV1']) {
      await firestore.recursiveDelete(firestore.collection(prefix + name));
    }
    await firestore.terminate();
  });
  const clock = { time: ARMED.getTime() }; const now = () => new Date(clock.time);
  const sessions = createFirestoreSessionStorage({ firestore, prefix, now, maxSessions: 8 });
  const store = createFirestoreDropMailStore({ firestore, prefix, now });
  const transport = createCaptureTransport({ from: 'drops@roomdrop.example', environment: {} });
  const mail = createDropMailer({ store, transport, pepper: PEPPER, now });
  const source = await sessions.create(); const sourceId = sha256(source.cookieValue);
  const { booking, card } = await armed();
  await sessions.transact(source.cookieValue, draft => armDropWatch(draft, { code: SIAM, booking, at: ARMED,
    request: { snapshotVersion: booking.contentVersion, minimumSavingMinor: 5000, expectedRevision: null, deliveryEmail: 'judge@example.test' } }));
  const stored = await sessions.get(source.cookieValue);
  // Another code in the source session must not travel with the fork.
  await sessions.transact(source.cookieValue, draft => { draft.byCode.AIRB000179 = { contentVersion: 'a'.repeat(64), dropSetVersion: 'b'.repeat(64), watch: null }; });
  const outcome = await mail.deliver({ sessionId: sourceId, expiresAt: stored.expiresAt, code: SIAM, watch: stored.byCode[SIAM].watch, booking, card, origin: ORIGIN });
  assert.equal(outcome.status, 'scheduled');
  assert.equal(await mail.deliver({ sessionId: sourceId, expiresAt: stored.expiresAt, code: SIAM, watch: stored.byCode[SIAM].watch, booking, card, origin: ORIGIN }), null);
  const token = /#inbox-AIRB000180~([A-Za-z0-9_-]{43})"/.exec(transport.sent[0].html)[1]; const hash = hashMailToken(token);
  // ttlAt is a Timestamp on every record this feature writes.
  const ttl = async (name, id) => (await firestore.collection(prefix + name).doc(id).get()).data().ttlAt.toDate().toISOString();
  assert.equal(await ttl('DropMailV1', hash), new Date(stored.expiresAt).toISOString());
  assert.equal(await ttl('DropMailSessionsV1', sourceId), new Date(stored.expiresAt).toISOString());
  assert.equal(await ttl('DropMailLedgerV1', addressKey('judge@example.test', PEPPER)), '2026-10-21T00:00:00.000Z');
  assert.equal(await ttl('DropMailCapacityV1', '2026-10-20'), '2026-10-21T00:00:00.000Z');
  assert.doesNotMatch(JSON.stringify((await firestore.collection(prefix + 'DropMailV1').doc(hash).get()).data()), new RegExp(token));

  clock.time += 600_000;
  // Concurrent redemptions: exactly maxUses forks commit, each with only this code and the source's expiry.
  const attempts = await Promise.allSettled([1, 2, 3, 4].map(() => sessions.fork(SIAM, store.claim(hash, SIAM))));
  const opened = attempts.filter(item => item.status === 'fulfilled').map(item => item.value);
  const refused = attempts.filter(item => item.status === 'rejected').map(item => item.reason.code);
  assert.equal(opened.length, 3); assert.deepEqual(refused, ['MAIL_LINK_USED']);
  for (const { cookieValue, session } of opened) {
    assert.deepEqual(Object.keys(session.byCode), [SIAM]); assert.equal(session.expiresAt, stored.expiresAt);
    assert.notEqual(session.csrfToken, stored.csrfToken); assert.deepEqual(session.byCode[SIAM].watch, stored.byCode[SIAM].watch);
    assert.equal(await ttl('PublicSessionsV1', sha256(cookieValue)), new Date(stored.expiresAt).toISOString());
    assert.equal((await sessions.get(cookieValue)).csrfToken, session.csrfToken);
  }
  assert.equal((await store.peek(hash)).uses, 3);
  await assert.rejects(sessions.fork(SIAM, store.claim(hash, SIAM)), { code: 'MAIL_LINK_USED' });
  await assert.rejects(sessions.fork('AIRB000179', store.claim(hash, 'AIRB000179')), { code: 'MAIL_LINK_EXPIRED' });
  clock.time = stored.expiresAt;
  await assert.rejects(sessions.fork(SIAM, store.claim(hash, SIAM)), { code: 'MAIL_LINK_EXPIRED' });
});
