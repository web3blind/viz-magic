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
            StateEngine.processLibraryUnlockResult('living-elements-qa', 1, StateEngine.getLibraryDay(), 'chapter7');
            HelpScreen.render();
            var article = document.querySelector('.help-living-elements-library');
            var links = Array.prototype.slice.call(article.querySelectorAll('.help-living-elements-library-link'));
            var awakening = document.getElementById('help-living-elements-library-awakening-title');
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
                secondGroupLabelledBy: article.querySelectorAll('[role="group"]')[1].getAttribute('aria-labelledby')
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
        console.log('PASS Living Elements library mobile layout and screen-reader grouping smoke');
    } finally {
        if (browser) await browser.close();
        await new Promise(function(resolve) { server.close(resolve); });
    }
}

run().catch(function(err) {
    console.error('FAIL Living Elements library mobile layout and screen-reader grouping smoke: ' + (err && err.stack || err));
    process.exit(1);
});
