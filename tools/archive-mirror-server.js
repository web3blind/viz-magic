#!/usr/bin/env node
/**
 * Viz Magic archive mirror service.
 *
 * Lightweight read-only HTTP service for HistorySource archive mirror requests.
 * It keeps RAM low by fetching one block at a time from public VIZ RPC nodes and
 * caching successful block JSON on disk. It never accepts private keys or writes
 * gameplay state.
 *
 * Routes:
 *   GET /health
 *   GET /archive-mirror/health
 *   GET /:block.json
 *   GET /archive-mirror/:block.json
 *   GET /v1/block/:block.json
 *   GET /archive-mirror/v1/block/:block.json
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

var DEFAULT_NODES = [
    'https://api.viz.world/',
    'https://node.viz.cx/'
];

function parseList(value, fallback) {
    if (!value) return fallback.slice();
    var list = String(value).split(',').map(function(item) { return item.trim(); }).filter(Boolean);
    return list.length ? list : fallback.slice();
}

function json(res, status, payload, extraHeaders) {
    var headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Cache-Control': status === 200 ? 'public, max-age=31536000, immutable' : 'no-store'
    };
    Object.keys(extraHeaders || {}).forEach(function(key) { headers[key] = extraHeaders[key]; });
    res.writeHead(status, headers);
    res.end(JSON.stringify(payload));
}

function safeBlockNum(raw) {
    var n = Number(raw);
    if (!isFinite(n) || Math.floor(n) !== n || n <= 0) return 0;
    if (n > 2147483647) return 0;
    return n;
}

function extractBlockNum(urlPath) {
    var clean = String(urlPath || '').split('?')[0].replace(/\/+/g, '/');
    var patterns = [
        /^\/(\d+)\.json$/,
        /^\/archive-mirror\/(\d+)\.json$/,
        /^\/v1\/block\/(\d+)\.json$/,
        /^\/archive-mirror\/v1\/block\/(\d+)\.json$/
    ];
    for (var i = 0; i < patterns.length; i += 1) {
        var m = clean.match(patterns[i]);
        if (m) return safeBlockNum(m[1]);
    }
    return 0;
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function blockCachePath(cacheDir, blockNum) {
    return path.join(cacheDir, String(blockNum) + '.json');
}

function readCachedBlock(cacheDir, blockNum) {
    var file = blockCachePath(cacheDir, blockNum);
    try {
        var parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (parsed && parsed.block && parsed.block.transactions) return parsed.block;
    } catch (err) {}
    return null;
}

function writeCachedBlock(cacheDir, blockNum, block) {
    try {
        ensureDir(cacheDir);
        var tmp = blockCachePath(cacheDir, blockNum) + '.tmp-' + process.pid;
        fs.writeFileSync(tmp, JSON.stringify({ block: block }), 'utf8');
        fs.renameSync(tmp, blockCachePath(cacheDir, blockNum));
    } catch (err) {
        // Cache write failure should not break reads.
    }
}

function normalizeRpcUrl(url) {
    url = String(url || '').trim();
    return url || '';
}

function rpcFetchBlock(nodeUrl, blockNum, timeoutMs) {
    return new Promise(function(resolve, reject) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = setTimeout(function() {
            if (controller) controller.abort();
        }, timeoutMs || 8000);
        var body = JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            params: ['database_api', 'get_block', [blockNum]],
            id: 1
        });
        fetch(nodeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
            signal: controller ? controller.signal : undefined
        }).then(function(resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
        }).then(function(payload) {
            clearTimeout(timer);
            var block = payload && (payload.result || (payload.data && payload.data.block) || payload.block);
            if (!block || !block.transactions) throw new Error('empty block');
            resolve(block);
        }).catch(function(err) {
            clearTimeout(timer);
            reject(err);
        });
    });
}

async function fetchBlockFromNodes(nodes, blockNum, timeoutMs) {
    var lastErr = null;
    for (var i = 0; i < nodes.length; i += 1) {
        var node = normalizeRpcUrl(nodes[i]);
        if (!node) continue;
        try {
            var block = await rpcFetchBlock(node, blockNum, timeoutMs);
            return { block: block, node: node };
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('no nodes configured');
}

function createServer(options) {
    options = options || {};
    var startedAt = Date.now();
    var cacheDir = options.cacheDir || process.env.ARCHIVE_MIRROR_CACHE_DIR || path.join(process.cwd(), 'data', 'archive-mirror-cache');
    var nodes = options.nodes || parseList(process.env.ARCHIVE_MIRROR_NODES, DEFAULT_NODES);
    var timeoutMs = Number(options.timeoutMs || process.env.ARCHIVE_MIRROR_TIMEOUT_MS || 8000);
    ensureDir(cacheDir);

    return http.createServer(async function(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        if (req.method !== 'GET') {
            json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, OPTIONS' });
            return;
        }

        var cleanPath = String(req.url || '').split('?')[0].replace(/\/+/g, '/');
        if (cleanPath === '/health' || cleanPath === '/archive-mirror/health') {
            json(res, 200, {
                ok: true,
                service: 'viz-magic-archive-mirror',
                uptimeSec: Math.round((Date.now() - startedAt) / 1000),
                cacheDir: cacheDir,
                nodes: nodes.length
            }, { 'Cache-Control': 'no-store' });
            return;
        }

        var blockNum = extractBlockNum(req.url);
        if (!blockNum) {
            json(res, 404, { error: 'not_found' }, { 'Cache-Control': 'no-store' });
            return;
        }

        var cached = readCachedBlock(cacheDir, blockNum);
        if (cached) {
            json(res, 200, { block: cached, source: 'cache' });
            return;
        }

        try {
            var fetched = await fetchBlockFromNodes(nodes, blockNum, timeoutMs);
            writeCachedBlock(cacheDir, blockNum, fetched.block);
            json(res, 200, { block: fetched.block, source: 'rpc', node: fetched.node });
        } catch (err) {
            json(res, 502, { error: 'block_unavailable', message: err && err.message || String(err) }, { 'Cache-Control': 'no-store' });
        }
    });
}

if (require.main === module) {
    var port = Number(process.env.PORT || process.env.ARCHIVE_MIRROR_PORT || 3007);
    var host = process.env.HOST || '127.0.0.1';
    var server = createServer();
    server.listen(port, host, function() {
        console.log('viz-magic archive mirror listening on http://' + host + ':' + port);
    });
}

module.exports = {
    createServer: createServer,
    extractBlockNum: extractBlockNum,
    safeBlockNum: safeBlockNum,
    fetchBlockFromNodes: fetchBlockFromNodes
};
