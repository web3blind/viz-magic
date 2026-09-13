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
        browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
        var page = await browser.newPage();
        await page.evaluateOnNewDocument(function() {
            sessionStorage.setItem('viz_magic_sw_reload_v123', '1');
        });
        await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 1 });
        await page.goto('http://127.0.0.1:' + APP_PORT + '/?living-elements=qa', { waitUntil: 'domcontentloaded', timeout: 15000 });

        var result = await page.evaluate(function() {
            Helpers.setLang('ru');
            VizAccount.getCurrentUser = function() { return 'living-elements-qa'; };
            HelpScreen.render();
            var lockedArticle = document.querySelector('.help-living-elements-library');
            var locked = {
                hasUnlockButton: !!document.getElementById('help-living-elements-library-unlock'),
                mapLinkCount: lockedArticle.querySelectorAll('.help-living-elements-library-link').length,
                statusRole: document.getElementById('help-living-elements-library-status').getAttribute('role'),
                statusLive: document.getElementById('help-living-elements-library-status').getAttribute('aria-live')
            };
            ['chapter2', 'chapter3', 'chapter4', 'chapter5', 'chapter6', 'chapter7'].forEach(function(chapter, index) {
                StateEngine.processLibraryUnlockResult('living-elements-qa', index + 1, StateEngine.getLibraryDay(), chapter);
            });
            HelpScreen.render();
            App.navigateTo('help');
            var article = document.querySelector('.help-living-elements-library');
            var links = Array.prototype.slice.call(article.querySelectorAll('.help-living-elements-library-link'));
            var awakening = document.getElementById('help-living-elements-library-awakening-title');
            var chapterSpecs = [
                ['.help-secret-library', '.help-secret-library-link', 'help-secret-library-title'],
                ['.help-unknown-library', '.help-unknown-library-link', 'help-unknown-library-title'],
                ['.help-middle-library', '.help-middle-library-link', 'help-middle-library-title'],
                ['.help-attraction-library', '.help-attraction-library-link', 'help-attraction-library-title'],
                ['.help-living-nature-library', '.help-living-nature-library-link', 'help-living-nature-library-title'],
                ['.help-living-elements-library', '.help-living-elements-library-link', 'help-living-elements-library-title']
            ];
            return {
                locked: locked,
                count: links.length,
                labels: links.map(function(link) { return link.textContent.trim(); }),
                dividerCount: article.querySelectorAll('hr.help-unknown-library-divider').length,
                awakeningText: awakening.textContent.trim(),
                awakeningFontWeight: getComputedStyle(awakening).fontWeight,
                articleFitsViewport: article.getBoundingClientRect().width <= window.innerWidth && article.scrollWidth <= article.clientWidth + 1,
                linksFitArticle: links.every(function(link) { return link.scrollWidth <= link.clientWidth + 1; }),
                firstGroupLabel: article.querySelector('[role="group"]').getAttribute('aria-label'),
                secondGroupLabelledBy: article.querySelectorAll('[role="group"]')[1].getAttribute('aria-labelledby'),
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
            'Карты живых Стихий Мира - отголосок седьмой'
        ], 'all paid chapter headings should use the unified hyphenated titles');
        result.paidChapters.forEach(function(chapter) {
            assert.strictEqual(chapter.count, 15, chapter.title + ' should render exactly 15 links');
            assert.deepStrictEqual(chapter.numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], chapter.title + ' should keep consecutive visible numbering across groups');
            assert.strictEqual(chapter.articleFitsViewport, true, chapter.title + ' should fit the 360px viewport');
            assert.strictEqual(chapter.linksFitArticle, true, chapter.title + ' numbered links should fit their buttons');
        });
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
