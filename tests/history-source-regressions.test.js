const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function test(name, fn) {
  try {
    fn();
    console.log('PASS ' + name);
  } catch (err) {
    console.error('FAIL ' + name + ': ' + err.message);
    process.exitCode = 1;
  }
}

const connectionJs = read('app/js/blockchain/connection.js');
const historySourceJs = read('app/js/blockchain/history-source.js');
const indexHtml = read('app/index.html');
const appJs = read('app/js/ui/app.js');
const vmProtocolJs = read('app/js/protocols/vm-protocol.js');
const ruJs = read('app/js/i18n/ru.js');
const enJs = read('app/js/i18n/en.js');
const configJs = read('app/js/config.js');

test('connection exposes non-fatal history capability probe', function () {
  assert.ok(/function checkHistoryCapability\(/.test(connectionJs), 'checkHistoryCapability helper missing');
  assert.ok(/historicalBlocks:\s*false/.test(connectionJs), 'capability object should default historicalBlocks to false');
  assert.ok(/head_block_number/.test(connectionJs), 'probe should use current chain head');
  assert.ok(/oldBlock/.test(connectionJs), 'probe should test an old block');
  assert.ok(/callback\(null, capability\)/.test(connectionJs), 'probe should return capability without hard-failing app');
});

test('history source module is loaded before protocol and app code', function () {
  assert.ok(/js\/blockchain\/history-source\.js/.test(indexHtml), 'history-source script missing from index');
  assert.ok(indexHtml.indexOf('js/blockchain/history-source.js') < indexHtml.indexOf('js/protocols/vm-protocol.js'), 'history source must load before VM protocol');
  assert.ok(indexHtml.indexOf('js/blockchain/history-source.js') < indexHtml.indexOf('js/ui/app.js'), 'history source must load before app controller');
});

test('history source wraps VIZ block/account access', function () {
  assert.ok(/var HistorySource/.test(historySourceJs), 'HistorySource module missing');
  assert.ok(/function getBlock\(blockNum, callback\)/.test(historySourceJs), 'getBlock API missing');
  assert.ok(/viz\.api\.getBlock/.test(historySourceJs), 'getBlock should use live VIZ RPC as first implementation');
  assert.ok(/_getBlockEventsFromMirrors\(blockNum, 0/.test(historySourceJs), 'getBlock should try archive event blocks before block payload mirrors');
  assert.ok(/_getBlockFromMirrors\(blockNum, 0, callback\)|_getBlockFromMirrors\(blockNum, 0, function/.test(historySourceJs), 'getBlock should fall back to archive block mirrors');
  assert.ok(/XMLHttpRequest/.test(historySourceJs), 'mirror fallback should use browser-safe XHR');
  assert.ok(/function getAccountProtocol\(account, protocol, callback\)/.test(historySourceJs), 'account protocol API missing');
  assert.ok(/getCapabilities/.test(historySourceJs), 'capabilities API missing');
  assert.ok(/function getEventsRange\(options, callback\)/.test(historySourceJs), 'archive event range API missing');
  assert.ok(/\/v1\/range/.test(historySourceJs), 'event range API should call archive range endpoint');
});

test('archive thin blocks preserve source completeness and receive_award virtual positions', function () {
  const context = {
    console: { log: function() {} },
    VizMagicConfig: { HISTORY_ARCHIVE_MIRRORS: [], PROTOCOLS: { VM: 'VM' } }
  };
  vm.createContext(context);
  vm.runInContext(historySourceJs, context, { filename: 'history-source.js' });
  const events = [
    { blockNum: 100, txIndex: 0, opIndex: 0, virtualOp: 0, txId: 'tx-100', opType: 'award', raw: { initiator: 'alice', receiver: 'null' } },
    { blockNum: 100, txIndex: 0, opIndex: 0, virtualOp: 1, txId: 'tx-100', opType: 'receive_award', raw: { initiator: 'alice', receiver: 'null', shares: '1.000000 SHARES' } }
  ];
  const block = context.HistorySource.eventsToThinBlock(events, {
    block_id: 'block-100', previous: 'block-99', sourceOperationsComplete: true, virtualReceiptsComplete: true
  });
  assert.strictEqual(block.sourceOperationsComplete, true);
  assert.strictEqual(block.virtualReceiptsComplete, true);
  assert.strictEqual(block.transactions[0].operations[0][0], 'award');
  assert.strictEqual(block.virtual_operations[0].virtual_op, 1);
  assert.strictEqual(block.virtual_operations[0].op[0], 'receive_award');
});

test('paginated range metadata preserves the exact requested coverage boundary', function () {
  function FakeXHR() { this.readyState = 0; this.status = 0; this.responseText = ''; }
  FakeXHR.prototype.open = function(_method, url) { this.url = url; };
  FakeXHR.prototype.send = function() {
    this.status = 200;
    this.readyState = 4;
    this.responseText = JSON.stringify({
      events: [], count: 0, complete: false, virtualReceiptsComplete: true,
      requestedStart: 101, requestedEnd: 120, indexedThrough: 200, virtualReceiptStartBlock: 83500000
    });
    this.onreadystatechange();
  };
  FakeXHR.prototype.abort = function() {};
  const context = {
    console: { log: function() {} }, setTimeout: function() { return 1; }, clearTimeout: function() {}, XMLHttpRequest: FakeXHR,
    VizMagicConfig: { HISTORY_ARCHIVE_MIRRORS: [{ apiBase: 'https://archive.example' }], PROTOCOLS: { VM: 'VM' } }
  };
  vm.createContext(context);
  vm.runInContext(historySourceJs, context, { filename: 'history-source.js' });
  let meta = null;
  context.HistorySource.getAllEventsRange({ start: 101, end: 120, protocol: 'VM', limit: 5000 }, function(err, _events, rangeMeta) {
    assert.ifError(err);
    meta = rangeMeta;
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(meta)), {
    sourceOperationsComplete: false,
    virtualReceiptsComplete: true,
    virtualReceiptStartBlock: 83500000,
    requestedStart: 101,
    requestedEnd: 120,
    indexedThrough: 200
  });
});

test('proof lookup falls back to the archive when live RPC throws before its callback', function () {
  function FakeXHR() { this.readyState = 0; this.status = 0; this.responseText = ''; }
  FakeXHR.prototype.open = function() {};
  FakeXHR.prototype.send = function() {
    this.status = 200;
    this.readyState = 4;
    this.responseText = JSON.stringify({ blockNum: 150, blockId: 'archive-150', previous: 'archive-149', timestamp: '2026-09-06T17:00:00', complete: true, count: 0, eventCount: 0, events: [] });
    this.onreadystatechange();
  };
  FakeXHR.prototype.abort = function() {};
  const context = {
    console: { log: function() {} }, setTimeout: function() { return 1; }, clearTimeout: function() {}, XMLHttpRequest: FakeXHR,
    viz: { api: { getBlock: function() { throw new Error('unknown transport'); } } },
    VizMagicConfig: { HISTORY_ARCHIVE_MIRRORS: [{ apiBase: 'https://archive.example' }], PROTOCOLS: { VM: 'VM' } }
  };
  vm.createContext(context);
  vm.runInContext(historySourceJs, context, { filename: 'history-source.js' });
  let result = null;
  assert.doesNotThrow(function() {
    context.HistorySource.getProofBlock(150, function(err, block) {
      assert.ifError(err);
      result = block;
    });
  });
  assert.strictEqual(result && result.block_id, 'archive-150');
});

test('MAGIC readiness requires healthy SQLite archive and complete virtual history through LIB', function () {
  const replies = [
    { ok: true, stale: false, readOnly: true, storage: 'sqlite', lastIndexedBlock: 110, lastIrreversibleBlock: 110, virtualReceiptStartBlock: 100 },
    { complete: true, virtualReceiptsComplete: true, indexedThrough: 110, virtualReceiptStartBlock: 100, events: [], count: 0 }
  ];
  const urls = [];
  function FakeXHR() { this.readyState = 0; this.status = 0; this.responseText = ''; }
  FakeXHR.prototype.open = function(method, url) { this.url = url; };
  FakeXHR.prototype.send = function() {
    urls.push(this.url);
    this.status = 200; this.readyState = 4; this.responseText = JSON.stringify(replies.shift()); this.onreadystatechange();
  };
  FakeXHR.prototype.abort = function() {};
  const context = {
    console: { log: function() {} }, setTimeout: function() { return 1; }, clearTimeout: function() {}, XMLHttpRequest: FakeXHR,
    VizMagicConfig: { HISTORY_ARCHIVE_MIRRORS: [{ apiBase: 'https://archive.example' }], PROTOCOLS: { VM: 'VM' } }
  };
  vm.createContext(context);
  vm.runInContext(historySourceJs, context, { filename: 'history-source.js' });
  let readiness = null;
  context.HistorySource.checkMagicMintReadiness(100, 110, function(err, value) { assert.ifError(err); readiness = value; });
  assert.strictEqual(readiness && readiness.ready, true);
  assert.ok(/\/health$/.test(urls[0]));
  assert.ok(/start=100/.test(urls[1]) && /end=110/.test(urls[1]) && /protocol=VT/.test(urls[1]));

  replies.push(
    { ok: true, stale: false, readOnly: true, storage: 'sqlite', lastIndexedBlock: 110, lastIrreversibleBlock: 110, virtualReceiptStartBlock: 100 },
    { complete: true, virtualReceiptsComplete: false, indexedThrough: 110, virtualReceiptStartBlock: 100, events: [], count: 0 }
  );
  context.HistorySource.checkMagicMintReadiness(100, 110, function(err, value) { assert.ifError(err); readiness = value; });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(readiness)), { ready: false, reason: 'archive_history_incomplete' });
});

test('archive mirror config is explicit and points at production nginx path', function () {
  assert.ok(/HISTORY_ARCHIVE_MIRRORS/.test(configJs), 'archive mirror config missing');
  assert.ok(/vizmagic\.web3blind\.xyz\/archive-mirror\/v1\/block\/\{block\}\.json/.test(configJs), 'production archive mirror URL missing');
  assert.ok(/vizmagic\.web3blind\.xyz\/archive-mirror\/v1\/events\/block\/\{block\}\.json/.test(configJs), 'production archive event URL missing');
  assert.ok(/timeoutMs:\s*8000/.test(configJs), 'mirror timeout should be explicit');
  assert.ok(/\{block\}/.test(configJs), 'mirror URL pattern should document block placeholder');
});

test('VIZ node order keeps api.viz.world as primary and node.viz.cx as fallback', function () {
  assert.ok(configJs.indexOf('https://api.viz.world/') < configJs.indexOf('https://node.viz.cx/'), 'api.viz.world should be first');
  assert.ok(/Primary node:/.test(connectionJs), 'connection should prefer the first configured node');
  assert.ok(!/cfg\.NODES\.forEach\(function\(node, index\)/.test(connectionJs), 'startup should not probe all fallback HTTP nodes eagerly');
});

test('old-history recovery no longer calls viz.api.getBlock directly', function () {
  assert.ok(/_getHistoryBlock\(blockNum/.test(appJs), 'app should use history block helper for recovery blocks');
  assert.ok(/HistorySource\.getBlock/.test(appJs), 'app should route historical block fetches through HistorySource');
  assert.ok(!/function _recoverChainHistory[\s\S]*?viz\.api\.getBlock\(blockNum/.test(appJs), 'current-user recovery should not call viz.api.getBlock(blockNum) directly');
});

test('VM chain traversal uses injectable history source for block fetches', function () {
  assert.ok(/var source = blockSource/.test(vmProtocolJs), 'traverseChain should accept/use a source dependency');
  assert.ok(/HistorySource/.test(vmProtocolJs), 'traverseChain should use HistorySource by default when available');
  assert.ok(/source\.getBlock\(blockNum/.test(vmProtocolJs), 'recursive action fetch should call source.getBlock');
});

test('VM chain traversal stays on the requested account when a block contains other senders', function () {
  const context = {
    console: { log: function() {} },
    VizMagicConfig: { PROTOCOLS: { VM: 'VIZMAGIC', V: 'V', VE: 'VE' }, APP_VERSION: 1, ACTION_TYPES: {} },
    VizAccount: {
      getAccountProtocol: function(account, protocol, callback) {
        callback(null, { custom_sequence_block_num: 200 });
      }
    }
  };
  const blocks = {
    200: { transactions: [{ operations: [
      ['custom', { id: 'VIZMAGIC', required_regular_auths: ['alice'], json: JSON.stringify({ p: 'VIZMAGIC', b: 100, t: 'rest', d: {} }) }],
      ['custom', { id: 'VIZMAGIC', required_regular_auths: ['bob'], json: JSON.stringify({ p: 'VIZMAGIC', b: 150, t: 'move', d: {} }) }]
    ] }] },
    150: { transactions: [{ operations: [[
      'custom', { id: 'VIZMAGIC', required_regular_auths: ['bob'], json: JSON.stringify({ p: 'VIZMAGIC', b: 0, t: 'rest', d: {} }) }
    ]] }] },
    100: { transactions: [{ operations: [[
      'custom', { id: 'VIZMAGIC', required_regular_auths: ['alice'], json: JSON.stringify({ p: 'VIZMAGIC', b: 0, t: 'library.unlock', d: { chapter: 'chapter2' } }) }
    ]] }] }
  };
  const source = { getBlock: function(blockNum, callback) { callback(null, blocks[blockNum] || null); } };
  vm.createContext(context);
  vm.runInContext(vmProtocolJs, context, { filename: 'vm-protocol.js' });
  let recovered = null;
  context.VMProtocol.traverseChain('alice', 10, function(err, actions) {
    assert.ifError(err);
    recovered = actions;
  }, source);
  assert.ok(recovered, 'traversal callback should complete synchronously in the fixture');
  assert.deepStrictEqual(Array.from(recovered, function(entry) { return entry.sender; }), ['alice', 'alice']);
  assert.deepStrictEqual(Array.from(recovered, function(entry) { return entry.blockNum; }), [200, 100]);
  assert.strictEqual(recovered[1].action.type, 'library.unlock');
});

test('archive account action lookup paginates beyond the latest 5000 actions', function () {
  assert.ok(/function findAccountAction\(account, protocol, actionType, callback\)/.test(historySourceJs), 'targeted account-action lookup should exist');
  assert.ok(/account=/.test(historySourceJs), 'archive range URL should support account filtering');
  assert.ok(/events.length >= pageLimit/.test(historySourceJs) && /oldestBlock - 1/.test(historySourceJs), 'lookup should continue to older pages when one page is full');
  assert.ok(/event.type === actionType/.test(historySourceJs), 'lookup should match the requested action type');
  assert.ok(/VMProtocol\.traverseChain\(account, 100/.test(historySourceJs), 'lookup should cover recent actions that the archive indexer has not stored yet');
  assert.ok(/getAccountProtocol\(account, protocol/.test(historySourceJs) && /if \(pointerErr\)/.test(historySourceJs), 'recent-history preflight should fail closed when the live protocol pointer cannot be checked');
  assert.ok(/history-source\.js\?v=20260823b-20260905d-20260906d/.test(indexHtml), 'targeted history lookup should be cache-busted');
});

test('account-history RPC recovers a recent canonical action when archive retention is incomplete', function () {
  const requests = [];
  function FakeXHR() { this.readyState = 0; this.status = 0; this.responseText = ''; this.response = ''; }
  FakeXHR.prototype.open = function(method, url) { this.method = method; this.url = url; };
  FakeXHR.prototype.setRequestHeader = function() {};
  FakeXHR.prototype.send = function(body) {
    requests.push({ method: this.method, url: this.url, body: body || '' });
    this.status = 200;
    this.readyState = 4;
    if (this.method === 'POST') {
      this.responseText = JSON.stringify({ result: [[8, {
        trx_id: 'canonical-hunt-tx', block: 83186016, trx_in_block: 0, op_in_trx: 1, virtual_op: 0,
        op: ['custom', { id: 'VM', required_active_auths: [], required_regular_auths: ['alice'], json: JSON.stringify({ p: 'VM', v: 2, t: 'hunt', d: { creature: 'hollow_shade', spell: 'stone_wall', energy: 100 } }) }]
      }]] });
    } else {
      this.responseText = JSON.stringify({ events: [], count: 0, complete: false, requestedStart: 1, requestedEnd: 2147483647, indexedThrough: 83186040 });
    }
    this.response = this.responseText;
    this.onreadystatechange();
  };
  FakeXHR.prototype.abort = function() {};
  const context = {
    console: { log: function() {} }, setTimeout: function() { return 1; }, clearTimeout: function() {}, XMLHttpRequest: FakeXHR,
    VizMagicConfig: { NODES: ['https://api.example/'], HISTORY_ARCHIVE_MIRRORS: [{ apiBase: 'https://archive.example' }], PROTOCOLS: { VM: 'VM' } },
    VizAccount: { getAccountProtocol: function(_account, _protocol, callback) { callback(null, null); } },
    VMProtocol: { traverseChain: function() { throw new Error('metadata traversal must not replace canonical account history'); } }
  };
  vm.createContext(context);
  vm.runInContext(historySourceJs, context, { filename: 'history-source.js' });
  let found = null;
  context.HistorySource.findAccountAction('alice', 'VM', 'hunt', function(err, event) {
    assert.ifError(err);
    found = event;
  }, function(event) {
    return event && event.payload && event.payload.d && event.payload.d.creature === 'hollow_shade';
  });
  assert.strictEqual(found && found.txId, 'canonical-hunt-tx');
  assert.strictEqual(found && found.blockNum, 83186016);
  assert.ok(requests.some(function(request) { return request.method === 'POST' && /get_account_history/.test(request.body); }));
});

test('archive account lookup behavior finds an unlock on an older page', function () {
  const urls = [];
  function FakeXHR() { this.readyState = 0; this.status = 0; this.responseText = ''; }
  FakeXHR.prototype.open = function(method, url) { this.url = url; };
  FakeXHR.prototype.send = function() {
    urls.push(this.url);
    let events;
    if (urls.length === 1) {
      events = Array.from({ length: 5000 }, function(_, index) {
        return { blockNum: 6000 - index, type: 'rest', payload: { t: 'rest' } };
      });
    } else {
      events = [{ blockNum: 500, type: 'library.unlock', sender: 'alice', payload: { t: 'library.unlock' } }];
    }
    this.status = 200;
    this.readyState = 4;
    this.responseText = JSON.stringify({ events: events });
    this.onreadystatechange();
  };
  FakeXHR.prototype.abort = function() {};
  const context = {
    console: { log: function() {} },
    setTimeout: function() { return 1; },
    clearTimeout: function() {},
    XMLHttpRequest: FakeXHR,
    VizMagicConfig: {
      HISTORY_ARCHIVE_MIRRORS: [{ apiBase: 'https://archive.example' }],
      PROTOCOLS: { VM: 'VM' }
    },
    VMProtocol: { traverseChain: function() { throw new Error('recent fallback should not run after archive hit'); } }
  };
  vm.createContext(context);
  vm.runInContext(historySourceJs, context, { filename: 'history-source.js' });
  let found = null;
  context.HistorySource.findAccountAction('alice', 'VM', 'library.unlock', function(err, event) {
    assert.ifError(err);
    found = event;
  });
  assert.strictEqual(found && found.blockNum, 500);
  assert.strictEqual(urls.length, 2);
  assert.ok(/account=alice/.test(urls[0]));
  assert.ok(/end=1000/.test(urls[1]), 'second page should end before the oldest block from page one');
});

test('account action lookup skips newer actions rejected by an exact-day matcher', function () {
  function FakeXHR() { this.readyState = 0; this.status = 0; this.responseText = ''; }
  FakeXHR.prototype.open = function() {};
  FakeXHR.prototype.send = function() {
    this.status = 200;
    this.readyState = 4;
    this.responseText = JSON.stringify({ events: [
      { blockNum: 650, type: 'library.unlock', sender: 'alice', payload: { t: 'library.unlock', d: { chapter: 'chapter2', day: '2026-08-23' } } },
      { blockNum: 700, type: 'library.unlock', sender: 'alice', payload: { t: 'library.unlock', d: { chapter: 'chapter2', day: '2026-08-24' } } }
    ] });
    this.onreadystatechange();
  };
  FakeXHR.prototype.abort = function() {};
  const context = {
    console: { log: function() {} }, setTimeout: function() { return 1; }, clearTimeout: function() {},
    XMLHttpRequest: FakeXHR,
    VizMagicConfig: { HISTORY_ARCHIVE_MIRRORS: [{ apiBase: 'https://archive.example' }], PROTOCOLS: { VM: 'VM' } },
    VMProtocol: { traverseChain: function() { throw new Error('fallback should not run'); } }
  };
  vm.createContext(context);
  vm.runInContext(historySourceJs, context, { filename: 'history-source.js' });
  let found = null;
  context.HistorySource.findAccountAction('alice', 'VM', 'library.unlock', function(err, event) {
    assert.ifError(err); found = event;
  }, function(event) {
    return event && event.payload && event.payload.d && event.payload.d.day === '2026-08-23';
  });
  assert.strictEqual(found && found.blockNum, 650, 'newer future-day action must not hide today’s valid proof');
});

test('account action preflight fails closed when recent protocol lookup fails', function () {
  function EmptyXHR() { this.readyState = 0; this.status = 0; this.responseText = ''; }
  EmptyXHR.prototype.open = function() {};
  EmptyXHR.prototype.send = function() {
    this.status = 200;
    this.readyState = 4;
    this.responseText = JSON.stringify({ events: [] });
    this.onreadystatechange();
  };
  EmptyXHR.prototype.abort = function() {};
  const context = {
    console: { log: function() {} },
    setTimeout: function() { return 1; },
    clearTimeout: function() {},
    XMLHttpRequest: EmptyXHR,
    VizMagicConfig: {
      HISTORY_ARCHIVE_MIRRORS: [{ apiBase: 'https://archive.example' }],
      PROTOCOLS: { VM: 'VM' }
    },
    VizAccount: {
      getAccountProtocol: function(account, protocol, callback) { callback(new Error('rpc unavailable')); }
    },
    VMProtocol: { traverseChain: function() { throw new Error('traversal must not run after pointer error'); } }
  };
  vm.createContext(context);
  vm.runInContext(historySourceJs, context, { filename: 'history-source.js' });
  let resultError = null;
  context.HistorySource.findAccountAction('alice', 'VM', 'library.unlock', function(err) { resultError = err; });
  assert.ok(resultError);
  assert.match(String(resultError.message || resultError), /rpc unavailable/);
});

test('degraded-mode copy exists in both languages', function () {
  assert.ok(/conn_history_limited/.test(ruJs), 'Russian history-limited copy missing');
  assert.ok(/conn_history_limited/.test(enJs), 'English history-limited copy missing');
  assert.ok(/archive|архив/i.test(ruJs + enJs), 'copy should mention archive mirror/source');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
