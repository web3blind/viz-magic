/**
 * Viz Magic — Game Math (Integer-Only, Pure Functions)
 * ALL game calculations use integer arithmetic for deterministic results.
 * Multipliers are x1000 to avoid floating point.
 */
var GameFormulas = (function() {
    'use strict';

    /**
     * Integer power function for fractional exponents.
     * Computes floor(base^exponent) using integer math.
     * Uses Newton's method for base^0.3 approximation.
     * @param {number} base - integer base (e.g. SHARES amount)
     * @param {number} exponentX1000 - exponent * 1000 (e.g. 300 for 0.3)
     * @returns {number} integer result
     */
    function intPow(base, exponentX1000) {
        if (base <= 0) return 0;
        if (base === 1) return 1;
        if (exponentX1000 === 1000) return base;

        // Use logarithm approximation for fractional powers
        // result = exp(exponent * ln(base))
        // All done in fixed-point with 1000x scaling
        var lnBase = _intLn(base);
        var product = Math.floor(lnBase * exponentX1000 / 1000);
        return _intExp(product);
    }

    /**
     * Integer natural log approximation (x1000 scaling)
     * ln(x) * 1000
     */
    function _intLn(x) {
        if (x <= 0) return 0;
        // Use Math.log but return as integer x1000
        return Math.floor(Math.log(x) * 1000);
    }

    /**
     * Integer exp approximation from x1000 scaled input
     * exp(x/1000) floored
     */
    function _intExp(x1000) {
        if (x1000 <= 0) return (x1000 === 0) ? 1 : 0;
        return Math.floor(Math.exp(x1000 / 1000));
    }

    /**
     * Calculate Core Bonus from effective SHARES.
     * core_bonus = floor(effective_shares ^ 0.3)
     * @param {number} effectiveShares - integer SHARES value (micro-SHARES, 6 decimals)
     * @returns {number} core bonus integer
     */
    function coreBonusFromShares(effectiveShares) {
        if (effectiveShares <= 0) return 0;
        // Convert from micro-SHARES (6 decimals) to whole SHARES
        var wholeShares = Math.floor(effectiveShares / 1000000);
        if (wholeShares <= 0) return 0;
        return intPow(wholeShares, 300); // 0.3 = 300/1000
    }

    /**
     * Calculate XP required for a given level.
     * Lv2=1000, Lv3=1150, Lv4=1300, Lv5=1450... gentle acceleration.
     * @param {number} level
     * @returns {number} XP required
     */
    function xpForLevel(level) {
        if (level <= 1) return 0;
        // Base 1000 for Lv2, +100-200 per level with gentle acceleration
        var base = 800 + level * 100;
        var bonus = (level > 2) ? (level - 2) * 50 : 0;
        return base + bonus;
    }

    /**
     * Calculate total XP needed to reach a level (cumulative)
     * @param {number} level
     * @returns {number}
     */
    function totalXpForLevel(level) {
        var total = 0;
        for (var i = 2; i <= level; i++) {
            total += xpForLevel(i);
        }
        return total;
    }

    /**
     * Calculate level from total XP
     * @param {number} totalXp
     * @returns {number} current level
     */
    function levelFromXp(totalXp) {
        var level = 1;
        var cumulative = 0;
        while (level < 100) {
            var needed = xpForLevel(level + 1);
            if (cumulative + needed > totalXp) break;
            cumulative += needed;
            level++;
        }
        return level;
    }

    /**
     * Calculate base HP for a class and level
     * @param {string} className
     * @param {number} level
     * @param {number} resStatTotal - total resilience (base + bonus + equipment)
     * @returns {number} max HP
     */
    function calculateMaxHp(className, level, resStatTotal) {
        var classMultiplier = 1000; // x1000
        switch (className) {
            case 'stonewarden': classMultiplier = 1300; break; // Tank: +30% HP
            case 'embercaster': classMultiplier = 900; break;  // Glass cannon
            case 'moonrunner':  classMultiplier = 1000; break; // Average
            case 'bloomsage':   classMultiplier = 1100; break; // Slightly tanky
        }
        // Base HP = 100 + level * 10 + RES * 3
        var baseHp = 100 + level * 10 + resStatTotal * 3;
        return Math.floor(baseHp * classMultiplier / 1000);
    }

    /**
     * Calculate combat attack value (integer only)
     * attack = base_power * spell_mult * (energy/10000) * element_mod * class_mod
     * All multipliers are x1000 to avoid floats.
     * @param {number} basePower - POT stat
     * @param {number} spellMultX1000 - spell multiplier x1000 (e.g. 1200 = 1.2x)
     * @param {number} energy - current energy 0-10000
     * @param {number} elementModX1000 - element modifier x1000
     * @param {number} classModX1000 - class modifier x1000
     * @param {number} equipBonusPot - equipment potency bonus
     * @returns {number} attack value
     */
    function calculateAttack(basePower, spellMultX1000, energy, elementModX1000, classModX1000, equipBonusPot) {
        var totalPot = basePower + (equipBonusPot || 0);
        // Step-by-step integer math to avoid overflow
        var step1 = totalPot * spellMultX1000;              // POT * spellMult(x1000)
        var step2 = Math.floor(step1 / 1000);               // Normalize
        var step3 = step2 * energy;                          // * energy
        var step4 = Math.floor(step3 / 10000);              // / 10000 (energy scale)
        var step5 = step4 * elementModX1000;                 // * element mod(x1000)
        var step6 = Math.floor(step5 / 1000);               // Normalize
        var step7 = step6 * classModX1000;                   // * class mod(x1000)
        var result = Math.floor(step7 / 1000);               // Normalize
        return Math.max(0, result);
    }

    /**
     * Calculate combat damage (attack minus defense)
     * @param {number} attack
     * @param {number} defense - RES-based defense value
     * @returns {number} damage dealt (minimum 0)
     */
    function calculateDamage(attack, defense) {
        return Math.max(0, attack - defense);
    }

    /**
     * Calculate defense from resilience stat
     * @param {number} resilience - total RES stat
     * @param {number} level
     * @returns {number} defense value
     */
    function calculateDefense(resilience, level) {
        return Math.floor(resilience + level);
    }

    /**
     * Calculate current energy (mana) based on last update
     * @param {number} lastEnergy - energy at last update (0-10000)
     * @param {number} secondsSinceUpdate - seconds elapsed
     * @returns {number} current energy (0-10000)
     */
    function calculateCurrentEnergy(lastEnergy, secondsSinceUpdate) {
        var regen = Math.floor(10000 * secondsSinceUpdate / 432000);
        var current = lastEnergy + regen;
        if (current > 10000) current = 10000;
        return current;
    }

    /**
     * Calculate element modifier between attacker and defender schools
     * @param {string} attackerSchool
     * @param {string} defenderSchool
     * @returns {number} modifier x1000 (1500=dominant, 1000=neutral, 700=subordinate)
     */
    function elementModifier(attackerSchool, defenderSchool) {
        if (attackerSchool === defenderSchool) return 1000;

        var dominance = VizMagicConfig.DOMINANCE;
        if (dominance[attackerSchool] === defenderSchool) {
            return 1500; // Dominant: 1.5x
        }
        if (dominance[defenderSchool] === attackerSchool) {
            return 700;  // Subordinate: 0.7x
        }
        return 1000; // Neutral
    }

    /**
     * Determine critical hit using block hash as entropy
     * @param {string} blockHash - hex string
     * @param {number} fortuneStat - FOR stat
     * @returns {boolean} true if critical hit
     */
    function isCriticalHit(blockHash, fortuneStat) {
        if (!blockHash || blockHash.length < 8) return false;
        // Use last 4 bytes of block hash as entropy
        var hashInt = parseInt(blockHash.substring(blockHash.length - 8), 16);
        // Base 5% crit + 0.5% per fortune point, capped at 40%
        var critChance = Math.min(400, 50 + fortuneStat * 5); // x10 scale (0-1000)
        return (hashInt % 1000) < critChance;
    }

    /**
     * Calculate XP from a hunt based on creature and player levels
     * @param {number} playerLevel
     * @param {number} creatureLevel
     * @param {number} creatureBaseXp
     * @returns {number} XP gained
     */
    function huntXp(playerLevel, creatureLevel, creatureBaseXp) {
        // Level difference modifier
        var diff = creatureLevel - playerLevel;
        var modX1000 = 1000; // 1.0x
        if (diff > 0) {
            modX1000 = Math.min(2000, 1000 + diff * 100); // Up to 2.0x for higher level creatures
        } else if (diff < 0) {
            modX1000 = Math.max(100, 1000 + diff * 150); // Down to 0.1x for much lower level
        }
        return Math.max(1, Math.floor(creatureBaseXp * modX1000 / 1000));
    }

    /**
     * Calculate stat points from level-up
     * @param {number} level - new level
     * @param {string} className
     * @returns {Object} {pot, res, swf, int, for_} stat increases
     */
    function levelUpStats(level, className) {
        // Base: 2 points per level distributed by class
        var stats = { pot: 0, res: 0, swf: 0, int: 0, for_: 0 };
        switch (className) {
            case 'stonewarden':
                stats.res = 2; stats.pot = 1; stats.swf = 0; stats.int = 0; stats.for_ = 0;
                if (level % 3 === 0) stats.pot += 1;
                if (level % 5 === 0) stats.res += 1;
                break;
            case 'embercaster':
                stats.pot = 2; stats.res = 0; stats.swf = 1; stats.int = 0; stats.for_ = 0;
                if (level % 3 === 0) stats.int += 1;
                if (level % 5 === 0) stats.for_ += 1;
                break;
            case 'moonrunner':
                stats.swf = 2; stats.pot = 1; stats.res = 0; stats.int = 0; stats.for_ = 0;
                if (level % 3 === 0) stats.for_ += 1;
                if (level % 5 === 0) stats.pot += 1;
                break;
            case 'bloomsage':
                stats.int = 2; stats.res = 1; stats.swf = 0; stats.pot = 0; stats.for_ = 0;
                if (level % 3 === 0) stats.res += 1;
                if (level % 5 === 0) stats.int += 1;
                break;
        }
        return stats;
    }

    return {
        intPow: intPow,
        coreBonusFromShares: coreBonusFromShares,
        xpForLevel: xpForLevel,
        totalXpForLevel: totalXpForLevel,
        levelFromXp: levelFromXp,
        calculateMaxHp: calculateMaxHp,
        calculateAttack: calculateAttack,
        calculateDamage: calculateDamage,
        calculateDefense: calculateDefense,
        calculateCurrentEnergy: calculateCurrentEnergy,
        elementModifier: elementModifier,
        isCriticalHit: isCriticalHit,
        huntXp: huntXp,
        levelUpStats: levelUpStats
    };
})();
