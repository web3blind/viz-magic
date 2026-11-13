'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
var http = require('http');
var ArchiveStore = require('../tools/archive-node/storage').ArchiveStore;
var federation = require('../tools/archive-node/federation');
var indexer = require('../tools/archive-node/indexer');
var serverMod = require('../tools/archive-node/server');
var parser = require('../tools/archive-node/parser');
function id(n) { return n.toString(16).padStart(8, '0') + '1'.repeat(32); }
function block(n, ops) { return { block_id: id(n), previous: id(n - 1), timestamp: '2026-11-13T00:00:00', transactions: ops ? [{ transaction_id: 'a'.repeat(40), operations: ops }] : [] }; }
function custom(type, data, protocol) { return ['custom', { id: protocol || 'VM', required_regular_auths: ['mage'], json: JSON.stringify({ t: type, d: data || {} }) }]; }
function fixture(t) {
    var root = fs.mkdtempSync(path.join(os.tmpdir(), 'live-range-'));
    var stores = [];
    t.after(function() { stores.forEach(function(s) { s.db.close(); }); fs.rmSync(root, { recursive: true, force: true }); });
    return { root: root, store: function(name) { var s = new ArchiveStore(path.join(root, name)); stores.push(s); return s; }, track: function(s) { stores.push(s); return s; } };
}
function put(store, n, ops) { var b = block(n, ops); store.putBlockWithEvents(n, b, 'fixture', parser.extractGameEvents(b, n), { virtualComplete: true }); store.setCursor(n); store.setVirtualReceiptStartBlock(1); }
function snapshot(store) {
    store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    return { hash: crypto.createHash('sha256').update(fs.readFileSync(store.dbPath)).digest('hex'), schema: store.db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(), blocks: store.db.prepare('SELECT COUNT(*) AS n FROM blocks').get(), events: store.db.prepare('SELECT COUNT(*) AS n FROM events').get(), cursor: store.getCursor() };
}
function request(server, target) {
    var out = {};
    server.emit('request', { method: 'GET', url: target }, { setHeader: function() {}, writeHead: function(n) { out.status = n; }, end: function(s) { out.body = JSON.parse(s); } });
    return out;
}
function cfg(f, live, old) { return { dataDir: live.rootDir, legacyDataDirs: old ? [old.rootDir] : [], startBlock: 10, sourceNodes: ['http://127.0.0.1:1/'], virtualReceiptStartBlock: 1, requestDelayMs: 0, timeoutMs: 500, autoGapRollover: true }; }
async function rpc(t, handler) {
    var server = http.createServer(function(req, res) { var s = ''; req.on('data', function(c) { s += c; }); req.on('end', function() { var p = JSON.parse(s); var result = handler(p.params[1], p.params[2]); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ result: result })); }); });
    await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
    t.after(function() { server.close(); });
    return 'http://127.0.0.1:' + server.address().port + '/';
}
function response(method, args) {
    var n = args[0];
    if (method === 'get_block') return block(n);
    if (method === 'get_ops_in_block') return [];
    if (method === 'get_block_info') return [{ block_id: id(n), block_size: 1, average_block_size: 1, aslot: n, last_irreversible_block_num: n }];
    return null;
}

test('readonly retained federation keeps immutable files and actual holes; all public routes retain old and new proofs', function(t) {
    var f = fixture(t), old = f.store('old'), live = f.store('live');
    put(old, 1, [custom('guild.create', { id: 'old-guild', name: 'Old' })]);
    put(old, 3, [custom('post', {}, 'V')]); // Do not infer 1..cursor coverage.
    put(live, 10, [custom('guild.create', { id: 'new-guild', name: 'New' }), custom('mint.intent', {}, 'VT')]);
    put(live, 11, [custom('char.attune')]);
    live.setStatus({ ok: true, mode: 'idle', lastIrreversibleBlock: 11 });
    var before = snapshot(old), c = cfg(f, live, old);
    var ro = f.track(new ArchiveStore(old.rootDir, { readOnly: true }));
    assert.throws(function() { ro.setCursor(99); }, /readonly|read.only/i);
    var fed = new federation.FederatedArchive(live, [ro], c);
    var actualApi = federation.openArchive(c);
    t.after(function() { actualApi.stores.forEach(function(s) { s.db.close(); }); });
    assert.equal(actualApi.live.readOnly, true); assert.equal(actualApi.legacy[0].readOnly, true);
    assert.throws(function() { actualApi.live.setCursor(99); }, /readonly|read.only/i);
    assert.equal(actualApi.queryEvents({ account: 'mage', protocol: 'VM' }).length, 3);
    assert.deepEqual(fed.getCoverage().ranges, [{ start: 1, end: 1 }, { start: 3, end: 3 }, { start: 10, end: 11 }]);
    assert.deepEqual(fed.getCoverage().missingRanges, [{ start: 2, end: 2 }, { start: 4, end: 9 }]);
    var server = serverMod.createServer({ config: c, store: live, legacyStores: [ro] });
    assert.equal(request(server, '/v1/block/1.json').body.block_id, id(1));
    assert.equal(request(server, '/v1/events/block/10').body.events[1].protocol, 'VT');
    assert.equal(request(server, '/v1/range?start=1&end=11').status, 409);
    assert.deepEqual(request(server, '/v1/range?start=1&end=11').body.missingRanges, fed.getCoverage().missingRanges);
    assert.equal(request(server, '/v1/block/2').body.error, 'history_incomplete');
    assert.equal(request(server, '/v1/range?start=10&end=11').body.complete, true);
    var actions = request(server, '/v1/account/mage/protocol/VM/actions?limit=20').body;
    assert.deepEqual(actions.actions.map(function(e) { return e.blockNum; }), [1, 10, 11]);
    assert.equal(actions.paginationExhausted, true);
    assert.equal(actions.historyComplete, false);
    assert.equal(actions.complete, false);
    assert.equal(request(server, '/v1/account/mage/protocol/VM/latest').body.latest.blockNum, 11);
    var money = request(server, '/v1/magic/account/mage/history').body;
    assert.equal(money.events.length, 1); assert.equal(money.historyComplete, false); assert.equal(money.complete, false);
    var guilds = request(server, '/v1/guilds').body;
    assert.equal(guilds.count, 2); assert.equal(guilds.historyComplete, false); assert.equal(guilds.complete, false);
    var health = request(server, '/health');
    assert.equal(health.status, 200); assert.equal(health.body.liveCaughtUp, true); assert.equal(health.body.degraded, true); assert.equal(health.body.historyComplete, false);
    assert.deepEqual(health.body.liveRange, { start: 10, end: 11 });
    live.setStatus({ ok: true, mode: 'idle', lastIrreversibleBlock: 12 });
    assert.equal(request(server, '/health').status, 503);
    live._setMeta('status', { ok: true, mode: 'idle', lastIrreversibleBlock: 11, updatedAt: '2000-01-01' });
    assert.equal(request(server, '/health').status, 503);
    assert.deepEqual(snapshot(old), before);
});

test('source path aliases, nesting, duplicate keys, and mismatched overlap fail closed', function(t) {
    var f = fixture(t), old = f.store('old'), live = f.store('live');
    put(old, 10); put(live, 10);
    var c = cfg(f, live, old);
    assert.throws(function() { federation.validateConfig(Object.assign({}, c, { legacyDataDirs: [live.rootDir] })); }, /overlap|duplicate/);
    fs.symlinkSync(live.rootDir, path.join(f.root, 'alias'));
    assert.throws(function() { federation.validateConfig(Object.assign({}, c, { legacyDataDirs: [path.join(f.root, 'alias')] })); }, /overlap|duplicate/);
    assert.throws(function() { federation.validateConfig(Object.assign({}, c, { legacyDataDirs: [path.join(live.rootDir, 'nested')] })); }, /overlap/);
    assert.throws(function() { federation.validateConfig(Object.assign({}, c, { legacyDataDirs: [old.rootDir, old.rootDir] })); }, /overlap|duplicate/);
    var ro = f.track(new ArchiveStore(old.rootDir, { readOnly: true }));
    var fed = new federation.FederatedArchive(live, [ro], c);
    assert.equal(fed.queryEvents({}).length, 0);
    live.db.prepare('UPDATE blocks SET block_id = ? WHERE block_num = 10').run('bad');
    assert.throws(function() { new federation.FederatedArchive(live, [ro], c); }, /identity|overlap/);
});

test('same-node bundle rejects invalid identities, timestamps, null raw and missing ops; valid empty block survives fallback', async function(t) {
    var good = await rpc(t, response);
    var badCases = [
        function(m, a) { return m === 'get_block' ? null : response(m, a); },
        function(m, a) { if (m !== 'get_block') return response(m, a); var b = block(10); delete b.timestamp; return b; },
        function(m, a) { return m === 'get_ops_in_block' ? null : response(m, a); },
        function(m, a) { return m === 'get_block_info' ? [{ block_id: '0'.repeat(40), timestamp: block(10).timestamp }] : response(m, a); },
        function(m, a) { return m === 'get_block_info' ? [{ block_id: id(9), timestamp: block(10).timestamp }] : response(m, a); },
        function(m, a) { return m === 'get_block_info' ? [{ block_id: 'bad', timestamp: block(10).timestamp }] : response(m, a); },
        function(m, a) { return m === 'get_block_info' ? [{ block_id: id(10), timestamp: null }] : response(m, a); },
        function(m, a) { return m === 'get_block_info' ? [{ block_id: id(10), timestamp: '2026-11-12T00:00:00' }] : response(m, a); }
    ];
    for (var badCase of badCases) {
        var bad = await rpc(t, badCase);
        var b = await indexer.fetchBlockBundle([bad, good], 10, 500, true);
        assert.equal(b.node, good); assert.equal(b.block.block_id, id(10)); assert.deepEqual(b.events, []);
        await assert.rejects(indexer.fetchBlockBundle([bad], 10, 500, true));
    }
});

test('advertised pruning automatically records durable repeat gaps; serviceable transient never skips; cursor atomic and new tail only', async function(t) {
    var f = fixture(t), old = f.store('old'), live = f.store('live'); put(old, 1);
    var before = snapshot(old), earliest = 10, fail = false;
    var source = await rpc(t, function(m, a) {
        if (m === 'get_dynamic_global_properties') return { earliest_available_block_num: earliest, head_block_number: 40, last_irreversible_block_num: 35 };
        if (a[0] < earliest || fail) return null;
        return response(m, a);
    });
    var c = cfg(f, live, old); c.sourceNodes = [source];
    async function run(to) { return indexer.indexRange({ config: c, store: live, to: to, irreversibleHead: to, chainHead: 40, once: true }); }
    await run(11); assert.equal(live.getCursor().lastIndexedBlock, 11); assert.equal(live.hasBlock(1), false);
    earliest = 20;
    assert.deepEqual(await require('../tools/archive-node/daemon').reconcileCursorToIrreversible(c, live, 21), { rewound: false, lastIndexedBlock: 11 });
    var insert = live._insertEventsUnsafe;
    live._insertEventsUnsafe = function() { throw new Error('synthetic interrupted rollover'); };
    await assert.rejects(run(21), /synthetic interrupted rollover/);
    assert.equal(live.hasBlock(20), false); assert.equal(live.getCursor().lastIndexedBlock, 11);
    assert.deepEqual(live._getMeta('missing_ranges', []), []);
    live._insertEventsUnsafe = insert;
    await run(21);
    assert.equal(live.hasBlock(12), false); assert.equal(live.hasBlock(20), true);
    earliest = 30; await run(31);
    assert.deepEqual(live._getMeta('missing_ranges', []).map(function(g) { return { start: g.start, end: g.end }; }), [{ start: 12, end: 19 }, { start: 22, end: 29 }]);
    fail = true; await assert.rejects(run(32)); assert.equal(live.getCursor().lastIndexedBlock, 31);
    fail = false; await run(32);
    assert.equal(live.getCursor().lastIndexedBlock, 32);
    var reload = f.track(new ArchiveStore(live.rootDir));
    var ro = f.track(new ArchiveStore(old.rootDir, { readOnly: true }));
    var coverage = new federation.FederatedArchive(reload, [ro], c).getCoverage();
    assert.deepEqual(coverage.ranges, [{ start: 1, end: 1 }, { start: 10, end: 11 }, { start: 20, end: 21 }, { start: 30, end: 32 }]);
    assert.equal(coverage.historyComplete, false);
    assert.deepEqual(snapshot(old), before);
    var broken = parser.extractGameEvents(block(33, [custom('char.attune')]), 33); broken[0].type = {};
    assert.throws(function() { live.putBlockWithEvents(33, block(33), source, broken, { virtualComplete: true, advanceCursor: true }); });
    assert.equal(live.hasBlock(33), false); assert.equal(live.getCursor().lastIndexedBlock, 32);
    await assert.rejects(indexer.indexRange({ config: c, store: live, from: 35, to: 35 }), /contiguous/);
});

test('rollover needs all configured node bounds and picks minimum advertised boundary, not a convenient later source', async function(t) {
    var f = fixture(t), live = f.store('live'); put(live, 10);
    var failEarly = true;
    var a = await rpc(t, function(m, args) { if (m === 'get_dynamic_global_properties') return { earliest_available_block_num: 15, last_irreversible_block_num: 30, head_block_number: 30 }; if (failEarly || args[0] < 15) return null; return response(m, args); });
    var b = await rpc(t, function(m, args) { if (m === 'get_dynamic_global_properties') return { earliest_available_block_num: 20, last_irreversible_block_num: 30, head_block_number: 30 }; return args[0] < 20 ? null : response(m, args); });
    var c = cfg(f, live); c.sourceNodes = [a, b];
    await assert.rejects(indexer.indexRange({ config: c, store: live, to: 20 }));
    assert.equal(live.getCursor().lastIndexedBlock, 10); assert.deepEqual(live._getMeta('missing_ranges', []), []);
    failEarly = false;
    await indexer.indexRange({ config: c, store: live, to: 15 });
    assert.equal(live.getCursor().lastIndexedBlock, 15); assert.equal(live.hasBlock(11), false);
});

test('federation deduplicates exact monetary proofs and paginates same-block source/virtual receipts without loss', function(t) {
    var f = fixture(t), old = f.store('old'), live = f.store('live');
    put(old, 1);
    var award = ['award', { initiator: 'mage', receiver: 'null', energy: 100, custom_sequence: 0, memo: 'viz://vt/mint/v1/fixture' }];
    var b = block(10, [award, custom('mint.intent', {}, 'VT')]);
    var history = [
        { trx_id: 'a'.repeat(40), block: 10, trx_in_block: 0, op_in_trx: 0, virtual_op: 0, op: award },
        { trx_id: 'a'.repeat(40), block: 10, trx_in_block: 0, op_in_trx: 0, virtual_op: 1, op: ['receive_award', { initiator: 'mage', receiver: 'null', custom_sequence: 0, memo: award[1].memo, shares: '1.234567 SHARES' }] },
        { trx_id: 'a'.repeat(40), block: 10, trx_in_block: 0, op_in_trx: 1, virtual_op: 0, op: b.transactions[0].operations[1] }
    ];
    parser.bindOperationHistory(b, 10, history);
    var events = parser.extractGameEvents(b, 10).concat(parser.extractVirtualEvents(b, 10, history));
    assert.equal(events.length, 3);
    [old, live].forEach(function(s) { s.putBlockWithEvents(10, b, 'fixture', events, { virtualComplete: true, advanceCursor: true }); s.setVirtualReceiptStartBlock(1); });
    put(live, 11);
    var ro = f.track(new ArchiveStore(old.rootDir, { readOnly: true }));
    var c = cfg(f, live, old);
    var server = serverMod.createServer({ config: c, store: live, legacyStores: [ro] });
    var all = request(server, '/v1/magic/account/mage/history?limit=20').body;
    assert.equal(all.events.length, 3); assert.equal(all.complete, false); assert.equal(all.historyComplete, false);
    assert.deepEqual(all.events.map(function(e) { return [e.opIndex, e.virtualOp]; }), [[0, 0], [0, 1], [1, 0]]);
    assert.equal(all.events[1].raw.shares, '1.234567 SHARES'); assert.equal(all.events[1].txId, 'a'.repeat(40));
    assert.equal(request(server, '/v1/events/block/10').body.complete, true);
    assert.equal(request(server, '/v1/events/block/10').body.virtualReceiptsComplete, true);
    var next = '', seen = [];
    for (var i = 0; i < 4; i += 1) {
        var page = request(server, '/v1/magic/account/mage/history?limit=1' + next).body;
        seen = seen.concat(page.events);
        assert.equal(page.historyComplete, false);
        if (page.paginationExhausted) break;
        assert.ok(page.nextCursor); next = '&before=' + page.nextCursor;
    }
    assert.equal(seen.length, 3); assert.equal(new Set(seen.map(function(e) { return e.id; })).size, 3);
    assert.equal(request(server, '/v1/account/mage/protocol/VT/actions?before=broken').status, 400);
    var boundedPage = request(server, '/v1/range?start=10&end=11&limit=1').body;
    assert.equal(boundedPage.complete, true); // Complete range coverage; not an exhausted event page.
    assert.equal(boundedPage.paginationExhausted, false);
    assert.equal(boundedPage.historyComplete, false);
    assert.ok(boundedPage.nextCursor);
    var tailProof = request(server, '/v1/range?start=10&end=11&limit=20').body;
    assert.equal(tailProof.historyComplete, false);
    assert.equal(tailProof.complete, true);
    assert.equal(tailProof.virtualReceiptsComplete, true);
    assert.deepEqual(tailProof.events.map(function(e) { return e.id; }), all.events.map(function(e) { return e.id; }));
});

test('unknown source bounds and transport failure within serviceable window leave cursor and gap ledger unchanged', async function(t) {
    var f = fixture(t), live = f.store('live'); put(live, 10);
    var known = false;
    var source = await rpc(t, function(m) {
        if (m === 'get_dynamic_global_properties') return { earliest_available_block_num: known ? 10 : undefined, head_block_number: 20, last_irreversible_block_num: 20 };
        return null;
    });
    var c = cfg(f, live); c.sourceNodes = [source];
    await assert.rejects(indexer.indexRange({ config: c, store: live, to: 12 }));
    assert.equal(live.getCursor().lastIndexedBlock, 10); assert.deepEqual(live._getMeta('missing_ranges', []), []);
    known = true;
    c.sourceNodes.push('http://127.0.0.1:1/');
    await assert.rejects(indexer.indexRange({ config: c, store: live, to: 12 }));
    assert.equal(live.getCursor().lastIndexedBlock, 10); assert.equal(live.hasBlock(11), false);
    assert.deepEqual(live._getMeta('missing_ranges', []), []);
    assert.equal(live.getStatus().mode, 'error');
});

test('real HistorySource -> BlockProcessor -> StateEngine replays valid tail despite global gap and unavailable RPC', function(t) {
    var f = fixture(t), old = f.store('old'), live = f.store('live'); put(old, 1);
    var op = custom('char.attune', { name: 'Tail Mage', class: 'embercaster' });
    op[1].json = JSON.stringify({ p: 'VM', v: 2, t: 'char.attune', d: { name: 'Tail Mage', class: 'embercaster' } });
    put(live, 10, [op]);
    var ro = f.track(new ArchiveStore(old.rootDir, { readOnly: true }));
    var server = serverMod.createServer({ config: cfg(f, live, old), store: live, legacyStores: [ro] });
    function XHR() {}
    XHR.prototype.open = function(_method, target) { this.target = target; };
    XHR.prototype.send = function() {
        var response = request(server, new URL(this.target).pathname + new URL(this.target).search);
        this.status = response.status; this.responseText = JSON.stringify(response.body); this.readyState = 4;
        this.onreadystatechange();
    };
    XHR.prototype.abort = function() {};
    var vm = require('vm');
    var c = vm.createContext({ console: { log: function() {}, warn: function() {} }, XMLHttpRequest: XHR,
        setTimeout: function() { return 1; }, clearTimeout: function() {},
        viz: { api: { getBlock: function(_n, callback) { callback(new Error('RPC history unavailable')); } } } });
    ['config.js', 'protocols/vm-protocol.js', 'engine/character.js', 'engine/items.js', 'engine/validator.js', 'engine/state-engine.js', 'engine/block-processor.js', 'blockchain/history-source.js'].forEach(function(file) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/js', file), 'utf8'), c, { filename: file });
    });
    c.VizMagicConfig.HISTORY_ARCHIVE_MIRRORS = [{ apiBase: 'http://archive.fixture' }];
    var received = false;
    var proofResult = null;
    c.HistorySource.getProofBlock(10, function(err, recovered) {
        received = true; proofResult = { error: err, recovered: recovered };
    });
    assert.equal(received, true);
    assert.ifError(proofResult.error);
    assert.equal(proofResult.recovered.sourceOperationsComplete, true);
    assert.equal(proofResult.recovered.virtualReceiptsComplete, true);
    var processed = c.BlockProcessor.processBlock(proofResult.recovered, 10);
    var events = c.StateEngine.processBlock(processed);
    assert.ok(events.some(function(e) { return e.type === 'character_created'; }));
    assert.equal(c.StateEngine.getState().characters.mage.name, 'Tail Mage');
    var rangeRecovered = false;
    var rangeResult = null;
    c.HistorySource.getAllEventsRange({ start: 10, end: 10, protocol: 'VM', limit: 20 }, function(err, events, meta) {
        rangeRecovered = true; rangeResult = { error: err, events: events, meta: meta };
    });
    assert.equal(rangeRecovered, true);
    assert.ifError(rangeResult.error);
    assert.equal(rangeResult.events.length, 1);
    assert.equal(rangeResult.meta.sourceOperationsComplete, true);
    assert.equal(rangeResult.meta.virtualReceiptsComplete, true);
    assert.equal(request(server, '/v1/status').body.historyComplete, false);
});

test('complete valid-tail proof survives real client multipage boundary hydration with a global history gap', function(t) {
    var f = fixture(t), old = f.store('old'), live = f.store('live');
    put(old, 1);
    put(live, 10, [custom('post'), custom('post'), custom('post'), custom('post')]);
    put(live, 11, [custom('post'), custom('post'), custom('post')]);
    var ro = f.track(new ArchiveStore(old.rootDir, { readOnly: true }));
    var server = serverMod.createServer({ config: cfg(f, live, old), store: live, legacyStores: [ro] });
    function XHR() {}
    XHR.prototype.open = function(_method, target) { this.target = target; };
    XHR.prototype.abort = function() {};
    XHR.prototype.send = function() {
        var target = new URL(this.target);
        var response = request(server, target.pathname + target.search);
        this.status = response.status; this.responseText = JSON.stringify(response.body); this.readyState = 4;
        this.onreadystatechange();
    };
    var vm = require('vm');
    var context = vm.createContext({ XMLHttpRequest: XHR, setTimeout: function() { return 1; }, clearTimeout: function() {} });
    ['config.js', 'blockchain/history-source.js'].forEach(function(file) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/js', file), 'utf8'), context, { filename: file });
    });
    context.VizMagicConfig.HISTORY_ARCHIVE_MIRRORS = [{ apiBase: 'http://archive.fixture' }];
    var received = false;
    var observed = null;
    context.HistorySource.getAllEventsRange({ start: 10, end: 11, protocol: 'VM', limit: 2 }, function(err, events, meta) {
        received = true; observed = { error: err, events: events, meta: meta };
    });
    assert.equal(received, true);
    assert.ifError(observed.error);
    assert.equal(observed.events.length, 7);
    assert.equal(new Set(observed.events.map(function(e) { return e.id; })).size, 7);
    assert.equal(observed.meta.sourceOperationsComplete, true);
    assert.equal(observed.meta.virtualReceiptsComplete, true);
    var firstPage = request(server, '/v1/range?start=10&end=11&protocol=VM&limit=2').body;
    assert.equal(firstPage.historyComplete, false);
    assert.equal(firstPage.paginationExhausted, false);
    assert.equal(firstPage.complete, true);
});
