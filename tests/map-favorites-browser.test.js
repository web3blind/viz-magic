'use strict';
var assert = require('node:assert/strict');
var fs = require('fs');
var http = require('http');
var path = require('path');
var puppeteer = require('puppeteer');
var root = path.resolve(__dirname, '../app');
var mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
async function run() {
    var server = http.createServer(function(req, res) {
        var name = decodeURIComponent(req.url.split('?')[0]);
        if (name === '/') name = '/index.html';
        var file = path.resolve(root, '.' + name);
        if (file.indexOf(root + path.sep) !== 0) { res.writeHead(403); res.end(); return; }
        fs.readFile(file, function(err, bytes) {
            if (err) { res.writeHead(404); res.end(); return; }
            // Isolated shell: all production modules, no network startup or saved wallet.
            if (name === '/index.html') bytes = bytes.toString().replace(/<script src="js\/ui\/app.js[^>]+><\/script>/, '');
            res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(bytes);
        });
    });
    await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
    var browser;
    try {
        browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
        var page = await browser.newPage();
        var errors = [];
        page.on('pageerror', function(e) { errors.push(e.message); });
        page.on('console', function(e) { if (e.type() === 'error') errors.push(e.text()); });
        await page.setRequestInterception(true);
        page.on('request', function(req) {
            if (!req.url().startsWith('http://127.0.0.1:') && !req.url().startsWith('data:')) return req.respond({ status: 200, contentType: 'application/json', body: '{}' });
            req.continue();
        });
        var url = 'http://127.0.0.1:' + server.address().port + '/';
        await page.setViewport({ width: 360, height: 800 });
        await page.goto(url, { waitUntil: 'load' });
        async function help(user) {
            await page.evaluate(function(user) {
                VizAccount.getCurrentUser = function() { return user; };
                VizBroadcast.libraryUnlockChapterAction = function() { throw Error('QA must not broadcast'); };
                Helpers.setLang('ru'); HelpScreen.render();
                document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
                var el = document.getElementById('screen-help'); el.classList.add('active'); el.removeAttribute('aria-hidden');
            }, user);
        }
        await help('favorites-qa');
        assert.ok(await page.$('#help-favorites-title'), 'favorite list exists before day-one library');
        assert.equal(await page.evaluate(function() { return !!(document.getElementById('help-favorites-title').compareDocumentPosition(document.getElementById('help-magic-library-title')) & Node.DOCUMENT_POSITION_FOLLOWING); }), true);
        console.log('PASS favorite section before day one');
        await page.focus('[data-library-map="commons_first_light"]');
        await page.keyboard.press('Enter');
        assert.ok(await page.$('#map-favorite-toggle'), 'viewer exposes native favorite control');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Space');
        assert.equal(await page.evaluate(function() { return MapFavorites.read('favorites-qa').ids.length; }), 1);
        assert.ok(await page.$('#map-viewer-next'), 'viewer exposes internal next control');
        assert.equal(await page.$eval('#map-viewer-prev', function(el) { return el.disabled; }), true);
        await page.focus('#map-viewer-next'); await page.keyboard.press('Enter');
        assert.equal(await page.$eval('#map-viewer-position', function(el) { return el.textContent; }), 'Карта 2 из 15');
        assert.equal(await page.$eval('#modal-container .lore-map-title', function(el) { return el.textContent.trim(); }), 'The Covenant Bazaar Ур. 3-50');
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(function() { return document.activeElement.getAttribute('data-library-map'); }), 'commons_first_light');
        console.log('PASS keyboard save + next + original opener');
        // Manual rotation: #16 is rejected without replacement; remove then add frees one slot.
        await page.evaluate(function() {
            localStorage.removeItem('viz_magic_map_favorites_account:favorites-qa');
            document.querySelectorAll('[data-library-map]').forEach(function(el) { MapFavorites.add('favorites-qa', 'day1:' + el.getAttribute('data-library-map')); });
            HelpScreen.render();
        });
        var originalIds = await page.evaluate(function() { return MapFavorites.read('favorites-qa').ids; });
        await page.evaluate(function() { StateEngine.processLibraryUnlockResult('favorites-qa', 1, StateEngine.getLibraryDay(), 'chapter2'); HelpScreen.render(); });
        await page.focus('[data-secret-library-map="01"]'); await page.keyboard.press('Space');
        assert.match(await page.$eval('#map-viewer-status', function(el) { return el.textContent; }), /Лимит — 15 карт/);
        await page.focus('#map-favorite-toggle'); await page.keyboard.press('Enter');
        assert.match(await page.$eval('#map-viewer-status', function(el) { return el.textContent; }), /Удалите одну.*затем добавьте/);
        assert.deepEqual(await page.evaluate(function() { return MapFavorites.read('favorites-qa').ids; }), originalIds);
        await page.keyboard.press('Escape');
        await page.focus('[data-favorite-remove="day1:commons_first_light"]'); await page.keyboard.press('Space');
        assert.equal(await page.evaluate(function() { return MapFavorites.read('favorites-qa').ids.length; }), 14);
        assert.match(await page.$eval('#help-favorites-status', function(el) { return el.textContent; }), /14 из 15/);
        assert.ok(await page.$('[data-library-map="commons_first_light"]'), 'source still exists');
        await page.focus('[data-secret-library-map="01"]'); await page.keyboard.press('Enter');
        await page.focus('#map-favorite-toggle'); await page.keyboard.press('Space');
        assert.equal(await page.$eval('#map-favorite-toggle', function(el) { return el.getAttribute('aria-pressed'); }), 'true');
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(function() { return MapFavorites.read('favorites-qa').ids.length; }), 15);
        assert.ok(await page.$('[data-favorite-open="chapter2:01"]'));
        assert.equal(await page.evaluate(function() { return document.documentElement.scrollWidth; }), 360, 'full favorite list has no mobile overflow');
        assert.ok(await page.$eval('.help-favorites', function(el) { return el.scrollWidth <= el.clientWidth; }), 'full favorite article fits 360px');
        console.log('PASS manual rotation 15 -> reject 16 unchanged -> remove -> add 16; source preserved');

        // Save through the entitled original viewer, then expire access: only Favorites stays open.
        await page.evaluate(function() {
            localStorage.removeItem('viz_magic_map_favorites_account:favorites-qa');
            MapFavorites.add('favorites-qa', 'day1:commons_first_light');
            StateEngine.processLibraryUnlockResult('favorites-qa', 2, StateEngine.getLibraryDay(), 'chapter3');
            HelpScreen.render();
        });
        await page.focus('[data-unknown-library-map="01"]'); await page.keyboard.press('Enter');
        await page.focus('#map-favorite-toggle'); await page.keyboard.press('Space');
        await page.keyboard.press('Escape');
        await page.evaluate(function() {
            window.qaDay = StateEngine.getLibraryDay;
            StateEngine.getLibraryDay = function() { return '2000-01-01'; };
            HelpScreen.render();
        });
        assert.equal(await page.$$eval('[data-unknown-library-map]', function(n) { return n.length; }), 0, 'original chapter remains locked');
        await page.focus('[data-favorite-open="chapter3:01"]'); await page.keyboard.press('Enter');
        assert.equal(await page.$eval('#modal-container', function(el) { return el.classList.contains('show'); }), true, 'saved paid card opens after expiry');
        assert.equal(await page.$eval('#map-viewer-position', function(el) { return el.textContent; }), 'Карта 2 из 2');
        assert.equal(await page.$eval('#map-viewer-next', function(el) { return el.disabled; }), true, 'unsaved chapter neighbor is not reachable');
        assert.equal(await page.evaluate(function() { return StateEngine.hasLibraryAccess('favorites-qa', 'chapter3', StateEngine.getLibraryDay()); }), false, 'saved status never grants chapter entitlement');
        var paidClient = await page.createCDPSession();
        var paidAx = await paidClient.send('Accessibility.getFullAXTree');
        var paidTitle = await page.$eval('#map-viewer-title', function(el) { return el.textContent; });
        assert.ok(paidAx.nodes.some(function(n) { return !n.ignored && n.role.value === 'dialog' && n.name.value === paidTitle; }));
        assert.ok(paidAx.nodes.some(function(n) { return !n.ignored && n.role.value === 'button' && n.name.value === 'Убрать из избранного'; }));
        assert.equal(await page.$eval('#map-viewer-status', function(el) { return el.getAttribute('aria-live'); }), 'polite');
        if (process.env.MAP_QA_SCREENSHOTS === '1') {
            fs.mkdirSync('media_review/favorites-qa', { recursive: true });
            fs.writeFileSync('media_review/favorites-qa/saved-paid-expired-ax.json', JSON.stringify(paidAx, null, 2));
            await page.screenshot({ path: 'media_review/favorites-qa/saved-paid-expired-360.png' });
        }
        await paidClient.detach();
        await page.focus('#map-viewer-prev'); await page.keyboard.press('Space');
        assert.equal(await page.$eval('#map-viewer-position', function(el) { return el.textContent; }), 'Карта 1 из 2');
        await page.focus('#map-viewer-next'); await page.keyboard.press('Enter');
        assert.match(await page.$eval('#help-library-map-image', function(el) { return el.getAttribute('src'); }), /chapter3\/unknown-map-01/);
        await page.focus('#map-favorite-toggle'); await page.keyboard.press('Space');
        assert.equal(await page.$eval('#modal-container', function(el) { return el.classList.contains('show'); }), false, 'removal immediately closes favorite viewer');
        assert.equal(await page.$('[data-favorite-open="chapter3:01"]'), null);
        assert.match(await page.$eval('#help-favorites-status', function(el) { return el.textContent; }), /Карта убрана/);
        assert.equal(await page.$$eval('[data-unknown-library-map]', function(n) { return n.length; }), 0, 'removal does not unlock original');
        // Cross-tab removal invalidates an already open viewer and its rendered opener.
        await page.evaluate(function() { StateEngine.getLibraryDay = window.qaDay; HelpScreen.render(); });
        await page.focus('[data-unknown-library-map="01"]'); await page.keyboard.press('Enter');
        await page.focus('#map-favorite-toggle'); await page.keyboard.press('Space'); await page.keyboard.press('Escape');
        await page.evaluate(function() { StateEngine.getLibraryDay = function() { return '2000-01-01'; }; HelpScreen.render(); });
        await page.focus('[data-favorite-open="chapter3:01"]'); await page.keyboard.press('Enter');
        var otherTab = await browser.newPage();
        await otherTab.goto(url, { waitUntil: 'load' });
        await otherTab.evaluate(function() { localStorage.setItem('viz_magic_map_favorites_account:favorites-qa', JSON.stringify(['day1:commons_first_light'])); });
        await page.waitForFunction(function() { return !document.getElementById('modal-container').classList.contains('show'); }, { timeout: 2000 });
        assert.equal(await page.$('[data-favorite-open="chapter3:01"]'), null, 'stale saved opener removed');
        assert.match(await page.$$eval('#toast-container .toast-error', function(nodes) { return nodes.map(function(el) { return el.textContent; }).join(' '); }), /Карта больше не сохранена/, 'revoked favorite access visibly explained');
        await otherTab.close();
        await page.evaluate(function() { StateEngine.getLibraryDay = window.qaDay; });
        console.log('PASS legitimately saved paid card after expiry; original chapter locked; saved-only paging; removal/cross-tab stale viewer revoked');
        await page.evaluate(function() {
            ['chapter2','chapter3','chapter4','chapter5','chapter6','chapter7','chapter8'].forEach(function(ch, i) { StateEngine.processLibraryUnlockResult('favorites-qa', i + 10, StateEngine.getLibraryDay(), ch); });
            HelpScreen.render();
        });

        await page.evaluate(function() { localStorage.removeItem('viz_magic_map_favorites_account:favorites-qa'); });
        var groups = ['library','secret-library','unknown-library','middle-library','attraction-library','living-nature-library','living-elements-library','living-forest-library'];
        var evidence = [];
        for (var group of groups) {
            var attr = 'data-' + group + '-map';
            var expected = await page.$$eval('[' + attr + ']', function(nodes) { return nodes.map(function(el) { return { id: el.getAttribute(el.getAttributeNames().find(function(a) { return /^data-.*-map$/.test(a); })), title: el.textContent }; }); });
            assert.equal(expected.length, 15);
            await page.focus('[' + attr + ']'); await page.keyboard.press('Enter');
            assert.equal(await page.$eval('#map-viewer-prev', function(el) { return el.disabled; }), true);
            await page.focus('#map-favorite-toggle'); await page.keyboard.press('Space');
            assert.equal(await page.$eval('#map-favorite-toggle', function(el) { return el.getAttribute('aria-pressed'); }), 'true');
            await page.focus('#map-viewer-next'); await page.keyboard.press('Enter');
            assert.equal(await page.$eval('#map-viewer-position', function(el) { return el.textContent; }), 'Карта 2 из 15');
            await page.focus('#map-viewer-prev'); await page.keyboard.press('Space');
            assert.equal(await page.$eval('#map-viewer-position', function(el) { return el.textContent; }), 'Карта 1 из 15');
            assert.equal(await page.$eval('#map-viewer-prev', function(el) { return el.disabled; }), true);
            for (var i = 0; i < expected.length; i++) {
                if (i) { await page.focus('#map-viewer-next'); await page.keyboard.press(i % 2 ? 'Space' : 'Enter'); }
                var state = await page.evaluate(function() {
                    var img = document.querySelector('#modal-container img');
                    var text = document.querySelector('#modal-container .help-library-map-text');
                    return { title: document.getElementById('map-viewer-title').textContent, src: img.getAttribute('src'), alt: img.alt, text: text.textContent, pos: document.getElementById('map-viewer-position').textContent, focus: document.activeElement.id };
                });
                assert.equal(state.title, group === 'library' ? expected[i].title.replace(/^\d+\. /, '') : expected[i].title);
                assert.ok(state.src.includes('map-' + expected[i].id + '.jpg?v='));
                assert.ok(state.alt.endsWith(state.text));
                assert.ok(state.alt.includes(state.title));
                assert.ok(state.alt.length > 40);
                await page.waitForFunction(function() { var img = document.querySelector('#modal-container img'); return img.complete && img.naturalWidth > 0; }, { timeout: 10000 });
                assert.equal(state.pos, 'Карта ' + (i + 1) + ' из 15');
                if (i && i < 14) assert.equal(state.focus, 'map-viewer-next');
            }
            assert.equal(await page.$eval('#map-viewer-next', function(el) { return el.disabled; }), true);
            assert.equal(await page.evaluate(function() { return document.activeElement.id; }), 'map-viewer-position');
            await page.focus('#map-viewer-prev'); await page.keyboard.press('Enter');
            assert.equal(await page.$eval('#map-viewer-position', function(el) { return el.textContent; }), 'Карта 14 из 15');
            // Zoom resets on transition; original Close behavior and focus survive all switches.
            await page.focus('#help-library-zoom-toggle'); await page.keyboard.press('Space');
            assert.equal(await page.$eval('#modal-container', function(el) { return el.classList.contains('help-library-fullscreen'); }), true);
            await page.focus('#help-library-close'); await page.keyboard.press('Tab');
            assert.equal(await page.evaluate(function() { return document.activeElement.id; }), 'map-favorite-toggle', 'fullscreen trap skips hidden Zoom');
            await page.focus('#map-viewer-prev'); await page.keyboard.press('Space');
            assert.equal(await page.$eval('#modal-container', function(el) { return el.classList.contains('help-library-fullscreen'); }), false);
            await page.focus('#help-library-close'); await page.keyboard.press('Tab');
            assert.equal(await page.evaluate(function() { return document.activeElement.id; }), 'help-library-zoom-toggle');
            await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
            assert.equal(await page.evaluate(function() { return document.activeElement.id; }), 'help-library-close');
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(function(attr) { return document.activeElement.getAttribute(attr); }, attr), expected[0].id);
            evidence.push({ group: group, maps: expected.length, orderAndBoundaries: true, focusRestored: true });
        }
        console.log('PASS every library viewer approved order, content/alt, boundaries, zoom, Tab trap, Escape focus: ' + JSON.stringify(evidence));

        // Accessible tree: native controls, named dialog and polite status.
        await page.evaluate(function() { localStorage.removeItem('viz_magic_map_favorites_account:favorites-qa'); HelpScreen.render(); });
        await page.focus('[data-library-map="commons_first_light"]'); await page.keyboard.press('Enter');
        var client = await page.createCDPSession();
        var ax = await client.send('Accessibility.getFullAXTree');
        var axNodes = ax.nodes.filter(function(n) { return !n.ignored; });
        assert.ok(axNodes.some(function(n) { return n.role && n.role.value === 'dialog' && n.name.value.includes('Commons'); }));
        ['Добавить в избранное','Следующая','Предыдущая','Закрыть'].forEach(function(name) {
            assert.ok(axNodes.some(function(n) { return n.role && n.role.value === 'button' && n.name.value === name; }), 'AX button ' + name);
        });
        assert.equal(await page.$eval('#map-viewer-status', function(el) { return el.getAttribute('aria-live'); }), 'polite');
        assert.equal(await page.$eval('#help-favorites-status', function(el) { return el.getAttribute('aria-live'); }), 'polite');
        var layout = await page.evaluate(function() {
            var modal = document.getElementById('modal-container');
            var controls = Array.from(modal.querySelectorAll('button')).map(function(b) { var r = b.getBoundingClientRect(); return { id:b.id, width:r.width, height:r.height, right:r.right }; });
            return { width: innerWidth, scroll: document.documentElement.scrollWidth, modalScroll: modal.scrollWidth, modalClient: modal.clientWidth, controls: controls };
        });
        assert.ok(layout.scroll <= 360, JSON.stringify(layout));
        assert.ok(layout.modalScroll <= layout.modalClient, JSON.stringify(layout));
        layout.controls.forEach(function(c) { assert.ok(c.width >= 48 && c.height >= 48, JSON.stringify(c)); });
        await page.focus('#help-library-close');
        if (process.env.MAP_QA_SCREENSHOTS === '1') {
            fs.mkdirSync('media_review/favorites-qa', { recursive: true });
            await page.screenshot({ path: 'media_review/favorites-qa/modal-360.png' });
        }
        await page.focus('#help-library-zoom-toggle'); await page.keyboard.press('Enter');
        if (process.env.MAP_QA_SCREENSHOTS === '1') await page.screenshot({ path: 'media_review/favorites-qa/fullscreen-360.png' });
        var pan = await page.$eval('#help-library-map-viewport', function(el) { return { width: el.clientWidth, scroll: el.scrollWidth }; });
        assert.ok(pan.scroll > pan.width, 'zoom preserves horizontal pan');
        await page.hover('#help-library-map-viewport'); await page.mouse.wheel({ deltaX: 100, deltaY: 0 });
        await page.waitForFunction(function() { return document.getElementById('help-library-map-viewport').scrollLeft > 0; });
        console.log('PASS fullscreen native horizontal pan preserved');
        console.log('PASS AX named dialog/native buttons/live status and 360px layout: ' + JSON.stringify(layout));
        await page.keyboard.press('Escape');
        await page.evaluate(function() {
            MapScreen.render();
            document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
            document.getElementById('screen-map').classList.add('active');
        });
        var worldIds = await page.$$eval('[data-lore-region]', function(nodes) { return nodes.map(function(el) { return el.getAttribute('data-lore-region'); }); });
        assert.equal(worldIds.length, 15);
        await page.focus('[data-lore-region="' + worldIds[0] + '"]'); await page.keyboard.press('Enter');
        for (var wi = 0; wi < worldIds.length; wi++) {
            if (wi) { await page.focus('#map-viewer-next'); await page.keyboard.press('Space'); }
            assert.ok((await page.$eval('#lore-map-image', function(el) { return el.getAttribute('src'); })).includes('map-' + worldIds[wi] + '.jpg'));
            assert.equal(await page.$eval('#map-viewer-position', function(el) { return el.textContent; }), 'Карта ' + (wi + 1) + ' из 15');
        }
        await page.focus('#map-favorite-toggle'); await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(function() { return MapFavorites.read('favorites-qa').ids; }), ['world:' + worldIds[14]]);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(function() { return document.activeElement.getAttribute('data-lore-region'); }), worldIds[0]);
        console.log('PASS world viewer actual region list order + save + original opener');
        await help('favorites-qa');
        await page.evaluate(function() {
            localStorage.setItem('viz_magic_map_favorites_account:favorites-qa', JSON.stringify(['world:commons_first_light', 'chapter2:01', 'day1:covenant_bazaar']));
            window.qaDay = StateEngine.getLibraryDay;
            StateEngine.getLibraryDay = function() { return '2000-01-01'; };
            HelpScreen.render();
        });
        await page.focus('[data-favorite-open="world:commons_first_light"]'); await page.keyboard.press('Enter');
        assert.equal(await page.$eval('#map-viewer-status', function(el) { return el.classList.contains('sr-only') && el.textContent === ''; }), true, 'world favorite starts without visible footer below capacity');
        await page.focus('#map-viewer-next'); await page.keyboard.press('Space');
        assert.equal(await page.$eval('#map-viewer-status', function(el) { return el.classList.contains('sr-only') && !/Лимит/.test(el.textContent); }), true, 'mixed favorite paging has no visible footer');
        assert.match(await page.$eval('#lore-map-image', function(el) { return el.getAttribute('src'); }), /chapter2\/secret-map-01/);
        assert.notEqual(await page.$eval('#lore-fallback', function(el) { return getComputedStyle(el).display; }), 'none', 'paid description remains visible in mixed favorite viewer');
        assert.equal(await page.$eval('#map-viewer-position', function(el) { return el.textContent; }), 'Карта 2 из 3');
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(function() { return document.activeElement.getAttribute('data-favorite-open'); }), 'world:commons_first_light');
        await page.focus('[data-favorite-open="day1:covenant_bazaar"]'); await page.keyboard.press('Space');
        await page.focus('#map-viewer-prev'); await page.keyboard.press('Enter');
        assert.match(await page.$eval('#help-library-map-image', function(el) { return el.getAttribute('src'); }), /chapter2\/secret-map-01/);
        await page.focus('#map-viewer-prev'); await page.keyboard.press('Space');
        assert.match(await page.$eval('#help-library-map-image', function(el) { return el.getAttribute('src'); }), /assets\/maps\/map-commons/);
        assert.equal(await page.$eval('#map-viewer-position', function(el) { return el.textContent; }), 'Карта 1 из 3');
        await page.keyboard.press('Escape');
        console.log('PASS mixed favorites saved order/total after expiry, correct assets and original opener');
        await page.evaluate(function() { StateEngine.getLibraryDay = window.qaDay; });
        // All 15 from one paid chapter, saved by UI while entitled, remain viewable after expiry.
        await help('single-chapter-qa');
        await page.evaluate(function() { StateEngine.processLibraryUnlockResult('single-chapter-qa', 77, StateEngine.getLibraryDay(), 'chapter2'); HelpScreen.render(); });
        await page.focus('[data-secret-library-map="01"]'); await page.keyboard.press('Enter');
        for (var si = 0; si < 15; si++) {
            if (si) { await page.focus('#map-viewer-next'); await page.keyboard.press('Enter'); }
            await page.focus('#map-favorite-toggle'); await page.keyboard.press('Space');
        }
        await page.keyboard.press('Escape');
        var sameChapter = await page.evaluate(function() { return MapFavorites.read('single-chapter-qa').ids; });
        assert.equal(sameChapter.length, 15);
        assert.ok(sameChapter.every(function(id) { return id.startsWith('chapter2:'); }));
        await page.evaluate(function() { window.qaDay = StateEngine.getLibraryDay; StateEngine.getLibraryDay = function() { return '2000-01-01'; }; HelpScreen.render(); });
        assert.equal(await page.$$eval('[data-secret-library-map]', function(n) { return n.length; }), 0);
        await page.focus('[data-favorite-open="' + sameChapter[0] + '"]'); await page.keyboard.press('Enter');
        console.log('OBSERVED favorite footer at capacity: ' + await page.$eval('#map-viewer-status', function(el) { return el.textContent; }));
        assert.equal(await page.$eval('#map-viewer-status', function(el) { return el.textContent; }), '', 'Favorites initial draw has no repeated limit explanation');
        for (var fi = 0; fi < 15; fi++) {
            if (fi) { await page.focus('#map-viewer-next'); await page.keyboard.press('Space'); }
            var footer = await page.$eval('#map-viewer-status', function(el) {
                var css = getComputedStyle(el);
                return { text: el.textContent, live: el.getAttribute('aria-live'), role: el.getAttribute('role'), clipped: css.position === 'absolute' && css.width === '1px' && css.height === '1px' && css.overflow === 'hidden' };
            });
            assert.equal(footer.clipped, true, 'Favorite modal has no visible footer below Close');
            assert.equal(footer.live, 'polite');
            assert.equal(footer.role, 'status');
            assert.doesNotMatch(footer.text, /Лимит|Удалите одну|Исходная карта/);
            if (fi) assert.match(footer.text, new RegExp('Карта ' + (fi + 1) + ' из 15:'), 'paging still announces card for screen readers');
            assert.equal(await page.$eval('#map-viewer-position', function(el) { return el.textContent; }), 'Карта ' + (fi + 1) + ' из 15');
            assert.match(await page.$eval('#help-library-map-image', function(el) { return el.getAttribute('src'); }), new RegExp('secret-map-' + sameChapter[fi].split(':')[1]));
        }
        var favoriteClient = await page.createCDPSession();
        var favoriteAx = await favoriteClient.send('Accessibility.getFullAXTree');
        var favoriteDom = await favoriteClient.send('DOM.getDocument');
        var favoriteStatusNode = await favoriteClient.send('DOM.querySelector', { nodeId: favoriteDom.root.nodeId, selector: '#map-viewer-status' });
        var favoriteStatusDom = await favoriteClient.send('DOM.describeNode', { nodeId: favoriteStatusNode.nodeId });
        assert.ok(favoriteAx.nodes.some(function(n) { return n.backendDOMNodeId === favoriteStatusDom.node.backendNodeId && !n.ignored && n.role.value === 'status' && (n.properties || []).some(function(p) { return p.name === 'live' && p.value.value === 'polite'; }); }), 'exact clipped favorite status remains in AX tree');
        if (process.env.MAP_QA_SCREENSHOTS === '1') {
            fs.writeFileSync('media_review/favorites-qa/footer-free-favorites-ax.json', JSON.stringify(favoriteAx, null, 2));
            await page.$eval('#help-library-close', function(el) { el.scrollIntoView({ block: 'end' }); });
            await page.screenshot({ path: 'media_review/favorites-qa/footer-free-favorites-360.png' });
        }
        await favoriteClient.detach();
        await page.focus('#help-library-close'); await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(function() { return document.activeElement.id; }), 'help-library-zoom-toggle');
        await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
        assert.equal(await page.evaluate(function() { return document.activeElement.id; }), 'help-library-close');
        await page.evaluate(function() {
            window.qaStorageSet = Storage.prototype.setItem;
            Storage.prototype.setItem = function(k, v) { if (k.indexOf('viz_magic_map_favorites_') === 0) throw Error('quota'); return window.qaStorageSet.call(this, k, v); };
        });
        await page.focus('#map-favorite-toggle'); await page.keyboard.press('Space');
        assert.match(await page.$eval('#map-viewer-status', function(el) { return el.textContent; }), /Изменение не сохранено/, 'failed favorite removal retains live error');
        await page.waitForSelector('#toast-container .toast-error.show');
        assert.match(await page.$eval('#toast-container .toast-error', function(el) { return el.textContent; }), /Изменение не сохранено/, 'error also visibly shown, not silently clipped');
        assert.deepEqual(await page.evaluate(function() { return MapFavorites.read('single-chapter-qa').ids; }), sameChapter);
        await page.evaluate(function() { Storage.prototype.setItem = window.qaStorageSet; });
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(function() { return document.activeElement.getAttribute('data-favorite-open'); }), sameChapter[0]);
        console.log('PASS Favorites footer absent on all 15 cards; clipped polite AX status, Tab/Shift+Tab/Escape and visible storage error');
        await page.focus('[data-library-map="commons_first_light"]'); await page.keyboard.press('Enter');
        await page.focus('#map-favorite-toggle'); await page.keyboard.press('Space');
        assert.deepEqual(await page.evaluate(function() { return MapFavorites.read('single-chapter-qa').ids; }), sameChapter, 'total cap still 15, not 15 per chapter');
        await page.keyboard.press('Escape');
        // A forged/stale favorite UI id cannot create or open a new paid reference.
        await page.evaluate(function() { document.querySelector('[data-favorite-open]').setAttribute('data-favorite-open', 'chapter3:02'); });
        await page.focus('[data-favorite-open="chapter3:02"]'); await page.keyboard.press('Enter');
        assert.equal(await page.$eval('#modal-container', function(el) { return el.classList.contains('show'); }), false);
        assert.deepEqual(await page.evaluate(function() { return MapFavorites.read('single-chapter-qa').ids; }), sameChapter);
        await page.evaluate(function() { HelpScreen.render(); });
        await page.focus('[data-favorite-open="' + sameChapter[0] + '"]'); await page.keyboard.press('Enter');
        await help('other-qa');
        assert.equal(await page.$eval('#modal-container', function(el) { return el.classList.contains('show'); }), false, 'account rerender revokes stale Favorites viewer');
        assert.equal(await page.$$eval('[data-favorite-open]', function(n) { return n.length; }), 0);
        await page.evaluate(function() { StateEngine.getLibraryDay = window.qaDay; });
        await help('favorites-qa');
        console.log('PASS 15 paid cards from one chapter after expiry, shared total cap, unknown paid UI id denied and stale account viewer revoked');

        // Day rollover and account switch re-check access on each move/save.
        await page.focus('[data-secret-library-map="02"]'); await page.keyboard.press('Enter');
        var beforeExpiredAdd = await page.evaluate(function() { return MapFavorites.read('favorites-qa').ids; });
        await page.evaluate(function() { window.qaDay = StateEngine.getLibraryDay; StateEngine.getLibraryDay = function() { return '2000-01-01'; }; });
        await page.focus('#map-viewer-next'); await page.keyboard.press('Enter');
        assert.equal(await page.$eval('#map-viewer-position', function(el) { return el.textContent; }), 'Карта 2 из 15');
        assert.match(await page.$eval('#map-viewer-status', function(el) { return el.textContent; }), /доступ/);
        await page.focus('#map-favorite-toggle'); await page.keyboard.press('Space');
        assert.match(await page.$eval('#map-viewer-status', function(el) { return el.textContent; }), /доступ/);
        assert.deepEqual(await page.evaluate(function() { return MapFavorites.read('favorites-qa').ids; }), beforeExpiredAdd, 'unsaved paid map cannot be added from expired source viewer');
        await page.keyboard.press('Escape');
        await page.focus('[data-secret-library-map="01"]'); await page.keyboard.press('Enter');
        assert.equal(await page.$eval('#modal-container', function(el) { return el.classList.contains('show'); }), false, 'stale paid button cannot reopen after expiry');
        await page.evaluate(function() { StateEngine.getLibraryDay = window.qaDay; });
        await page.focus('[data-library-map="commons_first_light"]'); await page.keyboard.press('Enter');
        await page.evaluate(function() { VizAccount.getCurrentUser = function() { return 'other-qa'; }; });
        await page.focus('#map-viewer-next'); await page.keyboard.press('Space');
        assert.match(await page.$eval('#map-viewer-status', function(el) { return el.textContent; }), /Аккаунт изменился/);
        await page.keyboard.press('Escape');
        console.log('PASS day rollover/stale paid control/account switch fail closed with zero broadcasts');

        await page.reload({ waitUntil: 'load' }); await help('favorites-qa');
        assert.equal(await page.$$eval('[data-favorite-open]', function(nodes) { return nodes.length; }), 3);
        assert.ok(await page.$('[data-favorite-open="chapter2:01"]'), 'reference survives reload without entitlement');
        assert.equal(await page.$$eval('[data-secret-library-map]', function(n) { return n.length; }), 0);
        await page.focus('[data-favorite-open="chapter2:01"]'); await page.keyboard.press('Space');
        assert.equal(await page.$eval('#modal-container', function(el) { return el.classList.contains('show'); }), true, 'paid favorite opens after real reload with no chapter entitlement');
        await page.keyboard.press('Escape');
        await help('other-qa');
        assert.equal(await page.$$eval('[data-favorite-open]', function(nodes) { return nodes.length; }), 0);
        await help(null);
        assert.equal(await page.$$eval('[data-favorite-open]', function(nodes) { return nodes.length; }), 0);
        await page.focus('[data-library-map="commons_first_light"]'); await page.keyboard.press('Space');
        await page.focus('#map-favorite-toggle'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
        assert.equal(await page.$$eval('[data-favorite-open]', function(nodes) { return nodes.length; }), 1);
        await help('favorites-qa');
        assert.equal(await page.$$eval('[data-favorite-open]', function(nodes) { return nodes.length; }), 3);
        await page.evaluate(function() { Helpers.setLang('en'); HelpScreen.render(); });
        assert.equal(await page.$eval('#help-favorites-title', function(el) { return el.textContent; }), 'Favorite World Maps');
        await page.focus('[data-library-map="commons_first_light"]'); await page.keyboard.press('Enter');
        assert.equal(await page.$eval('#map-viewer-position', function(el) { return el.textContent; }), 'Map 1 of 15');
        assert.equal(await page.$eval('#map-viewer-next', function(el) { return el.textContent; }), 'Next');
        await page.keyboard.press('Escape');
        console.log('PASS real reload/account/guest isolation and English UI');

        await page.evaluate(function() {
            window.qaStorageSet = Storage.prototype.setItem;
            Storage.prototype.setItem = function(k, v) { if (k.indexOf('viz_magic_map_favorites_') === 0) throw Error('quota'); return window.qaStorageSet.call(this, k, v); };
        });
        await page.focus('[data-library-map="commons_first_light"]'); await page.keyboard.press('Enter');
        await page.focus('#map-favorite-toggle'); await page.keyboard.press('Space');
        assert.match(await page.$eval('#map-viewer-status', function(el) { return el.textContent; }), /not saved/);
        assert.equal(await page.$eval('#map-favorite-toggle', function(el) { return el.getAttribute('aria-pressed'); }), 'false');
        await page.keyboard.press('Escape');
        assert.equal(await page.$$eval('[data-favorite-open]', function(nodes) { return nodes.length; }), 3);
        await page.evaluate(function() { Storage.prototype.setItem = window.qaStorageSet; });
        var stableLive = await page.evaluate(function() { window.qaLive = document.getElementById('help-favorites-status'); return window.qaLive.getAttribute('aria-live'); });
        await page.focus('[data-favorite-remove="chapter2:01"]'); await page.keyboard.press('Space');
        assert.equal(stableLive, 'polite');
        assert.equal(await page.evaluate(function() { return window.qaLive === document.getElementById('help-favorites-status'); }), true, 'live node survives removal');
        console.log('PASS storage write failure reports unsaved state; persistent live status on removal');
        await page.evaluate(function() {
            window.qaStorageGet = Storage.prototype.getItem;
            Storage.prototype.getItem = function(k) { if (k.indexOf('viz_magic_map_favorites_') === 0) throw Error('blocked'); return window.qaStorageGet.call(this, k); };
            HelpScreen.render();
        });
        assert.match(await page.$eval('#help-favorites-status', function(el) { return el.textContent; }), /Could not read or save/);
        await page.evaluate(function() {
            Storage.prototype.getItem = window.qaStorageGet;
            localStorage.setItem('viz_magic_map_favorites_account:favorites-qa', '{'); HelpScreen.render();
        });
        assert.equal(await page.$$eval('[data-favorite-open]', function(nodes) { return nodes.length; }), 0);
        await page.focus('[data-library-map="commons_first_light"]'); await page.keyboard.press('Enter');
        await page.focus('#map-favorite-toggle'); await page.keyboard.press('Space'); await page.keyboard.press('Escape');
        assert.equal(await page.$$eval('[data-favorite-open]', function(nodes) { return nodes.length; }), 1);
        console.log('PASS browser storage read failure and corrupted JSON recovery');
        assert.deepEqual(errors, []);
        console.log('PASS console/page errors: 0; external network startup disabled; blockchain broadcasts stubbed');
    } finally { if (browser) await browser.close(); await new Promise(function(resolve) { server.close(resolve); }); }
}
run().catch(function(e) { console.error(e); process.exitCode = 1; });
