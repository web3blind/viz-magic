// Viz Magic — Service Worker
var CACHE_NAME = 'viz-magic-v188';
var NAVIGATION_TIMEOUT_MS = 3500;
var RUNTIME_TIMEOUT_MS = 2500;
var APP_SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.ico',
    '/assets/icons/viz-magic-v158-192.png',
    '/assets/icons/viz-magic-v158-512.png',
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

function _fetchWithTimeout(request, timeoutMs, fetchOptions) {
    return new Promise(function(resolve, reject) {
        var done = false;
        var timer = setTimeout(function() {
            if (done) return;
            done = true;
            reject(new Error('network-timeout'));
        }, timeoutMs || RUNTIME_TIMEOUT_MS);

        fetch(request, fetchOptions || {}).then(function(response) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(response);
        }).catch(function(err) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(err);
        });
    });
}

function _offlineShellResponse() {
    var html = '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
        '<title>Viz Magic</title>' +
        '<style>body{margin:0;min-height:100vh;background:#0d1117;color:#f0f6fc;font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px}main{max-width:560px;border:1px solid #30363d;border-radius:16px;background:#161b22;padding:24px;box-shadow:0 16px 48px rgba(0,0,0,.35)}a{color:#58a6ff}</style>' +
        '</head><body><main role="status" aria-live="polite"><h1>Viz Magic</h1>' +
        '<p>Магический мир не получил сеть вовремя, поэтому экран не должен оставаться чёрным.</p>' +
        '<p>Проверь интернет и открой игру снова. Если ярлык зависает, открой сайт в браузере:</p>' +
        '<p><a href="https://vizmagic.web3blind.xyz/">https://vizmagic.web3blind.xyz/</a></p>' +
        '</main></body></html>';
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function _cacheSuccessful(request, response) {
    if (response && response.status === 200 && response.type === 'basic') {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
    }
    return response;
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
        }).then(function() {
            return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        }).then(function(clientList) {
            return Promise.all(clientList.map(function(client) {
                if (client && client.url && client.navigate) {
                    return client.navigate(client.url).catch(function() {});
                }
            }));
        })
    );
});

self.addEventListener('fetch', function(event) {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            _fetchWithTimeout(event.request, NAVIGATION_TIMEOUT_MS).then(function(response) {
                return _cacheSuccessful(event.request, response);
            }).catch(function() {
                return caches.match(event.request).then(function(cached) {
                    if (cached) return cached;
                    return caches.match('/index.html').then(function(indexCached) {
                        return indexCached || _offlineShellResponse();
                    });
                });
            })
        );
        return;
    }

    var url = new URL(event.request.url);
    var isMapImage = url.pathname.indexOf('/assets/maps/') === 0 && /\.jpg$/.test(url.pathname);
    var isLibraryMapImage = (url.pathname.indexOf('/assets/library-maps-v2/') === 0 ||
        url.pathname.indexOf('/assets/library-maps/') === 0 ||
        url.pathname.indexOf('/assets/library-maps-middle/') === 0) && /\.(jpg|png)$/.test(url.pathname);

    if (isMapImage || isLibraryMapImage) {
        event.respondWith(
            _fetchWithTimeout(event.request, RUNTIME_TIMEOUT_MS, { cache: 'reload' }).then(function(response) {
                return _cacheSuccessful(event.request, response);
            }).catch(function() { return caches.match(event.request); })
        );
        return;
    }

    var isRuntimeAsset = /\.(js|css|json)$/.test(url.pathname) || url.pathname === '/manifest.json';

    if (isRuntimeAsset) {
        event.respondWith(
            _fetchWithTimeout(event.request, RUNTIME_TIMEOUT_MS).then(function(response) {
                return _cacheSuccessful(event.request, response);
            }).catch(function() { return caches.match(event.request); })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(function(cached) {
            return cached || _fetchWithTimeout(event.request, RUNTIME_TIMEOUT_MS).then(function(response) {
                return _cacheSuccessful(event.request, response);
            });
        })
    );
});
