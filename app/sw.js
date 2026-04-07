// Viz Magic — Service Worker
var CACHE_NAME = 'viz-magic-v8';
var ASSETS = [
    '/',
    '/index.html',
    '/css/main.css',
    '/css/themes.css',
    '/css/accessibility.css',
    '/lib/viz.min.js',
    '/js/config.js',
    '/js/i18n/ru.js',
    '/js/i18n/en.js',
    '/js/utils/helpers.js',
    '/js/utils/crypto.js',
    '/js/utils/a11y.js',
    '/js/blockchain/connection.js',
    '/js/blockchain/account.js',
    '/js/blockchain/broadcast.js',
    '/js/blockchain/invite.js',
    '/js/protocols/vm-protocol.js',
    '/js/protocols/voice.js',
    '/js/data/creatures.js',
    '/js/data/spells.js',
    '/js/data/recipes.js',
    '/js/data/regions.js',
    '/js/engine/types.js',
    '/js/engine/formulas.js',
    '/js/engine/character.js',
    '/js/engine/items.js',
    '/js/engine/combat.js',
    '/js/engine/validator.js',
    '/js/engine/checkpoint.js',
    '/js/engine/block-processor.js',
    '/js/engine/state-engine.js',
    '/js/engine/daily-leaderboard-storage.js',
    '/js/engine/daily-leaderboard.js',
    '/js/ui/sound.js',
    '/js/ui/components/progress-bar.js',
    '/js/ui/components/toast.js',
    '/js/ui/components/modal.js',
    '/js/ui/components/nav.js',
    '/js/ui/screens/landing.js',
    '/js/ui/screens/onboarding.js',
    '/js/ui/screens/login.js',
    '/js/ui/screens/home.js',
    '/js/ui/screens/character.js',
    '/js/ui/screens/hunt.js',
    '/js/ui/screens/inventory.js',
    '/js/ui/screens/chronicle.js',
    '/js/ui/screens/arena.js',
    '/js/ui/screens/guild.js',
    '/js/ui/screens/map.js',
    '/js/ui/screens/marketplace.js',
    '/js/ui/screens/crafting.js',
    '/js/ui/screens/quests.js',
    '/js/ui/screens/world-boss.js',
    '/js/ui/screens/settings.js',
    '/js/ui/screens/help.js',
    '/js/ui/screens/leaderboard.js',
    '/js/ui/app.js'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(
                names.filter(function(n) { return n !== CACHE_NAME; })
                     .map(function(n) { return caches.delete(n); })
            );
        })
    );
});

self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            return cached || fetch(event.request).then(function(response) {
                if (response && response.status === 200 && response.type === 'basic') {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            }).catch(function() {
                // Offline fallback
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
            });
        })
    );
});