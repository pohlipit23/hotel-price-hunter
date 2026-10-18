import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBookingStorage, createRoomdropFirestore, PHOTO_ASSET } from '../app/booking-storage.mjs';

// Owner-run admin import of a reviewed curated catalogue into the shared booking/Drop records.
// Input: one JSON file { schemaVersion: 1, entries: [prepared bundles with capture records], cards: [card manifest] },
// plus an optional reviewed image manifest (--images=PATH) mapping codes and Drop ids to shipped assets.
// Default is a dry run: validate only, no Firestore client is created. --execute writes create-only
// records, and in this slice only to a loopback emulator with a demo- project. A production import
// needs a separate explicit approval and is refused here even when its flag is given.
const blocked = code => Object.assign(new Error(), { code });
const FLAGS = ['--catalogue=', '--images=', '--project=', '--database=', '--emulator='];
const SWITCHES = ['--execute', '--production-import-approved'];
const LOOPBACK = /^(?:localhost|127\.0\.0\.1):\d{1,5}$/;

const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// The reviewed image manifest ({ schemaVersion: 1, images: { [code]: { hotel?, drops? } } }) maps
// codes and Drop ids to local assets only; remote source URLs never reach the importer's records.
async function readImages(workspace, path) {
  if (!resolve(workspace, path).startsWith(workspace + sep)) throw blocked('IMAGE_MANIFEST_PATH_OUTSIDE_WORKSPACE');
  const file = await realpath(resolve(workspace, path)).catch(() => { throw blocked('IMAGE_MANIFEST_UNAVAILABLE'); });
  if (!file.startsWith(workspace + sep)) throw blocked('IMAGE_MANIFEST_PATH_OUTSIDE_WORKSPACE');
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size > 200_000) throw blocked('IMAGE_MANIFEST_UNAVAILABLE');
  let manifest; try { manifest = JSON.parse(await readFile(file, 'utf8')); } catch { throw blocked('IMAGE_MANIFEST_INVALID'); }
  if (!plain(manifest) || manifest.schemaVersion !== 1 || Object.keys(manifest).some(key => !['schemaVersion', 'images'].includes(key))) throw blocked('IMAGE_MANIFEST_INVALID');
  return manifest.images;
}

// Photos must be reviewed assets already shipped with the app. Malformed paths are never looked up;
// the storage planner refuses them.
async function requireAsset(workspace, photo, reason) {
  if (typeof photo?.asset !== 'string' || !PHOTO_ASSET.test(photo.asset)) return;
  const asset = await stat(resolve(workspace, 'app', 'public', photo.asset)).catch(() => null);
  if (!asset?.isFile()) throw blocked(reason);
}

async function readInput(root, path, imagesPath) {
  const workspace = await realpath(root);
  const file = await realpath(resolve(workspace, path)).catch(() => { throw blocked('CATALOGUE_FILE_UNAVAILABLE'); });
  if (!file.startsWith(workspace + sep)) throw blocked('CATALOGUE_PATH_OUTSIDE_WORKSPACE');
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size > 2_000_000) throw blocked('CATALOGUE_FILE_UNAVAILABLE');
  let input; try { input = JSON.parse(await readFile(file, 'utf8')); } catch { throw blocked('CATALOGUE_INVALID'); }
  let images = input?.images;
  if (imagesPath !== undefined) {
    if (images !== undefined) throw blocked('IMAGE_MANIFEST_INVALID');
    images = await readImages(workspace, imagesPath);
  }
  for (const card of Array.isArray(input?.cards) ? input.cards : []) {
    if (typeof card?.photo?.asset !== 'string') continue;
    const asset = await stat(resolve(workspace, 'app', 'public', card.photo.asset)).catch(() => null);
    if (!asset?.isFile()) throw blocked('CARD_PHOTO_MISSING');
  }
  for (const reviewed of plain(images) ? Object.values(images) : []) {
    await requireAsset(workspace, reviewed?.hotel, 'CARD_PHOTO_MISSING');
    for (const photo of plain(reviewed?.drops) ? Object.values(reviewed.drops) : []) await requireAsset(workspace, photo, 'DROP_PHOTO_MISSING');
  }
  return { schemaVersion: input?.schemaVersion, entries: input?.entries, cards: input?.cards, ...(images === undefined ? {} : { images }) };
}

export async function main(args = process.argv.slice(2), { env = process.env, root = fileURLToPath(new URL('../', import.meta.url)),
  createFirestore = createRoomdropFirestore, prefix = 'roomdrop', now = () => new Date() } = {}) {
  const report = { mode: 'offline', status: 'not-attempted' };
  let firestore = null;
  try {
    if (args.some(arg => !SWITCHES.includes(arg) && !FLAGS.some(flag => arg.startsWith(flag)))
      || new Set(args.map(arg => arg.split('=')[0])).size !== args.length) throw blocked('IMPORT_ARGUMENTS_INVALID');
    const value = flag => args.find(arg => arg.startsWith(flag))?.slice(flag.length);
    const path = value('--catalogue=');
    if (!path) {
      report.requirements = ['Reviewed curated catalogue file (--catalogue=PATH inside the workspace)',
        'Optional reviewed image manifest (--images=PATH inside the workspace) naming shipped app/public/assets files',
        'Emulator write only with --execute --project=demo-... --database=(default) --emulator=127.0.0.1:PORT']; return report;
    }
    const execute = args.includes('--execute');
    const imagesPath = value('--images=');
    if (!execute && args.some(arg => arg !== `--catalogue=${path}` && arg !== `--images=${imagesPath}`)) throw blocked('IMPORT_ARGUMENTS_INVALID');
    const input = await readInput(root, path, imagesPath);
    if (!execute) {
      const result = await createBookingStorage({ firestore: null, prefix }).importBundle(input);
      return Object.assign(report, { mode: 'dry-run', status: 'validated', entries: result.entries });
    }
    if (env.NODE_ENV === 'production' || env.K_SERVICE || env.CLOUD_RUN_JOB) throw blocked('PRODUCTION_IMPORT_REFUSED');
    if (args.includes('--production-import-approved')) throw blocked('PRODUCTION_IMPORT_NOT_ENABLED');
    const project = value('--project='); const emulator = value('--emulator=');
    if (!LOOPBACK.test(emulator ?? '') || !/^demo-[a-z0-9-]{1,40}$/.test(project ?? '') || value('--database=') !== '(default)'
      || (env.FIRESTORE_EMULATOR_HOST && env.FIRESTORE_EMULATOR_HOST !== emulator)) throw blocked('EMULATOR_REQUIRED');
    firestore = await createFirestore({ GOOGLE_CLOUD_PROJECT: project, FIRESTORE_EMULATOR_HOST: emulator });
    const result = await createBookingStorage({ firestore, prefix }).importBundle(input, { execute: true, now });
    Object.assign(report, { mode: 'emulator-import', status: 'imported', project, importedAt: result.importedAt, entries: result.entries });
  } catch (error) {
    report.status = 'blocked';
    report.reason = typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'CATALOGUE_IMPORT_FAILED';
  } finally {
    await firestore?.terminate();
  }
  return report;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const report = await main(); console.log(JSON.stringify(report, null, 2)); if (report.status !== 'validated' && report.status !== 'imported') process.exitCode = 1;
}
