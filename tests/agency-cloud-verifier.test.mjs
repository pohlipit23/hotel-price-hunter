import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyAgencyMetadata, verifyRegistryLineage, sourceContext, cloudArguments, customerFingerprint, TARGET } from '../scripts/verify-agency-cloud.mjs';
// These checks run the bundle with Windows PowerShell 5 (powershell.exe), which only exists on Windows.
const windowsPowerShell = { skip: process.platform !== 'win32' && 'needs Windows PowerShell (powershell.exe)' };

const sha = value => createHash('sha256').update(value).digest('hex');
const digest = value => 'sha256:' + sha(value);
const subject = 'accounts.google.com:123456789';
function fixture() {
  const pins = { sourceCommit: 'a'.repeat(40), contextSha256: 'b'.repeat(64), imageDigest: 'sha256:' + 'c'.repeat(64), revision: TARGET.service + '-00002-test', origin: 'https://hotel-price-hunter-agency-977401667230.asia-southeast1.run.app', operatorSubjectSha256: sha(subject), access: 'withheld', customerFingerprint: '' };
  const env = { NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT: TARGET.project, APP_SURFACE: 'agency', AGENCY_AUTH_MODE: 'iap', APP_ORIGIN: pins.origin, AGENCY_IAP_AUDIENCE: TARGET.audience, AGENCY_IAP_ALLOWED_SUBJECTS: JSON.stringify([subject]) };
  const pod = { serviceAccountName: TARGET.reader, containerConcurrency: 4, timeoutSeconds: 30, containers: [{ image: `${TARGET.image}@${pins.imageDigest}`, ports: [{ containerPort: 8080 }], resources: { limits: { cpu: '1', memory: '512Mi' } }, env: Object.entries(env).map(([name, value]) => ({ name, value })) }] };
  const annotations = { 'autoscaling.knative.dev/maxScale': '1', 'run.googleapis.com/cpu-throttling': 'true', 'run.googleapis.com/startup-cpu-boost': 'false', 'run.googleapis.com/execution-environment': 'gen2' };
  const customer = { metadata: { name: 'hotel-price-hunter', namespace: TARGET.number, annotations: {} }, spec: { template: { spec: { containers: [{ image: 'old-customer-image' }] } } }, status: { latestReadyRevisionName: 'hotel-price-hunter-00006-hfm', latestCreatedRevisionName: 'hotel-price-hunter-00006-hfm', traffic: [{ revisionName: 'hotel-price-hunter-00006-hfm', percent: 100 }] } };
  const metadata = {
    project: { projectId: TARGET.project, projectNumber: TARGET.number, lifecycleState: 'ACTIVE', parent: { type: 'organization', id: TARGET.org } },
    service: { metadata: { name: TARGET.service, namespace: TARGET.number, labels: { 'cloud.googleapis.com/location': TARGET.region }, annotations: { 'run.googleapis.com/iap-enabled': 'true', 'run.googleapis.com/ingress': 'all', 'run.googleapis.com/maxScale': '1' } }, spec: { template: { metadata: { annotations }, spec: pod } }, status: { url: pins.origin, latestReadyRevisionName: pins.revision, latestCreatedRevisionName: pins.revision, conditions: [{ type: 'Ready', status: 'True' }], traffic: [{ revisionName: pins.revision, percent: 100 }] } },
    revision: { metadata: { name: pins.revision, namespace: TARGET.number, labels: { 'serving.knative.dev/service': TARGET.service, 'cloud.googleapis.com/location': TARGET.region }, annotations }, spec: structuredClone(pod), status: { imageDigest: `${TARGET.image}@${pins.imageDigest}`, conditions: [{ type: 'Ready', status: 'True' }] } },
    runPolicy: { bindings: [{ role: 'roles/run.invoker', members: [`serviceAccount:${TARGET.iapAgent}`] }] },
    iapPolicy: { bindings: [] },
    projectPolicy: { bindings: [{ role: 'roles/datastore.viewer', members: [`serviceAccount:${TARGET.reader}`] }] },
    orgPolicy: { bindings: [] },
    reader: { email: TARGET.reader, projectId: TARGET.project, disabled: false }, readerPolicy: { bindings: [] }, readerKeys: [],
    repository: { name: `projects/${TARGET.project}/locations/${TARGET.region}/repositories/hotel-price-hunter`, format: 'DOCKER', dockerConfig: { immutableTags: true } },
    database: { name: `projects/${TARGET.project}/databases/(default)`, type: 'FIRESTORE_NATIVE', locationId: TARGET.region, databaseEdition: 'STANDARD', deleteProtectionState: 'DELETE_PROTECTION_ENABLED' },
    apis: ['iap.googleapis.com', 'run.googleapis.com', 'firestore.googleapis.com', 'iam.googleapis.com', 'artifactregistry.googleapis.com'].map(name => ({ config: { name }, state: 'ENABLED' })),
    customer, customerPolicy: { bindings: [] },
  };
  pins.customerFingerprint = customerFingerprint(customer, metadata.customerPolicy);
  return { metadata, pins };
}

test('independent agency metadata pins validate withheld and exact named-operator access without printing subjects', () => {
  const { metadata, pins } = fixture();
  const report = verifyAgencyMetadata(metadata, pins);
  assert.equal(report.status, 'metadata-verified');
  assert.doesNotMatch(JSON.stringify(report), /accounts\.google|123456789|bindings/);
  metadata.iapPolicy.bindings.push({ role: 'roles/iap.httpsResourceAccessor', members: ['user:pete@altovo.com'] });
  assert.throws(() => verifyAgencyMetadata(metadata, pins));
  assert.equal(verifyAgencyMetadata(metadata, { ...pins, access: 'operator' }).status, 'metadata-verified');
});

test('unavailable inherited IAM fails closed by default and is an explicit incomplete coverage result when opted in', () => {
  const { metadata, pins } = fixture();
  metadata.orgPolicy = null;
  assert.throws(() => verifyAgencyMetadata(metadata, pins), /INHERITED_IAM_UNVERIFIED/);
  const report = verifyAgencyMetadata(metadata, pins, { allowUnverifiedInheritedIam: true });
  assert.equal(report.status, 'metadata-partial');
  assert.equal(report.fullAcceptance, false);
  assert.equal(report.inheritedIam, 'unverified');
});

test('metadata verifier fails closed on service, image, env, IAP, IAM, runtime, source and customer drift', () => {
  const mutations = [
    m => { m.project.projectNumber = 'wrong'; }, m => { m.project.parent.id = 'wrong'; }, m => { m.service.metadata.name = 'hotel-price-hunter'; },
    m => { m.service.metadata.annotations['run.googleapis.com/iap-enabled'] = 'false'; }, m => { m.service.metadata.annotations['run.googleapis.com/invoker-iam-disabled'] = 'true'; },
    m => { m.service.status.latestReadyRevisionName = 'old'; }, m => { m.service.status.traffic.push({ revisionName: 'old', percent: 0, tag: 'old' }); },
    m => { m.service.spec.template.spec.containers[0].image = TARGET.image + ':latest'; }, m => { m.revision.status.imageDigest = TARGET.image + '@sha256:' + 'd'.repeat(64); },
    m => { m.service.spec.template.spec.containers[0].env.push({ name: 'GEMINI_MODEL', value: 'forbidden' }); },
    m => { m.service.spec.template.spec.containers[0].env[0].valueFrom = { secretKeyRef: { name: 'forbidden' } }; },
    m => { m.service.spec.template.spec.containers[0].env.push({ ...m.service.spec.template.spec.containers[0].env[0] }); },
    m => { m.service.spec.template.spec.serviceAccountName = 'customer-runtime'; }, m => { m.service.spec.template.spec.containers[0].command = ['sh']; },
    m => { m.revision.spec.volumes = [{}]; }, m => { m.service.spec.template.spec.containers[0].volumeMounts = [{}]; },
    m => { m.service.metadata.annotations['run.googleapis.com/maxScale'] = '2'; }, m => { m.service.spec.template.metadata.annotations['run.googleapis.com/startup-cpu-boost'] = 'true'; },
    m => { m.runPolicy.bindings[0].members.push('allUsers'); }, m => { m.runPolicy.bindings[0].members.push('user:pete@altovo.com'); },
    m => { m.iapPolicy.bindings.push({ role: 'roles/iap.httpsResourceAccessor', members: ['domain:altovo.com'] }); },
    m => { m.projectPolicy.bindings.push({ role: 'roles/datastore.user', members: [`serviceAccount:${TARGET.reader}`] }); },
    m => { m.orgPolicy.bindings.push({ role: 'roles/editor', members: [`serviceAccount:${TARGET.reader}`] }); },
    m => { m.orgPolicy.bindings.push({ role: 'roles/run.invoker', members: ['allAuthenticatedUsers'] }); },
    m => { m.projectPolicy.bindings.push({ role: 'roles/iap.httpsResourceAccessor', members: ['user:pete@altovo.com'] }); },
    m => { m.readerKeys.push({ keyType: 'USER_MANAGED' }); }, m => { m.repository.dockerConfig.immutableTags = false; },
    m => { m.database.locationId = 'wrong'; }, m => { m.customer.spec.template.spec.containers[0].image = 'changed'; }, m => { m.apis.pop(); },
  ];
  for (const mutate of mutations) { const { metadata, pins } = fixture(); mutate(metadata); assert.throws(() => verifyAgencyMetadata(metadata, pins), undefined, String(mutate)); }
  const { metadata, pins } = fixture();
  for (const bad of [{ sourceCommit: 'short' }, { contextSha256: '' }, { operatorSubjectSha256: 'f'.repeat(64) }, { customerFingerprint: '' }, { imageDigest: 'sha256:' + 'e'.repeat(64) }]) assert.throws(() => verifyAgencyMetadata(metadata, { ...pins, ...bad }));
});

test('registry bytes prove approved index to exact runtime manifest to pinned source/context config labels', () => {
  const { pins } = fixture();
  const configBytes = Buffer.from(JSON.stringify({ architecture: 'amd64', os: 'linux', config: { User: 'node', WorkingDir: '/app', Entrypoint: ['docker-entrypoint.sh'], Cmd: ['node', 'app/server.mjs'], Labels: { 'org.opencontainers.image.revision': pins.sourceCommit, 'com.roomdrop.build-context.sha256': pins.contextSha256 } } }));
  const manifestBytes = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: { digest: digest(configBytes) }, layers: [] }));
  const runtimeDigest = digest(manifestBytes);
  const indexBytes = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', manifests: [{ mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: runtimeDigest, platform: { os: 'linux', architecture: 'amd64' } }] }));
  const input = { approvedBytes: indexBytes, manifestBytes, configBytes, runtimeDigest, pins: { ...pins, imageDigest: digest(indexBytes) } };
  assert.equal(verifyRegistryLineage(input).sourceCommit, pins.sourceCommit);
  assert.equal(verifyRegistryLineage({ ...input, approvedBytes: manifestBytes, pins: { ...pins, imageDigest: runtimeDigest } }).runtimeDigest, runtimeDigest);
  for (const bad of [{ runtimeDigest: 'sha256:' + 'e'.repeat(64) }, { approvedBytes: Buffer.from('bad') }, { manifestBytes: Buffer.from('bad') }, { configBytes: Buffer.from('bad') }, { pins: { ...input.pins, sourceCommit: 'f'.repeat(40) } }, { pins: { ...input.pins, contextSha256: 'e'.repeat(64) } }]) assert.throws(() => verifyRegistryLineage({ ...input, ...bad }));
});

test('every external gcloud argument list pins corrected account/project and accepts no credential command', () => {
  assert.deepEqual(cloudArguments(['run', 'services', 'describe', TARGET.service]).slice(-4), [`--account=${TARGET.operator}`, `--project=${TARGET.project}`, '--quiet', '--format=json']);
  assert.throws(() => cloudArguments(['auth', 'login']));
  assert.throws(() => cloudArguments(['config', 'set', 'account', 'other']));
  assert.throws(() => cloudArguments(['run', 'services', 'update', TARGET.service]));
});

test('source context checks clean exact HEAD, actual allowlisted bytes, untracked app files and Docker ignore rules', async t => {
  const root = await mkdtemp(join(tmpdir(), 'agency-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'app'));
  await mkdir(join(root, 'fixtures'));
  await mkdir(join(root, 'scripts'));
  const files = ['.dockerignore', 'Dockerfile', 'package.json', 'package-lock.json', 'app/server.mjs', 'fixtures/jury-booking.json', 'scripts/run-price-watch.mjs'];
  const ignore = '**\n!package.json\n!package-lock.json\n!app/\n!app/**\n!fixtures/\n!fixtures/jury-booking.json\n!scripts/\n!scripts/run-price-watch.mjs\n';
  for (const path of files) await writeFile(join(root, path), path === '.dockerignore' ? ignore : path);
  const sourceCommit = 'a'.repeat(40);
  let dirty = false;
  const git = args => args[0] === 'rev-parse' ? sourceCommit : args[0] === 'status' ? (dirty ? ' M app/server.mjs' : '') : files.join('\0') + '\0';
  const plan = await sourceContext({ root, sourceCommit, git });
  assert.match(plan.contextSha256, /^[a-f0-9]{64}$/);
  await writeFile(join(root, 'app/server.mjs'), 'changed bytes');
  assert.notEqual((await sourceContext({ root, sourceCommit, git })).contextSha256, plan.contextSha256);
  dirty = true; await assert.rejects(sourceContext({ root, sourceCommit, git })); dirty = false;
  await assert.rejects(sourceContext({ root, sourceCommit: 'b'.repeat(40), git }));
  await writeFile(join(root, 'app/ignored-credential.json'), '{}');
  await assert.rejects(sourceContext({ root, sourceCommit, git }));
});

test('PowerShell bundle is offline by default, keeps exact account/project flags and scopes every mutation to the approved agency target', windowsPowerShell, () => {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/prepare-agency-cloud.ps1'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.executedCloudCommands, 0);
  assert.equal(plan.source.verifiedCleanLocalSource, false);
  assert.equal(plan.account, 'pete@altovo.com');
  assert.match(plan.iamBlastRadius.join(' '), /every Firestore document/);
  for (const phase of Object.values(plan.phases)) {
    for (const command of phase) {
      if (command.program === 'gcloud') {
        assert.ok(command.arguments.includes('--account=pete@altovo.com'));
        assert.ok(command.arguments.includes('--project=' + TARGET.project));
        assert.equal(command.arguments.includes('hotel-price-hunter'), false, 'No command changes the customer service.');
        assert.equal(command.arguments.some(value => value.includes('allUsers') || value.includes('allAuthenticatedUsers')), false);
      } else if (command.program === 'docker') assert.ok(command.arguments[0].startsWith('--config='));
      else {
        assert.equal(command.program, 'https-request');
        assert.equal(command.method, 'POST');
        assert.equal(command.url, 'https://serviceusage.googleapis.com/v1beta1/projects/977401667230/services/iap.googleapis.com:generateServiceIdentity');
        assert.equal(command.authAccount, TARGET.operator);
        assert.deepEqual(command.body, {});
      }
    }
  }
  const build = plan.phases.Build.find(command => command.name.startsWith('Build reviewed'));
  assert.equal(plan.phases.Provision.at(-1).program, 'https-request');
  assert.ok(build.arguments.includes('--provenance=false'));
  const deploy = plan.phases.Deploy[0].arguments;
  for (const flag of ['--iap', '--no-allow-unauthenticated', '--max=1', '--min=0', '--max-instances=1', '--no-cpu-boost']) assert.ok(deploy.includes(flag));
  assert.equal(plan.phases.GrantAccess.length, 1);
  assert.ok(plan.phases.GrantAccess[0].arguments.includes('--member=user:pete@altovo.com'));
  assert.doesNotMatch(result.stdout, /accounts\.google\.com:[0-9]|pete@easygds|application-default/);
});

test('verifier default CLI performs only offline description and rejects mutation-style arguments', () => {
  const offline = spawnSync(process.execPath, ['scripts/verify-agency-cloud.mjs'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.equal(offline.status, 0);
  assert.equal(JSON.parse(offline.stdout).externalRequests, 0);
  const denied = spawnSync(process.execPath, ['scripts/verify-agency-cloud.mjs', '--execute'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /UNKNOWN_ARGUMENT/);
});
