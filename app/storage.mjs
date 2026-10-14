const copy = value => value == null ? value : structuredClone(value);
const caseIdValid = value => typeof value === 'string' && /^case-[a-f0-9]{64}$/.test(value);
function newCases(current, next, visitorId) {
  if (next.scenarioId !== 'jury-booking') return [];
  return Object.entries(next.operations ?? {}).filter(([id, operation]) => operation.isSimulated === true && caseIdValid(operation.agencyCaseId) && !current.operations?.[id]?.agencyCaseId)
    .map(([operationId, operation]) => ({ caseId: operation.agencyCaseId, visitorId, operationId }));
}
function resolvedCase(locator, state) {
  const operation = state?.operations?.[locator.operationId];
  return state?.scenarioId === 'jury-booking' && operation?.isSimulated === true && operation.agencyCaseId === locator.caseId
    ? { caseId: locator.caseId, state: copy(state), operation: copy(operation) } : null;
}

function conflict(message) {
  const error = new Error(message);
  error.code = 'ALREADY_EXISTS';
  return error;
}

/** Explicit injectable test double. The executable server never selects this. */
export function createTestMemoryStorage() {
  const documents = new Map();
  const agencyCases = new Map();
  return {
    mode: 'test-memory',
    async get(id) { return copy(documents.get(id) ?? null); },
    async create(id, state) {
      if (documents.has(id)) throw conflict('Visitor already exists.');
      documents.set(id, copy(state));
      return copy(state);
    },
    async update(id, change) {
      const current = copy(documents.get(id) ?? null);
      if (!current) throw new Error('Visitor not found.');
      const previous = copy(current);
      const next = change(current);
      if (next instanceof Promise) throw new Error('Storage updates must be synchronous.');
      const additions = newCases(previous, next, id);
      if (additions.some(item => agencyCases.has(item.caseId))) throw conflict('Case already exists.');
      for (const locator of additions) agencyCases.set(locator.caseId, locator);
      documents.set(id, copy(next));
      return copy(next);
    },
    async listCases({ limit, after = null }) {
      return [...agencyCases.values()].sort((left, right) => left.caseId.localeCompare(right.caseId))
        .filter(item => !after || item.caseId > after).slice(0, limit)
        .map(item => resolvedCase(item, documents.get(item.visitorId))).filter(Boolean);
    },
    async getCase(caseId) {
      const locator = agencyCases.get(caseId);
      return locator ? resolvedCase(locator, documents.get(locator.visitorId)) : null;
    },
    async delete(id) { documents.delete(id); for (const [caseId, locator] of agencyCases) if (locator.visitorId === id) agencyCases.delete(caseId); },
    async close() {},
  };
}

export class FirestoreStorage {
  constructor(database, { collection = 'juryVisitors', emulator = false } = {}) {
    this.database = database;
    this.collection = database.collection(collection);
    this.agencyCases = database.collection(`${collection}AgencyCases`);
    this.mode = emulator ? 'firestore-emulator' : 'firestore';
  }

  async get(id) {
    const snapshot = await this.collection.doc(id).get();
    return snapshot.exists ? snapshot.data() : null;
  }

  async create(id, state) {
    await this.collection.doc(id).create(state);
    return copy(state);
  }

  async update(id, change) {
    const reference = this.collection.doc(id);
    return this.database.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new Error('Visitor not found.');
      const previous = snapshot.data();
      const next = change(copy(previous));
      if (next instanceof Promise) throw new Error('Storage updates must be synchronous.');
      transaction.set(reference, next);
      for (const locator of newCases(previous, next, id)) transaction.create(this.agencyCases.doc(locator.caseId), locator);
      return next;
    });
  }

  async listCases({ limit, after = null }) {
    let query = this.agencyCases.orderBy('caseId').limit(limit);
    if (after) query = query.startAfter(after);
    const snapshot = await query.get();
    return (await Promise.all(snapshot.docs.map(async document => {
      const locator = document.data();
      return resolvedCase(locator, await this.get(locator.visitorId));
    }))).filter(Boolean);
  }

  async getCase(caseId) {
    if (!caseIdValid(caseId)) return null;
    const snapshot = await this.agencyCases.doc(caseId).get();
    if (!snapshot.exists) return null;
    const locator = snapshot.data();
    return resolvedCase(locator, await this.get(locator.visitorId));
  }

  async delete(id) {
    const cases = await this.agencyCases.where('visitorId', '==', id).get();
    const batch = this.database.batch();
    batch.delete(this.collection.doc(id));
    for (const document of cases.docs) batch.delete(document.ref);
    await batch.commit();
  }
  async close() { await this.database.terminate(); }
}

export async function createStorage(environment = process.env) {
  if (environment.STORAGE_MODE && environment.STORAGE_MODE !== 'firestore') {
    throw new Error('Runtime requires Firestore; memory storage is available only by explicit test injection.');
  }
  const projectId = environment.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error('GOOGLE_CLOUD_PROJECT is required for Firestore.');
  const emulatorHost = environment.FIRESTORE_EMULATOR_HOST;
  if (emulatorHost && !/^(localhost|127\.0\.0\.1):\d{1,5}$/.test(emulatorHost)) {
    throw new Error('FIRESTORE_EMULATOR_HOST must use a loopback host and port.');
  }
  if (emulatorHost && (environment.K_SERVICE || environment.NODE_ENV === 'production')) {
    throw new Error('Firestore emulator is prohibited in Cloud Run / production.');
  }
  const { Firestore } = await import('@google-cloud/firestore');
  const settings = { projectId };
  if (emulatorHost) {
    settings.host = emulatorHost;
    settings.ssl = false;
  }
  const database = new Firestore(settings);
  return new FirestoreStorage(database, { emulator: Boolean(emulatorHost) });
}
