// Private verification only. Offline by default; no provisioning, retries or direct model calls.
// https://docs.cloud.google.com/run/docs/authenticating/developers
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const PROJECT = 'sincere-apex-511418-p0';
const NUMBER = '977401667230';
const REGION = 'asia-southeast1';
const SERVICE = 'hotel-price-hunter';
const ACCOUNT = `hotel-price-hunter-runtime@${PROJECT}.iam.gserviceaccount.com`;
const ROLE = `projects/${PROJECT}/roles/hotelPriceHunterPredict`;
const MODEL = 'gemini-3.1-flash-lite';
const IMAGE = `asia-southeast1-docker.pkg.dev/${PROJECT}/hotel-price-hunter/app`;
const WORKSPACE = 'C:/Users/pohli/Sites/hotel-price-hunter';
const SNAPSHOT = 'C:/Users/pohli/.codex/worktrees/private-cloud-deployment/hotel-price-hunter';
const SOURCE_COMMIT = '9c98ede';
// Root's one global ledger path: copying/running this file elsewhere cannot reset it.
const LOCAL = resolve(WORKSPACE, '.local');
const RESULT_PATH = resolve(LOCAL, 'private-cloud-result.json');
const BASELINE_PATH = resolve(LOCAL, 'private-cloud-baseline.json');
const MODEL_RESULT_PATH = resolve(LOCAL, 'private-cloud-model-result.json');
const BUDGET_PATH = resolve(LOCAL, 'private-cloud-model-budget.json');
const RETEST_BUDGET_PATH = resolve(LOCAL, 'private-cloud-retest-budget.json');
const RETEST_RESULT_PATH = resolve(LOCAL, 'private-cloud-retest-result.json');
const QUESTIONS = Object.freeze([
  { offerId: 'DEMO_EQUIVALENT', message: 'Explain the equivalent offer: the booked stay is USD 600, replacement USD 540 and switch fee USD 5. Explain the USD 60 price drop and USD 55 net customer refund. Is any refund already completed?' },
  { offerId: 'DEMO_NON_REFUNDABLE', message: 'My plans are uncertain and I might cancel. Should I keep the flexible original booking or choose this non-refundable offer? Explain what happens to monitoring if I approve a non-refundable replacement.' },
  { offerId: 'DEMO_UNKNOWN_CONDITION', message: 'The bed type is unknown and a king bed is essential. Should I switch now? Explain what must be verified first. Do not assume equivalence or create permission.' },
]);
const args = process.argv.slice(2);
const option = key => args.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const requestedCalls = Number(option('calls') || 0);
const report = { checkedAt: new Date().toISOString(), status: 'not-attempted', project: PROJECT, region: REGION, checks: [], modelAttempts: [], trialCredits: 'not-independently-observed' };
let callPlan;
let preflightPassed = false;

export function modelCallPlan({ calls, authority, originalBudget, originalHistory, revision, retestExists = false }) {
  assert.ok([0, 2, 3].includes(calls));
  if (!calls) return { questions: [], priorAttempts: 0 };
  if (calls === 3) {
    assert.equal(authority, 'CALLBUDGET3AUTHORISED');
    assert.ok(!originalBudget, 'Original three-attempt ledger already exists; never reset or repeat it.');
    return { questions: QUESTIONS, authority, budgetPath: BUDGET_PATH, priorAttempts: 0 };
  }
  assert.equal(authority, 'MODELRETEST2AUTHORISED');
  assert.equal(originalBudget?.authority, 'CALLBUDGET3AUTHORISED');
  assert.equal(originalBudget?.attempts, 3);
  assert.equal(originalHistory?.deployment?.revision, originalBudget.revision);
  assert.equal(originalHistory?.modelAttempts?.length, 3);
  assert.ok(originalBudget.revision !== revision, 'Retest requires a newly reviewed repaired revision.');
  assert.ok(!retestExists, 'Separate retest ledger already exists; never reset or repeat it.');
  for (const offerId of ['DEMO_NON_REFUNDABLE', 'DEMO_UNKNOWN_CONDITION']) {
    const failed = originalHistory.modelAttempts.filter(item => item.offerId === offerId && item.semanticReview?.startsWith('failed'));
    assert.equal(failed.length, 1, 'Both original failed semantic cases must remain recorded.');
  }
  return { questions: QUESTIONS.slice(1), authority, budgetPath: RETEST_BUDGET_PATH, priorAttempts: 3, originalRevision: originalBudget.revision };
}
export function adviceScenarioChecks(question, reply) {
  const prose = [reply.advice?.summary, ...(reply.advice?.tradeoffs || []), ...(reply.advice?.uncertainties || [])].join(' ');
  const common = { advisoryOnly: reply.permissionsChanged === false };
  if (question.offerId === 'DEMO_EQUIVALENT') return { ...common, scenario: reply.decision?.netSavingMinor === 5500 && /55/.test(prose) };
  if (question.offerId === 'DEMO_NON_REFUNDABLE') return { ...common, scenario: reply.advice?.recommendation === 'keep-booking',
    monitoringEnds: /\b(?:monitoring|price watch|price checks)\b[^.]{0,100}\b(?:end|ends|ended|stop|stops|stopped|cease|ceases|ceased)\b|\b(?:end|ends|ended|stop|stops|stopped|cease|ceases|ceased)\b[^.]{0,100}\b(?:monitoring|price watch|price checks)\b/i.test(prose)
      && !/monitoring[^.]{0,100}depend[^.]{0,80}preference|monitoring[^.]{0,80}\b(?:does not|will not|won't|doesn't|may|might|could)\b[^.]{0,50}\b(?:end|stop|cease)\b|monitoring[^.]{0,80}\b(?:will|can) continue\b/i.test(prose) };
  return { ...common, scenario: reply.advice?.recommendation === 'keep-booking' && reply.decision?.action === 'blocked'
      && reply.decision?.reasons?.includes('UNKNOWN_ESSENTIAL_CONDITION'),
    correctCurrencyUnits: reply.decision?.netSavingMinor === 9500
      && /(?:USD\s*|\$\s*)95(?:\.00)?\b|\b95(?:\.00)?\s*(?:USD|dollars)\b/i.test(prose)
      && !/(?:USD\s*|\$\s*)9[,]?500(?:\.00)?\b|\b9[,]?500(?:\.00)?\s*(?:USD|dollars)\b/i.test(prose) };
}
async function exists(path) { try { await access(path); return true; } catch { return false; } }

function check(name, passed, evidence = {}) {
  report.checks.push({ name, status: passed ? 'passed' : 'failed', ...evidence });
  assert.ok(passed, name);
}
function gcloud(command, json = true) {
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  const commandText = `& gcloud ${[...command, '--quiet', '--verbosity=error', ...(json ? ['--format=json'] : [])].map(quote).join(' ')}; exit $LASTEXITCODE`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', commandText], { encoding: 'utf8', timeout: 120000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0 || result.error) throw new Error('Metadata or private authentication command failed; output suppressed.');
  return json ? JSON.parse(result.stdout) : result.stdout.trim();
}
function sourceAsset(path) {
  assert.ok(['app/public/booking.html', 'app/public/booking.css', 'app/public/booking.js'].includes(path));
  const result = spawnSync('git', ['-C', SNAPSHOT, 'show', `${SOURCE_COMMIT}:${path}`], { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0 || result.error) throw new Error('Approved snapshot asset unavailable.');
  return result.stdout;
}
// Git blobs use LF; Windows checkout/container copies may preserve CRLF. No other rewrite is accepted.
const hash = value => createHash('sha256').update(value.replaceAll('\r\n', '\n')).digest('hex');
const rawDigest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export function verifyIndexLineage(raw, approvedDigest, resolvedDigest) {
  assert.equal(rawDigest(raw), approvedDigest, 'Registry index bytes must hash to approved index digest.');
  const index = JSON.parse(raw.toString('utf8'));
  assert.equal(index.schemaVersion, 2);
  assert.equal(index.mediaType, 'application/vnd.oci.image.index.v1+json');
  assert.ok(Array.isArray(index.manifests) && index.manifests.length >= 1 && index.manifests.length <= 2);
  const runnable = index.manifests.filter(item => item.platform?.os === 'linux' && item.platform?.architecture === 'amd64');
  assert.equal(runnable.length, 1);
  const child = runnable[0];
  assert.equal(child.mediaType, 'application/vnd.oci.image.manifest.v1+json');
  assert.match(child.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(child.digest, resolvedDigest);
  assert.ok(!child.annotations?.['vnd.docker.reference.type']);
  const attestations = index.manifests.filter(item => item !== child);
  for (const attestation of attestations) {
    assert.equal(attestation.mediaType, 'application/vnd.oci.image.manifest.v1+json');
    assert.equal(attestation.platform?.os, 'unknown');
    assert.equal(attestation.platform?.architecture, 'unknown');
    assert.equal(attestation.annotations?.['vnd.docker.reference.type'], 'attestation-manifest');
    assert.equal(attestation.annotations?.['vnd.docker.reference.digest'], child.digest);
  }
  return { uploadedIndexDigest: approvedDigest, resolvedChildDigest: child.digest, platform: 'linux/amd64', attestationCount: attestations.length };
}
async function registryLineage(approvedDigest, resolvedDigest) {
  const accessToken = gcloud(['auth', 'print-access-token'], false);
  // Google documents access-token password auth; no Docker config/credential write is needed.
  const basic = Buffer.from(`oauth2accesstoken:${accessToken}`).toString('base64');
  const response = await fetch(`https://asia-southeast1-docker.pkg.dev/v2/${PROJECT}/hotel-price-hunter/app/manifests/${approvedDigest}`, {
    headers: { Authorization: `Basic ${basic}`, Accept: 'application/vnd.oci.image.index.v1+json' }, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
  const raw = Buffer.from(await response.arrayBuffer());
  assert.ok(raw.length <= 1024 * 1024);
  return verifyIndexLineage(raw, approvedDigest, resolvedDigest);
}
export function safeAdviceReply(body) {
  if (body?.advice) return { advice: body.advice, decision: body.decision, offerId: body.offerId, source: body.source, permissionsChanged: body.permissionsChanged };
  return { error: { code: body?.error?.code || 'UNPARSEABLE_RESPONSE', message: body?.error?.message || 'No safe application error available.' } };
}
export function validateOrigin(origin) {
  const value = new URL(origin);
  assert.equal(value.origin, origin);
  assert.equal(value.protocol, 'https:');
  assert.match(value.hostname, /^hotel-price-hunter-[a-z0-9-]+(?:\.asia-southeast1|\.a)?\.run\.app$/);
  return value.origin;
}
async function metadata(origin, revisionName, digest) {
  const project = gcloud(['projects', 'describe', PROJECT]);
  check('fixed-project', project.projectId === PROJECT && String(project.projectNumber) === NUMBER && project.lifecycleState === 'ACTIVE');
  const service = gcloud(['run', 'services', 'describe', SERVICE, `--project=${PROJECT}`, `--region=${REGION}`]);
  const revision = gcloud(['run', 'revisions', 'describe', revisionName, `--project=${PROJECT}`, `--region=${REGION}`]);
  const policy = gcloud(['run', 'services', 'get-iam-policy', SERVICE, `--project=${PROJECT}`, `--region=${REGION}`]);
  const projectPolicy = gcloud(['projects', 'get-iam-policy', PROJECT]);
  const predictionRole = gcloud(['iam', 'roles', 'describe', 'hotelPriceHunterPredict', `--project=${PROJECT}`]);
  const databases = gcloud(['firestore', 'databases', 'list', `--project=${PROJECT}`]);
  const container = service.spec.template.spec.containers[0];
  const env = Object.fromEntries((container.env || []).map(item => [item.name, item.value]));
  const expectedEnv = { NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT: PROJECT, GOOGLE_CLOUD_LOCATION: 'global', GEMINI_MODEL: MODEL, APP_ORIGIN: origin };
  const annotation = service.metadata.annotations || {};
  const templateAnnotation = service.spec.template.metadata.annotations || {};
  const roles = (projectPolicy.bindings || []).filter(binding => binding.members?.includes(`serviceAccount:${ACCOUNT}`));
  const db = databases.find(item => item.name === `projects/${PROJECT}/databases/(default)`);
  report.deployment = { origin, revision: revisionName, digest, model: MODEL, modelLocation: 'global' };
  check('private-invoker-policy', annotation['run.googleapis.com/invoker-iam-disabled'] !== 'true'
    && !(policy.bindings || []).some(binding => binding.members?.some(member => ['allUsers', 'allAuthenticatedUsers'].includes(member))));
  check('exact-ready-revision', service.status.latestReadyRevisionName === revisionName && service.status.latestCreatedRevisionName === revisionName
    && service.status.conditions?.some(item => item.type === 'Ready' && item.status === 'True')
    && revision.status.conditions?.some(item => item.type === 'Ready' && item.status === 'True')
    && service.status.traffic?.some(item => item.revisionName === revisionName && item.percent === 100));
  check('approved-service-input-index', container.image === `${IMAGE}@${digest}`, { uploadedIndexDigest: digest });
  const resolvedReference = revision.status.imageDigest;
  check('consistent-resolved-revision-image', typeof resolvedReference === 'string' && resolvedReference.startsWith(`${IMAGE}@sha256:`)
    && revision.spec.containers[0].image === resolvedReference);
  const lineage = await registryLineage(digest, resolvedReference.slice(IMAGE.length + 1));
  check('immutable-index-to-runtime-lineage', true, lineage);
  Object.assign(report.deployment, lineage);
  check('exact-origin-and-runtime-env', service.status.url === origin && Object.entries(expectedEnv).every(([key, value]) => env[key] === value)
    && Object.keys(env).every(key => Object.hasOwn(expectedEnv, key)) && !container.env?.some(item => item.valueFrom));
  check('dedicated-runtime-account', service.spec.template.spec.serviceAccountName === ACCOUNT);
  check('exact-direct-runtime-grants', roles.length === 2 && roles.every(binding => ['roles/datastore.user', ROLE].includes(binding.role) && !binding.condition)
    && new Set(roles.map(item => item.role)).size === 2, { inheritedGrants: 'not-exhaustively-audited' });
  check('exact-custom-inference-role', predictionRole.stage === 'GA' && !predictionRole.deleted
    && predictionRole.includedPermissions?.toSorted().join(',') === 'aiplatform.endpoints.predict,serviceusage.services.use');
  const limits = { serviceMin: annotation['run.googleapis.com/minScale'] ?? '0', serviceMax: annotation['run.googleapis.com/maxScale'],
    revisionMax: templateAnnotation['autoscaling.knative.dev/maxScale'], cpuThrottling: templateAnnotation['run.googleapis.com/cpu-throttling'],
    cpuBoost: templateAnnotation['run.googleapis.com/startup-cpu-boost'], concurrency: service.spec.template.spec.containerConcurrency,
    timeoutSeconds: service.spec.template.spec.timeoutSeconds, cpu: container.resources?.limits?.cpu, memory: container.resources?.limits?.memory };
  check('reviewed-resource-limits', String(limits.serviceMin) === '0' && String(limits.serviceMax) === '1' && String(limits.revisionMax) === '1'
    && limits.cpuThrottling !== 'false' && limits.cpuBoost === 'false' && limits.concurrency === 4 && limits.timeoutSeconds === 30
    && ['1', '1000m'].includes(limits.cpu) && limits.memory === '512Mi', { limits });
  check('native-singapore-database', db?.type === 'FIRESTORE_NATIVE' && db.locationId === REGION && db.databaseEdition === 'STANDARD'
    && db.deleteProtectionState === 'DELETE_PROTECTION_ENABLED', { location: db?.locationId, type: db?.type, edition: db?.databaseEdition });
}
async function runApplication(origin) {
  const identityToken = gcloud(['auth', 'print-identity-token'], false);
  assert.ok(identityToken && !/\s/.test(identityToken));
  const request = async (path, { visitor, body, headers = {}, anonymous = false } = {}) => {
    const response = await fetch(origin + path, { redirect: 'error', signal: AbortSignal.timeout(45000), method: body ? 'POST' : 'GET',
      headers: { ...(!anonymous ? { Authorization: `Bearer ${identityToken}` } : {}), ...(visitor ? { Cookie: visitor.cookie } : {}),
        ...(body ? { 'Content-Type': 'application/json', Origin: origin, 'X-CSRF-Token': visitor?.csrf } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    return { status: response.status, data, text, cookie: response.headers.get('set-cookie') };
  };
  check('anonymous-root-denied', (await request('/', { anonymous: true })).status === 403);
  const staticPage = await request('/');
  check('authenticated-approved-html', staticPage.status === 200 && hash(staticPage.text) === hash(sourceAsset('app/public/booking.html')), { sourceCommit: SOURCE_COMMIT, comparison: 'UTF-8 SHA256, CRLF normalised to Git LF only' });
  for (const asset of ['booking.css', 'booking.js']) {
    const deployedAsset = await request(`/${asset}`);
    check(`authenticated-approved-${asset}`, deployedAsset.status === 200 && hash(deployedAsset.text) === hash(sourceAsset(`app/public/${asset}`)), { sourceCommit: SOURCE_COMMIT });
  }
  const health = await request('/health');
  check('actual-firestore-health', health.status === 200 && health.data?.storage === 'firestore', { health: { status: health.data?.status, storage: health.data?.storage, model: health.data?.model } });
  const first = await request('/api/bootstrap');
  check('authenticated-bootstrap', first.status === 200 && first.data?.scenarioId === 'jury-booking' && first.data?.enrolled === false);
  const visitor = { cookie: first.cookie?.split(';')[0], csrf: first.data.csrfToken };
  check('synthetic-cookie-security', /^hph_visitor=[a-f0-9]{64}$/.test(visitor.cookie || '')
    && ['HttpOnly', 'Secure', 'SameSite=Lax'].every(flag => first.cookie.includes(flag)));
  const second = await request('/api/bootstrap');
  const other = { cookie: second.cookie?.split(';')[0], csrf: second.data?.csrfToken };
  check('second-visitor-created', second.status === 200 && other.cookie !== visitor.cookie && other.csrf !== visitor.csrf);
  const preferences = { ...first.data.preferences, automaticEquivalentSwitches: true, notificationFrequency: 'offers-only', continueMonitoring: true };
  const affirmative = { bookingVersion: first.data.booking.version, preferences,
    permissionConfirmation: { confirmed: true, version: 1, bookingVersion: first.data.booking.version, preferenceVersion: preferences.version, scope: 'equivalent-only' } };
  check('missing-separate-confirmation-rejected', (await request('/api/enrolment', { visitor, body: { bookingVersion: affirmative.bookingVersion, preferences } })).status === 422);
  check('wrong-origin-rejected', (await request('/api/enrolment', { visitor, body: affirmative, headers: { Origin: 'https://invalid.example' } })).status === 403);
  check('wrong-csrf-rejected', (await request('/api/enrolment', { visitor, body: affirmative, headers: { 'X-CSRF-Token': 'invalid' } })).status === 403);
  const enrol = await request('/api/enrolment', { visitor, body: affirmative });
  check('separate-permission-record', enrol.status === 200 && enrol.data.enrolled && enrol.data.preferences.version === preferences.version + 1
    && enrol.data.permissionRecord?.scope === 'equivalent-only' && enrol.data.permissionRecord.confirmed === true
    && enrol.data.permissionRecord.sourcePreferenceVersion === preferences.version && enrol.data.permissionRecord.preferenceVersion === enrol.data.preferences.version,
    { sourcePreferenceVersion: preferences.version, preferences: enrol.data?.preferences, permissionRecord: enrol.data?.permissionRecord });
  const selection = await request('/api/selection', { visitor, body: { bookingVersion: affirmative.bookingVersion, offerId: 'DEMO_EQUIVALENT' } });
  check('selected-comparison-saved', selection.status === 200 && selection.data.selectedOfferId === 'DEMO_EQUIVALENT');
  const refresh = await request('/api/bootstrap', { visitor });
  check('refresh-restores-enrolment', refresh.status === 200 && refresh.data.preferences.version === enrol.data.preferences.version
    && refresh.data.preferences.notificationFrequency === 'offers-only' && refresh.data.selectedOfferId === 'DEMO_EQUIVALENT',
    { enrolled: refresh.data?.enrolled, preferenceVersion: refresh.data?.preferences?.version, selectedOfferId: refresh.data?.selectedOfferId });
  const isolated = await request('/api/bootstrap', { visitor: other });
  check('second-visitor-isolation', isolated.status === 200 && !isolated.data.enrolled && isolated.data.selectedOfferId === null
    && isolated.data.preferences.automaticEquivalentSwitches === false);
  // Read only the document created by this synthetic visitor. IDs/tokens stay in memory.
  const accessToken = gcloud(['auth', 'print-access-token'], false);
  const id = visitor.cookie.split('=')[1];
  const documentResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/juryVisitors/${id}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const document = documentResponse.ok ? await documentResponse.json() : null;
  check('actual-firestore-visitor-document', documentResponse.status === 200 && document.fields?.enrolled?.booleanValue === true
    && document.fields?.selectedOfferId?.stringValue === 'DEMO_EQUIVALENT', { httpStatus: documentResponse.status, enrolled: document?.fields?.enrolled?.booleanValue,
      selectedOfferId: document?.fields?.selectedOfferId?.stringValue, preferenceVersion: document?.fields?.preferences?.mapValue?.fields?.version?.integerValue });
  const revoked = await request('/api/enrolment', { visitor, body: { bookingVersion: affirmative.bookingVersion,
    preferences: { ...enrol.data.preferences, automaticEquivalentSwitches: false } } });
  check('permission-revoked', revoked.status === 200 && revoked.data.preferences.automaticEquivalentSwitches === false && revoked.data.permissionRecord === null);
  const replay = await request('/api/enrolment', { visitor, body: affirmative });
  check('stale-affirmative-replay-rejected', replay.status === 409 && replay.data?.error?.code === 'PREFERENCES_VERSION_CHANGED');
  const restored = await request('/api/bootstrap', { visitor });
  check('revocation-remains-persisted', restored.status === 200 && restored.data.preferences.version === revoked.data.preferences.version
    && restored.data.preferences.automaticEquivalentSwitches === false && restored.data.permissionRecord === null,
    { preferenceVersion: restored.data?.preferences?.version, automaticEquivalentSwitches: restored.data?.preferences?.automaticEquivalentSwitches, permissionRecord: restored.data?.permissionRecord });
  if (!requestedCalls) return;
  await mkdir(LOCAL, { recursive: true });
  const { questions, authority, budgetPath, priorAttempts } = callPlan;
  await writeFile(budgetPath, JSON.stringify({ authority, revision: report.deployment.revision, priorAttempts, attempts: 0, ...(callPlan.originalRevision ? { originalRevision: callPlan.originalRevision } : {}) }, null, 2), { flag: 'wx' });
  report.previousGlobalAttempts = priorAttempts;
  report.totalGlobalReservedAttempts = priorAttempts;
  for (let index = 0; index < questions.length; index++) {
    const question = questions[index];
    const budget = JSON.parse(await readFile(budgetPath, 'utf8'));
    assert.equal(budget.authority, authority);
    assert.equal(budget.revision, report.deployment.revision);
    assert.equal(budget.attempts, index);
    budget.attempts++;
    // Reserve before sending; timeouts/failures consume an attempt and are never retried.
    await writeFile(budgetPath, JSON.stringify(budget, null, 2));
    report.totalGlobalReservedAttempts = priorAttempts + budget.attempts;
    const entry = { attempt: index + 1, globalAttempt: priorAttempts + index + 1, offerId: question.offerId, question: question.message, model: MODEL, location: 'global', status: 'attempted' };
    report.modelAttempts.push(entry);
    await save();
    try {
      const reply = await request('/api/advice', { visitor, body: { ...question, bookingVersion: affirmative.bookingVersion } });
      entry.httpStatus = reply.status;
      entry.response = safeAdviceReply(reply.data);
      entry.status = reply.status === 200 && reply.data?.source === 'vertex-gemini' && reply.data?.advice ? 'success' : 'failed';
      if (entry.status === 'success') {
        entry.automaticChecks = adviceScenarioChecks(question, reply.data);
        entry.semanticReview = 'required';
      }
    } catch { entry.status = 'failed'; entry.reason = 'Request failed; token, cookies and raw exception suppressed.'; }
    await save();
  }
  const after = await request('/api/bootstrap', { visitor });
  check('advice-never-restores-permission', after.status === 200 && after.data.preferences.version === revoked.data.preferences.version
    && after.data.preferences.automaticEquivalentSwitches === false && after.data.permissionRecord === null);
}
async function save() {
  await mkdir(LOCAL, { recursive: true });
  const content = JSON.stringify(report, null, 2);
  if (!preflightPassed) {
    await writeFile(resolve(LOCAL, `private-cloud-blocked-${Date.now()}.json`), content);
    return;
  }
  await writeFile(RESULT_PATH, content);
  await writeFile(requestedCalls === 2 ? RETEST_RESULT_PATH : requestedCalls ? MODEL_RESULT_PATH : BASELINE_PATH, content);
}
export async function main() {
  if (args.includes('--self-test')) {
    assert.equal(validateOrigin('https://hotel-price-hunter-977401667230.asia-southeast1.run.app'), 'https://hotel-price-hunter-977401667230.asia-southeast1.run.app');
    assert.throws(() => validateOrigin('http://invalid.example'));
    assert.throws(() => validateOrigin('https://evil.run.app'));
    assert.throws(() => validateOrigin('https://hotel-price-hunter-example.run.app/path'));
    const cleaned = safeAdviceReply({ advice: { summary: 'fixture only' }, csrfToken: 'DO_NOT_OUTPUT', cookie: 'DO_NOT_OUTPUT', source: 'vertex-gemini' });
    assert.ok(!JSON.stringify(cleaned).includes('DO_NOT_OUTPUT'));
    const childDigest = `sha256:${'1'.repeat(64)}`;
    const index = { schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', manifests: [
      { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: childDigest, platform: { os: 'linux', architecture: 'amd64' } },
      { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: `sha256:${'2'.repeat(64)}`, platform: { os: 'unknown', architecture: 'unknown' },
        annotations: { 'vnd.docker.reference.type': 'attestation-manifest', 'vnd.docker.reference.digest': childDigest } },
    ] };
    const raw = Buffer.from(JSON.stringify(index));
    assert.equal(verifyIndexLineage(raw, rawDigest(raw), childDigest).platform, 'linux/amd64');
    assert.throws(() => verifyIndexLineage(Buffer.concat([raw, Buffer.from(' ')]), rawDigest(raw), childDigest));
    assert.throws(() => verifyIndexLineage(raw, rawDigest(raw), `sha256:${'3'.repeat(64)}`));
    const wrongArch = structuredClone(index); wrongArch.manifests[0].platform.architecture = 'arm64';
    const wrongArchRaw = Buffer.from(JSON.stringify(wrongArch));
    assert.throws(() => verifyIndexLineage(wrongArchRaw, rawDigest(wrongArchRaw), childDigest));
    const wrongAttestation = structuredClone(index); wrongAttestation.manifests[1].annotations['vnd.docker.reference.digest'] = `sha256:${'4'.repeat(64)}`;
    const wrongAttestationRaw = Buffer.from(JSON.stringify(wrongAttestation));
    assert.throws(() => verifyIndexLineage(wrongAttestationRaw, rawDigest(wrongAttestationRaw), childDigest));
    const originalBudget = { authority: 'CALLBUDGET3AUTHORISED', revision: 'old-revision', attempts: 3 };
    const originalHistory = { deployment: { revision: 'old-revision' }, modelAttempts: [
      { offerId: 'DEMO_EQUIVALENT', semanticReview: 'passed' },
      { offerId: 'DEMO_NON_REFUNDABLE', semanticReview: 'failed-monitoring-consequence' },
      { offerId: 'DEMO_UNKNOWN_CONDITION', semanticReview: 'failed-currency-minor-unit-grounding' },
    ] };
    const inputs = { calls: 2, authority: 'MODELRETEST2AUTHORISED', originalBudget, originalHistory, revision: 'new-revision' };
    assert.deepEqual(modelCallPlan(inputs).questions.map(item => item.offerId), ['DEMO_NON_REFUNDABLE', 'DEMO_UNKNOWN_CONDITION']);
    assert.equal(modelCallPlan(inputs).priorAttempts, 3);
    assert.throws(() => modelCallPlan({ ...inputs, authority: 'CALLBUDGET3AUTHORISED' }));
    assert.throws(() => modelCallPlan({ ...inputs, originalBudget: { ...originalBudget, attempts: 2 } }));
    assert.throws(() => modelCallPlan({ ...inputs, revision: 'old-revision' }));
    assert.throws(() => modelCallPlan({ ...inputs, retestExists: true }));
    assert.throws(() => modelCallPlan({ ...inputs, originalHistory: { ...originalHistory, modelAttempts: originalHistory.modelAttempts.slice(0, 2) } }));
    assert.throws(() => modelCallPlan({ calls: 3, authority: 'CALLBUDGET3AUTHORISED', originalBudget }));
    const monitoring = { advice: { recommendation: 'keep-booking', summary: 'If you approve the non-refundable replacement, monitoring ends.', tradeoffs: [], uncertainties: [] }, permissionsChanged: false };
    assert.equal(adviceScenarioChecks(QUESTIONS[1], monitoring).monitoringEnds, true);
    assert.equal(adviceScenarioChecks(QUESTIONS[1], { ...monitoring, advice: { ...monitoring.advice, summary: 'Monitoring depends on your preferences.' } }).monitoringEnds, false);
    assert.equal(adviceScenarioChecks(QUESTIONS[1], { ...monitoring, advice: { ...monitoring.advice, summary: 'Monitoring will not stop.' } }).monitoringEnds, false);
    const money = { advice: { recommendation: 'keep-booking', summary: 'Keep the king bed until verified; potential refund is USD 95.00.', tradeoffs: [], uncertainties: [] },
      decision: { action: 'blocked', reasons: ['UNKNOWN_ESSENTIAL_CONDITION'], netSavingMinor: 9500 }, permissionsChanged: false };
    assert.equal(adviceScenarioChecks(QUESTIONS[2], money).correctCurrencyUnits, true);
    assert.equal(adviceScenarioChecks(QUESTIONS[2], { ...money, advice: { ...money.advice, summary: 'Net saving is 9500 USD.' } }).correctCurrencyUnits, false);
    console.log(JSON.stringify({ mode: 'offline-self-test', status: 'passed', cases: ['origins', 'output-sanitisation', 'OCI-lineage', 'single-use-budgets', 'two-failed-case-selection', 'monitoring-ends-rule', 'currency-major-unit-rule'], externalRequests: 0, modelAttempts: 0 }));
    return;
  }
  if (!args.includes('--execute')) {
    console.log(JSON.stringify({ mode: 'offline', status: 'not-attempted', requirements: ['Root-supplied canonical URL, ready revision and digest', 'Private verification authority',
      'Existing CLI Cloud Run invocation access', 'Original --calls=3 budget is single-use; no repeat/reset',
      'Retest --calls=2 requires separately granted MODELRETEST2AUTHORISED, original immutable 3/3 ledger and failed-case history, new reviewed revision; no retry'], externalRequests: 0 }, null, 2));
    return;
  }
  try {
    const origin = validateOrigin(option('origin'));
    const revisionName = option('revision');
    const digest = option('digest');
    assert.match(revisionName || '', /^hotel-price-hunter-[a-z0-9-]+$/);
    assert.match(digest || '', /^sha256:[a-f0-9]{64}$/);
    assert.ok([0, 2, 3].includes(requestedCalls));
    assert.equal(option('authority'), 'PRIVATEVERIFICATIONAUTHORISED');
    const originalBudgetExists = await exists(BUDGET_PATH);
    callPlan = modelCallPlan({ calls: requestedCalls, authority: option('model-authority'), revision: revisionName,
      originalBudget: originalBudgetExists ? JSON.parse(await readFile(BUDGET_PATH, 'utf8')) : null,
      originalHistory: requestedCalls === 2 ? JSON.parse(await readFile(MODEL_RESULT_PATH, 'utf8')) : null,
      retestExists: requestedCalls === 2 && await exists(RETEST_BUDGET_PATH) });
    preflightPassed = true;
    report.status = 'attempted';
    await metadata(origin, revisionName, digest);
    await runApplication(origin);
    report.status = report.modelAttempts.some(item => item.status !== 'success' || Object.values(item.automaticChecks || {}).some(value => value !== true)) ? 'failed' : 'passed';
  } catch (error) {
    report.status = 'failed';
    report.failure = report.checks.at(-1)?.status === 'failed' ? report.checks.at(-1).name : 'Prerequisite/input/network check failed; raw error suppressed.';
    process.exitCode = 1;
  }
  await save();
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
