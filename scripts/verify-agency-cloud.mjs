// Offline by default. External mode reads metadata/registry bytes only; never deploys or invokes the app.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TARGET = Object.freeze({ project: 'sincere-apex-511418-p0', number: '977401667230', org: '222849345270', region: 'asia-southeast1', operator: 'pete@altovo.com', service: 'hotel-price-hunter-agency',
  reader: 'roomdrop-agency-reader@sincere-apex-511418-p0.iam.gserviceaccount.com', iapAgent: 'service-977401667230@gcp-sa-iap.iam.gserviceaccount.com',
  image: 'asia-southeast1-docker.pkg.dev/sincere-apex-511418-p0/hotel-price-hunter/agency', audience: '/projects/977401667230/locations/asia-southeast1/services/hotel-price-hunter-agency' });
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CUSTOMER_REVISION = 'hotel-price-hunter-00006-hfm';
const IGNORE = ['**', '!package.json', '!package-lock.json', '!app/', '!app/**', '!fixtures/', '!fixtures/jury-booking.json', '!scripts/', '!scripts/run-price-watch.mjs'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = bytes => `sha256:${hash(bytes)}`;
const validDigest = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
class VerificationError extends Error { constructor(code) { super(code); this.code = code; } }
function requireCheck(value, code) { if (!value) throw new VerificationError(code); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
export function customerFingerprint(service, policy) {
  // Ignore only observation timestamps and etags; policy bindings and all deployed configuration remain pinned.
  const copy = structuredClone({ service, policy });
  delete copy.policy.etag;
  for (const key of ['resourceVersion', 'generation', 'creationTimestamp', 'uid', 'selfLink']) delete copy.service.metadata[key];
  delete copy.service.status?.conditions;
  return hash(JSON.stringify(canonical(copy)));
}
function validatePins(pins) {
  requireCheck(pins && /^[a-f0-9]{40}$/.test(pins.sourceCommit) && /^[a-f0-9]{64}$/.test(pins.contextSha256), 'PIN_SOURCE_REQUIRED');
  requireCheck(validDigest(pins.imageDigest) && /^[a-f0-9]{64}$/.test(pins.operatorSubjectSha256) && /^[a-f0-9]{64}$/.test(pins.customerFingerprint), 'PIN_IDENTITY_IMAGE_CUSTOMER_REQUIRED');
  requireCheck(new RegExp(`^${TARGET.service}-[a-z0-9-]{1,40}$`).test(pins.revision) && ['withheld', 'operator'].includes(pins.access), 'PIN_REVISION_ACCESS_REQUIRED');
  let url; try { url = new URL(pins.origin); } catch { /* Fail below. */ }
  requireCheck(url?.protocol === 'https:' && url.origin === pins.origin && new RegExp(`^${TARGET.service}-[a-z0-9-]+(?:\\.${TARGET.region}|\\.a)?\\.run\\.app$`).test(url.hostname), 'PIN_CANONICAL_ORIGIN_REQUIRED');
}
function envCheck(container, pins) {
  const values = container.env || [];
  const expected = { NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT: TARGET.project, APP_SURFACE: 'agency', AGENCY_AUTH_MODE: 'iap', APP_ORIGIN: pins.origin, AGENCY_IAP_AUDIENCE: TARGET.audience };
  requireCheck(values.length === 7 && new Set(values.map(item => item.name)).size === 7 && values.every(item => typeof item.value === 'string' && !item.valueFrom), 'EXACT_LITERAL_ENV');
  const env = Object.fromEntries(values.map(item => [item.name, item.value]));
  requireCheck(Object.entries(expected).every(([name, value]) => env[name] === value), 'EXACT_AGENCY_ENV');
  let subjects; try { subjects = JSON.parse(env.AGENCY_IAP_ALLOWED_SUBJECTS); } catch { /* Fail below. */ }
  requireCheck(Array.isArray(subjects) && subjects.length === 1 && /^accounts\.google\.com:[0-9]{1,64}$/.test(subjects[0]) && hash(subjects[0]) === pins.operatorSubjectSha256, 'PINNED_OPERATOR_SUBJECT');
}
function runtimeCheck(pod, annotations, pins, expectedImage) {
  requireCheck(pod?.serviceAccountName === TARGET.reader && pod.containers?.length === 1 && !(pod.volumes?.length), 'DEDICATED_READER_SINGLE_CONTAINER');
  const container = pod.containers[0];
  requireCheck(container.image === expectedImage && !(container.command?.length) && !(container.args?.length) && !(container.volumeMounts?.length), 'EXACT_IMAGE_NO_OVERRIDES');
  requireCheck(container.ports?.length === 1 && container.ports[0].containerPort === 8080, 'EXACT_CONTAINER_PORT');
  envCheck(container, pins);
  requireCheck(pod.containerConcurrency === 4 && pod.timeoutSeconds === 30 && ['1', '1000m'].includes(container.resources?.limits?.cpu) && container.resources?.limits?.memory === '512Mi', 'EXACT_RESOURCE_LIMITS');
  requireCheck((annotations['autoscaling.knative.dev/minScale'] ?? '0') === '0' && annotations['autoscaling.knative.dev/maxScale'] === '1'
    && annotations['run.googleapis.com/cpu-throttling'] === 'true' && annotations['run.googleapis.com/startup-cpu-boost'] === 'false' && annotations['run.googleapis.com/execution-environment'] === 'gen2', 'EXACT_SCALING_CPU_EXECUTION');
}
function grants(policy) { requireCheck(policy && (policy.bindings === undefined || Array.isArray(policy.bindings)), 'IAM_POLICY_REQUIRED'); return policy.bindings || []; }

export function verifyAgencyMetadata(metadata, pins, { allowUnverifiedInheritedIam = false } = {}) {
  validatePins(pins);
  const { project, service, revision, runPolicy, iapPolicy, projectPolicy, orgPolicy, reader, readerPolicy, readerKeys, repository, database, apis, customer, customerPolicy } = metadata;
  requireCheck(project?.projectId === TARGET.project && String(project.projectNumber) === TARGET.number && project.lifecycleState === 'ACTIVE' && project.parent?.type === 'organization' && project.parent?.id === TARGET.org, 'EXACT_PROJECT_ORGANIZATION');
  requireCheck(service?.metadata?.name === TARGET.service && String(service.metadata.namespace) === TARGET.number && service.metadata.labels?.['cloud.googleapis.com/location'] === TARGET.region, 'EXACT_AGENCY_SERVICE_REGION');
  const annotation = service.metadata.annotations || {};
  requireCheck(annotation['run.googleapis.com/iap-enabled'] === 'true' && annotation['run.googleapis.com/invoker-iam-disabled'] !== 'true' && annotation['run.googleapis.com/ingress'] === 'all', 'IAP_AND_INVOKER_CHECK_ENABLED');
  requireCheck((annotation['run.googleapis.com/minScale'] ?? '0') === '0' && annotation['run.googleapis.com/maxScale'] === '1', 'SERVICE_ZERO_MIN_ONE_MAX');
  requireCheck(service.status?.url === pins.origin && service.status.latestReadyRevisionName === pins.revision && service.status.latestCreatedRevisionName === pins.revision
    && service.status.conditions?.some(c => c.type === 'Ready' && c.status === 'True') && service.status.traffic?.length === 1 && service.status.traffic[0].revisionName === pins.revision && service.status.traffic[0].percent === 100 && !service.status.traffic[0].tag, 'EXACT_READY_REVISION_TRAFFIC_ORIGIN');
  requireCheck(revision?.metadata?.name === pins.revision && String(revision.metadata.namespace) === TARGET.number && revision.metadata.labels?.['serving.knative.dev/service'] === TARGET.service
    && revision.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True'), 'EXACT_READY_REVISION');
  requireCheck(typeof revision.status.imageDigest === 'string' && revision.status.imageDigest.startsWith(`${TARGET.image}@`) && validDigest(revision.status.imageDigest.slice(TARGET.image.length + 1)), 'RUNTIME_DIGEST_REQUIRED');
  runtimeCheck(service.spec?.template?.spec, service.spec?.template?.metadata?.annotations || {}, pins, `${TARGET.image}@${pins.imageDigest}`);
  runtimeCheck(revision.spec, revision.metadata.annotations || {}, pins, revision.status.imageDigest);
  const invocation = grants(runPolicy);
  requireCheck(invocation.length === 1 && invocation[0].role === 'roles/run.invoker' && !invocation[0].condition && invocation[0].members?.length === 1 && invocation[0].members[0] === `serviceAccount:${TARGET.iapAgent}`, 'ONLY_IAP_AGENT_SERVICE_INVOKER');
  const access = grants(iapPolicy);
  requireCheck(pins.access === 'withheld' ? access.length === 0 : access.length === 1 && access[0].role === 'roles/iap.httpsResourceAccessor' && !access[0].condition && access[0].members?.length === 1 && access[0].members[0] === `user:${TARGET.operator}`, 'EXACT_IAP_OPERATOR_ACCESS');
  const inheritedVerified = orgPolicy !== null && orgPolicy !== undefined;
  requireCheck(inheritedVerified || allowUnverifiedInheritedIam, 'INHERITED_IAM_UNVERIFIED');
  const policies = [projectPolicy, ...(inheritedVerified ? [orgPolicy] : [])];
  for (const policy of policies) {
    for (const binding of grants(policy)) {
      requireCheck(!binding.members?.some(member => ['allUsers', 'allAuthenticatedUsers'].includes(member)), 'NO_BROAD_PROJECT_OR_ORG_GRANTS');
      requireCheck(!['roles/run.invoker', 'roles/iap.httpsResourceAccessor'].includes(binding.role), 'NO_INHERITED_INVOKER_OR_IAP_GRANTS');
      const readerApplies = binding.members?.some(member => member === `serviceAccount:${TARGET.reader}` || member.startsWith('principalSet://') || member === 'domain:iam.gserviceaccount.com');
      if (readerApplies) requireCheck(binding.role === 'roles/datastore.viewer' && !binding.condition, 'READER_HAS_ONLY_DATASTORE_VIEWER');
    }
  }
  const directReaderGrants = grants(projectPolicy).filter(binding => binding.members?.includes(`serviceAccount:${TARGET.reader}`));
  requireCheck(directReaderGrants.length === 1 && directReaderGrants[0].role === 'roles/datastore.viewer' && !directReaderGrants[0].condition, 'EXACT_READER_PROJECT_GRANT');
  requireCheck(reader?.email === TARGET.reader && reader.projectId === TARGET.project && !reader.disabled && grants(readerPolicy).length === 0 && Array.isArray(readerKeys) && readerKeys.length === 0, 'READER_ENABLED_NO_KEYS_OR_DELEGATES');
  requireCheck(repository?.name === `projects/${TARGET.project}/locations/${TARGET.region}/repositories/hotel-price-hunter` && repository.format === 'DOCKER' && repository.dockerConfig?.immutableTags === true, 'IMMUTABLE_AGENCY_REPOSITORY');
  requireCheck(database?.name === `projects/${TARGET.project}/databases/(default)` && database.type === 'FIRESTORE_NATIVE' && database.locationId === TARGET.region && database.databaseEdition === 'STANDARD' && database.deleteProtectionState === 'DELETE_PROTECTION_ENABLED', 'EXISTING_READONLY_DATABASE');
  requireCheck(['iap.googleapis.com', 'run.googleapis.com', 'firestore.googleapis.com', 'iam.googleapis.com', 'artifactregistry.googleapis.com'].every(name => apis?.some(api => api.config?.name === name && api.state === 'ENABLED')), 'REQUIRED_APIS_ENABLED');
  requireCheck(customer?.metadata?.name === 'hotel-price-hunter' && customer.status?.latestReadyRevisionName === CUSTOMER_REVISION && customer.status.latestCreatedRevisionName === CUSTOMER_REVISION
    && customerFingerprint(customer, customerPolicy) === pins.customerFingerprint, 'CUSTOMER_BASELINE_UNCHANGED');
  return { status: inheritedVerified ? 'metadata-verified' : 'metadata-partial', fullAcceptance: false, project: TARGET.project, service: TARGET.service, region: TARGET.region,
    revision: pins.revision, origin: pins.origin, imageDigest: pins.imageDigest, runtimeDigest: revision.status.imageDigest.slice(TARGET.image.length + 1),
    access: pins.access, inheritedIam: inheritedVerified ? 'verified-policy-scope' : 'unverified', browserIdentity: 'not-tested', applicationAccess: 'not-tested', sourceLineage: 'pending-registry-verification' };
}

export function verifyRegistryLineage({ approvedBytes, manifestBytes, configBytes, runtimeDigest, pins }) {
  requireCheck(digest(approvedBytes) === pins.imageDigest && validDigest(runtimeDigest), 'APPROVED_REGISTRY_BYTES');
  const approved = JSON.parse(approvedBytes.toString('utf8'));
  requireCheck(approved.schemaVersion === 2, 'OCI_SCHEMA');
  if (['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json'].includes(approved.mediaType)) {
    requireCheck(approved.manifests?.length >= 1 && approved.manifests.length <= 2, 'BOUNDED_IMAGE_INDEX');
    const runnable = approved.manifests.filter(item => item.platform?.os === 'linux' && item.platform?.architecture === 'amd64');
    requireCheck(runnable.length === 1 && runnable[0].digest === runtimeDigest, 'INDEX_RUNTIME_CHILD_LINEAGE');
    for (const item of approved.manifests.filter(item => item !== runnable[0])) requireCheck(item.platform?.os === 'unknown' && item.platform?.architecture === 'unknown' && item.annotations?.['vnd.docker.reference.type'] === 'attestation-manifest' && item.annotations?.['vnd.docker.reference.digest'] === runtimeDigest, 'ONLY_BOUND_ATTESTATION_EXTRA');
  } else requireCheck(pins.imageDigest === runtimeDigest, 'SINGLE_MANIFEST_RUNTIME_EQUALITY');
  requireCheck(digest(manifestBytes) === runtimeDigest, 'EXACT_RUNTIME_MANIFEST_BYTES');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  requireCheck(manifest.schemaVersion === 2 && ['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'].includes(manifest.mediaType) && manifest.config?.digest === digest(configBytes), 'CONFIG_MANIFEST_LINEAGE');
  const config = JSON.parse(configBytes.toString('utf8'));
  requireCheck(config.architecture === 'amd64' && config.os === 'linux' && config.config?.User === 'node' && config.config.WorkingDir === '/app' && JSON.stringify(config.config.Cmd) === '["node","app/server.mjs"]' && JSON.stringify(config.config.Entrypoint) === '["docker-entrypoint.sh"]', 'EXACT_OCI_RUNTIME');
  requireCheck(config.config.Labels?.['org.opencontainers.image.revision'] === pins.sourceCommit && config.config.Labels?.['com.roomdrop.build-context.sha256'] === pins.contextSha256, 'PINNED_SOURCE_CONTEXT_OCI_LABELS');
  return { uploadedDigest: pins.imageDigest, runtimeDigest, configDigest: digest(configBytes), sourceCommit: pins.sourceCommit, contextSha256: pins.contextSha256 };
}

export function cloudArguments(command, { text = false } = {}) {
  const prefix = command.slice(0, 3).join(' ');
  const allowed = ['projects describe', 'projects get-iam-policy', 'organizations get-iam-policy', 'run services describe', 'run revisions describe', 'run services get-iam-policy', 'iap web get-iam-policy', 'iam service-accounts describe', 'iam service-accounts get-iam-policy', 'iam service-accounts keys', 'artifacts repositories describe', 'firestore databases describe', 'services list', 'auth print-access-token'];
  requireCheck(allowed.some(value => prefix === value || prefix.startsWith(value + ' ')) && !command.some(value => /^--(?:project|account|impersonate|access-token|credential)/.test(value)), 'READ_ONLY_FIXED_ACCOUNT_COMMAND');
  if (prefix === 'iam service-accounts keys') requireCheck(command[3] === 'list', 'READ_ONLY_KEY_LIST');
  if (command[0] === 'auth') requireCheck(command.length === 2 && text, 'MEMORY_ONLY_TOKEN_CAPTURE');
  return [...command, `--account=${TARGET.operator}`, `--project=${TARGET.project}`, '--quiet', ...(text ? [] : ['--format=json'])];
}
function gcloud(command, options) {
  const args = cloudArguments(command, options);
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `& gcloud ${args.map(quote).join(' ')}; exit $LASTEXITCODE`], { encoding: 'utf8', timeout: 120000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  requireCheck(!result.error && result.status === 0, 'CLOUD_READ_FAILED_OUTPUT_SUPPRESSED');
  return options?.text ? result.stdout.trim() : JSON.parse(result.stdout);
}
function gitRead(args, root) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  requireCheck(!result.error && result.status === 0, 'LOCAL_GIT_READ_FAILED');
  return result.stdout.trimEnd();
}
export async function sourceContext({ root = ROOT, sourceCommit, git = args => gitRead(args, root) }) {
  requireCheck(/^[a-f0-9]{40}$/.test(sourceCommit) && git(['rev-parse', 'HEAD']).trim() === sourceCommit, 'EXACT_CLEAN_SOURCE_HEAD');
  requireCheck(!git(['status', '--porcelain', '--untracked-files=no']).trim(), 'TRACKED_SOURCE_DIRTY');
  const ignore = (await readFile(resolve(root, '.dockerignore'), 'utf8')).trim().split(/\r?\n/);
  requireCheck(JSON.stringify(ignore) === JSON.stringify(IGNORE), 'DOCKER_CONTEXT_ALLOWLIST_CHANGED');
  const names = ['.dockerignore', 'Dockerfile', 'package.json', 'package-lock.json', 'fixtures/jury-booking.json', 'scripts/run-price-watch.mjs'];
  async function walk(directory) {
    requireCheck(!(await lstat(resolve(root, directory))).isSymbolicLink(), 'NO_CONTEXT_DIRECTORY_SYMLINKS');
    for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
      const name = directory + '/' + entry.name;
      requireCheck(!entry.isSymbolicLink(), 'NO_CONTEXT_SYMLINKS');
      if (entry.isDirectory()) await walk(name); else { requireCheck(entry.isFile(), 'ONLY_REGULAR_CONTEXT_FILES'); names.push(name); }
    }
  }
  await walk('app');
  const tracked = new Set(git(['ls-files', '-z']).split('\0').filter(Boolean));
  const contextHash = createHash('sha256');
  for (const name of names.sort()) {
    requireCheck(tracked.has(name) && !(await lstat(resolve(root, name))).isSymbolicLink(), 'ALL_CONTEXT_FILES_TRACKED_NO_SYMLINK');
    requireCheck(!/(?:^|\/)(?:\.env(?:\.|$)|[^/]*(?:credential|private[-_]?key)[^/]*|[^/]+\.(?:pem|p12|pfx|key))$/i.test(name), 'NO_CREDENTIAL_NAMED_CONTEXT_FILE');
    const bytes = await readFile(resolve(root, name));
    contextHash.update(`${Buffer.byteLength(name)}:${name}:${bytes.length}:`).update(bytes);
  }
  return { sourceCommit, contextSha256: contextHash.digest('hex'), fileCount: names.length, imageTag: `agency-${sourceCommit.slice(0, 12)}` };
}
async function collectMetadata(pins, allowUnverifiedInheritedIam) {
  const region = `--region=${TARGET.region}`;
  let orgPolicy;
  try { orgPolicy = gcloud(['organizations', 'get-iam-policy', TARGET.org]); }
  catch (error) { if (!allowUnverifiedInheritedIam) throw error; orgPolicy = null; }
  return {
    project: gcloud(['projects', 'describe', TARGET.project]), service: gcloud(['run', 'services', 'describe', TARGET.service, region]), revision: gcloud(['run', 'revisions', 'describe', pins.revision, region]),
    runPolicy: gcloud(['run', 'services', 'get-iam-policy', TARGET.service, region]), iapPolicy: gcloud(['iap', 'web', 'get-iam-policy', '--resource-type=cloud-run', `--service=${TARGET.service}`, region]),
    projectPolicy: gcloud(['projects', 'get-iam-policy', TARGET.project]), orgPolicy,
    reader: gcloud(['iam', 'service-accounts', 'describe', TARGET.reader]), readerPolicy: gcloud(['iam', 'service-accounts', 'get-iam-policy', TARGET.reader]),
    readerKeys: gcloud(['iam', 'service-accounts', 'keys', 'list', `--iam-account=${TARGET.reader}`, '--managed-by=user']),
    repository: gcloud(['artifacts', 'repositories', 'describe', 'hotel-price-hunter', `--location=${TARGET.region}`]), database: gcloud(['firestore', 'databases', 'describe', '--database=(default)']),
    apis: gcloud(['services', 'list', '--enabled']), customer: gcloud(['run', 'services', 'describe', 'hotel-price-hunter', region]), customerPolicy: gcloud(['run', 'services', 'get-iam-policy', 'hotel-price-hunter', region]),
  };
}
async function registryBytes(kind, reference, token) {
  requireCheck(['manifests', 'blobs'].includes(kind) && validDigest(reference), 'FIXED_REGISTRY_REFERENCE');
  const response = await fetch(`https://${TARGET.region}-docker.pkg.dev/v2/${TARGET.project}/hotel-price-hunter/agency/${kind}/${reference}`, { headers: { Authorization: `Basic ${Buffer.from(`oauth2accesstoken:${token}`).toString('base64')}`, Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  requireCheck(response.status === 200, 'REGISTRY_READ_FAILED');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; requireCheck(size <= 2 * 1024 * 1024, 'REGISTRY_RESPONSE_BOUNDED'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function main(args) {
  const option = name => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  requireCheck(args.every(value => ['--execute-verification', '--allow-unverified-inherited-iam', '--source-plan'].includes(value) || /^--(?:pins|source)=/.test(value)), 'UNKNOWN_ARGUMENT');
  if (args.includes('--source-plan')) { requireCheck(!args.includes('--execute-verification'), 'SOURCE_PLAN_OFFLINE_ONLY'); return sourceContext({ sourceCommit: option('source') }); }
  if (!args.includes('--execute-verification')) return { status: 'offline-only', target: TARGET, requiredIndependentPins: ['sourceCommit', 'contextSha256', 'imageDigest', 'revision', 'origin', 'operatorSubjectSha256', 'customerFingerprint', 'access'], externalRequests: 0 };
  const pinPath = resolve(ROOT, option('pins') || '.local/agency-cloud-pins.json');
  const localRelative = relative(resolve(ROOT, '.local'), pinPath);
  requireCheck(localRelative && !isAbsolute(localRelative) && !localRelative.startsWith('..') && !(await lstat(resolve(ROOT, '.local'))).isSymbolicLink() && !(await lstat(pinPath)).isSymbolicLink(), 'PINS_MUST_BE_IGNORED_LOCAL_FILE');
  const pins = JSON.parse(await readFile(pinPath, 'utf8'));
  validatePins(pins);
  const local = await sourceContext({ sourceCommit: pins.sourceCommit });
  requireCheck(local.contextSha256 === pins.contextSha256, 'LOCAL_CONTEXT_PIN_CHANGED');
  const allowUnverifiedInheritedIam = args.includes('--allow-unverified-inherited-iam');
  const metadata = await collectMetadata(pins, allowUnverifiedInheritedIam);
  const report = verifyAgencyMetadata(metadata, pins, { allowUnverifiedInheritedIam });
  const token = gcloud(['auth', 'print-access-token'], { text: true });
  requireCheck(token.length > 20 && !/\s/.test(token), 'TOKEN_CAPTURE_FAILED');
  const approvedBytes = await registryBytes('manifests', pins.imageDigest, token);
  const manifestBytes = pins.imageDigest === report.runtimeDigest ? approvedBytes : await registryBytes('manifests', report.runtimeDigest, token);
  const configDigest = JSON.parse(manifestBytes.toString('utf8')).config?.digest;
  const configBytes = await registryBytes('blobs', configDigest, token);
  const lineage = verifyRegistryLineage({ approvedBytes, manifestBytes, configBytes, runtimeDigest: report.runtimeDigest, pins });
  return { ...report, sourceLineage: 'verified', lineage, fullAcceptance: false, limitations: ['Browser sign-in and application access require separate evidence.', ...(metadata.orgPolicy ? ['Policy membership and governance beyond direct/inherited bindings are not exhaustively audited.'] : ['Inherited organization IAM could not be inspected; reader effective permissions remain unverified.'])] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(value => console.log(JSON.stringify(value, null, 2))).catch(error => { console.error(JSON.stringify({ status: 'failed', check: error instanceof VerificationError ? error.code : 'VERIFICATION_FAILED_OUTPUT_SUPPRESSED', fullAcceptance: false })); process.exitCode = 1; });
}
