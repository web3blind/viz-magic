'use strict';

var fs = require('fs');
var path = require('path');
var storeMod = require('./storage');
var parser = require('./parser');

var DEFAULT_CONFIG = {
    sourceNodes: ['https://api.viz.world/', 'https://node.viz.cx/'],
    dataDir: path.join(__dirname, 'data', 'archive-node'),
    startBlock: 1,
    requestDelayMs: 120,
    timeoutMs: 8000,
    maxBlocksPerRun: 0
};

function loadConfig(file) {
    var cfg = {};
    if (file && fs.existsSync(file)) cfg = storeMod.readJson(file, {});
    var out = {};
    Object.keys(DEFAULT_CONFIG).forEach(function(key) { out[key] = DEFAULT_CONFIG[key]; });
    Object.keys(cfg || {}).forEach(function(key) { out[key] = cfg[key]; });
    if (process.env.ARCHIVE_NODE_DATA_DIR) out.dataDir = process.env.ARCHIVE_NODE_DATA_DIR;
    if (process.env.ARCHIVE_NODE_NODES) out.sourceNodes = process.env.ARCHIVE_NODE_NODES.split(',').map(function(x) { return x.trim(); }).filter(Boolean);
    if (process.env.ARCHIVE_NODE_START_BLOCK) out.startBlock = Number(process.env.ARCHIVE_NODE_START_BLOCK);
    if (process.env.ARCHIVE_NODE_MAX_BLOCKS) out.maxBlocksPerRun = Number(process.env.ARCHIVE_NODE_MAX_BLOCKS);
    return out;
}

function parseArgs(argv) {
    var args = { config: path.join(__dirname, 'config.json') };
    for (var i = 2; i < argv.length; i += 1) {
        var a = argv[i];
        if (a === '--config') args.config = argv[++i];
        else if (a === '--from') args.from = Number(argv[++i]);
        else if (a === '--to') args.to = Number(argv[++i]);
        else if (a === '--once') args.once = true;
        else if (a === '--max-blocks') args.maxBlocks = Number(argv[++i]);
    }
    return args;
}

function sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function rpcFetchBlock(nodeUrl, blockNum, timeoutMs) {
    return new Promise(function(resolve, reject) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var done = false;
        var timer = setTimeout(function() {
            if (controller) controller.abort();
            if (!done) reject(new Error('timeout'));
        }, timeoutMs || 8000);
        fetch(nodeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: ['database_api', 'get_block', [blockNum]], id: blockNum }),
            signal: controller ? controller.signal : undefined
        }).then(function(resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
        }).then(function(payload) {
            done = true;
            clearTimeout(timer);
            var block = payload && (payload.result || payload.block || (payload.data && payload.data.block));
            if (!block || !block.transactions) throw new Error('empty block');
            resolve(block);
        }).catch(function(err) {
            done = true;
            clearTimeout(timer);
            reject(err);
        });
    });
}

async function fetchBlockFromNodes(nodes, blockNum, timeoutMs) {
    var lastErr = null;
    for (var i = 0; i < nodes.length; i += 1) {
        var node = nodes[i];
        if (!node) continue;
        try {
            var block = await rpcFetchBlock(node, blockNum, timeoutMs);
            return { block: block, node: node };
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('no source nodes configured');
}

async function indexRange(options) {
    var cfg = options.config || DEFAULT_CONFIG;
    var archive = options.store || new storeMod.ArchiveStore(cfg.dataDir);
    var cursor = archive.getCursor();
    var start = Number(options.from || cursor.lastIndexedBlock + 1 || cfg.startBlock || 1);
    if (start < Number(cfg.startBlock || 1)) start = Number(cfg.startBlock || 1);
    var end = options.to ? Number(options.to) : null;
    var maxBlocks = Number(options.maxBlocks || cfg.maxBlocksPerRun || 0);
    var indexed = 0;
    var eventCount = 0;
    archive.setStatus({ ok: true, service: 'viz-magic-game-archive', mode: 'indexing', sourceNodes: cfg.sourceNodes.length });

    while (true) {
        if (end && start > end) break;
        if (maxBlocks && indexed >= maxBlocks) break;
        try {
            var fetched = await fetchBlockFromNodes(cfg.sourceNodes, start, cfg.timeoutMs);
            var events = parser.extractGameEvents(fetched.block, start);
            archive.putBlock(start, fetched.block, fetched.node, events);
            if (events.length) archive.putEventsForBlock(events);
            archive.setCursor(start);
            indexed += 1;
            eventCount += events.length;
            if (indexed % 25 === 0 || events.length) {
                console.log('indexed block ' + start + ' events=' + events.length + ' total=' + indexed);
            }
            start += 1;
            if (options.once && (!end || start > end)) break;
            if (cfg.requestDelayMs) await sleep(Number(cfg.requestDelayMs));
        } catch (err) {
            archive.setStatus({ ok: false, service: 'viz-magic-game-archive', mode: 'error', lastError: err && err.message || String(err), failedBlock: start });
            throw err;
        }
    }

    archive.setStatus({ ok: true, service: 'viz-magic-game-archive', mode: 'idle', indexedBlocks: indexed, indexedEvents: eventCount, sourceNodes: cfg.sourceNodes.length });
    return { indexedBlocks: indexed, indexedEvents: eventCount, lastIndexedBlock: archive.getCursor().lastIndexedBlock };
}

if (require.main === module) {
    var args = parseArgs(process.argv);
    var cfg = loadConfig(args.config);
    indexRange({ config: cfg, from: args.from, to: args.to, once: args.once, maxBlocks: args.maxBlocks }).then(function(result) {
        console.log(JSON.stringify(result));
    }).catch(function(err) {
        console.error(err && err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    loadConfig: loadConfig,
    parseArgs: parseArgs,
    rpcFetchBlock: rpcFetchBlock,
    fetchBlockFromNodes: fetchBlockFromNodes,
    indexRange: indexRange
};
