'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'app/js/ui/app.js'), 'utf8');
const historySourceJs = fs.readFileSync(path.join(root, 'app/js/blockchain/history-source.js'), 'utf8');

function makeContext(rangeReply) {
  const status = {
    textContent: '',
    classList: { add: function() {}, remove: function() {} }
  };
  const state = { headBlock: 100, recovery: {}, characters: { alice: {} }, appliedBlocks: [] };
  const context = {
    console: { log: function() {} },
    setTimeout: function(fn) { fn(); return 1; },
    clearTimeout: function() {},
    setInterval: function() { return 1; },
    clearInterval: function() {},
    window: { addEventListener: function() {} },
    document: { addEventListener: function() {} },
    VizMagicConfig: {
      STORAGE_PREFIX: 'test_',
      HISTORY_ARCHIVE_MIRRORS: [],
      TOKEN: { ACTIVATION_BLOCK: 83500000 },
      PROTOCOLS: { VM: 'VM', V: 'V', VE: 'VE', VT: 'VT' },
      ACTION_TYPES: { LIBRARY_UNLOCK: 'library.unlock' },
      LIBRARY: {}
    },
    Helpers: {
      $: function(id) { return id === 'connection-status' ? status : null; },
      EventBus: { emit: function() {} },
      t: function(key, params) {
        params = params || {};
        return key + ' ' + String(params.processed || '') + ' ' + String(params.target || '') + ' ' + String(params.percent || '');
      }
    },
    VizAccount: {
      getCurrentUser: function() { return 'alice'; },
      setProgressionRecoveryPending: function() {}
    },
    StateEngine: {
      getState: function() { return state; },
      processBlock: function(processed) {
        if (processed && processed.vmActions && processed.vmActions.length && state.appliedBlocks.indexOf(processed.blockNum) === -1) {
          state.appliedBlocks.push(processed.blockNum);
        }
        return [];
      },
      advanceHead: function(blockNum) { state.headBlock = blockNum; },
      saveCheckpoint: function(callback) { callback(null); },
      setRecoveryStatus: function(account, statusValue, reason) {
        state.recovery[account] = { status: statusValue, reason: reason };
      }
    },
    BlockProcessor: {
      processBlock: function(block, blockNum) {
        return { blockNum: blockNum, vmActions: block && block.__sender ? [{ sender: block.__sender, action: { type: 'rest' } }] : [], veEvents: [], awards: [] };
      }
    },
    ActionProof: {
      createVerifier: function() { return { verify: function() { return { valid: true }; } }; },
      isPaidAction: function() { return false; }
    }
  };
  vm.createContext(context);
  vm.runInContext(historySourceJs, context, { filename: 'history-source.js' });
  context.HistorySource.getArchiveHead = function(callback) { callback(null, 200); };
  context.HistorySource.getAllEventsRange = function(_options, callback) {
    callback(null, rangeReply.events || [], rangeReply.meta || {});
  };
  vm.runInContext(appJs, context, { filename: 'app.js' });
  return { context: context, state: state, status: status };
}

function runArchiveBatch(fixture, start, end) {
  let result = null;
  fixture.context.App.processArchiveEventBatch(start, end, end, function(used, detail) {
    result = { used: used, detail: detail || null };
  });
  return result;
}

(function catchupUsesLargeMirrorBatchesAndVisibleBlockProgress() {
  const fixture = makeContext({ events: [], meta: {} });
  assert.strictEqual(fixture.context.App.nextCatchupBatchEnd(101, 20100), 5100, 'large mirror catch-up should request 5000 blocks per batch');
  fixture.context.App.updateSyncStatus(25, false, 5100, 20100);
  assert.match(fixture.status.textContent, /5100/);
  assert.match(fixture.status.textContent, /20100/);
  console.log('PASS catch-up exposes processed and target blocks while using bounded large batches');
})();

(function incompleteRangeNeverAdvancesContiguousHead() {
  const fixture = makeContext({
    events: [],
    meta: {
      sourceOperationsComplete: false,
      virtualReceiptsComplete: true,
      requestedStart: 101,
      requestedEnd: 120,
      indexedThrough: 200
    }
  });
  const result = runArchiveBatch(fixture, 101, 120);
  assert.strictEqual(result && result.used, false, 'an incomplete retained range must be rejected');
  assert.strictEqual(fixture.state.headBlock, 100, 'incomplete archive coverage must not jump the contiguous cursor');
  assert.strictEqual(result.detail && result.detail.reason, 'history_gap');
  console.log('PASS incomplete archive range preserves the last contiguous checkpoint');
})();

(function completeSparseRangeAdvancesAfterDeterministicReplay() {
  const fixture = makeContext({
    events: [{
      id: '120:0:0:0:VM:rest:alice', blockNum: 120, txIndex: 0, opIndex: 0,
      opType: 'custom', protocol: 'VM', raw: {
        id: 'VM', required_regular_auths: ['alice'],
        json: JSON.stringify({ p: 'VM', v: 2, t: 'rest', d: {} })
      }
    }],
    meta: {
      sourceOperationsComplete: true,
      virtualReceiptsComplete: true,
      requestedStart: 101,
      requestedEnd: 120,
      indexedThrough: 200
    }
  });
  const result = runArchiveBatch(fixture, 101, 120);
  assert.strictEqual(result && result.used, true);
  assert.strictEqual(fixture.state.headBlock, 120);
  console.log('PASS complete sparse archive range advances after replay');
})();

(function authoritativeAccountActionsRecoverAcrossBlockedGlobalGapWithoutCursorJump() {
  const fixture = makeContext({ events: [], meta: {} });
  const requested = [];
  const proofBlocks = [];
  fixture.context.HistorySource.getAllEventsRange = function(options, callback) {
    requested.push(options);
    callback(null, [
      { id: '160:0:1:0:VM:hunt:alice', blockNum: 160, txIndex: 0, opIndex: 1, opType: 'custom', protocol: 'VM', sender: 'alice' },
      { id: '150:0:1:0:VM:hunt:alice', blockNum: 150, txIndex: 0, opIndex: 1, opType: 'custom', protocol: 'VM', sender: 'alice' }
    ], { sourceOperationsComplete: false, requestedStart: 101, requestedEnd: 200, indexedThrough: 200 });
  };
  fixture.context.HistorySource.getProofBlock = function(blockNum, callback) {
    proofBlocks.push(blockNum);
    callback(null, { __sender: 'alice', previous: 'proof-' + (blockNum - 1), timestamp: '2026-09-06T17:00:00', transactions: [] });
  };
  let result = null;
  fixture.context.App.recoverAccountActionsAcrossGap(101, 200, function(err, value) {
    assert.ifError(err);
    result = value;
  });
  assert.strictEqual(requested.length, 1);
  assert.strictEqual(requested[0].account, 'alice');
  assert.strictEqual(requested[0].protocol, 'VM');
  assert.deepStrictEqual(proofBlocks, [150, 160], 'canonical proof blocks must replay chronologically');
  assert.deepStrictEqual(fixture.state.appliedBlocks, [150, 160]);
  assert.strictEqual(fixture.state.headBlock, 100, 'account-only recovery cannot claim contiguous global history');
  assert.strictEqual(result && result.targetBlock, 200);
  assert.strictEqual(result && result.historyComplete, false, 'partial account recovery must not claim the unavailable global prefix');
  console.log('PASS account actions recover independently across an unavailable global prefix');
})();

(function blockedCatchupPublishesHonestRecoverableState() {
  const fixture = makeContext({ events: [], meta: {} });
  fixture.context.HistorySource.getAllEventsRange = function(_options, callback) {
    callback(null, [{ blockNum: 150, sender: 'alice', protocol: 'VM', opType: 'custom' }], { sourceOperationsComplete: false });
  };
  fixture.context.HistorySource.getProofBlock = function(blockNum, callback) {
    callback(null, { __sender: 'alice', previous: 'proof-' + blockNum, transactions: [] });
  };
  fixture.context.App.handleCatchupFailure(101, 120, 200, { reason: 'history_gap' });
  assert.strictEqual(fixture.state.headBlock, 100);
  assert.strictEqual(fixture.state.recovery.alice.status, 'pending');
  assert.strictEqual(fixture.state.recovery.alice.partialAccountRecovery, 'verified_actions_only');
  assert.strictEqual(fixture.state.recovery.alice.partialActionBlocks, 1);
  assert.match(fixture.status.textContent, /100/);
  assert.match(fixture.status.textContent, /200/);
  console.log('PASS blocked catch-up reports the contiguous cursor and verified partial account recovery');
})();
