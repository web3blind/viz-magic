/**
 * Viz Magic — Crafting Recipes
 * Full recipe data: weapons, armor, consumables, enchant runes.
 * Each recipe: {id, nameKey, category, materials, manaCost, levelReq, classReq, outputTemplate, locationReq}
 */
var GameRecipes = (function() {
    'use strict';

    var RECIPES = {
        // =====================
        // WEAPONS (Focus) — one per element
        // =====================
        ember_staff: {
            id: 'ember_staff',
            nameKey: 'recipe_ember_staff',
            resultType: 'ember_staff',
            outputTemplate: 'ember_staff',
            category: 'focus',
            materials: [
                { type: 'fire_dust', quantity: 5 },
                { type: 'sparkdust', quantity: 3 }
            ],
            manaCost: 300,
            levelReq: 5,
            classReq: null,
            locationReq: null
        },
        thornwood_staff: {
            id: 'thornwood_staff',
            nameKey: 'recipe_thornwood_staff',
            resultType: 'thornwood_staff',
            outputTemplate: 'thornwood_staff',
            category: 'focus',
            materials: [
                { type: 'thorn_essence', quantity: 4 },
                { type: 'veilstone', quantity: 2 },
                { type: 'sparkdust', quantity: 2 }
            ],
            manaCost: 350,
            levelReq: 8,
            classReq: null,
            locationReq: null
        },
        shadow_blade: {
            id: 'shadow_blade',
            nameKey: 'recipe_shadow_blade',
            resultType: 'shadow_blade',
            outputTemplate: 'shadow_blade',
            category: 'focus',
            materials: [
                { type: 'shadow_shard', quantity: 5 },
                { type: 'echo_shards', quantity: 3 },
                { type: 'sparkdust', quantity: 2 }
            ],
            manaCost: 400,
            levelReq: 10,
            classReq: null,
            locationReq: null
        },

        // =====================
        // ARMOR (Ward) — one per slot: head, body, feet
        // =====================
        veilstone_helm: {
            id: 'veilstone_helm',
            nameKey: 'recipe_veilstone_helm',
            resultType: 'veilstone_helm',
            outputTemplate: 'veilstone_helm',
            category: 'ward',
            materials: [
                { type: 'veilstone', quantity: 4 },
                { type: 'aether_ore', quantity: 2 }
            ],
            manaCost: 250,
            levelReq: 6,
            classReq: null,
            locationReq: null
        },
        ironbark_vest: {
            id: 'ironbark_vest',
            nameKey: 'recipe_ironbark_vest',
            resultType: 'ironbark_vest',
            outputTemplate: 'ironbark_vest',
            category: 'ward',
            materials: [
                { type: 'thorn_essence', quantity: 3 },
                { type: 'veilstone', quantity: 3 },
                { type: 'aether_ore', quantity: 2 }
            ],
            manaCost: 350,
            levelReq: 8,
            classReq: null,
            locationReq: null
        },
        windwalker_boots: {
            id: 'windwalker_boots',
            nameKey: 'recipe_windwalker_boots',
            resultType: 'windwalker_boots',
            outputTemplate: 'windwalker_boots',
            category: 'ward',
            materials: [
                { type: 'sparkdust', quantity: 3 },
                { type: 'echo_shards', quantity: 2 },
                { type: 'thorn_essence', quantity: 2 }
            ],
            manaCost: 280,
            levelReq: 7,
            classReq: null,
            locationReq: null
        },

        // =====================
        // CONSUMABLES
        // =====================
        mana_potion: {
            id: 'mana_potion',
            nameKey: 'recipe_mana_potion',
            resultType: 'mana_potion',
            outputTemplate: 'mana_potion',
            category: 'scroll',
            materials: [
                { type: 'sparkdust', quantity: 2 },
                { type: 'chronicle_ink', quantity: 1 }
            ],
            manaCost: 100,
            levelReq: 3,
            classReq: null,
            locationReq: null
        },
        health_scroll: {
            id: 'health_scroll',
            nameKey: 'recipe_health_scroll',
            resultType: 'health_scroll',
            outputTemplate: 'health_scroll',
            category: 'scroll',
            materials: [
                { type: 'chronicle_ink', quantity: 2 },
                { type: 'thorn_essence', quantity: 1 }
            ],
            manaCost: 150,
            levelReq: 4,
            classReq: null,
            locationReq: null
        },

        // =====================
        // ENCHANT RUNES
        // =====================
        fire_rune: {
            id: 'fire_rune',
            nameKey: 'recipe_fire_rune',
            resultType: 'fire_rune',
            outputTemplate: 'fire_rune',
            category: 'glyph',
            materials: [
                { type: 'fire_dust', quantity: 4 },
                { type: 'sealwax', quantity: 2 },
                { type: 'chronicle_ink', quantity: 1 }
            ],
            manaCost: 400,
            levelReq: 10,
            classReq: null,
            locationReq: null
        },
        shadow_rune: {
            id: 'shadow_rune',
            nameKey: 'recipe_shadow_rune',
            resultType: 'shadow_rune',
            outputTemplate: 'shadow_rune',
            category: 'glyph',
            materials: [
                { type: 'shadow_shard', quantity: 4 },
                { type: 'sealwax', quantity: 2 },
                { type: 'echo_shards', quantity: 2 }
            ],
            manaCost: 400,
            levelReq: 10,
            classReq: null,
            locationReq: null
        },

        // =====================
        // BONUS RECIPES
        // =====================
        ash_wand: {
            id: 'ash_wand',
            nameKey: 'recipe_ash_wand',
            resultType: 'ash_wand',
            outputTemplate: 'ash_wand',
            category: 'focus',
            materials: [
                { type: 'fire_dust', quantity: 3 },
                { type: 'thorn_essence', quantity: 1 }
            ],
            manaCost: 200,
            levelReq: 3,
            classReq: null,
            locationReq: null
        },
        lucky_charm: {
            id: 'lucky_charm',
            nameKey: 'recipe_lucky_charm',
            resultType: 'lucky_charm',
            outputTemplate: 'lucky_charm',
            category: 'relic',
            materials: [
                { type: 'shadow_shard', quantity: 2 },
                { type: 'fire_dust', quantity: 1 }
            ],
            manaCost: 250,
            levelReq: 8,
            classReq: null,
            locationReq: null
        },
        armageddon_stone: {
            id: 'armageddon_stone',
            nameKey: 'recipe_armageddon_stone',
            resultType: 'armageddon_stone',
            outputTemplate: 'armageddon_stone',
            category: 'relic',
            materials: [
                { type: 'echo_shards',  quantity: 3 },
                { type: 'fire_dust',    quantity: 5 },
                { type: 'shadow_shard', quantity: 3 }
            ],
            manaCost: 500,
            levelReq: 10,
            classReq: null,
            locationReq: null
        }
    };

    /**
     * Item templates for crafted items (extends ItemSystem.ITEM_TEMPLATES)
     * These are registered on load via registerCraftedTemplates()
     */
    var CRAFTED_TEMPLATES = {
        ember_staff: {
            category: 'focus',
            slot: 'hands',
            baseStats: { pot: 8, int: 2 },
            element: 'ignis'
        },
        thornwood_staff: {
            category: 'focus',
            slot: 'hands',
            baseStats: { pot: 5, res: 3, int: 2 },
            element: 'terra'
        },
        shadow_blade: {
            category: 'focus',
            slot: 'hands',
            baseStats: { pot: 7, swf: 3, for_: 1 },
            element: 'umbra'
        },
        veilstone_helm: {
            category: 'ward',
            slot: 'head',
            baseStats: { res: 5, int: 2 }
        },
        ironbark_vest: {
            category: 'ward',
            slot: 'body',
            baseStats: { res: 7, pot: 1 }
        },
        windwalker_boots: {
            category: 'ward',
            slot: 'feet',
            baseStats: { swf: 5, for_: 1 }
        },
        mana_potion: {
            category: 'scroll',
            slot: null,
            baseStats: {},
            consumeEffect: 'mana_restore'
        },
        fire_rune: {
            category: 'glyph',
            slot: null,
            baseStats: {},
            enchantType: 'fire_rune'
        },
        shadow_rune: {
            category: 'glyph',
            slot: null,
            baseStats: {},
            enchantType: 'shadow_rune'
        },
        // Crafting materials
        sparkdust: {
            category: 'material',
            slot: null,
            baseStats: {}
        },
        chronicle_ink: {
            category: 'material',
            slot: null,
            baseStats: {}
        },
        veilstone: {
            category: 'material',
            slot: null,
            baseStats: {}
        },
        sealwax: {
            category: 'material',
            slot: null,
            baseStats: {}
        },
        echo_shards: {
            category: 'material',
            slot: null,
            baseStats: {}
        },
        aether_ore: {
            category: 'material',
            slot: null,
            baseStats: {}
        }
    };

    /**
     * Register crafted item templates with ItemSystem
     * Called after ItemSystem is loaded.
     */
    function registerCraftedTemplates() {
        if (typeof ItemSystem !== 'undefined' && ItemSystem.ITEM_TEMPLATES) {
            for (var key in CRAFTED_TEMPLATES) {
                if (CRAFTED_TEMPLATES.hasOwnProperty(key)) {
                    if (!ItemSystem.ITEM_TEMPLATES[key]) {
                        ItemSystem.ITEM_TEMPLATES[key] = CRAFTED_TEMPLATES[key];
                    }
                }
            }
        }
    }

    function getRecipe(id) {
        return RECIPES[id] || null;
    }

    function getAll() {
        return RECIPES;
    }

    /**
     * Get recipes by category
     * @param {string} category - focus, ward, scroll, glyph, relic
     * @returns {Array}
     */
    function getByCategory(category) {
        var result = [];
        for (var id in RECIPES) {
            if (RECIPES.hasOwnProperty(id) && RECIPES[id].category === category) {
                result.push(RECIPES[id]);
            }
        }
        return result;
    }

    return {
        RECIPES: RECIPES,
        CRAFTED_TEMPLATES: CRAFTED_TEMPLATES,
        registerCraftedTemplates: registerCraftedTemplates,
        getRecipe: getRecipe,
        getAll: getAll,
        getByCategory: getByCategory
    };
})();
