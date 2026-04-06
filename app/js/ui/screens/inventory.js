/**
 * Viz Magic — Inventory / Bag Screen
 */
var InventoryScreen = (function() {
    'use strict';

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-inventory');
        if (!el) return;

        var user = VizAccount.getCurrentUser();
        var allItems = StateEngine.getInventory(user) || [];
        var items = [];
        for (var ai = 0; ai < allItems.length; ai++) {
            if (allItems[ai].consumed || allItems[ai].listed) continue;
            items.push(allItems[ai]);
        }

        var html = '<div class="inventory-screen"><h1>' + t('inv_title') + '</h1>';

        if (items.length === 0) {
            html += '<p class="empty-state">' + t('inv_empty') + '</p>';
        } else {
            html += '<div class="item-list" role="list">';
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var rInfo = ItemSystem.getRarityInfo(item.rarity);
                html += '<div class="item-card ' + Helpers.rarityClass(item.rarity) + '" role="listitem" tabindex="0" ' +
                    'aria-label="' + item.type + '. ' + rInfo.name + '.">' +
                    '<span class="item-rarity" aria-hidden="true">' + rInfo.symbol + '</span>' +
                    '<span class="item-name">' + item.type.replace(/_/g, ' ') + '</span>' +
                    (item.equipped ? '<span class="item-badge">[E]</span>' : '') +
                    (item.volatile_ ? '<span class="item-volatile">\u26A0</span>' : '') +
                    '</div>';
            }
            html += '</div>';
        }

        html += '</div>';
        el.innerHTML = html;
    }

    return { render: render };
})();