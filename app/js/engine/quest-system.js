/**
 * Viz Magic — Quest System
 * Quest acceptance, progress tracking, completion, daily prophecy.
 */
var QuestSystem = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /** Quest types */
    var QUEST_TYPES = {
        HUNT:      'hunt',
        CRAFT:     'craft',
        DUEL:      'duel',
        EXPLORE:   'explore',
        SOCIAL:    'social',
        TERRITORY: 'territory'
    };

    /** Daily prophecy refresh interval (blocks) */
    var PROPHECY_INTERVAL = 28800; // ~1 day

    /** Max active quests per player */
    var MAX_ACTIVE_QUESTS = 5;

    /**
     * Accept a quest for a player.
     * @param {Object} questData - quest template from GameQuests
     * @param {Object} character
     * @param {Object} playerQuests - player's quest state
     * @param {number} blockNum
     * @returns {Object} {success, error, quest}
     */
    function acceptQuest(questData, character, playerQuests, blockNum) {
        if (!questData || !character || !playerQuests) {
            return { success: false, error: 'invalid_params' };
        }

        // Check level requirements
        if (questData.minLevel && character.level < questData.minLevel) {
            return { success: false, error: 'level_too_low' };
        }
        if (questData.maxLevel && character.level > questData.maxLevel) {
            return { success: false, error: 'level_too_high' };
        }

        // Check quest limit
        if (playerQuests.active.length >= MAX_ACTIVE_QUESTS) {
            return { success: false, error: 'too_many_quests' };
        }

        // Check not already active
        for (var i = 0; i < playerQuests.active.length; i++) {
            if (playerQuests.active[i].id === questData.id) {
                return { success: false, error: 'already_active' };
            }
        }

        // Create active quest instance
        var activeQuest = {
            id: questData.id,
            titleKey: questData.titleKey,
            descriptionKey: questData.descriptionKey,
            type: questData.type,
            acceptedBlock: blockNum,
            expiresBlock: questData.expiresBlock || (blockNum + 28800 * 7), // 7 days default
            objectives: [],
            completed: false,
            claimed: false
        };

        // Copy objectives with progress
        for (var j = 0; j < questData.objectives.length; j++) {
            var obj = questData.objectives[j];
            activeQuest.objectives.push({
                type: obj.type,
                target: obj.target || '',
                required: obj.required,
                current: 0,
                completed: false
            });
        }

        playerQuests.active.push(activeQuest);

        return { success: true, quest: activeQuest };
    }

    /**
     * Update quest progress based on game events.
     * @param {Object} playerQuests
     * @param {string} eventType - hunt, craft, duel, explore, social, territory
     * @param {Object} eventData - {target, count}
     * @returns {Array} list of quest progress events
     */
    function updateQuestProgress(playerQuests, eventType, eventData) {
        if (!playerQuests || !playerQuests.active) return [];

        var progressEvents = [];

        for (var i = 0; i < playerQuests.active.length; i++) {
            var quest = playerQuests.active[i];
            if (quest.completed) continue;

            for (var j = 0; j < quest.objectives.length; j++) {
                var obj = quest.objectives[j];
                if (obj.completed) continue;

                // Match event type to objective type
                if (obj.type === eventType) {
                    // If objective has a specific target, check it
                    if (obj.target && eventData.target && obj.target !== eventData.target) {
                        continue;
                    }

                    obj.current += (eventData.count || 1);
                    if (obj.current >= obj.required) {
                        obj.current = obj.required;
                        obj.completed = true;
                    }

                    progressEvents.push({
                        type: 'quest_progress',
                        questId: quest.id,
                        objectiveIndex: j,
                        current: obj.current,
                        required: obj.required
                    });
                }
            }

            // Check if all objectives complete
            var allDone = true;
            for (var k = 0; k < quest.objectives.length; k++) {
                if (!quest.objectives[k].completed) {
                    allDone = false;
                    break;
                }
            }
            if (allDone && !quest.completed) {
                quest.completed = true;
                progressEvents.push({
                    type: 'quest_ready',
                    questId: quest.id
                });
            }
        }

        return progressEvents;
    }

    /**
     * Complete a quest and claim rewards.
     * @param {string} questId
     * @param {Object} playerQuests
     * @param {Object} character
     * @param {Array} inventory
     * @param {number} blockNum
     * @returns {Object} {success, rewards}
     */
    function completeQuest(questId, playerQuests, character, inventory, blockNum) {
        if (!playerQuests || !character) {
            return { success: false, error: 'invalid_params' };
        }

        // Find active quest
        var questIndex = -1;
        for (var i = 0; i < playerQuests.active.length; i++) {
            if (playerQuests.active[i].id === questId) {
                questIndex = i;
                break;
            }
        }
        if (questIndex === -1) return { success: false, error: 'quest_not_found' };

        var quest = playerQuests.active[questIndex];
        if (!quest.completed) return { success: false, error: 'not_complete' };
        if (quest.claimed) return { success: false, error: 'already_claimed' };

        // Get quest template for rewards
        var questTemplate = null;
        if (typeof GameQuests !== 'undefined') {
            questTemplate = GameQuests.getQuest(questId);
        }

        var rewards = { xp: 0, items: [], awardEnergy: 0 };
        if (questTemplate && questTemplate.rewards) {
            rewards.xp = questTemplate.rewards.xp || 0;
            rewards.awardEnergy = questTemplate.rewards.awardEnergy || 0;

            // Add XP
            if (rewards.xp > 0 && typeof CharacterSystem !== 'undefined') {
                CharacterSystem.addXp(character, rewards.xp);
            }

            // Add items to inventory
            if (questTemplate.rewards.items && inventory) {
                for (var j = 0; j < questTemplate.rewards.items.length; j++) {
                    var itemDef = questTemplate.rewards.items[j];
                    if (typeof ItemSystem !== 'undefined') {
                        var item = ItemSystem.createItem(
                            itemDef.type, character.account || '', itemDef.rarity || 0,
                            blockNum, '', true
                        );
                        inventory.push(item);
                        rewards.items.push(item);
                    }
                }
            }
        }

        quest.claimed = true;

        // Move to completed list
        playerQuests.active.splice(questIndex, 1);
        playerQuests.completed.push({
            id: quest.id,
            completedBlock: blockNum
        });

        return { success: true, rewards: rewards };
    }

    /**
     * Generate daily prophecy quest for a player.
     * Deterministic from block number and player level.
     * @param {number} blockNum
     * @param {number} playerLevel
     * @returns {Object} quest template
     */
    function generateDailyProphecy(blockNum, playerLevel) {
        var dayNumber = Math.floor(blockNum / PROPHECY_INTERVAL);
        var seed = (dayNumber * 7919 + playerLevel * 131) | 0;

        var templates = [];
        if (typeof GameQuests !== 'undefined') {
            templates = GameQuests.getDailyTemplates(playerLevel);
        }

        if (templates.length === 0) {
            // Fallback template
            templates = [
                {
                    id: 'daily_hunt_' + dayNumber,
                    type: 'hunt',
                    titleKey: 'quest_daily_hunt',
                    descriptionKey: 'quest_daily_hunt_desc',
                    objectives: [{ type: 'hunt', required: 3 + (playerLevel > 5 ? 2 : 0) }],
                    rewards: { xp: 100 * playerLevel, awardEnergy: 50 },
                    minLevel: 1,
                    maxLevel: 50
                }
            ];
        }

        var index = Math.abs(seed) % templates.length;
        var template = JSON.parse(JSON.stringify(templates[index]));

        // Stamp unique ID for today
        template.id = 'daily_' + dayNumber + '_' + playerLevel;
        template.isDaily = true;
        template.expiresBlock = (dayNumber + 1) * PROPHECY_INTERVAL;

        return template;
    }

    /**
     * Get active quests for a player.
     * @param {Object} playerQuests
     * @returns {Array}
     */
    function getActiveQuests(playerQuests) {
        if (!playerQuests) return [];
        return playerQuests.active || [];
    }

    /**
     * Get available quests for a player (not yet accepted).
     * @param {Object} character
     * @param {Object} playerQuests
     * @param {number} blockNum
     * @returns {Array}
     */
    function getAvailableQuests(character, playerQuests, blockNum) {
        if (!character || !playerQuests) return [];

        var available = [];
        var activeIds = {};
        var completedIds = {};

        for (var i = 0; i < (playerQuests.active || []).length; i++) {
            activeIds[playerQuests.active[i].id] = true;
        }
        for (var j = 0; j < (playerQuests.completed || []).length; j++) {
            completedIds[playerQuests.completed[j].id] = true;
        }

        if (typeof GameQuests !== 'undefined') {
            var allQuests = GameQuests.getAll();
            for (var k = 0; k < allQuests.length; k++) {
                var q = allQuests[k];
                if (activeIds[q.id] || completedIds[q.id]) continue;
                if (q.minLevel && character.level < q.minLevel) continue;
                if (q.maxLevel && character.level > q.maxLevel) continue;
                available.push(q);
            }
        }

        return available;
    }

    /**
     * Abandon a quest.
     * @param {string} questId
     * @param {Object} playerQuests
     * @returns {boolean}
     */
    function abandonQuest(questId, playerQuests) {
        if (!playerQuests || !playerQuests.active) return false;
        for (var i = 0; i < playerQuests.active.length; i++) {
            if (playerQuests.active[i].id === questId) {
                playerQuests.active.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    /**
     * Create a default player quest state.
     */
    function createPlayerQuestState() {
        return {
            active: [],
            completed: [],
            dailyProphecyDay: 0
        };
    }

    return {
        QUEST_TYPES: QUEST_TYPES,
        MAX_ACTIVE_QUESTS: MAX_ACTIVE_QUESTS,
        acceptQuest: acceptQuest,
        updateQuestProgress: updateQuestProgress,
        completeQuest: completeQuest,
        generateDailyProphecy: generateDailyProphecy,
        getActiveQuests: getActiveQuests,
        getAvailableQuests: getAvailableQuests,
        abandonQuest: abandonQuest,
        createPlayerQuestState: createPlayerQuestState
    };
})();
