/**
 * Viz Magic — Duel Protocol Actions
 * VM protocol action builders and broadcasters for PvP duels.
 * All actions use format: {p:"VM", v:1, t:actionType, b:prevBlock, d:data}
 */
var DuelProtocol = (function() {
    'use strict';

    var cfg = VizMagicConfig;
    var AT = cfg.ACTION_TYPES;

    /**
     * Create and broadcast a duel challenge.
     * @param {string} target - opponent account name
     * @param {string} mode - 'best_of_3' (default)
     * @param {number} rounds - number of rounds (3)
     * @param {number} energyPledge - mana pledge in basis points (0-10000)
     * @param {string} strategyHash - sha256 hash of first round strategy
     * @param {number} deadlineBlock - block number deadline for acceptance
     * @param {Function} callback - (err, result)
     */
    function createChallenge(target, mode, rounds, energyPledge, strategyHash, deadlineBlock, callback) {
        var data = {
            target: target,
            mode: mode || 'best_of_3',
            rounds: rounds || 3,
            energy_pledge: energyPledge || 100,
            strategy_hash: strategyHash,
            deadline_block: deadlineBlock || 0
        };

        VizBroadcast.gameAction({
            t: AT.CHALLENGE,
            d: data
        }, function(err, result) {
            if (err) {
                console.log('Challenge broadcast error:', err);
            }
            callback(err, result);
        });
    }

    /**
     * Accept a duel challenge.
     * @param {string} challengeRef - block number of the challenge action
     * @param {string} strategyHash - sha256 hash of first round strategy
     * @param {number} energyPledge - mana pledge in basis points
     * @param {Function} callback - (err, result)
     */
    function acceptChallenge(challengeRef, strategyHash, energyPledge, callback) {
        var data = {
            challenge_ref: challengeRef,
            strategy_hash: strategyHash,
            energy_pledge: energyPledge || 100
        };

        VizBroadcast.gameAction({
            t: AT.ACCEPT,
            d: data
        }, function(err, result) {
            if (err) {
                console.log('Accept broadcast error:', err);
            }
            callback(err, result);
        });
    }

    /**
     * Commit a strategy for a specific round (multi-round duels).
     * @param {string} combatRef - block number identifying the active duel
     * @param {number} round - round number (1, 2, or 3)
     * @param {string} strategyHash - sha256 hash of strategy
     * @param {Function} callback - (err, result)
     */
    function commitStrategy(combatRef, round, strategyHash, callback) {
        var data = {
            combat_ref: combatRef,
            round: round,
            strategy_hash: strategyHash
        };

        VizBroadcast.gameAction({
            t: AT.COMMIT,
            d: data
        }, function(err, result) {
            if (err) {
                console.log('Commit broadcast error:', err);
            }
            callback(err, result);
        });
    }

    /**
     * Reveal a strategy for a specific round.
     * @param {string} combatRef - block number identifying the active duel
     * @param {number} round - round number
     * @param {Object} strategy - {intent, spell, energy, salt}
     * @param {string} key - AES encryption key (hex)
     * @param {string} iv - AES initialization vector (hex, from encrypted data prefix)
     * @param {Function} callback - (err, result)
     */
    function revealStrategy(combatRef, round, strategy, key, iv, callback) {
        var data = {
            combat_ref: combatRef,
            round: round,
            strategy: {
                intent: strategy.intent,
                spell: strategy.spell || '',
                energy: strategy.energy || 100,
                salt: strategy.salt
            },
            key: key || '',
            iv: iv || ''
        };

        VizBroadcast.gameAction({
            t: AT.REVEAL,
            d: data
        }, function(err, result) {
            if (err) {
                console.log('Reveal broadcast error:', err);
            }
            callback(err, result);
        });
    }

    /**
     * Forfeit a duel.
     * @param {string} combatRef - block number of the active duel
     * @param {string} reason - reason for forfeit
     * @param {Function} callback - (err, result)
     */
    function forfeitDuel(combatRef, reason, callback) {
        var data = {
            combat_ref: combatRef,
            reason: reason || 'voluntary'
        };

        VizBroadcast.gameAction({
            t: AT.FORFEIT,
            d: data
        }, function(err, result) {
            if (err) {
                console.log('Forfeit broadcast error:', err);
            }
            callback(err, result);
        });
    }

    /**
     * Build challenge data object without broadcasting (for previewing/testing).
     * @param {string} target
     * @param {string} strategyHash
     * @param {number} energyPledge
     * @returns {Object}
     */
    function buildChallengeData(target, strategyHash, energyPledge) {
        return {
            t: AT.CHALLENGE,
            d: {
                target: target,
                mode: 'best_of_3',
                rounds: 3,
                energy_pledge: energyPledge || 100,
                strategy_hash: strategyHash,
                deadline_block: 0
            }
        };
    }

    return {
        createChallenge: createChallenge,
        acceptChallenge: acceptChallenge,
        commitStrategy: commitStrategy,
        revealStrategy: revealStrategy,
        forfeitDuel: forfeitDuel,
        buildChallengeData: buildChallengeData
    };
})();
