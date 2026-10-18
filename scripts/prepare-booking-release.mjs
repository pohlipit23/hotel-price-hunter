import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceFiles = ['package.json','package-lock.json','app/quotation-advisor.mjs','app/stay-chat.mjs','app/gemini.mjs','app/prompts/quotation-advice.txt','app/prompts/stay-chat.txt','app/prompts/stay-chat-opening.txt',
'app/public/stay-advice.js','app/public/stay-advice.css','app/booking-cloud.mjs','app/quotation-cloud.mjs','app/booking-demo-server.mjs','app/quotation-demo-server.mjs','app/quotation-session-actions.mjs','app/quotation-post-watch.mjs',
'app/domain/quotation-demo.mjs','app/domain/altovo-quotation.mjs','app/domain/live-comparison.mjs','app/domain/decision.mjs','app/domain/money.mjs','app/live-engine.mjs',
'app/public/booking.html','app/public/booking.css','app/public/booking.js','app/public/booking-live.js','app/public/booking-live-data.js','app/public/drop-eligibility.js',
'app/public/booking-judge.js','app/public/drop-watch.js','app/public/pricing.js','app/public/watch.js','app/public/stay-photos.js',
'app/public/assets/roomdrop-logo.png','app/public/assets/roomdrop-key-icon.png','app/public/assets/illustrative-stays.jpg',
...['179','180','181','182','183','184'].map(code => `app/public/assets/roomdrop-airb000${code}-hotel.jpg`),
...['181','182'].map(code => `app/public/assets/roomdrop-airb000${code}-room.jpg`)];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function main(args = process.argv.slice(2), { root = fileURLToPath(new URL('../', import.meta.url)), readSource } = {}) {
  if (!args.includes('--prepare')) return { status: 'offline', requirements: ['--prepare', '--source=exact-commit', '--manifest=reviewed-.local-code-version-pins'] };
  if (args.some(arg => arg !== '--prepare' && !arg.startsWith('--source=') && !arg.startsWith('--manifest='))
    || new Set(args.map(arg => arg.split('=')[0])).size !== args.length) throw Error('INVALID_RELEASE_ARGUMENTS');
  const source = args.find(arg => arg.startsWith('--source='))?.slice(9), input = args.find(arg => arg.startsWith('--manifest='))?.slice(11);
  if (!/^[a-f0-9]{40}$/.test(source ?? '') || !input) throw Error('EXACT_RELEASE_INPUT_REQUIRED');
  const workspace = await realpath(root); const local = resolve(workspace, '.local');
  if (await realpath(local) !== local) throw Error('PRIVATE_RELEASE_ROOT_REQUIRED');
  const path = await realpath(resolve(workspace, input)); const part = relative(local, path);
  if (!part || part === '..' || part.startsWith('..' + sep) || isAbsolute(part)) throw Error('PRIVATE_SNAPSHOT_REQUIRED');
  const privateData = JSON.parse(await readFile(path, 'utf8'));
  const releaseName = 'booking-catalogue-manifest.json';
  const git = command => execFileSync('git', command, { cwd: workspace, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (git(['rev-parse', `${source}^{commit}`]).toString().trim() !== source) throw Error('SOURCE_COMMIT_UNAVAILABLE');
  const sourceBytes = readSource ?? (name => {
    try { return git(['show', `${source}:${name}`]); } catch { throw Error('SOURCE_DEPENDENCY_MISSING'); }
  });
  const directory = resolve(local, `booking-release-${randomUUID()}`); const context = resolve(directory, 'context');
  await mkdir(context, { recursive: true }); const files = [];
  const pending = [...sourceFiles], seen = new Set();
  for (const name of pending) {
    if (seen.has(name)) continue; seen.add(name);
    if (!/^(?:app\/[^\\]*|package(?:-lock)?\.json)$/.test(name) || name.includes('..')) throw Error('SOURCE_DEPENDENCY_DENIED');
    const bytes = Buffer.from(await sourceBytes(name)); const target = resolve(context, name); await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' }); files.push({ path: name, sha256: hash(bytes), bytes: bytes.length });
    if (/\.(?:mjs|js)$/.test(name)) for (const match of bytes.toString().matchAll(/(?:from\s*|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g)) {
      const dependency = relative(workspace, resolve(workspace, dirname(name), match[2])).split(sep).join('/');
      pending.push(dependency);
    }
  }
  const dockerfile = Buffer.from(await sourceBytes('Dockerfile.booking')); await writeFile(resolve(context, 'Dockerfile'), dockerfile, { flag: 'wx' });
  files.push({ path: 'Dockerfile', sha256: hash(dockerfile), bytes: dockerfile.length });
  // Validate and project with the frozen commit's code, never the possibly dirty preparation checkout.
  const { validateCatalogueManifest } = await import(pathToFileURL(resolve(context, 'app/booking-cloud.mjs')).href);
  if (typeof validateCatalogueManifest !== 'function') throw Error('CURATED_RUNTIME_SOURCE_REQUIRED');
  const release = validateCatalogueManifest(privateData);
  const bytes = Buffer.from(JSON.stringify(release) + '\n'); await writeFile(resolve(context, releaseName), bytes, { flag: 'wx' });
  files.push({ path: releaseName, sha256: hash(bytes), bytes: bytes.length });
  files.sort((a, b) => a.path.localeCompare(b.path)); const contextSha256 = hash(JSON.stringify(files));
  const manifest = { sourceCommit: source, sourceMode: readSource ? 'test-injected' : 'git-commit', contextSha256, catalogueManifestSha256: hash(bytes),
    releaseGate: 'requires-integrated-firestore-and-release-approval',
    catalogue: release.entries, contextDirectory: context, privateManifest: path, uncommittedFilesExcluded: !readSource, files,
    localImageTag: `roomdrop-booking${readSource ? '-test' : ''}:${source.slice(0, 12)}-${contextSha256.slice(0, 12)}`,
    registry: readSource ? null : 'asia-southeast1-docker.pkg.dev/sincere-apex-511418-p0/hotel-price-hunter/roomdrop',
    registryTag: readSource ? null : `booking-${source.slice(0, 12)}-${contextSha256.slice(0, 12)}` };
  const manifestPath = resolve(directory, 'manifest.json'); await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return { status: readSource ? 'test-prepared-offline' : 'prepared-offline', manifestPath, sourceCommit: source, contextSha256, catalogueManifestSha256: manifest.catalogueManifestSha256,
    contextDirectory: context, localImageTag: manifest.localImageTag };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(await main(), null, 2)); }
  catch (error) { console.error(JSON.stringify({ status: 'blocked', code: /^[A-Z_]+$/.test(error.message) ? error.message : 'RELEASE_PREPARATION_FAILED' })); process.exitCode = 1; }
}
