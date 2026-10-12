const copy = value => value == null ? value : structuredClone(value);

function conflict(message) {
  const error = new Error(message);
  error.code = 'ALREADY_EXISTS';
  return error;
}

/** Explicit injectable test double. The executable server never selects this. */
export function createTestMemoryStorage() {
  const documents = new Map();
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
      const next = change(current);
      if (next instanceof Promise) throw new Error('Storage updates must be synchronous.');
      documents.set(id, copy(next));
      return copy(next);
    },
    async delete(id) { documents.delete(id); },
    async close() {},
  };
}

export class FirestoreStorage {
  constructor(database, { collection = 'juryVisitors', emulator = false } = {}) {
    this.database = database;
    this.collection = database.collection(collection);
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
      const next = change(snapshot.data());
      if (next instanceof Promise) throw new Error('Storage updates must be synchronous.');
      transaction.set(reference, next);
      return next;
    });
  }

  async delete(id) { await this.collection.doc(id).delete(); }
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
