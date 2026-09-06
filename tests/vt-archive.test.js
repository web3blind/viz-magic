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

    var failed = makeBlock('failed-102', 102, [['custom', { id: 'VT', required_regular_auths: ['alice'], required_active_auths: [], json: JSON.stringify(mintAction) }]]);
    var originalInsert = store._insertEventsUnsafe;
    store._insertEventsUnsafe = function() { throw new Error('simulated interruption'); };
    assert.throws(function() { store.putBlockWithEvents(102, failed, 'fixture', parser.extractGameEvents(failed, 102)); }, /simulated interruption/);
    store._insertEventsUnsafe = originalInsert;
    assert.strictEqual(store.hasBlock(102), false, 'interrupted block transaction rolls back metadata too');

    console.log('PASS VT archive migration, exact positions, reorg and interrupted atomic sync');
    store.db.close();
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}
