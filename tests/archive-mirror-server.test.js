/**
 * Archive mirror service regression tests.
 */
'use strict';

var assert = require('assert');
var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var mirror = require('../tools/archive-mirror-server');

var TEST_BLOCK = {
    previous: '0000000000000000000000000000000000000000',
    block_id: '0012d68700000000000000000000000000000000',
    timestamp: '2026-06-20T00:00:00',
    transactions: []
};

function test(name, fn) {
    Promise.resolve().then(fn).then(function() {
        console.log('PASS ' + name);
    }).catch(function(err) {
        console.error('FAIL ' + name + ': ' + (err && err.stack || err));
        process.exitCode = 1;
    });
}

function listen(server) {
    return new Promise(function(resolve) {
        server.listen(0, '127.0.0.1', function() {
            resolve(server.address().port);
        });
    });
}

function close(server) {
    return new Promise(function(resolve) { server.close(resolve); });
}

function getJson(port, urlPath) {
    return new Promise(function(resolve, reject) {
        http.get({ host: '127.0.0.1', port: port, path: urlPath }, function(res) {
            var chunks = '';
            res.setEncoding('utf8');
            res.on('data', function(chunk) { chunks += chunk; });
            res.on('end', function() {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(chunks), headers: res.headers });
                } catch (err) {
                    reject(err);
                }
            });
        }).on('error', reject);
    });
}

function startRpcServer() {
    var calls = 0;
    var server = http.createServer(function(req, res) {
        calls += 1;
        var body = '';
        req.on('data', function(chunk) { body += chunk; });
        req.on('end', function() {
            var payload = JSON.parse(body || '{}');
            assert.strictEqual(payload.method, 'call');
            assert.strictEqual(payload.params[1], 'get_block');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', result: TEST_BLOCK, id: payload.id }));
        });
    });
    return listen(server).then(function(port) {
        return { server: server, url: 'http://127.0.0.1:' + port + '/', calls: function() { return calls; } };
    });
}

test('extracts supported public and proxied block paths', function() {
    assert.strictEqual(mirror.extractBlockNum('/123.json'), 123);
    assert.strictEqual(mirror.extractBlockNum('/archive-mirror/123.json'), 123);
    assert.strictEqual(mirror.extractBlockNum('/v1/block/123.json'), 123);
    assert.strictEqual(mirror.extractBlockNum('/archive-mirror/v1/block/123.json'), 123);
    assert.strictEqual(mirror.extractBlockNum('/archive-mirror/nope.json'), 0);
});

test('serves health, fetches block once, then uses disk cache', async function() {
    var rpc = await startRpcServer();
    var cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-mirror-test-'));
    var server = mirror.createServer({ cacheDir: cacheDir, nodes: [rpc.url], timeoutMs: 2000 });
    var port = await listen(server);
    try {
        var health = await getJson(port, '/archive-mirror/health');
        assert.strictEqual(health.status, 200);
        assert.strictEqual(health.body.ok, true);

        var first = await getJson(port, '/archive-mirror/1234567.json');
        assert.strictEqual(first.status, 200);
        assert.strictEqual(first.body.source, 'rpc');
        assert.strictEqual(first.body.block.block_id, TEST_BLOCK.block_id);
        assert.strictEqual(rpc.calls(), 1);

        var second = await getJson(port, '/v1/block/1234567.json');
        assert.strictEqual(second.status, 200);
        assert.strictEqual(second.body.source, 'cache');
        assert.strictEqual(rpc.calls(), 1);
    } finally {
        await close(server);
        await close(rpc.server);
        fs.rmSync(cacheDir, { recursive: true, force: true });
    }
});

process.on('beforeExit', function() {
    if (process.exitCode) process.exit(process.exitCode);
});
