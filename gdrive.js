// gdrive.js - Google Drive sync
const GDRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const BACKUP_FILENAME = 'tapcounter_backup.json';
const SYNC_KEY = 'gdrive_last_sync_date';
const TOKEN_KEY = 'gdrive_access_token';
const CONNECTED_KEY = 'gdrive_connected';

let tokenClient = null;

function isConnected() {
    return localStorage.getItem(CONNECTED_KEY) === 'true';
}

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function initGDrive(clientId) {
    return new Promise((resolve) => {
        if (typeof google === 'undefined' || !google.accounts) {
            resolve(false);
            return;
        }
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GDRIVE_SCOPES,
            callback: () => { }, // overridden per-call
        });
        resolve(true);
    });
}

function requestAccessToken() {
    return new Promise((resolve, reject) => {
        if (!tokenClient) {
            reject(new Error('GDrive not initialized'));
            return;
        }
        tokenClient.callback = (response) => {
            if (response.error) {
                reject(new Error(response.error));
                return;
            }
            localStorage.setItem(TOKEN_KEY, response.access_token);
            localStorage.setItem(CONNECTED_KEY, 'true');
            resolve(response.access_token);
        };
        tokenClient.requestAccessToken({ prompt: 'consent' });
    });
}

async function findBackupFile(token) {
    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${BACKUP_FILENAME}'&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error('Failed to search Drive');
    const data = await res.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function downloadBackup(token) {
    const fileId = await findBackupFile(token);
    if (!fileId) return null;
    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error('Failed to download backup');
    return res.json();
}

async function uploadBackup(token, data) {
    const fileId = await findBackupFile(token);
    const content = JSON.stringify(data, null, 2);
    const metadata = { name: BACKUP_FILENAME, mimeType: 'application/json' };

    if (fileId) {
        // Update existing
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: 'application/json' }));
        const res = await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
            { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form }
        );
        if (!res.ok) throw new Error('Failed to update backup');
    } else {
        // Create new in appDataFolder
        metadata.parents = ['appDataFolder'];
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: 'application/json' }));
        const res = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
        );
        if (!res.ok) throw new Error('Failed to create backup');
    }
}

async function connectGDrive(clientId) {
    const init = await initGDrive(clientId);
    if (!init) throw new Error('Google API not loaded');
    const token = await requestAccessToken();

    // On first connect, pull existing backup and merge
    const remote = await downloadBackup(token);
    if (remote && Array.isArray(remote)) {
        await DB.importMerge(remote);
    }

    // Upload merged data
    const all = await DB.getAllCounters();
    await uploadBackup(token, all);
    localStorage.setItem(SYNC_KEY, new Date().toDateString());
}

async function disconnectGDrive() {
    const token = getToken();
    if (token) {
        try {
            google.accounts.oauth2.revoke(token);
        } catch (e) { /* ignore */ }
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CONNECTED_KEY);
    localStorage.removeItem(SYNC_KEY);
}

async function syncOnOpen(clientId) {
    if (!isConnected()) return;
    const lastSync = localStorage.getItem(SYNC_KEY);
    const today = new Date().toDateString();
    if (lastSync === today) return; // Already synced today

    const token = getToken();
    if (!token) return;

    if (!tokenClient) {
        await initGDrive(clientId);
    }

    try {
        // Download remote
        const remote = await downloadBackup(token);
        if (remote && Array.isArray(remote)) {
            await DB.importMerge(remote);
        }
        // Upload merged
        const all = await DB.getAllCounters();
        await uploadBackup(token, all);
        localStorage.setItem(SYNC_KEY, today);
    } catch (e) {
        console.warn('GDrive sync failed:', e);
        // Token might be expired - user needs to reconnect
        if (e.message && e.message.includes('401')) {
            localStorage.removeItem(TOKEN_KEY);
        }
    }
}

window.GDrive = {
    isConnected,
    initGDrive,
    connectGDrive,
    disconnectGDrive,
    syncOnOpen,
    downloadBackup,
    uploadBackup,
};
