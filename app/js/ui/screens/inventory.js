/**
 * Viz Magic — Inventory / Bag Screen
 */
var InventoryScreen = (function() {
    'use strict';

    var FILTER_KEY = VizMagicConfig.STORAGE_PREFIX + 'inventory_filter';
    var SORT_KEY = VizMagicConfig.STORAGE_PREFIX + 'inventory_sort';
    var COMPACT_KEY = VizMagicConfig.STORAGE_PREFIX + 'inventory_compact';

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

        var groups = _buildGroups(items);
        var filter = _getStored(FILTER_KEY, 'all');
        var sort = _getStored(SORT_KEY, 'rarity_desc');
        var compact = _getStored(COMPACT_KEY, '0') === '1';
        groups = _applyFilter(groups, filter);
        groups = _applySort(groups, sort);

        var html = '<div class="inventory-screen"><h1>' + t('inv_title') + '</h1>';
        html += _renderControls(t, filter, sort, compact);

        if (groups.length === 0) {
            html += '<p class="empty-state">' + t('inv_empty') + '</p>';
        } else {
            html += '<div class="item-list" role="list">';
            for (var i = 0; i < groups.length; i++) {
                html += _renderGroup(groups[i], t, compact);
            }
            html += '</div>';
        }

        html += '</div>';
        el.innerHTML = html;
        _bindControls(el);
    }

    return { render: render };

    function _buildGroups(items) {
        var groupsByKey = {};
        var ordered = [];

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var key = _getGroupKey(item);
            if (!groupsByKey[key]) {
                groupsByKey[key] = {
                    key: key,
                    item: item,
                    count: 0,
                    items: []
                };
                ordered.push(groupsByKey[key]);
            }
            groupsByKey[key].count++;
            groupsByKey[key].items.push(item);
        }

        return ordered;
    }

    function _renderControls(t, filter, sort, compact) {
        var html = '<div class="settings-toggle-group" role="group" aria-label="' + Helpers.escapeHtml(t('inv_filters')) + '">';
        html += _renderFilterButton('all', t('inv_filter_all'), filter === 'all');
        html += _renderFilterButton('equipment', t('inv_filter_equipment'), filter === 'equipment');
        html += _renderFilterButton('materials', t('inv_filter_materials'), filter === 'materials');
        html += _renderFilterButton('consumables', t('inv_filter_consumables'), filter === 'consumables');
        html += '</div>';

        html += '<div class="settings-section" aria-label="' + Helpers.escapeHtml(t('inv_sort')) + '">';
        html += '<div class="settings-field">';
        html += '<label for="inv-sort" class="input-label">' + t('inv_sort') + '</label>';
        html += '<select id="inv-sort" class="input-field">';
        html += '<option value="rarity_desc"' + (sort === 'rarity_desc' ? ' selected' : '') + '>' + t('inv_sort_rarity_desc') + '</option>';
        html += '<option value="name_asc"' + (sort === 'name_asc' ? ' selected' : '') + '>' + t('inv_sort_name_asc') + '</option>';
        html += '<option value="count_desc"' + (sort === 'count_desc' ? ' selected' : '') + '>' + t('inv_sort_count_desc') + '</option>';
        html += '</select>';
        html += '</div>';

        html += '<div class="settings-field settings-toggle">';
        html += '<label for="inv-compact" class="settings-toggle-label">' + t('inv_compact_mode') + '</label>';
        html += '<button id="inv-compact" class="settings-toggle-btn' + (compact ? ' active' : '') + '" role="switch" aria-checked="' + compact + '">';
        html += '<span class="toggle-knob"></span>';
        html += '</button>';
        html += '</div>';
        html += '</div>';

        return html;
    }

    function _renderFilterButton(value, label, active) {
        return '<button class="btn btn-sm ' + (active ? 'btn-primary' : 'btn-secondary') + ' inv-filter-btn" data-filter="' + value + '" aria-pressed="' + active + '">' + Helpers.escapeHtml(label) + '</button>';
    }

    function _bindControls(el) {
        var filterBtns = el.querySelectorAll('.inv-filter-btn');
        for (var i = 0; i < filterBtns.length; i++) {
            filterBtns[i].addEventListener('click', function() {
                _setStored(FILTER_KEY, this.getAttribute('data-filter'));
                render();
            });
        }

        var sortSelect = el.querySelector('#inv-sort');
        if (sortSelect) {
            sortSelect.addEventListener('change', function() {
                _setStored(SORT_KEY, this.value);
                render();
            });
        }

        var compactBtn = el.querySelector('#inv-compact');
        if (compactBtn) {
            compactBtn.addEventListener('click', function() {
                var next = !this.classList.contains('active');
                _setStored(COMPACT_KEY, next ? '1' : '0');
                render();
            });
        }
    }

    function _applyFilter(groups, filter) {
        if (filter === 'all') return groups.slice();
        var filtered = [];
        for (var i = 0; i < groups.length; i++) {
            var category = _getCategory(groups[i].item);
            if (filter === 'equipment' && _isEquipmentCategory(category)) filtered.push(groups[i]);
            if (filter === 'materials' && category === ItemSystem.CATEGORIES.MATERIAL) filtered.push(groups[i]);
            if (filter === 'consumables' && category === ItemSystem.CATEGORIES.SCROLL) filtered.push(groups[i]);
        }
        return filtered;
    }

    function _applySort(groups, sort) {
        var sorted = groups.slice();
        sorted.sort(function(a, b) {
            if (sort === 'name_asc') {
                return _itemName(a.item.type).localeCompare(_itemName(b.item.type));
            }
            if (sort === 'count_desc') {
                if (b.count !== a.count) return b.count - a.count;
                if (b.item.rarity !== a.item.rarity) return b.item.rarity - a.item.rarity;
                return _itemName(a.item.type).localeCompare(_itemName(b.item.type));
            }

            if (b.item.rarity !== a.item.rarity) return b.item.rarity - a.item.rarity;
            if (b.count !== a.count) return b.count - a.count;
            return _itemName(a.item.type).localeCompare(_itemName(b.item.type));
        });
        return sorted;
    }

    function _getGroupKey(item) {
        var template = ItemSystem.getItemTemplate(item.type);
        var category = item.category || (template ? template.category : ItemSystem.CATEGORIES.MATERIAL);

        if (_isSimpleStackable(item, template, category)) {
            return 'simple:' + item.type;
        }

        return [
            'detailed',
            item.type,
            item.rarity,
            item.equipped ? 'eq1' : 'eq0',
            item.volatile_ ? 'vol1' : 'vol0',
            _statsKey(item.stats),
            _enchantmentsKey(item.enchantments)
        ].join('|');
    }

    function _isSimpleStackable(item, template, category) {
        if (item.equipped) return false;
        if (item.volatile_) return false;
        if (_hasMeaningfulStats(item.stats)) return false;
        if (item.enchantments && item.enchantments.length > 0) return false;

        return category === ItemSystem.CATEGORIES.MATERIAL || category === ItemSystem.CATEGORIES.KEY || category === ItemSystem.CATEGORIES.STRUCTURE || category === ItemSystem.CATEGORIES.SCROLL;
    }

    function _isEquipmentCategory(category) {
        return category === ItemSystem.CATEGORIES.FOCUS || category === ItemSystem.CATEGORIES.WARD || category === ItemSystem.CATEGORIES.GLYPH || category === ItemSystem.CATEGORIES.RELIC;
    }

    function _getCategory(item) {
        var template = ItemSystem.getItemTemplate(item.type);
        return item.category || (template ? template.category : ItemSystem.CATEGORIES.MATERIAL);
    }

    function _hasMeaningfulStats(stats) {
        if (!stats) return false;
        return !!((stats.pot || 0) || (stats.res || 0) || (stats.swf || 0) || (stats.int || 0) || (stats.for_ || 0));
    }

    function _statsKey(stats) {
        stats = stats || {};
        return [stats.pot || 0, stats.res || 0, stats.swf || 0, stats.int || 0, stats.for_ || 0].join(',');
    }

    function _enchantmentsKey(enchantments) {
        if (!enchantments || !enchantments.length) return 'none';
        var ids = [];
        for (var i = 0; i < enchantments.length; i++) {
            ids.push(enchantments[i].type || ('ench' + i));
        }
        ids.sort();
        return ids.join(',');
    }

    function _renderGroup(group, t, compact) {
        var item = group.item;
        var rInfo = ItemSystem.getRarityInfo(item.rarity);
        var label = _itemName(item.type);
        var aria = label + '. ' + rInfo.name + '. ' + t('inv_count') + ': ' + group.count + '.';
        if (!compact && _hasMeaningfulStats(item.stats)) {
            aria += ' ' + _statsText(item.stats, t) + '.';
        }

        return '<div class="item-card ' + Helpers.rarityClass(item.rarity) + '" role="listitem" tabindex="0" ' +
            'aria-label="' + Helpers.escapeHtml(aria) + '">' +
            '<span class="item-rarity" aria-hidden="true">' + rInfo.symbol + '</span>' +
            '<span class="item-name">' + Helpers.escapeHtml(label) + '</span>' +
            (group.count > 1 ? '<span class="item-badge">×' + group.count + '</span>' : '') +
            (item.equipped ? '<span class="item-badge">[E]</span>' : '') +
            (item.volatile_ ? '<span class="item-volatile">\u26A0</span>' : '') +
            (!compact && _hasMeaningfulStats(item.stats) ? '<span class="item-name"> · ' + Helpers.escapeHtml(_statsText(item.stats, t)) + '</span>' : '') +
            '</div>';
    }

    function _statsText(stats, t) {
        var parts = [];
        if ((stats.pot || 0) !== 0) parts.push(t('stat_pot') + ' ' + stats.pot);
        if ((stats.res || 0) !== 0) parts.push(t('stat_res') + ' ' + stats.res);
        if ((stats.swf || 0) !== 0) parts.push(t('stat_swf') + ' ' + stats.swf);
        if ((stats.int || 0) !== 0) parts.push(t('stat_int') + ' ' + stats.int);
        if ((stats.for_ || 0) !== 0) parts.push(t('stat_for') + ' ' + stats.for_);
        return parts.join(', ');
    }

    function _itemName(type) {
        var translated = Helpers.t('item_' + type);
        if (translated && translated !== ('item_' + type)) return translated;
        return String(type || '').replace(/_/g, ' ');
    }

    function _getStored(key, fallback) {
        try {
            var value = localStorage.getItem(key);
            return value === null ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    function _setStored(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {}
    }
})();
