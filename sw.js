const CACHE_NAME = 'picam-v4.01';
const ASSETS = [
    './', './index.html', './styles.css', './manifest.json',
    './js/db.js', './js/utils.js', './js/config.js', './js/main.js',
    './js/inventario.js', './js/ordini-clienti.js', './js/ordini-fornitori.js',
    './js/queue.js', './js/sync.js', './js/pdf.js', './js/print.js',
    './icon-192.png', './icon-512.png'
];
self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
    if (e.request.url.includes('googleapis.com') || e.request.url.includes('accounts.google.com')) return;
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
