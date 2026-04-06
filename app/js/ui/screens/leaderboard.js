/**
 * Viz Magic — Leaderboard Screen
 * Shows top-100 mages ranked by XP.
 * Accessible: table with aria roles, aria-current for current player row,
 * BattleNarrator announces the player's current rank on open.
 */
var LeaderboardScreen = (function() {
    'use strict';

    var _unsubscribe = null;

    function render() {
        var el = Helpers.$('screen-leaderboard');
        if (!el) return;

        if (_unsubscribe) {
            _unsubscribe();
            _unsubscribe = null;
        }

        _renderFromSnapshot(DailyLeaderboard.getSnapshot());
        _unsubscribe = DailyLeaderboard.subscribe(function(snapshot) {
            if (App.getCurrentScreen && App.getCurrentScreen() !== 'leaderboard') return;
            _renderFromSnapshot(snapshot);
        });

        DailyLeaderboard.ensureLoaded(function() {});
    }

    function _renderFromSnapshot(snapshot) {
        var t = Helpers.t;
        var el = Helpers.$('screen-leaderboard');
        if (!el) return;

        snapshot = snapshot || {};
        var rows = snapshot.rows || [];
        var currentUser = typeof VizAccount !== 'undefined' ? VizAccount.getCurrentUser() : null;
        var myRank = -1;

        for (var i = 0; i < rows.length; i++) {
            if (rows[i].account === currentUser) {
                myRank = i + 1;
                break;
            }
        }

        if (typeof BattleNarrator !== 'undefined' && BattleNarrator.isEnabled()) {
            if (myRank > 0) {
                BattleNarrator.announce(
                    t('narrator_leaderboard_rank', { rank: myRank, total: rows.length }),
                    'polite'
                );
            } else if (rows.length > 0) {
                BattleNarrator.announce(t('leaderboard_not_ranked'), 'polite');
            }
        }

        var rankBanner = '';
        if (myRank > 0) {
            rankBanner = '<p class="leaderboard-your-rank" aria-live="polite">' +
                t('leaderboard_your_rank', { rank: myRank }) + '</p>';
        } else if (currentUser && rows.length > 0) {
            rankBanner = '<p class="leaderboard-your-rank leaderboard-not-ranked" aria-live="polite">' +
                t('leaderboard_not_ranked') + '</p>';
        }

        var statusHtml = '';
        if (snapshot.loading) {
            statusHtml = '<div class="leaderboard-empty" role="status" aria-live="polite">' +
                Helpers.escapeHtml(snapshot.statusText || t('leaderboard_loading_status', { percent: snapshot.progressPct || 0 })) +
                '</div>';
        } else if (snapshot.lastUpdatedAt) {
            statusHtml = '<p class="leaderboard-your-rank" aria-live="polite">' +
                t('leaderboard_window_label', { blocks: DailyLeaderboard.WINDOW_BLOCKS }) +
                '</p>';
        }

        if (!rows.length) {
            el.innerHTML =
                '<div class="screen-header"><h2>' + t('leaderboard_title') + '</h2></div>' +
                statusHtml +
                '<div class="leaderboard-empty" role="status">' +
                    (snapshot.loading ? '' : t('leaderboard_empty')) +
                '</div>';
            return;
        }

        var tableRows = '';
        for (var j = 0; j < rows.length; j++) {
            var row = rows[j];
            var isMe = row.account === currentUser;
            var rank = j + 1;
            var medalIcon = rank === 1 ? '\uD83E\uDD47' : rank === 2 ? '\uD83E\uDD48' : rank === 3 ? '\uD83E\uDD49' : rank + '.';
            var rowClass = 'leaderboard-row' + (isMe ? ' leaderboard-row--me' : '');
            var ariaCurrent = isMe ? ' aria-current="true"' : '';
            var youBadge = isMe
                ? ' <span class="leaderboard-you-badge" aria-hidden="true">' + t('leaderboard_you') + '</span>'
                : '';

            tableRows +=
                '<tr class="' + rowClass + '"' + ariaCurrent + '>' +
                    '<td class="leaderboard-cell-rank" aria-label="' + t('leaderboard_rank') + ' ' + rank + '">' +
                        '<span aria-hidden="true">' + medalIcon + '</span>' +
                    '</td>' +
                    '<td class="leaderboard-cell-player">' +
                        '<span class="leaderboard-name">' + Helpers.escapeHtml(row.name || row.account) + '</span>' +
                        youBadge +
                    '</td>' +
                    '<td class="leaderboard-cell-level" aria-label="' + t('leaderboard_window_col') + '">' +
                        '24h' +
                    '</td>' +
                    '<td class="leaderboard-cell-xp" aria-label="' + t('leaderboard_xp') + ' ' + row.xp + '">' +
                        _formatNumber(row.xp) +
                    '</td>' +
                    '<td class="leaderboard-cell-hunts" aria-label="' + t('leaderboard_hunts') + ' ' + (row.hunts || 0) + '">' +
                        (row.hunts || 0) +
                    '</td>' +
                '</tr>';
        }

        el.innerHTML =
            '<div class="screen-header">' +
                '<h2 id="leaderboard-heading">' + t('leaderboard_title') + '</h2>' +
            '</div>' +
            rankBanner +
            statusHtml +
            '<div class="leaderboard-table-wrap">' +
                '<table class="leaderboard-table" role="grid" aria-labelledby="leaderboard-heading">' +
                    '<thead>' +
                        '<tr>' +
                            '<th scope="col" class="leaderboard-cell-rank">' + t('leaderboard_rank') + '</th>' +
                            '<th scope="col" class="leaderboard-cell-player">' + t('leaderboard_player') + '</th>' +
                            '<th scope="col" class="leaderboard-cell-level">' + t('leaderboard_window_col') + '</th>' +
                            '<th scope="col" class="leaderboard-cell-xp">' + t('leaderboard_xp') + '</th>' +
                            '<th scope="col" class="leaderboard-cell-hunts">' + t('leaderboard_hunts') + '</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>' + tableRows + '</tbody>' +
                '</table>' +
            '</div>';
    }

    function _formatNumber(n) {
        return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
    }

    return { render: render };
})();
