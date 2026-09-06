'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');

function load(files, extra) {
    var c = Object.assign({ console: console }, extra || {});
    vm.createContext(c);
    files.forEach(function(file) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
    });
    return c;
}

var c = load([
    'app/js/config.js',
    'app/js/protocols/vt-protocol.js',
    'app/js/engine/magic-ledger.js',
    'app/js/engine/marketplace.js'
]);
var P = c.VTProtocol;
var L = c.MagicLedger;
var activation = c.VizMagicConfig.TOKEN.ACTIVATION_BLOCK;
function context(through) { return { activationBlock: activation, completeFrom: activation, completeThrough: through }; }

function vtEntry(sender, action, tx, op) {
    if (action && !action.type) action = P.parseAction(action);
    return {
        sender: sender,
        regularAuths: [sender],
        activeAuths: [],
        txId: 'tx-' + tx,
        txIndex: tx,
        opIndex: op,
        action: action
    };
}

function mintBlock(number, hash, sender, intent, amountMilli, withProof) {
    var action = P.createMintAction(intent, 'transfer', P.formatAmount(amountMilli));
    return {
        blockNum: number,
        blockHash: hash,
        vtActions: [vtEntry(sender, action, 0, 1)],
        transfers: withProof ? [{
            from: sender,
            to: 'null',
            amountMilli: amountMilli,
            symbol: 'VIZ',
            memo: P.mintMemo(intent),
            txIndex: 0,
            opIndex: 0
        }] : [],
        fixedAwards: [],
        burnProofs: []
    };
}

(function finalizedFloorRejectsOldReplayAfterPruningAndReload() {
    var state = L.createState();
    var original = mintBlock(activation, 'mint-floor', 'alice', 'floor-mint', 1000, true);
    assert.strictEqual(L.ingestBlock(state, original), true);
    L.finalizeThrough(state, activation, context(activation));
    assert.strictEqual(L.getBalance(state, 'alice'), 1000);
    L.finalizeThrough(state, activation + 5000, context(activation + 5000));
    var loaded = L.createState(JSON.parse(JSON.stringify(state)));
    assert.strictEqual(L.ingestBlock(loaded, original), false, 'a checkpoint must reject a block at or below its finalized floor after dedup pruning');
    L.finalizeThrough(loaded, activation + 5000, context(activation + 5000));
    assert.strictEqual(L.getBalance(loaded, 'alice'), 1000);
}());

(function finalityWithoutACompleteAuthoritativeRangeDoesNotAdvance() {
    var state = L.createState();
    var original = mintBlock(activation + 5, 'incomplete-range', 'alice', 'range-mint', 1000, true);
    L.ingestBlock(state, original);
    assert.strictEqual(L.finalizeThrough(state, activation + 5, { activationBlock: activation }), 0);
    assert.strictEqual(state.finalizedBlock, activation - 1);
    assert.strictEqual(L.getBalance(state, 'alice'), 0);
    assert.ok(state.pendingBlocks[activation + 5]);
}());

(function aGapInAuthoritativeHistoryRequiresReplayInsteadOfSkippingEconomy() {
    var state = L.createState();
    var block = mintBlock(activation + 2, 'history-gap', 'alice', 'gap-mint', 1000, true);
    L.ingestBlock(state, block);
    assert.strictEqual(L.finalizeThrough(state, activation + 2, {
        activationBlock: activation, completeFrom: activation + 2, completeThrough: activation + 2
    }), 0);
    assert.strictEqual(state.replayRequired, true);
    assert.strictEqual(L.getBalance(state, 'alice'), 0);
}());

(function replayStartsAtThePersistedCurrencyFloorInsteadOfARecentWindow() {
    var fresh = L.createState();
    assert.strictEqual(L.getReplayStart(fresh, activation + 5000, activation + 10000, activation), activation - 1);
    var checkpoint = L.createState({ supplyMilli: 10, balances: { alice: 10 }, finalizedBlock: activation + 123 });
    assert.strictEqual(L.getReplayStart(checkpoint, activation + 5000, activation + 10000, activation), activation + 123);
    checkpoint.replayRequired = true;
    assert.strictEqual(L.getReplayStart(checkpoint, activation + 5000, activation + 10000, activation), activation + 5000);
    assert.strictEqual(L.getReplayStart(fresh, activation - 100, activation - 1, activation), activation - 100);
}());

(function unresolvedMintBlocksLaterEconomyUntilHydrated() {
    var missing = mintBlock(activation + 10, 'missing-proof', 'alice', 'hydrate-mint', 1000, false);
    var transfer = {
        blockNum: activation + 11,
        blockHash: 'later-transfer',
        vtActions: [vtEntry('alice', P.createTransferAction('bob', '0.100', 'after-hydration'), 0, 0)],
        transfers: [], fixedAwards: [], burnProofs: []
    };
    var state = L.createState();
    L.ingestBlock(state, missing);
    L.ingestBlock(state, transfer);
    L.finalizeThrough(state, activation + 11, context(activation + 11));
    assert.strictEqual(L.getBalance(state, 'alice'), 0, 'unresolved mint must not partially commit');
    assert.strictEqual(L.getBalance(state, 'bob'), 0, 'later transfer must wait behind unresolved earlier evidence');
    assert.ok(state.pendingBlocks[activation + 10], 'missing-evidence block must remain hydratable');
    assert.ok(state.pendingBlocks[activation + 11], 'later economic block must remain pending in chronology');

    var hydrated = mintBlock(activation + 10, 'missing-proof', 'alice', 'hydrate-mint', 1000, true);
    assert.strictEqual(L.ingestBlock(state, hydrated), true);
    L.finalizeThrough(state, activation + 11, context(activation + 11));

    var full = L.createState();
    L.ingestBlock(full, hydrated);
    L.ingestBlock(full, transfer);
    L.finalizeThrough(full, activation + 11, context(activation + 11));
    assert.strictEqual(JSON.stringify(state.balances), JSON.stringify(full.balances));
    assert.strictEqual(state.supplyMilli, full.supplyMilli);
    assert.strictEqual(JSON.stringify(state.history), JSON.stringify(full.history));
}());

(function longLivedDedupMapsAreBoundedByFinalizedFloor() {
    var source = { supplyMilli: 0, balances: {}, finalizedBlock: activation };
    source.mintIntents = {};
    source.transferNonces = {};
    for (var i = 0; i < 3000; i++) {
        source.mintIntents['alice:m' + i] = activation - 3000 + i;
        source.transferNonces['alice:n' + i] = activation - 3000 + i;
    }
    var state = L.createState(source);
    L.finalizeThrough(state, activation + 5000, context(activation + 5000));
    assert.ok(Object.keys(state.mintIntents).length <= 2001, 'mint intent cache must be bounded after finality advances');
    assert.ok(Object.keys(state.transferNonces).length <= 2001, 'transfer nonce cache must be bounded after finality advances');
}());

(function unresolvedPendingRangeFailsClosedBeforeGrowingWithoutBound() {
    var state = L.createState();
    for (var i = 0; i <= 200; i++) {
        var action = P.createMintAction('missing-' + i, 'transfer', '0.001');
        L.ingestBlock(state, {
            blockNum: activation + i,
            blockHash: 'missing-block-' + i,
            vtActions: [vtEntry('alice', action, 0, 0)],
            transfers: [], fixedAwards: [], burnProofs: []
        });
    }
    assert.strictEqual(state.replayRequired, true, 'more than the bounded unresolved range must require canonical replay');
    assert.strictEqual(Object.keys(state.pendingBlocks).length, 201);
}());

(function canonicalFixedAwardUsesNominalAllocationAndIgnoresFictionalProofFields() {
    var fixed = P.createMintAction('fixed-nominal', 'fixed_award', '1.000', { maxEnergy: 100 });
    var block = {
        blockNum: activation + 20,
        blockHash: 'fixed-nominal-block',
        vtActions: [vtEntry('alice', fixed, 0, 1)],
        transfers: [],
        fixedAwards: [{ initiator: 'alice', receiver: 'null', requestedMilli: 1000, symbol: 'VIZ', maxEnergy: 100, memo: P.mintMemo('fixed-nominal'), beneficiaries: [], txId: 'tx-0', txIndex: 0, opIndex: 0 }],
        burnProofs: [{ initiator: 'alice', receiver: 'null', intent: 'fixed-nominal', actualBurnMilli: 999, txIndex: 0, opIndex: 9, canonical: true }]
    };
    var state = L.createState();
    L.ingestBlock(state, block);
    L.finalizeThrough(state, block.blockNum, context(block.blockNum));
    assert.strictEqual(L.getBalance(state, 'alice'), 1000, 'successful canonical reward_amount is the approved nominal allocation proof');
    assert.strictEqual(state.supplyMilli, 1000);
}());

(function rawOperationsCannotDeclareTrustedBurnReceipts() {
    var local = load([
        'app/js/config.js', 'app/js/protocols/vt-protocol.js', 'app/js/engine/block-processor.js'
    ], {
        VMProtocol: { parseAction: function() { return null; } },
        VoiceProtocol: { parseMessage: function() { return null; }, parseEvent: function() { return null; } }
    });
    var processed = local.BlockProcessor.processBlock({
        block_id: 'untrusted-raw', previous: 'previous', timestamp: '2026-09-06T00:00:00',
        transactions: [{ transaction_id: 'untrusted-tx', operations: [['vt_burn_proof', {
            canonical: true, actualBurnMilli: 1000, initiator: 'alice', receiver: 'null'
        }]] }]
    }, activation + 30);
    assert.strictEqual(processed.burnProofs, undefined, 'obsolete fictional proof collection must not exist');
    assert.strictEqual(processed.proofSource, undefined);
}());

(function ordinaryAwardUsesCanonicalSharesPolicyAfterCompleteVirtualHistory() {
    var award = P.createAwardMintAction('award-pending', 100);
    var block = {
        blockNum: activation + 21, blockHash: 'award-pending-block', virtualReceiptsComplete: false,
        vtActions: [vtEntry('alice', award, 0, 1), vtEntry('alice', award, 0, 2)], transfers: [], fixedAwards: [],
        awards: [{ initiator: 'alice', receiver: 'null', energy: 100, customSequence: 0, memo: P.mintMemo('award-pending'), beneficiaries: [], blockNum: activation + 21, txId: 'tx-0', txIndex: 0, opIndex: 0 }],
        awardReceipts: []
    };
    var state = L.createState({ supplyMilli: 0, balances: {}, finalizedBlock: activation + 20 });
    L.ingestBlock(state, block);
    L.finalizeThrough(state, block.blockNum, context(block.blockNum));
    assert.strictEqual(L.getBalance(state, 'alice'), 0);
    assert.ok(state.pendingBlocks[block.blockNum], 'missing virtual history must remain hydratable');

    block.virtualReceiptsComplete = true;
    block.awardReceipts = [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('award-pending'), shares: '1.234567 SHARES', sharesMicro: 1234567, blockNum: activation + 21, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 }];
    L.ingestBlock(state, block);
    L.finalizeThrough(state, block.blockNum, context(block.blockNum));
    assert.strictEqual(L.getBalance(state, 'alice'), 1234, 'game policy mints floor(receive_award microSHARES / 1000) milliMAGIC');
    assert.strictEqual(state.supplyMilli, 1234);
    assert.strictEqual(state.history[0].method, 'award');
    assert.strictEqual(state.history[0].sharesMicro, 1234567);
    assert.strictEqual(state.history[0].discardedMicroShares, 567);
    assert.strictEqual(state.pendingBlocks[block.blockNum], undefined);
    assert.strictEqual(state.finalizedBlock, block.blockNum);

    var reloaded = L.createState(JSON.parse(JSON.stringify(state)));
    L.ingestBlock(reloaded, block);
    L.finalizeThrough(reloaded, block.blockNum, context(block.blockNum));
    assert.strictEqual(reloaded.supplyMilli, 1234, 'checkpoint reload and same proof replay cannot mint twice');

    var replayed = L.createState({ finalizedBlock: activation + 20 });
    L.ingestBlock(replayed, block);
    L.finalizeThrough(replayed, block.blockNum, context(block.blockNum));
    assert.strictEqual(JSON.stringify(replayed.balances), JSON.stringify(state.balances), 'hydrated processing and canonical full replay must agree');
    assert.strictEqual(JSON.stringify(replayed.history), JSON.stringify(state.history));
}());

(function ordinaryAwardSubMilliReceiptResolvesToARecordedZeroMint() {
    var blockNum = activation + 23;
    var intent = 'award-sub-milli';
    var state = L.createState({ finalizedBlock: blockNum - 1 });
    var block = {
        blockNum: blockNum, blockHash: 'award-sub-milli-block', sourceOperationsComplete: true, virtualReceiptsComplete: true,
        vtActions: [vtEntry('alice', P.createAwardMintAction(intent, 50), 0, 1)], transfers: [], fixedAwards: [],
        awards: [{ initiator: 'alice', receiver: 'null', energy: 50, customSequence: 0, memo: P.mintMemo(intent), beneficiaries: [], blockNum: blockNum, txId: 'tx-0', txIndex: 0, opIndex: 0 }],
        awardReceipts: [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo(intent), shares: '0.000999 SHARES', sharesMicro: 999, blockNum: blockNum, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 }]
    };
    L.ingestBlock(state, block);
    L.finalizeThrough(state, blockNum, { activationBlock: activation, completeFrom: blockNum, completeThrough: blockNum });
    assert.strictEqual(state.supplyMilli, 0);
    assert.strictEqual(L.getBalance(state, 'alice'), 0);
    assert.strictEqual(state.history[0].amountMilli, 0, 'sub-milli output must be explicit rather than rounded up');
    assert.strictEqual(state.history[0].discardedMicroShares, 999);
    assert.strictEqual(state.mintIntents['alice:' + intent], blockNum, 'zero output still resolves the canonical intent');
    assert.strictEqual(state.pendingBlocks[blockNum], undefined);
}());

(function ordinaryAwardRejectsAmbiguousMalformedAndCrossMethodProofReuseWithoutFreezing() {
    function awardFixture(blockNum, intent, receipts, sourceOverrides) {
        var source = Object.assign({ initiator: 'alice', receiver: 'null', energy: 75, customSequence: 0, memo: P.mintMemo(intent), beneficiaries: [], blockNum: blockNum, txId: 'tx-0', txIndex: 0, opIndex: 0 }, sourceOverrides || {});
        return {
            blockNum: blockNum, blockHash: 'award-invalid-' + blockNum, sourceOperationsComplete: true, virtualReceiptsComplete: true,
            vtActions: [vtEntry('alice', P.createAwardMintAction(intent, 75), 0, 1)], transfers: [], fixedAwards: [],
            awards: [source],
            awardReceipts: receipts.map(function(receipt) { return Object.assign({ blockNum: blockNum }, receipt); })
        };
    }
    var cases = [
        [
            { initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('ambiguous'), shares: '1.000000 SHARES', sharesMicro: 1000000, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 },
            { initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('ambiguous'), shares: '1.000000 SHARES', sharesMicro: 1000000, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 2 }
        ],
        [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('bad-denomination'), shares: '1.000000 VIZ', sharesMicro: 1000000, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 }],
        [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('bad-position'), shares: '1.000000 SHARES', sharesMicro: 1000000, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 0 }],
        [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('overflow'), shares: '9007199254.740992 SHARES', sharesMicro: Number.MAX_SAFE_INTEGER + 1, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 }],
        [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('wrong-tx'), shares: '1.000000 SHARES', sharesMicro: 1000000, txId: 'other-tx', txIndex: 0, opIndex: 0, virtualOp: 1 }],
        [{ initiator: 'mallory', receiver: 'null', customSequence: 0, memo: P.mintMemo('wrong-initiator'), shares: '1.000000 SHARES', sharesMicro: 1000000, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 }],
        [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('mismatched-micro'), shares: '1.000000 SHARES', sharesMicro: 999999, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 }],
        [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('wrong-energy'), shares: '1.000000 SHARES', sharesMicro: 1000000, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 }],
        [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('beneficiaries'), shares: '1.000000 SHARES', sharesMicro: 1000000, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 }],
        [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('wrong-receiver'), shares: '1.000000 SHARES', sharesMicro: 1000000, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 }],
        [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('wrong-memo'), shares: '1.000000 SHARES', sharesMicro: 1000000, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 }]
    ];
    var intents = ['ambiguous', 'bad-denomination', 'bad-position', 'overflow', 'wrong-tx', 'wrong-initiator', 'mismatched-micro', 'wrong-energy', 'beneficiaries', 'wrong-receiver', 'wrong-memo'];
    var sourceOverrides = [{}, {}, {}, {}, {}, {}, {}, { energy: 76 }, { beneficiaries: [{ account: 'mallory', weight: 1 }] }, { receiver: 'bob' }, { memo: P.mintMemo('other-intent') }];
    var state = L.createState({ finalizedBlock: activation + 29 });
    intents.forEach(function(intent, index) {
        var blockNum = activation + 30 + index;
        L.ingestBlock(state, awardFixture(blockNum, intent, cases[index], sourceOverrides[index]));
        L.finalizeThrough(state, blockNum, { activationBlock: activation, completeFrom: blockNum, completeThrough: blockNum });
        assert.strictEqual(state.finalizedBlock, blockNum, intent + ' must become final no-mint with complete evidence');
        assert.strictEqual(state.supplyMilli, 0);
    });

    var crossBlockNum = activation + 41;
    var transferIntent = 'cross-transfer';
    var awardIntent = 'cross-award';
    L.ingestBlock(state, {
        blockNum: crossBlockNum, blockHash: 'cross-method-proof', sourceOperationsComplete: true, virtualReceiptsComplete: true,
        vtActions: [vtEntry('alice', P.createMintAction(transferIntent, 'transfer', '1.000'), 0, 1), vtEntry('alice', P.createAwardMintAction(awardIntent, 75), 0, 2)],
        transfers: [{ from: 'alice', to: 'null', amountMilli: 1000, symbol: 'VIZ', memo: P.mintMemo(transferIntent), txId: 'tx-0', txIndex: 0, opIndex: 0 }],
        fixedAwards: [], awards: [{ initiator: 'alice', receiver: 'null', energy: 75, customSequence: 0, memo: P.mintMemo(awardIntent), beneficiaries: [], blockNum: crossBlockNum, txId: 'tx-0', txIndex: 0, opIndex: 0 }],
        awardReceipts: [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo(awardIntent), shares: '1.000000 SHARES', sharesMicro: 1000000, blockNum: crossBlockNum, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 }]
    });
    L.finalizeThrough(state, crossBlockNum, { activationBlock: activation, completeFrom: crossBlockNum, completeThrough: crossBlockNum });
    assert.strictEqual(state.supplyMilli, 1000, 'one impossible cross-method source position may be consumed only once');
}());

(function completeNoRewardOrdinaryAwardDoesNotFreezeLaterMintAndSupplyOverflowFailsClosed() {
    var noRewardBlock = activation + 40;
    var laterBlock = noRewardBlock + 1;
    var state = L.createState({ finalizedBlock: noRewardBlock - 1 });
    L.ingestBlock(state, {
        blockNum: noRewardBlock, blockHash: 'ordinary-no-reward', sourceOperationsComplete: true, virtualReceiptsComplete: true,
        vtActions: [vtEntry('alice', P.createAwardMintAction('ordinary-no-reward', 100), 0, 1)], transfers: [], fixedAwards: [],
        awards: [{ initiator: 'alice', receiver: 'null', energy: 100, customSequence: 0, memo: P.mintMemo('ordinary-no-reward'), beneficiaries: [], blockNum: noRewardBlock, txId: 'tx-0', txIndex: 0, opIndex: 0 }], awardReceipts: []
    });
    L.ingestBlock(state, {
        blockNum: laterBlock, blockHash: 'mint-after-no-reward', sourceOperationsComplete: true, virtualReceiptsComplete: true,
        vtActions: [vtEntry('alice', P.createMintAction('after-no-reward', 'fixed_award', '1.000', { maxEnergy: 100 }), 0, 1)], transfers: [], awards: [], awardReceipts: [],
        fixedAwards: [{ initiator: 'alice', receiver: 'null', requestedMilli: 1000, symbol: 'VIZ', maxEnergy: 100, customSequence: 0, memo: P.mintMemo('after-no-reward'), beneficiaries: [], txId: 'tx-0', txIndex: 0, opIndex: 0 }]
    });
    L.finalizeThrough(state, laterBlock, { activationBlock: activation, completeFrom: noRewardBlock, completeThrough: laterBlock });
    assert.strictEqual(state.finalizedBlock, laterBlock);
    assert.strictEqual(state.supplyMilli, 1000, 'complete no-reward receipt set must not freeze a later canonical mint');

    var overflowBlock = activation + 50;
    var overflowState = L.createState({ supplyMilli: Number.MAX_SAFE_INTEGER - 500, balances: { alice: Number.MAX_SAFE_INTEGER - 500 }, finalizedBlock: overflowBlock - 1 });
    L.ingestBlock(overflowState, {
        blockNum: overflowBlock, blockHash: 'ordinary-supply-overflow', sourceOperationsComplete: true, virtualReceiptsComplete: true,
        vtActions: [vtEntry('alice', P.createAwardMintAction('ordinary-supply-overflow', 100), 0, 1)], transfers: [], fixedAwards: [],
        awards: [{ initiator: 'alice', receiver: 'null', energy: 100, customSequence: 0, memo: P.mintMemo('ordinary-supply-overflow'), beneficiaries: [], blockNum: overflowBlock, txId: 'tx-0', txIndex: 0, opIndex: 0 }],
        awardReceipts: [{ initiator: 'alice', receiver: 'null', customSequence: 0, memo: P.mintMemo('ordinary-supply-overflow'), shares: '1.000000 SHARES', sharesMicro: 1000000, blockNum: overflowBlock, txId: 'tx-0', txIndex: 0, opIndex: 0, virtualOp: 1 }]
    });
    L.finalizeThrough(overflowState, overflowBlock, { activationBlock: activation, completeFrom: overflowBlock, completeThrough: overflowBlock });
    assert.strictEqual(overflowState.supplyMilli, Number.MAX_SAFE_INTEGER - 500, 'unsafe supply addition must fail closed');
    assert.strictEqual(overflowState.finalizedBlock, overflowBlock);
}());

(function completeArchiveMakesFailedOrInsufficientEnergyMintFinalInsteadOfAReplayDos() {
    var blockNum = activation + 22;
    var state = L.createState({ supplyMilli: 0, balances: {}, finalizedBlock: blockNum - 1 });
    L.ingestBlock(state, {
        blockNum: blockNum, blockHash: 'complete-unmatched', sourceOperationsComplete: true, virtualReceiptsComplete: true,
        vtActions: [vtEntry('mallory', P.createMintAction('no-source', 'fixed_award', '1.000', { maxEnergy: 100 }), 0, 0)],
        transfers: [], fixedAwards: [], awards: [], awardReceipts: []
    });
    L.finalizeThrough(state, blockNum, { activationBlock: activation, completeFrom: blockNum, completeThrough: blockNum });
    assert.strictEqual(state.finalizedBlock, blockNum, 'a complete archive proves a rejected or insufficient-energy source operation is absent');
    assert.strictEqual(state.pendingBlocks[blockNum], undefined);
    assert.strictEqual(state.supplyMilli, 0);
}());

(function malformedCheckpointEntriesFailClosedBeforeFiltering() {
    var hiddenNegative = L.createState({ supplyMilli: 100, balances: { alice: 100, bob: -1 } });
    assert.strictEqual(hiddenNegative.replayRequired, true, 'dropping a negative entry must not make a malformed checkpoint appear conserved');
    assert.strictEqual(Object.keys(hiddenNegative.balances).length, 0);
    var unsafe = L.createState({ supplyMilli: 100, balances: { alice: 100, bob: Number.MAX_SAFE_INTEGER + 1 } });
    assert.strictEqual(unsafe.replayRequired, true);
    var badSupply = L.createState({ supplyMilli: -1, balances: {} });
    assert.strictEqual(badSupply.replayRequired, true);
}());

(function legacyLedgerMigrationInfersAConservativeFinalizedFloor() {
    var migrated = L.createState({
        version: 1,
        supplyMilli: 1000,
        balances: { alice: 1000 },
        processed: { old: true },
        usedProofs: { proof: true },
        mintIntents: { intent: true },
        transferNonces: { nonce: true },
        canonicalBlocks: (function() { var x = {}; x[activation + 100] = 'old-final'; x[activation + 101] = 'old-pending'; return x; }()),
        pendingBlocks: (function() { var x = {}; x[activation + 101] = { blockNum: activation + 101, blockHash: 'old-pending', vtActions: [] }; return x; }())
    });
    assert.strictEqual(migrated.version, 2);
    assert.strictEqual(migrated.finalizedBlock, activation + 100);
    assert.strictEqual(migrated.observedThrough, activation + 100);
    assert.strictEqual(migrated.supplyMilli, 1000);
    assert.strictEqual(migrated.balances.alice, 1000);
    assert.strictEqual(L.ingestBlock(migrated, { blockNum: activation + 100, blockHash: 'replayed-old', vtActions: [] }), false);
    assert.strictEqual(migrated.mintIntents.intent, activation + 100, 'legacy boolean caches migrate to block-valued bounded entries');
}());

(function recipientNamespaceSemanticsAreDeterministic() {
    var state = L.createState({ supplyMilli: 1000, balances: { alice: 1000 }, finalizedBlock: activation - 1 });
    var block = {
        blockNum: activation,
        blockHash: 'syntactic-recipient',
        vtActions: [vtEntry('alice', P.createTransferAction('future-user', '0.100', 'syntactic-recipient'), 0, 0)],
        transfers: [], fixedAwards: [], burnProofs: []
    };
    L.ingestBlock(state, block);
    L.finalizeThrough(state, block.blockNum, context(block.blockNum));
    assert.strictEqual(L.getBalance(state, 'future-user'), 100, 'consensus namespace is syntactic; UI separately prevents accidental sends to accounts not yet present in VIZ RPC');
}());

(function insufficientOrMalformedBuyerCannotReserveSellerItem() {
    var market = c.MarketplaceEngine;
    var item = { id: 'safe-item', type: 'water_dust', rarity: 0, stats: {}, owner: 'seller', consumed: false, equipped: false };
    var world = { inventories: { seller: [item], buyer: [] } };
    market.setMarketState({ listings: {}, history: [], priceHistory: {} });
    var listed = market.createListing('seller', item, 500, activation, 0, 1);
    var ledger = L.createState();
    var action = P.createBazaarBuyAction(listed.listing.ref, 1, 500);
    var buyer = vtEntry('buyer', action, 0, 0);
    assert.strictEqual(L.reserveEntry(ledger, { blockNum: activation + 1, blockHash: 'insufficient' }, buyer, { marketplace: market, worldState: world }), false);
    assert.strictEqual(market.getMarketState().listings[listed.listing.ref].pendingPurchase, undefined);

    var malformed = vtEntry('bad!', action, 0, 0);
    assert.strictEqual(L.reserveEntry(ledger, { blockNum: activation + 1, blockHash: 'malformed' }, malformed, { marketplace: market, worldState: world }), false);
    assert.strictEqual(market.getMarketState().listings[listed.listing.ref].pendingPurchase, undefined);
}());

console.log('PASS VT consensus replay, proof trust, checkpoint and reservation regressions');
