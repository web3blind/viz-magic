/**
 * Viz Magic — NPC Framework
 * Deterministic NPC behavior: pure function of (type, state, block_hash).
 * NPC accounts are VIZ accounts with staked SHARES.
 */
var NPCFramework = (function() {
    'use strict';

    /** NPC type definitions */
    var NPC_TYPES = {
        QUEST_GIVER: 'quest_giver',
        CREATURE:    'creature',
        MERCHANT:    'merchant',
        ARBITER:     'arbiter',
        HERALD:      'herald',
        SENTINEL:    'sentinel'
    };

    /** Known NPC accounts */
    var NPC_ACCOUNTS = {
        'vm-npc-aether-dragon': { type: 'creature', nameKey: 'npc_aether_dragon', icon: '\uD83D\uDC32', region: null },
        'vm-npc-elder-sage':    { type: 'quest_giver', nameKey: 'npc_elder_sage', icon: '\uD83E\uDDD9', region: 'commons_first_light' },
        'vm-npc-bazaar-keeper': { type: 'merchant', nameKey: 'npc_bazaar_keeper', icon: '\uD83D\uDC64', region: 'covenant_bazaar' },
        'vm-npc-arena-master':  { type: 'arbiter', nameKey: 'npc_arena_master', icon: '\u2694\uFE0F', region: 'duel_spires' },
        'vm-npc-herald':        { type: 'herald', nameKey: 'npc_herald', icon: '\uD83D\uDCEF', region: null },
        'vm-npc-gate-sentinel': { type: 'sentinel', nameKey: 'npc_gate_sentinel', icon: '\uD83D\uDEE1\uFE0F', region: 'forklands' }
    };

    /**
     * Get deterministic NPC behavior for current state.
     * Pure function — same inputs always produce same output.
     * @param {string} npcAccount
     * @param {Object} worldState - current on-chain state
     * @param {string} blockHash
     * @param {number} blockNum
     * @returns {Object} behavior descriptor
     */
    function getNPCBehavior(npcAccount, worldState, blockHash, blockNum) {
        var npcDef = NPC_ACCOUNTS[npcAccount];
        if (!npcDef) return null;

        var seed = _hashSeed(blockHash, npcAccount);

        switch (npcDef.type) {
            case 'quest_giver':
                return _questGiverBehavior(npcAccount, npcDef, worldState, seed, blockNum);
            case 'creature':
                return _creatureBehavior(npcAccount, npcDef, worldState, seed, blockNum);
            case 'merchant':
                return _merchantBehavior(npcAccount, npcDef, worldState, seed, blockNum);
            case 'arbiter':
                return _arbiterBehavior(npcAccount, npcDef, worldState, seed, blockNum);
            case 'herald':
                return _heraldBehavior(npcAccount, npcDef, worldState, seed, blockNum);
            case 'sentinel':
                return _sentinelBehavior(npcAccount, npcDef, worldState, seed, blockNum);
            default:
                return { type: 'idle', npc: npcAccount };
        }
    }

    /**
     * Process an NPC action (execute behavior result).
     * @param {string} npcAccount
     * @param {Object} behavior - from getNPCBehavior
     * @param {Object} worldState
     * @param {number} blockNum
     * @returns {Array} game events
     */
    function processNPCAction(npcAccount, behavior, worldState, blockNum) {
        if (!behavior) return [];
        var events = [];

        switch (behavior.action) {
            case 'offer_quest':
                events.push({
                    type: 'npc_quest_offer',
                    npc: npcAccount,
                    questId: behavior.questId,
                    blockNum: blockNum
                });
                break;
            case 'announce':
                events.push({
                    type: 'npc_announcement',
                    npc: npcAccount,
                    messageKey: behavior.messageKey,
                    blockNum: blockNum
                });
                break;
            case 'counterattack':
                events.push({
                    type: 'npc_counterattack',
                    npc: npcAccount,
                    damage: behavior.damage,
                    target: behavior.target,
                    blockNum: blockNum
                });
                break;
        }

        return events;
    }

    /**
     * Create quest offer from NPC.
     * @param {string} npcAccount
     * @param {Object} questTemplate
     * @param {number} blockNum
     * @returns {Object} quest offer
     */
    function createQuestOffer(npcAccount, questTemplate, blockNum) {
        return {
            npc: npcAccount,
            quest: questTemplate,
            offeredBlock: blockNum,
            expiresBlock: blockNum + 28800 // 1 day
        };
    }

    /**
     * Validate quest completion for an NPC-given quest.
     * @param {string} npcAccount
     * @param {Object} quest - player's active quest
     * @param {Object} worldState
     * @returns {Object} {valid, reason}
     */
    function validateQuestCompletion(npcAccount, quest, worldState) {
        if (!quest || !quest.completed) {
            return { valid: false, reason: 'not_complete' };
        }
        // All objectives must be met
        for (var i = 0; i < quest.objectives.length; i++) {
            if (!quest.objectives[i].completed) {
                return { valid: false, reason: 'objectives_incomplete' };
            }
        }
        return { valid: true };
    }

    /**
     * Get NPC info for display.
     * @param {string} npcAccount
     * @returns {Object|null}
     */
    function getNPCInfo(npcAccount) {
        var npcDef = NPC_ACCOUNTS[npcAccount];
        if (!npcDef) return null;
        return {
            account: npcAccount,
            type: npcDef.type,
            nameKey: npcDef.nameKey,
            icon: npcDef.icon,
            region: npcDef.region
        };
    }

    /**
     * Get all NPCs in a region.
     * @param {string} regionId
     * @returns {Array}
     */
    function getNPCsInRegion(regionId) {
        var result = [];
        for (var account in NPC_ACCOUNTS) {
            if (!NPC_ACCOUNTS.hasOwnProperty(account)) continue;
            var npc = NPC_ACCOUNTS[account];
            if (npc.region === regionId || npc.region === null) {
                result.push({
                    account: account,
                    type: npc.type,
                    nameKey: npc.nameKey,
                    icon: npc.icon
                });
            }
        }
        return result;
    }

    // --- Behavior implementations ---

    function _questGiverBehavior(account, def, worldState, seed, blockNum) {
        // Offer quests based on time of day (deterministic)
        var dayPhase = Math.floor(blockNum / 28800) % 3;
        var questPool = ['q_hunt_wisps', 'q_hunt_drakes', 'q_craft_weapon', 'q_visit_regions', 'q_blessings'];
        var questIndex = (seed + dayPhase) % questPool.length;
        return {
            type: 'quest_giver',
            action: 'offer_quest',
            questId: questPool[questIndex],
            greeting: (seed % 3 === 0) ? 'npc_greeting_wise' : (seed % 3 === 1) ? 'npc_greeting_urgent' : 'npc_greeting_calm'
        };
    }

    function _creatureBehavior(account, def, worldState, seed, blockNum) {
        return {
            type: 'creature',
            action: 'idle',
            aggressionLevel: (seed % 100) / 100
        };
    }

    function _merchantBehavior(account, def, worldState, seed, blockNum) {
        var discountSchool = ['ignis', 'aqua', 'terra', 'ventus', 'umbra'][seed % 5];
        return {
            type: 'merchant',
            action: 'trade',
            discountSchool: discountSchool,
            discountPercent: 10 + (seed % 15)
        };
    }

    function _arbiterBehavior(account, def, worldState, seed, blockNum) {
        return {
            type: 'arbiter',
            action: 'oversee',
            bonusXpPercent: (seed % 2 === 0) ? 10 : 0
        };
    }

    function _heraldBehavior(account, def, worldState, seed, blockNum) {
        // Announce active world events
        var activeEvents = [];
        if (typeof WorldEvents !== 'undefined') {
            activeEvents = WorldEvents.getActiveEvents(blockNum);
        }
        if (activeEvents.length > 0) {
            return {
                type: 'herald',
                action: 'announce',
                messageKey: 'herald_event_active',
                events: activeEvents
            };
        }
        return {
            type: 'herald',
            action: 'idle',
            messageKey: 'herald_all_quiet'
        };
    }

    function _sentinelBehavior(account, def, worldState, seed, blockNum) {
        return {
            type: 'sentinel',
            action: 'patrol',
            alertLevel: (seed % 3 === 0) ? 'high' : 'normal'
        };
    }

    function _hashSeed(hash, str) {
        var combined = (hash || '0000') + str;
        var h = 0;
        for (var i = 0; i < combined.length; i++) {
            h = ((h << 5) - h + combined.charCodeAt(i)) | 0;
        }
        return Math.abs(h);
    }

    return {
        NPC_TYPES: NPC_TYPES,
        NPC_ACCOUNTS: NPC_ACCOUNTS,
        getNPCBehavior: getNPCBehavior,
        processNPCAction: processNPCAction,
        createQuestOffer: createQuestOffer,
        validateQuestCompletion: validateQuestCompletion,
        getNPCInfo: getNPCInfo,
        getNPCsInRegion: getNPCsInRegion
    };
})();
