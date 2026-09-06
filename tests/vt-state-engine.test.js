'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');
var c = {
    console: { log: function() {}, warn: console.warn, error: console.error },
    ActionValidator: { validate: function() { return { valid: true }; } },
    EnchantingSystem: { consumeItem: function(item) { if (item.listed) return { success: false, error: 'item_listed' }; item.consumed = true; return { success: true }; } }
};
vm.createContext(c);
[
    'app/js/config.js',
    'app/js/protocols/vt-protocol.js',
    'app/js/engine/marketplace.js',
    'app/js/engine/magic-ledger.js',
    'app/js/engine/block-processor.js',
    'app/js/engine/state-engine.js'
].forEach(function(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file }); });

function rawBlock(num, id, ops) {
    return { block_id: id, previous: 'p' + num, timestamp: '2026-09-06T00:00:00', transactions: [{ transaction_id: 'tx' + num, operations: ops || [] }] };
}
function custom(sender, action) {
    return ['custom', { id: 'VT', required_active_auths: [], required_regular_auths: [sender], json: JSON.stringify(action) }];
}
function apply(num, id, ops, irreversible) {
    var processed = c.BlockProcessor.processBlock(rawBlock(num, id, ops), num);
    processed.irreversible = irreversible !== false;
    return c.StateEngine.processBlock(processed);
}

var A = c.VizMagicConfig.TOKEN.ACTIVATION_BLOCK;
var mint = c.VTProtocol.createMintAction('state-mint', 'transfer', '2.000');
apply(A, 'mint-block', [
    ['transfer', { from: 'buyer', to: 'null', amount: '2.000 VIZ', memo: c.VTProtocol.mintMemo('state-mint') }],
    custom('buyer', mint)
]);
assert.strictEqual(c.StateEngine.getMagicBalance('buyer'), 2000, 'state engine finalizes only explicitly irreversible transfer-backed mint');
for (var emptyBlock = A + 1; emptyBlock <= A + 20; emptyBlock++) apply(emptyBlock, 'empty-' + emptyBlock, []);

var state = c.StateEngine.getState();
state.inventories.seller = [{ id: 'item-state', type: 'oak_wand', rarity: 0, stats: {}, owner: 'seller', listed: false, equipped: false, consumed: false }];
state.inventories.buyer = [];
c.MarketplaceEngine.setMarketState(state.marketplace);
var listed = c.MarketplaceEngine.createListing('seller', state.inventories.seller[0], 1250, A + 20, 0, 1);
assert.strictEqual(listed.success, true);
state.marketplace = c.MarketplaceEngine.getMarketState();

var buy = c.VTProtocol.createBazaarBuyAction(listed.listing.ref, 1, 1250);
apply(A + 21, 'reversible-buy', [custom('buyer', buy)], false);
assert.strictEqual(c.StateEngine.getMagicBalance('buyer'), 2000, 'reversible buy does not enter monetary replay');
assert.strictEqual(!!listed.listing.pendingPurchase, false, 'reversible buy cannot lock seller inventory');
apply(A + 21, 'buy-block', [custom('buyer', buy)], true);
assert.strictEqual(c.StateEngine.getMagicBalance('buyer'), 750);
assert.strictEqual(c.StateEngine.getMagicBalance('seller'), 1250);
assert.strictEqual(state.inventories.seller.length, 0);
assert.strictEqual(state.inventories.buyer.length, 1);
assert.strictEqual(state.inventories.buyer[0].owner, 'buyer');
assert.strictEqual(state.magic.supplyMilli, 2000, 'Bazaar settlement conserves MAGIC supply');

var orderBlock = A + 22;
state.inventories.seller2 = [{ id: 'ordered-item', type: 'water_dust', rarity: 0, stats: {}, owner: 'seller2', listed: false, equipped: false, consumed: false }];
state.characters.seller2 = { account: 'seller2' };
var orderedRef = orderBlock + '_ordered-item';
var orderedBuy = c.VTProtocol.parseAction(c.VTProtocol.createBazaarBuyAction(orderedRef, 1, 500));
c.StateEngine.processBlock({
    blockNum: orderBlock, blockHash: 'ordered-block', huntEntropy: 'ordered-prev', irreversible: true, awards: [], veEvents: [], voicePosts: [], transfers: [], fixedAwards: [], burnProofs: [],
    vmActions: [
        { sender: 'seller2', txIndex: 0, opIndex: 0, action: { type: c.VizMagicConfig.ACTION_TYPES.MARKET_LIST, data: { item_ref: 'ordered-item', price_milli: 500, revision: 1, expires_block: 0 } } },
        { sender: 'seller2', txIndex: 0, opIndex: 2, action: { type: c.VizMagicConfig.ACTION_TYPES.MARKET_CANCEL, data: { listing_ref: orderedRef } } }
    ],
    vtActions: [{ sender: 'buyer', txId: 'ordered-tx', txIndex: 0, opIndex: 1, regularAuths: ['buyer'], activeAuths: [], action: orderedBuy }]
});
assert.strictEqual(c.MarketplaceEngine.getMarketState().listings[orderedRef].state, 'sold', 'same-block market and VT operations finalize in operation order');
assert.strictEqual(!!c.MarketplaceEngine.getMarketState().listings[orderedRef].pendingPurchase, false, 'irreversible settlement clears its short-lived reservation');
assert.strictEqual(c.StateEngine.getMagicBalance('buyer'), 250);
assert.strictEqual(c.StateEngine.getMagicBalance('seller2'), 500);

var consumeBlock = A + 23;
state.inventories.seller3 = [{ id: 'listed-scroll', type: 'health_scroll', rarity: 0, stats: {}, owner: 'seller3', listed: false, equipped: false, consumed: false }];
state.characters.seller3 = { account: 'seller3', hp: 10, maxHp: 100 };
var consumeListing = c.MarketplaceEngine.createListing('seller3', state.inventories.seller3[0], 100, consumeBlock - 1, 0, 1).listing;
state.marketplace = c.MarketplaceEngine.getMarketState();
c.StateEngine.processBlock({
    blockNum: consumeBlock, blockHash: 'consume-order-block', huntEntropy: 'consume-order-prev', irreversible: true,
    awards: [], voicePosts: [], vmActions: [], transfers: [], fixedAwards: [], burnProofs: [],
    vtActions: [{ sender: 'buyer', txId: 'consume-buy-tx', txIndex: 0, opIndex: 0, regularAuths: ['buyer'], activeAuths: [], action: c.VTProtocol.parseAction(c.VTProtocol.createBazaarBuyAction(consumeListing.ref, 1, 100)) }],
    veEvents: [{ sender: 'seller3', txIndex: 0, opIndex: 1, event: { eventType: 'consume', targetBlock: 0, data: { item_ref: 'listed-scroll' } } }]
});
assert.strictEqual(state.inventories.seller3.length, 0, 'later VE consume cannot remove an item reserved by an earlier canonical buy');
assert.strictEqual(state.inventories.buyer.filter(function(item) { return item.id === 'listed-scroll'; })[0].owner, 'buyer');
assert.strictEqual(state.inventories.buyer.filter(function(item) { return item.id === 'listed-scroll'; })[0].consumed, false);
assert.strictEqual(c.StateEngine.getMagicBalance('buyer'), 150);
assert.strictEqual(c.StateEngine.getMagicBalance('seller3'), 100);

console.log('PASS StateEngine irreversible VT mint and atomic MAGIC Bazaar settlement');
