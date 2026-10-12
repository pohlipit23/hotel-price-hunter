// Read-only historical contract: ../booking_agent/docs/HOTEL_BOOKING_FLOW.md
// Defaults to offline inspection. Never authenticates, prebooks, books or cancels.
import { readFile } from 'node:fs/promises';

const operations = Object.freeze({
  lookup: { method: 'GET', path: '/v2/bookings' },
  detail: { method: 'GET', path: '/bookings' },
  retrieve: { method: 'POST', path: '/v2/shopping/hotels/book/retrieve' },
  search: { method: 'POST', path: '/v2/products/hotels/availabilities' },
  rates: { method: 'POST', path: '/v2/products/hotels/availabilities/rates' },
});
const approvedHistoricalBases = new Set([
  'https://bonus.apps.easygds.com/api',
  'https://mh1.apps.easygds.com/api',
]);
const argv = process.argv.slice(2);
const execute = argv.includes('--execute');
const operation = argv.find((arg) => arg.startsWith('--operation='))?.slice(12) || 'lookup';
const inputPath = argv.find((arg) => arg.startsWith('--input='))?.slice(8);
const report = { checkedAt: new Date().toISOString(), operation, status: 'not-attempted' };
const present = (key) => Boolean(process.env[key]);
const output = () => console.log(JSON.stringify(report, null, 2));
const fail = (reason) => { report.status = 'blocked'; report.reason = reason; output(); process.exitCode = 1; };

function validateInput(name, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const expected = {
    lookup: ['booking_code'], detail: ['booking_code'], retrieve: ['booking_code'],
    rates: ['search_id', 'hotel_id'],
    search: ['checkin_date', 'checkout_date', 'currency_code', 'language_code', 'hotel_ids', 'rooms', 'timeout'],
  }[name];
  if (Object.keys(input).some((key) => !expected.includes(key))) return false;
  if (name !== 'search') return expected.every((key) => typeof input[key] === 'string' && input[key].length > 0 && input[key].length <= 512);
  return /^\d{4}-\d{2}-\d{2}$/.test(input.checkin_date) && /^\d{4}-\d{2}-\d{2}$/.test(input.checkout_date)
    && input.checkin_date < input.checkout_date && /^[A-Z]{3}$/.test(input.currency_code)
    && input.language_code === 'en-US' && Array.isArray(input.hotel_ids) && input.hotel_ids.length === 1
    && typeof input.hotel_ids[0] === 'string' && input.hotel_ids[0].length > 0
    && Array.isArray(input.rooms) && input.rooms.length === 1 && input.rooms[0].idx === 1
    && Object.keys(input.rooms[0]).every((key) => ['idx', 'adults', 'children', 'infants'].includes(key))
    && ['adults', 'children', 'infants'].every((key) => Array.isArray(input.rooms[0][key])
      && input.rooms[0][key].every((age) => Number.isInteger(age) && age >= 0 && age <= 120))
    && input.rooms[0].adults.length > 0 && input.rooms[0].adults.length <= 4
    && input.rooms[0].children.length <= 4 && input.rooms[0].infants.length <= 4
    && Number.isInteger(input.timeout) && input.timeout >= 1000 && input.timeout <= 15000;
}

// Emit only fixed field-presence facts; never raw IDs, names, prices, tokens or errors.
function summarise(value) {
  const knownFields = ['shopping_id', 'booking_code', 'status', 'hotel', 'flight', 'travel_start_date',
    'travel_end_date', 'travelers', 'products', 'currency_code', 'search_id', 'expire_at', 'hotels',
    'total', 'offers', 'rooms', 'price_info', 'currency_info', 'supplier_info', 'cancellations', 'original_cancellations'];
  const objects = Array.isArray(value) ? value : [value];
  return {
    topLevelArray: Array.isArray(value),
    recordCount: objects.length,
    fieldPresence: Object.fromEntries(knownFields.map((field) => [field, objects.some((record) => record && Object.hasOwn(record, field))])),
    mappingsVerified: false,
    note: 'HTTP success and field presence do not verify retail/refund currency, conditions or fulfilment semantics.',
  };
}

if (!Object.hasOwn(operations, operation)) {
  fail('Operation is outside the explicit read allowlist. Prebook/final-check is excluded.');
} else if (!execute) {
  report.mode = 'offline';
  report.configurationPresence = Object.fromEntries(['HPH_ALTOVO_BASE_URL', 'HPH_ALTOVO_READ_TOKEN', 'HPH_ALTOVO_READ_AUTHORISED'].map((key) => [key, present(key)]));
  report.requirements = ['Explicit tenant and booking/search ownership', 'Owner-supplied existing bearer token in HPH_ALTOVO_READ_TOKEN',
    'HPH_ALTOVO_READ_AUTHORISED=yes after scope verification', 'Private JSON input path; never commit real booking inputs',
    'Historical endpoints require current contract verification'];
  output();
} else if (process.env.HPH_ALTOVO_READ_AUTHORISED !== 'yes' || !present('HPH_ALTOVO_READ_TOKEN') || !inputPath) {
  fail('Explicit read authority, existing bearer token and private input are required.');
} else if (!approvedHistoricalBases.has(process.env.HPH_ALTOVO_BASE_URL)) {
  fail('Base URL is outside the documented historical host allowlist. Verify documentation before expanding it.');
} else {
  try {
    const input = JSON.parse(await readFile(inputPath, 'utf8'));
    if (!validateInput(operation, input)) throw new Error('invalid-input');
    const definition = operations[operation];
    const url = new URL(process.env.HPH_ALTOVO_BASE_URL + definition.path);
    if (definition.method === 'GET') url.searchParams.set('booking_code', input.booking_code);
    report.status = 'attempted';
    const response = await fetch(url, {
      method: definition.method, redirect: 'error', signal: AbortSignal.timeout(45000),
      headers: { Authorization: `Bearer ${process.env.HPH_ALTOVO_READ_TOKEN}`, 'Content-Type': 'application/json' },
      ...(definition.method === 'POST' ? { body: JSON.stringify(input) } : {}),
    });
    report.httpStatus = response.status;
    report.status = response.ok ? 'success' : 'failed';
    if (response.ok) {
      const data = await response.json();
      report.response = summarise(data);
    }
    output();
    if (!response.ok) process.exitCode = 1;
  } catch {
    // Do not print exception messages: they may include URLs, booking codes or server data.
    if (report.status === 'attempted' || report.status === 'success') {
      report.status = 'failed';
      report.reason = 'Request or response processing failed; no raw output retained.';
      output();
      process.exitCode = 1;
    } else {
      fail('Private input is unreadable or outside the fixed schema.');
    }
  }
}
