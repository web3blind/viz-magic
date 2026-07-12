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

    /** Magical weather definitions. These are in-world, not real-world forecasts. */
    var WEATHER = [
        {
            id: 'frog_rain',
            icon: '\uD83D\uDC38',
            summaryKey: 'weather_frog_rain',
            effectKey: 'weather_frog_rain_effect',
            creatureAttackMod: 1050,
            playerDefenseMod: 1000
        },
        {
            id: 'low_dragons',
            icon: '\uD83D\uDC32',
            summaryKey: 'weather_low_dragons',
            effectKey: 'weather_low_dragons_effect',
            creatureAttackMod: 1100,
            playerDefenseMod: 1000
        },
        {
            id: 'singing_lightning',
            icon: '\u26A1',
            summaryKey: 'weather_singing_lightning',
            effectKey: 'weather_singing_lightning_effect',
            creatureAttackMod: 1000,
            playerDefenseMod: 950
        },
        {
            id: 'quiet_stars',
            icon: '\u2728',
            summaryKey: 'weather_quiet_stars',
            effectKey: 'weather_quiet_stars_effect',
            creatureAttackMod: 950,
            playerDefenseMod: 1050
        },
        {
            id: 'forbidden_wind',
            icon: '\uD83C\uDF2B\uFE0F',
            summaryKey: 'weather_forbidden_wind',
            effectKey: 'weather_forbidden_wind_effect',
            creatureAttackMod: 1150,
            playerDefenseMod: 950
        },
        {
            id: 'dragon_shadow',
            icon: '\uD83D\uDC09',
            summaryKey: 'weather_dragon_shadow',
            effectKey: 'weather_dragon_shadow_effect',
            creatureAttackMod: 1120,
            playerDefenseMod: 1000
        },
        {
            id: 'no_looking_back',
            icon: '\uD83D\uDC41\uFE0F',
            summaryKey: 'weather_no_looking_back',
            effectKey: 'weather_no_looking_back_effect',
            creatureAttackMod: 1080,
            playerDefenseMod: 980
        },
        {
            id: 'mirror_fog',
            icon: '\uD83E\uDE9E',
            summaryKey: 'weather_mirror_fog',
            effectKey: 'weather_mirror_fog_effect',
            creatureAttackMod: 1000,
            playerDefenseMod: 920
        },
        {
            id: 'whispering_mushrooms',
            icon: '\uD83C\uDF44',
            summaryKey: 'weather_whispering_mushrooms',
            effectKey: 'weather_whispering_mushrooms_effect',
            creatureAttackMod: 960,
            playerDefenseMod: 1060
        },
        {
            id: 'iron_moon',
            icon: '\uD83C\uDF15',
            summaryKey: 'weather_iron_moon',
            effectKey: 'weather_iron_moon_effect',
            creatureAttackMod: 1030,
            playerDefenseMod: 1030
        },
        {
            id: 'singing_swamp',
            icon: '\uD83E\uDEB7',
            summaryKey: 'weather_singing_swamp',
            effectKey: 'weather_singing_swamp_effect',
            creatureAttackMod: 1060,
            playerDefenseMod: 960
        },
        {
            id: 'upward_rain',
            icon: '\uD83C\uDF27\uFE0F',
            summaryKey: 'weather_upward_rain',
            effectKey: 'weather_upward_rain_effect',
            creatureAttackMod: 970,
            playerDefenseMod: 1040
        },
        {
            id: 'glass_grass',
            icon: '\uD83C\uDF3F',
            summaryKey: 'weather_glass_grass',
            effectKey: 'weather_glass_grass_effect',
            creatureAttackMod: 1090,
            playerDefenseMod: 970
        },
        {
            id: 'sleeping_thunder',
            icon: '\uD83C\uDF29\uFE0F',
            summaryKey: 'weather_sleeping_thunder',
            effectKey: 'weather_sleeping_thunder_effect',
            creatureAttackMod: 940,
            playerDefenseMod: 1080
        },
        {
            id: 'hungry_constellations',
            icon: '\uD83C\uDF0C',
            summaryKey: 'weather_hungry_constellations',
            effectKey: 'weather_hungry_constellations_effect',
            creatureAttackMod: 1110,
            playerDefenseMod: 1000
        },
        {
            id: 'borrowed_sun',
            icon: '\u2600\uFE0F',
            summaryKey: 'weather_borrowed_sun',
            effectKey: 'weather_borrowed_sun_effect',
            creatureAttackMod: 980,
            playerDefenseMod: 1070
        },
        {
            id: 'ash_snow',
            icon: '\u2744\uFE0F',
            summaryKey: 'weather_ash_snow',
            effectKey: 'weather_ash_snow_effect',
            creatureAttackMod: 1040,
            playerDefenseMod: 990
        },
        {
            id: 'lost_names',
            icon: '\uD83D\uDCDC',
            summaryKey: 'weather_lost_names',
            effectKey: 'weather_lost_names_effect',
            creatureAttackMod: 1070,
            playerDefenseMod: 970
        },
        {
            id: 'clockwork_hail',
            icon: '\u23F1\uFE0F',
            summaryKey: 'weather_clockwork_hail',
            effectKey: 'weather_clockwork_hail_effect',
            creatureAttackMod: 1130,
            playerDefenseMod: 980
        },
        {
            id: 'polite_crows',
            icon: '\uD83D\uDC26\u200D\u2B1B',
            summaryKey: 'weather_polite_crows',
            effectKey: 'weather_polite_crows_effect',
            creatureAttackMod: 960,
            playerDefenseMod: 1060
        },
        {
            id: 'golden_dust',
            icon: '\u2728',
            summaryKey: 'weather_golden_dust',
            effectKey: 'weather_golden_dust_effect',
            creatureAttackMod: 930,
            playerDefenseMod: 1100
        },
        {
            id: 'black_rainbow',
            icon: '\uD83C\uDF08',
            summaryKey: 'weather_black_rainbow',
            effectKey: 'weather_black_rainbow_effect',
            creatureAttackMod: 1100,
            playerDefenseMod: 940
        },
        {
            id: 'wandering_doors',
            icon: '\uD83D\uDEAA',
            summaryKey: 'weather_wandering_doors',
            effectKey: 'weather_wandering_doors_effect',
            creatureAttackMod: 1050,
            playerDefenseMod: 970
        },
        {
            id: 'salt_wind',
            icon: '\uD83C\uDF2C\uFE0F',
            summaryKey: 'weather_salt_wind',
            effectKey: 'weather_salt_wind_effect',
            creatureAttackMod: 1020,
            playerDefenseMod: 1020
        },
        {
            id: 'paper_storm',
            icon: '\uD83D\uDCDC',
            summaryKey: 'weather_paper_storm',
            effectKey: 'weather_paper_storm_effect',
            creatureAttackMod: 1080,
            playerDefenseMod: 960
        },
        {
            id: 'bone_bells',
            icon: '\uD83D\uDD14',
            summaryKey: 'weather_bone_bells',
            effectKey: 'weather_bone_bells_effect',
            creatureAttackMod: 1140,
            playerDefenseMod: 950
        },
        {
            id: 'kind_darkness',
            icon: '\uD83C\uDF11',
            summaryKey: 'weather_kind_darkness',
            effectKey: 'weather_kind_darkness_effect',
            creatureAttackMod: 920,
            playerDefenseMod: 1120
        },
        {
            id: 'blue_fireflies',
            icon: '\uD83D\uDCA1',
            summaryKey: 'weather_blue_fireflies',
            effectKey: 'weather_blue_fireflies_effect',
            creatureAttackMod: 950,
            playerDefenseMod: 1080
        },
        {
            id: 'wrong_echo',
            icon: '\uD83D\uDD0A',
            summaryKey: 'weather_wrong_echo',
            effectKey: 'weather_wrong_echo_effect',
            creatureAttackMod: 1090,
            playerDefenseMod: 970
        },
        {
            id: 'crown_of_rain',
            icon: '\uD83D\uDC51',
            summaryKey: 'weather_crown_of_rain',
            effectKey: 'weather_crown_of_rain_effect',
            creatureAttackMod: 1050,
            playerDefenseMod: 1050
        }
    ];





    /** Occasional magical holidays tied to game sections. */
    var FESTIVALS = [
        { id: 'hearth_spirit_day', icon: '\uD83C\uDFE0', screen: 'home', nameKey: 'festival_hearth_spirit_day', descKey: 'festival_hearth_spirit_day_desc' },
        { id: 'hunt_tribute', icon: '\u2694\uFE0F', screen: 'hunt', nameKey: 'festival_hunt_tribute', descKey: 'festival_hunt_tribute_desc' },
        { id: 'guild_dance', icon: '\uD83D\uDEE1\uFE0F', screen: 'guild', nameKey: 'festival_guild_dance', descKey: 'festival_guild_dance_desc' },
        { id: 'chronicle_ink_night', icon: '\uD83D\uDCDD', screen: 'chronicle', nameKey: 'festival_chronicle_ink_night', descKey: 'festival_chronicle_ink_night_desc' },
        { id: 'bazaar_bell_day', icon: '\uD83C\uDFEA', screen: 'marketplace', nameKey: 'festival_bazaar_bell_day', descKey: 'festival_bazaar_bell_day_desc' },
        { id: 'hammer_sparks', icon: '\uD83D\uDD28', screen: 'crafting', nameKey: 'festival_hammer_sparks', descKey: 'festival_hammer_sparks_desc' },
        { id: 'bag_whisper', icon: '\uD83C\uDF92', screen: 'inventory', nameKey: 'festival_bag_whisper', descKey: 'festival_bag_whisper_desc' },
        { id: 'prophecy_candle', icon: '\uD83D\uDD2E', screen: 'quests', nameKey: 'festival_prophecy_candle', descKey: 'festival_prophecy_candle_desc' },
        { id: 'dragon_mask_day', icon: '\uD83D\uDC32', screen: 'world-boss', nameKey: 'festival_dragon_mask_day', descKey: 'festival_dragon_mask_day_desc' }
    ];

    /** Everyday magical sky signs. Combined with omens, this gives a year-sized forecast pool. */
    var SKY_SIGNS = [
        { id: 'sun_cloud', icon: '\u26C5', summaryKey: 'sky_sun_cloud' },
        { id: 'rain', icon: '\uD83C\uDF27\uFE0F', summaryKey: 'sky_rain' },
        { id: 'hail', icon: '\uD83C\uDF28\uFE0F', summaryKey: 'sky_hail' },
        { id: 'lightning', icon: '\uD83C\uDF29\uFE0F', summaryKey: 'sky_lightning' },
        { id: 'hurricane', icon: '\uD83C\uDF2A\uFE0F', summaryKey: 'sky_hurricane' },
        { id: 'dry_heat', icon: '\uD83C\uDF35', summaryKey: 'sky_dry_heat' },
        { id: 'hard_frost', icon: '\u2744\uFE0F', summaryKey: 'sky_hard_frost' },
        { id: 'dust_storm', icon: '\uD83C\uDF2B\uFE0F', summaryKey: 'sky_dust_storm' },
        { id: 'sudden_thaw', icon: '\uD83E\uDDCA', summaryKey: 'sky_sudden_thaw' },
        { id: 'red_dawn', icon: '\uD83C\uDF05', summaryKey: 'sky_red_dawn' },
        { id: 'black_snow', icon: '\u26C4', summaryKey: 'sky_black_snow' },
        { id: 'silver_fog', icon: '\uD83C\uDF01', summaryKey: 'sky_silver_fog' },
        { id: 'double_rainbow', icon: '\uD83C\uDF08', summaryKey: 'sky_double_rainbow' }
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
     * Get occasional magical holiday. Appears roughly every fifth in-world day.
     * @param {number} blockNum
     * @returns {Object|null}
     */
    function getCurrentFestival(blockNum) {
        var day = Math.floor(blockNum / 28800);
        if (day % 5 !== 0) return null;
        var idx = Math.floor(day / 5) % FESTIVALS.length;
        return FESTIVALS[idx];
    }

    /**
     * Get current sky sign based on block number.
     * @param {number} blockNum
     * @returns {Object}
     */
    function getCurrentSky(blockNum) {
        var idx = Math.floor(blockNum / 28800) % SKY_SIGNS.length;
        if (idx < 0) idx = 0;
        return SKY_SIGNS[idx];
    }

    /**
     * Count available daily forecast combinations.
     * @returns {number}
     */
    function getForecastVariantCount() {
        return SKY_SIGNS.length * WEATHER.length;
    }

    /**
     * Get current magical weather based on block number.
     * This is a deterministic in-game forecast and affects hunts.
     * @param {number} blockNum
     * @returns {Object}
     */
    function getCurrentWeather(blockNum) {
        var day = Math.floor(blockNum / 28800);
        var idx = Math.floor(day / SKY_SIGNS.length) % WEATHER.length;
        if (idx < 0) idx = 0;
        return WEATHER[idx];
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
        getCurrentWeather: getCurrentWeather,
        getCurrentSky: getCurrentSky,
        getForecastVariantCount: getForecastVariantCount,
        getCurrentFestival: getCurrentFestival,
        getActiveEvents: getActiveEvents,
        checkEventTriggers: checkEventTriggers,
        checkWeaveSurge: checkWeaveSurge,
        checkMinorRift: checkMinorRift,
        checkWorldBossWindow: checkWorldBossWindow,
        getUpcomingEvents: getUpcomingEvents,
        blocksUntilSeasonChange: blocksUntilSeasonChange
    };
})();
