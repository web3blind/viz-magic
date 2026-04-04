/**
 * Viz Magic — Creature Definitions
 * 3 starter creature types for PvE encounters.
 *
 * Each creature has an `author` field — the VIZ account of the developer
 * who created this creature. When a player hunts this creature, the game
 * sends an award (mana spend) to the author's account as a reward for
 * their contribution. Add your own creatures and set `author` to your
 * VIZ account name to earn rewards.
 */
var GameCreatures = (function() {
    'use strict';

    var CREATURES = {
        ember_wisp: {
            id: 'ember_wisp',
            name: 'Ember Wisp',
            school: 'ignis',
            author: 'denis-skripnik',
            minLevel: 1,
            maxLevel: 5,
            baseHp: 12,
            basePot: 8,
            baseRes: 3,
            baseSwf: 6,
            baseXp: 25,
            zone: 'commons_first_light',
            lootTable: [
                { itemType: 'fire_dust',     name: 'Fire Dust',     dropRate: 400 },
                { itemType: 'health_scroll', name: 'Health Scroll', dropRate: 150 }
            ]
        },
        hollow_shade: {
            id: 'hollow_shade',
            name: 'Hollow Shade',
            school: 'umbra',
            author: 'denis-skripnik',
            minLevel: 3,
            maxLevel: 8,
            baseHp: 25,
            basePot: 12,
            baseRes: 6,
            baseSwf: 10,
            baseXp: 50,
            zone: 'commons_first_light',
            lootTable: [
                { itemType: 'shadow_shard',  name: 'Shadow Shard',  dropRate: 350 },
                { itemType: 'health_scroll', name: 'Health Scroll', dropRate: 200 },
                { itemType: 'lucky_charm',   name: 'Lucky Charm',   dropRate: 50 }
            ]
        },
        thornvine: {
            id: 'thornvine',
            name: 'Thornvine',
            school: 'terra',
            author: 'denis-skripnik',
            minLevel: 5,
            maxLevel: 10,
            baseHp: 40,
            basePot: 10,
            baseRes: 12,
            baseSwf: 4,
            baseXp: 75,
            zone: 'commons_first_light',
            lootTable: [
                { itemType: 'thorn_essence', name: 'Thorn Essence', dropRate: 300 },
                { itemType: 'cloth_robe',    name: 'Cloth Robe',    dropRate: 100 },
                { itemType: 'oak_wand',      name: 'Oak Wand',      dropRate: 80 }
            ]
        },
        echo_guardian: {
           id: 'echo_guardian',
           name: 'Echo Guardian',
           school: 'terra',
           author: 'inov8', 
           minLevel: 5,
           maxLevel: 12,
           baseHp: 60,
           basePot: 16,
           baseRes: 14,
           baseSwf: 8,
           baseXp: 95,
           zone: 'commons_first_light',
           lootTable: [
                { itemType: 'ancient_shard', name: 'Ancient Echo Shard', dropRate: 300 },
                { itemType: 'stone_tablet',  name: 'Weathered Stone Tablet', dropRate: 140 },
                { itemType: 'spirit_tunic',  name: 'Spirit Tunic', dropRate: 70 }
           ]
        },
        cyber_ghoul: {
          id: 'cyber_ghoul',
          name: 'Cyber Ghoul',
          school: 'umbra', 
          author: 'inov8', 
          minLevel: 7,
          maxLevel: 14,
          baseHp: 55,
          basePot: 18,
          baseRes: 10,
          baseSwf: 9,
          baseXp: 110,
          zone: 'commons_first_light',
          lootTable: [
                { itemType: 'data_core', name: 'Corrupted Data Core', dropRate: 320 },
                { itemType: 'nano_patch', name: 'Nano Patch', dropRate: 180 },
                { itemType: 'optic_cloak', name: 'Optic Cloak', dropRate: 60 }
           ]
        }        
    };

    /**
     * Get a creature definition by ID
     * @param {string} id
     * @returns {Object|null}
     */
    function getCreature(id) {
        return CREATURES[id] || null;
    }

    /**
     * Get all creatures for a zone
     * @param {string} zone
     * @returns {Array}
     */
    function getCreaturesForZone(zone) {
        var result = [];
        for (var id in CREATURES) {
            if (CREATURES[id].zone === zone) {
                result.push(CREATURES[id]);
            }
        }
        return result;
    }

    /**
     * Get all creature definitions
     * @returns {Object}
     */
    function getAll() {
        return CREATURES;
    }

    return {
        CREATURES: CREATURES,
        getCreature: getCreature,
        getCreaturesForZone: getCreaturesForZone,
        getAll: getAll
    };
})();
