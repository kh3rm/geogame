const DB_NAME = 'geocritter-lens-db';
const DB_VERSION = 1;
const STORES = ['catches', 'customSpawns', 'settings'];

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('catches')) db.createObjectStore('catches', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('customSpawns')) db.createObjectStore('customSpawns', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx(storeName, mode, operation) {
  if (!STORES.includes(storeName)) throw new Error(`Unknown store: ${storeName}`);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = operation(store);
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function getAll(storeName) {
  return tx(storeName, 'readonly', (store) => store.getAll());
}

export async function put(storeName, value) {
  return tx(storeName, 'readwrite', (store) => store.put(value));
}

export async function clear(storeName) {
  return tx(storeName, 'readwrite', (store) => store.clear());
}

export async function saveCatch(catchRecord) {
  await put('catches', catchRecord);
  return catchRecord;
}

export async function saveCustomSpawn(spawn) {
  await put('customSpawns', spawn);
  return spawn;
}
