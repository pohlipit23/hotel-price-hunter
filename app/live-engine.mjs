// Private read adapter. No public runtime imports this module.
const bases = new Set(['https://bonus.apps.easygds.com/api', 'https://mh1.apps.easygds.com/api', 'https://demo.apps.easygds.com/api']);
export const isLiveEngineBase = value => bases.has(value);
const operations = Object.freeze({
  lookup: ['GET', '/v2/bookings'], detail: ['GET', '/bookings'],
  retrieve: ['POST', '/v2/shopping/hotels/book/retrieve'],
  search: ['POST', '/v2/products/hotels/availabilities'],
  rates: ['POST', '/v2/products/hotels/availabilities/rates'],
  rooms: ['GET', '/products/hotels/rooms'],
});
export class LiveEngineError extends Error {
  constructor(code, httpStatus) {
    super('Private engine check failed.'); this.name = 'LiveEngineError'; this.code = code;
    if (httpStatus !== undefined) this.httpStatus = httpStatus;
  }
}
const fail = (code, status) => { throw new LiveEngineError(code, status); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const civilDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function validateEngineInput(operation, input) {
  if (operation === 'detail' && exactKeys(input, ['booking_code', 'cart_items_appended'])) return text(input.booking_code) && typeof input.cart_items_appended === 'boolean';
  if (['lookup', 'detail', 'retrieve'].includes(operation)) return exactKeys(input, ['booking_code']) && text(input.booking_code);
  if (operation === 'rates') return exactKeys(input, ['search_id', 'hotel_id']) && text(input.search_id) && text(input.hotel_id);
  if (operation === 'rooms') {
    const required = ['hotel_id', 'search_id', 'language_code', 'page', 'per_page', 'sort'];
    const optional = ['room_id', 'board_basis_codes', 'source_ids', 'search_text', 'cache'];
    return record(input) && required.every(key => Object.hasOwn(input, key)) && Object.keys(input).every(key => [...required, ...optional].includes(key))
      && text(input.hotel_id) && text(input.search_id) && input.language_code === 'en-US'
      && Number.isInteger(input.page) && input.page >= 1 && input.page <= 100
      && Number.isInteger(input.per_page) && input.per_page >= 1 && input.per_page <= 10
      && ['price', 'name'].includes(input.sort) && (!Object.hasOwn(input, 'cache') || typeof input.cache === 'boolean')
      && optional.filter(key => key !== 'cache').every(key => !Object.hasOwn(input, key) || text(input[key]));
  }
  if (operation !== 'search' || !exactKeys(input, ['checkin_date', 'checkout_date', 'currency_code', 'language_code', 'hotel_ids', 'rooms', 'timeout'])) return false;
  if (!civilDate(input.checkin_date) || !civilDate(input.checkout_date) || input.checkin_date >= input.checkout_date
    || !Intl.supportedValuesOf('currency').includes(input.currency_code) || input.language_code !== 'en-US'
    || !Array.isArray(input.hotel_ids) || input.hotel_ids.length !== 1 || !text(input.hotel_ids[0])
    || !Array.isArray(input.rooms) || input.rooms.length !== 1
    || !Number.isInteger(input.timeout) || input.timeout < 1000 || input.timeout > 15000) return false;
  const room = input.rooms[0];
  if (!exactKeys(room, ['idx', 'adults', 'children', 'infants']) || room.idx !== 1) return false;
  return ['adults', 'children', 'infants'].every(key => Array.isArray(room[key])
    && room[key].length <= 4 && (key !== 'adults' || room[key].length > 0)
    && room[key].every(age => Number.isInteger(age) && age >= (key === 'adults' ? 18 : 0) && age <= (key === 'adults' ? 120 : 17)));
}

async function boundedJson(response) {
  const limit = 4 * 1024 * 1024;
  if (!response.ok) { await response.body?.cancel(); fail('ENGINE_HTTP_FAILED', response.status); }
  if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel(); fail('INVALID_RESPONSE');
  }
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); fail('RESPONSE_TOO_LARGE'); }
  const chunks = []; let length = 0;
  if (!response.body) fail('INVALID_RESPONSE');
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); fail('RESPONSE_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!record(value) && !Array.isArray(value)) fail('INVALID_RESPONSE');
  return value;
}

export async function authenticateLiveEngine({ baseUrl, iamUrl, credentials, authorised, fetchImpl = fetch } = {}) {
  if (authorised !== true || !bases.has(baseUrl) || iamUrl !== 'https://iam.services.easygds.com/api'
    || !exactKeys(credentials, ['email', 'secret_key', 'scope_type', 'flow_type'])
    || !text(credentials.email) || !credentials.email.includes('@') || !text(credentials.secret_key)
    || !['System', 'Agent'].includes(credentials.scope_type) || credentials.flow_type !== 'Basic') fail('LIVE_ACCESS_NOT_CONFIGURED');
  try {
    const data = await boundedJson(await fetchImpl(new URL(iamUrl + '/auth'), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(credentials),
    }));
    const token = data?.access_token;
    if (typeof token !== 'string' || !/^[\x21-\x7e]{1,16384}$/.test(token)) fail('INVALID_AUTH_RESPONSE');
    return token;
  } catch (error) {
    if (error instanceof LiveEngineError) throw error;
    fail('ENGINE_AUTH_FAILED');
  }
}

export function createLiveEngine({ baseUrl, token, authorised, fetchImpl = fetch } = {}) {
  if (authorised !== true || !bases.has(baseUrl) || typeof token !== 'string'
    || !/^[\x21-\x7e]{1,16384}$/.test(token) || typeof fetchImpl !== 'function') fail('LIVE_ACCESS_NOT_CONFIGURED');
  return Object.freeze({
    async read(operation, input) {
      if (!Object.hasOwn(operations, operation)) fail('OPERATION_DENIED');
      if (!validateEngineInput(operation, input)) fail('INVALID_INPUT');
      const [method, path] = operations[operation]; const url = new URL(baseUrl + path);
      if (method === 'GET') for (const [key, value] of Object.entries(input)) url.searchParams.set(key, String(value));
      try {
        const response = await fetchImpl(url, { method, redirect: 'error', signal: AbortSignal.timeout(45000),
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          ...(method === 'POST' ? { body: JSON.stringify(input) } : {}) });
        return await boundedJson(response);
      } catch (error) {
        if (error instanceof LiveEngineError) throw error;
        fail('ENGINE_REQUEST_FAILED');
      }
    },
  });
}
