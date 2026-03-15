// db.js - IndexedDB helper for tap counter

const DB_NAME = 'tapcounter';
const DB_VERSION = 1;
const STORE_NAME = 'counters';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('is_current', 'is_current', { unique: false });
                store.createIndex('created_at', 'created_at', { unique: false });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function generateId() {
    return crypto.randomUUID();
}

async function addCounter() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const now = new Date().toISOString();

    // Unset all current counters
    const allReq = store.index('is_current').getAll(1);
    await new Promise((resolve, reject) => {
        allReq.onsuccess = () => {
            for (const counter of allReq.result) {
                counter.is_current = 0;
                store.put(counter);
            }
            resolve();
        };
        allReq.onerror = () => reject(allReq.error);
    });

    const counter = {
        id: generateId(),
        value: 0,
        created_at: now,
        updated_at: now,
        is_current: 1,
    };
    store.put(counter);

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => { db.close(); resolve(counter); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function getCurrentCounter() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index('is_current');
    return new Promise((resolve, reject) => {
        const req = idx.getAll(1);
        req.onsuccess = () => {
            db.close();
            resolve(req.result.length > 0 ? req.result[0] : null);
        };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function getCounter(id) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => { db.close(); resolve(req.result); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function getAllCounters() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => { db.close(); resolve(req.result); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function updateCounter(counter) {
    counter.updated_at = new Date().toISOString();
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(counter);
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => { db.close(); resolve(counter); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function setCurrentCounter(id) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const allReq = store.getAll();
    return new Promise((resolve, reject) => {
        allReq.onsuccess = () => {
            for (const counter of allReq.result) {
                counter.is_current = counter.id === id ? 1 : 0;
                store.put(counter);
            }
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        };
        allReq.onerror = () => { db.close(); reject(allReq.error); };
    });
}

async function deleteCounter(id) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function exportAll() {
    const counters = await getAllCounters();
    return JSON.stringify(counters, null, 2);
}

async function importMerge(remoteData) {
    const local = await getAllCounters();
    const localMap = new Map(local.map(c => [c.id, c]));

    for (const remote of remoteData) {
        if (localMap.has(remote.id)) {
            // Prefer local — skip remote
            continue;
        }
        // New from remote — but don't set is_current (keep local current)
        remote.is_current = 0;
        localMap.set(remote.id, remote);
    }

    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const counter of localMap.values()) {
        store.put(counter);
    }
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

// Export for use
window.DB = {
    addCounter,
    getCurrentCounter,
    getCounter,
    getAllCounters,
    updateCounter,
    setCurrentCounter,
    deleteCounter,
    exportAll,
    importMerge,
};
