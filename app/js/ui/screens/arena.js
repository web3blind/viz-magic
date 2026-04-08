/**
 * Viz Magic — Arena Screen
 * Leaderboard, challenge system, and duel history.
 */
var ArenaScreen = (function() {
    'use strict';

    var currentTab = 'leaderboard'; // leaderboard, history
    var levelFilter = 'all';
    var listenersRegistered = false;
    var seenIncomingRefs = {};

    function render() {
        _ensureEventListeners();

        var t = Helpers.t;
        var el = Helpers.$('screen-arena');
        if (!el) return;

        var html = '<div class="arena-screen" role="region" aria-label="' + t('arena_title') + '">' +
            '<h1>' + t('arena_title') + '</h1>' +
            '<div class="arena-tabs" role="tablist" aria-label="' + t('arena_tabs') + '">' +
                '<button class="btn ' + (currentTab === 'leaderboard' ? 'btn-primary' : 'btn-secondary') + '" ' +
                    'role="tab" aria-selected="' + (currentTab === 'leaderboard') + '" ' +
                    'id="tab-leaderboard">' + t('arena_leaderboard') + '</button>' +
                '<button class="btn ' + (currentTab === 'history' ? 'btn-primary' : 'btn-secondary') + '" ' +
                    'role="tab" aria-selected="' + (currentTab === 'history') + '" ' +
                    'id="tab-history">' + t('arena_history') + '</button>' +
            '</div>' +
            '<div id="arena-content" role="tabpanel"></div>' +
            '<div class="arena-challenge">' +
                '<h2>' + (t('arena_challenge') || 'Бросить вызов') + '</h2>' +
                '<div class="form-group">' +
                    '<input type="text" id="arena-opponent" class="input-field" ' +
                        'placeholder="' + (t('arena_opponent_placeholder') || 'Имя оппонента') + '" ' +
                        'aria-label="' + (t('arena_opponent_placeholder') || 'Имя оппонента') + '">' +
                    '<button class="btn btn-primary" id="btn-arena-challenge">' +
                        (t('arena_challenge_btn') || 'Вызвать на дуэль') +
                    '</button>' +
                '</div>' +
            '</div>' +
            '</div>';

        el.innerHTML = html;

        Helpers.$('tab-leaderboard').addEventListener('click', function() {
            currentTab = 'leaderboard';
            SoundManager.play('tap');
            render();
        });

        Helpers.$('tab-history').addEventListener('click', function() {
            currentTab = 'history';
            SoundManager.play('tap');
            render();
        });

        Helpers.$('btn-arena-challenge').addEventListener('click', function() {
            var opp = Helpers.$('arena-opponent').value.trim().toLowerCase();
            if (!opp) return;
            SoundManager.play('tap');
            DuelScreen.startDuel(opp, '', { source: 'arena_challenge' });
        });

        var content = Helpers.$('arena-content');
        if (currentTab === 'leaderboard') {
            _renderLeaderboard(content);
        } else {
            _renderHistory(content);
        }

        // Scan chain for incoming challenges addressed to current user
        _scanIncomingChallenges(el);
    }

    function _ensureEventListeners() {
        if (listenersRegistered) return;
        listenersRegistered = true;

        Helpers.EventBus.on('duel_challenge', function(data) {
            var user = VizAccount.getCurrentUser();
            if (!data || !user) return;
            if (data.target !== user) return;

            var ref = String(data.challengeRef || data.combatRef || '');
            if (ref && seenIncomingRefs[ref]) return;
            if (ref) seenIncomingRefs[ref] = true;

            Toast.info(Helpers.t('arena_incoming_duel_toast', {
                opponent: data.account || data.challenger || ''
            }), 7000, {
                actionLabel: Helpers.t('arena_open_challenge'),
                onClick: function() {
                    currentTab = 'history';
                    Helpers.EventBus.emit('navigate', 'arena');
                }
            });

            currentTab = 'history';
            Helpers.EventBus.emit('navigate', 'arena');
        });

        Helpers.EventBus.on('duel_accepted', function(data) {
            var user = VizAccount.getCurrentUser();
            if (!data || !user) return;
            if (data.challenger !== user && data.target !== user) return;

            Toast.success(Helpers.t('arena_duel_accepted_toast'), 5000, {
                actionLabel: Helpers.t('arena_open_duel'),
                onClick: function() {
                    var opp = data.challenger === user ? data.target : data.challenger;
                    DuelScreen.startDuel(opp, String(data.combatRef || ''), { source: 'accepted_event' });
                }
            });
        });
    }

    /**
     * Scan recent VM operations to find challenges targeting the current user.
     * Uses custom_protocol_api to walk backward through challenger's VM chain.
     */
    function _scanIncomingChallenges(el) {
        var user = VizAccount.getCurrentUser();
        if (!user) return;

        var state = StateEngine.getState();
        // Check if we already have pending duels in state
        if (state.duels && state.duels.pending) {
            var found = false;
            for (var key in state.duels.pending) {
                if (state.duels.pending[key].target === user) { found = true; break; }
            }
            if (found) return; // Already have pending challenges loaded
        }

        // Fetch recent blocks to look for challenges targeting this user
        viz.api.getDynamicGlobalProperties(function(err, dgp) {
            if (err || !dgp) return;
            var headBlock = dgp.head_block_number;
            // Scan last 100 blocks (~5 minutes) for fast check
            var startBlock = Math.max(1, headBlock - 100);
            _scanBlocksForChallenges(startBlock, headBlock, user, el);
        });
    }

    function _scanBlocksForChallenges(startBlock, endBlock, user, el) {
        var pendingChallenges = [];
        var current = endBlock;

        function checkBlock() {
            if (current < startBlock) {
                // Done scanning
                if (pendingChallenges.length > 0) {
                    _showIncomingChallenges(pendingChallenges, el, user);
                }
                return;
            }

            viz.api.getBlock(current, function(err, block) {
                if (!err && block && block.transactions) {
                    for (var i = 0; i < block.transactions.length; i++) {
                        var tx = block.transactions[i];
                        for (var j = 0; j < tx.operations.length; j++) {
                            var op = tx.operations[j];
                            if (op[0] === 'custom' && op[1].id === 'VM') {
                                try {
                                    var data = JSON.parse(op[1].json);
                                    if (data.t === 'challenge' && data.d && data.d.target === user) {
                                        var challenger = (op[1].required_regular_auths && op[1].required_regular_auths[0]) || '';
                                        pendingChallenges.push({
                                            challenger: challenger,
                                            blockNum: current,
                                            data: data.d,
                                            strategyHash: data.d.strategy_hash
                                        });
                                    }
                                } catch(e) {}
                            }
                        }
                    }
                }
                current--;
                // Batch: check 10 blocks then yield
                if ((endBlock - current) % 10 === 0) {
                    setTimeout(checkBlock, 50);
                } else {
                    checkBlock();
                }
            });
        }

        checkBlock();
    }

    function _showIncomingChallenges(challenges, el, user) {
        var t = Helpers.t;
        var container = el.querySelector('#arena-content');
        if (!container) return;

        // Filter out challenges that are already accepted (in active state)
        var state = StateEngine.getState();
        var filtered = [];
        for (var f = 0; f < challenges.length; f++) {
            var ref = String(challenges[f].blockNum);
            var alreadyActive = state.duels && state.duels.active && state.duels.active[ref];
            var alreadyInHistory = false;
            if (state.duels && state.duels.history) {
                for (var h = 0; h < state.duels.history.length; h++) {
                    if (state.duels.history[h].id === ref) { alreadyInHistory = true; break; }
                }
            }
            if (!alreadyActive && !alreadyInHistory) {
                filtered.push(challenges[f]);
            }
        }
        if (filtered.length === 0) return;

        var html = '<div class="arena-incoming"><h2>' + (t('arena_incoming_challenges') || 'Входящие вызовы') + '</h2>';
        for (var i = 0; i < filtered.length; i++) {
            var ch = filtered[i];
            html += '<div class="arena-history-entry arena-pending">' +
                '<strong>' + Helpers.escapeHtml(ch.challenger) + ' ' + (t('arena_challenges_you') || 'вызывает вас на дуэль!') + '</strong>' +
                '<span> (блок ' + ch.blockNum + ')</span>' +
                '<button class="btn btn-primary btn-sm arena-accept-chain-btn" ' +
                    'data-combat-ref="' + ch.blockNum + '" data-opponent="' + ch.challenger + '" ' +
                    'data-strategy-hash="' + (ch.strategyHash || '') + '">' +
                    (t('duel_accept') || 'Принять') + '</button>' +
                '</div>';
        }
        html += '</div>';

        container.insertAdjacentHTML('beforeend', html);

        // Bind accept buttons — broadcast accept on chain, then navigate to duel
        var acceptBtns = container.querySelectorAll('.arena-accept-chain-btn');
        for (var j = 0; j < acceptBtns.length; j++) {
            acceptBtns[j].addEventListener('click', function() {
                var btn = this;
                var challengeRef = btn.getAttribute('data-combat-ref');
                var opp = btn.getAttribute('data-opponent');
                SoundManager.play('tap');

                btn.disabled = true;
                btn.textContent = '...';

                // Navigate to duel screen immediately with accept source
                DuelScreen.startDuel(opp, challengeRef, { source: 'arena_accept' });
            });
        }
    }

    function _renderLeaderboard(container) {
        var t = Helpers.t;
        var state = StateEngine.getState();
        var leaderboard = DuelStateManager.getDuelLeaderboard(state, 50);
        var user = VizAccount.getCurrentUser();

        // Level filter
        var html = '<div class="arena-filter">' +
            '<label for="level-filter" class="input-label">' + t('arena_filter_level') + '</label>' +
            '<select id="level-filter" class="input-field" aria-label="' + t('arena_filter_level') + '">' +
                '<option value="all">' + t('arena_all_levels') + '</option>' +
                '<option value="1-10">1-10</option>' +
                '<option value="11-20">11-20</option>' +
                '<option value="21-30">21-30</option>' +
                '<option value="31-50">31-50</option>' +
            '</select>' +
            '</div>';

        if (leaderboard.length === 0) {
            html += '<p class="empty-state">' + t('arena_no_duels') + '</p>';
            container.innerHTML = html;
            return;
        }

        html += '<table class="arena-table" role="table" aria-label="' + t('arena_leaderboard') + '">' +
            '<thead><tr>' +
                '<th scope="col" aria-sort="none">#</th>' +
                '<th scope="col">' + t('arena_mage') + '</th>' +
                '<th scope="col" aria-sort="descending">' + t('arena_wins') + '</th>' +
                '<th scope="col">' + t('arena_losses') + '</th>' +
                '<th scope="col">' + t('arena_win_rate') + '</th>' +
                '<th scope="col">' + t('arena_action') + '</th>' +
            '</tr></thead><tbody>';

        for (var i = 0; i < leaderboard.length; i++) {
            var entry = leaderboard[i];
            var char = state.characters[entry.account] || {};
            var isMe = entry.account === user;
            var rowClass = isMe ? 'arena-row-me' : '';

            html += '<tr class="' + rowClass + '">' +
                '<td>' + (i + 1) + '</td>' +
                '<td>' +
                    '<span aria-hidden="true">' + Helpers.classIcon(char.className) + '</span> ' +
                    Helpers.escapeHtml(char.name || entry.account) +
                    (isMe ? ' (' + t('arena_you') + ')' : '') +
                '</td>' +
                '<td>' + entry.wins + '</td>' +
                '<td>' + entry.losses + '</td>' +
                '<td>' + entry.winRate + '%</td>' +
                '<td>';

            if (!isMe) {
                html += '<button class="btn btn-secondary btn-sm arena-challenge-btn" ' +
                    'data-account="' + entry.account + '" ' +
                    'aria-label="' + t('arena_challenge_player', { name: char.name || entry.account }) + '">' +
                    t('duel_challenge') + '</button>';
            }

            html += '</td></tr>';
        }

        html += '</tbody></table>';
        container.innerHTML = html;

        // Bind challenge buttons
        var challengeBtns = container.querySelectorAll('.arena-challenge-btn');
        for (var j = 0; j < challengeBtns.length; j++) {
            challengeBtns[j].addEventListener('click', function() {
                var account = this.getAttribute('data-account');
                SoundManager.play('tap');
                DuelScreen.startDuel(account, '', { source: 'leaderboard_challenge' });
            });
        }

        // Level filter change
        var filterEl = Helpers.$('level-filter');
        if (filterEl) {
            filterEl.value = levelFilter;
            filterEl.addEventListener('change', function() {
                levelFilter = this.value;
                render();
            });
        }
    }

    function _renderHistory(container) {
        var t = Helpers.t;
        var user = VizAccount.getCurrentUser();
        var state = StateEngine.getState();
        var playerDuels = DuelStateManager.getPlayerDuels(user || '', state);

        console.log('ArenaScreen: render history', {
            user: user,
            pending: playerDuels.pending.length,
            active: playerDuels.active.length,
            history: playerDuels.history.length,
            headBlock: state && state.headBlock
        });

        var html = '';

        // Active duels
        if (playerDuels.active.length > 0) {
            html += '<h2>' + t('arena_active_duels') + '</h2>';
            for (var i = 0; i < playerDuels.active.length; i++) {
                var ad = playerDuels.active[i];
                var oppAccount = ad.challenger === user ? ad.target : ad.challenger;
                var oppChar = state.characters[oppAccount] || {};
                html += '<div class="arena-history-entry arena-active">' +
                    '<strong>' + t('duel_vs') + ' ' + Helpers.escapeHtml(oppChar.name || oppAccount) + '</strong>' +
                    '<span>' + t('duel_round', { round: ad.currentRound, total: ad.rounds }) + '</span>' +
                    '<button class="btn btn-primary btn-sm" data-combat-ref="' + ad.id + '" data-opponent="' + oppAccount + '">' +
                        t('arena_continue') + '</button>' +
                '</div>';
            }
        }

        // Pending challenges to me
        if (playerDuels.pending.length > 0) {
            html += '<h2>' + t('arena_pending') + '</h2>';
            for (var j = 0; j < playerDuels.pending.length; j++) {
                var pd = playerDuels.pending[j];
                if (pd.target === user) {
                    var challChar = state.characters[pd.challenger] || {};
                    html += '<div class="arena-history-entry arena-pending">' +
                        '<strong>' + Helpers.escapeHtml(challChar.name || pd.challenger) +
                        ' ' + t('arena_challenges_you') + '</strong>' +
                        '<button class="btn btn-primary btn-sm arena-accept-btn" ' +
                            'data-combat-ref="' + pd.id + '" data-opponent="' + pd.challenger + '">' +
                            t('duel_accept') + '</button>' +
                    '</div>';
                }
            }
        }

        // History
        html += '<h2>' + t('arena_past_duels') + '</h2>';
        if (playerDuels.history.length === 0) {
            html += '<p class="empty-state">' + t('arena_no_history') + '</p>';
        } else {
            for (var k = 0; k < playerDuels.history.length; k++) {
                var hd = playerDuels.history[k];
                var histOpp = hd.challenger === user ? hd.target : hd.challenger;
                var histChar = state.characters[histOpp] || {};
                var wonDuel = hd.winner === user;
                var resultClass = wonDuel ? 'arena-won' : (hd.winner ? 'arena-lost' : 'arena-drew');
                var resultText = wonDuel ? t('duel_victory') : (hd.winner ? t('duel_defeat') : t('duel_draw'));

                html += '<div class="arena-history-entry ' + resultClass + '">' +
                    '<span>' + resultText + '</span> ' +
                    t('duel_vs') + ' ' + Helpers.escapeHtml(histChar.name || histOpp) +
                    (hd.forfeited ? ' (' + t('duel_forfeited') + ')' : '') +
                    '</div>';
            }
        }

        container.innerHTML = html;

        // Bind continue buttons for active duels
        var continueBtns = container.querySelectorAll('[data-combat-ref]:not(.arena-accept-btn)');
        for (var m = 0; m < continueBtns.length; m++) {
            if (continueBtns[m].classList.contains('arena-accept-btn')) continue;
            continueBtns[m].addEventListener('click', function() {
                var ref = this.getAttribute('data-combat-ref');
                var opp = this.getAttribute('data-opponent');
                DuelScreen.startDuel(opp, ref, { source: 'history' });
            });
        }

        // Bind accept buttons for pending challenges (from state)
        var stateAcceptBtns = container.querySelectorAll('.arena-accept-btn');
        for (var n = 0; n < stateAcceptBtns.length; n++) {
            stateAcceptBtns[n].addEventListener('click', function() {
                var btn = this;
                var ref = btn.getAttribute('data-combat-ref');
                var opp = btn.getAttribute('data-opponent');
                SoundManager.play('tap');

                btn.disabled = true;
                btn.textContent = '...';

                // Navigate to duel screen with accept source
                DuelScreen.startDuel(opp, ref, { source: 'arena_accept' });
            });
        }
    }

    _ensureEventListeners();

    return { render: render };
})();
