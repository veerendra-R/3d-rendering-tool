// utils/idb.js

// 1. Open IndexedDB with both models and states stores
export function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('modelDB', 2); // bump to version 2
      request.onerror = () => reject('IndexedDB not supported');
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models');
        }
        if (!db.objectStoreNames.contains('states')) {
          db.createObjectStore('states');
        }
      };
    });
  }
  
  
  // 2. Save model file (Blob)
  export async function saveModelBlob(key, blob) {
    const db = await openDB();
    const tx = db.transaction('models', 'readwrite');
    tx.objectStore('models').put(blob, key);
    return tx.complete;
  }
  
  // 3. Get model file
  export async function getModelBlob(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('models', 'readonly');
      const store = tx.objectStore('models');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Failed to load model from IDB');
    });
  }
  
  // 4. Save customization state
  export async function saveModelState(key, data) {
    const db = await openDB();
    const tx = db.transaction('states', 'readwrite');
    tx.objectStore('states').put(data, key);
    return tx.complete;
  }
  
  // 5. Get customization state
  export async function getModelState(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('states', 'readonly');
      const store = tx.objectStore('states');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Failed to load model state');
    });
  }
  