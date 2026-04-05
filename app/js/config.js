/**
 * Viz Magic — App Configuration
 * VIZ nodes, protocol IDs, game constants
 */
var VizMagicConfig = (function() {
    'use strict';

    /** VIZ blockchain node endpoints (HTTP and WebSocket) */
    var NODES = [
        'https://api.viz.world/',
        'https://node.viz.cx/',
        'https://viz.lexa.top/',
        'wss://solox.world/ws'
    ];

    /** Protocol identifiers registered on VIZ chain */
    var PROTOCOLS = {
        VM: 'VM',   // Viz Magic — all game actions
        VE: 'VE',   // VIZ Events — enchanting, consumption, edits
        V:  'V'     // Voice — social layer (Realm Chronicle)
    };

    /** App version and storage */
    var APP_VERSION = 1;
    var STORAGE_PREFIX = 'viz_magic_';

    /** Energy / Mana system constants */
    var ENERGY = {
        MAX: 10000,                          // Maximum mana points (basis points)
        REGEN_SECONDS: 432000,               // 5 days for full 0→100% regen
        REGEN_PER_SECOND: 10000 / 432000,    // ~0.02315 per second
        MIN_HUNT_COST: 100,                  // Minimum mana for a hunt (1%)
        MIN_BLESS_COST: 1                    // Minimum mana for blessing (0.01%)
    };

    /** HP passive regeneration constants */
    var HP_REGEN = {
        HP_REGEN_RATE: 500,      // blocks per +1 HP
        HP_REGEN_CAP_PCT: 30     // max % of maxHp that passive regen can reach
    };

    /** Block timing */
    var BLOCK = {
        TIME_SECONDS: 3,                     // 1 block = ~3 seconds (Aetheric Tick)
        DUEL_ACCEPT_WINDOW: 28800,           // Blocks to accept duel (~24h)
        DUEL_REVEAL_MIN: 100,                // Min blocks before reveal
        DUEL_REVEAL_MAX: 14400,              // Max blocks for reveal (~12h)
        FALLEN_DURATION: 14400               // Fallen status duration (~12h in blocks)
    };

    /** Character classes */
    var CLASSES = {
        STONEWARDEN: 'stonewarden',
        EMBERCASTER: 'embercaster',
        MOONRUNNER:  'moonrunner',
        BLOOMSAGE:   'bloomsage'
    };

    /** Magic schools / elements */
    var SCHOOLS = {
        IGNIS:  'ignis',
        AQUA:   'aqua',
        TERRA:  'terra',
        VENTUS: 'ventus',
        UMBRA:  'umbra'
    };

    /** Dominance wheel: school → school it dominates (1.5x) */
    var DOMINANCE = {
        ignis:  'ventus',
        ventus: 'terra',
        terra:  'aqua',
        aqua:   'umbra',
        umbra:  'ignis'
    };

    /** Element modifier multipliers (integer math: x1000) */
    var ELEMENT_MODS = {
        DOMINANT:     1500,  // 1.5x (÷1000)
        NEUTRAL:      1000,  // 1.0x
        SUBORDINATE:  700    // 0.7x
    };

    /** XP and leveling */
    var LEVELING = {
        SOFT_CAP: 50,
        XP_BASE: 1000      // XP for level N = 1000 * N^1.5 (integer approximation)
    };

    /** Item rarity tiers */
    var RARITY = {
        COMMON:     0,
        UNCOMMON:   1,
        RARE:       2,
        EPIC:       3,
        LEGENDARY:  4
    };

    /** Stat IDs */
    var STATS = {
        POT: 'pot',   // Potency — attack power
        RES: 'res',   // Resilience — defense, HP
        SWF: 'swf',   // Swiftness — initiative, evasion
        INT: 'int',   // Intellect — craft quality, efficiency
        FOR: 'for'    // Fortune — crit chance, loot quality
    };

    /** Combat intents (rock-paper-scissors) */
    var INTENTS = {
        STRIKE: 'strike',
        GUARD:  'guard',
        WEAVE:  'weave',
        MEND:   'mend'
    };

    /** Intent dominance: intent → what it beats */
    var INTENT_BEATS = {
        strike: 'mend',
        mend:   'weave',
        weave:  'guard',
        guard:  'strike'
    };

    /** VM protocol action types */
    var ACTION_TYPES = {
        // Character
        CHAR_ATTUNE:    'char.attune',
        MOVE:           'move',
        // Combat
        HUNT:                'hunt',
        HUNT_ARMAGEDDON:     'hunt.armageddon',
        CHALLENGE:      'challenge',
        ACCEPT:         'accept',
        COMMIT:         'commit',
        REVEAL:         'reveal',
        FORFEIT:        'forfeit',
        // Items
        CRAFT:          'craft',
        ITEM_TRANSFER:  'item.transfer',
        ITEM_EQUIP:     'item.equip',
        ITEM_UNEQUIP:   'item.unequip',
        LOOT_ACQUIRE:   'loot.acquire',
        LOOT_BANK:      'loot.bank',
        LOOT_CLAIM:     'loot.claim',
        // Economy
        MARKET_LIST:    'market.list',
        MARKET_CANCEL:  'market.cancel',
        MARKET_BUY:     'market.buy',
        // Enchanting
        ENCHANT:        'enchant',
        // Skills
        SKILL_LEARN:    'skill.learn',
        // Guild
        GUILD_CREATE:   'guild.create',
        GUILD_INVITE:   'guild.invite',
        GUILD_ACCEPT:   'guild.accept',
        GUILD_LEAVE:    'guild.leave',
        GUILD_PROMOTE:  'guild.promote',
        GUILD_WAR:      'guild.war',
        GUILD_PEACE:    'guild.peace',
        // Territory / Siege
        SIEGE_DECLARE:  'siege.declare',
        SIEGE_COMMIT:   'siege.commit',
        TERRITORY_CLAIM:'territory.claim',
        // World
        LOC_CREATE:     'loc.create',
        REST:           'rest',
        // Phase 5: Quests & Boss
        QUEST_ACCEPT:   'quest.accept',
        QUEST_COMPLETE: 'quest.complete',
        BOSS_ATTACK:    'boss.attack'
    };

    /** Asset formatting helpers */
    var ASSETS = {
        VIZ_PRECISION:    3,
        SHARES_PRECISION: 6,

        /** Format a number as VIZ asset string */
        formatVIZ: function(amount) {
            return amount.toFixed(3) + ' VIZ';
        },

        /** Format a number as SHARES asset string */
        formatSHARES: function(amount) {
            return amount.toFixed(6) + ' SHARES';
        }
    };

    /** Grimoire (metadata) schema key */
    var GRIMOIRE_KEY = 'vm';

    /** World event intervals (in blocks, approximate) */
    var WORLD_EVENTS = {
        WEAVE_SURGE_INTERVAL: 864000,   // ~30 days
        WORLD_BOSS_INTERVAL:  864000,   // ~30 days (offset)
        SEASON_CHANGE:        2419200   // ~84 days
    };

    return {
        NODES: NODES,
        PROTOCOLS: PROTOCOLS,
        APP_VERSION: APP_VERSION,
        STORAGE_PREFIX: STORAGE_PREFIX,
        ENERGY: ENERGY,
        HP_REGEN: HP_REGEN,
        BLOCK: BLOCK,
        CLASSES: CLASSES,
        SCHOOLS: SCHOOLS,
        DOMINANCE: DOMINANCE,
        ELEMENT_MODS: ELEMENT_MODS,
        LEVELING: LEVELING,
        RARITY: RARITY,
        STATS: STATS,
        INTENTS: INTENTS,
        INTENT_BEATS: INTENT_BEATS,
        ACTION_TYPES: ACTION_TYPES,
        ASSETS: ASSETS,
        GRIMOIRE_KEY: GRIMOIRE_KEY,
        WORLD_EVENTS: WORLD_EVENTS
    };
})();
