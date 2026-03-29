/**
 * Viz Magic — Arena Screen
 * Leaderboard, challenge system, and duel history.
 */
var ArenaScreen = (function() {
    'use strict';

    var currentTab = 'leaderboard'; // leaderboard, history
    var levelFilter = 'all';

    function render() {
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
            DuelScreen.startDuel(opp, '', null);
        });

        var content = Helpers.$('arena-content');
        if (currentTab === 'leaderboard') {
            _renderLeaderboard(content);
        } else {
            _renderHistory(content);
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
                DuelScreen.startDuel(account, '', null);
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

        // Bind continue buttons
        var continueBtns = container.querySelectorAll('[data-combat-ref]');
        for (var m = 0; m < continueBtns.length; m++) {
            continueBtns[m].addEventListener('click', function() {
                var ref = this.getAttribute('data-combat-ref');
                var opp = this.getAttribute('data-opponent');
                DuelScreen.startDuel(opp, ref, null);
            });
        }
    }

    return { render: render };
})();
