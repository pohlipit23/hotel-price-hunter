import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { authenticateLiveEngine, createLiveEngine } from '../app/live-engine.mjs';
import { authenticateGateway, createGateway } from '../app/gateway.mjs';
import { normaliseGatewayRates } from '../app/domain/gateway-rates.mjs';
import { quotationBaseline, buildQuotationDemo } from '../app/domain/quotation-demo.mjs';

async function credentialText(path) {
  const metadata = await stat(path); if (!metadata.isFile() || metadata.size > 65536) throw Error();
  return readFile(path, 'utf8');
}
export async function main(args = process.argv.slice(2), { env = process.env, fetchImpl = fetch,
  root = fileURLToPath(new URL('../', import.meta.url)), now = () => new Date() } = {}) {
  const report = { mode: 'offline', status: 'not-attempted' };
  try {
    const prefixes = ['--code=', '--engine-credentials-file=', '--gateway-credentials-file='];
    if (args.some(arg => arg !== '--execute' && !prefixes.some(prefix => arg.startsWith(prefix)))
      || new Set(args.map(arg => arg.split('=')[0])).size !== args.length) throw Error();
    if (!args.includes('--execute')) { report.requirements = ['Explicit quotation code', 'Owner-selected engine and Gateway credential files', 'Local read-only preparation']; return report; }
    if (env.NODE_ENV === 'production' || env.K_SERVICE || env.CLOUD_RUN_JOB) throw Error();
    const values = prefixes.map(prefix => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length));
    if (values.some(value => !value) || !/^[A-Za-z0-9-]{1,64}$/.test(values[0])) throw Error();
    const [code, engineFile, gatewayFile] = values;
    const workspace = await realpath(root); const local = resolve(workspace, '.local');
    await mkdir(local, { recursive: true }); if (await realpath(local) !== local) throw Error();
    const engineConfig = parseEnv(await credentialText(resolve(root, engineFile)));
    const baseUrl = 'https://demo.apps.easygds.com/api';
    const token = await authenticateLiveEngine({ baseUrl, iamUrl: engineConfig.EASYGDS_IAM_URL, authorised: true, fetchImpl,
      credentials: { email: engineConfig.EASYGDS_EMAIL, secret_key: engineConfig.EASYGDS_SECRET_KEY ?? engineConfig.EASYGDS_PASSWORD,
        scope_type: engineConfig.EASYGDS_SCOPE_TYPE, flow_type: engineConfig.EASYGDS_FLOW_TYPE } });
    const engine = createLiveEngine({ baseUrl, token, authorised: true, fetchImpl });
    const quote = await engine.read('detail', { booking_code: code, cart_items_appended: true });
    const baseline = quotationBaseline(quote, code);
    const raw = await credentialText(resolve(root, gatewayFile));
    const pairs = raw.split(/\r?\n/).map(line => line.match(/^\s*(email|password)\s*:\s*(.*)$/i)).filter(Boolean);
    if (pairs.length !== 2 || new Set(pairs.map(pair => pair[1].toLowerCase())).size !== 2) throw Error();
    const credentials = Object.fromEntries(pairs.map(pair => [pair[1].toLowerCase(), pair[2].trim()]));
    const gatewayToken = await authenticateGateway({ credentials, authorised: true, fetchImpl });
    const gateway = createGateway({ email: credentials.email, token: gatewayToken, authorised: true, fetchImpl });
    const runId = randomUUID(); const b = baseline;
    const query = { ip: '127.0.0.1', price_comparison: false, checkin: b.stay.checkin, checkout: b.stay.checkout, package: false,
      ids: [b.hotel.id], supplier_ids: [], rooms: [{ idx: 1, adults: b.occupancy.adults, children: b.occupancy.childAges, infants: b.occupancy.infantAges }],
      session_id: runId, user_agent: 'RoomDrop-quotation-demo', nationality: b.searchContext.nationality, language_code: 'en-US', country_residence: b.searchContext.countryResidence };
    const response = await gateway.searchById(query);
    const observation = normaliseGatewayRates(response, { input: query, checkedAt: now().toISOString() });
    const bundle = buildQuotationDemo(baseline, observation);
    const directory = resolve(local, 'quotation-demo'); await mkdir(directory, { recursive: true });
    if (await realpath(directory) !== directory) throw Error();
    const path = resolve(directory, `quotation-demo-${runId}.json`);
    await writeFile(path, JSON.stringify(bundle, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    Object.assign(report, { mode: 'quotation-backed-selection-demo', status: 'prepared', quotationCode: code, hotel: b.hotel.name,
      optionCount: bundle.options.length, transactionMode: 'selection-only', privateSnapshot: path, reservationCreated: false });
  } catch (error) {
    report.status = 'blocked'; report.reason = typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'QUOTATION_DEMO_PREPARATION_FAILED';
  }
  return report;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const report = await main(); console.log(JSON.stringify(report, null, 2)); if (report.status === 'blocked') process.exitCode = 1;
}
