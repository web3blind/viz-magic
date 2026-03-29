/**
 * Viz Magic — Market Protocol Actions
 * VM protocol actions for marketplace, crafting, enchanting, and item transfer.
 * All actions broadcast via viz.broadcast.custom with VM protocol.
 */
var MarketProtocol = (function() {
    'use strict';

    var cfg = VizMagicConfig;
    var AT = cfg.ACTION_TYPES;

    /**
     * Create a market.list action
     * @param {string} itemRef - item reference (block_type)
     * @param {number} price - price in VIZ (integer)
     * @param {number} expiresBlock - block at which listing expires
     * @returns {Object} action data for broadcasting
     */
    function createListAction(itemRef, price, expiresBlock) {
        return {
            t: AT.MARKET_LIST,
            d: {
                item_ref: itemRef,
                price: price | 0,
                expires_block: expiresBlock | 0
            }
        };
    }

    /**
     * Create a market.cancel action
     * @param {string} listingRef - listing reference
     * @returns {Object} action data
     */
    function createCancelAction(listingRef) {
        return {
            t: AT.MARKET_CANCEL,
            d: {
                listing_ref: listingRef
            }
        };
    }

    /**
     * Create a market.buy action
     * @param {string} listingRef - listing reference
     * @returns {Object} action data
     */
    function createBuyAction(listingRef) {
        return {
            t: AT.MARKET_BUY,
            d: {
                listing_ref: listingRef
            }
        };
    }

    /**
     * Create an item.transfer action
     * @param {string} itemRef - item reference
     * @param {string} to - recipient account
     * @param {string} reason - transfer reason (gift, trade, etc.)
     * @returns {Object} action data
     */
    function createTransferAction(itemRef, to, reason) {
        return {
            t: AT.ITEM_TRANSFER,
            d: {
                item_ref: itemRef,
                to: to,
                reason: reason || 'transfer'
            }
        };
    }

    /**
     * Create a craft action
     * @param {string} recipeId - recipe identifier
     * @param {Array} materialIds - array of material item IDs
     * @param {string} location - current zone/locus
     * @returns {Object} action data
     */
    function createCraftAction(recipeId, materialIds, location) {
        return {
            t: AT.CRAFT,
            d: {
                recipe: recipeId,
                materials: materialIds || [],
                location: location || ''
            }
        };
    }

    /**
     * Create an enchant action (via VE protocol)
     * @param {string} itemRef - item to enchant
     * @param {string} enchantId - enchantment type
     * @param {string} runeRef - rune item reference being consumed
     * @returns {Object} VE protocol data
     */
    function createEnchantAction(itemRef, enchantId, runeRef) {
        return {
            protocol: cfg.PROTOCOLS.VE,
            action: 'append',
            d: {
                item_ref: itemRef,
                enchant: enchantId,
                rune_ref: runeRef
            }
        };
    }

    /**
     * Create a reforge action (via VE protocol)
     * @param {string} itemRef - item to reforge
     * @returns {Object} VE protocol data
     */
    function createReforgeAction(itemRef) {
        return {
            protocol: cfg.PROTOCOLS.VE,
            action: 'edit',
            d: {
                item_ref: itemRef,
                op: 'reforge'
            }
        };
    }

    /**
     * Create a consume action (via VE protocol)
     * @param {string} itemRef - item to consume (potion, scroll)
     * @returns {Object} VE protocol data
     */
    function createConsumeAction(itemRef) {
        return {
            protocol: cfg.PROTOCOLS.VE,
            action: 'hide',
            d: {
                item_ref: itemRef,
                op: 'consume'
            }
        };
    }

    /**
     * Broadcast a market listing
     * @param {string} itemRef
     * @param {number} price
     * @param {number} expiresBlock
     * @param {Function} callback
     */
    function broadcastList(itemRef, price, expiresBlock, callback) {
        var actionData = createListAction(itemRef, price, expiresBlock);
        VizBroadcast.gameAction(actionData, callback);
    }

    /**
     * Broadcast a market cancel
     * @param {string} listingRef
     * @param {Function} callback
     */
    function broadcastCancel(listingRef, callback) {
        var actionData = createCancelAction(listingRef);
        VizBroadcast.gameAction(actionData, callback);
    }

    /**
     * Broadcast a market buy
     * @param {string} listingRef
     * @param {Function} callback
     */
    function broadcastBuy(listingRef, callback) {
        var actionData = createBuyAction(listingRef);
        VizBroadcast.gameAction(actionData, callback);
    }

    /**
     * Broadcast an item transfer
     * @param {string} itemRef
     * @param {string} to
     * @param {string} reason
     * @param {Function} callback
     */
    function broadcastTransfer(itemRef, to, reason, callback) {
        var actionData = createTransferAction(itemRef, to, reason);
        VizBroadcast.gameAction(actionData, callback);
    }

    /**
     * Broadcast a craft action
     * @param {string} recipeId
     * @param {Array} materialIds
     * @param {string} location
     * @param {Function} callback
     */
    function broadcastCraft(recipeId, materialIds, location, callback) {
        var actionData = createCraftAction(recipeId, materialIds, location);
        VizBroadcast.gameAction(actionData, callback);
    }

    /**
     * Broadcast an enchant action (VE protocol)
     * @param {string} itemRef
     * @param {string} enchantId
     * @param {string} runeRef
     * @param {Function} callback
     */
    function broadcastEnchant(itemRef, enchantId, runeRef, callback) {
        var veData = createEnchantAction(itemRef, enchantId, runeRef);
        VizBroadcast.custom(cfg.PROTOCOLS.VE, veData, callback);
    }

    /**
     * Broadcast a reforge action (VE protocol)
     * @param {string} itemRef
     * @param {Function} callback
     */
    function broadcastReforge(itemRef, callback) {
        var veData = createReforgeAction(itemRef);
        VizBroadcast.custom(cfg.PROTOCOLS.VE, veData, callback);
    }

    /**
     * Broadcast a consume action (VE protocol)
     * @param {string} itemRef
     * @param {Function} callback
     */
    function broadcastConsume(itemRef, callback) {
        var veData = createConsumeAction(itemRef);
        VizBroadcast.custom(cfg.PROTOCOLS.VE, veData, callback);
    }

    return {
        createListAction: createListAction,
        createCancelAction: createCancelAction,
        createBuyAction: createBuyAction,
        createTransferAction: createTransferAction,
        createCraftAction: createCraftAction,
        createEnchantAction: createEnchantAction,
        createReforgeAction: createReforgeAction,
        createConsumeAction: createConsumeAction,
        broadcastList: broadcastList,
        broadcastCancel: broadcastCancel,
        broadcastBuy: broadcastBuy,
        broadcastTransfer: broadcastTransfer,
        broadcastCraft: broadcastCraft,
        broadcastEnchant: broadcastEnchant,
        broadcastReforge: broadcastReforge,
        broadcastConsume: broadcastConsume
    };
})();
