import type { StoredBatch } from "../types";

const DB_NAME = "inventory-dashboard-v2";
const STORE = "batches";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });
}

export async function getAllBatches(): Promise<StoredBatch[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const q = tx.objectStore(STORE).getAll();
    q.onsuccess = () => resolve((q.result as StoredBatch[]) ?? []);
    q.onerror = () => reject(q.error);
  });
}

/** Replace any batch with the same original filename, then save (monthly refresh). */
export async function upsertBatch(batch: StoredBatch): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const allReq = store.getAll();
    allReq.onsuccess = () => {
      const rows = (allReq.result as StoredBatch[]) ?? [];
      for (const b of rows) {
        if (b.meta.sourceFile === batch.meta.sourceFile) store.delete(b.id);
      }
      store.put(batch);
    };
    allReq.onerror = () => reject(allReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteBatch(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllBatches(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
