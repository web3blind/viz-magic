/**
 * Viz Magic — Duel State Manager
 * Tracks pending, active, and completed duels in the world state.
 * Called by StateEngine when duel-related VM actions are processed.
 */
var DuelStateManager = (function() {
    'use strict';

    var cfg = VizMagicConfig;
    var AT = cfg.ACTION_TYPES;

    /** Timeout window in blocks: 14400 blocks = ~12 hours */
    var REVEAL_TIMEOUT_BLOCKS = cfg.BLOCK.DUEL_REVEAL_MAX;
    var ACCEPT_TIMEOUT_BLOCKS = cfg.BLOCK.DUEL_ACCEPT_WINDOW;

    /**
     * Duel state storage — attached to world state.
     * Initialized lazily by _ensureState().
     */
    function _ensureState(worldState) {
        if (!worldState.duels) {
            worldState.duels = {
                pending: {},    // challengeRef → duel object (waiting for accept)
                active: {},     // combatRef → duel object (both committed, waiting reveals)
                history: [],    // completed duels
                leaderboard: {} // account → {wins, losses, draws}
            };
        }
        return worldState.duels;
    }

    /**
     * Process a duel-related action from the blockchain.
     * Called by StateEngine.processBlock for challenge/accept/commit/reveal/forfeit.
     *
     * @param {string} sender - account that sent the action
     * @param {Object} action - parsed VM action {type, data}
     * @param {number} blockNum - current block number
     * @param {string} blockHash - current block hash
     * @param {Object} worldState - mutable world state
     * @returns {Array} game events generated
     */
    function processDuelAction(sender, action, blockNum, blockHash, worldState) {
        var duels = _ensureState(worldState);
        var events = [];

        switch (action.type) {
            case AT.CHALLENGE:
                events = _handleChallenge(sender, action.data, blockNum, duels, worldState);
                break;
            case AT.ACCEPT:
                events = _handleAccept(sender, action.data, blockNum, duels, worldState);
                break;
            case AT.COMMIT:
                events = _handleCommit(sender, action.data, blockNum, duels);
                break;
            case AT.REVEAL:
                events = _handleReveal(sender, action.data, blockNum, blockHash, duels, worldState);
                break;
            case AT.FORFEIT:
                events = _handleForfeit(sender, action.data, blockNum, duels, worldState);
                break;
        }

        return events;
    }

    /**
     * Handle a challenge action.
     */
    function _handleChallenge(sender, data, blockNum, duels, worldState) {
        var challengeRef = String(blockNum);

        // Cannot challenge yourself
        if (sender === data.target) return [];

        _ensureCharacterStub(worldState, sender);
        _ensureCharacterStub(worldState, data.target);

        var duel = {
            id: challengeRef,
            challenger: sender,
            target: data.target,
            mode: data.mode || 'best_of_3',
            rounds: data.rounds || 3,
            energyPledgeA: data.energy_pledge || 100,
            energyPledgeB: 0,
            strategyHashA: data.strategy_hash || '',
            strategyHashB: '',
            deadlineBlock: data.deadline_block || (blockNum + ACCEPT_TIMEOUT_BLOCKS),
            createdBlock: blockNum,
            status: 'pending',
            currentRound: 1,
            roundResults: [],
            commits: {},  // round → {A: hash, B: hash}
            reveals: {},  // round → {A: strategy, B: strategy}
            revealDeadline: 0
        };

        duels.pending[challengeRef] = duel;

        return [{
            type: 'duel_challenge',
            account: sender,
            target: data.target,
            challengeRef: challengeRef,
            energyPledge: data.energy_pledge
        }];
    }

    /**
     * Handle an accept action.
     */
    function _handleAccept(sender, data, blockNum, duels, worldState) {
        var challengeRef = String(data.challenge_ref);
        var duel = duels.pending[challengeRef];

        if (!duel) return [];
        if (duel.target !== sender) return [];
        if (blockNum > duel.deadlineBlock) return [];

        _ensureCharacterStub(worldState, duel.challenger);
        _ensureCharacterStub(worldState, duel.target);

        // Move from pending to active
        duel.status = 'active';
        duel.energyPledgeB = data.energy_pledge || 100;
        duel.strategyHashB = data.strategy_hash || '';
        duel.acceptedBlock = blockNum;
        duel.revealDeadline = blockNum + REVEAL_TIMEOUT_BLOCKS;

        // Round 1 commits are the strategy hashes from challenge + accept
        duel.commits[1] = {
            A: duel.strategyHashA,
            B: duel.strategyHashB
        };

        delete duels.pending[challengeRef];
        duels.active[challengeRef] = duel;

        return [{
            type: 'duel_accepted',
            challenger: duel.challenger,
            target: sender,
            combatRef: challengeRef
        }];
    }

    /**
     * Handle a commit action (for rounds 2+).
     */
    function _handleCommit(sender, data, blockNum, duels) {
        var combatRef = String(data.combat_ref);
        var duel = duels.active[combatRef];
        if (!duel) return [];

        var round = data.round;
        if (round < 2 || round > duel.rounds) return [];

        // Determine which player
        var side = null;
        if (sender === duel.challenger) side = 'A';
        else if (sender === duel.target) side = 'B';
        if (!side) return [];

        if (!duel.commits[round]) {
            duel.commits[round] = {};
        }
        duel.commits[round][side] = data.strategy_hash;

        // Update reveal deadline when both commit
        if (duel.commits[round].A && duel.commits[round].B) {
            duel.revealDeadline = blockNum + REVEAL_TIMEOUT_BLOCKS;
        }

        return [{
            type: 'duel_commit',
            account: sender,
            combatRef: combatRef,
            round: round
        }];
    }

    /**
     * Handle a reveal action.
     */
    function _handleReveal(sender, data, blockNum, blockHash, duels, worldState) {
        var combatRef = String(data.combat_ref);
        var duel = duels.active[combatRef];
        if (!duel) return [];

        var round = data.round;
        if (round < 1 || round > duel.rounds) return [];

        var side = null;
        if (sender === duel.challenger) side = 'A';
        else if (sender === duel.target) side = 'B';
        if (!side) return [];

        // Store revealed strategy
        if (!duel.reveals[round]) {
            duel.reveals[round] = {};
        }
        duel.reveals[round][side] = data.strategy;

        var events = [{
            type: 'duel_reveal',
            account: sender,
            combatRef: combatRef,
            round: round,
            intent: data.strategy ? data.strategy.intent : ''
        }];

        // Check if both reveals are in for this round
        if (duel.reveals[round].A && duel.reveals[round].B) {
            events = events.concat(_resolveRound(duel, round, blockHash, worldState));
        }

        return events;
    }

    /**
     * Resolve a round when both reveals are in.
     */
    function _resolveRound(duel, round, blockHash, worldState) {
        var events = [];
        var charA = worldState.characters[duel.challenger] || {};
        var charB = worldState.characters[duel.target] || {};
        var stratA = duel.reveals[round].A;
        var stratB = duel.reveals[round].B;

        var playerA = {
            account: duel.challenger,
            potency: (typeof CharacterSystem !== 'undefined' && CharacterSystem.getTotalStat)
                ? CharacterSystem.getTotalStat(charA, 'pot') : (charA.pot || 10),
            resilience: (typeof CharacterSystem !== 'undefined' && CharacterSystem.getTotalStat)
                ? CharacterSystem.getTotalStat(charA, 'res') : (charA.res || 5),
            level: charA.level || 1,
            school: charA.school || '',
            strategy: stratA
        };

        var playerB = {
            account: duel.target,
            potency: (typeof CharacterSystem !== 'undefined' && CharacterSystem.getTotalStat)
                ? CharacterSystem.getTotalStat(charB, 'pot') : (charB.pot || 10),
            resilience: (typeof CharacterSystem !== 'undefined' && CharacterSystem.getTotalStat)
                ? CharacterSystem.getTotalStat(charB, 'res') : (charB.res || 5),
            level: charB.level || 1,
            school: charB.school || '',
            strategy: stratB
        };

        var roundResult = DuelSystem.resolveRound(playerA, playerB, blockHash);
        duel.roundResults.push(roundResult);

        events.push({
            type: 'duel_round_resolved',
            combatRef: duel.id,
            round: round,
            result: roundResult
        });

        // Check if duel is over (best of 3: first to 2 wins)
        var winsA = 0;
        var winsB = 0;
        for (var i = 0; i < duel.roundResults.length; i++) {
            if (duel.roundResults[i].winner === duel.challenger) winsA++;
            else if (duel.roundResults[i].winner === duel.target) winsB++;
        }

        var duelOver = (winsA >= 2 || winsB >= 2 || duel.roundResults.length >= duel.rounds);

        if (duelOver) {
            events = events.concat(_completeDuel(duel, winsA, winsB, worldState));
        } else {
            // Advance to next round
            duel.currentRound = round + 1;
        }

        return events;
    }

    /**
     * Complete a duel and move to history.
     */
    function _completeDuel(duel, winsA, winsB, worldState) {
        var duels = _ensureState(worldState);
        var winner = null;
        var loser = null;

        if (winsA > winsB) {
            winner = duel.challenger;
            loser = duel.target;
        } else if (winsB > winsA) {
            winner = duel.target;
            loser = duel.challenger;
        }

        duel.status = 'completed';
        duel.winner = winner;
        duel.winsA = winsA;
        duel.winsB = winsB;

        // XP rewards
        var xpWinner = 150;
        var xpLoser = 50;

        if (winner && worldState.characters[winner]) {
            if (typeof CharacterSystem !== 'undefined' && CharacterSystem.addXp) {
                CharacterSystem.addXp(worldState.characters[winner], xpWinner);
            }
        }
        if (loser && worldState.characters[loser]) {
            if (typeof CharacterSystem !== 'undefined' && CharacterSystem.addXp) {
                CharacterSystem.addXp(worldState.characters[loser], xpLoser);
            }
        }

        // Update leaderboard
        _updateLeaderboard(duels, duel.challenger, duel.target, winner);

        // Move to history
        delete duels.active[duel.id];
        duels.history.push({
            id: duel.id,
            challenger: duel.challenger,
            target: duel.target,
            winner: winner,
            winsA: winsA,
            winsB: winsB,
            rounds: duel.roundResults,
            completedBlock: worldState.headBlock
        });

        // Trim history to last 200
        while (duels.history.length > 200) {
            duels.history.shift();
        }

        return [{
            type: winner ? 'duel_completed' : 'duel_draw',
            combatRef: duel.id,
            winner: winner,
            loser: loser,
            winsA: winsA,
            winsB: winsB,
            xpWinner: xpWinner,
            xpLoser: xpLoser
        }];
    }

    function _ensureCharacterStub(worldState, account) {
        if (!account) return null;
        worldState.characters = worldState.characters || {};
        if (!worldState.characters[account]) {
            worldState.characters[account] = {
                account: account,
                name: account,
                className: '',
                school: '',
                level: 1,
                xp: 0,
                hp: 100,
                maxHp: 100,
                pot: 10,
                res: 5,
                swf: 5,
                int: 5,
                for_: 5,
                coreBonus: 0,
                title: '',
                guild: '',
                equipment: {},
                spells: [],
                lastHuntBlock: 0,
                fallenUntilBlock: 0,
                currentZone: 'commons_first_light'
            };
        }
        worldState.inventories = worldState.inventories || {};
        if (!worldState.inventories[account]) worldState.inventories[account] = [];
        worldState.quests = worldState.quests || {};
        if (!worldState.quests[account]) worldState.quests[account] = {};
        return worldState.characters[account];
    }

    /**
     * Handle a forfeit action.
     */
    function _handleForfeit(sender, data, blockNum, duels, worldState) {
        var combatRef = String(data.combat_ref);
        var duel = duels.active[combatRef] || duels.pending[combatRef];
        if (!duel) return [];

        // Only participants can forfeit
        if (sender !== duel.challenger && sender !== duel.target) return [];

        var winner = (sender === duel.challenger) ? duel.target : duel.challenger;

        duel.status = 'forfeited';
        duel.winner = winner;
        duel.forfeitedBy = sender;

        // Update leaderboard
        _updateLeaderboard(duels, duel.challenger, duel.target, winner);

        // Clean up
        delete duels.pending[combatRef];
        delete duels.active[combatRef];
        duels.history.push({
            id: duel.id || combatRef,
            challenger: duel.challenger,
            target: duel.target,
            winner: winner,
            forfeited: true,
            forfeitedBy: sender,
            completedBlock: blockNum
        });

        return [{
            type: 'duel_forfeit',
            combatRef: combatRef,
            forfeitedBy: sender,
            winner: winner
        }];
    }

    /**
     * Update leaderboard stats.
     */
    function _updateLeaderboard(duels, accountA, accountB, winner) {
        if (!duels.leaderboard[accountA]) {
            duels.leaderboard[accountA] = { wins: 0, losses: 0, draws: 0 };
        }
        if (!duels.leaderboard[accountB]) {
            duels.leaderboard[accountB] = { wins: 0, losses: 0, draws: 0 };
        }

        if (winner === accountA) {
            duels.leaderboard[accountA].wins++;
            duels.leaderboard[accountB].losses++;
        } else if (winner === accountB) {
            duels.leaderboard[accountB].wins++;
            duels.leaderboard[accountA].losses++;
        } else {
            duels.leaderboard[accountA].draws++;
            duels.leaderboard[accountB].draws++;
        }
    }

    /**
     * Check for expired duels and auto-forfeit them.
     * Called periodically by the state engine.
     *
     * @param {number} currentBlock
     * @param {Object} worldState
     * @returns {Array} game events
     */
    function checkTimeouts(currentBlock, worldState) {
        var duels = _ensureState(worldState);
        var events = [];

        // Check pending challenges that expired
        var pendingKeys = Object.keys(duels.pending);
        for (var i = 0; i < pendingKeys.length; i++) {
            var pd = duels.pending[pendingKeys[i]];
            if (currentBlock > pd.deadlineBlock) {
                delete duels.pending[pendingKeys[i]];
                events.push({
                    type: 'duel_expired',
                    combatRef: pendingKeys[i],
                    challenger: pd.challenger
                });
            }
        }

        // Check active duels with reveal timeout
        var activeKeys = Object.keys(duels.active);
        for (var j = 0; j < activeKeys.length; j++) {
            var ad = duels.active[activeKeys[j]];
            if (ad.revealDeadline > 0 && currentBlock > ad.revealDeadline) {
                // Determine who failed to reveal
                var round = ad.currentRound;
                var reveals = ad.reveals[round] || {};
                var forfeitedBy = null;

                if (!reveals.A && !reveals.B) {
                    // Both failed — draw
                    forfeitedBy = null;
                } else if (!reveals.A) {
                    forfeitedBy = ad.challenger;
                } else if (!reveals.B) {
                    forfeitedBy = ad.target;
                }

                var winner = null;
                if (forfeitedBy === ad.challenger) winner = ad.target;
                else if (forfeitedBy === ad.target) winner = ad.challenger;

                _updateLeaderboard(duels, ad.challenger, ad.target, winner);

                delete duels.active[activeKeys[j]];
                duels.history.push({
                    id: ad.id,
                    challenger: ad.challenger,
                    target: ad.target,
                    winner: winner,
                    timedOut: true,
                    forfeitedBy: forfeitedBy,
                    completedBlock: currentBlock
                });

                events.push({
                    type: 'duel_timeout',
                    combatRef: activeKeys[j],
                    forfeitedBy: forfeitedBy,
                    winner: winner
                });
            }
        }

        return events;
    }

    /**
     * Get status of a specific duel.
     * @param {string} combatRef
     * @param {Object} worldState
     * @returns {Object|null}
     */
    function getDuelStatus(combatRef, worldState) {
        var duels = _ensureState(worldState);
        var ref = String(combatRef);
        if (duels.pending[ref]) return duels.pending[ref];
        if (duels.active[ref]) return duels.active[ref];
        for (var i = 0; i < duels.history.length; i++) {
            if (duels.history[i].id === ref) return duels.history[i];
        }
        return null;
    }

    /**
     * Get all duels involving a player.
     * @param {string} account
     * @param {Object} worldState
     * @returns {Object} {pending: [], active: [], history: []}
     */
    function getPlayerDuels(account, worldState) {
        var duels = _ensureState(worldState);
        var result = { pending: [], active: [], history: [] };

        var pk = Object.keys(duels.pending);
        for (var i = 0; i < pk.length; i++) {
            var pd = duels.pending[pk[i]];
            if (pd.challenger === account || pd.target === account) {
                result.pending.push(pd);
            }
        }

        var ak = Object.keys(duels.active);
        for (var j = 0; j < ak.length; j++) {
            var ad = duels.active[ak[j]];
            if (ad.challenger === account || ad.target === account) {
                result.active.push(ad);
            }
        }

        for (var k = duels.history.length - 1; k >= 0; k--) {
            var hd = duels.history[k];
            if (hd.challenger === account || hd.target === account) {
                result.history.push(hd);
            }
            if (result.history.length >= 50) break;
        }

        return result;
    }

    /**
     * Get duel leaderboard sorted by wins.
     * @param {Object} worldState
     * @param {number} [limit] - max entries (default 50)
     * @returns {Array} [{account, wins, losses, draws, winRate}]
     */
    function getDuelLeaderboard(worldState, limit) {
        var duels = _ensureState(worldState);
        limit = limit || 50;

        var entries = [];
        var accounts = Object.keys(duels.leaderboard);

        for (var i = 0; i < accounts.length; i++) {
            var stats = duels.leaderboard[accounts[i]];
            var total = stats.wins + stats.losses + stats.draws;
            var winRate = total > 0 ? Math.floor(stats.wins * 100 / total) : 0;
            entries.push({
                account: accounts[i],
                wins: stats.wins,
                losses: stats.losses,
                draws: stats.draws,
                total: total,
                winRate: winRate
            });
        }

        // Sort by wins descending, then win rate
        entries.sort(function(a, b) {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return b.winRate - a.winRate;
        });

        return entries.slice(0, limit);
    }

    return {
        processDuelAction: processDuelAction,
        checkTimeouts: checkTimeouts,
        getDuelStatus: getDuelStatus,
        getPlayerDuels: getPlayerDuels,
        getDuelLeaderboard: getDuelLeaderboard
    };
})();
