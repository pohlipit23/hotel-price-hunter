import { createHash } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { AgencyAuthError } from './agency-auth.mjs';

const KEY_URL = 'https://www.gstatic.com/iap/verify/public_key';
const ISSUER = 'https://cloud.google.com/iap';
const HEADER = 'x-goog-iap-jwt-assertion';
const KEY_TIMEOUT_MS = 3000;
const MAX_LIFETIME_SECONDS = 660;
const validSubject = value => typeof value === 'string' && /^[\x21-\x7e]{1,256}$/.test(value) && !value.includes('*');
const deny = () => { throw new AgencyAuthError(401, 'AGENCY_SESSION_REQUIRED', 'Sign in with an authorised Google IAP operator account.'); };
const keysUnavailable = () => new AgencyAuthError(503, 'AGENCY_IAP_KEYS_UNAVAILABLE', 'Operator verification is temporarily unavailable. Retry shortly.');
const hash = value => createHash('sha256').update(value).digest('hex');

function configuration(environment) {
  const surface = environment.APP_SURFACE || 'customer';
  if (!['customer', 'agency'].includes(surface) || (surface === 'agency') !== (environment.AGENCY_AUTH_MODE === 'iap')) {
    throw new Error('APP_SURFACE=agency and AGENCY_AUTH_MODE=iap must be configured together.');
  }
  if (environment.AGENCY_AUTH_MODE !== 'iap') return null;
  let origin;
  try { origin = new URL(environment.APP_ORIGIN); } catch { /* Rejected by the validation below. */ }
  const audience = environment.AGENCY_IAP_AUDIENCE;
  const binding = typeof audience === 'string' && /^\/projects\/([1-9][0-9]{0,29})\/locations\/([a-z]+-[a-z]+[0-9]+)\/services\/([a-z][a-z0-9-]{0,47}[a-z0-9]|[a-z])$/.exec(audience);
  if (environment.NODE_ENV !== 'production' || !environment.K_SERVICE || !binding || binding[3] !== environment.K_SERVICE
      || !origin || origin.protocol !== 'https:' || origin.origin !== environment.APP_ORIGIN || origin.username || origin.password
      || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(environment.GOOGLE_CLOUD_PROJECT || '') || environment.GOOGLE_CLOUD_PROJECT.startsWith('demo-')
      || Object.entries(environment).some(([key, value]) => /EMULATOR_HOST$/.test(key) && value)
      || environment.GEMINI_MODEL) {
    throw new Error('IAP agency access requires a production agency service, exact HTTPS origin, bound Cloud Run audience and live project without emulator or advisor configuration.');
  }
  let subjects;
  try {
    if (typeof environment.AGENCY_IAP_ALLOWED_SUBJECTS !== 'string' || environment.AGENCY_IAP_ALLOWED_SUBJECTS.length > 28000) throw new Error();
    subjects = JSON.parse(environment.AGENCY_IAP_ALLOWED_SUBJECTS);
  } catch { throw new Error('Configure a bounded JSON array of exact operator IAP subjects.'); }
  if (!Array.isArray(subjects) || subjects.length < 1 || subjects.length > 100 || subjects.some(value => !validSubject(value)) || new Set(subjects).size !== subjects.length) {
    throw new Error('Configure 1–100 unique exact operator IAP subjects without wildcards or whitespace.');
  }
  return { audience, subjects: new Set(subjects) };
}

function assertionFrom(request) {
  const assertion = request?.headers?.[HEADER];
  const raw = request?.rawHeaders;
  if (raw && raw.filter((_, index) => index % 2 === 0 && raw[index].toLowerCase() === HEADER).length !== 1) deny();
  if (typeof assertion !== 'string' || assertion.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(assertion)) deny();
  return assertion;
}

function claimsFrom(assertion, audience, time) {
  let header, claims;
  try {
    const parts = assertion.split('.');
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { deny(); }
  if (!header || typeof header !== 'object' || Array.isArray(header) || header.alg !== 'ES256' || typeof header.kid !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(header.kid)
      || 'jku' in header || 'x5u' in header || 'crit' in header
      || !claims || !validSubject(claims.sub) || claims.iss !== ISSUER || typeof claims.aud !== 'string' || claims.aud !== audience
      || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
      || claims.iat <= 0 || claims.exp <= claims.iat || claims.exp - claims.iat > MAX_LIFETIME_SECONDS
      || claims.iat > time / 1000 + 30 || claims.exp * 1000 <= time) deny();
  return claims;
}

function keyLifetime(response) {
  const readHeader = name => response?.headers?.get?.(name) ?? response?.headers?.[name] ?? '';
  const control = String(readHeader('cache-control'));
  if (/(?:^|,)\s*(?:no-store|no-cache)\b/i.test(control)) return 0;
  const match = /(?:^|,)\s*max-age=(\d+)(?:\s*(?:,|$))/i.exec(control);
  const maxAge = match ? Math.min(Number(match[1]), 3600) : 300;
  const age = /^\d+$/.test(String(readHeader('age'))) ? Number(readHeader('age')) : 0;
  return Math.max(0, maxAge - age) * 1000;
}

/** No credentials or ADC are used: only the fixed public IAP signing-key endpoint. */
export function createIapAgencyAuth({ environment = process.env, now = () => new Date(), oauthClient } = {}) {
  const config = configuration(environment);
  if (!config) return null;
  const client = oauthClient || new OAuth2Client();
  client.endpoints.oauth2IapPublicKeyUrl = KEY_URL;
  const transportRequest = client.transporter.request.bind(client.transporter);
  // getIapPublicKeys supplies its own retry defaults, so enforce limits at the transport boundary.
  client.transporter.request = options => {
    if (options.url?.toString() !== KEY_URL) throw keysUnavailable();
    return transportRequest({ ...options, url: KEY_URL, timeout: KEY_TIMEOUT_MS, retry: false, retryConfig: { retry: 0 }, redirect: 'error', maxRedirects: 0, maxContentLength: 65536 });
  };
  let cached = null;
  let pending = null;
  const sessions = new WeakSet();
  async function publicKeys() {
    if (cached && cached.expiresAt > now().getTime()) return cached.keys;
    if (!pending) pending = (async () => {
      let timer;
      try {
        const result = await Promise.race([
          client.getIapPublicKeys(),
          new Promise((_, reject) => { timer = setTimeout(() => reject(keysUnavailable()), KEY_TIMEOUT_MS); }),
        ]);
        const keys = result.pubkeys;
        if (!keys || typeof keys !== 'object' || Array.isArray(keys) || Object.keys(keys).length < 1 || Object.keys(keys).length > 100
            || Object.values(keys).some(value => typeof value !== 'string' || value.length > 16384)
            || Buffer.byteLength(JSON.stringify(keys)) > 65536) throw keysUnavailable();
        cached = { keys, expiresAt: now().getTime() + keyLifetime(result.res) };
        return keys;
      } catch { throw keysUnavailable(); }
      finally { clearTimeout(timer); pending = null; }
    })();
    return pending;
  }
  return {
    mode: 'google-iap',
    async authenticate(request) {
      const assertion = assertionFrom(request);
      const claims = claimsFrom(assertion, config.audience, now().getTime());
      const keys = await publicKeys();
      try {
        await client.verifySignedJwtWithCertsAsync(assertion, keys, config.audience, [ISSUER], MAX_LIFETIME_SECONDS + 30);
      } catch { deny(); }
      // The Google verifier allows a broad clock skew; access always uses the hard signed expiry.
      claimsFrom(assertion, config.audience, now().getTime());
      if (!config.subjects.has(claims.sub)) deny();
      const session = { role: 'agency-reviewer', mode: 'google-iap', expiresAt: new Date(claims.exp * 1000).toISOString() };
      Object.defineProperty(session, 'cursorBinding', { value: hash(`${claims.sub}\0${hash(assertion)}`) });
      Object.freeze(session);
      sessions.add(session);
      return session;
    },
    recheck(session) {
      if (!sessions.has(session) || Date.parse(session.expiresAt) <= now().getTime()) deny();
    },
  };
}
