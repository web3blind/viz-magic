// Viz Magic — Service Worker
var CACHE_NAME = 'viz-magic-v84';
var APP_SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.ico',
    '/assets/icons/viz-magic-v78-192.png',
    '/assets/icons/viz-magic-v78-512.png',
    '/css/main.css',
    '/css/themes.css',
    '/css/accessibility.css'
];

function _cacheAppShell() {
    return caches.open(CACHE_NAME).then(function(cache) {
        return Promise.all(
            APP_SHELL_ASSETS.map(function(url) {
                return cache.add(url).catch(function(err) {
                    console.warn('Optional app-shell cache failed:', url, err);
                });
            })
        );
    });
}

self.addEventListener('install', function(event) {
    // Keep install fast: do not make Android/Chrome wait for app-shell downloads.
    // Runtime fetch remains network-first and fills the cache lazily after install.
    event.waitUntil(self.skipWaiting());
    _cacheAppShell();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(
                names.filter(function(n) { return n !== CACHE_NAME; })
                     .map(function(n) { return caches.delete(n); })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function(event) {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).then(function(response) {
                if (response && response.status === 200 && response.type === 'basic') {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            }).catch(function() {
                return caches.match(event.request).then(function(cached) {
                    return cached || caches.match('/index.html');
                });
            })
        );
        return;
    }

    var url = new URL(event.request.url);
    var isRuntimeAsset = /\.(js|css|json)$/.test(url.pathname) || url.pathname === '/manifest.json';

    if (isRuntimeAsset) {
        event.respondWith(
            fetch(event.request).then(function(response) {
                if (response && response.status === 200 && response.type === 'basic') {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
                }
                return response;
            }).catch(function() { return caches.match(event.request); })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(function(cached) {
            return cached || fetch(event.request).then(function(response) {
                if (response && response.status === 200 && response.type === 'basic') {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
                }
                return response;
            });
        })
    );
});