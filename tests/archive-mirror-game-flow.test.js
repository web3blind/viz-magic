/**
 * Archive mirror integration smoke — proves the local mirror path can fetch a
 * block, parse VM operations, and apply them through the real game state engine.
 */
var http = require('http');
var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

var APP_DIR = path.join(__dirname, '..', 'app');
var APP_PORT = 8201;
var MIRROR_PORT = 8202;
var TEST_BLOCK_NUM = 1234567;
var TEST_ACCOUNT = '__archive_mirror_player__';
var MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

var mirrorBlock = {
    previous: '0000000000000000000000000000000000000000',
    block_id: '0012d68700000000000000000000000000000000',
    timestamp: '2026-06-20T00:00:00',
    transactions: [{
        operations: [[
            'custom',
            {
                required_regular_auths: [TEST_ACCOUNT],
                required_active_auths: [],
                id: 'VM',
                json: JSON.stringify({
                    p: 'VM',
                    v: 1,
                    b: 0,
                    t: 'char.attune',
                    d: {
                        class: 'embercaster',
                        name: 'Archive Mage'
                    }
                })
            }
        ]]
    }]
};

function startAppServer() {
    return new Promise(function(resolve) {
        var srv = http.createServer(function(req, res) {
            var url = req.url.split('?')[0];
            if (url === '/') url = '/index.html';
            var filePath = path.join(APP_DIR, url);
            var ext = path.extname(filePath);
            fs.readFile(filePath, function(err, data) {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
                res.end(data);
            });
        });
        srv.listen(APP_PORT, function() { resolve(srv); });
    });
}

function startMirrorServer() {
    return new Promise(function(resolve) {
        var srv = http.createServer(function(req, res) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'content-type');
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }
            if (req.url === '/v1/block/' + TEST_BLOCK_NUM + '.json') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ block: mirrorBlock }));
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'not_found' }));
        });
        srv.listen(MIRROR_PORT, function() { resolve(srv); });
    });
}

async function run() {
    var appServer = await startAppServer();
    var mirrorServer = await startMirrorServer();
    var browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        });
        var page = await browser.newPage();
        await page.goto('http://localhost:' + APP_PORT + '/', {
            waitUntil: 'networkidle0',
            timeout: 15000
        });

        var result = await page.evaluate(function(blockNum, account, mirrorUrl) {
            return new Promise(function(resolve) {
                VizMagicConfig.HISTORY_ARCHIVE_MIRRORS.push(mirrorUrl);
                var originalGetBlock = viz.api.getBlock;
                viz.api.getBlock = function(_blockNum, callback) {
                    callback(new Error('forced rpc miss for archive mirror test'));
                };

                HistorySource.getBlock(blockNum, function(err, block) {
                    viz.api.getBlock = originalGetBlock;
                    if (err || !block) {
                        resolve({ ok: false, stage: 'history-source', error: err && err.message });
                        return;
                    }

                    var state = StateEngine.getState();
                    delete state.characters[account];
                    delete state.inventories[account];
                    var processed = BlockProcessor.processBlock(block, blockNum);
                    var events = StateEngine.processBlock(processed);
                    var character = state.characters[account];
                    delete state.characters[account];
                    delete state.inventories[account];

                    resolve({
                        ok: !!character && character.name === 'Archive Mage',
                        stage: 'game-state',
                        vmActions: processed.vmActions.length,
                        eventCount: events.length,
                        characterName: character && character.name,
                        headBlock: state.headBlock
                    });
                });
            });
        }, TEST_BLOCK_NUM, TEST_ACCOUNT, 'http://localhost:' + MIRROR_PORT + '/v1/block/{block}.json');

        if (!result.ok) {
            console.error('FAIL archive mirror block reaches game state: ' + JSON.stringify(result));
            process.exitCode = 1;
        } else {
            console.log('PASS archive mirror block reaches game state');
            console.log('  vmActions=' + result.vmActions + ' events=' + result.eventCount + ' character=' + result.characterName);
        }
    } finally {
        if (browser) await browser.close();
        appServer.close();
        mirrorServer.close();
    }
}

run().catch(function(err) {
    console.error('FAIL archive mirror game flow crashed: ' + (err && err.stack || err));
    process.exit(1);
});
