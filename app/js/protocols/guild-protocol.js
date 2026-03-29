/**
 * Viz Magic — Guild Protocol Actions
 * Create and parse guild/territory/siege protocol messages
 * for broadcast via viz.broadcast.custom with VM protocol.
 */
var GuildProtocol = (function() {
    'use strict';

    var cfg = VizMagicConfig;
    var AT = cfg.ACTION_TYPES;

    // --- Guild Actions ---

    /**
     * Create guild.create action
     * @param {string} guildId
     * @param {string} name
     * @param {string} tag - 2-5 char tag
     * @param {string} school - magic school or null
     * @param {string} motto
     * @param {Object} charter - {tithe_pct, membership, min_shares}
     * @returns {Object}
     */
    function createGuildAction(guildId, name, tag, school, motto, charter) {
        return {
            t: AT.GUILD_CREATE,
            d: {
                id: guildId,
                name: name,
                tag: tag,
                school: school || '',
                motto: motto || '',
                charter: charter || {}
            }
        };
    }

    /**
     * Create guild.invite action
     * @param {string} guildId
     * @param {string} target - account to invite
     * @returns {Object}
     */
    function createGuildInviteAction(guildId, target) {
        return {
            t: AT.GUILD_INVITE,
            d: {
                guild_id: guildId,
                target: target
            }
        };
    }

    /**
     * Create guild.accept action
     * @param {string} guildId
     * @returns {Object}
     */
    function createGuildAcceptAction(guildId) {
        return {
            t: AT.GUILD_ACCEPT,
            d: {
                guild_id: guildId
            }
        };
    }

    /**
     * Create guild.leave action
     * @param {string} guildId
     * @returns {Object}
     */
    function createGuildLeaveAction(guildId) {
        return {
            t: AT.GUILD_LEAVE,
            d: {
                guild_id: guildId
            }
        };
    }

    /**
     * Create guild.promote action
     * @param {string} guildId
     * @param {string} target
     * @param {string} rank
     * @returns {Object}
     */
    function createGuildPromoteAction(guildId, target, rank) {
        return {
            t: AT.GUILD_PROMOTE,
            d: {
                guild_id: guildId,
                target: target,
                rank: rank
            }
        };
    }

    /**
     * Create guild.war action
     * @param {string} attackerGuildId
     * @param {string} defenderGuildId
     * @param {number} durationBlocks
     * @param {Object} terms
     * @returns {Object}
     */
    function createGuildWarAction(attackerGuildId, defenderGuildId, durationBlocks, terms) {
        return {
            t: AT.GUILD_WAR,
            d: {
                attacker: attackerGuildId,
                defender: defenderGuildId,
                duration_blocks: durationBlocks | 0,
                terms: terms || {}
            }
        };
    }

    /**
     * Create guild.peace action
     * @param {string} warRef
     * @returns {Object}
     */
    function createGuildPeaceAction(warRef) {
        return {
            t: AT.GUILD_PEACE,
            d: {
                war_ref: warRef
            }
        };
    }

    // --- Siege Actions ---

    /**
     * Create siege.declare action
     * @param {string} territoryId - region ID
     * @param {string} guildId
     * @returns {Object}
     */
    function createSiegeDeclareAction(territoryId, guildId) {
        return {
            t: AT.SIEGE_DECLARE,
            d: {
                territory_id: territoryId,
                guild_id: guildId
            }
        };
    }

    /**
     * Create siege.commit action
     * @param {string} siegeRef
     * @param {number} energy - mana to commit
     * @returns {Object}
     */
    function createSiegeCommitAction(siegeRef, energy) {
        return {
            t: AT.SIEGE_COMMIT,
            d: {
                siege_ref: siegeRef,
                energy: energy | 0
            }
        };
    }

    /**
     * Create territory.claim action
     * @param {string} territoryId
     * @param {string} siegeRef
     * @returns {Object}
     */
    function createTerritoryClaimAction(territoryId, siegeRef) {
        return {
            t: AT.TERRITORY_CLAIM,
            d: {
                territory_id: territoryId,
                siege_ref: siegeRef
            }
        };
    }

    // --- Broadcast Helpers ---

    /**
     * Broadcast a guild action via VizBroadcast.gameAction
     * @param {Object} actionData - {t, d} object
     * @param {Function} callback
     */
    function broadcastGuildAction(actionData, callback) {
        if (typeof VizBroadcast !== 'undefined') {
            VizBroadcast.gameAction(actionData, callback);
        } else {
            callback(new Error('VizBroadcast not available'));
        }
    }

    /**
     * Broadcast guild creation
     */
    function broadcastCreateGuild(guildId, name, tag, school, motto, charter, callback) {
        var action = createGuildAction(guildId, name, tag, school, motto, charter);
        broadcastGuildAction(action, callback);
    }

    /**
     * Broadcast guild join (accept)
     */
    function broadcastJoinGuild(guildId, callback) {
        var action = createGuildAcceptAction(guildId);
        broadcastGuildAction(action, callback);
    }

    /**
     * Broadcast guild leave
     */
    function broadcastLeaveGuild(guildId, callback) {
        var action = createGuildLeaveAction(guildId);
        broadcastGuildAction(action, callback);
    }

    /**
     * Broadcast guild invite
     */
    function broadcastInviteToGuild(guildId, target, callback) {
        var action = createGuildInviteAction(guildId, target);
        broadcastGuildAction(action, callback);
    }

    /**
     * Broadcast rank promotion
     */
    function broadcastPromote(guildId, target, rank, callback) {
        var action = createGuildPromoteAction(guildId, target, rank);
        broadcastGuildAction(action, callback);
    }

    /**
     * Broadcast war declaration
     */
    function broadcastDeclareWar(attackerGuildId, defenderGuildId, durationBlocks, terms, callback) {
        var action = createGuildWarAction(attackerGuildId, defenderGuildId, durationBlocks, terms);
        broadcastGuildAction(action, callback);
    }

    /**
     * Broadcast peace
     */
    function broadcastDeclarePeace(warRef, callback) {
        var action = createGuildPeaceAction(warRef);
        broadcastGuildAction(action, callback);
    }

    /**
     * Broadcast siege declaration
     */
    function broadcastDeclareSiege(territoryId, guildId, callback) {
        var action = createSiegeDeclareAction(territoryId, guildId);
        broadcastGuildAction(action, callback);
    }

    /**
     * Broadcast siege contribution
     */
    function broadcastSiegeCommit(siegeRef, energy, callback) {
        var action = createSiegeCommitAction(siegeRef, energy);
        broadcastGuildAction(action, callback);
    }

    /**
     * Broadcast territory claim
     */
    function broadcastTerritoryClaim(territoryId, siegeRef, callback) {
        var action = createTerritoryClaimAction(territoryId, siegeRef);
        broadcastGuildAction(action, callback);
    }

    return {
        // Action creators
        createGuildAction: createGuildAction,
        createGuildInviteAction: createGuildInviteAction,
        createGuildAcceptAction: createGuildAcceptAction,
        createGuildLeaveAction: createGuildLeaveAction,
        createGuildPromoteAction: createGuildPromoteAction,
        createGuildWarAction: createGuildWarAction,
        createGuildPeaceAction: createGuildPeaceAction,
        createSiegeDeclareAction: createSiegeDeclareAction,
        createSiegeCommitAction: createSiegeCommitAction,
        createTerritoryClaimAction: createTerritoryClaimAction,

        // Broadcast wrappers
        broadcastGuildAction: broadcastGuildAction,
        broadcastCreateGuild: broadcastCreateGuild,
        broadcastJoinGuild: broadcastJoinGuild,
        broadcastLeaveGuild: broadcastLeaveGuild,
        broadcastInviteToGuild: broadcastInviteToGuild,
        broadcastPromote: broadcastPromote,
        broadcastDeclareWar: broadcastDeclareWar,
        broadcastDeclarePeace: broadcastDeclarePeace,
        broadcastDeclareSiege: broadcastDeclareSiege,
        broadcastSiegeCommit: broadcastSiegeCommit,
        broadcastTerritoryClaim: broadcastTerritoryClaim
    };
})();
