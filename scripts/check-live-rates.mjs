import { readFile, realpath, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { authenticateLiveEngine, createLiveEngine, isLiveEngineBase, LiveEngineError } from '../app/live-engine.mjs';
import { readLiveComparison, validateComparisonRequest } from '../app/domain/live-comparison.mjs';

const fail = code => { throw new LiveEngineError(code); };
const within = (parent, path) => { const part = relative(parent, path); return part !== '' && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part); };
async function privatePath(root, path) {
  const workspace = await realpath(root); const local = await realpath(resolve(workspace, '.local'));
  if (local !== resolve(workspace, '.local')) fail('PRIVATE_PATH_REQUIRED');
  const target = await realpath(resolve(workspace, path));
  if (!within(local, target)) fail('PRIVATE_PATH_REQUIRED');
  return target;
}

export async function main(args = process.argv.slice(2), { env = process.env, fetchImpl = fetch,
  root = fileURLToPath(new URL('../', import.meta.url)), now = () => new Date() } = {}) {
  const report = { checkedAt: now().toISOString(), mode: 'offline', status: 'not-attempted' };
  try {
    if (args.some(arg => !['--execute', '--save'].includes(arg) && !arg.startsWith('--input=') && !arg.startsWith('--credentials-file='))
      || args.filter(arg => arg.startsWith('--input=')).length > 1
      || args.filter(arg => arg.startsWith('--credentials-file=')).length > 1
      || new Set(args).size !== args.length || (args.includes('--save') && !args.includes('--execute'))) fail('INVALID_ARGUMENTS');
    if (!args.includes('--execute')) {
      report.configurationPresence = Object.fromEntries(['HPH_ALTOVO_BASE_URL', 'HPH_ALTOVO_READ_TOKEN', 'HPH_ALTOVO_READ_AUTHORISED'].map(key => [key, Boolean(env[key])]));
      report.requirements = ['Owner-selected tenant, booking and credential source', 'Private .local input with baseUrl, bookingCode and timeZone',
        'Existing bearer token or explicitly selected credential file; explicit read authority', 'No live call in offline mode'];
      return report;
    }
    report.mode = 'private-live-read-only';
    if (env.NODE_ENV === 'production' || env.K_SERVICE || env.CLOUD_RUN_JOB) fail('LOCAL_RUNNER_ONLY');
    const inputArg = args.find(arg => arg.startsWith('--input='))?.slice(8);
    const credentialArg = args.find(arg => arg.startsWith('--credentials-file='))?.slice(19);
    if (env.HPH_ALTOVO_READ_AUTHORISED !== 'yes' || !inputArg || !isLiveEngineBase(env.HPH_ALTOVO_BASE_URL)
      || Boolean(credentialArg) === Boolean(env.HPH_ALTOVO_READ_TOKEN)) fail('LIVE_ACCESS_NOT_CONFIGURED');
    const inputPath = await privatePath(root, inputArg);
    if (!(await stat(inputPath)).isFile() || (await stat(inputPath)).size > 16384) fail('INVALID_PRIVATE_INPUT');
    const input = JSON.parse(await readFile(inputPath, 'utf8'));
    if (!input || Array.isArray(input) || Object.keys(input).length !== 3
      || !['baseUrl', 'bookingCode', 'timeZone'].every(key => Object.hasOwn(input, key))
      || input.baseUrl !== env.HPH_ALTOVO_BASE_URL) fail('INVALID_PRIVATE_INPUT');
    validateComparisonRequest(input.bookingCode, input.timeZone);
    let token = env.HPH_ALTOVO_READ_TOKEN;
    if (credentialArg) {
      const credentialPath = resolve(root, credentialArg); const metadata = await stat(credentialPath);
      if (!metadata.isFile() || metadata.size > 65536) fail('INVALID_CREDENTIAL_SOURCE');
      const config = parseEnv(await readFile(credentialPath, 'utf8'));
      if (config.EASYGDS_SECRET_KEY && config.EASYGDS_PASSWORD && config.EASYGDS_SECRET_KEY !== config.EASYGDS_PASSWORD) fail('INVALID_CREDENTIAL_SOURCE');
      token = await authenticateLiveEngine({ baseUrl: input.baseUrl, iamUrl: config.EASYGDS_IAM_URL, authorised: true, fetchImpl,
        credentials: { email: config.EASYGDS_EMAIL, secret_key: config.EASYGDS_SECRET_KEY ?? config.EASYGDS_PASSWORD,
          scope_type: config.EASYGDS_SCOPE_TYPE, flow_type: config.EASYGDS_FLOW_TYPE } });
    }
    const engine = createLiveEngine({ baseUrl: input.baseUrl, token, authorised: true, fetchImpl });
    const observation = await readLiveComparison({ engine, bookingCode: input.bookingCode, timeZone: input.timeZone, now });
    report.status = 'observed'; report.rateCount = observation.rateCount;
    report.mappingStatus = observation.mappingStatus; report.gates = observation.gates;
    report.customerRefundVerified = false; report.actionableOffers = 0;
    if (args.includes('--save')) {
      const directory = resolve(root, '.local', 'live-engine');
      await mkdir(directory, { recursive: true });
      await privatePath(root, directory);
      const path = resolve(directory, `observation-${randomUUID()}.json`);
      await writeFile(path, JSON.stringify(observation, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      report.privateReport = relative(root, path);
    }
  } catch (error) {
    report.status = 'blocked'; report.reason = error instanceof LiveEngineError ? error.code : 'PRIVATE_CHECK_FAILED';
    if (error instanceof LiveEngineError && error.httpStatus !== undefined) report.httpStatus = error.httpStatus;
  }
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const report = await main(); console.log(JSON.stringify(report, null, 2));
  if (report.status === 'blocked') process.exitCode = 1;
}
