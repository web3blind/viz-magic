/**
 * Viz Magic — Enchanting System (VE Protocol)
 * Append enchantments, reforge items, consume consumables.
 * Uses VE (VIZ Events) protocol for on-chain representation.
 */
var EnchantingSystem = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /** Maximum enchantments per item */
    var MAX_ENCHANTS = 3;

    /** Enchantment types and their stat bonuses */
    var ENCHANT_TYPES = {
        fire_rune: {
            id: 'fire_rune',
            nameKey: 'enchant_fire_rune',
            stats: { pot: 3 },
            element: 'ignis',
            manaCost: 200
        },
        shadow_rune: {
            id: 'shadow_rune',
            nameKey: 'enchant_shadow_rune',
            stats: { swf: 2, for_: 1 },
            element: 'umbra',
            manaCost: 200
        },
        earth_rune: {
            id: 'earth_rune',
            nameKey: 'enchant_earth_rune',
            stats: { res: 3 },
            element: 'terra',
            manaCost: 200
        },
        wind_rune: {
            id: 'wind_rune',
            nameKey: 'enchant_wind_rune',
            stats: { swf: 3 },
            element: 'ventus',
            manaCost: 200
        },
        water_rune: {
            id: 'water_rune',
            nameKey: 'enchant_water_rune',
            stats: { int: 2, res: 1 },
            element: 'aqua',
            manaCost: 200
        },
        fortune_rune: {
            id: 'fortune_rune',
            nameKey: 'enchant_fortune_rune',
            stats: { for_: 3 },
            element: null,
            manaCost: 300
        }
    };

    /**
     * Get enchantment type definition
     * @param {string} enchantId
     * @returns {Object|null}
     */
    function getEnchantType(enchantId) {
        return ENCHANT_TYPES[enchantId] || null;
    }

    /**
     * Get available enchantment slots for an item
     * @param {Object} item - ItemState
     * @returns {number} remaining slots (0 to MAX_ENCHANTS)
     */
    function getEnchantmentSlots(item) {
        if (!item) return 0;
        var current = (item.enchantments || []).length;
        return Math.max(0, MAX_ENCHANTS - current);
    }

    /**
     * Enchant an item (VE append event)
     * Adds stat bonuses to an existing item.
     * @param {Object} item - ItemState (will be mutated)
     * @param {string} enchantId - enchantment type ID
     * @param {Object} runeItem - the rune item being consumed (will be marked consumed)
     * @param {Object} character - CharacterState
     * @returns {Object} {success, error, enchantment}
     */
    function enchantItem(item, enchantId, runeItem, character) {
        // Validate
        if (!item || !enchantId) {
            return { success: false, error: 'invalid_params' };
        }

        var enchantType = getEnchantType(enchantId);
        if (!enchantType) {
            return { success: false, error: 'unknown_enchant' };
        }

        // Check slots
        var slots = getEnchantmentSlots(item);
        if (slots <= 0) {
            return { success: false, error: 'no_slots' };
        }

        // Check item is equippable (not a material or consumable)
        var template = ItemSystem.getItemTemplate(item.type);
        if (!template || !template.slot) {
            return { success: false, error: 'not_enchantable' };
        }

        // Check rune item exists and is correct type
        if (!runeItem || runeItem.type !== enchantId) {
            return { success: false, error: 'wrong_rune' };
        }

        // Check mana
        var manaCost = enchantType.manaCost || 0;
        if (manaCost > 0 && (character.mana || 0) < manaCost) {
            return { success: false, error: 'not_enough_mana' };
        }

        // Check for duplicate enchantment type
        var enchantments = item.enchantments || [];
        for (var i = 0; i < enchantments.length; i++) {
            if (enchantments[i].type === enchantId) {
                return { success: false, error: 'duplicate_enchant' };
            }
        }

        // Apply enchantment
        var enchantment = {
            type: enchantId,
            stats: {},
            element: enchantType.element
        };

        // Copy stats (integer only)
        for (var stat in enchantType.stats) {
            if (enchantType.stats.hasOwnProperty(stat)) {
                enchantment.stats[stat] = enchantType.stats[stat] | 0;
                // Add to item stats
                if (!item.stats) item.stats = {};
                item.stats[stat] = (item.stats[stat] || 0) + (enchantType.stats[stat] | 0);
            }
        }

        if (!item.enchantments) item.enchantments = [];
        item.enchantments.push(enchantment);

        // Consume the rune
        runeItem.consumed = true;

        // Consume mana
        if (manaCost > 0 && character.mana !== undefined) {
            character.mana = Math.max(0, character.mana - manaCost);
        }

        return {
            success: true,
            enchantment: enchantment
        };
    }

    /**
     * Reforge an item (VE edit event)
     * Re-rolls stats based on current rarity, potentially upgrading.
     * @param {Object} item - ItemState (will be mutated)
     * @param {Object} character - CharacterState
     * @param {string} blockHash - for deterministic RNG
     * @param {number} blockNum - block number
     * @param {string} account - owner account
     * @returns {Object} {success, error, oldStats, newStats, rarityChanged}
     */
    function reforgeItem(item, character, blockHash, blockNum, account) {
        if (!item) {
            return { success: false, error: 'invalid_item' };
        }

        var template = ItemSystem.getItemTemplate(item.type);
        if (!template || !template.slot) {
            return { success: false, error: 'not_reforgeable' };
        }

        // Reforge costs 500 mana
        var manaCost = 500;
        if ((character.mana || 0) < manaCost) {
            return { success: false, error: 'not_enough_mana' };
        }

        // Save old stats
        var oldStats = {};
        for (var s in item.stats) {
            if (item.stats.hasOwnProperty(s)) {
                oldStats[s] = item.stats[s];
            }
        }

        // Calculate new quality (may upgrade rarity)
        var equipBonuses = ItemSystem.getEquipmentBonuses(character);
        var totalInt = (character.stats ? character.stats.int || 0 : 0) + (equipBonuses.int || 0);
        var quality = CraftingSystem.calculateQuality(blockHash, account, blockNum, totalInt, character.className);

        // Rarity can only go up or stay same on reforge
        var newRarity = Math.max(item.rarity, quality.rarity);
        var rarityChanged = newRarity !== item.rarity;
        item.rarity = newRarity;

        // Regenerate base stats
        var rarityMult = 1000 + newRarity * 300;
        var baseStats = template.baseStats || {};
        item.stats = {
            pot: Math.floor((baseStats.pot || 0) * rarityMult / 1000),
            res: Math.floor((baseStats.res || 0) * rarityMult / 1000),
            swf: Math.floor((baseStats.swf || 0) * rarityMult / 1000),
            int: Math.floor((baseStats.int || 0) * rarityMult / 1000),
            for_: Math.floor((baseStats.for_ || 0) * rarityMult / 1000)
        };

        // Re-apply existing enchantments
        var enchantments = item.enchantments || [];
        for (var i = 0; i < enchantments.length; i++) {
            var ench = enchantments[i];
            for (var es in ench.stats) {
                if (ench.stats.hasOwnProperty(es)) {
                    item.stats[es] = (item.stats[es] || 0) + (ench.stats[es] | 0);
                }
            }
        }

        // Consume mana
        character.mana = Math.max(0, character.mana - manaCost);

        return {
            success: true,
            oldStats: oldStats,
            newStats: item.stats,
            rarityChanged: rarityChanged,
            newRarity: newRarity
        };
    }

    /**
     * Consume a consumable item (VE hide event)
     * Applies effect then marks item as consumed.
     * @param {Object} item - ItemState (will be mutated)
     * @param {Object} character - CharacterState (will be mutated)
     * @returns {Object} {success, error, effect}
     */
    function consumeItem(item, character) {
        if (!item) {
            return { success: false, error: 'invalid_item' };
        }

        if (item.consumed) {
            return { success: false, error: 'already_consumed' };
        }

        // Check if item is consumable
        var template = ItemSystem.getItemTemplate(item.type);
        if (!template) {
            return { success: false, error: 'unknown_item' };
        }

        if (template.category !== ItemSystem.CATEGORIES.SCROLL && item.type.indexOf('potion') === -1) {
            // Also allow items with consume effects
            if (!template.consumeEffect) {
                return { success: false, error: 'not_consumable' };
            }
        }

        // Apply effect based on item type
        var effect = _applyConsumableEffect(item.type, character);

        // Mark consumed
        item.consumed = true;

        return {
            success: true,
            effect: effect
        };
    }

    /**
     * Apply consumable effect to character
     * @param {string} itemType
     * @param {Object} character
     * @returns {Object} effect description
     */
    function _applyConsumableEffect(itemType, character) {
        switch (itemType) {
            case 'mana_potion':
                var manaRestored = 2000; // 20% of max
                character.mana = Math.min(cfg.ENERGY.MAX, (character.mana || 0) + manaRestored);
                return { type: 'mana_restore', amount: manaRestored };

            case 'health_scroll':
                var hpRestored = Math.floor((character.maxHp || 100) * 500 / 1000); // 50%
                character.hp = Math.min(character.maxHp || 100, (character.hp || 0) + hpRestored);
                return { type: 'hp_restore', amount: hpRestored };

            case 'fire_rune':
            case 'shadow_rune':
            case 'earth_rune':
            case 'wind_rune':
            case 'water_rune':
            case 'fortune_rune':
                // Runes are consumed via enchanting, not direct consumption
                return { type: 'rune', note: 'use_via_enchanting' };

            default:
                return { type: 'unknown', note: 'no_effect' };
        }
    }

    /**
     * Get all available enchantment types
     * @returns {Object}
     */
    function getAllEnchantTypes() {
        return ENCHANT_TYPES;
    }

    return {
        MAX_ENCHANTS: MAX_ENCHANTS,
        ENCHANT_TYPES: ENCHANT_TYPES,
        getEnchantType: getEnchantType,
        getEnchantmentSlots: getEnchantmentSlots,
        enchantItem: enchantItem,
        reforgeItem: reforgeItem,
        consumeItem: consumeItem,
        getAllEnchantTypes: getAllEnchantTypes
    };
})();
