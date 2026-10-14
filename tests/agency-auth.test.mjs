import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAgencyAuth } from '../app/agency-auth.mjs';

const environment = { AGENCY_AUTH_MODE: 'local-review', APP_ORIGIN: 'http://127.0.0.1:8080', BIND_HOST: '127.0.0.1', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081', GOOGLE_CLOUD_PROJECT: 'demo-hotel-price-hunter' };
const passphrase = 'test-only-operator-passphrase-'.repeat(3);
const configured = options => createLocalAgencyAuth({ environment, readConfiguration: async () => ({ passphrase }), ...options });

test('agency authentication defaults closed and local activation rejects public production and unsafe configuration', async () => {
  assert.equal(await createLocalAgencyAuth({ environment: {} }), null);
  for (const mutation of [{ K_SERVICE: 'service' }, { NODE_ENV: 'production' }, { APP_ORIGIN: 'https://review.example' }, { BIND_HOST: '0.0.0.0' }, { FIRESTORE_EMULATOR_HOST: undefined }, { GOOGLE_CLOUD_PROJECT: 'real-project' }, { AGENCY_AUTH_MODE: 'public' }]) {
    await assert.rejects(configured({ environment: { ...environment, ...mutation } }));
  }
  await assert.rejects(configured({ readConfiguration: async () => ({ passphrase: 'short' }) }));
});

test('agency sessions require the secret, rotate previous sessions, expire and revoke without exposing passphrases', async () => {
  let time = Date.parse('2026-10-15T03:00:00Z');
  const auth = await configured({ now: () => new Date(time) });
  assert.throws(() => auth.login('wrong'), { status: 401 });
  const first = auth.login(passphrase);
  assert.match(first.token, /^[a-f0-9]{64}$/);
  assert.equal(auth.authenticate(first.token).role, 'agency-reviewer');
  const second = auth.login(passphrase, first.token);
  assert.throws(() => auth.authenticate(first.token), { status: 401 });
  assert.doesNotMatch(JSON.stringify(auth.authenticate(second.token)), new RegExp(passphrase));
  assert.equal(auth.logout(second.token, 'wrong'), false);
  assert.equal(auth.authenticate(second.token).role, 'agency-reviewer');
  assert.equal(auth.logout(second.token, second.csrfToken), true);
  assert.throws(() => auth.authenticate(second.token), { status: 401 });
  const third = auth.login(passphrase);
  time += 30 * 60 * 1000;
  assert.throws(() => auth.authenticate(third.token), { status: 401 });
});

test('agency login attempts are bounded and expired attempt windows recover', async () => {
  let time = 0;
  const auth = await configured({ now: () => new Date(time) });
  for (let attempt = 0; attempt < 10; attempt++) assert.throws(() => auth.login('wrong'), { status: 401 });
  assert.throws(() => auth.login(passphrase), { status: 429 });
  time += 15 * 60 * 1000;
  assert.equal(auth.authenticate(auth.login(passphrase).token).role, 'agency-reviewer');
});
