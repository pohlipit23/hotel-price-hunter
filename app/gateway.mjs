import { isIP } from 'node:net';

const ORIGIN = 'https://hotel-offer.gateway.easygds.com';
export class GatewayReadError extends Error {
  constructor(code, httpStatus) {
    super('Private gateway read failed.'); this.name = 'GatewayReadError'; this.code = code;
    if (httpStatus !== undefined) this.httpStatus = httpStatus;
  }
}
const fail = (code, status) => { throw new GatewayReadError(code, status); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(value);
const keys = (value, expected) => record(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const validToken = value => typeof value === 'string' && /^[\x21-\x7e]{1,16384}$/.test(value);

export function validateGatewayInput(input) {
  if (!keys(input, ['ip', 'price_comparison', 'checkin', 'checkout', 'package', 'ids', 'supplier_ids', 'rooms',
    'session_id', 'user_agent', 'nationality', 'language_code', 'country_residence'])) return false;
  if (typeof input.ip !== 'string' || !isIP(input.ip) || input.price_comparison !== false || input.package !== false
    || !date(input.checkin) || !date(input.checkout) || input.checkin >= input.checkout
    || !Array.isArray(input.ids) || input.ids.length !== 1 || !text(input.ids[0])
    || !Array.isArray(input.supplier_ids) || input.supplier_ids.length > 10 || !input.supplier_ids.every(text)
    || !text(input.session_id) || !text(input.user_agent) || input.language_code !== 'en-US'
    || !/^[a-z]{2}$/.test(input.nationality) || !/^[a-z]{2}$/.test(input.country_residence)
    || !Array.isArray(input.rooms) || input.rooms.length !== 1) return false;
  const room = input.rooms[0];
  return keys(room, ['idx', 'adults', 'children', 'infants']) && room.idx === 1
    && Number.isInteger(room.adults) && room.adults >= 1 && room.adults <= 4
    && ['children', 'infants'].every(key => Array.isArray(room[key]) && room[key].length <= 4
      && room[key].every(age => Number.isInteger(age) && age >= 0 && age <= (key === 'infants' ? 2 : 17)));
}

async function requestJson(path, body, headers, fetchImpl) {
  try {
    const response = await fetchImpl(new URL(ORIGIN + path), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(body) });
    if (!response.ok) { await response.body?.cancel(); fail('GATEWAY_HTTP_FAILED', response.status); }
    if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
      await response.body?.cancel(); fail('INVALID_GATEWAY_RESPONSE');
    }
    const limit = 4 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > limit) { await response.body.cancel(); fail('GATEWAY_RESPONSE_TOO_LARGE'); }
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); fail('GATEWAY_RESPONSE_TOO_LARGE'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!record(value) || value.success !== true) fail('GATEWAY_APPLICATION_FAILED');
    return value;
  } catch (error) {
    if (error instanceof GatewayReadError) throw error;
    fail('GATEWAY_REQUEST_FAILED');
  }
}

export async function authenticateGateway({ credentials, authorised, fetchImpl = fetch } = {}) {
  if (authorised !== true || !keys(credentials, ['email', 'password']) || !text(credentials.email)
    || !credentials.email.includes('@') || !text(credentials.password)) fail('GATEWAY_ACCESS_NOT_CONFIGURED');
  const result = await requestJson('/api/v2/login', credentials, {}, fetchImpl);
  if (!validToken(result.data?.auth_token)) fail('INVALID_GATEWAY_AUTH_RESPONSE');
  return result.data.auth_token;
}

export function createGateway({ email, token, authorised, fetchImpl = fetch } = {}) {
  if (authorised !== true || !text(email) || !email.includes('@') || !validToken(token) || typeof fetchImpl !== 'function') fail('GATEWAY_ACCESS_NOT_CONFIGURED');
  return Object.freeze({
    async searchById(input) {
      if (!validateGatewayInput(input)) fail('INVALID_GATEWAY_INPUT');
      const result = await requestJson('/api/v2/search-by-id', input, { 'x-key': email, 'x-access-token': token }, fetchImpl);
      if (!text(result.request_id) || !Array.isArray(result.data)) fail('INVALID_GATEWAY_RATE_RESPONSE');
      return result;
    },
  });
}
