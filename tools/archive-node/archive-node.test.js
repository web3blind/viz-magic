'use strict';

var assert = require('assert');
var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var storeMod = require('./storage');
var parser = require('./parser');
var indexer = require('./indexer');
var archiveServer = require('./server');

var ACCOUNT = 'archive-mage';
var TEST_BLOCK = {
    previous: '0000000000000000000000000000000000000000',
    block_id: '0000007b00000000000000000000000000000000',
    timestamp: '2026-06-20T00:00:00',
    transactions: [{
        operations: [[
            'custom',
            {
                required_regular_auths: [ACCOUNT],
                required_active_auths: [],
                id: 'VM',
                json: JSON.stringify({ p: 'VM', v: 1, t: 'char.attune', d: { name: 'Archive Mage' } })
            }
        ], [
            'custom',
            {
                required_regular_auths: [ACCOUNT],
                required_active_auths: [],
                id: 'V',
                json: JSON.stringify({ p: 'V', t: 'post', d: { text: 'hello' } })
            }
        ], [
            'custom',
            {
                required_regular_auths: [ACCOUNT],
                required_active_auths: [],
                id: 'VM',
                json: JSON.stringify({ p: 'VM', v: 1, t: 'guild.create', d: { id: 'archive-guild', name: 'Archive Guild', tag: 'ARC', school: 'embercaster', motto: 'Old magic lives' } })
            }
        ], [
            'custom',
            {
                required_regular_auths: [ACCOUNT],
                required_active_auths: [],
                id: 'VM',
                json: JSON.stringify({ p: 'VM', v: 1, t: 'guild.listing', d: { guild_id: 'archive-guild', created_block: 123 } })
            }
        ], [
            'custom',
            {
                required_regular_auths: ['guild-member'],
                required_active_auths: [],
                id: 'VM',
                json: JSON.stringify({ p: 'VM', v: 1, t: 'guild.accept', d: { guild_id: 'archive-guild' } })
            }
        ], [
            'award',
            {
                initiator: ACCOUNT,
                receiver: 'target-mage',
                energy: 1000,
                custom_sequence: 1,
                memo: 'viz://vm/bless/target-mage'
            }
        ], [
            'award',
            {
                initiator: 'dice.id',
                receiver: 'random-user',
                energy: 2,
                custom_sequence: 0,
                memo: '🎲'
            }
        ]]
    }]
};

function listen(server) {
    return new Promise(function(resolve) {
        server.listen(0, '127.0.0.1', function() { resolve(server.address().port); });
    });
}

function close(server) {
    return new Promise(function(resolve) { server.close(resolve); });
}

function getJson(port, urlPath) {
    return new Promise(function(resolve, reject) {
        http.get({ host: '127.0.0.1', port: port, path: urlPath }, function(res) {
            var body = '';
            res.setEncoding('utf8');
            res.on('data', function(chunk) { body += chunk; });
            res.on('end', function() {
                try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
                catch (err) { reject(err); }
            });
        }).on('error', reject);
    });
}

function startRpcServer() {
    var server = http.createServer(function(req, res) {
        var body = '';
        req.on('data', function(chunk) { body += chunk; });
        req.on('end', function() {
            var payload = JSON.parse(body || '{}');
            assert.strictEqual(payload.params[1], 'get_block');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', result: TEST_BLOCK, id: payload.id }));
        });
    });
    return listen(server).then(function(port) { return { server: server, url: 'http://127.0.0.1:' + port + '/' }; });
}

async function run() {
    var events = parser.extractGameEvents(TEST_BLOCK, 123);
    assert.strictEqual(events.length, 6);
    assert.strictEqual(events[0].protocol, 'VM');
    assert.strictEqual(events[0].type, 'char.attune');
    assert.strictEqual(events[5].protocol, 'award');
    assert.strictEqual(events[5].payload.memo, 'viz://vm/bless/target-mage');
    assert.ok(events.every(function(ev) { return ev.sender !== 'dice.id'; }), 'non-game awards must not be indexed');

    var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-archive-node-test-'));
    var rpc = await startRpcServer();
    try {
        var result = await indexer.indexRange({
            config: {
                sourceNodes: [rpc.url],
                dataDir: tmp,
                startBlock: 1,
                timeoutMs: 2000,
                requestDelayMs: 0
            },
            from: 123,
            to: 123,
            once: true
        });
        assert.strictEqual(result.indexedBlocks, 1);
        assert.strictEqual(result.indexedEvents, 6);

        var server = archiveServer.createServer({ dataDir: tmp });
        var port = await listen(server);
        try {
            var health = await getJson(port, '/archive-mirror/health');
            assert.strictEqual(health.status, 200);
            assert.strictEqual(health.body.service, 'viz-magic-game-archive');

            var block = await getJson(port, '/archive-mirror/v1/block/123.json');
            assert.strictEqual(block.status, 200);
            assert.strictEqual(block.body.block.block_id, TEST_BLOCK.block_id);
            assert.strictEqual(block.body.eventCount, 6);
            assert.strictEqual(block.body.block.transactions[0].operations.length, 6);
            assert.ok(JSON.stringify(block.body.block).indexOf('dice.id') === -1, 'served block must be thinned to game operations');

            var range = await getJson(port, '/archive-mirror/v1/range?start=100&end=200&protocol=VM,V,VE,award');
            assert.strictEqual(range.status, 200);
            assert.strictEqual(range.body.count, 6);

            var blockEvents = await getJson(port, '/archive-mirror/v1/events/block/123.json');
            assert.strictEqual(blockEvents.status, 200);
            assert.strictEqual(blockEvents.body.blockNum, 123);
            assert.strictEqual(blockEvents.body.count, 6);
            assert.strictEqual(blockEvents.body.events[0].protocol, 'VM');
            assert.strictEqual(blockEvents.body.events[5].payload.memo, 'viz://vm/bless/target-mage');

            var guilds = await getJson(port, '/archive-mirror/v1/guilds');
            assert.strictEqual(guilds.status, 200);
            assert.strictEqual(guilds.body.readOnly, true);
            assert.strictEqual(guilds.body.count, 1);
            assert.strictEqual(guilds.body.guilds[0].id, 'archive-guild');
            assert.strictEqual(guilds.body.guilds[0].name, 'Archive Guild');
            assert.strictEqual(guilds.body.guilds[0].memberCount, 2);
            assert.strictEqual(guilds.body.listings[0].guild_id, 'archive-guild');

            var account = await getJson(port, '/archive-mirror/v1/account/' + ACCOUNT + '/protocol/VM/actions');
            assert.strictEqual(account.status, 200);
            assert.strictEqual(account.body.count, 3);
            assert.strictEqual(account.body.actions[0].type, 'char.attune');
        } finally {
            await close(server);
        }
    } finally {
        await close(rpc.server);
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log('PASS archive-node indexes game events and serves read-only API');
}

run().catch(function(err) {
    console.error('FAIL archive-node test: ' + (err && err.stack || err));
    process.exit(1);
});
