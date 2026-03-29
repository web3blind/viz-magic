/**
 * Viz Magic — Quest Data
 * 10 starter quests + daily prophecy templates.
 */
var GameQuests = (function() {
    'use strict';

    var QUESTS = {
        q_hunt_wisps: {
            id: 'q_hunt_wisps',
            giverNpc: 'vm-npc-elder-sage',
            titleKey: 'quest_hunt_wisps_title',
            descriptionKey: 'quest_hunt_wisps_desc',
            type: 'hunt',
            minLevel: 1,
            maxLevel: 5,
            objectives: [
                { type: 'hunt', target: 'ember_wisp', required: 3 }
            ],
            rewards: {
                xp: 150,
                items: [{ type: 'fire_dust', rarity: 1 }],
                awardEnergy: 100
            }
        },
        q_hunt_drakes: {
            id: 'q_hunt_drakes',
            giverNpc: 'vm-npc-elder-sage',
            titleKey: 'quest_hunt_drakes_title',
            descriptionKey: 'quest_hunt_drakes_desc',
            type: 'hunt',
            minLevel: 5,
            maxLevel: 12,
            objectives: [
                { type: 'hunt', target: 'hollow_shade', required: 5 }
            ],
            rewards: {
                xp: 400,
                items: [{ type: 'shadow_shard', rarity: 2 }],
                awardEnergy: 200
            }
        },
        q_craft_weapon: {
            id: 'q_craft_weapon',
            giverNpc: 'vm-npc-elder-sage',
            titleKey: 'quest_craft_weapon_title',
            descriptionKey: 'quest_craft_weapon_desc',
            type: 'craft',
            minLevel: 3,
            maxLevel: 50,
            objectives: [
                { type: 'craft', required: 1 }
            ],
            rewards: {
                xp: 200,
                items: [{ type: 'sparkdust', rarity: 0 }],
                awardEnergy: 100
            }
        },
        q_win_duel: {
            id: 'q_win_duel',
            giverNpc: 'vm-npc-arena-master',
            titleKey: 'quest_win_duel_title',
            descriptionKey: 'quest_win_duel_desc',
            type: 'duel',
            minLevel: 5,
            maxLevel: 50,
            objectives: [
                { type: 'duel', required: 1 }
            ],
            rewards: {
                xp: 300,
                items: [],
                awardEnergy: 200
            }
        },
        q_visit_regions: {
            id: 'q_visit_regions',
            giverNpc: 'vm-npc-elder-sage',
            titleKey: 'quest_visit_regions_title',
            descriptionKey: 'quest_visit_regions_desc',
            type: 'explore',
            minLevel: 3,
            maxLevel: 50,
            objectives: [
                { type: 'explore', required: 3 }
            ],
            rewards: {
                xp: 250,
                items: [{ type: 'chronicle_ink', rarity: 0 }],
                awardEnergy: 150
            }
        },
        q_blessings: {
            id: 'q_blessings',
            giverNpc: 'vm-npc-elder-sage',
            titleKey: 'quest_blessings_title',
            descriptionKey: 'quest_blessings_desc',
            type: 'social',
            minLevel: 1,
            maxLevel: 50,
            objectives: [
                { type: 'social', target: 'blessing', required: 5 }
            ],
            rewards: {
                xp: 200,
                items: [],
                awardEnergy: 100
            }
        },
        q_hunt_session: {
            id: 'q_hunt_session',
            giverNpc: 'vm-npc-elder-sage',
            titleKey: 'quest_hunt_session_title',
            descriptionKey: 'quest_hunt_session_desc',
            type: 'hunt',
            minLevel: 8,
            maxLevel: 50,
            objectives: [
                { type: 'hunt', required: 10 }
            ],
            rewards: {
                xp: 600,
                items: [{ type: 'health_scroll', rarity: 1 }, { type: 'fire_dust', rarity: 1 }],
                awardEnergy: 300
            }
        },
        q_enchant_item: {
            id: 'q_enchant_item',
            giverNpc: 'vm-npc-elder-sage',
            titleKey: 'quest_enchant_item_title',
            descriptionKey: 'quest_enchant_item_desc',
            type: 'craft',
            minLevel: 10,
            maxLevel: 50,
            objectives: [
                { type: 'craft', target: 'enchant', required: 1 }
            ],
            rewards: {
                xp: 500,
                items: [{ type: 'echo_shards', rarity: 2 }],
                awardEnergy: 250
            }
        },
        q_join_guild: {
            id: 'q_join_guild',
            giverNpc: 'vm-npc-elder-sage',
            titleKey: 'quest_join_guild_title',
            descriptionKey: 'quest_join_guild_desc',
            type: 'social',
            minLevel: 4,
            maxLevel: 50,
            objectives: [
                { type: 'social', target: 'guild_join', required: 1 }
            ],
            rewards: {
                xp: 300,
                items: [],
                awardEnergy: 200
            }
        },
        q_siege_contribute: {
            id: 'q_siege_contribute',
            giverNpc: 'vm-npc-gate-sentinel',
            titleKey: 'quest_siege_title',
            descriptionKey: 'quest_siege_desc',
            type: 'territory',
            minLevel: 12,
            maxLevel: 50,
            objectives: [
                { type: 'territory', target: 'siege', required: 1 }
            ],
            rewards: {
                xp: 800,
                items: [{ type: 'aether_ore', rarity: 2 }],
                awardEnergy: 400
            }
        }
    };

    /** Daily prophecy template pools, keyed by level bracket */
    var DAILY_TEMPLATES = [
        // Level 1-5
        {
            minLevel: 1, maxLevel: 5,
            templates: [
                {
                    type: 'hunt',
                    titleKey: 'quest_daily_hunt',
                    descriptionKey: 'quest_daily_hunt_desc',
                    objectives: [{ type: 'hunt', required: 3 }],
                    rewards: { xp: 100, awardEnergy: 50 }
                },
                {
                    type: 'social',
                    titleKey: 'quest_daily_bless',
                    descriptionKey: 'quest_daily_bless_desc',
                    objectives: [{ type: 'social', target: 'blessing', required: 2 }],
                    rewards: { xp: 80, awardEnergy: 40 }
                }
            ]
        },
        // Level 6-15
        {
            minLevel: 6, maxLevel: 15,
            templates: [
                {
                    type: 'hunt',
                    titleKey: 'quest_daily_hunt',
                    descriptionKey: 'quest_daily_hunt_desc',
                    objectives: [{ type: 'hunt', required: 5 }],
                    rewards: { xp: 250, awardEnergy: 100 }
                },
                {
                    type: 'craft',
                    titleKey: 'quest_daily_craft',
                    descriptionKey: 'quest_daily_craft_desc',
                    objectives: [{ type: 'craft', required: 1 }],
                    rewards: { xp: 200, awardEnergy: 80 }
                },
                {
                    type: 'duel',
                    titleKey: 'quest_daily_duel',
                    descriptionKey: 'quest_daily_duel_desc',
                    objectives: [{ type: 'duel', required: 1 }],
                    rewards: { xp: 300, awardEnergy: 120 }
                },
                {
                    type: 'explore',
                    titleKey: 'quest_daily_explore',
                    descriptionKey: 'quest_daily_explore_desc',
                    objectives: [{ type: 'explore', required: 2 }],
                    rewards: { xp: 200, awardEnergy: 80 }
                }
            ]
        },
        // Level 16+
        {
            minLevel: 16, maxLevel: 50,
            templates: [
                {
                    type: 'hunt',
                    titleKey: 'quest_daily_hunt',
                    descriptionKey: 'quest_daily_hunt_desc',
                    objectives: [{ type: 'hunt', required: 8 }],
                    rewards: { xp: 500, awardEnergy: 200 }
                },
                {
                    type: 'duel',
                    titleKey: 'quest_daily_duel',
                    descriptionKey: 'quest_daily_duel_desc',
                    objectives: [{ type: 'duel', required: 2 }],
                    rewards: { xp: 600, awardEnergy: 250 }
                },
                {
                    type: 'craft',
                    titleKey: 'quest_daily_craft',
                    descriptionKey: 'quest_daily_craft_desc',
                    objectives: [{ type: 'craft', required: 2 }],
                    rewards: { xp: 400, awardEnergy: 150 }
                },
                {
                    type: 'territory',
                    titleKey: 'quest_daily_territory',
                    descriptionKey: 'quest_daily_territory_desc',
                    objectives: [{ type: 'territory', target: 'siege', required: 1 }],
                    rewards: { xp: 700, awardEnergy: 300 }
                }
            ]
        }
    ];

    /**
     * Get a quest by ID.
     * @param {string} id
     * @returns {Object|null}
     */
    function getQuest(id) {
        return QUESTS[id] || null;
    }

    /**
     * Get all quests as array.
     * @returns {Array}
     */
    function getAll() {
        var result = [];
        for (var id in QUESTS) {
            if (QUESTS.hasOwnProperty(id)) {
                result.push(QUESTS[id]);
            }
        }
        return result;
    }

    /**
     * Get daily prophecy templates for a player's level.
     * @param {number} level
     * @returns {Array}
     */
    function getDailyTemplates(level) {
        for (var i = 0; i < DAILY_TEMPLATES.length; i++) {
            var bracket = DAILY_TEMPLATES[i];
            if (level >= bracket.minLevel && level <= bracket.maxLevel) {
                return bracket.templates;
            }
        }
        // Default to last bracket
        return DAILY_TEMPLATES[DAILY_TEMPLATES.length - 1].templates;
    }

    return {
        QUESTS: QUESTS,
        getQuest: getQuest,
        getAll: getAll,
        getDailyTemplates: getDailyTemplates
    };
})();
