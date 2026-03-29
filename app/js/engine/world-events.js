/**
 * Viz Magic — World Events System
 * Seasonal cycles, Weave Surges, Minor Rifts, World Boss spawns.
 * All deterministic from block number.
 */
var WorldEvents = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /** Block intervals */
    var SEASON_LENGTH     = 2419200;  // ~84 days
    var SURGE_INTERVAL    = 864000;   // ~30 days
    var RIFT_INTERVAL     = 100000;   // ~3.5 days
    var BOSS_INTERVAL     = 864000;   // ~30 days (offset from surge)
    var BOSS_OFFSET       = 432000;   // half-interval offset
    var SURGE_DURATION    = 28800;    // ~1 day
    var RIFT_DURATION     = 14400;    // ~12 hours
    var BOSS_WINDOW       = 28800;    // ~1 day

    /** Season definitions */
    var SEASONS = [
        {
            id: 'spring',
            nameKey: 'season_spring',
            icon: '\uD83C\uDF31',
            dominant: 'aqua',
            secondary: 'terra',
            dominantBonus: 200,   // +20% (x1000)
            secondaryBonus: 100   // +10%
        },
        {
            id: 'summer',
            nameKey: 'season_summer',
            icon: '\u2600\uFE0F',
            dominant: 'ignis',
            secondary: 'ventus',
            dominantBonus: 200,
            secondaryBonus: 100
        },
        {
            id: 'autumn',
            nameKey: 'season_autumn',
            icon: '\uD83C\uDF42',
            dominant: 'umbra',
            secondary: 'ignis',
            dominantBonus: 200,
            secondaryBonus: 100
        },
        {
            id: 'winter',
            nameKey: 'season_winter',
            icon: '\u2744\uFE0F',
            dominant: 'terra',
            secondary: 'aqua',
            dominantBonus: 200,
            secondaryBonus: 100
        }
    ];

    /**
     * Get the current season based on block number.
     * @param {number} blockNum
     * @returns {Object} season definition
     */
    function getCurrentSeason(blockNum) {
        var seasonIndex = Math.floor(blockNum / SEASON_LENGTH) % 4;
        return SEASONS[seasonIndex];
    }

    /**
     * Get blocks remaining until next season change.
     * @param {number} blockNum
     * @returns {number}
     */
    function blocksUntilSeasonChange(blockNum) {
        return SEASON_LENGTH - (blockNum % SEASON_LENGTH);
    }

    /**
     * Get elemental bonuses from current season.
     * @param {number} blockNum
     * @returns {Object} map of school → bonus (x1000 additive)
     */
    function getSeasonalBonuses(blockNum) {
        var season = getCurrentSeason(blockNum);
        var bonuses = {};
        bonuses[season.dominant] = season.dominantBonus;
        bonuses[season.secondary] = season.secondaryBonus;
        return bonuses;
    }

    /**
     * Check if Weave Surge is active.
     * @param {number} blockNum
     * @returns {Object|null} event info or null
     */
    function checkWeaveSurge(blockNum) {
        var cyclePos = blockNum % SURGE_INTERVAL;
        if (cyclePos < SURGE_DURATION) {
            return {
                type: 'weave_surge',
                nameKey: 'event_weave_surge',
                icon: '\uD83C\uDF0A',
                active: true,
                blocksRemaining: SURGE_DURATION - cyclePos,
                manaRegenMultiplier: 2
            };
        }
        return null;
    }

    /**
     * Check if Minor Rift is active.
     * @param {number} blockNum
     * @returns {Object|null}
     */
    function checkMinorRift(blockNum) {
        var cyclePos = blockNum % RIFT_INTERVAL;
        if (cyclePos < RIFT_DURATION) {
            return {
                type: 'minor_rift',
                nameKey: 'event_minor_rift',
                icon: '\uD83C\uDF00',
                active: true,
                blocksRemaining: RIFT_DURATION - cyclePos,
                rareSpawnBoost: true
            };
        }
        return null;
    }

    /**
     * Check if World Boss window is active.
     * @param {number} blockNum
     * @returns {Object|null}
     */
    function checkWorldBossWindow(blockNum) {
        var adjusted = (blockNum + BOSS_OFFSET) % BOSS_INTERVAL;
        if (adjusted < BOSS_WINDOW) {
            return {
                type: 'world_boss',
                nameKey: 'event_world_boss',
                icon: '\uD83D\uDC32',
                active: true,
                blocksRemaining: BOSS_WINDOW - adjusted,
                spawnBlock: blockNum - adjusted
            };
        }
        return null;
    }

    /**
     * Get all currently active events.
     * @param {number} blockNum
     * @returns {Array} list of active event objects
     */
    function getActiveEvents(blockNum) {
        var events = [];
        var surge = checkWeaveSurge(blockNum);
        if (surge) events.push(surge);
        var rift = checkMinorRift(blockNum);
        if (rift) events.push(rift);
        var boss = checkWorldBossWindow(blockNum);
        if (boss) events.push(boss);
        return events;
    }

    /**
     * Check event triggers (called each block in state engine).
     * Returns game events if transitions happened.
     * @param {number} blockNum
     * @param {number} prevBlock
     * @returns {Array} game events
     */
    function checkEventTriggers(blockNum, prevBlock) {
        var events = [];

        // Season change
        var prevSeason = Math.floor(prevBlock / SEASON_LENGTH) % 4;
        var curSeason = Math.floor(blockNum / SEASON_LENGTH) % 4;
        if (prevSeason !== curSeason && prevBlock > 0) {
            events.push({
                type: 'season_changed',
                season: SEASONS[curSeason],
                blockNum: blockNum
            });
        }

        // Surge start
        var prevSurgePos = prevBlock % SURGE_INTERVAL;
        var curSurgePos = blockNum % SURGE_INTERVAL;
        if (prevSurgePos >= SURGE_DURATION && curSurgePos < SURGE_DURATION) {
            events.push({ type: 'weave_surge_start', blockNum: blockNum });
        }
        if (prevSurgePos < SURGE_DURATION && curSurgePos >= SURGE_DURATION) {
            events.push({ type: 'weave_surge_end', blockNum: blockNum });
        }

        // Rift start
        var prevRiftPos = prevBlock % RIFT_INTERVAL;
        var curRiftPos = blockNum % RIFT_INTERVAL;
        if (prevRiftPos >= RIFT_DURATION && curRiftPos < RIFT_DURATION) {
            events.push({ type: 'minor_rift_start', blockNum: blockNum });
        }

        // Boss window start
        var prevBossPos = (prevBlock + BOSS_OFFSET) % BOSS_INTERVAL;
        var curBossPos = (blockNum + BOSS_OFFSET) % BOSS_INTERVAL;
        if (prevBossPos >= BOSS_WINDOW && curBossPos < BOSS_WINDOW) {
            events.push({ type: 'world_boss_spawn', blockNum: blockNum });
        }
        if (prevBossPos < BOSS_WINDOW && curBossPos >= BOSS_WINDOW) {
            events.push({ type: 'world_boss_window_end', blockNum: blockNum });
        }

        return events;
    }

    /**
     * Get overview of upcoming events.
     * @param {number} blockNum
     * @returns {Array}
     */
    function getUpcomingEvents(blockNum) {
        var upcoming = [];

        // Next season
        upcoming.push({
            type: 'season_change',
            nameKey: 'event_next_season',
            blocksUntil: blocksUntilSeasonChange(blockNum),
            nextSeason: SEASONS[(Math.floor(blockNum / SEASON_LENGTH) + 1) % 4]
        });

        // Next surge
        var surgePos = blockNum % SURGE_INTERVAL;
        if (surgePos >= SURGE_DURATION) {
            upcoming.push({
                type: 'weave_surge',
                nameKey: 'event_weave_surge',
                blocksUntil: SURGE_INTERVAL - surgePos
            });
        }

        // Next boss
        var bossPos = (blockNum + BOSS_OFFSET) % BOSS_INTERVAL;
        if (bossPos >= BOSS_WINDOW) {
            upcoming.push({
                type: 'world_boss',
                nameKey: 'event_world_boss',
                blocksUntil: BOSS_INTERVAL - bossPos
            });
        }

        return upcoming;
    }

    return {
        SEASONS: SEASONS,
        getCurrentSeason: getCurrentSeason,
        getSeasonalBonuses: getSeasonalBonuses,
        getActiveEvents: getActiveEvents,
        checkEventTriggers: checkEventTriggers,
        checkWeaveSurge: checkWeaveSurge,
        checkMinorRift: checkMinorRift,
        checkWorldBossWindow: checkWorldBossWindow,
        getUpcomingEvents: getUpcomingEvents,
        blocksUntilSeasonChange: blocksUntilSeasonChange
    };
})();
