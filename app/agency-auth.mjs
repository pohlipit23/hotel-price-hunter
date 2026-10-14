import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export class AgencyAuthError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const reject = () => { throw new AgencyAuthError(401, 'AGENCY_SESSION_REQUIRED', 'Sign in as the local agency reviewer.'); };
const tokenValid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sameToken = (left, right) => tokenValid(left) && tokenValid(right) && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const SESSION_MS = 30 * 60 * 1000;
export const AGENCY_COOKIE = 'hph_agency';

/** This intentionally supports one local operator process, never a public deployment. */
export async function createLocalAgencyAuth({ environment = process.env, now = () => new Date(), readConfiguration = async () => JSON.parse(await readFile(new URL('../.local/agency-review.json', import.meta.url), 'utf8')) } = {}) {
  if (!environment.AGENCY_AUTH_MODE) return null;
  if (environment.AGENCY_AUTH_MODE !== 'local-review' || environment.K_SERVICE || environment.NODE_ENV === 'production'
      || environment.BIND_HOST !== '127.0.0.1' || !/^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/.test(environment.APP_ORIGIN || '')
      || !/^(localhost|127\.0\.0\.1):\d{1,5}$/.test(environment.FIRESTORE_EMULATOR_HOST || '')
      || !/^demo-[a-z0-9-]+$/.test(environment.GOOGLE_CLOUD_PROJECT || '')) {
    throw new Error('Agency local review requires a loopback bind and origin, demo project and local Firestore emulator; production is prohibited.');
  }
  const { passphrase } = await readConfiguration();
  if (typeof passphrase !== 'string' || passphrase.length < 32 || passphrase.length > 256) throw new Error('Configure the generated local agency review passphrase.');
  const salt = randomBytes(32);
  const passwordHash = scryptSync(passphrase, salt, 32);
  const sessions = new Map();
  let attempts = 0;
  let windowStarted = now().getTime();
  function purge() {
    const time = now().getTime();
    for (const [id, session] of sessions) if (Date.parse(session.expiresAt) <= time) sessions.delete(id);
  }
  return {
    mode: 'local-fixture-review',
    login(candidate) {
      purge();
      const time = now().getTime();
      if (time - windowStarted >= 15 * 60 * 1000) { attempts = 0; windowStarted = time; }
      if (attempts >= 10) throw new AgencyAuthError(429, 'AGENCY_LOGIN_RATE_LIMIT', 'Wait before trying the reviewer sign-in again.');
      attempts++;
      if (typeof candidate !== 'string' || candidate.length > 256 || !timingSafeEqual(scryptSync(candidate, salt, 32), passwordHash)) reject();
      // Rotating the single operator session also revokes cursors bound to old sessions.
      sessions.clear();
      const token = randomBytes(32).toString('hex');
      const session = { role: 'agency-reviewer', mode: 'local-fixture-review', csrfToken: randomBytes(32).toString('hex'), expiresAt: new Date(time + SESSION_MS).toISOString() };
      sessions.set(token, session);
      return { token, ...session };
    },
    authenticate(token) {
      purge();
      const session = tokenValid(token) ? sessions.get(token) : null;
      if (!session) reject();
      return { ...session };
    },
    logout(token, csrfToken) {
      const session = this.authenticate(token);
      if (!sameToken(csrfToken, session.csrfToken)) return false;
      sessions.delete(token);
      return true;
    },
  };
}
