/**
 * Viz Magic — Guild System Engine
 * Guild creation, membership via SHARES delegation, ranks, treasury,
 * guild wars, cooperative quests, and patronage.
 */
var GuildSystem = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /** Guild ranks ordered by authority */
    var RANKS = {
        FOUNDER:       'founder',
        ARCHON:        'archon',
        WARDEN:        'warden',
        QUARTERMASTER: 'quartermaster',
        CHRONICLER:    'chronicler',
        INITIATE:      'initiate'
    };

    /** Rank authority level (higher = more power) */
    var RANK_AUTHORITY = {
        founder:       6,
        archon:        5,
        warden:        4,
        quartermaster: 3,
        chronicler:    2,
        initiate:      1
    };

    /** Rank display icons */
    var RANK_ICONS = {
        founder:       '\uD83D\uDC51',  // 👑
        archon:        '\u2B50',          // ⭐
        warden:        '\uD83D\uDEE1\uFE0F', // 🛡️
        quartermaster: '\uD83D\uDCB0',   // 💰
        chronicler:    '\uD83D\uDCDC',   // 📜
        initiate:      '\uD83E\uDDD9'    // 🧙
    };

    /** Membership types */
    var MEMBERSHIP = {
        OPEN:       'open',       // anyone can join
        APPROVAL:   'approval',   // officer must approve
        INVITE:     'invite'      // invite only
    };

    /** Guild war states */
    var WAR_STATE = {
        ACTIVE:     'active',
        PEACE:      'peace',
        EXPIRED:    'expired'
    };

    /** Default charter */
    var DEFAULT_CHARTER = {
        tithe_pct: 1000,      // 10% (weight out of 10000)
        membership: MEMBERSHIP.OPEN,
        min_shares: 0          // Minimum SHARES delegation to join (integer)
    };

    /**
     * Create a new guild
     * @param {string} guildId - unique guild identifier
     * @param {string} founderAccount - VIZ account of founder
     * @param {Object} data - {name, tag, school, motto, charter}
     * @param {number} blockNum - creation block
     * @returns {Object|null} guild object or null if invalid
     */
    function createGuild(guildId, founderAccount, data, blockNum) {
        if (!guildId || !founderAccount || !data.name) return null;
        if (!data.tag || data.tag.length < 2 || data.tag.length > 5) return null;

        var charter = {};
        charter.tithe_pct = _clampInt(data.charter && data.charter.tithe_pct || DEFAULT_CHARTER.tithe_pct, 0, 5000);
        charter.membership = data.charter && data.charter.membership || DEFAULT_CHARTER.membership;
        charter.min_shares = _clampInt(data.charter && data.charter.min_shares || DEFAULT_CHARTER.min_shares, 0, 999999999);

        return {
            id: guildId,
            name: data.name,
            tag: data.tag.toUpperCase(),
            school: data.school || null,
            motto: data.motto || '',
            charter: charter,
            founder: founderAccount,
            createdBlock: blockNum,
            level: 1,
            xp: 0,
            members: _createInitialMembers(founderAccount, blockNum),
            invites: {},
            wars: [],
            quests: [],
            announcements: [],
            totalDelegated: 0   // Sum of all member delegations (integer, micro-SHARES)
        };
    }

    /**
     * Create initial members object with founder
     */
    function _createInitialMembers(founderAccount, blockNum) {
        var members = {};
        members[founderAccount] = {
            account: founderAccount,
            rank: RANKS.FOUNDER,
            joinedBlock: blockNum,
            delegatedShares: 0,
            pvpWins: 0,
            pvpLosses: 0,
            questContributions: 0
        };
        return members;
    }

    /**
     * Add invite to guild
     * @param {Object} guild - guild state
     * @param {string} inviter - who invited
     * @param {string} target - who is invited
     * @param {number} blockNum
     * @returns {boolean}
     */
    function addInvite(guild, inviter, target, blockNum) {
        if (!guild || !guild.members[inviter]) return false;
        if (RANK_AUTHORITY[guild.members[inviter].rank] < RANK_AUTHORITY[RANKS.WARDEN]) return false;
        if (guild.members[target]) return false; // already a member

        guild.invites[target] = {
            inviter: inviter,
            block: blockNum
        };
        return true;
    }

    /**
     * Join a guild (accept invite or open membership)
     * @param {Object} guild - guild state
     * @param {string} account - joining account
     * @param {number} blockNum
     * @returns {boolean}
     */
    function joinGuild(guild, account, blockNum) {
        if (!guild || guild.members[account]) return false;

        // Check membership rules
        if (guild.charter.membership === MEMBERSHIP.INVITE) {
            if (!guild.invites[account]) return false;
        }

        guild.members[account] = {
            account: account,
            rank: RANKS.INITIATE,
            joinedBlock: blockNum,
            delegatedShares: 0,
            pvpWins: 0,
            pvpLosses: 0,
            questContributions: 0
        };

        // Remove invite if existed
        delete guild.invites[account];
        return true;
    }

    /**
     * Leave a guild
     * @param {Object} guild - guild state
     * @param {string} account - leaving account
     * @returns {boolean}
     */
    function leaveGuild(guild, account) {
        if (!guild || !guild.members[account]) return false;
        if (guild.members[account].rank === RANKS.FOUNDER) return false; // founder cannot leave

        var delegated = guild.members[account].delegatedShares || 0;
        guild.totalDelegated = Math.max(0, guild.totalDelegated - delegated);
        delete guild.members[account];
        return true;
    }

    /**
     * Promote (or demote) a member's rank
     * @param {Object} guild - guild state
     * @param {string} promoter - who is promoting
     * @param {string} target - who is being promoted
     * @param {string} newRank - new rank
     * @returns {boolean}
     */
    function promoteRank(guild, promoter, target, newRank) {
        if (!guild || !guild.members[promoter] || !guild.members[target]) return false;
        if (!RANK_AUTHORITY[newRank]) return false;

        var promoterAuthority = RANK_AUTHORITY[guild.members[promoter].rank];
        var targetCurrentAuth = RANK_AUTHORITY[guild.members[target].rank];
        var newAuthority = RANK_AUTHORITY[newRank];

        // Can only promote to rank below your own
        if (newAuthority >= promoterAuthority) return false;
        // Cannot promote someone with equal or higher rank (unless founder)
        if (targetCurrentAuth >= promoterAuthority && guild.members[promoter].rank !== RANKS.FOUNDER) return false;
        // Cannot assign founder rank
        if (newRank === RANKS.FOUNDER) return false;

        guild.members[target].rank = newRank;
        return true;
    }

    /**
     * Update member delegation amount
     * @param {Object} guild
     * @param {string} account
     * @param {number} sharesAmount - integer (micro-SHARES)
     */
    function updateDelegation(guild, account, sharesAmount) {
        if (!guild || !guild.members[account]) return;
        var old = guild.members[account].delegatedShares || 0;
        guild.members[account].delegatedShares = Math.max(0, sharesAmount | 0);
        guild.totalDelegated = Math.max(0, guild.totalDelegated - old + (sharesAmount | 0));
    }

    /**
     * Declare war between guilds
     * @param {Object} attackerGuild
     * @param {Object} defenderGuild
     * @param {string} declarer - account declaring
     * @param {number} durationBlocks
     * @param {Object} terms - optional war terms
     * @param {number} blockNum
     * @returns {Object|null} war object
     */
    function declareWar(attackerGuild, defenderGuild, declarer, durationBlocks, terms, blockNum) {
        if (!attackerGuild || !defenderGuild) return null;
        if (!attackerGuild.members[declarer]) return null;
        if (RANK_AUTHORITY[attackerGuild.members[declarer].rank] < RANK_AUTHORITY[RANKS.ARCHON]) return null;

        durationBlocks = _clampInt(durationBlocks, 28800, 604800); // 1-7 days

        var war = {
            ref: attackerGuild.id + '_vs_' + defenderGuild.id + '_' + blockNum,
            attacker: attackerGuild.id,
            defender: defenderGuild.id,
            declarer: declarer,
            startBlock: blockNum,
            endBlock: blockNum + durationBlocks,
            terms: terms || {},
            state: WAR_STATE.ACTIVE,
            score: { attacker: 0, defender: 0 }
        };

        attackerGuild.wars.push(war);
        defenderGuild.wars.push(war);

        return war;
    }

    /**
     * Record a PvP result for guild war scoring
     * @param {Object} guild - the guild state
     * @param {string} warRef - war reference
     * @param {string} winnerSide - 'attacker' or 'defender'
     * @param {number} points - integer points
     */
    function scoreWarPvP(guild, warRef, winnerSide, points) {
        if (!guild) return;
        for (var i = 0; i < guild.wars.length; i++) {
            if (guild.wars[i].ref === warRef && guild.wars[i].state === WAR_STATE.ACTIVE) {
                guild.wars[i].score[winnerSide] = (guild.wars[i].score[winnerSide] || 0) + (points | 0);
                break;
            }
        }
    }

    /**
     * Resolve peace for a war
     * @param {Object} guild
     * @param {string} warRef
     * @returns {boolean}
     */
    function declarePeace(guild, warRef) {
        if (!guild) return false;
        for (var i = 0; i < guild.wars.length; i++) {
            if (guild.wars[i].ref === warRef && guild.wars[i].state === WAR_STATE.ACTIVE) {
                guild.wars[i].state = WAR_STATE.PEACE;
                return true;
            }
        }
        return false;
    }

    /**
     * Check and expire wars past their endBlock
     * @param {Object} guild
     * @param {number} blockNum
     */
    function checkWarExpiry(guild, blockNum) {
        if (!guild) return;
        for (var i = 0; i < guild.wars.length; i++) {
            var war = guild.wars[i];
            if (war.state === WAR_STATE.ACTIVE && blockNum >= war.endBlock) {
                war.state = WAR_STATE.EXPIRED;
            }
        }
    }

    /**
     * Add or update a guild quest
     * @param {Object} guild
     * @param {Object} questData - {id, name, type, target, progress, reward}
     * @param {number} blockNum
     * @returns {boolean}
     */
    function addQuest(guild, questData, blockNum) {
        if (!guild || !questData.id) return false;

        // Check if quest already exists
        for (var i = 0; i < guild.quests.length; i++) {
            if (guild.quests[i].id === questData.id) return false;
        }

        guild.quests.push({
            id: questData.id,
            name: questData.name || '',
            type: questData.type || 'hunt',
            target: questData.target | 0,
            progress: 0,
            reward: questData.reward || {},
            startBlock: blockNum,
            completed: false,
            contributors: {}
        });
        return true;
    }

    /**
     * Contribute to a guild quest
     * @param {Object} guild
     * @param {string} questId
     * @param {string} account
     * @param {number} amount - integer contribution
     * @returns {boolean} true if quest completed
     */
    function contributeQuest(guild, questId, account, amount) {
        if (!guild || !guild.members[account]) return false;

        for (var i = 0; i < guild.quests.length; i++) {
            var quest = guild.quests[i];
            if (quest.id === questId && !quest.completed) {
                quest.progress = Math.min(quest.target, quest.progress + (amount | 0));
                quest.contributors[account] = (quest.contributors[account] || 0) + (amount | 0);
                guild.members[account].questContributions += (amount | 0);

                if (quest.progress >= quest.target) {
                    quest.completed = true;
                    _addGuildXp(guild, 100);
                    return true;
                }
                return false;
            }
        }
        return false;
    }

    /**
     * Add XP to guild and check level up
     * @param {Object} guild
     * @param {number} xp - integer
     */
    function _addGuildXp(guild, xp) {
        guild.xp += (xp | 0);
        // Guild level = floor(sqrt(xp / 500)) + 1, capped at 50
        var newLevel = Math.min(50, (Math.floor(Math.sqrt(guild.xp / 500)) + 1) | 0);
        if (newLevel > guild.level) {
            guild.level = newLevel;
        }
    }

    /**
     * Get beneficiaries array for tithe on awards
     * Returns beneficiary structure for use in award operations.
     * @param {Object} guild
     * @returns {Array} [{account, weight}]
     */
    function getTitheBeneficiaries(guild) {
        if (!guild || !guild.charter.tithe_pct || guild.charter.tithe_pct <= 0) return [];
        // Tithe goes to founder account (guild treasury)
        return [{
            account: guild.founder,
            weight: guild.charter.tithe_pct
        }];
    }

    /**
     * Get member count
     * @param {Object} guild
     * @returns {number}
     */
    function getMemberCount(guild) {
        if (!guild || !guild.members) return 0;
        var count = 0;
        for (var key in guild.members) {
            if (guild.members.hasOwnProperty(key)) count++;
        }
        return count;
    }

    /**
     * Get members sorted by rank authority (highest first)
     * @param {Object} guild
     * @returns {Array}
     */
    function getMembersSorted(guild) {
        if (!guild) return [];
        var list = [];
        for (var key in guild.members) {
            if (guild.members.hasOwnProperty(key)) {
                list.push(guild.members[key]);
            }
        }
        list.sort(function(a, b) {
            return (RANK_AUTHORITY[b.rank] || 0) - (RANK_AUTHORITY[a.rank] || 0);
        });
        return list;
    }

    /**
     * Get active wars for a guild
     * @param {Object} guild
     * @returns {Array}
     */
    function getActiveWars(guild) {
        if (!guild) return [];
        var active = [];
        for (var i = 0; i < guild.wars.length; i++) {
            if (guild.wars[i].state === WAR_STATE.ACTIVE) {
                active.push(guild.wars[i]);
            }
        }
        return active;
    }

    /**
     * Check if account is officer (warden+)
     * @param {Object} guild
     * @param {string} account
     * @returns {boolean}
     */
    function isOfficer(guild, account) {
        if (!guild || !guild.members[account]) return false;
        return RANK_AUTHORITY[guild.members[account].rank] >= RANK_AUTHORITY[RANKS.WARDEN];
    }

    /**
     * Get guild of a given account from worldState.guilds
     * @param {Object} guilds - worldState.guilds map
     * @param {string} account
     * @returns {Object|null} guild or null
     */
    function findGuildByMember(guilds, account) {
        for (var gid in guilds) {
            if (guilds.hasOwnProperty(gid) && guilds[gid].members[account]) {
                return guilds[gid];
            }
        }
        return null;
    }

    /**
     * Clamp integer value
     */
    function _clampInt(val, min, max) {
        val = val | 0;
        if (val < min) return min;
        if (val > max) return max;
        return val;
    }

    return {
        RANKS: RANKS,
        RANK_AUTHORITY: RANK_AUTHORITY,
        RANK_ICONS: RANK_ICONS,
        MEMBERSHIP: MEMBERSHIP,
        WAR_STATE: WAR_STATE,
        DEFAULT_CHARTER: DEFAULT_CHARTER,
        createGuild: createGuild,
        addInvite: addInvite,
        joinGuild: joinGuild,
        leaveGuild: leaveGuild,
        promoteRank: promoteRank,
        updateDelegation: updateDelegation,
        declareWar: declareWar,
        scoreWarPvP: scoreWarPvP,
        declarePeace: declarePeace,
        checkWarExpiry: checkWarExpiry,
        addQuest: addQuest,
        contributeQuest: contributeQuest,
        getTitheBeneficiaries: getTitheBeneficiaries,
        getMemberCount: getMemberCount,
        getMembersSorted: getMembersSorted,
        getActiveWars: getActiveWars,
        isOfficer: isOfficer,
        findGuildByMember: findGuildByMember
    };
})();
