'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var sqlite = require('node:sqlite');
var storeMod = require('../tools/archive-node/storage');
var parser = require('../tools/archive-node/parser');

function makeBlock(id, number, ops) {
    return { block_id: id, previous: 'prev-' + number, timestamp: '2026-09-06T00:00:00', transactions: [{ transaction_id: 'tx-' + number, operations: ops }] };
}

var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-archive-'));
try {
    var legacy = new sqlite.DatabaseSync(path.join(tmp, 'archive.sqlite'));
    legacy.exec([
        'CREATE TABLE blocks (block_num INTEGER PRIMARY KEY, block_id TEXT, previous TEXT, timestamp TEXT, source_node TEXT, indexed_at TEXT, event_count INTEGER NOT NULL DEFAULT 0, raw_json TEXT NOT NULL);',
        'CREATE TABLE events (id TEXT PRIMARY KEY, block_num INTEGER NOT NULL, block_id TEXT, previous TEXT, timestamp TEXT, tx_index INTEGER NOT NULL, op_index INTEGER NOT NULL, op_type TEXT NOT NULL, protocol TEXT NOT NULL, type TEXT, sender TEXT, account TEXT, accounts_json TEXT, payload_json TEXT, raw_json TEXT NOT NULL);',
        'CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
        "INSERT INTO blocks VALUES(90,'legacy','p','t','n','t',1,'{\"transactions\":[]}');",
        "INSERT INTO events VALUES('legacy-event',90,'legacy','p','t',0,0,'custom','VM','char.attune','old-player','old-player','[\"old-player\"]','{}','{}');"
    ].join('\n'));
    legacy.close();

    var store = new storeMod.ArchiveStore(tmp);
    assert.strictEqual(store.queryEvents({ protocol: 'VM' }).length, 1, 'migration preserves old rows');
    assert.strictEqual(store.db.prepare('PRAGMA table_info(events)').all().some(function(row) { return row.name === 'tx_id'; }), true);
    assert.strictEqual(store.db.prepare('PRAGMA table_info(events)').all().some(function(row) { return row.name === 'virtual_op'; }), true);
    assert.strictEqual(store.db.prepare('PRAGMA table_info(blocks)').all().some(function(row) { return row.name === 'virtual_complete'; }), true);

    var mintAction = { p: 'VT', v: 1, t: 'mint', d: { intent: 'arc-1', method: 'transfer', amount_milli: 2000 } };
    var b100 = makeBlock('canonical-100', 100, [
        ['transfer', { from: 'alice', to: 'null', amount: '2.000 VIZ', memo: 'viz://vt/mint/v1/arc-1' }],
        ['custom', { id: 'VT', required_regular_auths: ['alice'], required_active_auths: [], json: JSON.stringify(mintAction) }],
        ['fixed_award', { initiator: 'alice', receiver: 'null', reward_amount: '1.000 VIZ', max_energy: 500, custom_sequence: 1, memo: 'viz://vt/mint/v1/fixed-1', beneficiaries: [] }]
    ]);
    var events100 = parser.extractGameEvents(b100, 100);
    assert.deepStrictEqual(events100.map(function(e) { return e.type; }), ['mint.transfer', 'mint', 'mint.fixed_award']);
    store.putBlockWithEvents(100, b100, 'fixture', events100);
    store.setCursor(100);
    assert.strictEqual(store.queryEvents({ account: 'alice', protocol: 'VT' }).length, 3);
    var thin = store.getBlockRecord(100).block;
    assert.strictEqual(thin.transactions[0].operations[0][0], 'transfer');
    assert.strictEqual(thin.transactions[0].operations[1][0], 'custom');
    assert.strictEqual(thin.transactions[0].operations[2][0], 'fixed_award');
    assert.strictEqual(thin.transactions[0].transaction_id, 'tx-100');

    var b101 = makeBlock('canonical-101', 101, [['custom', { id: 'VT', required_regular_auths: ['alice'], required_active_auths: [], json: JSON.stringify({ p: 'VT', v: 1, t: 'transfer', d: { to: 'bob', amount_milli: 1, nonce: 'n1' } }) }]]);
    b101.previous = 'canonical-100';
    store.putBlockWithEvents(101, b101, 'fixture', parser.extractGameEvents(b101, 101));
    assert.strictEqual(store.hasBlock(101), true);
    var disconnected = makeBlock('bad-102', 102, []);
    disconnected.previous = 'not-canonical-101';
    assert.throws(function() { store.putBlockWithEvents(102, disconnected, 'fixture', []); }, /archive_chain_discontinuity/);
    assert.strictEqual(store.hasBlock(102), false, 'parent mismatch must fail closed before archive mutation');
    var fork100 = makeBlock('fork-100', 100, [['custom', { id: 'VM', required_regular_auths: ['fork'], json: JSON.stringify({ p: 'VM', t: 'rest', d: {} }) }]]);
    store.putBlockWithEvents(100, fork100, 'fixture', parser.extractGameEvents(fork100, 100));
    assert.strictEqual(store.hasBlock(101), false, 'reorg replacement removes descendants');
    assert.strictEqual(store.getBlockRecord(100).block_id, 'fork-100');

    var awardIntent = { p: 'VT', v: 1, t: 'mint', d: { intent: 'award-1', method: 'award', energy: 250 } };
    var b103 = makeBlock('canonical-103', 103, [
        ['award', { initiator: 'alice', receiver: 'null', energy: 250, custom_sequence: 0, memo: 'viz://vt/mint/v1/award-1', beneficiaries: [] }],
        ['custom', { id: 'VT', required_regular_auths: ['alice'], required_active_auths: [], json: JSON.stringify(awardIntent) }]
    ]);
    delete b103.transactions[0].transaction_id;
    var historyRows = [
        { trx_id: 'history-tx-103', block: 103, trx_in_block: 0, op_in_trx: 0, virtual_op: 0, op: b103.transactions[0].operations[0] },
        { trx_id: 'history-tx-103', block: 103, trx_in_block: 0, op_in_trx: 0, virtual_op: 1, op: ['receive_award', { initiator: 'alice', receiver: 'null', custom_sequence: 0, memo: 'viz://vt/mint/v1/award-1', shares: '1.234567 SHARES' }] },
        { trx_id: 'history-tx-103', block: 103, trx_in_block: 0, op_in_trx: 1, virtual_op: 0, op: b103.transactions[0].operations[1] }
    ];
    parser.bindOperationHistory(b103, 103, historyRows);
    assert.strictEqual(b103.transactions[0].transaction_id, 'history-tx-103');
    var virtualEvents = parser.extractVirtualEvents(b103, 103, historyRows);
    assert.strictEqual(virtualEvents.length, 1);
    assert.strictEqual(virtualEvents[0].type, 'mint.award.receipt');
    assert.strictEqual(virtualEvents[0].virtualOp, 1);
    assert.strictEqual(virtualEvents[0].payload.shares, '1.234567 SHARES');
    var events103 = parser.extractGameEvents(b103, 103).concat(virtualEvents);
    store.setVirtualReceiptStartBlock(103);
    store.putBlockWithEvents(103, b103, 'fixture', events103, { virtualComplete: true });
    store.setCursor(103);
    var record103 = store.getBlockRecord(103);
    assert.strictEqual(record103.virtualComplete, true);
    assert.strictEqual(record103.block.virtual_operations.length, 1);
    assert.strictEqual(store.queryEvents({ start: 103, end: 103, protocol: 'VT' }).length, 3, 'source award, intent and receipt keep distinct identities');
    assert.strictEqual(store.isBlockRangeComplete(103, 103), true);
    assert.strictEqual(store.isBlockRangeComplete(103, 104), false);
    assert.strictEqual(store.isVirtualRangeComplete(103, 103), true);
    assert.strictEqual(store.isVirtualRangeComplete(103, 104), false);

    var reversible104 = makeBlock('reversible-104', 104, []);
    reversible104.previous = 'canonical-103';
    store.putBlockWithEvents(104, reversible104, 'fixture', [], { virtualComplete: true });
    store.setCursor(104);
    store.truncateAfter(103);
    assert.strictEqual(store.hasBlock(104), false, 'reversible descendants must be removed atomically');
    assert.strictEqual(store.getCursor().lastIndexedBlock, 103, 'cursor must rewind with reversible descendants');
    assert.strictEqual(store.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');

    var failed = makeBlock('failed-104', 104, [['custom', { id: 'VT', required_regular_auths: ['alice'], required_active_auths: [], json: JSON.stringify(mintAction) }]]);
    failed.previous = 'canonical-103';
    var originalInsert = store._insertEventsUnsafe;
    store._insertEventsUnsafe = function() { throw new Error('simulated interruption'); };
    assert.throws(function() { store.putBlockWithEvents(104, failed, 'fixture', parser.extractGameEvents(failed, 104), { virtualComplete: true }); }, /simulated interruption/);
    store._insertEventsUnsafe = originalInsert;
    assert.strictEqual(store.hasBlock(104), false, 'interrupted block transaction rolls back metadata too');

    console.log('PASS VT archive migration, exact positions, reorg and interrupted atomic sync');
    store.db.close();
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}
