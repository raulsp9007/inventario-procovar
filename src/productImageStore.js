// Fotos de los productos, en IndexedDB -- aparte de `localStorage` (donde vive
// todo el estado de la app y que se llenaría enseguida con imágenes) y fuera
// de los respaldos. Una foto por producto, clave = código del producto.
//
// Se guarda como { buffer, type } y no como Blob: así no depende de que el
// navegador sepa clonar Blobs dentro de IndexedDB.

const DB_NAME = "procovar-imagenes";
const STORE = "productos";

export function isProductImageStoreAvailable() {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!isProductImageStoreAvailable()) {
      reject(new Error("IndexedDB no está disponible."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      Promise.resolve(run(store)).then((value) => { result = value; }, reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function blobToBuffer(blob) {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export async function putProductImage(code, blob) {
  const buffer = await blobToBuffer(blob);
  const value = { buffer, type: blob.type || "image/jpeg" };
  await withStore("readwrite", (store) => requestToPromise(store.put(value, code)));
}

export async function getProductImage(code) {
  const value = await withStore("readonly", (store) => requestToPromise(store.get(code)));
  return value ? new Blob([value.buffer], { type: value.type }) : null;
}

export async function deleteProductImage(code) {
  await withStore("readwrite", (store) => requestToPromise(store.delete(code)));
}

export async function listProductImageCodes() {
  const keys = await withStore("readonly", (store) => requestToPromise(store.getAllKeys()));
  return keys.map(String);
}
