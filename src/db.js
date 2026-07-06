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
    const requestOrValue = operation(store);
    transaction.oncomplete = () => resolve(requestOrValue?.result ?? requestOrValue);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function getAll(storeName) {
  return tx(storeName, 'readonly', (store) => store.getAll());
}

export async function get(storeName, key) {
  return tx(storeName, 'readonly', (store) => store.get(key));
}

export async function put(storeName, value) {
  return tx(storeName, 'readwrite', (store) => store.put(value));
}

export async function clear(storeName) {
  return tx(storeName, 'readwrite', (store) => store.clear());
}

export async function putMany(storeName, values) {
  if (!STORES.includes(storeName)) throw new Error(`Unknown store: ${storeName}`);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    for (const value of values) store.put(value);
    transaction.oncomplete = () => resolve(values);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function replaceStores(replacements) {
  const storeNames = Object.keys(replacements);
  for (const storeName of storeNames) {
    if (!STORES.includes(storeName)) throw new Error(`Unknown store: ${storeName}`);
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, 'readwrite');

    for (const storeName of storeNames) {
      const store = transaction.objectStore(storeName);
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => {
        for (const value of replacements[storeName] ?? []) store.put(value);
      };
    }

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function saveCatch(catchRecord) {
  const normalized = {
    ...catchRecord,
    updatedAt: catchRecord.updatedAt ?? catchRecord.caughtAt ?? new Date().toISOString(),
  };
  await put('catches', normalized);
  return normalized;
}

export async function saveCustomSpawn(spawn) {
  const normalized = {
    ...spawn,
    updatedAt: spawn.updatedAt ?? new Date().toISOString(),
  };
  await put('customSpawns', normalized);
  return normalized;
}
