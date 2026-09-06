'use strict';

var assert = require('assert');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');
var indexer = require('../tools/archive-node/indexer');
var parser = require('../tools/archive-node/parser');
var storeMod = require('../tools/archive-node/storage');

function fixtureBlock(number) {
    var intent = number === 100 ? 'award-history' : 'missing-history';
    return {
        previous: 'previous-' + number,
        timestamp: '2026-09-06T12:00:00',
        transactions: [{ operations: [
            ['award', { initiator: 'alice', receiver: 'null', energy: 250, custom_sequence: 0, memo: 'viz://vt/mint/v1/' + intent, beneficiaries: [] }],
            ['custom', { id: 'VT', required_regular_auths: ['alice'], required_active_auths: [], json: JSON.stringify({ p: 'VT', v: 1, t: 'mint', d: { intent: intent, method: 'award', energy: 250 } }) }]
        ] }]
    };
}

function listenFixture() {
    return new Promise(function(resolve) {
        var server = http.createServer(function(req, res) {
            var raw = '';
            req.on('data', function(chunk) { raw += chunk; });
            req.on('end', function() {
                var payload = JSON.parse(raw || '{}');
                var api = payload.params && payload.params[0];
                var method = payload.params && payload.params[1];
                var params = payload.params && payload.params[2] || [];
                var number = Number(params[0] || 0);
                var result = null;
                if (api === 'database_api' && method === 'get_block') {
                    result = fixtureBlock(number);
                } else if (api === 'block_info' && method === 'get_block_info') {
                    result = [{ block_id: 'canonical-' + number, block_size: 1, average_block_size: 1, aslot: number, last_irreversible_block_num: number }];
                } else if (api === 'operation_history' && method === 'get_ops_in_block' && number === 100) {
                    var block = fixtureBlock(number);
                    result = [
                        { trx_id: 'canonical-tx-100', block: 100, trx_in_block: 0, op_in_trx: 0, virtual_op: 0, op: block.transactions[0].operations[0] },
                        { trx_id: 'canonical-tx-100', block: 100, trx_in_block: 0, op_in_trx: 0, virtual_op: 1, op: ['receive_award', { initiator: 'alice', receiver: 'null', custom_sequence: 0, memo: 'viz://vt/mint/v1/award-history', shares: '1.234567 SHARES' }] },
                        { trx_id: 'canonical-tx-100', block: 100, trx_in_block: 0, op_in_trx: 1, virtual_op: 0, op: block.transactions[0].operations[1] }
                    ];
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ jsonrpc: '2.0', result: result, id: payload.id }));
            });
        });
        server.listen(0, '127.0.0.1', function() {
            resolve({ server: server, url: 'http://127.0.0.1:' + server.address().port + '/' });
        });
    });
}

(function strictVirtualReceiptParsing() {
    var block = fixtureBlock(100);
    block.block_id = 'canonical-100';
    block.transactions[0].transaction_id = 'canonical-tx-100';
    var source = { trx_id: 'canonical-tx-100', block: 100, trx_in_block: 0, op_in_trx: 0, virtual_op: 0, op: block.transactions[0].operations[0] };
    function receipt(overrides) {
        return Object.assign({
            trx_id: 'canonical-tx-100', block: 100, trx_in_block: 0, op_in_trx: 0, virtual_op: 1,
            op: ['receive_award', { initiator: 'alice', receiver: 'null', custom_sequence: 0, memo: 'viz://vt/mint/v1/award-history', shares: '1.234567 SHARES' }]
        }, overrides || {});
    }
    assert.strictEqual(parser.extractVirtualEvents(block, 100, [source, receipt()]).length, 1);
    [
        receipt({ virtual_op: 0 }), receipt({ virtual_op: 1.5 }), receipt({ trx_in_block: -1 }),
        receipt({ op_in_trx: -1 }), receipt({ trx_id: '' }),
        receipt({ op: ['receive_award', { initiator: 'alice', receiver: 'null', custom_sequence: 0, memo: 'viz://vt/mint/v1/award-history', shares: '1.000000 VIZ' }] }),
        receipt({ op: ['receive_award', { initiator: 'alice', receiver: 'null', custom_sequence: 0, memo: 'viz://vt/mint/v1/award-history', shares: '9007199254.740992 SHARES' }] })
    ].forEach(function(row) {
        assert.strictEqual(parser.extractVirtualEvents(block, 100, [source, row]).length, 0, 'malformed virtual receipt must be dropped');
    });
    assert.strictEqual(parser.extractVirtualEvents(block, 100, [source, Object.assign({}, source), receipt()]).length, 0, 'ambiguous source positions cannot bind a receipt');
    assert.throws(function() { parser.bindOperationHistory(block, 100, [source, Object.assign({}, source)]); }, /duplicate operation history source/);
}());

(async function() {
    var rpc = await listenFixture();
    var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-op-history-'));
    var missingTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-op-history-missing-'));
    try {
        var cfg = {
            sourceNodes: [rpc.url], dataDir: tmp, startBlock: 100, requestDelayMs: 0,
            timeoutMs: 2000, maxBlocksPerRun: 1, virtualReceiptStartBlock: 100
        };
        var result = await indexer.indexRange({ config: cfg, from: 100, to: 100, once: true });
        assert.strictEqual(result.indexedBlocks, 1);
        var store = new storeMod.ArchiveStore(tmp);
        var record = store.getBlockRecord(100);
        assert.strictEqual(record.block_id, 'canonical-100');
        assert.strictEqual(record.virtualComplete, true);
        assert.strictEqual(record.block.transactions[0].transaction_id, 'canonical-tx-100');
        assert.strictEqual(record.block.virtual_operations.length, 1);
        assert.strictEqual(store.queryEvents({ protocol: 'VT', start: 100, end: 100 }).length, 3);
        store.db.close();

        var missingStore = new storeMod.ArchiveStore(missingTmp);
        var missingCfg = Object.assign({}, cfg, { dataDir: missingTmp, startBlock: 101, virtualReceiptStartBlock: 101 });
        await assert.rejects(function() {
            return indexer.indexRange({ config: missingCfg, store: missingStore, from: 101, to: 101, once: true });
        }, /operation history unavailable/);
        assert.strictEqual(missingStore.hasBlock(101), false, 'missing virtual history must not write a partial block');
        assert.strictEqual(missingStore.getCursor().lastIndexedBlock, 0, 'missing virtual history must not advance cursor');
        missingStore.db.close();

        console.log('PASS VT archive indexes canonical virtual award receipts atomically');
    } finally {
        await new Promise(function(resolve) { rpc.server.close(resolve); });
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.rmSync(missingTmp, { recursive: true, force: true });
    }
}()).catch(function(err) {
    console.error(err && err.stack || err);
    process.exit(1);
});
