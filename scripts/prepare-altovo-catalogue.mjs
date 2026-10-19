import { readFile, readdir, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { authenticateGateway, createGateway } from '../app/gateway.mjs';
import { normaliseGatewayRates } from '../app/domain/gateway-rates.mjs';
import { buildQuotationDemo } from '../app/domain/quotation-demo.mjs';
import { CONTRAST_KINDS } from '../app/public/room-match.js';
import { AGENCY_SEARCH_CONTEXT, altovoBaseline, watchBlocker } from '../app/domain/altovo-quotation.mjs';
import { captureEngineDrops, ENGINE_PROFILES, ENGINE_SEARCH_DEFAULTS, loginEngine, parseEngineCredentials } from '../app/domain/engine-availability.mjs';

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
const PREFIXES = ['--gateway-credentials-file=', '--projections=', '--approved-codes=', '--source=', '--engine-credentials-file=', '--engine-profile=', '--contrast='];
const sleepFor = ms => new Promise(done => setTimeout(done, ms));
// Loose, display-only check that the engine returned the hotel the quotation names; null when the engine named none.
const sameHotelName = (a, b) => { const words = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return a && b ? words(a).includes(words(b)) || words(b).includes(words(a)) : null; };
// --contrast=CODE:kind,...: the one way an approved code's third Drop differs from the booking; codes left out use the default order.
export function parseContrasts(text, approved) {
  if (text === undefined) return {};
  const pairs = text.split(',').map(pair => pair.split(':'));
  if (pairs.some(pair => pair.length !== 2 || !approved.includes(pair[0]) || !CONTRAST_KINDS.includes(pair[1]))
    || new Set(pairs.map(pair => pair[0])).size !== pairs.length) throw blocked('CONTRAST_INVALID');
  return Object.fromEntries(pairs);
}
export const SEARCH_DEFAULTS = Object.freeze({ nationality: AGENCY_SEARCH_CONTEXT.nationality, countryResidence: AGENCY_SEARCH_CONTEXT.countryResidence,
  occupancy: AGENCY_SEARCH_CONTEXT.occupancy, source: AGENCY_SEARCH_CONTEXT.source });

// Photo source URLs from the Gateway search, kept beside (never inside) the bundle. They are remote
// supplier-CDN addresses for a later owner-reviewed download, not fields a page may render: only a
// reviewed local asset (card.photo / Drop photo) ever reaches the judge.
export const IMAGE_SOURCES_KIND = 'remote-source-urls-pending-review';
const plainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export function httpsImageUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url; try { url = new URL(value); } catch { return null; }
  return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : null;
}
const sized = sizes => plainObject(sizes) ? ['md', 'lg', 'sm'].map(size => httpsImageUrl(sizes[size])).find(Boolean) ?? null : null;
const caption = value => typeof value === 'string' && value.trim() && value.length <= 200 ? value.trim() : null;
export function gatewayImageSources(response, bundle) {
  const hotels = Array.isArray(response?.data) ? response.data.filter(plainObject) : [];
  let hotel = null;
  for (const source of hotels) {
    const avatar = source.avatar; if (!plainObject(avatar)) continue;
    const url = sized(avatar.urls) ?? sized(avatar);
    if (url) { hotel = { url, caption: caption(avatar.caption) }; break; }
  }
  const drops = (bundle?.options ?? []).map(option => {
    const rateDetail = bundle.privateReferences?.[option.optionId]?.rateDetail;
    let image;
    for (const room of hotels.flatMap(source => Array.isArray(source.rooms) ? source.rooms.filter(plainObject) : [])) {
      const rate = (Array.isArray(room.rates) ? room.rates : []).find(candidate => plainObject(candidate) && candidate.rate_detail === rateDetail);
      if (!rate) continue;
      const images = Array.isArray(rate.images) && rate.images.length ? rate.images : room.images;
      image = Array.isArray(images) ? images[0] : undefined; break;
    }
    const url = plainObject(image) ? sized(image.urls) : null;
    return { optionId: option.optionId, url, caption: url ? caption(image.caption) : null };
  });
  return { kind: IMAGE_SOURCES_KIND, renderable: false, hotel, drops };
}
const imageSummary = sources => ({ hotel: Boolean(sources.hotel), drops: sources.drops.filter(drop => drop.url).length });

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
  root = fileURLToPath(new URL('../', import.meta.url)), now = () => new Date(), sleep = sleepFor } = {}) {
  const report = { mode: 'offline', status: 'not-attempted' };
  let current = null;
  try {
    if (args.some(arg => arg !== '--execute' && !PREFIXES.some(prefix => arg.startsWith(prefix)))
      || new Set(args.map(arg => arg.split('=')[0])).size !== args.length) throw Error();
    const value = prefix => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
    // Drops of record come from the Gateway (default) or, by owner decision, the EasyGDS Core Engine.
    const source = value(PREFIXES[3]) ?? 'gateway';
    if (!['gateway', 'engine'].includes(source) || (source === 'engine' ? [0] : [4, 5]).some(index => value(PREFIXES[index]) !== undefined)) throw Error();
    const engineSource = source === 'engine';
    // The engine profile defaults to the user's choice, the air1 staging engine, whose host is pinned in code.
    const engineProfile = engineSource ? value(PREFIXES[5]) ?? 'staging-air1' : null;
    if (engineSource && !Object.hasOwn(ENGINE_PROFILES, engineProfile)) throw blocked('ENGINE_PROFILE_INVALID');
    if (engineSource) Object.assign(report, { source: 'engine', engineProfile, ...(ENGINE_PROFILES[engineProfile].apiUrl ? { engineHost: new URL(ENGINE_PROFILES[engineProfile].apiUrl).hostname } : {}) });
    const approvedText = value(PREFIXES[2]);
    if (approvedText === undefined) {
      report.requirements = ['Owner-approved air1 code list (--approved-codes=CODE,CODE)', 'Allowlisted Altovo projections in .local/altovo-sample',
        'Owner-selected Gateway credential file (only with --execute)', 'Local read-only preparation',
        'Optional: the one way each code\'s third Drop differs (--contrast=CODE:meals|room|cancellation,...), else meals, room, cancellation'];
      return report;
    }
    const approved = approvedText.split(',');
    if (!approved.every(code => CODE.test(code)) || new Set(approved).size !== approved.length) throw blocked('APPROVED_CODES_INVALID');
    const contrasts = parseContrasts(value(PREFIXES[6]), approved);
    const execute = args.includes('--execute');
    if (execute && (env.NODE_ENV === 'production' || env.K_SERVICE || env.CLOUD_RUN_JOB)) throw Error();
    const projectionDir = resolve(root, value(PREFIXES[1]) ?? '.local/altovo-sample');
    const workspace = await realpath(root); const local = resolve(workspace, '.local');
    if (!(await realpath(projectionDir)).startsWith(local)) throw Error();
    const checkedAt = now();
    const plan = (await approvedBaselines(projectionDir, approved)).map(baseline => ({ baseline, blocker: watchBlocker(baseline, checkedAt) }));
    if (!execute) {
      Object.assign(report, { mode: 'dry-run', status: 'validated', searchDefaults: engineSource ? ENGINE_SEARCH_DEFAULTS : SEARCH_DEFAULTS,
        entries: plan.map(({ baseline, blocker }) => ({ code: baseline.quotationCode, hotel: baseline.hotel.name, blocker, plannedSearch: !blocker,
          ...(engineSource ? { engineHotelId: baseline.hotel.id } : {}), ...(contrasts[baseline.quotationCode] ? { contrast: contrasts[baseline.quotationCode] } : {}) })) });
      return report;
    }
    const gatewayFile = value(PREFIXES[0]);
    let gateway = null;
    let engine = null;
    // Engine credentials are read and checked before any upstream call, even when no search is planned.
    if (engineSource) {
      const engineFile = value(PREFIXES[4]);
      if (!engineFile) throw blocked('ENGINE_CREDENTIALS_REQUIRED');
      let raw; try { raw = await credentialText(resolve(root, engineFile)); } catch { throw blocked('ENGINE_CREDENTIALS_REQUIRED'); }
      engine = parseEngineCredentials(raw, engineProfile);
      report.engineHost = new URL(engine.apiUrl).hostname;
    }
    const entries = [];
    const engineFacts = new Map();
    for (const { baseline, blocker } of plan) {
      let bundle; let capture; let imageSources = { kind: IMAGE_SOURCES_KIND, renderable: false, hotel: null, drops: [] };
      current = baseline.quotationCode;
      if (blocker) {
        capture = { status: 'not-searched', reason: blocker };
        const view = { schemaVersion: 1, transactionMode: 'selection-only', baseline, options: [], checkedAt: checkedAt.toISOString(),
          completeness: 'no-search-watch-cannot-start', customerRefund: null, reservationCreated: false };
        bundle = { ...view, snapshotVersion: hash(view), privateReferences: {} };
      } else if (engineSource) {
        // One sign-in for the whole run; a rejected call is never retried or re-signed.
        engine.token ??= await loginEngine({ credentials: engine.credentials, iamUrl: engine.iamUrl, fetchImpl });
        const captured = await captureEngineDrops({ baseline, source: engine.source, apiUrl: engine.apiUrl, token: engine.token, fetchImpl, now, sleep,
          contrast: contrasts[baseline.quotationCode] });
        ({ bundle, capture, imageSources } = captured);
        engineFacts.set(baseline.quotationCode, { engineHotelId: baseline.hotel.id, engineHotelNameMatches: sameHotelName(captured.hotelName, baseline.hotel.name),
          searchPosts: captured.searchPosts });
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
        const response = await gateway.searchById(query);
        const observation = normaliseGatewayRates(response, { input: query, checkedAt: now().toISOString() });
        bundle = buildQuotationDemo(baseline, observation, { contrast: contrasts[baseline.quotationCode] });
        imageSources = gatewayImageSources(response, bundle);
        // A successful search with no offers is a valid empty capture, recorded as such; a failed
        // search never reaches this point, so it cannot be mistaken for an empty one.
        capture = { status: observation.offers.length ? 'observed' : 'observed-empty', checkedAt: observation.context.checkedAt,
          offerCount: observation.offers.length, optionCount: bundle.options.length, searchDefaults: SEARCH_DEFAULTS };
      }
      entries.push({ code: baseline.quotationCode, blocker, capture, bundle, imageSources });
    }
    current = null;
    const directory = resolve(local, 'altovo-catalogue'); await mkdir(directory, { recursive: true });
    if (await realpath(directory) !== directory) throw Error();
    const path = resolve(directory, `catalogue-${randomUUID()}.json`);
    await writeFile(path, JSON.stringify({ schemaVersion: 1, preparedAt: checkedAt.toISOString(), entries }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    Object.assign(report, { mode: 'altovo-quotation-catalogue', status: 'prepared', privateCatalogue: path,
      entries: entries.map(entry => ({ code: entry.code, hotel: entry.bundle.baseline.hotel.name, blocker: entry.blocker, capture: entry.capture.status,
        optionCount: entry.bundle.options.length, imageSources: imageSummary(entry.imageSources), ...engineFacts.get(entry.code),
        ...(contrasts[entry.code] ? { contrast: contrasts[entry.code] } : {}) })) });
  } catch (error) {
    report.status = 'blocked'; report.reason = typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'ALTOVO_CATALOGUE_PREPARATION_FAILED';
    // A failed capture is named by quotation code, so it is never mistaken for an empty one.
    if (current) report.failedCode = current;
  }
  return report;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const report = await main(); console.log(JSON.stringify(report, null, 2)); if (report.status === 'blocked') process.exitCode = 1;
}
