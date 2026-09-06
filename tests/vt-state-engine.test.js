'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');
var c = { console: { log: function() {}, warn: console.warn, error: console.error }, ActionValidator: { validate: function() { return { valid: true }; } } };
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
function apply(num, id, ops) {
    return c.StateEngine.processBlock(c.BlockProcessor.processBlock(rawBlock(num, id, ops), num));
}

var A = c.VizMagicConfig.TOKEN.ACTIVATION_BLOCK;
var mint = c.VTProtocol.createMintAction('state-mint', 'transfer', '2.000');
apply(A, 'mint-block', [
    ['transfer', { from: 'buyer', to: 'null', amount: '2.000 VIZ', memo: c.VTProtocol.mintMemo('state-mint') }],
    custom('buyer', mint)
]);
apply(A + 20, 'finalize-mint', []);
assert.strictEqual(c.StateEngine.getMagicBalance('buyer'), 2000, 'state engine finalizes transfer-backed mint at irreversible depth');

var state = c.StateEngine.getState();
state.inventories.seller = [{ id: 'item-state', type: 'oak_wand', rarity: 0, stats: {}, owner: 'seller', listed: false, equipped: false, consumed: false }];
state.inventories.buyer = [];
c.MarketplaceEngine.setMarketState(state.marketplace);
var listed = c.MarketplaceEngine.createListing('seller', state.inventories.seller[0], 1250, A + 20, 0, 1);
assert.strictEqual(listed.success, true);
state.marketplace = c.MarketplaceEngine.getMarketState();

var buy = c.VTProtocol.createBazaarBuyAction(listed.listing.ref, 1, 1250);
apply(A + 21, 'buy-block', [custom('buyer', buy)]);
assert.strictEqual(c.StateEngine.getMagicBalance('buyer'), 2000, 'reversible buy stays pending');
assert.strictEqual(listed.listing.pendingPurchase.buyer, 'buyer', 'pending buy reserves item before finality');
apply(A + 21, 'buy-fork', []);
assert.strictEqual(!!listed.listing.pendingPurchase, false, 'reorg releases reversible purchase reservation');
apply(A + 21, 'buy-block', [custom('buyer', buy)]);
assert.strictEqual(listed.listing.pendingPurchase.buyer, 'buyer', 'A-B-A retry restores the canonical reservation once');
apply(A + 41, 'finalize-buy', []);
assert.strictEqual(c.StateEngine.getMagicBalance('buyer'), 750);
assert.strictEqual(c.StateEngine.getMagicBalance('seller'), 1250);
assert.strictEqual(state.inventories.seller.length, 0);
assert.strictEqual(state.inventories.buyer.length, 1);
assert.strictEqual(state.inventories.buyer[0].owner, 'buyer');
assert.strictEqual(state.magic.supplyMilli, 2000, 'Bazaar settlement conserves MAGIC supply');

var orderBlock = A + 42;
state.inventories.seller2 = [{ id: 'ordered-item', type: 'water_dust', rarity: 0, stats: {}, owner: 'seller2', listed: false, equipped: false, consumed: false }];
state.characters.seller2 = { account: 'seller2' };
var orderedRef = orderBlock + '_ordered-item';
var orderedBuy = c.VTProtocol.parseAction(c.VTProtocol.createBazaarBuyAction(orderedRef, 1, 500));
c.StateEngine.processBlock({
    blockNum: orderBlock, blockHash: 'ordered-block', huntEntropy: 'ordered-prev', awards: [], veEvents: [], voicePosts: [], transfers: [], fixedAwards: [], burnProofs: [],
    vmActions: [
        { sender: 'seller2', txIndex: 0, opIndex: 0, action: { type: c.VizMagicConfig.ACTION_TYPES.MARKET_LIST, data: { item_ref: 'ordered-item', price_milli: 500, revision: 1, expires_block: 0 } } },
        { sender: 'seller2', txIndex: 0, opIndex: 2, action: { type: c.VizMagicConfig.ACTION_TYPES.MARKET_CANCEL, data: { listing_ref: orderedRef } } }
    ],
    vtActions: [{ sender: 'buyer', txId: 'ordered-tx', txIndex: 0, opIndex: 1, regularAuths: ['buyer'], activeAuths: [], action: orderedBuy }]
});
assert.strictEqual(c.MarketplaceEngine.getMarketState().listings[orderedRef].state, 'active', 'later same-block cancel cannot overtake an earlier reserved buy');
assert.strictEqual(c.MarketplaceEngine.getMarketState().listings[orderedRef].pendingPurchase.buyer, 'buyer');
apply(orderBlock + 20, 'ordered-final', []);
assert.strictEqual(c.MarketplaceEngine.getMarketState().listings[orderedRef].state, 'sold', 'same-block market and VT operations finalize in operation order');
assert.strictEqual(c.StateEngine.getMagicBalance('buyer'), 250);
assert.strictEqual(c.StateEngine.getMagicBalance('seller2'), 500);

console.log('PASS StateEngine irreversible VT mint and atomic MAGIC Bazaar settlement');
