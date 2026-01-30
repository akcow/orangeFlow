type WorkflowAssetRecord = {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  createdAt: string;
};

const DB_NAME = "lf_workflows_db";
const DB_VERSION = 1;
const STORE_NAME = "assets";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putWorkflowAsset(record: WorkflowAssetRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).put(record);
  });
  db.close();
}

export async function getWorkflowAsset(id: string): Promise<WorkflowAssetRecord | null> {
  const db = await openDb();
  const result = await new Promise<WorkflowAssetRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as WorkflowAssetRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function deleteWorkflowAsset(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).delete(id);
  });
  db.close();
}

