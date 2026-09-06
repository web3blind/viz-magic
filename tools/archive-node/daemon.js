'use strict';

var path = require('path');
var indexer = require('./indexer');
var storeMod = require('./storage');

function sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function loadDaemonConfig() {
    var configPath = process.env.ARCHIVE_NODE_CONFIG || path.join(__dirname, 'config.json');
    var cfg = indexer.loadConfig(configPath);
    cfg.pollIntervalMs = Number(process.env.ARCHIVE_NODE_POLL_MS || cfg.pollIntervalMs || 5000);
    cfg.maxBlocksPerTick = Number(process.env.ARCHIVE_NODE_MAX_BLOCKS_PER_TICK || cfg.maxBlocksPerTick || 500);
    return cfg;
}

function rpcCall(nodeUrl, method, params, timeoutMs) {
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
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: ['database_api', method, params || []], id: 1 }),
            signal: controller ? controller.signal : undefined
        }).then(function(resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
        }).then(function(payload) {
            done = true;
            clearTimeout(timer);
            if (!payload || !payload.result) throw new Error('empty result');
            resolve(payload.result);
        }).catch(function(err) {
            done = true;
            clearTimeout(timer);
            reject(err);
        });
    });
}

async function getChainHeads(cfg) {
    var lastErr = null;
    for (var i = 0; i < cfg.sourceNodes.length; i += 1) {
        try {
            var dgp = await rpcCall(cfg.sourceNodes[i], 'get_dynamic_global_properties', [], cfg.timeoutMs);
            var head = Number(dgp.head_block_number || 0);
            var irreversible = Number(dgp.last_irreversible_block_num || 0);
            if (!Number.isSafeInteger(head) || head <= 0 || !Number.isSafeInteger(irreversible) || irreversible <= 0 || irreversible > head) {
                throw new Error('authoritative last_irreversible_block_num unavailable');
            }
            return { head: head, irreversible: irreversible };
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('cannot read head block');
}

async function getHeadBlock(cfg) {
    return (await getChainHeads(cfg)).head;
}

async function reconcileCursorToIrreversible(cfg, archive, irreversibleHead) {
    var cursor = archive.getCursor();
    var lastIndexed = Number(cursor.lastIndexedBlock || 0);
    if (lastIndexed <= irreversibleHead) return { rewound: false, lastIndexedBlock: lastIndexed };
    var retained = archive.getBlockRecord(irreversibleHead);
    if (!retained || !retained.block_id) throw new Error('irreversible cursor reconciliation block missing');
    var lastErr = null;
    for (var i = 0; i < cfg.sourceNodes.length; i += 1) {
        try {
            var identity = await indexer.rpcFetchBlockId(cfg.sourceNodes[i], irreversibleHead, cfg.timeoutMs);
            if (identity.blockId !== retained.block_id) throw new Error('irreversible cursor reconciliation identity mismatch');
            archive.truncateAfter(irreversibleHead);
            return { rewound: true, from: lastIndexed, lastIndexedBlock: irreversibleHead };
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('irreversible cursor reconciliation failed');
}

async function runForever() {
    var cfg = loadDaemonConfig();
    var archive = new storeMod.ArchiveStore(cfg.dataDir);
    console.log('archive-node daemon started pollMs=' + cfg.pollIntervalMs + ' maxBlocksPerTick=' + cfg.maxBlocksPerTick);
    while (true) {
        try {
            var heads = await getChainHeads(cfg);
            var head = heads.head;
            var irreversibleHead = heads.irreversible;
            var reconciliation = await reconcileCursorToIrreversible(cfg, archive, irreversibleHead);
            if (reconciliation.rewound) {
                console.log('archive-node removed reversible tip from=' + reconciliation.from + ' to=' + reconciliation.lastIndexedBlock);
            }
            var result = await indexer.indexRange({
                config: cfg, store: archive, to: irreversibleHead, maxBlocks: cfg.maxBlocksPerTick, once: true,
                chainHead: head, irreversibleHead: irreversibleHead
            });
            if (result.indexedBlocks || result.indexedEvents) {
                console.log('archive-node tick head=' + head + ' irreversible=' + irreversibleHead + ' indexedBlocks=' + result.indexedBlocks + ' indexedEvents=' + result.indexedEvents + ' last=' + result.lastIndexedBlock);
            }
        } catch (err) {
            console.error('archive-node tick failed: ' + (err && err.stack || err));
        }
        await sleep(cfg.pollIntervalMs);
    }
}

if (require.main === module) {
    runForever().catch(function(err) {
        console.error(err && err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    loadDaemonConfig: loadDaemonConfig,
    rpcCall: rpcCall,
    getChainHeads: getChainHeads,
    getHeadBlock: getHeadBlock,
    reconcileCursorToIrreversible: reconcileCursorToIrreversible,
    runForever: runForever
};
