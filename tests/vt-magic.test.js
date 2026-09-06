'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');

function load(files, extra) {
    var context = Object.assign({ console: console, Number: Number, JSON: JSON, Math: Math, Date: Date }, extra || {});
    vm.createContext(context);
    files.forEach(function(file) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    });
    return context;
}

function op(type, data) { return [type, data]; }
function custom(sender, action) {
    return op('custom', { id: 'VT', required_regular_auths: [sender], required_active_auths: [], json: JSON.stringify(action) });
}
function block(number, id, operations) {
    return { block_id: id, previous: 'prev-' + number, timestamp: '2026-09-06T00:00:00', transactions: [{ transaction_id: 'tx-' + number, operations: operations }] };
}

(function amountTests() {
    var c = load(['app/js/protocols/vt-protocol.js']);
    var p = c.VTProtocol;
    assert.strictEqual(p.parseAmount('1'), 1000);
    assert.strictEqual(p.parseAmount('1.001'), 1001);
    assert.strictEqual(p.parseAmount('0.001'), 1);
    ['0', '0.000', '01', '+1', '-1', '1.0000', '1e3', 'NaN', '', '9007199254741'].forEach(function(value) {
        assert.strictEqual(p.parseAmount(value), null, 'must reject ' + value);
    });
    assert.strictEqual(p.formatAmount(1001), '1.001');
    assert.strictEqual(p.mintMemo('abc-123'), 'viz://vt/mint/v1/abc-123');
    assert.strictEqual(p.createTransferAction('bob', '2.500', 'n-1').d.amount_milli, 2500);
    assert.strictEqual(p.createAwardMintAction('award-1', 250).d.energy, 250);
    assert.strictEqual(p.createAwardMintAction('award-1', 0), null);
}());

(function proofAndLedgerTests() {
    var cfg = { PROTOCOLS: { VM: 'VM', V: 'V', VE: 'VE', VT: 'VT' }, TOKEN: { ACTIVATION_BLOCK: 100, IRREVERSIBLE_DEPTH: 2 } };
    var c = load([
        'app/js/protocols/vt-protocol.js',
        'app/js/engine/magic-ledger.js',
        'app/js/engine/block-processor.js'
    ], { VizMagicConfig: cfg, VMProtocol: { parseAction: function() { return null; } }, VoiceProtocol: { parseMessage: function() { return null; }, parseEvent: function() { return null; } } });
    var p = c.VTProtocol;
    var ledger = c.MagicLedger.createState();
    function finalize(height) {
        return c.MagicLedger.finalizeThrough(ledger, height, { activationBlock: 100, completeFrom: 100, completeThrough: height });
    }
    var mint = p.createMintAction('intent-a', 'transfer', '3.000');
    var b = block(101, 'block-a', [
        op('transfer', { from: 'alice', to: 'null', amount: '3.000 VIZ', memo: p.mintMemo('intent-a') }),
        custom('alice', mint)
    ]);
    var processed = c.BlockProcessor.processBlock(b, 101);
    assert.strictEqual(processed.transfers.length, 1);
    assert.strictEqual(processed.vtActions.length, 1);
    c.MagicLedger.ingestBlock(ledger, processed);
    assert.strictEqual(finalize(101), 1);
    assert.strictEqual(c.MagicLedger.getBalance(ledger, 'alice'), 3000);
    assert.strictEqual(ledger.supplyMilli, 3000);

    c.MagicLedger.ingestBlock(ledger, processed);
    finalize(101);
    assert.strictEqual(c.MagicLedger.getBalance(ledger, 'alice'), 3000, 'same canonical op must be idempotent');

    var transfer = p.createTransferAction('bob', '1.250', 'nonce-a');
    var middle = c.BlockProcessor.processBlock(block(102, 'block-b', [custom('alice', transfer)]), 102);
    var another = c.BlockProcessor.processBlock(block(103, 'block-a2', [custom('alice', p.createTransferAction('bob', '0.250', 'nonce-b'))]), 103);
    c.MagicLedger.ingestBlock(ledger, middle);
    c.MagicLedger.ingestBlock(ledger, another);
    finalize(103);
    assert.strictEqual(c.MagicLedger.getBalance(ledger, 'alice'), 1500);
    assert.strictEqual(c.MagicLedger.getBalance(ledger, 'bob'), 1500);
    assert.strictEqual(ledger.supplyMilli, 3000, 'transfers conserve supply');

    var beforeDuplicate = JSON.stringify(ledger.balances);
    var duplicate = c.BlockProcessor.processBlock(block(104, 'block-duplicate', [custom('alice', p.createTransferAction('bob', '0.100', 'nonce-a'))]), 104);
    c.MagicLedger.ingestBlock(ledger, duplicate);
    finalize(104);
    assert.strictEqual(JSON.stringify(ledger.balances), beforeDuplicate, 'duplicate sender nonce cannot create A-B-A replay transfer');

    var reloaded = c.MagicLedger.createState(JSON.parse(JSON.stringify(ledger)));
    assert.deepStrictEqual(reloaded.balances, ledger.balances, 'checkpoint reload preserves exact balances');
    assert.strictEqual(reloaded.supplyMilli, ledger.supplyMilli);
    var corrupt = c.MagicLedger.createState({ supplyMilli: 1, balances: { alice: 2 } });
    assert.strictEqual(corrupt.replayRequired, true, 'checkpoint supply mismatch must fail closed into replay');
    assert.strictEqual(Object.keys(corrupt.balances).length, 0);

    var fixed = p.createMintAction('intent-fixed', 'fixed_award', '1.000', { maxEnergy: 500 });
    var fixedBlock = c.BlockProcessor.processBlock(block(105, 'block-fixed', [
        op('fixed_award', { initiator: 'bob', receiver: 'null', reward_amount: '1.000 VIZ', max_energy: 500, custom_sequence: 4, memo: p.mintMemo('intent-fixed'), beneficiaries: [] }),
        custom('bob', fixed)
    ]), 105);
    c.MagicLedger.ingestBlock(ledger, fixedBlock);
    finalize(105);
    assert.strictEqual(c.MagicLedger.getBalance(ledger, 'bob'), 2500, 'canonical fixed award mints its exact nominal VIZ allocation');
    assert.strictEqual(ledger.supplyMilli, 4000);
    assert.strictEqual(ledger.pendingMints['bob:intent-fixed'], undefined);

    var diverted = p.createMintAction('intent-diverted', 'fixed_award', '1.000', { maxEnergy: 500 });
    var divertedBlock = c.BlockProcessor.processBlock(block(106, 'block-diverted', [
        op('fixed_award', { initiator: 'bob', receiver: 'null', reward_amount: '1.000 VIZ', max_energy: 500, custom_sequence: 4, memo: p.mintMemo('intent-diverted'), beneficiaries: [{ account: 'mallory', weight: 100 }] }),
        custom('bob', diverted)
    ]), 106);
    c.MagicLedger.ingestBlock(ledger, divertedBlock);
    finalize(106);
    assert.strictEqual(c.MagicLedger.getBalance(ledger, 'bob'), 2500, 'beneficiary diversion must not mint MAGIC');

    var sharedProofAction = p.createMintAction('one-proof', 'fixed_award', '0.500', { maxEnergy: 250 });
    var sharedProofBlock = c.BlockProcessor.processBlock(block(107, 'block-one-proof', [
        op('fixed_award', { initiator: 'bob', receiver: 'null', reward_amount: '0.500 VIZ', max_energy: 250, custom_sequence: 0, memo: p.mintMemo('one-proof'), beneficiaries: [] }),
        custom('bob', sharedProofAction),
        custom('bob', sharedProofAction)
    ]), 107);
    c.MagicLedger.ingestBlock(ledger, sharedProofBlock);
    finalize(107);
    assert.strictEqual(c.MagicLedger.getBalance(ledger, 'bob'), 3000, 'one canonical fixed award can mint only once');
    assert.strictEqual(ledger.supplyMilli, 4500);

    [
        { number: 108, intent: 'zero-reward', amount: '0.000 VIZ', maxEnergy: 250, expectedAmount: '0.500' },
        { number: 109, intent: 'wrong-denomination', amount: '0.500 SHARES', maxEnergy: 250, expectedAmount: '0.500' },
        { number: 110, intent: 'wrong-energy-cap', amount: '0.500 VIZ', maxEnergy: 251, expectedAmount: '0.500' }
    ].forEach(function(fixture) {
        var action = p.createMintAction(fixture.intent, 'fixed_award', fixture.expectedAmount, { maxEnergy: 250 });
        var invalidBlock = c.BlockProcessor.processBlock(block(fixture.number, 'block-' + fixture.intent, [
            op('fixed_award', { initiator: 'bob', receiver: 'null', reward_amount: fixture.amount, max_energy: fixture.maxEnergy, custom_sequence: 0, memo: p.mintMemo(fixture.intent), beneficiaries: [] }),
            custom('bob', action)
        ]), fixture.number);
        c.MagicLedger.ingestBlock(ledger, invalidBlock);
        finalize(fixture.number);
        assert.strictEqual(c.MagicLedger.getBalance(ledger, 'bob'), 3000, fixture.intent + ' must not mint');
        assert.strictEqual(ledger.supplyMilli, 4500);
    });

    var bad = c.BlockProcessor.processBlock(block(111, 'block-bad', [
        op('transfer', { from: 'alice', to: 'null', amount: '1.000 VIZ', memo: p.mintMemo('bad') }),
        custom('mallory', p.createMintAction('bad', 'transfer', '1.000'))
    ]), 111);
    c.MagicLedger.ingestBlock(ledger, bad);
    finalize(111);
    assert.strictEqual(c.MagicLedger.getBalance(ledger, 'mallory'), 0, 'proof sender must equal signed VT sender');
}());

(function bazaarAtomicityTests() {
    var c = load(['app/js/engine/marketplace.js'], { VizMagicConfig: { TOKEN: { ACTIVATION_BLOCK: 100 } } });
    var market = c.MarketplaceEngine;
    market.setMarketState({ listings: {}, history: [], priceHistory: {} });
    var world = { inventories: {
        seller: [{ id: 'item-1', type: 'fire_dust', rarity: 0, stats: {}, owner: 'seller', listed: false, equipped: false, consumed: false }],
        buyer: [], rival: []
    } };
    var listed = market.createListing('seller', world.inventories.seller[0], 1250, 110, 200, 1);
    assert.strictEqual(listed.success, true);
    assert.strictEqual(listed.listing.priceMilli, 1250);
    assert.strictEqual(listed.listing.revision, 1);
    assert.strictEqual(market.reservePurchase('buyer', listed.listing.ref, 1, 1250, 'pending-hash', 'buy-op', world).success, true);
    assert.strictEqual(market.reservePurchase('rival', listed.listing.ref, 1, 1250, 'rival-hash', 'rival-op', world).success, false, 'first canonical buyer reserves the item');
    assert.strictEqual(market.cancelListing('seller', listed.listing.ref, world.inventories.seller).success, false, 'seller cannot cancel during a pending purchase');
    market.releaseReservationsForBlock('pending-hash');
    var ledger = { balances: { seller: 0, buyer: 2000, rival: 2000 }, supplyMilli: 4000, history: [] };
    var before = JSON.stringify({ world: world, ledger: ledger, market: market.getMarketState() });
    var stale = market.buyItem('buyer', listed.listing.ref, 120, world, ledger, 2, 1250);
    assert.strictEqual(stale.success, false);
    assert.strictEqual(stale.error, 'listing_revision_mismatch');
    assert.strictEqual(JSON.stringify({ world: world, ledger: ledger, market: market.getMarketState() }), before, 'negative buy must be atomic');

    var bought = market.buyItem('buyer', listed.listing.ref, 120, world, ledger, 1, 1250);
    assert.strictEqual(bought.success, true);
    assert.strictEqual(ledger.balances.buyer, 750);
    assert.strictEqual(ledger.balances.seller, 1250);
    assert.strictEqual(world.inventories.seller.length, 0);
    assert.strictEqual(world.inventories.buyer.length, 1);
    assert.strictEqual(world.inventories.buyer[0].owner, 'buyer');
    var after = JSON.stringify({ world: world, ledger: ledger, market: market.getMarketState() });
    var rival = market.buyItem('rival', listed.listing.ref, 120, world, ledger, 1, 1250);
    assert.strictEqual(rival.success, false);
    assert.strictEqual(JSON.stringify({ world: world, ledger: ledger, market: market.getMarketState() }), after, 'competing buyer cannot partially mutate');

    var legacyItem = { id: 'legacy-item', type: 'water_dust', rarity: 0, stats: {}, owner: 'seller', listed: true, consumed: false };
    world.inventories.seller.push(legacyItem);
    market.getMarketState().listings.legacy_ref = { ref: 'legacy_ref', itemRef: 'legacy-item', itemType: 'water_dust', seller: 'seller', price: 2, listedBlock: 99, state: 'active' };
    market.activateMagicMarket(110);
    assert.strictEqual(market.buyItem('rival', 'legacy_ref', 120, world, ledger, 1, 2).error, 'listing_not_active');
    assert.strictEqual(market.cancelListing('seller', 'legacy_ref', world.inventories.seller).success, true, 'owner can cancel and relist a pre-cutover unpaid listing');
    assert.strictEqual(world.inventories.seller[0].listed, false);
}());

(function listedItemLockTests() {
    var c = load(['app/js/engine/enchanting.js'], {
        ItemSystem: { getItemTemplate: function() { return { slot: 'weapon', consumable: true, effect: {} }; } },
        GameFormulas: {}, GameTypes: {}, CryptoUtils: {}, VizMagicConfig: {}
    });
    var listed = { id: 'locked', type: 'fire_dust', listed: true, consumed: false, stats: {} };
    assert.strictEqual(c.EnchantingSystem.consumeItem(listed, {}).error, 'item_listed');
    assert.strictEqual(c.EnchantingSystem.reforgeItem(listed, {}, 'hash', 1, 'alice', []).error, 'item_listed');
    assert.strictEqual(c.EnchantingSystem.enchantItem(listed, 'x', null, {}).error, 'item_listed');
    assert.strictEqual(listed.consumed, false, 'listed item lock must not mutate the item');
}());

(function broadcastAuthorityTests() {
    var sent = null;
    var customCall = null;
    var c = load(['app/js/config.js', 'app/js/protocols/vt-protocol.js', 'app/js/blockchain/broadcast.js'], {
        VizAccount: {
            getCurrentUser: function() { return 'alice'; },
            getRegularKey: function() { return 'regular-fixture'; },
            getActiveKey: function() { return 'active-fixture'; }
        },
        viz: { broadcast: {
            send: function(tx, keys, cb) { sent = { tx: tx, keys: keys }; cb(null, { fixture: true }); },
            custom: function(key, activeAuths, regularAuths, id, json, cb) { customCall = { key: key, regularAuths: regularAuths, activeAuths: activeAuths, id: id, json: json }; cb(null, {}); }
        } }
    });
    c.VizBroadcast.mintMagicTransfer('burn-fixture', '1.250', function(err) { assert.ifError(err); });
    assert.strictEqual(sent.keys.active, 'active-fixture');
    assert.strictEqual(sent.keys.regular, 'regular-fixture');
    assert.strictEqual(sent.tx.operations[0][0], 'transfer');
    assert.strictEqual(sent.tx.operations[0][1].to, 'null');
    assert.strictEqual(sent.tx.operations[0][1].amount, '1.250 VIZ');
    assert.strictEqual(sent.tx.operations[1][1].required_regular_auths[0], 'alice');
    assert.strictEqual(sent.tx.operations[1][1].required_active_auths.length, 0);
    var transfer = c.VTProtocol.createTransferAction('bob', '0.125', 'send-fixture');
    c.VizBroadcast.tokenAction(transfer, function(err) { assert.ifError(err); });
    assert.strictEqual(customCall.id, 'VT');
    assert.strictEqual(customCall.regularAuths[0], 'alice');
    assert.strictEqual(customCall.activeAuths.length, 0);
    sent = null;
    c.VizBroadcast.mintMagicFixedAward('fixed-fixture', '1.000', 500, function(err) { assert.ifError(err); });
    assert.strictEqual(sent.tx.operations[0][0], 'fixed_award');
    assert.strictEqual(sent.tx.operations[0][1].receiver, 'null');
    assert.strictEqual(sent.tx.operations[0][1].reward_amount, '1.000 VIZ');
    assert.strictEqual(sent.tx.operations[0][1].max_energy, 500);
    assert.strictEqual(sent.tx.operations[0][1].beneficiaries.length, 0);
    assert.strictEqual(sent.tx.operations[1][1].required_regular_auths[0], 'alice');
    sent = null;
    c.VizBroadcast.mintMagicAward('award-fixture', 250, function(err) {
        assert.strictEqual(err && err.message, 'ordinary_award_allocation_unavailable');
    });
    assert.strictEqual(sent, null, 'ordinary award is not broadcast until an exact historical VIZ allocation source exists');
}());

console.log('PASS VT/MAGIC protocol, proof, ledger and Bazaar invariants');
