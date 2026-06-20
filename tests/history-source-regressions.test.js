const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

test('degraded-mode copy exists in both languages', function () {
  assert.ok(/conn_history_limited/.test(ruJs), 'Russian history-limited copy missing');
  assert.ok(/conn_history_limited/.test(enJs), 'English history-limited copy missing');
  assert.ok(/archive|архив/i.test(ruJs + enJs), 'copy should mention archive mirror/source');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
