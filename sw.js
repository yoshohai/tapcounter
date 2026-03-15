// Service Worker for Tap Counter PWA
const CACHE_NAME = 'tapcounter-v2';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './db.js',
    './gdrive.js',
    './app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Skip non-GET and external API calls
    if (e.request.method !== 'GET') return;
    if (e.request.url.includes('googleapis.com')) return;
    if (e.request.url.includes('accounts.google.com')) return;
    if (e.request.url.includes('gstatic.com')) return;

    e.respondWith(
        caches.match(e.request).then((cached) => {
            return cached || fetch(e.request).then((res) => {
                // Cache successful responses for app assets
                if (res.status === 200 && e.request.url.startsWith(self.location.origin)) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                }
                return res;
            });
        }).catch(() => caches.match('./'))
    );
});
