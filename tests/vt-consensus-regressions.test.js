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

(function authoredCanonicalFlagIsNotTrustedBurnProof() {
    c.VizMagicConfig.TOKEN.FIXED_AWARD_EVIDENCE = true;
    var fixed = P.createMintAction('fixed-untrusted', 'fixed_award', '1.000', { maxEnergy: 100 });
    var block = {
        blockNum: activation + 20,
        blockHash: 'fixed-untrusted-block',
        vtActions: [vtEntry('alice', fixed, 0, 1)],
        transfers: [],
        fixedAwards: [{ initiator: 'alice', receiver: 'null', requestedMilli: 1000, symbol: 'VIZ', maxEnergy: 100, memo: P.mintMemo('fixed-untrusted'), beneficiaries: [], txIndex: 0, opIndex: 0 }],
        burnProofs: [{ initiator: 'alice', receiver: 'null', intent: 'fixed-untrusted', actualBurnMilli: 999, sourceOpIndex: 0, txIndex: 0, opIndex: 9, canonical: true }]
    };
    var state = L.createState();
    L.ingestBlock(state, block);
    L.finalizeThrough(state, block.blockNum, context(block.blockNum));
    assert.strictEqual(L.getBalance(state, 'alice'), 0, 'an operation-authored canonical=true field must never authorize fixed-award mint');
    assert.ok(state.pendingBlocks[block.blockNum]);

    block.proofSource = 'trusted_archive_v1';
    L.ingestBlock(state, block);
    L.finalizeThrough(state, block.blockNum, context(block.blockNum));
    assert.strictEqual(L.getBalance(state, 'alice'), 999, 'only a trusted archive boundary may hydrate exact realized-burn evidence');
    c.VizMagicConfig.TOKEN.FIXED_AWARD_EVIDENCE = false;
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
    assert.strictEqual(processed.burnProofs.length, 0, 'a block operation cannot self-assert the trusted archive boundary');
    assert.strictEqual(processed.proofSource, undefined);
}());

(function disabledFixedAwardIsAClosedRejectionNotAnUnboundedDependency() {
    var fixed = P.createMintAction('disabled-fixed', 'fixed_award', '1.000', { maxEnergy: 100 });
    var block = {
        blockNum: activation + 21, blockHash: 'disabled-fixed-block',
        vtActions: [vtEntry('alice', fixed, 0, 1)], transfers: [], fixedAwards: [], burnProofs: []
    };
    var state = L.createState({ supplyMilli: 0, balances: {}, finalizedBlock: activation + 20 });
    L.ingestBlock(state, block);
    L.finalizeThrough(state, block.blockNum, context(block.blockNum));
    assert.strictEqual(L.getBalance(state, 'alice'), 0);
    assert.strictEqual(state.pendingBlocks[block.blockNum], undefined, 'disabled evidence mode must reject safely instead of freezing every later transfer');
    assert.strictEqual(state.finalizedBlock, block.blockNum);
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
