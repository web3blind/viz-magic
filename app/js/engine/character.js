/**
 * Viz Magic — Character System
 * 4 classes, base stats, level-up logic.
 */
var CharacterSystem = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /**
     * Class definitions with base stats and school affinity
     */
    var CLASS_DEFS = {
        stonewarden: {
            id: 'stonewarden',
            school: 'terra',
            role: 'tank',
            baseStats: { pot: 8,  res: 14, swf: 5,  int: 6,  for_: 7 },
            baseHp: 150,
            passive: {
                id: 'soul_fortress',
                damageReductionX1000: 200  // -20% incoming (x1000 = 200/1000)
            },
            startSpell: 'stone_wall'
        },
        embercaster: {
            id: 'embercaster',
            school: 'ignis',
            role: 'dps',
            baseStats: { pot: 14, res: 6,  swf: 8,  int: 7,  for_: 5 },
            baseHp: 100,
            passive: {
                id: 'overcharge',
                bonusDamagePerExtraMana: 12  // +12% per 500 MP over base
            },
            startSpell: 'firebolt'
        },
        moonrunner: {
            id: 'moonrunner',
            school: 'umbra',
            role: 'stealth',
            baseStats: { pot: 10, res: 7,  swf: 14, int: 5,  for_: 8 },
            baseHp: 110,
            passive: {
                id: 'hidden_hand',
                critBonusX1000: 150  // +15% crit (x1000)
            },
            startSpell: 'shadow_step'
        },
        bloomsage: {
            id: 'bloomsage',
            school: 'aqua',
            role: 'support',
            baseStats: { pot: 6,  res: 10, swf: 7,  int: 14, for_: 5 },
            baseHp: 120,
            passive: {
                id: 'inscription_mastery',
                craftQualityBonusX1000: 250  // +25% craft quality (x1000)
            },
            startSpell: 'binding_vine'
        }
    };

    /**
     * Get class definition
     * @param {string} className
     * @returns {Object|null}
     */
    function getClassDef(className) {
        return CLASS_DEFS[className] || null;
    }

    /**
     * Get all class definitions
     * @returns {Object}
     */
    function getAllClasses() {
        return CLASS_DEFS;
    }

    /**
     * Create a new character state
     * @param {string} account - VIZ account name
     * @param {string} displayName - chosen mage name
     * @param {string} className - class ID
     * @returns {Object} CharacterState
     */
    function createCharacter(account, displayName, className) {
        var classDef = getClassDef(className);
        if (!classDef) return null;

        var bs = classDef.baseStats;
        return {
            account: account,
            name: displayName,
            className: className,
            level: 1,
            xp: 0,
            hp: classDef.baseHp,
            maxHp: classDef.baseHp,
            pot: bs.pot,
            res: bs.res,
            swf: bs.swf,
            int: bs.int,
            for_: bs.for_,
            coreBonus: 0,
            title: '',
            guild: '',
            equipment: {},
            spells: [classDef.startSpell],
            lastHuntBlock: 0,
            fallenUntilBlock: 0,
            currentZone: 'commons_first_light'
        };
    }

    /**
     * Apply level-up to a character
     * @param {Object} character - CharacterState
     * @returns {Object} updated character (mutated)
     */
    function levelUp(character) {
        var newLevel = character.level + 1;
        var stats = GameFormulas.levelUpStats(newLevel, character.className);

        character.level = newLevel;
        character.pot += stats.pot;
        character.res += stats.res;
        character.swf += stats.swf;
        character.int += stats.int;
        character.for_ += stats.for_;

        // Recalculate max HP
        character.maxHp = GameFormulas.calculateMaxHp(
            character.className,
            character.level,
            character.res + character.coreBonus
        );

        // Full heal on level up
        character.hp = character.maxHp;

        return character;
    }

    /**
     * Check if character has enough XP to level up
     * @param {Object} character
     * @returns {boolean}
     */
    function canLevelUp(character) {
        var xpNeeded = GameFormulas.xpForLevel(character.level + 1);
        var totalNeeded = GameFormulas.totalXpForLevel(character.level + 1);
        return character.xp >= totalNeeded;
    }

    /**
     * Add XP to character, auto-level if threshold reached
     * @param {Object} character
     * @param {number} xpGain
     * @returns {Object} {character, leveled: boolean, newLevel: number}
     */
    function addXp(character, xpGain) {
        character.xp += xpGain;
        var leveled = false;
        var startLevel = character.level;

        while (canLevelUp(character) && character.level < cfg.LEVELING.SOFT_CAP + 10) {
            levelUp(character);
            leveled = true;
        }

        return {
            character: character,
            leveled: leveled,
            newLevel: character.level,
            levelsGained: character.level - startLevel
        };
    }

    /**
     * Update core bonus from current SHARES
     * @param {Object} character
     * @param {number} effectiveShares - in micro-SHARES (6 decimals integer)
     * @returns {Object} updated character
     */
    function updateCoreBonus(character, effectiveShares) {
        character.coreBonus = GameFormulas.coreBonusFromShares(effectiveShares);
        // Recalculate max HP with new core bonus
        character.maxHp = GameFormulas.calculateMaxHp(
            character.className,
            character.level,
            character.res + character.coreBonus
        );
        return character;
    }

    /**
     * Check if character is fallen (defeated, recovery period)
     * @param {Object} character
     * @param {number} currentBlock
     * @returns {boolean}
     */
    function isFallen(character, currentBlock) {
        return character.fallenUntilBlock > 0 && currentBlock < character.fallenUntilBlock;
    }

    /**
     * Get total stat value including core bonus and equipment
     * @param {Object} character
     * @param {string} statName - 'pot', 'res', 'swf', 'int', 'for_'
     * @returns {number}
     */
    function getTotalStat(character, statName) {
        var baseStat = character[statName] || 0;
        var coreBonus = Math.floor(character.coreBonus / 5); // Core bonus spread across stats
        var equipBonus = _getEquipmentStatBonus(character, statName);
        return baseStat + coreBonus + equipBonus;
    }

    /**
     * Get equipment stat bonus (placeholder — depends on items system)
     */
    function _getEquipmentStatBonus(character, statName) {
        // Will be integrated with items system
        return 0;
    }

    /**
     * Convert character to Grimoire metadata format (for on-chain storage)
     * @param {Object} character
     * @returns {Object} grimoire data
     */
    function toGrimoire(character) {
        return {
            v: cfg.APP_VERSION,
            name: character.name,
            class: character.className,
            level: character.level,
            title: character.title || '',
            guild: character.guild || '',
            home_locus: '',
            avatar: '',
            motto: ''
        };
    }

    return {
        CLASS_DEFS: CLASS_DEFS,
        getClassDef: getClassDef,
        getAllClasses: getAllClasses,
        createCharacter: createCharacter,
        levelUp: levelUp,
        canLevelUp: canLevelUp,
        addXp: addXp,
        updateCoreBonus: updateCoreBonus,
        isFallen: isFallen,
        getTotalStat: getTotalStat,
        toGrimoire: toGrimoire
    };
})();
