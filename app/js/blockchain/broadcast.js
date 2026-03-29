/**
 * Viz Magic — Transaction Broadcasting Wrappers
 * Wraps VIZ broadcast operations for game use.
 */
var VizBroadcast = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /**
     * Send an award (Blessing / Spellcasting)
     * @param {string} receiver - target account
     * @param {number} energy - 0-10000 (mana to spend)
     * @param {number} customSequence - protocol sequence (0 = ignored)
     * @param {string} memo - memo text
     * @param {Array} beneficiaries - [{account, weight}]
     * @param {Function} callback - (err, result)
     */
    function award(receiver, energy, customSequence, memo, beneficiaries, callback) {
        var wif = VizAccount.getRegularKey();
        var initiator = VizAccount.getCurrentUser();
        if (!wif || !initiator) {
            callback(new Error('not_logged_in'));
            return;
        }

        beneficiaries = beneficiaries || [];
        customSequence = customSequence || 0;
        memo = memo || '';

        viz.broadcast.award(
            wif, initiator, receiver, energy, customSequence, memo, beneficiaries,
            function(err, result) {
                if (err) {
                    console.log('Award broadcast error:', err);
                }
                callback(err, result);
            }
        );
    }

    /**
     * Send a custom operation (game action via VM protocol)
     * @param {string} protocolId - 'VM', 'VE', or 'V'
     * @param {Object} jsonData - data to serialize
     * @param {Function} callback - (err, result)
     */
    function custom(protocolId, jsonData, callback) {
        var wif = VizAccount.getRegularKey();
        var user = VizAccount.getCurrentUser();
        if (!wif || !user) {
            callback(new Error('not_logged_in'));
            return;
        }

        var jsonStr = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);

        viz.broadcast.custom(
            wif,
            [],         // required_active_auths (empty — using regular)
            [user],     // required_regular_auths
            protocolId,
            jsonStr,
            function(err, result) {
                if (err) {
                    console.log('Custom broadcast error:', err);
                }
                callback(err, result);
            }
        );
    }

    /**
     * Send a game action (custom operation with VM protocol and chain link)
     * Automatically fetches the previous block reference for chain linking.
     * @param {Object} actionData - {t: actionType, d: data}
     * @param {Function} callback - (err, result)
     */
    function gameAction(actionData, callback) {
        var user = VizAccount.getCurrentUser();
        if (!user) {
            callback(new Error('not_logged_in'));
            return;
        }

        // Get previous block reference for this protocol
        VizAccount.getAccountProtocol(user, cfg.PROTOCOLS.VM, function(err, response) {
            var previous = 0;
            if (!err && response) {
                previous = response.custom_sequence_block_num || 0;
            }

            var object = {
                p: cfg.PROTOCOLS.VM,
                v: cfg.APP_VERSION,
                b: previous,
                t: actionData.t,
                d: actionData.d || {}
            };

            custom(cfg.PROTOCOLS.VM, object, callback);
        });
    }

    /**
     * Send a hunt action — combines custom op + award to NPC
     * @param {string} creatureId - creature identifier
     * @param {string} zone - zone identifier
     * @param {string} spellId - spell used
     * @param {number} manaCost - mana to spend (energy basis points)
     * @param {string} npcAccount - NPC creature account on chain
     * @param {Function} callback - (err, result)
     */
    function huntAction(creatureId, zone, spellId, manaCost, npcAccount, callback) {
        var actionData = {
            t: cfg.ACTION_TYPES.HUNT,
            d: {
                creature: creatureId,
                zone: zone,
                spell: spellId
            }
        };

        // First broadcast the game action
        gameAction(actionData, function(err, result) {
            if (err) {
                callback(err);
                return;
            }

            // Then send the award to NPC (the "spellcasting")
            if (npcAccount) {
                award(npcAccount, manaCost, 0, '', [], function(awardErr, awardResult) {
                    callback(awardErr, { action: result, award: awardResult });
                });
            } else {
                // Solo mode — no NPC account, just the action
                callback(null, { action: result });
            }
        });
    }

    /**
     * Update account metadata (Grimoire)
     * @param {string} jsonMetadata - JSON string
     * @param {Function} callback
     */
    function updateMetadata(jsonMetadata, callback) {
        var wif = VizAccount.getRegularKey();
        var user = VizAccount.getCurrentUser();
        if (!wif || !user) {
            callback(new Error('not_logged_in'));
            return;
        }

        viz.broadcast.accountMetadata(wif, user, jsonMetadata, callback);
    }

    /**
     * Send a Voice post (Realm Chronicle entry)
     * @param {string} text - post text
     * @param {Function} callback
     */
    function chroniclePost(text, callback) {
        var user = VizAccount.getCurrentUser();
        if (!user) {
            callback(new Error('not_logged_in'));
            return;
        }

        VizAccount.getAccountProtocol(user, cfg.PROTOCOLS.V, function(err, response) {
            var previous = 0;
            if (!err && response) {
                previous = response.custom_sequence_block_num || 0;
            }

            var object = {
                p: previous,
                d: { t: text }
            };

            custom(cfg.PROTOCOLS.V, object, callback);
        });
    }

    /**
     * Delegate SHARES to another account (Patronage / Guild membership)
     * REQUIRES ACTIVE key — not regular key!
     * @param {string} delegatee - target account to delegate to
     * @param {number} sharesAmount - amount in integer (will be formatted to 6 decimals)
     * @param {Function} callback - (err, result)
     */
    function delegateShares(delegatee, sharesAmount, callback) {
        var activeWif = VizAccount.getActiveKey ? VizAccount.getActiveKey() : null;
        var delegator = VizAccount.getCurrentUser();

        if (!activeWif || !delegator) {
            callback(new Error('active_key_required'));
            return;
        }

        var formattedShares = cfg.ASSETS.formatSHARES(sharesAmount);

        viz.broadcast.delegateVestingShares(
            activeWif, delegator, delegatee, formattedShares,
            function(err, result) {
                if (err) {
                    console.log('Delegate SHARES error:', err);
                }
                callback(err, result);
            }
        );
    }

    /**
     * Undelegate SHARES (set delegation to 0)
     * REQUIRES ACTIVE key!
     * @param {string} delegatee - account to undelegate from
     * @param {Function} callback
     */
    function undelegateShares(delegatee, callback) {
        delegateShares(delegatee, 0, callback);
    }

    return {
        award: award,
        custom: custom,
        gameAction: gameAction,
        huntAction: huntAction,
        updateMetadata: updateMetadata,
        chroniclePost: chroniclePost,
        delegateShares: delegateShares,
        undelegateShares: undelegateShares
    };
})();
