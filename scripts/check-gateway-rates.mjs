import { readFile, realpath, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { authenticateGateway, createGateway, validateGatewayInput, GatewayReadError } from '../app/gateway.mjs';
import { normaliseGatewayRates } from '../app/domain/gateway-rates.mjs';

const fail = code => { throw new GatewayReadError(code); };
const within = (parent, path) => { const part = relative(parent, path); return part && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part); };
async function privatePath(root, path) {
  const workspace = await realpath(root); const local = await realpath(resolve(workspace, '.local'));
  if (local !== resolve(workspace, '.local')) fail('PRIVATE_PATH_REQUIRED');
  const target = await realpath(resolve(workspace, path));
  if (!within(local, target)) fail('PRIVATE_PATH_REQUIRED');
  return target;
}
async function boundedFile(path) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > 65536) fail('INVALID_PRIVATE_INPUT');
  return readFile(path, 'utf8');
}

export async function main(args = process.argv.slice(2), { env = process.env, fetchImpl = fetch,
  root = fileURLToPath(new URL('../', import.meta.url)), now = () => new Date() } = {}) {
  const report = { checkedAt: now().toISOString(), mode: 'offline', status: 'not-attempted' };
  try {
    if (args.some(arg => !['--execute', '--save'].includes(arg) && !arg.startsWith('--input=') && !arg.startsWith('--credentials-file='))
      || ['--input=', '--credentials-file='].some(prefix => args.filter(arg => arg.startsWith(prefix)).length > 1)
      || new Set(args).size !== args.length || (args.includes('--save') && !args.includes('--execute'))) fail('INVALID_ARGUMENTS');
    if (!args.includes('--execute')) {
      report.requirements = ['Owner-selected Gateway-enabled credential file', 'Private .local single-hotel input',
        'Explicit --execute; --save for a new private normalised snapshot'];
      return report;
    }
    report.mode = 'direct-gateway-source-only';
    if (env.NODE_ENV === 'production' || env.K_SERVICE || env.CLOUD_RUN_JOB) fail('LOCAL_RUNNER_ONLY');
    const inputArg = args.find(arg => arg.startsWith('--input='))?.slice(8);
    const credentialsArg = args.find(arg => arg.startsWith('--credentials-file='))?.slice(19);
    if (!inputArg || !credentialsArg) fail('GATEWAY_ACCESS_NOT_CONFIGURED');
    const input = JSON.parse(await boundedFile(await privatePath(root, inputArg)));
    const expected = ['hotelId', 'checkin', 'checkout', 'adults', 'childAges', 'infantAges', 'nationality', 'countryResidence'];
    if (!input || Array.isArray(input) || Object.keys(input).length !== expected.length || !expected.every(key => Object.hasOwn(input, key))) fail('INVALID_GATEWAY_INPUT');
    const runId = randomUUID();
    const query = { ip: '127.0.0.1', price_comparison: false, checkin: input.checkin, checkout: input.checkout, package: false,
      ids: [input.hotelId], supplier_ids: [], rooms: [{ idx: 1, adults: input.adults, children: input.childAges, infants: input.infantAges }],
      session_id: runId, user_agent: 'RoomDrop-private-read-check', nationality: input.nationality, language_code: 'en-US', country_residence: input.countryResidence };
    if (!validateGatewayInput(query)) fail('INVALID_GATEWAY_INPUT');
    const rawCredentials = await boundedFile(resolve(root, credentialsArg));
    const lines = rawCredentials.split(/\r?\n/).map(line => line.match(/^\s*(email|password)\s*:\s*(.*)$/i)).filter(Boolean);
    let credentials;
    if (lines.length) {
      if (lines.length !== 2 || new Set(lines.map(line => line[1].toLowerCase())).size !== 2) fail('INVALID_CREDENTIAL_SOURCE');
      credentials = Object.fromEntries(lines.map(line => [line[1].toLowerCase(), line[2].trim()]));
    } else {
      const config = parseEnv(rawCredentials);
      credentials = { email: config.EASYGDS_EMAIL, password: config.EASYGDS_PASSWORD };
    }
    const start = Date.now();
    const token = await authenticateGateway({ credentials, authorised: true, fetchImpl });
    const gateway = createGateway({ email: credentials.email, token, authorised: true, fetchImpl });
    const response = await gateway.searchById(query);
    const observation = normaliseGatewayRates(response, { input: query, checkedAt: now().toISOString() });
    report.status = 'observed'; report.durationMs = Date.now() - start;
    report.sourceCount = observation.sources.length; report.roomCount = observation.rooms.length; report.rateCount = observation.offers.length;
    report.currencies = [...new Set(observation.offers.map(offer => offer.money.currency))];
    report.completeness = 'unverified'; report.customerRefundVerified = false;
    if (args.includes('--save')) {
      const directory = resolve(root, '.local', 'live-engine'); await mkdir(directory, { recursive: true });
      await privatePath(root, directory);
      const path = resolve(directory, `gateway-observation-${runId}.json`);
      await writeFile(path, JSON.stringify(observation, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      report.privateReport = relative(root, path);
    }
  } catch (error) {
    report.status = 'blocked'; report.reason = error instanceof GatewayReadError ? error.code : 'PRIVATE_GATEWAY_CHECK_FAILED';
    if (error instanceof GatewayReadError && error.httpStatus !== undefined) report.httpStatus = error.httpStatus;
  }
  return report;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const report = await main(); console.log(JSON.stringify(report, null, 2));
  if (report.status === 'blocked') process.exitCode = 1;
}
