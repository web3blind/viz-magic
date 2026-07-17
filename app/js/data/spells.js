/**
 * Viz Magic — Spell Definitions
 * Spells organized by class with mana costs, multipliers, and effects.
 */
var GameSpells = (function() {
    'use strict';

    var SPELLS = {
        // === STONEWARDEN (Terra) ===
        stone_wall: {
            id: 'stone_wall',
            name: 'Stone Wall',
            school: 'terra',
            className: 'stonewarden',
            manaCost: 100,       // 1% energy
            levelReq: 1,
            multiplier: 800,     // x1000: 0.8x damage, but defensive
            intent: 'guard',
            effect: 'damage',
            description: 'A defensive strike backed by stone magic.'
        },
        stone_fist: {
            id: 'stone_fist',
            name: 'Stone Fist',
            school: 'terra',
            className: 'stonewarden',
            manaCost: 100,       // 100 energy out of 10000 = 1%
            levelReq: 1,
            multiplier: 1000,    // 1.0x + 10% RES bonus
            intent: 'strike',
            effect: 'damage',
            description: 'Smash with a fist of living stone.'
        },
        aegis_of_stone: {
            id: 'aegis_of_stone',
            name: 'Aegis of Stone',
            school: 'terra',
            className: 'stonewarden',
            manaCost: 5000,      // 50% energy
            levelReq: 25,
            multiplier: 500,     // 0.5x damage, but massive defense
            intent: 'guard',
            effect: 'buff',
            description: 'Encase yourself in unbreakable stone. Reflects damage.'
        },

        // === EMBERCASTER (Ignis) ===
        firebolt: {
            id: 'firebolt',
            name: 'Firebolt',
            school: 'ignis',
            className: 'embercaster',
            manaCost: 100,
            levelReq: 1,
            multiplier: 1200,    // 1.2x
            intent: 'strike',
            effect: 'damage',
            description: 'A focused bolt of magical fire.'
        },
        pyroclasm: {
            id: 'pyroclasm',
            name: 'Pyroclasm',
            school: 'ignis',
            className: 'embercaster',
            manaCost: 3000,
            levelReq: 10,
            multiplier: 2500,    // 2.5x
            intent: 'strike',
            effect: 'damage',
            description: 'Unleash a devastating eruption of fire.'
        },
        inferno: {
            id: 'inferno',
            name: 'Inferno',
            school: 'ignis',
            className: 'embercaster',
            manaCost: 5000,
            levelReq: 25,
            multiplier: 4000,    // 4.0x ultimate
            intent: 'strike',
            effect: 'damage',
            description: 'The ultimate fire spell. Consumes everything.'
        },

        // === MOONRUNNER (Umbra) ===
        shadow_step: {
            id: 'shadow_step',
            name: 'Shadow Step',
            school: 'umbra',
            className: 'moonrunner',
            manaCost: 100,
            levelReq: 1,
            multiplier: 1000,    // 1.0x + 20% crit
            intent: 'weave',
            effect: 'damage',
            description: 'Strike from the shadows. High critical chance.'
        },
        shadow_bolt: {
            id: 'shadow_bolt',
            name: 'Shadow Bolt',
            school: 'umbra',
            className: 'moonrunner',
            manaCost: 900,
            levelReq: 1,
            multiplier: 1000,
            intent: 'strike',
            effect: 'damage',
            description: 'A bolt of concentrated shadow energy.'
        },
        veil_step: {
            id: 'veil_step',
            name: 'Veil Step',
            school: 'umbra',
            className: 'moonrunner',
            manaCost: 4000,
            levelReq: 25,
            multiplier: 3000,    // 3.0x guaranteed crit
            intent: 'weave',
            effect: 'damage',
            description: 'Vanish completely and strike with absolute precision.'
        },

        // === BLOOMSAGE (Aqua) ===
        binding_vine: {
            id: 'binding_vine',
            name: 'Binding Vine',
            school: 'aqua',
            className: 'bloomsage',
            manaCost: 100,
            levelReq: 1,
            multiplier: 800,     // 0.8x damage, but debuffs
            intent: 'weave',
            effect: 'damage',
            description: 'Ensnare with magical vines. Slows the target.'
        },
        healing_tide: {
            id: 'healing_tide',
            name: 'Healing Tide',
            school: 'aqua',
            className: 'bloomsage',
            manaCost: 1500,
            levelReq: 1,
            multiplier: 2000,    // 2.0x INT-based healing
            intent: 'mend',
            effect: 'heal',
            description: 'Call upon water magic to heal wounds.'
        },
        grand_covenant: {
            id: 'grand_covenant',
            name: 'Grand Covenant',
            school: 'aqua',
            className: 'bloomsage',
            manaCost: 5000,
            levelReq: 25,
            multiplier: 3500,    // 3.5x heal + shield
            intent: 'mend',
            effect: 'heal',
            description: 'The ultimate healing spell. Full restoration and shield.'
        }
    };

    /**
     * Get a spell by ID
     * @param {string} id
     * @returns {Object|null}
     */
    function getSpell(id) {
        return SPELLS[id] || null;
    }

    /**
     * Get all spells for a class
     * @param {string} className
     * @returns {Array}
     */
    function getSpellsForClass(className) {
        var result = [];
        for (var id in SPELLS) {
            if (SPELLS[id].className === className || SPELLS[id].className === 'any') {
                result.push(SPELLS[id]);
            }
        }
        return result;
    }

    /**
     * Get spells available at a given level for a class
     * @param {string} className
     * @param {number} level
     * @returns {Array}
     */
    function getAvailableSpells(className, level) {
        return getSpellsForClass(className).filter(function(spell) {
            return spell.levelReq <= level;
        });
    }

    return {
        SPELLS: SPELLS,
        getSpell: getSpell,
        getSpellsForClass: getSpellsForClass,
        getAvailableSpells: getAvailableSpells
    };
})();
