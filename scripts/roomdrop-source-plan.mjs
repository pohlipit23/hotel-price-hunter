// Offline local source/context and previously observed registry-byte checks only.
// Historical agency/customer source guards remain untouched.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyRegistryLineage } from './verify-agency-cloud.mjs';

export const IMAGE = 'asia-southeast1-docker.pkg.dev/sincere-apex-511418-p0/hotel-price-hunter/roomdrop';
export const IGNORE = ['**', '!package.json', '!package-lock.json', '!app/', '!app/**', '!fixtures/', '!fixtures/jury-booking.json', '!scripts/', '!scripts/run-price-watch.mjs', '!scripts/run-price-watch-job.mjs'];
export const DOCKERFILE = ['FROM node:24-bookworm-slim', 'WORKDIR /app', 'COPY package.json package-lock.json ./', 'RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force', 'COPY app ./app', 'COPY fixtures/jury-booking.json ./fixtures/jury-booking.json', 'COPY scripts/run-price-watch.mjs ./scripts/run-price-watch.mjs', 'COPY scripts/run-price-watch-job.mjs ./scripts/run-price-watch-job.mjs', 'ENV NODE_ENV=production PORT=8080', 'USER node', 'EXPOSE 8080', 'CMD ["node", "app/server.mjs"]'];
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function check(value, code) { if (!value) throw new Error(code); }
function gitRead(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  check(!result.error && result.status === 0, 'LOCAL_GIT_READ_FAILED');
  return result.stdout.trimEnd();
}
export async function sourceContext({ root = ROOT, sourceCommit, git = args => gitRead(root, args) }) {
  check(/^[a-f0-9]{40}$/.test(sourceCommit) && git(['rev-parse', 'HEAD']).trim() === sourceCommit, 'EXACT_CLEAN_SOURCE_HEAD');
  check(!git(['status', '--porcelain', '--untracked-files=no']).trim(), 'TRACKED_SOURCE_DIRTY');
  const ignoreBytes = await readFile(resolve(root, '.dockerignore'));
  const dockerBytes = await readFile(resolve(root, 'Dockerfile'));
  check(JSON.stringify(ignoreBytes.toString('utf8').trim().split(/\r?\n/)) === JSON.stringify(IGNORE), 'EXACT_ROOMDROP_DOCKER_ALLOWLIST');
  check(JSON.stringify(dockerBytes.toString('utf8').trim().split(/\r?\n/)) === JSON.stringify(DOCKERFILE), 'EXACT_ROOMDROP_DOCKERFILE');
  const names = ['.dockerignore', 'Dockerfile', 'package.json', 'package-lock.json', 'fixtures/jury-booking.json', 'scripts/run-price-watch.mjs', 'scripts/run-price-watch-job.mjs'];
  for (const directory of ['app', 'fixtures', 'scripts']) check(!(await lstat(resolve(root, directory))).isSymbolicLink(), 'NO_CONTEXT_DIRECTORY_SYMLINKS');
  async function walk(directory) {
    for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
      const name = `${directory}/${entry.name}`;
      check(!entry.isSymbolicLink(), 'NO_CONTEXT_SYMLINKS');
      if (entry.isDirectory()) await walk(name);
      else { check(entry.isFile(), 'ONLY_REGULAR_CONTEXT_FILES'); names.push(name); }
    }
  }
  await walk('app');
  const tracked = new Set(git(['ls-files', '-z']).split('\0').filter(Boolean));
  const contextHash = createHash('sha256');
  for (const name of names.sort()) {
    check(tracked.has(name) && (await lstat(resolve(root, name))).isFile() && !(await lstat(resolve(root, name))).isSymbolicLink(), 'ALL_CONTEXT_FILES_TRACKED_REGULAR');
    check(!/(?:^|\/)(?:\.env(?:\.|$)|[^/]*(?:credential|private[-_]?key)[^/]*|[^/]+\.(?:pem|p12|pfx|key))$/i.test(name), 'NO_CREDENTIAL_NAMED_CONTEXT_FILE');
    const bytes = await readFile(resolve(root, name));
    contextHash.update(`${Buffer.byteLength(name)}:${name}:${bytes.length}:`).update(bytes);
  }
  return { sourceCommit, contextSha256: contextHash.digest('hex'), dockerignoreSha256: hash(ignoreBytes), dockerfileSha256: hash(dockerBytes), fileCount: names.length };
}
export async function registryEvidence({ file, source, imageDigest }) {
  const evidence = JSON.parse(await readFile(file, 'utf8'));
  check(evidence.image === IMAGE && evidence.imageDigest === imageDigest && Number.isFinite(Date.parse(evidence.observedAt)), 'FIXED_OBSERVED_REGISTRY_EVIDENCE');
  const base = dirname(resolve(file));
  const [approvedBytes, manifestBytes, configBytes] = await Promise.all(['approvedManifestPath', 'runtimeManifestPath', 'configPath'].map(key => {
    check(typeof evidence[key] === 'string' && evidence[key].length > 0, 'REGISTRY_BYTE_PATH_REQUIRED');
    return readFile(resolve(base, evidence[key]));
  }));
  const config = JSON.parse(configBytes.toString('utf8'));
  check(!(config.config?.Env || []).some(value => /^(?:GEMINI[^=]*|VERTEX[^=]*|AIPLATFORM[^=]*|GOOGLE_CLOUD_LOCATION|GOOGLE_APPLICATION_CREDENTIALS|FIRESTORE_EMULATOR_HOST)=/i.test(value)), 'NO_MODEL_OR_CREDENTIAL_IMAGE_ENV');
  return verifyRegistryLineage({ approvedBytes, manifestBytes, configBytes, runtimeDigest: evidence.runtimeDigest, pins: { ...source, imageDigest } });
}
export async function main(args = process.argv.slice(2)) {
  check(args.every(value => /^--(?:source|registry-evidence|digest)=/.test(value)) && new Set(args.map(value => value.split('=')[0])).size === args.length, 'UNKNOWN_OR_DUPLICATE_ARGUMENT');
  const option = key => args.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
  const source = await sourceContext({ sourceCommit: option('source') });
  const file = option('registry-evidence'), imageDigest = option('digest');
  check(Boolean(file) === Boolean(imageDigest), 'REGISTRY_EVIDENCE_AND_DIGEST_REQUIRED_TOGETHER');
  return { ...source, registry: file ? await registryEvidence({ file, source, imageDigest }) : null, externalRequests: 0 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(result => console.log(JSON.stringify(result))).catch(() => { console.error('ROOMDROP_SOURCE_OR_REGISTRY_CHECK_FAILED'); process.exitCode = 1; });
}
