/**
 * Viz Magic — World Boss System (Aether Dragon)
 * Community raid boss that spawns periodically.
 * Players attack by awarding the boss NPC account with hunt-tagged inscriptions.
 */
var WorldBoss = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /** Boss NPC account on VIZ chain (receives mana awards from attacks) */
    var BOSS_ACCOUNT = 'denis-skripnik';

    /** Boss constants */
    var BASE_HP        = 100000;
    var HP_PER_PLAYER  = 5000;     // Scales with active players
    var BOSS_WINDOW    = 28800;    // ~1 day in blocks
    var LOOT_POOL_XP   = 50000;
    var COUNTERATTACK_BASE = 50;   // Base damage per counterattack

    /** Active boss state (in-memory, part of worldState) */
    var defaultBossState = {
        active: false,
        spawnBlock: 0,
        endBlock: 0,
        maxHp: BASE_HP,
        currentHp: BASE_HP,
        totalDamage: 0,
        contributions: {},   // account → {damage, attacks, lastAttackBlock}
        counterattackLog: [],
        defeated: false,
        defeatedBlock: 0,
        lootDistributed: false
    };

    /**
     * Spawn a new world boss encounter.
     * @param {number} blockNum
     * @param {number} activePlayerCount
     * @returns {Object} boss state
     */
    function spawnBoss(blockNum, activePlayerCount, author) {
        var count = activePlayerCount || 1;
        var scaledHp = BASE_HP + (count * HP_PER_PLAYER);
        return {
            active: true,
            author: author || BOSS_ACCOUNT,  // Developer who created this boss — receives awards
            spawnBlock: blockNum,
            endBlock: blockNum + BOSS_WINDOW,
            maxHp: scaledHp,
            currentHp: scaledHp,
            totalDamage: 0,
            contributions: {},
            counterattackLog: [],
            defeated: false,
            defeatedBlock: 0,
            lootDistributed: false
        };
    }

    /**
     * Process a player attack on the boss.
     * @param {Object} bossState
     * @param {string} account - attacking player
     * @param {number} damage - calculated damage
     * @param {string} spell - spell used
     * @param {number} blockNum
     * @param {string} blockHash
     * @returns {Object} {success, damage, counterDamage, bossDefeated}
     */
    function attackBoss(bossState, account, damage, spell, blockNum, blockHash) {
        if (!bossState || !bossState.active || bossState.defeated) {
            return { success: false, error: 'boss_not_active' };
        }
        if (blockNum > bossState.endBlock) {
            return { success: false, error: 'boss_window_expired' };
        }

        // Apply damage
        var actualDamage = Math.max(1, damage | 0);
        bossState.totalDamage += actualDamage;
        bossState.currentHp = Math.max(0, bossState.currentHp - actualDamage);

        // Track contribution
        if (!bossState.contributions[account]) {
            bossState.contributions[account] = { damage: 0, attacks: 0, lastAttackBlock: 0 };
        }
        bossState.contributions[account].damage += actualDamage;
        bossState.contributions[account].attacks += 1;
        bossState.contributions[account].lastAttackBlock = blockNum;

        // Process counterattack (deterministic from block hash)
        var counterDamage = processCounterattack(bossState, account, blockNum, blockHash);

        // Check defeat
        var bossDefeated = false;
        if (bossState.currentHp <= 0) {
            bossDefeated = true;
            bossState.defeated = true;
            bossState.defeatedBlock = blockNum;
        }

        return {
            success: true,
            damage: actualDamage,
            counterDamage: counterDamage,
            bossDefeated: bossDefeated,
            bossHpRemaining: bossState.currentHp
        };
    }

    /**
     * Process boss counterattack (deterministic from block hash).
     * @param {Object} bossState
     * @param {string} account
     * @param {number} blockNum
     * @param {string} blockHash
     * @returns {number} counter damage dealt to player
     */
    function processCounterattack(bossState, account, blockNum, blockHash) {
        // Deterministic pseudo-random from block hash + account
        var seed = _hashSeed(blockHash, account);
        var counterDamage = COUNTERATTACK_BASE + (seed % 100);

        // Boss rage: more damage when low HP
        var hpPercent = (bossState.currentHp / bossState.maxHp) * 100;
        if (hpPercent < 25) {
            counterDamage = Math.floor(counterDamage * 1.5);
        } else if (hpPercent < 50) {
            counterDamage = Math.floor(counterDamage * 1.2);
        }

        bossState.counterattackLog.push({
            target: account,
            damage: counterDamage,
            blockNum: blockNum
        });

        // Keep log trimmed
        if (bossState.counterattackLog.length > 50) {
            bossState.counterattackLog = bossState.counterattackLog.slice(-50);
        }

        return counterDamage;
    }

    /**
     * Defeat the boss and prepare loot distribution.
     * @param {Object} bossState
     * @returns {Object} defeat summary
     */
    function defeatBoss(bossState) {
        if (!bossState || !bossState.defeated) return null;

        var totalContributors = Object.keys(bossState.contributions).length;
        return {
            defeatedBlock: bossState.defeatedBlock,
            totalDamage: bossState.totalDamage,
            totalContributors: totalContributors,
            maxHp: bossState.maxHp
        };
    }

    /**
     * Calculate loot distribution proportional to damage.
     * @param {Object} bossState
     * @returns {Array} [{account, damage, share, xpReward, items}]
     */
    function distributeLoot(bossState) {
        if (!bossState || !bossState.defeated || bossState.lootDistributed) return [];

        var distributions = [];
        var totalDmg = bossState.totalDamage || 1;

        for (var account in bossState.contributions) {
            if (!bossState.contributions.hasOwnProperty(account)) continue;
            var contrib = bossState.contributions[account];
            var share = contrib.damage / totalDmg;
            var xpReward = Math.floor(LOOT_POOL_XP * share);

            // Items based on contribution tier
            var items = [];
            if (share >= 0.1) {
                items.push({ type: 'aether_ore', rarity: 3 });   // epic
            }
            if (share >= 0.05) {
                items.push({ type: 'echo_shards', rarity: 2 });  // rare
            }
            if (share >= 0.01) {
                items.push({ type: 'fire_dust', rarity: 1 });    // uncommon
            }

            distributions.push({
                account: account,
                damage: contrib.damage,
                attacks: contrib.attacks,
                share: share,
                sharePercent: Math.floor(share * 10000) / 100,
                xpReward: xpReward,
                items: items
            });
        }

        // Sort by damage descending
        distributions.sort(function(a, b) { return b.damage - a.damage; });

        bossState.lootDistributed = true;
        return distributions;
    }

    /**
     * Get boss status for UI display.
     * @param {Object} bossState
     * @param {string} account - current player
     * @param {number} blockNum
     * @returns {Object}
     */
    function getBossStatus(bossState, account, blockNum) {
        if (!bossState || !bossState.active) {
            return { active: false };
        }

        var myContrib = bossState.contributions[account] || { damage: 0, attacks: 0 };
        var totalDmg = bossState.totalDamage || 1;
        var myShare = myContrib.damage / totalDmg;

        // Top contributors
        var leaderboard = [];
        for (var acc in bossState.contributions) {
            if (!bossState.contributions.hasOwnProperty(acc)) continue;
            leaderboard.push({
                account: acc,
                damage: bossState.contributions[acc].damage,
                attacks: bossState.contributions[acc].attacks
            });
        }
        leaderboard.sort(function(a, b) { return b.damage - a.damage; });
        leaderboard = leaderboard.slice(0, 10);

        return {
            active: true,
            defeated: bossState.defeated,
            maxHp: bossState.maxHp,
            currentHp: bossState.currentHp,
            totalDamage: bossState.totalDamage,
            hpPercent: Math.floor((bossState.currentHp / bossState.maxHp) * 100),
            blocksRemaining: Math.max(0, bossState.endBlock - blockNum),
            myDamage: myContrib.damage,
            myAttacks: myContrib.attacks,
            mySharePercent: Math.floor(myShare * 10000) / 100,
            leaderboard: leaderboard,
            recentCounterattacks: bossState.counterattackLog.slice(-5),
            contributors: Object.keys(bossState.contributions).length
        };
    }

    /**
     * Simple hash seed from block hash + string.
     * @param {string} hash
     * @param {string} str
     * @returns {number}
     */
    function _hashSeed(hash, str) {
        var combined = (hash || '0000') + str;
        var h = 0;
        for (var i = 0; i < combined.length; i++) {
            h = ((h << 5) - h + combined.charCodeAt(i)) | 0;
        }
        return Math.abs(h);
    }

    /**
     * Get default empty boss state.
     */
    function getDefaultState() {
        return JSON.parse(JSON.stringify(defaultBossState));
    }

    return {
        BOSS_ACCOUNT: BOSS_ACCOUNT,
        BASE_HP: BASE_HP,
        spawnBoss: spawnBoss,
        attackBoss: attackBoss,
        processCounterattack: processCounterattack,
        defeatBoss: defeatBoss,
        distributeLoot: distributeLoot,
        getBossStatus: getBossStatus,
        getDefaultState: getDefaultState
    };
})();
