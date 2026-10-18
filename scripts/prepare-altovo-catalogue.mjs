import { readFile, readdir, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { authenticateGateway, createGateway } from '../app/gateway.mjs';
import { normaliseGatewayRates } from '../app/domain/gateway-rates.mjs';
import { buildQuotationDemo } from '../app/domain/quotation-demo.mjs';
import { AGENCY_SEARCH_CONTEXT, altovoBaseline, watchBlocker } from '../app/domain/altovo-quotation.mjs';

// Builds the judge catalogue: one selection-only bundle per captured Altovo quotation.
// Without --execute this is a dry run: it validates the local projections against the owner's
// approved code list and plans the searches, with no upstream call and no file written.
// Quotations a Drop Watch can start on get one Gateway search for cheaper offers (the Drops);
// the others are packaged with no Drops so the cannot-start path can be shown.
async function credentialText(path) {
  const metadata = await stat(path); if (!metadata.isFile() || metadata.size > 65536) throw Error();
  return readFile(path, 'utf8');
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const blocked = code => Object.assign(Error(), { code });
const CODE = /^[A-Z0-9]{4,20}$/;
const PREFIXES = ['--gateway-credentials-file=', '--projections=', '--approved-codes='];
export const SEARCH_DEFAULTS = Object.freeze({ nationality: AGENCY_SEARCH_CONTEXT.nationality, countryResidence: AGENCY_SEARCH_CONTEXT.countryResidence,
  occupancy: AGENCY_SEARCH_CONTEXT.occupancy, source: AGENCY_SEARCH_CONTEXT.source });

// Hostname alone does not prove air1 tenancy, so every projection must be on the owner's list and vice versa.
async function approvedBaselines(projectionDir, approved) {
  const files = (await readdir(projectionDir)).filter(name => /^[A-Z0-9]{4,20}\.projection\.json$/.test(name)).sort();
  if (!files.length) throw blocked('NO_PROJECTIONS');
  const codes = files.map(name => name.split('.')[0]);
  if (codes.some(code => !approved.includes(code))) throw blocked('ALTOVO_CODE_NOT_APPROVED');
  if (approved.some(code => !codes.includes(code))) throw blocked('ALTOVO_PROJECTION_MISSING');
  const baselines = [];
  for (const [index, name] of files.entries()) {
    const baseline = altovoBaseline(JSON.parse(await readFile(resolve(projectionDir, name), 'utf8')));
    if (baseline.quotationCode !== codes[index]) throw blocked('ALTOVO_PROJECTION_MISMATCH');
    baselines.push(baseline);
  }
  return baselines;
}

export async function main(args = process.argv.slice(2), { env = process.env, fetchImpl = fetch,
  root = fileURLToPath(new URL('../', import.meta.url)), now = () => new Date() } = {}) {
  const report = { mode: 'offline', status: 'not-attempted' };
  try {
    if (args.some(arg => arg !== '--execute' && !PREFIXES.some(prefix => arg.startsWith(prefix)))
      || new Set(args.map(arg => arg.split('=')[0])).size !== args.length) throw Error();
    const value = prefix => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
    const approvedText = value(PREFIXES[2]);
    if (approvedText === undefined) {
      report.requirements = ['Owner-approved air1 code list (--approved-codes=CODE,CODE)', 'Allowlisted Altovo projections in .local/altovo-sample',
        'Owner-selected Gateway credential file (only with --execute)', 'Local read-only preparation']; return report;
    }
    const approved = approvedText.split(',');
    if (!approved.every(code => CODE.test(code)) || new Set(approved).size !== approved.length) throw blocked('APPROVED_CODES_INVALID');
    const execute = args.includes('--execute');
    if (execute && (env.NODE_ENV === 'production' || env.K_SERVICE || env.CLOUD_RUN_JOB)) throw Error();
    const projectionDir = resolve(root, value(PREFIXES[1]) ?? '.local/altovo-sample');
    const workspace = await realpath(root); const local = resolve(workspace, '.local');
    if (!(await realpath(projectionDir)).startsWith(local)) throw Error();
    const checkedAt = now();
    const plan = (await approvedBaselines(projectionDir, approved)).map(baseline => ({ baseline, blocker: watchBlocker(baseline, checkedAt) }));
    if (!execute) {
      Object.assign(report, { mode: 'dry-run', status: 'validated', searchDefaults: SEARCH_DEFAULTS,
        entries: plan.map(({ baseline, blocker }) => ({ code: baseline.quotationCode, hotel: baseline.hotel.name, blocker, plannedSearch: !blocker })) });
      return report;
    }
    const gatewayFile = value(PREFIXES[0]);
    let gateway = null;
    const entries = [];
    for (const { baseline, blocker } of plan) {
      let bundle; let capture;
      if (blocker) {
        capture = { status: 'not-searched', reason: blocker };
        const view = { schemaVersion: 1, transactionMode: 'selection-only', baseline, options: [], checkedAt: checkedAt.toISOString(),
          completeness: 'no-search-watch-cannot-start', customerRefund: null, reservationCreated: false };
        bundle = { ...view, snapshotVersion: hash(view), privateReferences: {} };
      } else {
        if (!gateway) {
          if (!gatewayFile) throw blocked('GATEWAY_CREDENTIALS_REQUIRED');
          const raw = await credentialText(resolve(root, gatewayFile));
          const pairs = raw.split(/\r?\n/).map(line => line.match(/^\s*(email|password)\s*:\s*(.*)$/i)).filter(Boolean);
          if (pairs.length !== 2 || new Set(pairs.map(pair => pair[1].toLowerCase())).size !== 2) throw Error();
          const credentials = Object.fromEntries(pairs.map(pair => [pair[1].toLowerCase(), pair[2].trim()]));
          const token = await authenticateGateway({ credentials, authorised: true, fetchImpl });
          gateway = createGateway({ email: credentials.email, token, authorised: true, fetchImpl });
        }
        const b = baseline;
        const query = { ip: '127.0.0.1', price_comparison: false, checkin: b.stay.checkin, checkout: b.stay.checkout, package: false,
          ids: [b.hotel.id], supplier_ids: [], rooms: [{ idx: 1, adults: b.occupancy.adults, children: b.occupancy.childAges, infants: b.occupancy.infantAges }],
          session_id: randomUUID(), user_agent: 'RoomDrop-altovo-catalogue', nationality: b.searchContext.nationality, language_code: 'en-US', country_residence: b.searchContext.countryResidence };
        const observation = normaliseGatewayRates(await gateway.searchById(query), { input: query, checkedAt: now().toISOString() });
        bundle = buildQuotationDemo(baseline, observation);
        // A successful search with no offers is a valid empty capture, recorded as such; a failed
        // search never reaches this point, so it cannot be mistaken for an empty one.
        capture = { status: observation.offers.length ? 'observed' : 'observed-empty', checkedAt: observation.context.checkedAt,
          offerCount: observation.offers.length, optionCount: bundle.options.length, searchDefaults: SEARCH_DEFAULTS };
      }
      entries.push({ code: baseline.quotationCode, blocker, capture, bundle });
    }
    const directory = resolve(local, 'altovo-catalogue'); await mkdir(directory, { recursive: true });
    if (await realpath(directory) !== directory) throw Error();
    const path = resolve(directory, `catalogue-${randomUUID()}.json`);
    await writeFile(path, JSON.stringify({ schemaVersion: 1, preparedAt: checkedAt.toISOString(), entries }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    Object.assign(report, { mode: 'altovo-quotation-catalogue', status: 'prepared', privateCatalogue: path,
      entries: entries.map(entry => ({ code: entry.code, hotel: entry.bundle.baseline.hotel.name, blocker: entry.blocker, capture: entry.capture.status, optionCount: entry.bundle.options.length })) });
  } catch (error) {
    report.status = 'blocked'; report.reason = typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'ALTOVO_CATALOGUE_PREPARATION_FAILED';
  }
  return report;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const report = await main(); console.log(JSON.stringify(report, null, 2)); if (report.status === 'blocked') process.exitCode = 1;
}
