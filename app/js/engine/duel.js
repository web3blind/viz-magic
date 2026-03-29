/**
 * Viz Magic — PvP Duel Resolution Engine
 * Deterministic duel combat using commit-reveal and block hash entropy.
 * All math is integer-only (no floating point).
 */
var DuelSystem = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /**
     * Intent interaction matrix (percentage multipliers).
     * Rows = attacker intent, Cols = defender intent.
     * Values: favorable=130, neutral=100, unfavorable=70
     */
    var INTENT_MATRIX = {
        strike: { strike: 100, guard: 70,  weave: 100, mend: 130 },
        guard:  { strike: 130, guard: 100, weave: 70,  mend: 100 },
        weave:  { strike: 100, guard: 130, weave: 100, mend: 70  },
        mend:   { strike: 70,  guard: 100, weave: 130, mend: 100 }
    };

    /**
     * Element dominance wheel: Ignis > Ventus > Terra > Aqua > Umbra > Ignis
     * Multipliers (percentage): dominant=150, dominated=70, neutral=100
     */
    var ELEMENT_DOMINANT = 150;
    var ELEMENT_DOMINATED = 70;
    var ELEMENT_NEUTRAL = 100;

    /**
     * Get element modifier between two schools (as percentage 70-150)
     * @param {string} attackerSchool
     * @param {string} defenderSchool
     * @returns {number} percentage multiplier
     */
    function _elementModifier(attackerSchool, defenderSchool) {
        if (!attackerSchool || !defenderSchool) return ELEMENT_NEUTRAL;
        if (attackerSchool === defenderSchool) return ELEMENT_NEUTRAL;
        if (cfg.DOMINANCE[attackerSchool] === defenderSchool) return ELEMENT_DOMINANT;
        if (cfg.DOMINANCE[defenderSchool] === attackerSchool) return ELEMENT_DOMINATED;
        return ELEMENT_NEUTRAL;
    }

    /**
     * Extract a deterministic integer from block hash at a given offset.
     * @param {string} blockHash - hex string
     * @param {number} offset - byte offset into hash
     * @param {number} range - modulo range
     * @returns {number}
     */
    function _hashInt(blockHash, offset, range) {
        if (!blockHash || blockHash.length < offset + 8) return 0;
        var hexSlice = blockHash.substring(offset * 2, offset * 2 + 8);
        var val = parseInt(hexSlice, 16);
        if (isNaN(val)) return 0;
        return val % range;
    }

    /**
     * Calculate Fate Entropy modifier from block hash (±10% = 90-110 as percentage).
     * @param {string} blockHash
     * @param {number} offset - different offset for each use
     * @returns {number} 90-110
     */
    function _fateEntropy(blockHash, offset) {
        var roll = _hashInt(blockHash, offset, 21); // 0-20
        return 90 + roll; // 90-110
    }

    /**
     * Calculate damage for one side of a duel round.
     * All integer math.
     *
     * @param {Object} attacker - {potency, level, school, intent, energyPledge}
     * @param {Object} defender - {resilience, level, school, intent}
     * @param {string} blockHash - for entropy
     * @param {number} hashOffset - byte offset into hash for this calculation
     * @returns {number} damage dealt (integer, minimum 1)
     */
    function calculateDamage(attacker, defender, blockHash, hashOffset) {
        // Base damage from potency
        var baseDmg = attacker.potency || 10;

        // Intent interaction multiplier (percentage)
        var intentMod = 100;
        if (INTENT_MATRIX[attacker.intent] && INTENT_MATRIX[attacker.intent][defender.intent]) {
            intentMod = INTENT_MATRIX[attacker.intent][defender.intent];
        }

        // Element modifier (percentage)
        var elemMod = _elementModifier(attacker.school, defender.school);

        // Energy pledge scaling: higher pledge = more damage
        // energyPledge is 0-10000 basis points; scale to 50-150%
        var energyMod = 50 + Math.floor((attacker.energyPledge || 100) * 100 / 10000);
        if (energyMod > 150) energyMod = 150;

        // Fate Entropy (±10%)
        var fateMod = _fateEntropy(blockHash, hashOffset);

        // Defense reduction from resilience (percentage absorbed, capped at 50%)
        var defReduction = Math.min(50, Math.floor((defender.resilience || 5) * 2));
        var defMod = 100 - defReduction; // 50-100

        // Combine: baseDmg * intentMod * elemMod * energyMod * fateMod * defMod
        // All are percentages, so divide by 100 for each
        var damage = baseDmg;
        damage = Math.floor(damage * intentMod / 100);
        damage = Math.floor(damage * elemMod / 100);
        damage = Math.floor(damage * energyMod / 100);
        damage = Math.floor(damage * fateMod / 100);
        damage = Math.floor(damage * defMod / 100);

        // Minimum damage is 1
        return Math.max(1, damage);
    }

    /**
     * Resolve a single duel round.
     *
     * @param {Object} playerA - {account, potency, resilience, level, school, strategy: {intent, spell, energy, salt}}
     * @param {Object} playerB - same structure
     * @param {string} blockHash - block hash for entropy
     * @returns {Object} {winner, damageA, damageB, intentA, intentB, details}
     */
    function resolveRound(playerA, playerB, blockHash) {
        var stratA = playerA.strategy;
        var stratB = playerB.strategy;

        // Calculate damage from A to B
        var dmgAtoB = calculateDamage(
            {
                potency: playerA.potency || 10,
                level: playerA.level || 1,
                school: playerA.school || '',
                intent: stratA.intent,
                energyPledge: stratA.energy || 100
            },
            {
                resilience: playerB.resilience || 5,
                level: playerB.level || 1,
                school: playerB.school || '',
                intent: stratB.intent
            },
            blockHash, 0
        );

        // Calculate damage from B to A
        var dmgBtoA = calculateDamage(
            {
                potency: playerB.potency || 10,
                level: playerB.level || 1,
                school: playerB.school || '',
                intent: stratB.intent,
                energyPledge: stratB.energy || 100
            },
            {
                resilience: playerA.resilience || 5,
                level: playerA.level || 1,
                school: playerA.school || '',
                intent: stratA.intent
            },
            blockHash, 4
        );

        // Determine round winner: whoever deals more damage wins the round
        var winner = null;
        if (dmgAtoB > dmgBtoA) {
            winner = playerA.account;
        } else if (dmgBtoA > dmgAtoB) {
            winner = playerB.account;
        }
        // null = draw

        return {
            winner: winner,
            damageA: dmgAtoB,  // damage dealt by A
            damageB: dmgBtoA,  // damage dealt by B
            intentA: stratA.intent,
            intentB: stratB.intent,
            schoolA: playerA.school,
            schoolB: playerB.school,
            draw: winner === null
        };
    }

    /**
     * Resolve a full best-of-3 duel from round results.
     *
     * @param {Array} rounds - array of resolveRound() results
     * @param {string} accountA
     * @param {string} accountB
     * @returns {Object} {winner, winsA, winsB, rounds, xpWinner, xpLoser}
     */
    function resolveDuel(rounds, accountA, accountB) {
        var winsA = 0;
        var winsB = 0;

        for (var i = 0; i < rounds.length; i++) {
            if (rounds[i].winner === accountA) winsA++;
            else if (rounds[i].winner === accountB) winsB++;
        }

        var winner = null;
        if (winsA >= 2) winner = accountA;
        else if (winsB >= 2) winner = accountB;

        // XP calculation: winner gets 100 + 20*loser_level, loser gets 25
        var winnerLevel = winner === accountA ? 1 : 1; // levels passed separately
        var xpWinner = winner ? 150 : 50;
        var xpLoser = winner ? 50 : 50;

        return {
            winner: winner,
            winsA: winsA,
            winsB: winsB,
            rounds: rounds,
            xpWinner: xpWinner,
            xpLoser: xpLoser,
            draw: winner === null
        };
    }

    /**
     * Verify a commit hash matches the revealed strategy.
     * Commit hash = sha256(canonical_json(strategy))
     *
     * @param {string} commitHash - hex string of the committed hash
     * @param {Object} strategy - {intent, spell, energy, salt}
     * @returns {Promise<boolean>}
     */
    async function verifyCommit(commitHash, strategy) {
        var canonical = _canonicalJson(strategy);
        var hash = await _sha256(canonical);
        return hash === commitHash;
    }

    /**
     * Generate a commit hash for a strategy.
     *
     * @param {Object} strategy - {intent, spell, energy, salt}
     * @returns {Promise<string>} hex hash
     */
    async function generateCommitHash(strategy) {
        var canonical = _canonicalJson(strategy);
        return await _sha256(canonical);
    }

    /**
     * Generate a random salt for commit-reveal.
     * @returns {string} 32-char hex string
     */
    function generateSalt() {
        var arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        var hex = '';
        for (var i = 0; i < arr.length; i++) {
            hex += arr[i].toString(16).padStart(2, '0');
        }
        return hex;
    }

    /**
     * Canonical JSON: sorted keys, no extra whitespace.
     * @param {Object} obj
     * @returns {string}
     */
    function _canonicalJson(obj) {
        if (obj === null || typeof obj !== 'object') {
            return JSON.stringify(obj);
        }
        if (Array.isArray(obj)) {
            var arrParts = [];
            for (var i = 0; i < obj.length; i++) {
                arrParts.push(_canonicalJson(obj[i]));
            }
            return '[' + arrParts.join(',') + ']';
        }
        var keys = Object.keys(obj).sort();
        var parts = [];
        for (var k = 0; k < keys.length; k++) {
            parts.push(JSON.stringify(keys[k]) + ':' + _canonicalJson(obj[keys[k]]));
        }
        return '{' + parts.join(',') + '}';
    }

    /**
     * SHA-256 hash using Web Crypto API.
     * @param {string} message
     * @returns {Promise<string>} hex digest
     */
    async function _sha256(message) {
        var encoded = new TextEncoder().encode(message);
        var hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
        var hashArray = new Uint8Array(hashBuffer);
        var hex = '';
        for (var i = 0; i < hashArray.length; i++) {
            hex += hashArray[i].toString(16).padStart(2, '0');
        }
        return hex;
    }

    /**
     * Get intent interaction result label.
     * @param {string} intentA
     * @param {string} intentB
     * @returns {string} 'favorable', 'neutral', or 'unfavorable' (from A's perspective)
     */
    function getIntentResult(intentA, intentB) {
        if (!INTENT_MATRIX[intentA]) return 'neutral';
        var mod = INTENT_MATRIX[intentA][intentB];
        if (mod === 130) return 'favorable';
        if (mod === 70) return 'unfavorable';
        return 'neutral';
    }

    return {
        resolveRound: resolveRound,
        resolveDuel: resolveDuel,
        verifyCommit: verifyCommit,
        generateCommitHash: generateCommitHash,
        generateSalt: generateSalt,
        calculateDamage: calculateDamage,
        getIntentResult: getIntentResult,
        INTENT_MATRIX: INTENT_MATRIX
    };
})();
