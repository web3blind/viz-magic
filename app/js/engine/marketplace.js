/**
 * Viz Magic — Marketplace Engine
 * Listings, trust trades, escrow trades, sealed-bid auctions.
 * Currency: Печати Мира (Realm Seals) = liquid VIZ.
 */
var MarketplaceEngine = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /** Default listing duration in blocks (~24 hours) */
    var DEFAULT_EXPIRES_BLOCKS = 28800;

    /** Maximum active listings per player */
    var MAX_LISTINGS_PER_PLAYER = 20;

    /**
     * In-memory marketplace state (synchronized via blockchain events)
     */
    var marketState = {
        listings: {},       // listingRef → ListingState
        history: [],        // completed trades
        priceHistory: {}    // itemType → [{price, block}]
    };

    /**
     * Create a listing
     * @param {string} seller - seller account
     * @param {Object} item - ItemState
     * @param {number} price - price in VIZ (integer, no decimals)
     * @param {number} currentBlock - current block number
     * @param {number} expiresBlock - block at which listing expires (0 = default)
     * @returns {Object} {success, listing, error}
     */
    function createListing(seller, item, price, currentBlock, expiresBlock) {
        // Validate
        if (!seller || !item) {
            return { success: false, error: 'invalid_params' };
        }

        if ((price | 0) <= 0) {
            return { success: false, error: 'invalid_price' };
        }

        if (item.owner !== seller) {
            return { success: false, error: 'not_owner' };
        }

        if (item.equipped) {
            return { success: false, error: 'item_equipped' };
        }

        if (item.consumed) {
            return { success: false, error: 'item_consumed' };
        }

        if (item.listed) {
            return { success: false, error: 'already_listed' };
        }

        // Check listing count
        var sellerCount = _countSellerListings(seller);
        if (sellerCount >= MAX_LISTINGS_PER_PLAYER) {
            return { success: false, error: 'too_many_listings' };
        }

        // Calculate expiration
        var expires = expiresBlock || (currentBlock + DEFAULT_EXPIRES_BLOCKS);

        // Create listing
        var listingRef = currentBlock + '_' + item.id;
        var listing = {
            ref: listingRef,
            itemRef: item.id,
            itemType: item.type,
            itemRarity: item.rarity,
            itemStats: item.stats ? _copyStats(item.stats) : {},
            seller: seller,
            price: price | 0,
            listedBlock: currentBlock,
            expiresBlock: expires,
            state: 'active', // active, sold, cancelled, expired
            buyer: null,
            soldBlock: 0
        };

        marketState.listings[listingRef] = listing;
        item.listed = true;

        return { success: true, listing: listing };
    }

    /**
     * Cancel a listing
     * @param {string} seller - seller account (must match listing seller)
     * @param {string} listingRef - listing reference
     * @param {Array} inventory - seller's inventory (to un-list item)
     * @returns {Object} {success, error}
     */
    function cancelListing(seller, listingRef, inventory) {
        var listing = marketState.listings[listingRef];
        if (!listing) {
            return { success: false, error: 'listing_not_found' };
        }

        if (listing.seller !== seller) {
            return { success: false, error: 'not_seller' };
        }

        if (listing.state !== 'active') {
            return { success: false, error: 'listing_not_active' };
        }

        // Cancel listing
        listing.state = 'cancelled';

        // Un-list the item
        for (var i = 0; i < inventory.length; i++) {
            if (inventory[i].id === listing.itemRef) {
                inventory[i].listed = false;
                break;
            }
        }

        return { success: true };
    }

    /**
     * Buy an item from a listing
     * @param {string} buyer - buyer account
     * @param {string} listingRef - listing reference
     * @param {number} currentBlock - current block
     * @param {Object} worldState - world state (for inventory transfer)
     * @returns {Object} {success, error, listing, item}
     */
    function buyItem(buyer, listingRef, currentBlock, worldState) {
        var listing = marketState.listings[listingRef];
        if (!listing) {
            return { success: false, error: 'listing_not_found' };
        }

        if (listing.state !== 'active') {
            return { success: false, error: 'listing_not_active' };
        }

        if (listing.expiresBlock > 0 && currentBlock > listing.expiresBlock) {
            listing.state = 'expired';
            return { success: false, error: 'listing_expired' };
        }

        if (listing.seller === buyer) {
            return { success: false, error: 'cannot_buy_own' };
        }

        // Find item in seller's inventory
        var sellerInv = worldState.inventories[listing.seller] || [];
        var item = null;
        var itemIndex = -1;
        for (var i = 0; i < sellerInv.length; i++) {
            if (sellerInv[i].id === listing.itemRef) {
                item = sellerInv[i];
                itemIndex = i;
                break;
            }
        }

        if (!item) {
            listing.state = 'cancelled';
            return { success: false, error: 'item_not_found' };
        }

        // Transfer item
        item.owner = buyer;
        item.listed = false;
        item.volatile_ = false; // Traded items become non-volatile

        // Remove from seller inventory
        sellerInv.splice(itemIndex, 1);

        // Add to buyer inventory
        if (!worldState.inventories[buyer]) {
            worldState.inventories[buyer] = [];
        }
        worldState.inventories[buyer].push(item);

        // Update listing
        listing.state = 'sold';
        listing.buyer = buyer;
        listing.soldBlock = currentBlock;

        // Track price history
        if (!marketState.priceHistory[listing.itemType]) {
            marketState.priceHistory[listing.itemType] = [];
        }
        marketState.priceHistory[listing.itemType].push({
            price: listing.price,
            block: currentBlock,
            rarity: listing.itemRarity
        });

        // Keep only last 50 price entries per item type
        if (marketState.priceHistory[listing.itemType].length > 50) {
            marketState.priceHistory[listing.itemType].shift();
        }

        // Add to trade history
        marketState.history.push({
            listingRef: listingRef,
            itemType: listing.itemType,
            itemRarity: listing.itemRarity,
            seller: listing.seller,
            buyer: buyer,
            price: listing.price,
            block: currentBlock
        });

        // Keep history trimmed
        if (marketState.history.length > 200) {
            marketState.history.shift();
        }

        return {
            success: true,
            listing: listing,
            item: item
        };
    }

    /**
     * Create a direct trade offer (trust trade)
     * @param {string} sender - offering player
     * @param {string} itemRef - item reference (block_type)
     * @param {string} recipient - target player
     * @param {string} reason - reason for transfer
     * @returns {Object} action data for broadcasting
     */
    function createOffer(sender, itemRef, recipient, reason) {
        return {
            type: 'item.transfer',
            sender: sender,
            itemRef: itemRef,
            to: recipient,
            reason: reason || 'gift'
        };
    }

    /**
     * Process an item transfer (trust trade or gift)
     * @param {string} sender - sender account
     * @param {string} itemRef - item id
     * @param {string} recipient - recipient account
     * @param {Object} worldState - for inventory access
     * @returns {Object} {success, error, item}
     */
    function transferItem(sender, itemRef, recipient, worldState) {
        var senderInv = worldState.inventories[sender] || [];
        var item = null;
        var idx = -1;

        for (var i = 0; i < senderInv.length; i++) {
            if (senderInv[i].id === itemRef) {
                item = senderInv[i];
                idx = i;
                break;
            }
        }

        if (!item) {
            return { success: false, error: 'item_not_found' };
        }

        if (item.equipped) {
            return { success: false, error: 'item_equipped' };
        }

        if (item.consumed) {
            return { success: false, error: 'item_consumed' };
        }

        if (item.listed) {
            return { success: false, error: 'item_listed' };
        }

        // Transfer
        item.owner = recipient;
        item.volatile_ = false;
        senderInv.splice(idx, 1);

        if (!worldState.inventories[recipient]) {
            worldState.inventories[recipient] = [];
        }
        worldState.inventories[recipient].push(item);

        return { success: true, item: item };
    }

    /**
     * Get all active listings, optionally filtered
     * @param {Object} [filters] - {category, rarity, seller, maxPrice, search}
     * @returns {Array} listings
     */
    function getListings(filters) {
        var results = [];
        filters = filters || {};

        for (var ref in marketState.listings) {
            if (!marketState.listings.hasOwnProperty(ref)) continue;
            var listing = marketState.listings[ref];
            if (listing.state !== 'active') continue;

            // Apply filters
            if (filters.category) {
                var template = ItemSystem.getItemTemplate(listing.itemType);
                if (!template || template.category !== filters.category) continue;
            }

            if (filters.rarity !== undefined && listing.itemRarity < filters.rarity) continue;

            if (filters.seller && listing.seller !== filters.seller) continue;

            if (filters.maxPrice && listing.price > filters.maxPrice) continue;

            if (filters.search) {
                var searchLower = filters.search.toLowerCase();
                var typeLower = listing.itemType.toLowerCase().replace(/_/g, ' ');
                if (typeLower.indexOf(searchLower) === -1) continue;
            }

            results.push(listing);
        }

        // Sort by price ascending
        results.sort(function(a, b) {
            return a.price - b.price;
        });

        return results;
    }

    /**
     * Get hot items (most traded recently)
     * @param {number} limit
     * @returns {Array}
     */
    function getHotItems(limit) {
        limit = limit || 5;
        var typeCounts = {};

        for (var i = 0; i < marketState.history.length; i++) {
            var h = marketState.history[i];
            typeCounts[h.itemType] = (typeCounts[h.itemType] || 0) + 1;
        }

        var sorted = Object.keys(typeCounts).map(function(type) {
            return { itemType: type, count: typeCounts[type] };
        });

        sorted.sort(function(a, b) { return b.count - a.count; });

        return sorted.slice(0, limit);
    }

    /**
     * Get price history for an item type
     * @param {string} itemType
     * @returns {Array} [{price, block, rarity}]
     */
    function getItemHistory(itemType) {
        return marketState.priceHistory[itemType] || [];
    }

    /**
     * Expire old listings
     * @param {number} currentBlock
     */
    function expireListings(currentBlock) {
        for (var ref in marketState.listings) {
            if (!marketState.listings.hasOwnProperty(ref)) continue;
            var listing = marketState.listings[ref];
            if (listing.state === 'active' && listing.expiresBlock > 0 && currentBlock > listing.expiresBlock) {
                listing.state = 'expired';
            }
        }
    }

    /**
     * Get market state (for serialization into world state)
     * @returns {Object}
     */
    function getMarketState() {
        return marketState;
    }

    /**
     * Set market state (from checkpoint)
     * @param {Object} state
     */
    function setMarketState(state) {
        if (state) {
            marketState = state;
        }
    }

    // --- Internal helpers ---

    function _countSellerListings(seller) {
        var count = 0;
        for (var ref in marketState.listings) {
            if (marketState.listings.hasOwnProperty(ref) &&
                marketState.listings[ref].seller === seller &&
                marketState.listings[ref].state === 'active') {
                count++;
            }
        }
        return count;
    }

    function _copyStats(stats) {
        var copy = {};
        for (var k in stats) {
            if (stats.hasOwnProperty(k)) {
                copy[k] = stats[k];
            }
        }
        return copy;
    }

    return {
        DEFAULT_EXPIRES_BLOCKS: DEFAULT_EXPIRES_BLOCKS,
        MAX_LISTINGS_PER_PLAYER: MAX_LISTINGS_PER_PLAYER,
        createListing: createListing,
        cancelListing: cancelListing,
        buyItem: buyItem,
        createOffer: createOffer,
        transferItem: transferItem,
        getListings: getListings,
        getHotItems: getHotItems,
        getItemHistory: getItemHistory,
        expireListings: expireListings,
        getMarketState: getMarketState,
        setMarketState: setMarketState
    };
})();
