/**
 * Viz Magic — World Regions / Zones
 */
var GameRegions = (function() {
    'use strict';

    var REGIONS = {
        commons_first_light: {
            id: 'commons_first_light',
            name: 'The Commons of First Light',
            type: 'safe',
            school: null,
            schoolBonus: 0,
            pvpEnabled: false,
            minLevel: 1,
            maxLevel: 10,
            description: 'A peaceful meadow where new mages awaken. Training grounds and taverns.'
        },
        ember_wastes: {
            id: 'ember_wastes',
            name: 'The Ember Wastes',
            type: 'elemental',
            school: 'ignis',
            schoolBonus: 200,  // +20% x1000
            pvpEnabled: false,
            minLevel: 5,
            maxLevel: 20,
            description: 'Volcanic wastelands wreathed in flame. Ignis magic is amplified here.'
        },
        deep_currents: {
            id: 'deep_currents',
            name: 'The Deep Currents',
            type: 'elemental',
            school: 'aqua',
            schoolBonus: 200,
            pvpEnabled: false,
            minLevel: 5,
            maxLevel: 20,
            description: 'Coral caves beneath the waves. Aqua magic flows strongest here.'
        },
        iron_root: {
            id: 'iron_root',
            name: 'The Iron Root',
            type: 'elemental',
            school: 'terra',
            schoolBonus: 200,
            pvpEnabled: false,
            minLevel: 10,
            maxLevel: 25,
            description: 'Ancient mines deep in the earth. Terra magic resonates in every stone.'
        },
        shattered_sky: {
            id: 'shattered_sky',
            name: 'The Shattered Sky',
            type: 'elemental',
            school: 'ventus',
            schoolBonus: 200,
            pvpEnabled: false,
            minLevel: 12,
            maxLevel: 25,
            description: 'Floating islands above the clouds. Ventus magic dances freely.'
        },
        the_veil: {
            id: 'the_veil',
            name: 'The Veil',
            type: 'elemental',
            school: 'umbra',
            schoolBonus: 200,
            pvpEnabled: false,
            minLevel: 18,
            maxLevel: 30,
            description: 'A shifting labyrinth of shadows. Umbra magic is absolute here.'
        },
        forklands: {
            id: 'forklands',
            name: 'The Forklands',
            type: 'contested',
            school: null,
            schoolBonus: 0,
            pvpEnabled: true,
            minLevel: 15,
            maxLevel: 50,
            description: 'Dangerous territory. Open PvP. Rich resource nodes.'
        },
        covenant_bazaar: {
            id: 'covenant_bazaar',
            name: 'The Covenant Bazaar',
            type: 'market',
            school: null,
            schoolBonus: 0,
            pvpEnabled: false,
            minLevel: 3,
            maxLevel: 50,
            description: 'A neutral trading hub. Escrow-protected exchanges.'
        },
        duel_spires: {
            id: 'duel_spires',
            name: 'The Duel Spires',
            type: 'arena',
            school: null,
            schoolBonus: 0,
            pvpEnabled: true,
            minLevel: 5,
            maxLevel: 50,
            description: 'Ranked duels and tournaments. Glory awaits the skilled.'
        }
    };

    function getRegion(id) {
        return REGIONS[id] || null;
    }

    function getAll() {
        return REGIONS;
    }

    function getSafeRegions() {
        var result = [];
        for (var id in REGIONS) {
            if (!REGIONS[id].pvpEnabled) result.push(REGIONS[id]);
        }
        return result;
    }

    return {
        REGIONS: REGIONS,
        getRegion: getRegion,
        getAll: getAll,
        getSafeRegions: getSafeRegions
    };
})();
