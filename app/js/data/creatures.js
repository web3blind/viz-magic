/**
 * Viz Magic — Creature Definitions
 * 3 starter creature types for PvE encounters.
 */
var GameCreatures = (function() {
    'use strict';

    var CREATURES = {
        ember_wisp: {
            id: 'ember_wisp',
            name: 'Ember Wisp',
            school: 'ignis',
            minLevel: 1,
            maxLevel: 5,
            baseHp: 30,
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
            minLevel: 3,
            maxLevel: 8,
            baseHp: 50,
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
            minLevel: 5,
            maxLevel: 10,
            baseHp: 70,
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
