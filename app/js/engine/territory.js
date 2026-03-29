/**
 * Viz Magic — Territory Control Engine
 * Territory anchors, control calculation, siege protocol,
 * benefits, taxation, and daily recalculation.
 */
var TerritorySystem = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /** Territory recalculation interval (blocks) — ~24 hours */
    var RECALC_INTERVAL = 28800;

    /** Siege duration (blocks) — 7 days */
    var SIEGE_DURATION = 201600;

    /** Territory benefits */
    var BENEFITS = {
        HOME_STAT_BONUS: 150,      // +15% (x1000 = 1150, bonus = 150)
        RESOURCE_SPAWN_MULT: 1200, // +20% resource spawns (x1000)
        SAFE_BANKING: true,
        TAX_MIN: 500,              // 5% minimum controller tax (weight out of 10000)
        TAX_MAX: 1500,             // 15% maximum controller tax
        CREATOR_ROYALTY_MIN: 200,  // 2% creator royalty
        CREATOR_ROYALTY_MAX: 500   // 5% creator royalty
    };

    /** Siege states */
    var SIEGE_STATE = {
        ACTIVE:   'active',
        RESOLVED: 'resolved',
        FAILED:   'failed'
    };

    /** Territory anchor accounts mapped to regions */
    var TERRITORY_ANCHORS = {
        commons_first_light: 'vm-commons',
        ember_wastes:        'vm-ember-north',
        deep_currents:       'vm-deep-south',
        iron_root:           'vm-iron-east',
        shattered_sky:       'vm-sky-west',
        the_veil:            'vm-veil-center',
        forklands:           'vm-fork-east',
        covenant_bazaar:     'vm-bazaar',
        duel_spires:         'vm-spires'
    };

    /**
     * Create a territory state object
     * @param {string} regionId
     * @returns {Object}
     */
    function createTerritory(regionId) {
        return {
            regionId: regionId,
            anchor: TERRITORY_ANCHORS[regionId] || '',
            controllerGuild: null,     // guild ID that controls this territory
            controllerSince: 0,        // block when control was established
            delegations: {},           // {guildId: totalShares (integer)}
            tax: 500,                  // Controller tax (weight, default 5%)
            creatorRoyalty: 200,       // Creator royalty (weight, default 2%)
            lastRecalcBlock: 0,
            activeSieges: [],
            resources: [],
            createdBlock: 0
        };
    }

    /**
     * Initialize all territories
     * @param {number} blockNum
     * @returns {Object} territory map by regionId
     */
    function initTerritories(blockNum) {
        var territories = {};
        for (var regionId in TERRITORY_ANCHORS) {
            if (TERRITORY_ANCHORS.hasOwnProperty(regionId)) {
                var t = createTerritory(regionId);
                t.createdBlock = blockNum;
                territories[regionId] = t;
            }
        }
        return territories;
    }

    /**
     * Calculate which guild controls a territory
     * Control = guild with the most total SHARES delegated to territory anchor
     * @param {Object} territory
     * @returns {string|null} controlling guild ID
     */
    function calculateControl(territory) {
        if (!territory || !territory.delegations) return null;

        var maxShares = 0;
        var controllerGuild = null;

        for (var guildId in territory.delegations) {
            if (territory.delegations.hasOwnProperty(guildId)) {
                var shares = territory.delegations[guildId] | 0;
                if (shares > maxShares) {
                    maxShares = shares;
                    controllerGuild = guildId;
                }
            }
        }

        return controllerGuild;
    }

    /**
     * Recalculate territory control (called every RECALC_INTERVAL blocks)
     * @param {Object} territory
     * @param {number} blockNum
     * @returns {Object} {changed: boolean, oldController, newController}
     */
    function recalculateControl(territory, blockNum) {
        if (!territory) return { changed: false };

        var oldController = territory.controllerGuild;
        var newController = calculateControl(territory);

        territory.controllerGuild = newController;
        territory.lastRecalcBlock = blockNum;

        if (newController && newController !== oldController) {
            territory.controllerSince = blockNum;
        }

        return {
            changed: oldController !== newController,
            oldController: oldController,
            newController: newController
        };
    }

    /**
     * Update guild delegation to a territory
     * @param {Object} territory
     * @param {string} guildId
     * @param {number} totalShares - integer (sum of all guild members' delegations)
     */
    function updateDelegation(territory, guildId, totalShares) {
        if (!territory) return;
        totalShares = Math.max(0, totalShares | 0);
        if (totalShares === 0) {
            delete territory.delegations[guildId];
        } else {
            territory.delegations[guildId] = totalShares;
        }
    }

    /**
     * Declare a siege on a territory
     * @param {string} regionId
     * @param {string} attackerGuildId
     * @param {Object} territory
     * @param {number} blockNum
     * @returns {Object|null} siege object
     */
    function declareSiege(regionId, attackerGuildId, territory, blockNum) {
        if (!territory) return null;
        // Cannot siege if already besieging
        for (var i = 0; i < territory.activeSieges.length; i++) {
            if (territory.activeSieges[i].attackerGuild === attackerGuildId &&
                territory.activeSieges[i].state === SIEGE_STATE.ACTIVE) {
                return null; // Already sieging
            }
        }

        var siege = {
            ref: 'siege_' + regionId + '_' + attackerGuildId + '_' + blockNum,
            regionId: regionId,
            attackerGuild: attackerGuildId,
            defenderGuild: territory.controllerGuild,
            startBlock: blockNum,
            endBlock: blockNum + SIEGE_DURATION,
            state: SIEGE_STATE.ACTIVE,
            attackPower: 0,    // Accumulated attack power (integer)
            defensePower: 0,   // Accumulated defense power (integer)
            contributions: {}  // {account: power}
        };

        territory.activeSieges.push(siege);
        return siege;
    }

    /**
     * Contribute to an active siege
     * @param {Object} territory
     * @param {string} siegeRef
     * @param {string} account
     * @param {number} power - integer power contribution
     * @param {boolean} isAttacker - true for attacker, false for defender
     * @returns {boolean}
     */
    function contributeSiege(territory, siegeRef, account, power, isAttacker) {
        if (!territory) return false;
        power = Math.max(0, power | 0);

        for (var i = 0; i < territory.activeSieges.length; i++) {
            var siege = territory.activeSieges[i];
            if (siege.ref === siegeRef && siege.state === SIEGE_STATE.ACTIVE) {
                if (isAttacker) {
                    siege.attackPower += power;
                } else {
                    siege.defensePower += power;
                }
                siege.contributions[account] = (siege.contributions[account] || 0) + power;
                return true;
            }
        }
        return false;
    }

    /**
     * Resolve a siege (check if it's over and determine winner)
     * @param {Object} territory
     * @param {string} siegeRef
     * @param {number} blockNum
     * @returns {Object|null} {winner: 'attacker'|'defender', siege}
     */
    function resolveSiege(territory, siegeRef, blockNum) {
        if (!territory) return null;

        for (var i = 0; i < territory.activeSieges.length; i++) {
            var siege = territory.activeSieges[i];
            if (siege.ref === siegeRef && siege.state === SIEGE_STATE.ACTIVE) {
                if (blockNum < siege.endBlock) return null; // Not yet

                var result;
                if (siege.attackPower > siege.defensePower) {
                    siege.state = SIEGE_STATE.RESOLVED;
                    territory.controllerGuild = siege.attackerGuild;
                    territory.controllerSince = blockNum;
                    result = { winner: 'attacker', siege: siege };
                } else {
                    siege.state = SIEGE_STATE.FAILED;
                    result = { winner: 'defender', siege: siege };
                }
                return result;
            }
        }
        return null;
    }

    /**
     * Check and resolve all expired sieges
     * @param {Object} territory
     * @param {number} blockNum
     * @returns {Array} resolved siege results
     */
    function checkSiegeExpiry(territory, blockNum) {
        if (!territory) return [];
        var results = [];

        for (var i = 0; i < territory.activeSieges.length; i++) {
            var siege = territory.activeSieges[i];
            if (siege.state === SIEGE_STATE.ACTIVE && blockNum >= siege.endBlock) {
                var result = resolveSiege(territory, siege.ref, blockNum);
                if (result) results.push(result);
            }
        }
        return results;
    }

    /**
     * Get territory benefits for an account
     * @param {Object} territory
     * @param {string} guildId - the account's guild
     * @returns {Object} {homeBonus, resourceMult, safeBanking, tax}
     */
    function getTerritoryBenefits(territory, guildId) {
        var benefits = {
            homeBonus: 0,
            resourceMult: 1000,
            safeBanking: false,
            tax: 0
        };

        if (!territory || !territory.controllerGuild) return benefits;

        if (territory.controllerGuild === guildId) {
            // Home territory bonuses
            benefits.homeBonus = BENEFITS.HOME_STAT_BONUS;
            benefits.resourceMult = BENEFITS.RESOURCE_SPAWN_MULT;
            benefits.safeBanking = true;
            benefits.tax = 0; // No tax for controller
        } else {
            // Visitor tax
            benefits.tax = territory.tax;
        }

        return benefits;
    }

    /**
     * Get all active sieges across all territories
     * @param {Object} territories - worldState.territories
     * @returns {Array}
     */
    function getAllActiveSieges(territories) {
        var sieges = [];
        for (var regionId in territories) {
            if (territories.hasOwnProperty(regionId)) {
                var t = territories[regionId];
                for (var i = 0; i < t.activeSieges.length; i++) {
                    if (t.activeSieges[i].state === SIEGE_STATE.ACTIVE) {
                        sieges.push(t.activeSieges[i]);
                    }
                }
            }
        }
        return sieges;
    }

    /**
     * Check if territories need recalculation
     * @param {Object} territories
     * @param {number} blockNum
     * @returns {boolean}
     */
    function needsRecalculation(territories, blockNum) {
        for (var regionId in territories) {
            if (territories.hasOwnProperty(regionId)) {
                if (blockNum - territories[regionId].lastRecalcBlock >= RECALC_INTERVAL) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Recalculate all territories that need it
     * @param {Object} territories
     * @param {number} blockNum
     * @returns {Array} list of control change events
     */
    function recalculateAll(territories, blockNum) {
        var events = [];
        for (var regionId in territories) {
            if (territories.hasOwnProperty(regionId)) {
                var t = territories[regionId];
                if (blockNum - t.lastRecalcBlock >= RECALC_INTERVAL) {
                    var result = recalculateControl(t, blockNum);
                    if (result.changed) {
                        events.push({
                            type: 'territory_control_changed',
                            regionId: regionId,
                            oldController: result.oldController,
                            newController: result.newController,
                            blockNum: blockNum
                        });
                    }
                    // Also check siege expiry
                    var siegeResults = checkSiegeExpiry(t, blockNum);
                    for (var i = 0; i < siegeResults.length; i++) {
                        events.push({
                            type: 'siege_resolved',
                            regionId: regionId,
                            winner: siegeResults[i].winner,
                            siege: siegeResults[i].siege,
                            blockNum: blockNum
                        });
                    }
                }
            }
        }
        return events;
    }

    /**
     * Get territories controlled by a guild
     * @param {Object} territories
     * @param {string} guildId
     * @returns {Array} regionIds
     */
    function getGuildTerritories(territories, guildId) {
        var result = [];
        for (var regionId in territories) {
            if (territories.hasOwnProperty(regionId) &&
                territories[regionId].controllerGuild === guildId) {
                result.push(regionId);
            }
        }
        return result;
    }

    return {
        RECALC_INTERVAL: RECALC_INTERVAL,
        SIEGE_DURATION: SIEGE_DURATION,
        BENEFITS: BENEFITS,
        SIEGE_STATE: SIEGE_STATE,
        TERRITORY_ANCHORS: TERRITORY_ANCHORS,
        createTerritory: createTerritory,
        initTerritories: initTerritories,
        calculateControl: calculateControl,
        recalculateControl: recalculateControl,
        updateDelegation: updateDelegation,
        declareSiege: declareSiege,
        contributeSiege: contributeSiege,
        resolveSiege: resolveSiege,
        checkSiegeExpiry: checkSiegeExpiry,
        getTerritoryBenefits: getTerritoryBenefits,
        getAllActiveSieges: getAllActiveSieges,
        needsRecalculation: needsRecalculation,
        recalculateAll: recalculateAll,
        getGuildTerritories: getGuildTerritories
    };
})();
