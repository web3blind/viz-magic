'use strict';

var assert = require('assert');
var http = require('http');
var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

var APP_DIR = path.join(__dirname, '..', 'app');
var APP_PORT = 8217;
var MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

function startAppServer() {
    return new Promise(function(resolve) {
        var server = http.createServer(function(req, res) {
            var url = req.url.split('?')[0];
            if (url === '/') url = '/index.html';
            fs.readFile(path.join(APP_DIR, url), function(err, data) {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(url)] || 'application/octet-stream' });
                res.end(data);
            });
        });
        server.listen(APP_PORT, '127.0.0.1', function() { resolve(server); });
    });
}

async function run() {
    var server = await startAppServer();
    var browser;
    try {
        browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', protocolTimeout: 60000, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-features=ServiceWorker'] });
        var page = await browser.newPage();
        var browserErrors = [];
        page.on('pageerror', function(err) { browserErrors.push(String(err && err.message || err)); });
        page.on('console', function(message) {
            if (message.type() === 'error') browserErrors.push(message.text());
        });
        await page.setCacheEnabled(false);
        await page.evaluateOnNewDocument(function() {
            sessionStorage.setItem('viz_magic_sw_reload_v123', '1');
        });
        await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 1 });
        await page.goto('http://127.0.0.1:' + APP_PORT + '/?living-elements=qa', { waitUntil: 'domcontentloaded', timeout: 15000 });
        var result = await page.evaluate(async function() {
            Helpers.setLang('ru');
            VizAccount.getCurrentUser = function() { return 'living-elements-qa'; };
            HelpScreen.render();
            document.getElementById('screen-help').classList.add('active');
            document.getElementById('screen-help').setAttribute('aria-hidden', 'false');
            var lockedArticle = document.querySelector('.help-living-elements-library');
            var locked = {
                hasUnlockButton: !!document.getElementById('help-living-elements-library-unlock'),
                mapLinkCount: lockedArticle.querySelectorAll('.help-living-elements-library-link').length,
                statusRole: document.getElementById('help-living-elements-library-status').getAttribute('role'),
                statusLive: document.getElementById('help-living-elements-library-status').getAttribute('aria-live')
            };
            var lockedForestArticle = document.querySelector('.help-living-forest-library');
            var lockedForest = {
                hasUnlockButton: !!document.getElementById('help-living-forest-library-unlock'),
                mapLinkCount: lockedForestArticle.querySelectorAll('.help-living-forest-library-link').length,
                statusRole: document.getElementById('help-living-forest-library-status').getAttribute('role'),
                statusLive: document.getElementById('help-living-forest-library-status').getAttribute('aria-live')
            };
            var originalFindAccountAction = HistorySource.findAccountAction;
            var originalGetBlock = HistorySource.getBlock;
            var originalProcessBlock = BlockProcessor.processBlock;
            var originalVerifyProof = StateEngine.verifyLibraryUnlockProof;
            var attempts = {};
            var pendingChapter = '';
            var paidRecoveryChecks = [];
            HistorySource.findAccountAction = function(user, protocol, actionType, callback, predicate) {
                var chapters = ['chapter2', 'chapter4', 'chapter6', 'chapter8'];
                var chapter = '';
                for (var i = 0; i < chapters.length; i++) {
                    if (predicate({ payload: { d: { chapter: chapters[i], day: StateEngine.getLibraryDay() } } })) {
                        chapter = chapters[i];
                        break;
                    }
                }
                attempts[chapter] = Number(attempts[chapter] || 0) + 1;
                if (attempts[chapter] < 3) {
                    callback(new Error('transient-archive-failure'));
                    return;
                }
                pendingChapter = chapter;
                callback(null, { blockNum: 700 + chapters.indexOf(chapter) });
            };
            HistorySource.getBlock = function(blockNum, callback) { callback(null, { block_num: blockNum }); };
            BlockProcessor.processBlock = function() {
                return {
                    vmActions: [{ sender: 'living-elements-qa', action: { type: VizMagicConfig.ACTION_TYPES.LIBRARY_UNLOCK, data: { chapter: pendingChapter, day: StateEngine.getLibraryDay() } } }]
                };
            };
            StateEngine.verifyLibraryUnlockProof = function() { return true; };

            async function verifyRecoveredUnlock(buttonId, articleSelector, linkSelector, titleId, chapter) {
                document.getElementById(buttonId).click();
                var deadline = Date.now() + 5000;
                while (Date.now() < deadline && document.querySelectorAll(articleSelector + ' ' + linkSelector).length !== 15) {
                    await new Promise(function(resolve) { setTimeout(resolve, 50); });
                }
                paidRecoveryChecks.push({
                    chapter: chapter,
                    attempts: attempts[chapter],
                    mapLinkCount: document.querySelectorAll(articleSelector + ' ' + linkSelector).length,
                    unlockButtonGone: !document.getElementById(buttonId),
                    focusedId: document.activeElement && document.activeElement.id
                });
            }

            await verifyRecoveredUnlock('help-secret-library-unlock', '.help-secret-library', '.help-secret-library-link', 'help-secret-library-title', 'chapter2');
            await verifyRecoveredUnlock('help-middle-library-unlock', '.help-middle-library', '.help-middle-library-link', 'help-middle-library-title', 'chapter4');
            await verifyRecoveredUnlock('help-living-nature-library-unlock', '.help-living-nature-library', '.help-living-nature-library-link', 'help-living-nature-library-title', 'chapter6');
            await verifyRecoveredUnlock('help-living-forest-library-unlock', '.help-living-forest-library', '.help-living-forest-library-link', 'help-living-forest-library-title', 'chapter8');
            HistorySource.findAccountAction = originalFindAccountAction;
            HistorySource.getBlock = originalGetBlock;
            BlockProcessor.processBlock = originalProcessBlock;
            StateEngine.verifyLibraryUnlockProof = originalVerifyProof;
            ['chapter2', 'chapter3', 'chapter4', 'chapter5', 'chapter6', 'chapter7', 'chapter8'].forEach(function(chapter, index) {
                StateEngine.processLibraryUnlockResult('living-elements-qa', index + 1, StateEngine.getLibraryDay(), chapter);
            });
            HelpScreen.render();
            App.navigateTo('help');
            var article = document.querySelector('.help-living-elements-library');
            var links = Array.prototype.slice.call(article.querySelectorAll('.help-living-elements-library-link'));
            var dayOneLinks = Array.prototype.slice.call(document.querySelectorAll('[data-library-map]'));
            var awakening = document.getElementById('help-living-elements-library-awakening-title');
            var chapterSpecs = [
                ['.help-secret-library', '.help-secret-library-link', 'help-secret-library-title'],
                ['.help-unknown-library', '.help-unknown-library-link', 'help-unknown-library-title'],
                ['.help-middle-library', '.help-middle-library-link', 'help-middle-library-title'],
                ['.help-attraction-library', '.help-attraction-library-link', 'help-attraction-library-title'],
                ['.help-living-nature-library', '.help-living-nature-library-link', 'help-living-nature-library-title'],
                ['.help-living-elements-library', '.help-living-elements-library-link', 'help-living-elements-library-title'],
                ['.help-living-forest-library', '.help-living-forest-library-link', 'help-living-forest-library-title']
            ];
            var chapterOpenChecks = [];
            chapterSpecs.forEach(function(spec) {
                var chapterElement = document.querySelector(spec[0]);
                var chapterLinks = chapterElement.querySelectorAll(spec[1]);
                [0, chapterLinks.length - 1].forEach(function(linkIndex) {
                    var chapterLink = chapterLinks[linkIndex];
                    chapterLink.focus();
                    chapterLink.click();
                    var chapterModal = document.getElementById('modal-container');
                    var chapterImage = document.getElementById('help-library-map-image');
                    var chapterTitle = chapterModal.querySelector('.lore-map-title');
                    chapterOpenChecks.push({
                        chapter: document.getElementById(spec[2]).textContent.trim(),
                        expectedNumber: linkIndex + 1,
                        opened: chapterModal.classList.contains('show'),
                        title: chapterTitle && chapterTitle.textContent.trim(),
                        imageSrc: chapterImage && chapterImage.getAttribute('src'),
                        imageAlt: chapterImage && chapterImage.getAttribute('alt'),
                        focusedId: document.activeElement && document.activeElement.id
                    });
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    chapterOpenChecks[chapterOpenChecks.length - 1].closedByEscape = !chapterModal.classList.contains('show');
                    chapterOpenChecks[chapterOpenChecks.length - 1].focusRestored = document.activeElement === chapterLink;
                });
            });
            var seventhLivingNatureLink = document.querySelectorAll('.help-living-nature-library-link')[6];
            seventhLivingNatureLink.focus();
            seventhLivingNatureLink.click();
            var mapModal = document.getElementById('modal-container');
            var mapImage = document.getElementById('help-library-map-image');
            var mapTitle = document.querySelector('.help-living-nature-library-map-card .lore-map-title');
            var mapText = document.querySelector('.help-living-nature-library-map-card .help-library-map-text');
            var seventhMapModal = {
                modalRole: mapModal.getAttribute('role'),
                title: mapTitle.textContent.trim(),
                alt: mapImage.getAttribute('alt'),
                src: mapImage.getAttribute('src'),
                text: mapText.textContent.trim(),
                imageFitsViewport: mapImage.getBoundingClientRect().width <= window.innerWidth,
                focusedId: document.activeElement && document.activeElement.id
            };
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            seventhMapModal.closedByEscape = !mapModal.classList.contains('show');
            seventhMapModal.focusRestored = document.activeElement === seventhLivingNatureLink;
            return {
                locked: locked,
                lockedForest: lockedForest,
                paidRecoveryChecks: paidRecoveryChecks,
                dayOneLabels: dayOneLinks.map(function(link) { return link.textContent.trim(); }),
                count: links.length,
                labels: links.map(function(link) { return link.textContent.trim(); }),
                dividerCount: article.querySelectorAll('hr.help-unknown-library-divider').length,
                awakeningText: awakening.textContent.trim(),
                awakeningFontWeight: getComputedStyle(awakening).fontWeight,
                articleFitsViewport: article.getBoundingClientRect().width <= window.innerWidth && article.scrollWidth <= article.clientWidth + 1,
                linksFitArticle: links.every(function(link) { return link.scrollWidth <= link.clientWidth + 1; }),
                firstGroupLabel: article.querySelector('[role="group"]').getAttribute('aria-label'),
                secondGroupLabelledBy: article.querySelectorAll('[role="group"]')[1].getAttribute('aria-labelledby'),
                chapterOpenChecks: chapterOpenChecks,
                seventhMapModal: seventhMapModal,
                paidChapters: chapterSpecs.map(function(spec) {
                    var chapterArticle = document.querySelector(spec[0]);
                    var chapterLinks = Array.prototype.slice.call(chapterArticle.querySelectorAll(spec[1]));
                    return {
                        title: document.getElementById(spec[2]).textContent.trim(),
                        count: chapterLinks.length,
                        numbers: chapterLinks.map(function(link) { return Number(link.textContent.split('.')[0]); }),
                        articleFitsViewport: chapterArticle.getBoundingClientRect().width <= window.innerWidth && chapterArticle.scrollWidth <= chapterArticle.clientWidth + 1,
                        linksFitArticle: chapterLinks.every(function(link) { return link.scrollWidth <= link.clientWidth + 1; })
                    };
                })
            };
        });

        assert.strictEqual(result.locked.hasUnlockButton, true, 'locked chapter should expose its unlock button');
        assert.strictEqual(result.locked.mapLinkCount, 0, 'locked chapter should expose no paid map links');
        assert.strictEqual(result.locked.statusRole, 'status', 'locked chapter should expose a status region');
        assert.strictEqual(result.locked.statusLive, 'polite', 'locked chapter status should announce politely');
        assert.strictEqual(result.lockedForest.hasUnlockButton, true, 'locked Living Forest chapter should expose its unlock button');
        assert.strictEqual(result.lockedForest.mapLinkCount, 0, 'locked Living Forest chapter should expose no paid map links');
        assert.strictEqual(result.lockedForest.statusRole, 'status', 'locked Living Forest chapter should expose a status region');
        assert.strictEqual(result.lockedForest.statusLive, 'polite', 'locked Living Forest status should announce politely');
        assert.deepStrictEqual(result.dayOneLabels.map(function(label) { return Number(label.split('.')[0]); }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 'day-one Magical Library should visibly number all 15 map buttons');
        result.paidRecoveryChecks.forEach(function(check) {
            assert.strictEqual(check.attempts, 3, check.chapter + ' should retry two transient archive failures before succeeding');
            assert.strictEqual(check.mapLinkCount, 15, check.chapter + ' should open all 15 maps after recovered proof verification');
            assert.strictEqual(check.unlockButtonGone, true, check.chapter + ' should not leave an aria-busy payment button after access opens');

        });
        assert.strictEqual(result.count, 15, 'all 15 map links should render');
        assert.deepStrictEqual(result.labels.map(function(label) { return Number(label.split('.')[0]); }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 'visible numbering should be consecutive');
        assert.ok(result.labels.every(function(label) { return label.indexOf('. ') > 0 && label.split('. ')[1].length > 0; }), 'every numbered link should preserve an individual title');
        assert.strictEqual(result.dividerCount, 1, 'one plain divider should follow the first three maps');
        assert.strictEqual(result.awakeningText, 'Пробуждение', 'Awakening heading should be visible');
        assert.strictEqual(result.awakeningFontWeight, '400', 'Awakening heading should use regular text weight');
        assert.strictEqual(result.firstGroupLabel, 'Первые три карты', 'the first map group should have a screen-reader label');
        assert.strictEqual(result.secondGroupLabelledBy, 'help-living-elements-library-awakening-title', 'Awakening should label the second group');
        assert.strictEqual(result.articleFitsViewport, true, 'chapter should not overflow the 360px viewport');
        assert.strictEqual(result.linksFitArticle, true, 'long numbered titles should fit their buttons');
        assert.deepStrictEqual(result.paidChapters.map(function(chapter) { return chapter.title; }), [
            'Тайные Карты Мира - комната вторая',
            'Неизвестные карты Мира - глава третья',
            'Срединные карты Мира - переулок четвёртый',
            'Карты Притяжения Мира - свиток пятый',
            'Карты живой природы Мира - ветка шестая',
            'Карты живых Стихий Мира - отголосок седьмой',
            'Карты живого Леса - тропа восьмая'
        ], 'all paid chapter headings should use the unified hyphenated titles');
        result.paidChapters.forEach(function(chapter) {
            assert.strictEqual(chapter.count, 15, chapter.title + ' should render exactly 15 links');
            assert.deepStrictEqual(chapter.numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], chapter.title + ' should keep consecutive visible numbering across groups');
            assert.strictEqual(chapter.articleFitsViewport, true, chapter.title + ' should fit the 360px viewport');
            assert.strictEqual(chapter.linksFitArticle, true, chapter.title + ' numbered links should fit their buttons');
        });
        result.chapterOpenChecks.forEach(function(check) {
            assert.strictEqual(check.opened, true, check.chapter + ' map ' + check.expectedNumber + ' should open');
            assert.ok(check.title.indexOf(check.expectedNumber + '. ') !== -1, check.chapter + ' modal should preserve the visible ordinal; got: ' + check.title);
            assert.ok(/\.jpg\?v=/.test(check.imageSrc), check.chapter + ' modal should request its versioned map image');
            assert.ok(check.imageAlt && check.imageAlt.length > 0, check.chapter + ' map image should have a localized alternative');
            assert.strictEqual(check.focusedId, 'help-library-zoom-toggle', check.chapter + ' modal should move focus to its first action');
            assert.strictEqual(check.closedByEscape, true, check.chapter + ' modal should close with Escape');
            assert.strictEqual(check.focusRestored, true, check.chapter + ' modal should restore focus to its opener');
        });

        var seventhMap = result.seventhMapModal;
        assert.ok(seventhMap.modalRole === 'dialog' || seventhMap.modalRole === 'alertdialog', 'map modal should expose dialog semantics');
        assert.ok(seventhMap.title.indexOf('7. Подземное море четырнадцати огней') !== -1, 'keyboard-opened modal should expose the replacement title and ordinal');
        assert.ok(seventhMap.alt.indexOf('Подземное море четырнадцати огней') !== -1, 'replacement image should have a localized non-empty alternative');
        assert.ok(seventhMap.src.indexOf('living-nature-map-07.jpg?v=20260913b') !== -1, 'modal should request the cache-busted replacement asset');
        assert.ok(seventhMap.text.indexOf('тёмного звёздного портала') !== -1 && seventhMap.text.indexOf('сияющего кристального портала') !== -1, 'visible accessible description should identify the entrance and finish');
        assert.strictEqual(seventhMap.imageFitsViewport, true, 'portrait replacement should not overflow the 360px viewport');
        assert.strictEqual(seventhMap.focusedId, 'help-library-zoom-toggle', 'map modal should move keyboard focus to its first action');
        assert.strictEqual(seventhMap.closedByEscape, true, 'Escape should close the replacement map dialog');
        assert.strictEqual(seventhMap.focusRestored, true, 'closing the replacement map with Escape should restore focus to link 7');
        assert.deepStrictEqual(browserErrors, [], 'browser console and page should remain free of JavaScript errors');
        console.log('PASS all paid libraries mobile numbering, titles, and screen-reader grouping smoke');
    } finally {
        if (browser) await browser.close();
        await new Promise(function(resolve) { server.close(resolve); });
    }
}

run().catch(function(err) {
    console.error('FAIL all paid libraries mobile numbering, titles, and screen-reader grouping smoke: ' + (err && err.stack || err));
    process.exit(1);
});
