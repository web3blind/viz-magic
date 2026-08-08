/**
 * Viz Magic — Leaderboard Screen
 * Shows top-100 mages ranked by XP.
 * Accessible: table with aria roles, aria-current for current player row,
 * BattleNarrator announces the player's current rank on open.
 */
var LeaderboardScreen = (function() {
    'use strict';

    var _unsubscribe = null;
    var _degraded = false;
    var _degradeTimer = null;

    function render() {
        var el = Helpers.$('screen-leaderboard');
        if (!el) return;

        if (_unsubscribe) {
            _unsubscribe();
            _unsubscribe = null;
        }

        if (!_degraded) {
            if (_degradeTimer) { clearTimeout(_degradeTimer); _degradeTimer = null; }
        }
        _renderFromSnapshot(DailyLeaderboard.getSnapshot());
        _unsubscribe = DailyLeaderboard.subscribe(function(snapshot) {
            if (App.getCurrentScreen && App.getCurrentScreen() !== 'leaderboard') return;
            _renderFromSnapshot(snapshot);
        });

        DailyLeaderboard.ensureLoaded(function() {});

        // If the 24h scan cannot finish quickly, stop blocking the UI: show the
        // local fallback table with a short "continues in background" note.
        _degradeTimer = setTimeout(function() {
            if (App.getCurrentScreen && App.getCurrentScreen() !== 'leaderboard') return;
            var snap = (typeof DailyLeaderboard !== 'undefined' && DailyLeaderboard.getSnapshot) ? DailyLeaderboard.getSnapshot() : {};
            if (snap.loading && !snap.ready) {
                _degraded = true;
                _renderFromSnapshot({
                    loading: false,
                    ready: false,
                    rows: snap.rows || [],
                    progressPct: snap.progressPct || 0,
                    statusText: Helpers.t('leaderboard_loading_continues')
                });
            }
        }, 5000);
    }

    function _renderFromSnapshot(snapshot) {
        var t = Helpers.t;
        var el = Helpers.$('screen-leaderboard');
        if (!el) return;

        snapshot = snapshot || {};
        var rows = snapshot.rows || [];
        if (!rows.length) {
            rows = _fallbackRowsFromState();
        }
        var currentUser = typeof VizAccount !== 'undefined' ? VizAccount.getCurrentUser() : null;
        var myRank = -1;

        for (var i = 0; i < rows.length; i++) {
            if (rows[i].account === currentUser) {
                myRank = i + 1;
                break;
            }
        }

        // Keep BattleNarrator combat-only. Leaderboard rank is shown in the page
        // itself; speaking it through speechSynthesis caused repeated/stuck audio
        // on some mobile screen-reader/browser combinations.

        var rankBanner = '';
        if (myRank > 0) {
            rankBanner = '<p class="leaderboard-your-rank" aria-live="polite">' +
                t('leaderboard_your_rank', { rank: myRank }) + '</p>';
        } else if (currentUser && rows.length > 0) {
            rankBanner = '<p class="leaderboard-your-rank leaderboard-not-ranked" aria-live="polite">' +
                t('leaderboard_not_ranked') + '</p>';
        }

        var statusHtml = '';
        if (_degraded) {
            statusHtml = '<p class="leaderboard-your-rank leaderboard-loading-inline" role="status" aria-live="polite">' +
                Helpers.escapeHtml(snapshot.statusText || t('leaderboard_loading_continues')) + '</p>';
        } else if (snapshot.loading && !rows.length) {
            statusHtml = '<div class="leaderboard-empty" role="status" aria-live="polite">' +
                Helpers.escapeHtml(snapshot.statusText || t('leaderboard_loading_status', { percent: snapshot.progressPct || 0 })) +
                '</div>';
        } else if (snapshot.loading && rows.length) {
            statusHtml = '<p class="leaderboard-your-rank leaderboard-loading-inline" aria-live="polite">' +
                Helpers.escapeHtml(snapshot.statusText || t('leaderboard_loading_status', { percent: snapshot.progressPct || 0 })) + '</p>';
        } else if (snapshot.lastUpdatedAt) {
            statusHtml = '<p class="leaderboard-your-rank" aria-live="polite">' +
                t('leaderboard_window_label', { blocks: DailyLeaderboard.WINDOW_BLOCKS }) +
                '</p>';
        }

        if (!rows.length) {
            el.innerHTML =
                '<div class="screen-header"><h2><span class="leaderboard-title-icon vmagic-breathe" aria-hidden="true">🏆</span> ' + t('leaderboard_title') + '</h2></div>' +
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
                        _renderAccountAvatar(row.avatarUrl, row.name || row.account, 'leaderboard-avatar') +
                        _renderPlayerIdentity(row, youBadge) +
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
                '<h2 id="leaderboard-heading"><span class="leaderboard-title-icon vmagic-breathe" aria-hidden="true">🏆</span> ' + t('leaderboard_title') + '</h2>' +
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

    function _fallbackRowsFromState() {
        if (typeof StateEngine === 'undefined') return [];
        var state = StateEngine.getState ? StateEngine.getState() : null;
        var chars = state && state.characters ? state.characters : {};
        var rows = [];
        for (var account in chars) {
            if (!chars.hasOwnProperty(account)) continue;
            var ch = chars[account] || {};
            rows.push({
                account: account,
                name: ch.name || account,
                avatarUrl: ch.avatarUrl || '',
                xp: ch.xp || 0,
                hunts: 0
            });
        }
        rows.sort(function(a, b) {
            if ((b.xp || 0) !== (a.xp || 0)) return (b.xp || 0) - (a.xp || 0);
            return String(a.name || a.account).localeCompare(String(b.name || b.account));
        });
        return rows.slice(0, 100);
    }

    function _renderPlayerIdentity(row, youBadge) {
        var account = row.account || '';
        var name = row.name || account || '';
        return '<span class="leaderboard-name">' + Helpers.escapeHtml(name) + '</span>' + youBadge;
    }

    function _renderAccountAvatar(url, name, extraClass) {
        if (!url) return '<span class="account-avatar default-avatar ' + (extraClass || '') + ' vmagic-breathe" aria-hidden="true">🧙</span>';
        return '<img class="account-avatar vmagic-breathe ' + (extraClass || '') + '" src="' + Helpers.escapeHtml(url) + '" alt="" aria-hidden="true" loading="lazy" decoding="async">';
    }

    function _formatNumber(n) {
        return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
    }

    return { render: render };
})();
