'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var os = require('node:os');
var path = require('node:path');
var parser = require('../tools/archive-node/parser');
var ArchiveStore = require('../tools/archive-node/storage').ArchiveStore;
var serverMod = require('../tools/archive-node/server');

function custom(type, data, protocol, sender) {
    return ['custom', { id: protocol || 'VM', required_regular_auths: [sender || 'mage'], required_active_auths: [], json: JSON.stringify({ t: type, d: data || {} }) }];
}
function block(operations, id, previous) {
    return { block_id: id || 'block-1', previous: previous || '', timestamp: '2026-11-12T00:00:00', transactions: [{ transaction_id: 'tx-fixture', operations: operations }] };
}
function fixture(t) {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-security-'));
    var store = new ArchiveStore(dir);
    t.after(function() { store.db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
    return store;
}
function request(server, target) {
    var result = { headers: {} };
    var res = {
        setHeader: function(k, v) { result.headers[k] = v; },
        writeHead: function(status, headers) { result.status = status; Object.assign(result.headers, headers); },
        end: function(body) { result.body = body ? JSON.parse(body) : null; }
    };
    server.emit('request', { method: 'GET', url: target }, res);
    assert.ok(result.status, 'handler completed response synchronously');
    return result;
}

test('mixed block retains ordered VM/V/VE/VT, unknown strings and monetary proofs; rejects non-string types', function(t) {
    var store = fixture(t);
    var award = ['award', { initiator: 'mage', receiver: 'author', energy: 100, memo: 'viz://vm/temple/light' }];
    store.setVirtualReceiptStartBlock(1);
    var operations = [custom('char.attune'), custom({ invalid: true }), custom('post', { text: 'valid' }, 'V'), custom(['bad']), custom('edit', {}, 'VE'), custom(7), custom('future.action'), award, custom('mint.intent', {}, 'VT')];
    var source = block(operations);
    var events = parser.extractGameEvents(source, 1);
    assert.deepEqual(events.map(function(e) { return e.opIndex; }), [0, 2, 4, 6, 7, 8]);
    assert.deepEqual(events.map(function(e) { return e.type; }), ['char.attune', 'post', 'edit', 'future.action', 'award', 'mint.intent']);
    store.putBlockWithEvents(1, source, 'fixture', events, { virtualComplete: true });
    store.setCursor(1);
    var rows = store.queryEvents({ start: 1, end: 1, limit: 100 });
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.find(function(e) { return e.opType === 'award'; }).raw, award[1]);
    // Replacing the identical block must not duplicate events or account links.
    store.putBlockWithEvents(1, source, 'fixture', events, { virtualComplete: true });
    assert.equal(store.queryEvents({ start: 1, end: 1, limit: 100 }).length, 6);
    var second = block([custom('future.second')], 'block-2', 'block-1');
    store.putBlockWithEvents(2, second, 'fixture', parser.extractGameEvents(second, 2), { virtualComplete: true });
    store.setCursor(2);
    assert.equal(store.getCursor().lastIndexedBlock, 2);
    assert.equal(store.isBlockRangeComplete(1, 2), true);
    assert.equal(store.isVirtualRangeComplete(1, 2), true);
    var thin = store.getBlockRecord(1);
    assert.equal(thin.block.block_id, 'block-1');
    assert.deepEqual(thin.block.transactions[0].operations[7], award);
    assert.equal(thin.block.transactions[0].operations[1], null);
    assert.deepEqual(thin.block.transactions[0].operations[8], operations[8]);
    assert.equal(store.isBlockRangeComplete(1, 3), false);
    assert.equal(store.isVirtualRangeComplete(1, 3), false);
    // SQL failures are still surfaced and rolled back, never silently dropped.
    var bad = parser.extractGameEvents(block([custom('valid')], 'block-3', 'block-2'), 3);
    bad[0].type = { forcedStorageFailure: true };
    assert.throws(function() { store.putBlockWithEvents(3, block([], 'block-3', 'block-2'), 'fixture', bad); });
    assert.equal(store.hasBlock(3), false);
    assert.equal(store.getCursor().lastIndexedBlock, 2);
    assert.equal(store.queryEvents({ start: 1, end: 2, limit: 100 }).length, 7);
});

test('directory safely replays stored malformed guild events without losing legitimate names, charters or membership', function(t) {
    var store = fixture(t);
    var charter = { membership: 'invite', tithe_pct: 250, min_shares: 12, future: 'preserved' };
    var operations = [
        custom('guild.create', { id: 'legit', name: 'Орден Света', tag: 'SUN', charter: charter }),
        custom('guild.invite', { guild_id: '__proto__', target: 'guest' }),
        custom('guild.invite', { guild_id: 'constructor', target: 'guest' }),
        custom('guild.create', { id: { toString: null }, name: 'bad' }),
        custom('guild.create', { id: 'bad-name', name: { toString: null } }),
        custom('guild.create', { id: 'bad-tag', name: 'bad', tag: { toString: null } }),
        custom('guild.listing', { guild_id: 'legit', created_block: { toString: null } }),
        custom('guild.invite', { guild_id: 'legit', target: { toString: null } }),
        custom('guild.invite', { guild_id: 'legit', target: 'guest' }),
        custom('guild.accept', { guild_id: 'legit' }, 'VM', 'guest'),
        custom('guild.promote', { guild_id: 'legit', target: 'guest', rank: 'elder' }),
        custom('guild.announce', { guild_id: 'legit', text: 'Добро пожаловать' }),
        custom('guild.listing', { guild_id: 'legit', created_block: 1 })
    ];
    var source = block(operations);
    store.putBlockWithEvents(1, source, 'fixture', parser.extractGameEvents(source, 1));
    var directory = serverMod.buildGuildDirectory(store, {});
    assert.equal(directory.guilds.legit.name, 'Орден Света');
    assert.deepEqual(directory.guilds.legit.charter, charter);
    assert.equal(directory.guilds.legit.members.guest.rank, 'elder');
    assert.equal(directory.guilds.legit.memberCount, 2);
    assert.deepEqual(directory.guilds.legit.announcements, ['Добро пожаловать']);
    assert.equal(directory.guilds['bad-name'], undefined);
    assert.equal(directory.guilds['bad-tag'], undefined);
    assert.equal(directory.guilds.constructor.invites.guest.inviter, 'mage');
    assert.equal(directory.guilds.__proto__.invites.guest.inviter, 'mage');
    assert.equal(Object.prototype.invites, undefined);
    var server = serverMod.createServer({ config: {}, store: store });
    assert.equal(request(server, '/v1/guilds').status, 200);
});

test('malformed UTF-8 gets 400 on all account routes; next valid request still succeeds with once-only decoding', function(t) {
    var store = fixture(t);
    var source = block([custom('future.action')]);
    store.putBlockWithEvents(1, source, 'fixture', parser.extractGameEvents(source, 1));
    var server = serverMod.createServer({ config: {}, store: store });
    ['%E0%A4%A', '%FF', '%C0%AF', '%ED%A0%80', '%'].forEach(function(bad) {
        ['/v1/account/' + bad + '/protocol/VM/actions', '/v1/account/mage/protocol/' + bad + '/latest', '/v1/account/' + bad + '/protocol/VM/latest', '/v1/magic/account/' + bad + '/history'].forEach(function(target) {
            var result = request(server, target);
            assert.equal(result.status, 400, target);
            assert.equal(result.headers['Cache-Control'], 'no-store');
            var next = request(server, '/v1/account/mage/protocol/VM/actions');
            assert.equal(next.status, 200);
            assert.equal(next.body.actions.length, 1);
        });
    });
    assert.equal(request(server, '/archive-mirror/v1/account/%6Dage/protocol/%56M/latest').body.latest.type, 'future.action');
    assert.equal(request(server, '/v1/account/%25FF/protocol/VM/actions').body.account, '%FF');
});
