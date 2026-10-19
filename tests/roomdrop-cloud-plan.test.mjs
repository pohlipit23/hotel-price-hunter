import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceContext, registryEvidence, IMAGE, IGNORE, DOCKERFILE } from '../scripts/roomdrop-source-plan.mjs';
// These checks run the bundle with Windows PowerShell 5 (powershell.exe), which only exists on Windows.
const windowsPowerShell = { skip: process.platform !== 'win32' && 'needs Windows PowerShell (powershell.exe)' };

const project = 'sincere-apex-511418-p0', account = 'pete@altovo.com', region = 'asia-southeast1';
const digest = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
function bundle(args = []) {
  return spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','scripts/prepare-roomdrop-cloud.ps1', ...args], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'roomdrop-cloud-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['app','scripts','fixtures']) await mkdir(join(root, directory));
  const files = ['.dockerignore','Dockerfile','package.json','package-lock.json','app/server.mjs','fixtures/jury-booking.json','scripts/run-price-watch.mjs','scripts/run-price-watch-job.mjs'];
  for (const file of files) await writeFile(join(root, file), file === '.dockerignore' ? IGNORE.join('\n') + '\n' : file === 'Dockerfile' ? DOCKERFILE.join('\n') + '\n' : file);
  const sourceCommit = 'a'.repeat(40);
  let dirty = false;
  const git = args => args[0] === 'rev-parse' ? sourceCommit : args[0] === 'status' ? (dirty ? ' M app/server.mjs' : '') : files.join('\0') + '\0';
  return { root, files, sourceCommit, git, setDirty: value => { dirty = value; } };
}

test('offline default has structured fixed-target commands, isolated auth and no activation race', windowsPowerShell, () => {
  const result = bundle(); assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.executedCloudCommands, 0); assert.equal(plan.account, account); assert.equal(plan.project, project); assert.equal(plan.region, region);
  assert.equal(plan.source.verifiedCleanLocalSource, false); assert.equal(plan.source.verifiedRegistryBytes, false); assert.equal(plan.image.readyForDeploymentReview, false);
  assert.equal(plan.schedule.beforeAcceptance, 'ABSENT (or independently verified PAUSED if already owned)');
  assert.equal(plan.phases.ActivateScheduler, undefined); assert.equal(plan.phases.OneShot, undefined);
  assert.match(plan.iamBlastRadius.join(' '), /ALL Firestore documents/);
  for (const phase of [...Object.values(plan.phases), plan.deferredActivation, plan.stopScheduling]) {
    for (const step of phase) {
      assert.ok(Array.isArray(step.arguments)); assert.equal(step.account, account); assert.equal(step.project, project); assert.equal(step.region, region);
      if (step.program === 'gcloud') { assert.ok(step.arguments.includes('--account=' + account)); assert.ok(step.arguments.includes('--project=' + project)); }
      else { assert.equal(step.program, 'docker'); assert.ok(step.arguments[0].startsWith('--config=')); }
      assert.equal(step.arguments.some(value => /allUsers|allAuthenticatedUsers|hotel-price-hunter-agency@/.test(value)), false);
    }
  }
  assert.equal(Object.values(plan.phases).flat().some(step => step.arguments.slice(0, 3).join(' ') === 'scheduler jobs create'), false);
  const activate = plan.deferredActivation[0];
  for (const flag of ['--schedule=0 8 * * *','--time-zone=Asia/Kuala_Lumpur','--message-body={}','--max-retry-attempts=0',`--oauth-service-account-email=roomdrop-watch-trigger@${project}.iam.gserviceaccount.com`,`--uri=https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/roomdrop-price-watch:run`]) assert.ok(activate.arguments.includes(flag), flag);
  assert.match(activate.gate, /AFTER separately approved one-shot/);
  assert.doesNotMatch(JSON.stringify(activate.arguments), /oidc|override|--paused/);
});

test('private customer and bounded watch job use separate identities and exact literal configuration', windowsPowerShell, () => {
  const result = bundle(); assert.equal(result.status, 0, result.stderr); const plan = JSON.parse(result.stdout);
  const customer = plan.phases.DeployCustomer[0].arguments, job = plan.phases.DeployJob[0].arguments;
  for (const flag of ['--iap','--no-allow-unauthenticated','--invoker-iam-check','--cpu=1','--memory=512Mi','--concurrency=4','--min=0','--max=1','--max-instances=1','--timeout=30s','--cpu-throttling','--no-cpu-boost',`--service-account=hotel-price-hunter-runtime@${project}.iam.gserviceaccount.com`]) assert.ok(customer.includes(flag), flag);
  assert.equal(customer.find(value => value.startsWith('--set-env-vars=')), `--set-env-vars=NODE_ENV=production,GOOGLE_CLOUD_PROJECT=${project},APP_SURFACE=customer,APP_ORIGIN=https://hotel-price-hunter-2qbcpylngq-as.a.run.app`);
  for (const flag of ['--tasks=1','--parallelism=1','--max-retries=1','--task-timeout=300s','--cpu=1','--memory=512Mi','--command=node','--args=scripts/run-price-watch-job.mjs',`--service-account=roomdrop-watch-writer@${project}.iam.gserviceaccount.com`]) assert.ok(job.includes(flag), flag);
  assert.equal(job.find(value => value.startsWith('--set-env-vars=')), `--set-env-vars=NODE_ENV=production,GOOGLE_CLOUD_PROJECT=${project},PRICE_WATCH_JOB_ENABLED=true,PRICE_WATCH_PROVIDER_MODE=simulated-fixture`);
  assert.doesNotMatch([...customer, ...job].join(' '), /GEMINI|VERTEX|CLOUD_RUN_JOB=|EMULATOR|--execute-now/);
  const triggerGrants = Object.values(plan.phases).flat().filter(step => step.arguments.some(value => value === `--member=serviceAccount:roomdrop-watch-trigger@${project}.iam.gserviceaccount.com`));
  assert.equal(triggerGrants.length, 1); assert.deepEqual(triggerGrants[0].arguments.slice(0, 4), ['run','jobs','add-iam-policy-binding','roomdrop-price-watch']);
  assert.ok(triggerGrants[0].arguments.includes('--role=roles/run.invoker'));
  const iap = plan.phases.GrantAccess[0].arguments; assert.ok(iap.includes('--service=hotel-price-hunter')); assert.ok(iap.includes('--member=user:' + account));
});

test('job invoker uses supported unconditional binding arguments while other IAM commands retain their condition flag', windowsPowerShell, () => {
  const result = bundle(); assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  const bindings = Object.values(plan.phases).flat().filter(step => step.program === 'gcloud' && step.arguments.includes('add-iam-policy-binding'));
  const jobBindings = bindings.filter(step => step.arguments.slice(0, 3).join(' ') === 'run jobs add-iam-policy-binding');
  assert.equal(jobBindings.length, 1);
  assert.deepEqual(jobBindings[0].arguments, ['run','jobs','add-iam-policy-binding','roomdrop-price-watch',`--region=${region}`,`--member=serviceAccount:roomdrop-watch-trigger@${project}.iam.gserviceaccount.com`,'--role=roles/run.invoker',`--account=${account}`,`--project=${project}`,'--quiet','--verbosity=error']);
  assert.equal(jobBindings[0].arguments.some(value => value === '--condition' || value.startsWith('--condition=')), false);
  const otherBindings = bindings.filter(step => !jobBindings.includes(step));
  assert.equal(otherBindings.length, 3);
  for (const binding of otherBindings) assert.ok(binding.arguments.includes('--condition=None'), binding.name);
});

test('bundle rejects execution switches, invalid pins and unsubstantiated image digests', windowsPowerShell, () => {
  for (const args of [['-Execute'], ['-Phase','Unknown'], ['-SourceCommit','short'], ['-ImageDigest','sha256:' + 'a'.repeat(64)], ['-RegistryEvidenceFile','missing.json']]) {
    const result = bundle(args); assert.notEqual(result.status, 0, args.join(' '));
  }
  const result = bundle(['-SourceCommit','f'.repeat(40)]); assert.notEqual(result.status, 0); assert.match(result.stderr, /clean source\/context/);
});

test('source plan hashes exact reviewed bytes, rejects dirty/untracked or widened context, and excludes brand designs', async t => {
  const f = await fixture(t), original = await sourceContext(f);
  assert.match(original.contextSha256, /^[a-f0-9]{64}$/); assert.match(original.dockerignoreSha256, /^[a-f0-9]{64}$/); assert.match(original.dockerfileSha256, /^[a-f0-9]{64}$/);
  await mkdir(join(f.root,'designs')); await mkdir(join(f.root,'designs','brand')); await writeFile(join(f.root,'designs','brand','untouched.txt'),'untracked brand asset');
  assert.deepEqual(await sourceContext(f), original);
  await writeFile(join(f.root,'app','server.mjs'),'new source bytes'); assert.notEqual((await sourceContext(f)).contextSha256, original.contextSha256);
  f.setDirty(true); await assert.rejects(sourceContext(f), /TRACKED_SOURCE_DIRTY/); f.setDirty(false);
  await assert.rejects(sourceContext({ ...f, sourceCommit: 'b'.repeat(40) }), /EXACT_CLEAN_SOURCE_HEAD/);
  await writeFile(join(f.root,'app','extra.mjs'),'untracked included byte'); await assert.rejects(sourceContext(f), /ALL_CONTEXT_FILES_TRACKED/); await rm(join(f.root,'app','extra.mjs'));
  await writeFile(join(f.root,'.dockerignore'), IGNORE.join('\n') + '\n!designs/**\n'); await assert.rejects(sourceContext(f), /EXACT_ROOMDROP_DOCKER_ALLOWLIST/);
  await writeFile(join(f.root,'.dockerignore'), IGNORE.join('\n') + '\n');
  await writeFile(join(f.root,'Dockerfile'), DOCKERFILE.join('\n') + '\nCOPY . .\n'); await assert.rejects(sourceContext(f), /EXACT_ROOMDROP_DOCKERFILE/);
});

test('independent registry byte evidence must hash to the pinned source/context and contain no model env', async t => {
  const f = await fixture(t), source = await sourceContext(f);
  const config = { architecture:'amd64', os:'linux', config:{ User:'node', WorkingDir:'/app', Cmd:['node','app/server.mjs'], Entrypoint:['docker-entrypoint.sh'], Env:['NODE_ENV=production','PORT=8080'], Labels:{ 'org.opencontainers.image.revision':source.sourceCommit, 'com.roomdrop.build-context.sha256':source.contextSha256 } } };
  async function evidenceFor(value) {
    const configBytes = Buffer.from(JSON.stringify(value));
    const manifestBytes = Buffer.from(JSON.stringify({ schemaVersion:2, mediaType:'application/vnd.oci.image.manifest.v1+json', config:{ digest:digest(configBytes) } }));
    await writeFile(join(f.root,'config.json'),configBytes); await writeFile(join(f.root,'manifest.json'),manifestBytes);
    const imageDigest = digest(manifestBytes);
    await writeFile(join(f.root,'evidence.json'),JSON.stringify({ image:IMAGE, observedAt:'2026-10-15T00:00:00Z', imageDigest, runtimeDigest:imageDigest, approvedManifestPath:'manifest.json', runtimeManifestPath:'manifest.json', configPath:'config.json' }));
    return { file:join(f.root,'evidence.json'), source, imageDigest };
  }
  const options = await evidenceFor(config); assert.equal((await registryEvidence(options)).sourceCommit, source.sourceCommit);
  await assert.rejects(registryEvidence({ ...options, source:{ ...source, sourceCommit:'f'.repeat(40) } }), /PINNED_SOURCE/);
  await writeFile(join(f.root,'config.json'),'{}'); await assert.rejects(registryEvidence(options), /CONFIG_MANIFEST_LINEAGE/);
  const model = structuredClone(config); model.config.Env.push('GEMINI_MODEL=forbidden'); await assert.rejects(registryEvidence(await evidenceFor(model)), /NO_MODEL_OR_CREDENTIAL_IMAGE_ENV/);
  await assert.rejects(registryEvidence({ ...await evidenceFor(config), imageDigest:'sha256:' + 'f'.repeat(64) }), /FIXED_OBSERVED/);
});

test('new source checker has no network/execution mode and leaves historical source verifiers intact', async () => {
  const result = spawnSync(process.execPath, ['scripts/roomdrop-source-plan.mjs','--execute'], { encoding:'utf8', windowsHide:true, timeout:15000 }); assert.equal(result.status,1); assert.match(result.stderr,/ROOMDROP_SOURCE_OR_REGISTRY_CHECK_FAILED/);
  const historical = await readFile(new URL('../scripts/verify-agency-cloud.mjs', import.meta.url),'utf8');
  assert.ok(historical.includes("'!scripts/run-price-watch.mjs'];")); assert.equal(historical.includes('!scripts/run-price-watch-job.mjs'),false);
});
