/**
 * Viz Magic — Crafting System
 * Recipe validation, quality determination, material consumption, item creation.
 * All math is integer-only (x1000 scale where needed).
 */
var CraftingSystem = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /**
     * Quality thresholds (roll value → rarity tier)
     * roll = hashInt(block_hash) % 1000 + crafter_intellect * 3 [+ 250 if Runescribe]
     */
    var QUALITY_THRESHOLDS = [
        { min: 970, rarity: cfg.RARITY.LEGENDARY },
        { min: 860, rarity: cfg.RARITY.EPIC },
        { min: 660, rarity: cfg.RARITY.RARE },
        { min: 380, rarity: cfg.RARITY.UNCOMMON }
    ];

    /** Runescribe class ID (gets +25% quality bonus = +250 to roll) */
    var RUNESCRIBE_CLASS = 'runescribe';
    var RUNESCRIBE_BONUS = 250;

    /**
     * Calculate quality (rarity) for a crafted item
     * @param {string} blockHash - block hash for deterministic RNG
     * @param {string} account - crafter account name
     * @param {number} blockNum - block number
     * @param {number} intellectStat - crafter's INT stat
     * @param {string} className - crafter's class
     * @returns {Object} {roll, rarity, rarityName}
     */
    function calculateQuality(blockHash, account, blockNum, intellectStat, className) {
        // Deterministic hash → integer
        var hashSeed = _hashInt(blockHash, account, blockNum);
        var roll = hashSeed % 1000;

        // Add intellect bonus (integer only)
        roll = roll + (intellectStat | 0) * 3;

        // Runescribe class bonus: +25% quality (add 250 to roll)
        if (className === RUNESCRIBE_CLASS) {
            roll = roll + RUNESCRIBE_BONUS;
        }

        // Determine rarity from roll
        var rarity = cfg.RARITY.COMMON;
        for (var i = 0; i < QUALITY_THRESHOLDS.length; i++) {
            if (roll >= QUALITY_THRESHOLDS[i].min) {
                rarity = QUALITY_THRESHOLDS[i].rarity;
                break;
            }
        }

        var rarityNames = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        return {
            roll: roll,
            rarity: rarity,
            rarityName: rarityNames[rarity] || 'common'
        };
    }

    /**
     * Deterministic hash integer from block hash + account + block number
     * @param {string} blockHash
     * @param {string} account
     * @param {number} blockNum
     * @returns {number} positive integer
     */
    function _hashInt(blockHash, account, blockNum) {
        // Combine block hash with account name and block number for uniqueness
        var combined = (blockHash || '') + ':' + (account || '') + ':' + (blockNum | 0);
        var hash = 0;
        for (var i = 0; i < combined.length; i++) {
            var ch = combined.charCodeAt(i);
            hash = ((hash << 5) - hash + ch) | 0;
        }
        // Ensure positive
        return Math.abs(hash);
    }

    /**
     * Validate a recipe against crafter's state
     * @param {string} recipeId - recipe identifier
     * @param {Object} character - CharacterState
     * @param {Array} inventory - array of ItemState
     * @param {string} location - current zone/locus
     * @returns {Object} {valid, error, recipe, matchedMaterials}
     */
    function validateRecipe(recipeId, character, inventory, location) {
        var recipe = GameRecipes.getRecipe(recipeId);
        if (!recipe) {
            return { valid: false, error: 'recipe_not_found' };
        }

        // Check level requirement
        if (character.level < (recipe.levelReq || 0)) {
            return { valid: false, error: 'level_too_low', recipe: recipe };
        }

        // Check class requirement (if any)
        if (recipe.classReq && recipe.classReq !== character.className) {
            return { valid: false, error: 'wrong_class', recipe: recipe };
        }

        // Check location requirement (if any)
        if (recipe.locationReq && recipe.locationReq !== location) {
            return { valid: false, error: 'wrong_location', recipe: recipe };
        }

        // Check mana cost
        var manaCost = recipe.manaCost || 0;
        if (manaCost > 0 && (character.mana || 0) < manaCost) {
            return { valid: false, error: 'not_enough_mana', recipe: recipe };
        }

        // Check materials — find matching items in inventory
        var matchedMaterials = [];
        var usedItemIds = {};

        for (var m = 0; m < recipe.materials.length; m++) {
            var req = recipe.materials[m];
            var found = 0;
            var matches = [];

            for (var j = 0; j < inventory.length; j++) {
                var item = inventory[j];
                // Skip already-used items, consumed, or equipped items
                if (usedItemIds[item.id]) continue;
                if (item.consumed) continue;
                if (item.equipped) continue;

                if (item.type === req.type) {
                    matches.push(item);
                    usedItemIds[item.id] = true;
                    found++;
                    if (found >= req.quantity) break;
                }
            }

            if (found < req.quantity) {
                return {
                    valid: false,
                    error: 'missing_materials',
                    recipe: recipe,
                    missing: { type: req.type, need: req.quantity, have: found }
                };
            }

            matchedMaterials = matchedMaterials.concat(matches);
        }

        return {
            valid: true,
            recipe: recipe,
            matchedMaterials: matchedMaterials
        };
    }

    /**
     * Execute a craft action
     * @param {string} recipeId - recipe identifier
     * @param {Object} character - CharacterState (will be mutated)
     * @param {Array} inventory - inventory array (will be mutated)
     * @param {string} location - current zone
     * @param {string} blockHash - block hash for quality roll
     * @param {number} blockNum - block number
     * @param {string} account - crafter account
     * @returns {Object} {success, item, quality, error, consumedIds}
     */
    function craft(recipeId, character, inventory, location, blockHash, blockNum, account) {
        // Validate recipe
        var validation = validateRecipe(recipeId, character, inventory, location);
        if (!validation.valid) {
            return { success: false, error: validation.error, missing: validation.missing };
        }

        var recipe = validation.recipe;
        var materials = validation.matchedMaterials;

        // Calculate quality
        var equipBonuses = ItemSystem.getEquipmentBonuses(character);
        var totalInt = (character.stats ? character.stats.int || 0 : 0) + (equipBonuses.int || 0);
        var quality = calculateQuality(blockHash, account, blockNum, totalInt, character.className);

        // Consume materials (mark as consumed)
        var consumedIds = [];
        for (var i = 0; i < materials.length; i++) {
            materials[i].consumed = true;
            consumedIds.push(materials[i].id);
        }

        // Consume mana
        var manaCost = recipe.manaCost || 0;
        if (manaCost > 0 && character.mana !== undefined) {
            character.mana = Math.max(0, character.mana - manaCost);
        }

        // Create the item
        var outputTemplate = recipe.outputTemplate || recipe.resultType || recipe.id;
        var createdItem = ItemSystem.createItem(
            outputTemplate,
            account,
            quality.rarity,
            blockNum,
            account,  // createdBy
            false     // crafted items are non-volatile
        );

        // Add to inventory
        inventory.push(createdItem);

        return {
            success: true,
            item: createdItem,
            quality: quality,
            consumedIds: consumedIds
        };
    }

    /**
     * Get available recipes for a character (filtered by class, level, materials)
     * @param {Object} character - CharacterState
     * @param {Array} inventory - inventory array
     * @param {string} location - current zone
     * @returns {Array} [{recipe, canCraft, missingMaterials}]
     */
    function getAvailableRecipes(character, inventory, location) {
        var allRecipes = GameRecipes.getAll();
        var result = [];

        for (var id in allRecipes) {
            if (!allRecipes.hasOwnProperty(id)) continue;
            var recipe = allRecipes[id];

            // Check class requirement
            if (recipe.classReq && recipe.classReq !== character.className) {
                continue; // Skip recipes not for this class
            }

            // Check level requirement — show recipes up to 5 levels above
            if ((recipe.levelReq || 0) > character.level + 5) {
                continue;
            }

            var validation = validateRecipe(id, character, inventory, location);
            result.push({
                recipe: recipe,
                canCraft: validation.valid,
                error: validation.error,
                missing: validation.missing
            });
        }

        // Sort: craftable first, then by level requirement
        result.sort(function(a, b) {
            if (a.canCraft && !b.canCraft) return -1;
            if (!a.canCraft && b.canCraft) return 1;
            return (a.recipe.levelReq || 0) - (b.recipe.levelReq || 0);
        });

        return result;
    }

    /**
     * Count materials of a given type in inventory
     * @param {Array} inventory
     * @param {string} materialType
     * @returns {number}
     */
    function countMaterial(inventory, materialType) {
        var count = 0;
        for (var i = 0; i < inventory.length; i++) {
            if (inventory[i].type === materialType && !inventory[i].consumed && !inventory[i].equipped) {
                count++;
            }
        }
        return count;
    }

    return {
        calculateQuality: calculateQuality,
        validateRecipe: validateRecipe,
        craft: craft,
        getAvailableRecipes: getAvailableRecipes,
        countMaterial: countMaterial
    };
})();
