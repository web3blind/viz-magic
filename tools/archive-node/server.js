'use strict';

var http = require('http');
var url = require('url');
var path = require('path');
var storeMod = require('./storage');
var indexer = require('./indexer');

function json(res, status, payload, extraHeaders) {
    var headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Cache-Control': status === 200 ? 'public, max-age=30' : 'no-store'
    };
    Object.keys(extraHeaders || {}).forEach(function(key) { headers[key] = extraHeaders[key]; });
    res.writeHead(status, headers);
    res.end(JSON.stringify(payload));
}

function safeNum(value, fallback) {
    var n = Number(value);
    if (!isFinite(n) || Math.floor(n) !== n) return fallback;
    return n;
}

function pathParts(reqUrl) {
    return url.parse(reqUrl, true).pathname.replace(/\/+/g, '/').split('/').filter(Boolean);
}

function createServer(options) {
    options = options || {};
    var startedAt = Date.now();
    var cfg = options.config || indexer.loadConfig(options.configPath || path.join(__dirname, 'config.json'));
    if (options.dataDir) cfg.dataDir = options.dataDir;
    var archive = options.store || new storeMod.ArchiveStore(cfg.dataDir);

    return http.createServer(function(req, res) {
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

        var parsedUrl = url.parse(req.url, true);
        var parts = pathParts(req.url);
        if (parts[0] === 'archive-mirror') parts.shift();

        if (parts.length === 1 && parts[0] === 'health') {
            var status = archive.getStatus();
            json(res, 200, {
                ok: true,
                service: 'viz-magic-game-archive',
                uptimeSec: Math.round((Date.now() - startedAt) / 1000),
                dataDir: cfg.dataDir,
                lastIndexedBlock: status.lastIndexedBlock || 0,
                cursorUpdatedAt: status.cursorUpdatedAt || null,
                storage: 'flat-file-jsonl',
                readOnly: true
            }, { 'Cache-Control': 'no-store' });
            return;
        }

        if (parts.length === 2 && parts[0] === 'v1' && parts[1] === 'status') {
            var st = archive.getStatus();
            st.ok = st.ok !== false;
            st.service = 'viz-magic-game-archive';
            st.readOnly = true;
            st.storage = 'flat-file-jsonl';
            json(res, 200, st, { 'Cache-Control': 'no-store' });
            return;
        }

        if (parts.length === 3 && parts[0] === 'v1' && parts[1] === 'block') {
            var blockRaw = parts[2].replace(/\.json$/, '');
            var blockNum = safeNum(blockRaw, 0);
            if (!blockNum || blockNum <= 0) {
                json(res, 400, { error: 'invalid_block' });
                return;
            }
            var record = archive.getBlockRecord(blockNum);
            if (!record) {
                json(res, 404, { error: 'block_not_indexed', blockNum: blockNum }, { 'Cache-Control': 'no-store' });
                return;
            }
            json(res, 200, {
                blockNum: record.blockNum,
                block_id: record.block_id,
                previous: record.previous,
                timestamp: record.timestamp,
                eventCount: record.eventCount || 0,
                sourceNode: record.sourceNode || '',
                indexedAt: record.indexedAt,
                block: record.block
            });
            return;
        }

        if (parts.length === 2 && parts[0] === 'v1' && parts[1] === 'range') {
            var protocols = parsedUrl.query.protocol ? String(parsedUrl.query.protocol).split(',').map(function(x) { return x.trim(); }).filter(Boolean) : null;
            var events = archive.queryEvents({
                start: safeNum(parsedUrl.query.start || parsedUrl.query.from, 0),
                end: safeNum(parsedUrl.query.end || parsedUrl.query.to, 2147483647),
                protocols: protocols,
                limit: safeNum(parsedUrl.query.limit, 500)
            });
            json(res, 200, { events: events, count: events.length });
            return;
        }

        if (parts.length === 6 && parts[0] === 'v1' && parts[1] === 'account' && parts[3] === 'protocol' && parts[5] === 'actions') {
            var account = decodeURIComponent(parts[2]);
            var protocol = decodeURIComponent(parts[4]);
            var rows = archive.queryEvents({
                account: account,
                protocol: protocol,
                start: safeNum(parsedUrl.query.start || parsedUrl.query.from, 0),
                end: safeNum(parsedUrl.query.end || parsedUrl.query.to, 2147483647),
                limit: safeNum(parsedUrl.query.limit, 500)
            });
            json(res, 200, { account: account, protocol: protocol, actions: rows, count: rows.length });
            return;
        }

        if (parts.length === 6 && parts[0] === 'v1' && parts[1] === 'account' && parts[3] === 'protocol' && parts[5] === 'latest') {
            var latestAccount = decodeURIComponent(parts[2]);
            var latestProtocol = decodeURIComponent(parts[4]);
            var latestRows = archive.queryEvents({ account: latestAccount, protocol: latestProtocol, limit: 1 });
            json(res, 200, { account: latestAccount, protocol: latestProtocol, latest: latestRows.length ? latestRows[latestRows.length - 1] : null });
            return;
        }

        json(res, 404, { error: 'not_found' }, { 'Cache-Control': 'no-store' });
    });
}

if (require.main === module) {
    var configPath = process.env.ARCHIVE_NODE_CONFIG || path.join(__dirname, 'config.json');
    var cfg = indexer.loadConfig(configPath);
    var port = Number(process.env.PORT || process.env.ARCHIVE_NODE_PORT || cfg.port || 3007);
    var host = process.env.HOST || process.env.ARCHIVE_NODE_HOST || cfg.host || '127.0.0.1';
    var server = createServer({ config: cfg });
    server.listen(port, host, function() {
        console.log('viz-magic game archive listening on http://' + host + ':' + port);
    });
}

module.exports = {
    createServer: createServer,
    safeNum: safeNum,
    pathParts: pathParts
};
