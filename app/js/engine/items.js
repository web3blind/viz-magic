/**
 * Viz Magic — Item System
 * Item creation, ownership tracking, equipment slots, rarity system.
 */
var ItemSystem = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /** Equipment slots */
    var SLOTS = {
        HEAD:       'head',
        HANDS:      'hands',
        BODY:       'body',
        FEET:       'feet',
        ACCESSORY:  'accessory'
    };

    /** Item categories */
    var CATEGORIES = {
        FOCUS:      'focus',       // Weapons
        WARD:       'ward',        // Armor
        GLYPH:      'glyph',       // Modifiers
        RELIC:      'relic',       // Accessories
        SCROLL:     'scroll',      // Consumables
        KEY:        'key',         // Access items
        STRUCTURE:  'structure',   // Buildings
        MATERIAL:   'material'     // Crafting materials
    };

    /** Rarity names and color codes */
    var RARITY_INFO = [
        { name: 'common',    symbol: '',      color: '#9e9e9e' },
        { name: 'uncommon',  symbol: '\u2726',     color: '#4caf50' },
        { name: 'rare',      symbol: '\u2726\u2726',    color: '#2196f3' },
        { name: 'epic',      symbol: '\u2726\u2726\u2726',   color: '#9c27b0' },
        { name: 'legendary', symbol: '\u2726\u2726\u2726\u2726',  color: '#ffc107' }
    ];

    /**
     * Create a new item from a loot drop or craft result
     * @param {string} typeId - item type identifier
     * @param {string} owner - account name
     * @param {number} rarity - 0-4
     * @param {number} blockNum - creation block
     * @param {string} createdBy - crafter account (or '' for drops)
     * @param {boolean} isVolatile - true if from dangerous zone
     * @returns {Object} ItemState
     */
    function createItem(typeId, owner, rarity, blockNum, createdBy, isVolatile) {
        var template = getItemTemplate(typeId);
        var stats = _generateStats(template, rarity, blockNum);

        return {
            id: String(blockNum) + '_' + typeId,
            type: typeId,
            owner: owner,
            rarity: rarity,
            volatile_: isVolatile || false,
            equipped: false,
            stats: stats,
            createdBy: createdBy || '',
            createdBlock: blockNum,
            enchantments: [],
            category: template ? template.category : CATEGORIES.MATERIAL
        };
    }

    /**
     * Generate item stats based on template and rarity
     */
    function _generateStats(template, rarity, blockNum) {
        if (!template) return { pot: 0, res: 0, swf: 0, int: 0, for_: 0 };

        var rarityMult = 1000 + rarity * 300; // x1000: 1.0, 1.3, 1.6, 1.9, 2.2
        var baseStats = template.baseStats || {};

        return {
            pot: Math.floor((baseStats.pot || 0) * rarityMult / 1000),
            res: Math.floor((baseStats.res || 0) * rarityMult / 1000),
            swf: Math.floor((baseStats.swf || 0) * rarityMult / 1000),
            int: Math.floor((baseStats.int || 0) * rarityMult / 1000),
            for_: Math.floor((baseStats.for_ || 0) * rarityMult / 1000)
        };
    }

    /** Item templates (starter items + basic drops) */
    var ITEM_TEMPLATES = {
        oak_wand: {
            category: CATEGORIES.FOCUS,
            slot: SLOTS.HANDS,
            baseStats: { pot: 3, int: 1 }
        },
        ash_wand: {
            category: CATEGORIES.FOCUS,
            slot: SLOTS.HANDS,
            baseStats: { pot: 5, int: 2 }
        },
        iron_shield: {
            category: CATEGORIES.WARD,
            slot: SLOTS.HANDS,
            baseStats: { res: 5, pot: -1 }
        },
        cloth_robe: {
            category: CATEGORIES.WARD,
            slot: SLOTS.BODY,
            baseStats: { res: 2, int: 1 }
        },
        leather_boots: {
            category: CATEGORIES.WARD,
            slot: SLOTS.FEET,
            baseStats: { swf: 3 }
        },
        lucky_charm: {
            category: CATEGORIES.RELIC,
            slot: SLOTS.ACCESSORY,
            baseStats: { for_: 3 }
        },
        fire_dust: {
            category: CATEGORIES.MATERIAL,
            slot: null,
            baseStats: {}
        },
        shadow_shard: {
            category: CATEGORIES.MATERIAL,
            slot: null,
            baseStats: {}
        },
        thorn_essence: {
            category: CATEGORIES.MATERIAL,
            slot: null,
            baseStats: {}
        },
        health_scroll: {
            category: CATEGORIES.SCROLL,
            slot: null,
            baseStats: {}
        },
        echo_shards: {
            category: CATEGORIES.MATERIAL,
            slot: null,
            baseStats: {}
        },
        armageddon_stone: {
            category: CATEGORIES.RELIC,
            slot: SLOTS.ACCESSORY,
            baseStats: {}
        }
    };

    /**
     * Get item template by type ID
     */
    function getItemTemplate(typeId) {
        return ITEM_TEMPLATES[typeId] || null;
    }

    /**
     * Equip an item to a character
     * @param {Object} character - CharacterState
     * @param {Object} item - ItemState
     * @returns {Object|null} previously equipped item, or null
     */
    function equipItem(character, item) {
        var template = getItemTemplate(item.type);
        if (!template || !template.slot) return null;

        var previousItem = null;
        var slot = template.slot;

        // Check if something is already in this slot
        if (character.equipment[slot]) {
            previousItem = character.equipment[slot];
            previousItem.equipped = false;
        }

        character.equipment[slot] = item;
        item.equipped = true;

        return previousItem;
    }

    /**
     * Unequip an item from a slot
     * @param {Object} character
     * @param {string} slot
     * @returns {Object|null} unequipped item
     */
    function unequipItem(character, slot) {
        var item = character.equipment[slot];
        if (item) {
            item.equipped = false;
            delete character.equipment[slot];
        }
        return item || null;
    }

    /**
     * Crystallize an item (make it non-volatile — banked at safe zone)
     * @param {Object} item
     * @returns {Object}
     */
    function crystallize(item) {
        item.volatile_ = false;
        return item;
    }

    /**
     * Get equipment stat totals for a character
     * @param {Object} character
     * @returns {Object} {pot, res, swf, int, for_}
     */
    function getEquipmentBonuses(character) {
        var totals = { pot: 0, res: 0, swf: 0, int: 0, for_: 0 };
        for (var slot in character.equipment) {
            var item = character.equipment[slot];
            if (item && item.stats) {
                totals.pot += item.stats.pot || 0;
                totals.res += item.stats.res || 0;
                totals.swf += item.stats.swf || 0;
                totals.int += item.stats.int || 0;
                totals.for_ += item.stats.for_ || 0;
            }
        }
        return totals;
    }

    /**
     * Get rarity display info
     * @param {number} rarity
     * @returns {Object}
     */
    function getRarityInfo(rarity) {
        return RARITY_INFO[rarity] || RARITY_INFO[0];
    }

    return {
        SLOTS: SLOTS,
        CATEGORIES: CATEGORIES,
        RARITY_INFO: RARITY_INFO,
        ITEM_TEMPLATES: ITEM_TEMPLATES,
        createItem: createItem,
        getItemTemplate: getItemTemplate,
        equipItem: equipItem,
        unequipItem: unequipItem,
        crystallize: crystallize,
        getEquipmentBonuses: getEquipmentBonuses,
        getRarityInfo: getRarityInfo
    };
})();
