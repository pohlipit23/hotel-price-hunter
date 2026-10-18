import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createBookingStorage, createRoomdropFirestore, loadHostedCatalogue, planCatalogueImport } from '../app/booking-storage.mjs';
import { main as importMain } from '../scripts/import-altovo-catalogue.mjs';

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/curated-bookings.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Recomputes a prepared bundle's integrity hash after a test edits it, exactly as preparation does.
function rehash(bundle) {
  const { schemaVersion, transactionMode, baseline, options, checkedAt, completeness, customerRefund, reservationCreated } = bundle;
  bundle.snapshotVersion = hash({ schemaVersion, transactionMode, baseline, options, checkedAt, completeness, customerRefund, reservationCreated });
  return bundle;
}
// Any Firestore access through this stand-in fails the test: dry runs must not touch the database.
const untouchable = new Proxy({}, { get() { throw new Error('Firestore must not be touched'); } });
const SIAM = 'AIRB000180'; const HYATT = 'AIRB000179';

test('dry run validates the curated bundle without touching Firestore', async () => {
  const storage = createBookingStorage({ firestore: untouchable, prefix: 'unused' });
  const report = await storage.importBundle(fixture());
  assert.equal(report.mode, 'dry-run');
  assert.deepEqual(report.entries.map(entry => [entry.code, entry.captureStatus, entry.dropCount, entry.result]),
    [[SIAM, 'observed', 3, 'validated'], [HYATT, 'not-searched', 0, 'validated']]);
  for (const entry of report.entries) {
    assert.match(entry.contentVersion, /^[a-f0-9]{64}$/);
    assert.match(entry.dropSetVersion, /^[a-f0-9]{64}$/);
  }
});

test('import validation refuses private fields, visitor state, missing captures and mismatched bundles', async () => {
  const storage = createBookingStorage({ firestore: untouchable, prefix: 'unused' });
  const cases = [
    ['PRIVATE_FIELD_REJECTED', input => { input.entries[0].bundle.options[0].rateDetail = 'X'; rehash(input.entries[0].bundle); }],
    ['PRIVATE_FIELD_REJECTED', input => { input.entries[0].bundle.baseline.hotel.supplierCode = 'X'; rehash(input.entries[0].bundle); }],
    ['VISITOR_STATE_REJECTED', input => { input.entries[0].bundle.baseline.watch = { armedAt: 'x' }; rehash(input.entries[0].bundle); }],
    ['VISITOR_STATE_REJECTED', input => { input.cards[0].minimumSavingMinor = 1000; }],
    ['CAPTURE_MISSING', input => { delete input.entries[0].capture; input.entries[0].capture = undefined; }],
    ['CAPTURE_MISSING', input => { input.entries[0].capture = { status: 'failed' }; }],
    // Zero Drops claimed as a valid empty capture while the bundle still carries Drops.
    ['CAPTURE_MISMATCH', input => { input.entries[0].capture.status = 'observed-empty'; input.entries[0].capture.offerCount = 0; }],
    ['CAPTURE_MISMATCH', input => { input.entries[0].capture.optionCount = 2; }],
    ['CAPTURE_MISMATCH', input => { input.entries[0].capture.checkedAt = '2026-10-19T00:00:00.000Z'; }],
    ['CAPTURE_MISMATCH', input => { input.entries[0].code = HYATT; input.entries[1].code = SIAM; }],
    ['CAPTURE_MISMATCH', input => { input.entries[1].capture.reason = 'NO_FREE_CANCELLATION'; }],
    ['BUNDLE_INTEGRITY_FAILED', input => { input.entries[0].bundle.options[0].roomName = 'Edited after capture'; }],
    ['DROP_DUPLICATE', input => { input.entries[0].bundle.options[1].optionId = input.entries[0].bundle.options[0].optionId; rehash(input.entries[0].bundle); }],
    ['CARD_INVALID', input => { input.cards.pop(); }],
    ['CARD_INVALID', input => { input.cards[1].order = input.cards[0].order; }],
    ['CARD_INVALID', input => { input.cards[0].photo = { asset: '../secrets.jpg', alt: 'x' }; }],
  ];
  for (const [code, edit] of cases) {
    const input = fixture(); edit(input);
    await assert.rejects(storage.importBundle(input), { code }, code);
  }
});

// A prepared capture's remote photo sources, as scripts/prepare-altovo-catalogue.mjs writes them beside the bundle.
const remoteSources = entry => ({ kind: 'remote-source-urls-pending-review', renderable: false,
  hotel: { url: 'https://img.example.test/hotel-md.jpg', caption: null },
  drops: entry.bundle.options.map(option => ({ optionId: option.optionId, url: 'https://img.example.test/room-md.jpg', caption: 'Room' })) });
const SUITE = 'option-fixture-flex-suite';
const suitePhoto = { asset: 'assets/roomdrop-airb000180-drop-1.jpg', alt: 'Suite with a city view' };

test('a reviewed image manifest attaches local Drop photos and fills an empty card photo; remote sources are never stored', () => {
  const plain = planCatalogueImport(fixture());
  const input = fixture(); input.entries.forEach(entry => { entry.imageSources = remoteSources(entry); });
  input.images = { [SIAM]: { drops: { [SUITE]: suitePhoto, 'option-fixture-final-deluxe': null } },
    [HYATT]: { hotel: { asset: 'assets/roomdrop-airb000179-hotel.webp', alt: 'Grand Hyatt Kuala Lumpur' }, drops: {} } };
  const [siam, hyatt] = planCatalogueImport(input);
  assert.deepEqual(siam.drops.map(drop => drop.facts.photo), [suitePhoto, undefined, undefined]);
  assert.deepEqual(siam.drops.slice(1).map(drop => Object.hasOwn(drop.facts, 'photo')), [false, false]);
  assert.equal(siam.contentVersion, plain[0].contentVersion);
  assert.notEqual(siam.dropSetVersion, plain[0].dropSetVersion);
  assert.deepEqual(hyatt.booking.card.photo, { asset: 'assets/roomdrop-airb000179-hotel.webp', alt: 'Grand Hyatt Kuala Lumpur' });
  assert.equal(hyatt.dropSetVersion === plain[1].dropSetVersion, false, 'card change moves the content version and so the Drop set');
  assert.doesNotMatch(JSON.stringify([siam, hyatt]), /https:|img\.example|imageSources|remote-source/);
  // Prepared remote sources alone change nothing at all.
  const sourcesOnly = fixture(); sourcesOnly.entries.forEach(entry => { entry.imageSources = remoteSources(entry); });
  assert.deepEqual(planCatalogueImport(sourcesOnly), plain);
  assert.deepEqual(planCatalogueImport({ ...fixture(), images: {} }), plain);
});

test('a reviewed booked-room photo becomes the card\'s optional roomPhoto; without one the card has no such key', () => {
  const plain = planCatalogueImport(fixture());
  const roomPhoto = { asset: 'assets/roomdrop-airb000180-room.jpg', alt: 'Deluxe Room with a garden view' };
  const input = fixture(); input.images = { [SIAM]: { room: roomPhoto } };
  const [siam, hyatt] = planCatalogueImport(input);
  assert.deepEqual(siam.booking.card.roomPhoto, roomPhoto);
  assert.deepEqual(siam.booking.card.photo, fixture().cards[0].photo, 'the hotel photo is unchanged');
  assert.notEqual(siam.contentVersion, plain[0].contentVersion, 'a room photo is card content');
  assert.equal(Object.hasOwn(hyatt.booking.card, 'roomPhoto'), false);
  assert.equal(hyatt.contentVersion, plain[1].contentVersion);
  // A card may carry its reviewed room photo itself; the manifest may repeat it but not replace it.
  const carried = fixture(); carried.cards[0].roomPhoto = roomPhoto;
  assert.equal(planCatalogueImport(carried)[0].contentVersion, siam.contentVersion);
  carried.images = { [SIAM]: { room: roomPhoto } };
  assert.equal(planCatalogueImport(carried)[0].contentVersion, siam.contentVersion);
  carried.images = { [SIAM]: { room: { ...roomPhoto, alt: 'Another room' } } };
  assert.throws(() => planCatalogueImport(carried), { code: 'IMAGE_MANIFEST_CONFLICT' });
  for (const room of [{ asset: 'https://img.example.test/a.jpg', alt: 'x' }, { ...roomPhoto, url: 'https://img.example.test/a.jpg' }, 'assets/x.jpg']) {
    const bad = fixture(); bad.images = { [SIAM]: { room } };
    assert.throws(() => planCatalogueImport(bad), { code: 'IMAGE_MANIFEST_INVALID' }, JSON.stringify(room));
  }
  const badCard = fixture(); badCard.cards[0].roomPhoto = { asset: '../secrets.jpg', alt: 'x' };
  assert.throws(() => planCatalogueImport(badCard), { code: 'CARD_INVALID' });
});

test('image manifests and remote sources are refused when they are not reviewed local assets for known Drops', () => {
  const cases = [
    ['IMAGE_MANIFEST_INVALID', input => { input.images = { AIRB000999: { drops: {} } }; }],
    ['IMAGE_MANIFEST_INVALID', input => { input.images = { [SIAM]: { drops: { 'option-unknown': suitePhoto } } }; }],
    ['IMAGE_MANIFEST_INVALID', input => { input.images = { [HYATT]: { drops: { [SUITE]: suitePhoto } } }; }],
    ['IMAGE_MANIFEST_INVALID', input => { input.images = { [SIAM]: { drops: { [SUITE]: { asset: 'https://img.example.test/a.jpg', alt: 'x' } } } }; }],
    ['IMAGE_MANIFEST_INVALID', input => { input.images = { [SIAM]: { drops: { [SUITE]: { asset: 'assets/../secrets.jpg', alt: 'x' } } } }; }],
    ['IMAGE_MANIFEST_INVALID', input => { input.images = { [SIAM]: { drops: { [SUITE]: { ...suitePhoto, url: 'https://img.example.test/a.jpg' } } } }; }],
    ['IMAGE_MANIFEST_INVALID', input => { input.images = { [SIAM]: { drops: { [SUITE]: { ...suitePhoto, alt: 'x'.repeat(81) } } } }; }],
    ['IMAGE_MANIFEST_INVALID', input => { input.images = { [SIAM]: { rooms: {} } }; }],
    ['IMAGE_MANIFEST_INVALID', input => { input.images = []; }],
    ['IMAGE_MANIFEST_CONFLICT', input => { input.images = { [SIAM]: { hotel: { asset: 'assets/roomdrop-airb000180-hotel.jpg', alt: 'Siam' } } }; }],
    ['BUNDLE_INVALID', input => { input.entries[0].imageSources = { ...remoteSources(input.entries[0]), renderable: true }; }],
    ['BUNDLE_INVALID', input => { input.entries[0].imageSources = 'https://img.example.test/a.jpg'; }],
  ];
  for (const [code, edit] of cases) {
    const input = fixture(); edit(input);
    assert.throws(() => planCatalogueImport(input), { code }, `${code} ${edit}`);
  }
  // Repeating the card's own photo is not a conflict.
  const same = fixture(); same.images = { [SIAM]: { hotel: same.cards[0].photo } };
  assert.equal(planCatalogueImport(same)[0].contentVersion, planCatalogueImport(fixture())[0].contentVersion);
});

test('missing capture is not published as empty, while a valid empty capture is explicit', async () => {
  const storage = createBookingStorage({ firestore: untouchable, prefix: 'unused' });
  const input = fixture(); const siam = input.entries[0];
  siam.bundle.options = []; siam.capture = { ...siam.capture, status: 'observed-empty', offerCount: 0, optionCount: 0 }; rehash(siam.bundle);
  const report = await storage.importBundle(input);
  assert.deepEqual([report.entries[0].captureStatus, report.entries[0].dropCount], ['observed-empty', 0]);
  siam.capture = null;
  await assert.rejects(storage.importBundle(input), { code: 'CAPTURE_MISSING' });
});

test('importer dry-runs by default and refuses non-emulator or production writes', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const neverCreate = async () => { throw new Error('No Firestore client may be created'); };
  const run = (args, env = {}) => importMain(args, { env, root, createFirestore: neverCreate });
  const input = '--catalogue=tests/fixtures/curated-bookings.json';
  const dry = await run([input]);
  assert.deepEqual([dry.mode, dry.status], ['dry-run', 'validated']);
  assert.deepEqual(dry.entries.map(entry => entry.code), [SIAM, HYATT]);
  const emulator = ['--execute', '--project=demo-roomdrop-part1', '--database=(default)', '--emulator=127.0.0.1:8181'];
  const refusals = [
    [[input, '--execute'], {}, 'EMULATOR_REQUIRED'],
    [[input, '--execute', '--project=sincere-apex-511418-p0', '--database=(default)', '--emulator=127.0.0.1:8181'], {}, 'EMULATOR_REQUIRED'],
    [[input, '--execute', '--project=demo-roomdrop-part1', '--database=(default)', '--emulator=example.com:8181'], {}, 'EMULATOR_REQUIRED'],
    [[input, ...emulator], { FIRESTORE_EMULATOR_HOST: '127.0.0.1:9999' }, 'EMULATOR_REQUIRED'],
    [[input, '--execute', '--production-import-approved'], {}, 'PRODUCTION_IMPORT_NOT_ENABLED'],
    [[input, ...emulator, '--production-import-approved'], {}, 'PRODUCTION_IMPORT_NOT_ENABLED'],
    [[input, ...emulator], { K_SERVICE: 'hotel-price-hunter' }, 'PRODUCTION_IMPORT_REFUSED'],
    [[input, ...emulator], { NODE_ENV: 'production' }, 'PRODUCTION_IMPORT_REFUSED'],
    [[input, '--project=demo-roomdrop-part1'], {}, 'IMPORT_ARGUMENTS_INVALID'],
    [[input, '--force'], {}, 'IMPORT_ARGUMENTS_INVALID'],
    [['--catalogue=../../package.json'], {}, 'CATALOGUE_PATH_OUTSIDE_WORKSPACE'],
    [['--catalogue=tests/fixtures/absent.json'], {}, 'CATALOGUE_FILE_UNAVAILABLE'],
    [['--catalogue=package.json'], {}, 'CATALOGUE_INVALID'],
  ];
  for (const [args, env, reason] of refusals) assert.deepEqual([(await run(args, env)).status, (await run(args, env)).reason], ['blocked', reason], reason);
});

test('importer reads a reviewed image manifest file and refuses photos that are not shipped assets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'roomdrop-images-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'app', 'public', 'assets'), { recursive: true });
  for (const name of ['illustrative-stays.jpg', 'roomdrop-airb000180-drop-1.jpg']) await writeFile(join(root, 'app', 'public', 'assets', name), 'reviewed');
  const catalogue = fixture(); catalogue.entries.forEach(entry => { entry.imageSources = remoteSources(entry); });
  await writeFile(join(root, 'catalogue.json'), JSON.stringify(catalogue));
  const manifest = async images => { await writeFile(join(root, 'images.json'), JSON.stringify({ schemaVersion: 1, images })); return '--images=images.json'; };
  const run = args => importMain(args, { env: {}, root, createFirestore: async () => { throw new Error('No Firestore client may be created'); } });
  const plain = await run(['--catalogue=catalogue.json']);
  assert.equal(plain.status, 'validated', plain.reason);
  const attached = await run(['--catalogue=catalogue.json', await manifest({ [SIAM]: { drops: { [SUITE]: suitePhoto } } })]);
  assert.equal(attached.status, 'validated', attached.reason);
  assert.equal(attached.entries[0].contentVersion, plain.entries[0].contentVersion);
  assert.notEqual(attached.entries[0].dropSetVersion, plain.entries[0].dropSetVersion);
  const refusals = [
    [{ [SIAM]: { drops: { [SUITE]: { ...suitePhoto, asset: 'assets/roomdrop-airb000180-drop-2.jpg' } } } }, 'DROP_PHOTO_MISSING'],
    [{ [HYATT]: { hotel: { asset: 'assets/roomdrop-airb000179-hotel.jpg', alt: 'Grand Hyatt' } } }, 'CARD_PHOTO_MISSING'],
    [{ [SIAM]: { room: { asset: 'assets/roomdrop-airb000180-room.jpg', alt: 'Deluxe Room' } } }, 'CARD_PHOTO_MISSING'],
    [{ [SIAM]: { drops: { [SUITE]: { asset: 'https://img.example.test/a.jpg', alt: 'x' } } } }, 'IMAGE_MANIFEST_INVALID'],
  ];
  for (const [images, reason] of refusals) assert.deepEqual([(await run(['--catalogue=catalogue.json', await manifest(images)])).reason], [reason], reason);
  await writeFile(join(root, 'images.json'), JSON.stringify({ schemaVersion: 2, images: {} }));
  assert.equal((await run(['--catalogue=catalogue.json', '--images=images.json'])).reason, 'IMAGE_MANIFEST_INVALID');
  assert.equal((await run(['--catalogue=catalogue.json', '--images=../outside.json'])).reason, 'IMAGE_MANIFEST_PATH_OUTSIDE_WORKSPACE');
  // The manifest comes from one place only.
  await writeFile(join(root, 'catalogue.json'), JSON.stringify({ ...catalogue, images: {} }));
  assert.equal((await run(['--catalogue=catalogue.json', await manifest({})])).reason, 'IMAGE_MANIFEST_INVALID');
});

test('Firestore client factory is emulator-guarded and has no memory fallback', async () => {
  await assert.rejects(createRoomdropFirestore({}), /GOOGLE_CLOUD_PROJECT/);
  await assert.rejects(createRoomdropFirestore({ GOOGLE_CLOUD_PROJECT: 'demo-x', STORAGE_MODE: 'memory' }), /memory/i);
  await assert.rejects(createRoomdropFirestore({ GOOGLE_CLOUD_PROJECT: 'demo-x', FIRESTORE_EMULATOR_HOST: 'example.com:8181' }), /loopback/);
  await assert.rejects(createRoomdropFirestore({ GOOGLE_CLOUD_PROJECT: 'demo-x', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8181', K_SERVICE: 'svc' }), /production/);
  await assert.rejects(createRoomdropFirestore({ GOOGLE_CLOUD_PROJECT: 'demo-x', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8181', NODE_ENV: 'production' }), /production/);
});

// ---- Real Firestore emulator: two independent clients, test-owned collections only. ----
const integration = { skip: !process.env.RUN_FIRESTORE_INTEGRATION };
async function emulatorPair(t) {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const first = await createRoomdropFirestore(process.env); const second = await createRoomdropFirestore(process.env);
  const prefix = `test-${randomUUID()}-roomdrop`;
  t.after(async () => {
    await first.recursiveDelete(first.collection(`${prefix}BookingsV1`));
    await Promise.all([first.terminate(), second.terminate()]);
  });
  return { prefix, first, second, a: createBookingStorage({ firestore: first, prefix }), b: createBookingStorage({ firestore: second, prefix }) };
}

test('Firestore: an executed import is readable from a second client without private or visitor fields', integration, async t => {
  const { a, b, first, prefix } = await emulatorPair(t);
  const report = await a.importBundle(fixture(), { execute: true });
  assert.equal(report.mode, 'executed');
  assert.deepEqual(report.entries.map(entry => entry.result), ['created', 'created']);
  const catalogue = await b.listCatalogue();
  assert.deepEqual(catalogue.map(entry => [entry.code, entry.order, entry.card.cityName]), [[SIAM, 1, 'Bangkok'], [HYATT, 2, 'Kuala Lumpur']]);
  assert.equal(catalogue[0].contentVersion, report.entries[0].contentVersion);
  assert.equal(catalogue[0].dropSetVersion, report.entries[0].dropSetVersion);
  const booking = await b.getBooking(SIAM);
  assert.equal(booking.code, SIAM);
  assert.deepEqual(booking.capture, { status: 'observed', capturedAt: '2026-10-18T12:10:00.000Z' });
  assert.deepEqual(booking.bundle.baseline, fixture().entries[0].bundle.baseline);
  assert.deepEqual(booking.bundle.options, fixture().entries[0].bundle.options);
  assert.equal(booking.bundle.snapshotVersion, booking.contentVersion);
  assert.equal(booking.bundle.transactionMode, 'selection-only');
  const drops = await b.getDrops(SIAM);
  assert.equal(drops.captureStatus, 'observed');
  assert.equal(drops.capturedAt, '2026-10-18T12:10:00.000Z');
  assert.deepEqual(drops.drops.map(drop => drop.optionId), ['option-fixture-flex-suite', 'option-fixture-final-deluxe', 'option-fixture-flex-premier']);
  assert.deepEqual(await b.getDrops(SIAM, { dropSetVersion: drops.dropSetVersion }), drops);
  await assert.rejects(b.getDrops(SIAM, { dropSetVersion: 'f'.repeat(64) }), { code: 'DROP_SET_CHANGED' });
  // The cannot-start booking is published with an explicit not-searched record, never as an empty search.
  assert.deepEqual((await b.getBooking(HYATT)).capture, { status: 'not-searched', capturedAt: null });
  await assert.rejects(b.getDrops(HYATT), { code: 'CAPTURE_UNAVAILABLE' });
  // Arbitrary or unknown codes are not looked up.
  for (const code of ['AIRB999999', '../x', 'airb000180', '']) assert.equal(await b.getBooking(code), null);
  await assert.rejects(b.getDrops('AIRB999999'), { code: 'BOOKING_UNAVAILABLE' });
  // Nothing private or visitor-specific reached any stored document.
  const stored = JSON.stringify((await first.collectionGroup('drops').get()).docs.concat((await first.collection(`${prefix}BookingsV1`).get()).docs)
    .filter(document => document.ref.path.startsWith(prefix)).map(document => document.data()));
  assert.doesNotMatch(stored, /FIXTURE-PRIVATE|fixture-contract|privateReferences|byCode|watch/);
});

test('Firestore: a reviewed Drop photo and filled card photo are read back; remote sources are not stored', integration, async t => {
  const { a, b, first, prefix } = await emulatorPair(t);
  const input = fixture(); input.entries.forEach(entry => { entry.imageSources = remoteSources(entry); });
  input.images = { [SIAM]: { drops: { [SUITE]: suitePhoto } }, [HYATT]: { hotel: { asset: 'assets/roomdrop-airb000179-hotel.jpg', alt: 'Grand Hyatt Kuala Lumpur' } } };
  await a.importBundle(input, { execute: true });
  const drops = (await b.getDrops(SIAM)).drops;
  assert.deepEqual(drops.map(drop => drop.photo ?? null), [suitePhoto, null, null]);
  assert.deepEqual((await b.getBooking(SIAM)).bundle.options.map(option => option.photo ?? null), [suitePhoto, null, null]);
  assert.deepEqual((await b.listCatalogue()).map(entry => entry.card.photo?.asset), ['assets/illustrative-stays.jpg', 'assets/roomdrop-airb000179-hotel.jpg']);
  const stored = JSON.stringify((await first.collectionGroup('drops').get()).docs.concat((await first.collection(`${prefix}BookingsV1`).get()).docs)
    .filter(document => document.ref.path.startsWith(prefix)).map(document => document.data()));
  assert.doesNotMatch(stored, /https:|img\.example|imageSources/);
});

async function counts(firestore, prefix, code) {
  const reference = firestore.collection(`${prefix}BookingsV1`).doc(code);
  const [drops, sets] = await Promise.all([reference.collection('drops').get(), reference.collection('dropSets').get()]);
  return { drops: drops.size, dropSets: sets.size, importedAt: (await reference.get()).data()?.importedAt ?? null };
}

test('Firestore: identical concurrent imports from two clients replay safely with no duplicate Drop', integration, async t => {
  const { a, b, first, prefix } = await emulatorPair(t);
  const reports = await Promise.all([a.importBundle(fixture(), { execute: true }), b.importBundle(fixture(), { execute: true }),
    a.importBundle(fixture(), { execute: true })]);
  const results = reports.map(report => report.entries[0].result).sort();
  assert.deepEqual(results, ['created', 'unchanged', 'unchanged']);
  const before = await counts(first, prefix, SIAM);
  assert.deepEqual([before.drops, before.dropSets], [3, 1]);
  // A later identical retry is a no-op: the original import time is kept.
  const retry = await b.importBundle(fixture(), { execute: true, now: () => new Date('2030-01-01T00:00:00Z') });
  assert.deepEqual(retry.entries.map(entry => entry.result), ['unchanged', 'unchanged']);
  assert.deepEqual(await counts(first, prefix, SIAM), before);
});

test('Firestore: changed facts fail BOOKING_CHANGED and an interrupted multi-code import publishes nothing', integration, async t => {
  const { a, b, first, prefix } = await emulatorPair(t);
  const only = fixture(); only.entries = only.entries.slice(0, 1); only.cards = only.cards.slice(0, 1);
  await a.importBundle(only, { execute: true });
  const original = await b.getBooking(SIAM);
  const changed = fixture(); changed.entries[0].bundle.baseline.hotel.name = 'Renamed hotel'; rehash(changed.entries[0].bundle);
  await assert.rejects(b.importBundle(changed, { execute: true }), { code: 'BOOKING_CHANGED' });
  const relabelled = fixture(); relabelled.cards[0].scenarioLabel = 'Relabelled';
  await assert.rejects(a.importBundle(relabelled, { execute: true }), { code: 'BOOKING_CHANGED' });
  // AIRB000179 was valid and new, but the refusal of AIRB000180 in the same import published neither.
  assert.equal(await a.getBooking(HYATT), null);
  assert.deepEqual(await b.getBooking(SIAM), original);
  assert.deepEqual((await b.listCatalogue()).map(entry => entry.code), [SIAM]);
  assert.deepEqual((await counts(first, prefix, SIAM)).drops, 3);
});

test('Firestore: a later capture adds a new Drop-set version and never rebinds an earlier Drop', integration, async t => {
  const { a, b, first, prefix } = await emulatorPair(t);
  const initial = await a.importBundle(fixture(), { execute: true });
  const old = await b.getDrops(SIAM);
  const later = fixture(); const siam = later.entries[0];
  siam.bundle.checkedAt = siam.capture.checkedAt = '2026-10-19T08:00:00.000Z';
  siam.bundle.options = siam.bundle.options.slice(0, 2).map(option => ({ ...option, optionId: `${option.optionId}-later` }));
  siam.capture.offerCount = siam.capture.optionCount = 2; rehash(siam.bundle);
  const added = await b.importBundle(later, { execute: true });
  assert.deepEqual(added.entries.map(entry => entry.result), ['drop-set-added', 'unchanged']);
  assert.equal(added.entries[0].contentVersion, initial.entries[0].contentVersion);
  assert.notEqual(added.entries[0].dropSetVersion, old.dropSetVersion);
  const now = await a.getDrops(SIAM);
  assert.equal(now.dropSetVersion, added.entries[0].dropSetVersion);
  assert.equal(now.capturedAt, '2026-10-19T08:00:00.000Z');
  assert.equal(now.drops.length, 2);
  await assert.rejects(a.getDrops(SIAM, { dropSetVersion: old.dropSetVersion }), { code: 'DROP_SET_CHANGED' });
  assert.equal((await a.listCatalogue())[0].dropSetVersion, now.dropSetVersion);
  assert.deepEqual(await counts(first, prefix, SIAM).then(value => [value.drops, value.dropSets]), [5, 2]);
  // Re-presenting an earlier Drop id with different facts in a new set is refused, not overwritten.
  const rebinding = fixture(); const entry = rebinding.entries[0];
  entry.bundle.checkedAt = entry.capture.checkedAt = '2026-10-20T08:00:00.000Z'; rehash(entry.bundle);
  await assert.rejects(a.importBundle(rebinding, { execute: true }), { code: 'DROP_CONFLICT' });
  assert.equal((await b.getDrops(SIAM)).dropSetVersion, now.dropSetVersion);
});

test('Firestore: the importer executes only against the emulator and the hosted loader reads what it wrote', integration, async t => {
  const { first, second, prefix } = await emulatorPair(t);
  await assert.rejects(loadHostedCatalogue(createBookingStorage({ firestore: second, prefix })), { code: 'CATALOGUE_UNAVAILABLE' });
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = ['--catalogue=tests/fixtures/curated-bookings.json', '--execute', '--project=demo-roomdrop-part1', '--database=(default)', '--emulator=127.0.0.1:8181'];
  const report = await importMain(args, { env: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8181' }, root, prefix });
  assert.deepEqual([report.status, report.mode, report.entries.map(entry => entry.result)], ['imported', 'emulator-import', ['created', 'created']]);
  const hosted = await loadHostedCatalogue(createBookingStorage({ firestore: first, prefix }));
  assert.deepEqual(hosted.entries.map(entry => [entry.code, entry.bundle.options.length, entry.bundle.snapshotVersion === entry.contentVersion]),
    [[SIAM, 3, true], [HYATT, 0, true]]);
  assert.equal((await importMain(args, { env: {}, root, prefix })).entries[0].result, 'unchanged');
});

test('Firestore: import changes only its own test-owned collections', integration, async t => {
  const { a, first, prefix } = await emulatorPair(t);
  const names = async () => (await first.listCollections()).map(reference => reference.id).filter(id => !id.startsWith('test-')).sort();
  const before = await names();
  const sessions = await first.collection('roomdropPublicSessionsV1').limit(1).get();
  await a.importBundle(fixture(), { execute: true });
  assert.deepEqual(await names(), before);
  assert.equal((await first.collection('roomdropPublicSessionsV1').limit(1).get()).size, sessions.size);
  assert.ok((await first.listCollections()).some(reference => reference.id === `${prefix}BookingsV1`));
});
