/**
 * Viz Magic — VM Protocol Parser/Writer
 * Parse and write VM (Viz Magic) protocol JSON objects,
 * action type enumeration, backward chain traversal.
 */
var VMProtocol = (function() {
    'use strict';

    var cfg = VizMagicConfig;
    var AT = cfg.ACTION_TYPES;

    /**
     * VM protocol message format:
     * {
     *   p: "VM",           // protocol ID
     *   v: 1,              // protocol version
     *   b: 12340000,       // previous block reference (chain link)
     *   t: "hunt",         // action type
     *   d: { ... }         // action-specific data
     * }
     */

    /**
     * Create a VM protocol object
     * @param {string} actionType - one of ACTION_TYPES
     * @param {Object} data - action-specific data
     * @param {number} previousBlock - previous block reference
     * @returns {Object} protocol object ready for JSON.stringify
     */
    function createAction(actionType, data, previousBlock) {
        return {
            p: cfg.PROTOCOLS.VM,
            v: cfg.APP_VERSION,
            b: previousBlock || 0,
            t: actionType,
            d: data || {}
        };
    }

    /**
     * Parse a VM protocol object from JSON string or object
     * @param {string|Object} input
     * @returns {Object|null} parsed action or null if invalid
     */
    function parseAction(input) {
        var obj;
        if (typeof input === 'string') {
            try {
                obj = JSON.parse(input);
            } catch(e) {
                return null;
            }
        } else {
            obj = input;
        }

        // Validate it's a VM protocol message
        if (!obj || obj.p !== cfg.PROTOCOLS.VM) {
            return null;
        }

        return {
            protocol: obj.p,
            version: obj.v || 1,
            previousBlock: obj.b || 0,
            type: obj.t || '',
            data: obj.d || {}
        };
    }

    /**
     * Check if a custom operation is a VM protocol message
     * @param {Object} op - operation from block
     * @returns {boolean}
     */
    function isVMOperation(op) {
        if (!op || !op[1]) return false;
        var opData = op[1];
        return opData.id === cfg.PROTOCOLS.VM;
    }

    /**
     * Check if a custom operation is a Voice (V) protocol message
     * @param {Object} op
     * @returns {boolean}
     */
    function isVoiceOperation(op) {
        if (!op || !op[1]) return false;
        var opData = op[1];
        return opData.id === cfg.PROTOCOLS.V;
    }

    /**
     * Check if a custom operation is a VE (events) protocol message
     * @param {Object} op
     * @returns {boolean}
     */
    function isVEOperation(op) {
        if (!op || !op[1]) return false;
        var opData = op[1];
        return opData.id === cfg.PROTOCOLS.VE;
    }

    /**
     * Extract the sender account from a custom operation
     * @param {Object} op
     * @returns {string} account name
     */
    function getSender(op) {
        if (!op || !op[1]) return '';
        var opData = op[1];
        if (opData.required_regular_auths && opData.required_regular_auths.length > 0) {
            return opData.required_regular_auths[0];
        }
        if (opData.required_active_auths && opData.required_active_auths.length > 0) {
            return opData.required_active_auths[0];
        }
        return '';
    }

    // --- Hunt action helpers ---

    /**
     * Create a hunt action
     * @param {string} creatureId
     * @param {string} zone
     * @param {string} spellId
     * @returns {Object} action data (without chain link — added by broadcast)
     */
    function createHuntAction(creatureId, zone, spellId) {
        return {
            t: AT.HUNT,
            d: {
                creature: creatureId,
                zone: zone,
                spell: spellId
            }
        };
    }

    /**
     * Create a character attunement action (class selection / initial setup)
     * @param {string} className
     * @param {string} displayName
     * @returns {Object}
     */
    function createCharAttuneAction(className, displayName) {
        return {
            t: AT.CHAR_ATTUNE,
            d: {
                class: className,
                name: displayName
            }
        };
    }

    /**
     * Create an item equip action
     * @param {string} itemId - block number where item was created
     * @param {string} slot - equipment slot
     * @returns {Object}
     */
    function createEquipAction(itemId, slot) {
        return {
            t: AT.ITEM_EQUIP,
            d: {
                item: itemId,
                slot: slot
            }
        };
    }

    /**
     * Create a rest action (restore HP/recover from fallen)
     * @returns {Object}
     */
    function createRestAction() {
        return {
            t: AT.REST,
            d: {}
        };
    }

    /**
     * Create a craft action
     * @param {string} recipeId
     * @param {Array} materialIds - array of item block numbers
     * @param {string} location - locus ID
     * @returns {Object}
     */
    function createCraftAction(recipeId, materialIds, location) {
        return {
            t: AT.CRAFT,
            d: {
                recipe: recipeId,
                materials: materialIds,
                location: location || ''
            }
        };
    }

    // --- Guild / Territory action helpers ---

    /**
     * Create a guild create action
     * @param {string} guildId
     * @param {string} name
     * @param {string} tag
     * @param {string} school
     * @param {string} motto
     * @param {Object} charter
     * @returns {Object}
     */
    function createGuildCreateAction(guildId, name, tag, school, motto, charter) {
        return {
            t: AT.GUILD_CREATE,
            d: { id: guildId, name: name, tag: tag, school: school || '', motto: motto || '', charter: charter || {} }
        };
    }

    /**
     * Create a guild promote action
     * @param {string} guildId
     * @param {string} target
     * @param {string} rank
     * @returns {Object}
     */
    function createGuildPromoteAction(guildId, target, rank) {
        return {
            t: AT.GUILD_PROMOTE,
            d: { guild_id: guildId, target: target, rank: rank }
        };
    }

    /**
     * Create a siege declare action
     * @param {string} territoryId
     * @param {string} guildId
     * @returns {Object}
     */
    function createSiegeDeclareAction(territoryId, guildId) {
        return {
            t: AT.SIEGE_DECLARE,
            d: { territory_id: territoryId, guild_id: guildId }
        };
    }

    /**
     * Create a siege commit action
     * @param {string} siegeRef
     * @param {number} energy
     * @returns {Object}
     */
    function createSiegeCommitAction(siegeRef, energy) {
        return {
            t: AT.SIEGE_COMMIT,
            d: { siege_ref: siegeRef, energy: energy | 0 }
        };
    }

    // --- Backward Chain Traversal ---

    /**
     * Traverse the backward chain for an account's VM actions.
     * Starts from the latest action and follows `b` (previous block) references.
     * @param {string} account
     * @param {number} maxDepth - max number of actions to retrieve
     * @param {Function} callback - (err, actions[]) where each action has block info
     */
    function traverseChain(account, maxDepth, callback) {
        maxDepth = maxDepth || 50;
        var actions = [];

        // Get the latest block reference for this account+protocol
        VizAccount.getAccountProtocol(account, cfg.PROTOCOLS.VM, function(err, response) {
            if (err || !response || !response.custom_sequence_block_num) {
                callback(null, actions);
                return;
            }

            var nextBlock = response.custom_sequence_block_num;
            _fetchAction(nextBlock, actions, maxDepth, callback);
        });
    }

    /**
     * Recursively fetch actions by following block references
     */
    function _fetchAction(blockNum, actions, remaining, callback) {
        if (!blockNum || blockNum <= 0 || remaining <= 0) {
            callback(null, actions);
            return;
        }

        viz.api.getBlock(blockNum, function(err, block) {
            if (err || !block) {
                callback(null, actions);
                return;
            }

            var found = false;
            var previousBlock = 0;

            // Look for VM custom operations in this block
            if (block.transactions) {
                for (var i = 0; i < block.transactions.length; i++) {
                    var tx = block.transactions[i];
                    if (tx.operations) {
                        for (var j = 0; j < tx.operations.length; j++) {
                            var op = tx.operations[j];
                            if (op[0] === 'custom' && op[1].id === cfg.PROTOCOLS.VM) {
                                var parsed = parseAction(op[1].json);
                                if (parsed) {
                                    actions.push({
                                        blockNum: blockNum,
                                        blockTime: block.timestamp,
                                        blockId: block.block_id,
                                        sender: getSender(op),
                                        action: parsed
                                    });
                                    previousBlock = parsed.previousBlock;
                                    found = true;
                                }
                            }
                        }
                    }
                }
            }

            if (found && previousBlock > 0) {
                _fetchAction(previousBlock, actions, remaining - 1, callback);
            } else {
                callback(null, actions);
            }
        });
    }

    // --- Market action helpers ---

    /**
     * Create a market list action
     * @param {string} itemRef - item reference
     * @param {number} price - price in VIZ
     * @param {number} expiresBlock - expiration block
     * @returns {Object}
     */
    function createMarketListAction(itemRef, price, expiresBlock) {
        return {
            t: AT.MARKET_LIST,
            d: {
                item_ref: itemRef,
                price: price | 0,
                expires_block: expiresBlock | 0
            }
        };
    }

    /**
     * Create a market cancel action
     * @param {string} listingRef
     * @returns {Object}
     */
    function createMarketCancelAction(listingRef) {
        return {
            t: AT.MARKET_CANCEL,
            d: { listing_ref: listingRef }
        };
    }

    /**
     * Create a market buy action
     * @param {string} listingRef
     * @returns {Object}
     */
    function createMarketBuyAction(listingRef) {
        return {
            t: AT.MARKET_BUY,
            d: { listing_ref: listingRef }
        };
    }

    /**
     * Create an item transfer action
     * @param {string} itemRef - item reference
     * @param {string} to - recipient account
     * @param {string} reason - reason for transfer
     * @returns {Object}
     */
    function createItemTransferAction(itemRef, to, reason) {
        return {
            t: AT.ITEM_TRANSFER,
            d: {
                item_ref: itemRef,
                to: to,
                reason: reason || 'transfer'
            }
        };
    }

    /**
     * Create an enchant action
     * @param {string} itemRef - item to enchant
     * @param {string} enchantId - enchantment type
     * @param {string} runeRef - rune item reference
     * @returns {Object}
     */
    function createEnchantAction(itemRef, enchantId, runeRef) {
        return {
            t: AT.ENCHANT,
            d: {
                item_ref: itemRef,
                enchant: enchantId,
                rune_ref: runeRef
            }
        };
    }

    // --- Phase 5: Quest, Boss, Loci action helpers ---

    /**
     * Create a quest accept action
     * @param {string} questId
     * @returns {Object}
     */
    function createQuestAcceptAction(questId) {
        return {
            t: 'quest.accept',
            d: { quest_id: questId }
        };
    }

    /**
     * Create a quest complete action
     * @param {string} questId
     * @returns {Object}
     */
    function createQuestCompleteAction(questId) {
        return {
            t: 'quest.complete',
            d: { quest_id: questId }
        };
    }

    /**
     * Create a boss attack action
     * @param {string} spellId
     * @returns {Object}
     */
    function createBossAttackAction(spellId) {
        return {
            t: 'boss.attack',
            d: { spell: spellId || '' }
        };
    }

    /**
     * Create a locus creation action
     * @param {string} voiceRef - block of the Voice post
     * @param {string} name - locus name
     * @param {string} locusType
     * @param {string} regionId
     * @returns {Object}
     */
    function createLocCreateAction(voiceRef, name, locusType, regionId) {
        return {
            t: AT.LOC_CREATE,
            d: {
                voice_ref: voiceRef,
                name: name,
                type: locusType || 'camp',
                region: regionId || ''
            }
        };
    }

    return {
        createAction: createAction,
        parseAction: parseAction,
        isVMOperation: isVMOperation,
        isVoiceOperation: isVoiceOperation,
        isVEOperation: isVEOperation,
        getSender: getSender,
        createHuntAction: createHuntAction,
        createCharAttuneAction: createCharAttuneAction,
        createEquipAction: createEquipAction,
        createRestAction: createRestAction,
        createCraftAction: createCraftAction,
        createMarketListAction: createMarketListAction,
        createMarketCancelAction: createMarketCancelAction,
        createMarketBuyAction: createMarketBuyAction,
        createItemTransferAction: createItemTransferAction,
        createEnchantAction: createEnchantAction,
        createGuildCreateAction: createGuildCreateAction,
        createGuildPromoteAction: createGuildPromoteAction,
        createSiegeDeclareAction: createSiegeDeclareAction,
        createSiegeCommitAction: createSiegeCommitAction,
        createQuestAcceptAction: createQuestAcceptAction,
        createQuestCompleteAction: createQuestCompleteAction,
        createBossAttackAction: createBossAttackAction,
        createLocCreateAction: createLocCreateAction,
        traverseChain: traverseChain
    };
})();
