/**
 * Viz Magic — Bazaar (Marketplace) Screen
 * Browse, buy, sell, and trade items.
 * Currency: Печати Мира (Realm Seals).
 */
var MarketplaceScreen = (function() {
    'use strict';

    var currentTab = 'browse';
    var currentCategory = '';
    var searchQuery = '';
    var selectedItem = null;

    /**
     * Render the marketplace screen
     */
    function render() {
        var t = Helpers.t;
        var container = Helpers.$('screen-marketplace');
        if (!container) return;

        var html = '<div class="marketplace-screen">';
        html += '<h1>' + t('market_title') + '</h1>';

        // Tabs
        html += '<div class="market-tabs" role="tablist" aria-label="' + t('market_tabs') + '">';
        html += _tab('browse', t('market_browse'));
        html += _tab('sell', t('market_sell'));
        html += _tab('trade', t('market_trade'));
        html += '</div>';

        // Tab content
        switch (currentTab) {
            case 'browse': html += _renderBrowse(); break;
            case 'sell':   html += _renderSell(); break;
            case 'trade':  html += _renderTrade(); break;
        }

        html += '</div>';
        container.innerHTML = html;
        _bindEvents(container);
    }

    function _tab(id, label) {
        var active = currentTab === id ? ' active' : '';
        return '<button class="btn btn-secondary market-tab' + active + '" data-tab="' + id + '" ' +
               'role="tab" aria-selected="' + (currentTab === id) + '">' + label + '</button>';
    }

    /**
     * Render browse tab
     */
    function _renderBrowse() {
        var t = Helpers.t;
        var html = '';

        // Search bar
        html += '<div class="market-search">';
        html += '<label for="market-search-input" class="sr-only">' + t('market_search') + '</label>';
        html += '<input type="text" id="market-search-input" class="input-field" ' +
                'placeholder="' + t('market_search_placeholder') + '" ' +
                'value="' + Helpers.escapeHtml(searchQuery) + '" aria-label="' + t('market_search') + '">';
        html += '</div>';

        // Category filters
        html += '<div class="market-categories" role="group" aria-label="' + t('market_filter_category') + '">';
        var categories = [
            { id: '',          label: t('market_cat_all') },
            { id: 'focus',     label: t('market_cat_weapon') },
            { id: 'ward',      label: t('market_cat_armor') },
            { id: 'glyph',     label: t('market_cat_spell') },
            { id: 'material',  label: t('market_cat_material') },
            { id: 'scroll',    label: t('market_cat_consumable') }
        ];

        for (var c = 0; c < categories.length; c++) {
            var cat = categories[c];
            var catActive = currentCategory === cat.id ? ' active' : '';
            html += '<button class="btn btn-sm market-cat-btn' + catActive + '" data-cat="' + cat.id + '">' +
                    cat.label + '</button>';
        }
        html += '</div>';

        // Hot items
        var hotItems = MarketplaceEngine.getHotItems(3);
        if (hotItems.length > 0) {
            html += '<div class="market-hot">';
            html += '<h2>' + t('market_hot_items') + '</h2>';
            html += '<div class="market-hot-list">';
            for (var h = 0; h < hotItems.length; h++) {
                var hot = hotItems[h];
                var hotName = t('item_' + hot.itemType) || hot.itemType.replace(/_/g, ' ');
                html += '<span class="market-hot-tag">' + hotName + ' (' + hot.count + ')</span>';
            }
            html += '</div></div>';
        }

        // Listings
        var filters = {};
        if (currentCategory) filters.category = currentCategory;
        if (searchQuery) filters.search = searchQuery;
        var listings = MarketplaceEngine.getListings(filters);

        html += '<div class="market-listings" role="list" aria-label="' + t('market_listings') + '">';
        if (listings.length === 0) {
            html += '<div class="empty-state">' + t('market_no_listings') + '</div>';
        } else {
            for (var i = 0; i < listings.length; i++) {
                html += _renderListingCard(listings[i]);
            }
        }
        html += '</div>';

        return html;
    }

    /**
     * Render a single listing card
     */
    function _renderListingCard(listing) {
        var t = Helpers.t;
        var rarityInfo = ItemSystem.getRarityInfo(listing.itemRarity);
        var rarityClass = Helpers.rarityClass(listing.itemRarity);
        var itemName = t('item_' + listing.itemType) || listing.itemType.replace(/_/g, ' ');
        var rarityName = t('rarity_' + rarityInfo.name);

        var html = '<div class="market-listing-card ' + rarityClass + '" role="listitem" data-listing="' + listing.ref + '">';
        html += '<div class="listing-header">';
        html += '<span class="listing-name">' + Helpers.escapeHtml(itemName) + '</span>';
        html += '<span class="listing-rarity rarity-color-' + rarityInfo.name + '">' + rarityInfo.symbol + ' ' + rarityName + '</span>';
        html += '</div>';

        // Stats
        if (listing.itemStats) {
            html += '<div class="listing-stats">';
            var statKeys = ['pot', 'res', 'swf', 'int', 'for_'];
            var statNames = { pot: t('char_potency'), res: t('char_resilience'), swf: t('char_swiftness'), int: t('char_intellect'), for_: t('char_fortune') };
            for (var s = 0; s < statKeys.length; s++) {
                var val = listing.itemStats[statKeys[s]];
                if (val && val !== 0) {
                    var sign = val > 0 ? '+' : '';
                    html += '<span class="listing-stat">' + statNames[statKeys[s]] + ' ' + sign + val + '</span>';
                }
            }
            html += '</div>';
        }

        html += '<div class="listing-footer">';
        html += '<span class="listing-seller">' + Helpers.escapeHtml(listing.seller) + '</span>';
        html += '<span class="listing-price">' + listing.price + ' ' + t('market_seals') + '</span>';
        html += '</div>';

        // Buy button
        var user = typeof VizAccount !== 'undefined' ? VizAccount.getCurrentUser() : '';
        if (user && listing.seller !== user) {
            html += '<button class="btn btn-primary btn-sm market-buy-btn" data-listing="' + listing.ref + '" ' +
                    'aria-label="' + t('market_buy') + ' ' + Helpers.escapeHtml(itemName) + '">' +
                    t('market_buy') + '</button>';
        }

        html += '</div>';
        return html;
    }

    /**
     * Render sell tab
     */
    function _renderSell() {
        var t = Helpers.t;
        var html = '';
        var user = typeof VizAccount !== 'undefined' ? VizAccount.getCurrentUser() : '';
        if (!user) {
            html += '<div class="empty-state">' + t('market_login_required') + '</div>';
            return html;
        }

        var inventory = StateEngine.getInventory(user);
        var sellableItems = [];
        for (var i = 0; i < inventory.length; i++) {
            var item = inventory[i];
            if (!item.consumed && !item.equipped && !item.listed) {
                sellableItems.push(item);
            }
        }

        html += '<h2>' + t('market_sell_title') + '</h2>';

        // Active listings
        var myListings = MarketplaceEngine.getListings({ seller: user });
        if (myListings.length > 0) {
            html += '<div class="market-my-listings">';
            html += '<h3>' + t('market_active_listings') + '</h3>';
            for (var ml = 0; ml < myListings.length; ml++) {
                var mListing = myListings[ml];
                var mName = t('item_' + mListing.itemType) || mListing.itemType.replace(/_/g, ' ');
                html += '<div class="market-my-listing">';
                html += '<span>' + Helpers.escapeHtml(mName) + ' — ' + mListing.price + ' ' + t('market_seals') + '</span>';
                html += '<button class="btn btn-sm btn-secondary market-cancel-btn" data-listing="' + mListing.ref + '">' +
                        t('market_cancel_listing') + '</button>';
                html += '</div>';
            }
            html += '</div>';
        }

        // Sellable items
        if (sellableItems.length === 0) {
            html += '<div class="empty-state">' + t('market_nothing_to_sell') + '</div>';
        } else {
            html += '<div class="market-sell-list" role="list">';
            for (var j = 0; j < sellableItems.length; j++) {
                var sItem = sellableItems[j];
                var sName = t('item_' + sItem.type) || sItem.type.replace(/_/g, ' ');
                var sRarity = ItemSystem.getRarityInfo(sItem.rarity);
                html += '<div class="market-sell-item ' + Helpers.rarityClass(sItem.rarity) + '" role="listitem" data-item="' + sItem.id + '">';
                html += '<span class="sell-item-name rarity-color-' + sRarity.name + '">' + sRarity.symbol + ' ' + Helpers.escapeHtml(sName) + '</span>';
                html += '<div class="sell-item-controls">';
                html += '<label for="price-' + sItem.id + '" class="sr-only">' + t('market_set_price') + '</label>';
                html += '<input type="number" id="price-' + sItem.id + '" class="input-field sell-price-input" min="1" placeholder="' + t('market_price_placeholder') + '" aria-label="' + t('market_set_price') + '">';
                html += '<button class="btn btn-primary btn-sm market-list-btn" data-item="' + sItem.id + '">' + t('market_list_item') + '</button>';
                html += '</div>';
                html += '</div>';
            }
            html += '</div>';
        }

        return html;
    }

    /**
     * Render trade tab (Warded Trade)
     */
    function _renderTrade() {
        var t = Helpers.t;
        var html = '';

        html += '<h2>' + t('market_warded_trade') + '</h2>';
        html += '<p class="market-trade-desc">' + t('market_warded_desc') + '</p>';

        html += '<div class="market-trade-form">';
        html += '<label for="trade-recipient" class="input-label">' + t('market_trade_to') + '</label>';
        html += '<input type="text" id="trade-recipient" class="input-field" placeholder="' + t('market_trade_to_placeholder') + '">';

        html += '<label for="trade-item-select" class="input-label">' + t('market_trade_item') + '</label>';
        html += '<select id="trade-item-select" class="input-field" aria-label="' + t('market_trade_item') + '">';
        html += '<option value="">' + t('market_select_item') + '</option>';

        var user = typeof VizAccount !== 'undefined' ? VizAccount.getCurrentUser() : '';
        if (user) {
            var inv = StateEngine.getInventory(user);
            for (var i = 0; i < inv.length; i++) {
                var item = inv[i];
                if (!item.consumed && !item.equipped && !item.listed) {
                    var name = t('item_' + item.type) || item.type.replace(/_/g, ' ');
                    html += '<option value="' + item.id + '">' + name + '</option>';
                }
            }
        }
        html += '</select>';

        html += '<label for="trade-reason" class="input-label">' + t('market_trade_reason') + '</label>';
        html += '<input type="text" id="trade-reason" class="input-field" placeholder="' + t('market_trade_reason_placeholder') + '">';

        html += '<button class="btn btn-primary market-send-trade-btn" id="btn-send-trade">' + t('market_send_trade') + '</button>';
        html += '</div>';

        return html;
    }

    /**
     * Bind event handlers
     */
    function _bindEvents(container) {
        // Tab switching
        var tabs = container.querySelectorAll('.market-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].addEventListener('click', function() {
                currentTab = this.getAttribute('data-tab');
                SoundManager.play('tap');
                render();
            });
        }

        // Category filters
        var catBtns = container.querySelectorAll('.market-cat-btn');
        for (var c = 0; c < catBtns.length; c++) {
            catBtns[c].addEventListener('click', function() {
                currentCategory = this.getAttribute('data-cat');
                SoundManager.play('tap');
                render();
            });
        }

        // Search
        var searchInput = container.querySelector('#market-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', Helpers.debounce(function() {
                searchQuery = this.value;
                render();
            }, 300));
        }

        // Buy buttons
        var buyBtns = container.querySelectorAll('.market-buy-btn');
        for (var b = 0; b < buyBtns.length; b++) {
            buyBtns[b].addEventListener('click', function() {
                var listingRef = this.getAttribute('data-listing');
                _handleBuy(listingRef);
            });
        }

        // Cancel listing buttons
        var cancelBtns = container.querySelectorAll('.market-cancel-btn');
        for (var cc = 0; cc < cancelBtns.length; cc++) {
            cancelBtns[cc].addEventListener('click', function() {
                var listingRef = this.getAttribute('data-listing');
                _handleCancel(listingRef);
            });
        }

        // List item buttons
        var listBtns = container.querySelectorAll('.market-list-btn');
        for (var l = 0; l < listBtns.length; l++) {
            listBtns[l].addEventListener('click', function() {
                var itemId = this.getAttribute('data-item');
                _handleList(itemId, container);
            });
        }

        // Send trade button
        var tradeBtn = container.querySelector('#btn-send-trade');
        if (tradeBtn) {
            tradeBtn.addEventListener('click', _handleTrade);
        }
    }

    /**
     * Handle buy action with confirmation
     */
    function _handleBuy(listingRef) {
        var t = Helpers.t;
        var listings = MarketplaceEngine.getListings();
        var listing = null;
        for (var i = 0; i < listings.length; i++) {
            if (listings[i].ref === listingRef) {
                listing = listings[i];
                break;
            }
        }
        if (!listing) return;

        var itemName = t('item_' + listing.itemType) || listing.itemType.replace(/_/g, ' ');
        var msg = t('market_buy_confirm', { item: itemName, price: listing.price });

        Modal.show({
            title: t('market_buy'),
            text: msg,
            buttons: [
                {
                    text: t('confirm'),
                    className: 'btn-primary',
                    action: function() {
                        SoundManager.play('success');
                        MarketProtocol.broadcastBuy(listingRef, function(err, result) {
                            if (err) {
                                Toast.error(t('market_buy_error'));
                                SoundManager.play('error');
                            } else {
                                Toast.success(t('market_bought'));
                                SoundManager.play('equip');
                                SoundManager.vibrate('loot');
                                render();
                            }
                        });
                    }
                },
                {
                    text: t('cancel'),
                    className: 'btn-secondary',
                    action: function() {}
                }
            ]
        });
    }

    /**
     * Handle cancel listing
     */
    function _handleCancel(listingRef) {
        var t = Helpers.t;
        SoundManager.play('tap');
        MarketProtocol.broadcastCancel(listingRef, function(err) {
            if (err) {
                Toast.error(t('market_cancel_error'));
                SoundManager.play('error');
            } else {
                Toast.success(t('market_cancelled'));
                render();
            }
        });
    }

    /**
     * Handle list item for sale
     */
    function _handleList(itemId, container) {
        var t = Helpers.t;
        var priceInput = container.querySelector('#price-' + itemId);
        if (!priceInput) return;

        var price = parseInt(priceInput.value, 10);
        if (!price || price <= 0) {
            Toast.error(t('market_invalid_price'));
            SoundManager.play('error');
            return;
        }

        SoundManager.play('tap');
        MarketProtocol.broadcastList(itemId, price, 0, function(err) {
            if (err) {
                Toast.error(t('market_list_error'));
                SoundManager.play('error');
            } else {
                Toast.success(t('market_listed'));
                SoundManager.play('success');
                render();
            }
        });
    }

    /**
     * Handle direct trade
     */
    function _handleTrade() {
        var t = Helpers.t;
        var recipient = (Helpers.$('trade-recipient') || {}).value || '';
        var itemId = (Helpers.$('trade-item-select') || {}).value || '';
        var reason = (Helpers.$('trade-reason') || {}).value || 'gift';

        if (!recipient || !itemId) {
            Toast.error(t('market_trade_missing'));
            SoundManager.play('error');
            return;
        }

        SoundManager.play('tap');
        MarketProtocol.broadcastTransfer(itemId, recipient, reason, function(err) {
            if (err) {
                Toast.error(t('market_trade_error'));
                SoundManager.play('error');
            } else {
                Toast.success(t('market_trade_sent'));
                SoundManager.play('success');
                SoundManager.vibrate('double');
                render();
            }
        });
    }

    return {
        render: render
    };
})();
