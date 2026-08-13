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
        },
        starfall_vault: {
            id: 'starfall_vault',
            name: 'The Starfall Vault',
            type: 'elemental',
            school: 'ventus',
            schoolBonus: 300,
            pvpEnabled: false,
            minLevel: 51,
            maxLevel: 60,
            description: 'A great crater where fallen stars sleep. Ventus magic hums in the meteor-light.'
        },
        emberheart: {
            id: 'emberheart',
            name: 'The Emberheart',
            type: 'elemental',
            school: 'ignis',
            schoolBonus: 300,
            pvpEnabled: false,
            minLevel: 61,
            maxLevel: 70,
            description: 'The molten heart of the world, alive with inner fire. Ignis magic blazes.'
        },
        prismatic_depths: {
            id: 'prismatic_depths',
            name: 'The Prismatic Depths',
            type: 'elemental',
            school: 'aqua',
            schoolBonus: 300,
            pvpEnabled: false,
            minLevel: 71,
            maxLevel: 80,
            description: 'Caverns of living colour where water sings. Aqua magic refracts.'
        },
        timeless_maze: {
            id: 'timeless_maze',
            name: 'The Timeless Maze',
            type: 'elemental',
            school: 'umbra',
            schoolBonus: 300,
            pvpEnabled: false,
            minLevel: 81,
            maxLevel: 90,
            description: 'A labyrinth where hours loop and shadows recall. Umbra magic bends time.'
        },
        grandmaster_peak: {
            id: 'grandmaster_peak',
            name: 'The Grandmaster Peak',
            type: 'contested',
            school: 'terra',
            schoolBonus: 200,
            pvpEnabled: true,
            minLevel: 91,
            maxLevel: 100,
            description: 'The highest summit, open to all who seek glory. Terra magic is everywhere.'
        },
        void_sanctum: {
            id: 'void_sanctum',
            name: 'The Void Sanctum',
            type: 'safe',
            school: null,
            schoolBonus: 0,
            pvpEnabled: false,
            minLevel: 101,
            maxLevel: 101,
            description: 'A hidden refuge beyond the ranks, for the Mage Beyond Categories.'
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
