/**
 * Viz Magic — Realm Chronicle (Social Feed) Screen
 * Functional feed with tabs, bless button, post composer, and narrative cards.
 */
var ChronicleScreen = (function() {
    'use strict';

    var MAX_POST_LENGTH = 280;
    var BLESS_ENERGY = 100; // 1% = 100 basis points
    var currentTab = 'all'; // all, guild, friends, world

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-chronicle');
        if (!el) return;

        var html = '<div class="chronicle-screen" role="region" aria-label="' + t('chronicle_title') + '">' +
            '<h1>' + t('chronicle_title') + '</h1>' +

            // Tabs
            '<div class="chronicle-tabs" role="tablist" aria-label="' + t('chronicle_tabs') + '">' +
                _tabButton('all', t('chronicle_all')) +
                _tabButton('guild', t('chronicle_guild')) +
                _tabButton('friends', t('chronicle_friends')) +
                _tabButton('world', t('chronicle_world')) +
            '</div>' +

            // Composer
            '<div class="chronicle-compose">' +
                '<textarea id="chronicle-input" class="input-field" rows="3" ' +
                    'maxlength="' + MAX_POST_LENGTH + '" ' +
                    'placeholder="' + t('chronicle_placeholder') + '" ' +
                    'aria-label="' + t('chronicle_write') + '"></textarea>' +
                '<div class="chronicle-compose-footer">' +
                    '<span id="chronicle-char-count" class="chronicle-char-count" aria-live="polite">0/' + MAX_POST_LENGTH + '</span>' +
                    '<button class="btn btn-primary" id="btn-chronicle-send">' + t('chronicle_send') + '</button>' +
                '</div>' +
            '</div>' +

            // Feed
            '<div id="chronicle-feed" class="chronicle-feed" role="feed" ' +
                'aria-label="' + t('chronicle_title') + '">' +
                '<p class="empty-state">' + t('loading') + '</p>' +
            '</div>' +
            '</div>';

        el.innerHTML = html;
        _bindEvents(el);
        _loadFeed();
    }

    function _tabButton(id, label) {
        var isActive = currentTab === id;
        return '<button class="btn ' + (isActive ? 'btn-primary' : 'btn-secondary') + ' btn-sm chronicle-tab-btn" ' +
            'role="tab" aria-selected="' + isActive + '" data-tab="' + id + '">' +
            label + '</button>';
    }

    function _bindEvents(el) {
        // Tab switching
        var tabBtns = el.querySelectorAll('.chronicle-tab-btn');
        for (var i = 0; i < tabBtns.length; i++) {
            tabBtns[i].addEventListener('click', function() {
                currentTab = this.getAttribute('data-tab');
                SoundManager.play('tap');
                render();
            });
        }

        // Character counter for textarea
        var input = Helpers.$('chronicle-input');
        var counter = Helpers.$('chronicle-char-count');
        if (input && counter) {
            input.addEventListener('input', function() {
                var len = this.value.length;
                counter.textContent = len + '/' + MAX_POST_LENGTH;
                if (len > MAX_POST_LENGTH) {
                    counter.classList.add('error');
                } else {
                    counter.classList.remove('error');
                }
            });
        }

        // Send button
        Helpers.$('btn-chronicle-send').addEventListener('click', function() {
            var text = Helpers.$('chronicle-input').value.trim();
            if (!text || text.length > MAX_POST_LENGTH) return;
            SoundManager.play('bless_send');

            VizBroadcast.chroniclePost(text, function(err) {
                if (err) {
                    Toast.error(Helpers.t('error_network'));
                } else {
                    Toast.success('\u2728 ' + Helpers.t('chronicle_send'));
                    Helpers.$('chronicle-input').value = '';
                    Helpers.$('chronicle-char-count').textContent = '0/' + MAX_POST_LENGTH;
                    _loadFeed();
                }
            });
        });
    }

    function _loadFeed() {
        var feed = Helpers.$('chronicle-feed');
        if (!feed) return;

        var state = StateEngine.getState();
        var entries = [];

        // Collect recent game actions as narrative entries
        if (state.recentActions) {
            for (var i = state.recentActions.length - 1; i >= 0 && entries.length < 50; i--) {
                var action = state.recentActions[i];
                var narrative = _actionToNarrative(action);
                if (narrative) {
                    entries.push({
                        type: 'action',
                        account: action.sender,
                        text: narrative,
                        actionType: action.type,
                        timestamp: action.timestamp,
                        blockNum: action.blockNum
                    });
                }
            }
        }

        // Collect duel history as narrative entries
        if (state.duels && state.duels.history) {
            for (var j = state.duels.history.length - 1; j >= 0 && entries.length < 50; j--) {
                var duel = state.duels.history[j];
                var duelNarrative = _duelToNarrative(duel, state);
                if (duelNarrative) {
                    entries.push({
                        type: 'duel',
                        account: duel.winner || duel.challenger,
                        text: duelNarrative,
                        actionType: 'duel_completed',
                        timestamp: null,
                        blockNum: duel.completedBlock
                    });
                }
            }
        }

        // Filter by tab
        entries = _filterByTab(entries, state);

        // Sort by blockNum descending
        entries.sort(function(a, b) {
            return (b.blockNum || 0) - (a.blockNum || 0);
        });

        // Render
        if (entries.length === 0) {
            feed.innerHTML = '<p class="empty-state">' + Helpers.t('chronicle_empty') + '</p>';
            return;
        }

        var html = '';
        for (var k = 0; k < entries.length; k++) {
            html += _renderEntry(entries[k]);
        }
        feed.innerHTML = html;

        // Bind bless buttons
        var blessBtns = feed.querySelectorAll('.bless-button');
        for (var m = 0; m < blessBtns.length; m++) {
            blessBtns[m].addEventListener('click', _onBless);
        }
    }

    function _renderEntry(entry) {
        var t = Helpers.t;
        var charInfo = StateEngine.getCharacter(entry.account);
        var charName = (charInfo && charInfo.name) || entry.account || '???';
        var icon = _getActionIcon(entry.actionType);
        var timeStr = entry.timestamp ? Helpers.timeAgo(entry.timestamp) : '';

        return '<article class="chronicle-entry" role="article" aria-label="' + Helpers.escapeHtml(charName) + '">' +
            '<div class="chronicle-entry-header">' +
                '<span class="chronicle-icon" aria-hidden="true">' + icon + '</span>' +
                '<strong class="chronicle-author">' + Helpers.escapeHtml(charName) + '</strong>' +
                (timeStr ? '<span class="chronicle-time">' + timeStr + '</span>' : '') +
            '</div>' +
            '<p class="chronicle-text">' + Helpers.escapeHtml(entry.text) + '</p>' +
            '<div class="chronicle-actions">' +
                '<button class="bless-button" data-account="' + (entry.account || '') + '" ' +
                    'aria-label="' + t('chronicle_bless') + ' ' + Helpers.escapeHtml(charName) + '">' +
                    '\u2728 ' + t('chronicle_bless') +
                '</button>' +
            '</div>' +
            '</article>';
    }

    function _onBless() {
        var account = this.getAttribute('data-account');
        if (!account) return;

        var user = VizAccount.getCurrentUser();
        if (!user || user === account) return;

        SoundManager.play('bless_send');
        SoundManager.vibrate('light');

        var memo = 'viz://vm/bless/' + account;
        VizBroadcast.award(account, BLESS_ENERGY, 0, memo, [], function(err) {
            if (err) {
                Toast.error(Helpers.t('error_low_mana'));
            } else {
                Toast.success('\u2728 ' + Helpers.t('chronicle_blessed'));
                SoundManager.play('bless_recv');
            }
        });
    }

    function _actionToNarrative(action) {
        var t = Helpers.t;
        var charInfo = StateEngine.getCharacter(action.sender);
        var name = (charInfo && charInfo.name) || action.sender || '???';

        switch (action.type) {
            case 'hunt':
                return t('chronicle_narrative_hunt', { name: name });
            case 'hunt_victory':
            case 'hunt_defeat':
                if (action.events && action.events[0]) {
                    var creature = action.events[0].creature || '';
                    if (action.type === 'hunt_victory') {
                        return t('chronicle_narrative_hunt_win', { name: name, creature: creature });
                    } else {
                        return t('chronicle_narrative_hunt_lose', { name: name, creature: creature });
                    }
                }
                return t('chronicle_narrative_hunt', { name: name });
            case 'character_created':
                return t('chronicle_narrative_awaken', { name: name });
            case 'rest_complete':
                return t('chronicle_narrative_rest', { name: name });
            default:
                return null;
        }
    }

    function _duelToNarrative(duel, state) {
        var t = Helpers.t;
        var charA = state.characters[duel.challenger] || {};
        var charB = state.characters[duel.target] || {};
        var nameA = charA.name || duel.challenger;
        var nameB = charB.name || duel.target;

        if (duel.forfeited) {
            return t('chronicle_narrative_duel_forfeit', { winner: duel.winner === duel.challenger ? nameA : nameB });
        }

        if (duel.winner) {
            var winnerName = duel.winner === duel.challenger ? nameA : nameB;
            var loserName = duel.winner === duel.challenger ? nameB : nameA;
            return t('chronicle_narrative_duel_win', {
                winner: winnerName,
                loser: loserName,
                winsA: duel.winsA || 0,
                winsB: duel.winsB || 0
            });
        }

        return t('chronicle_narrative_duel_draw', { nameA: nameA, nameB: nameB });
    }

    function _filterByTab(entries, state) {
        if (currentTab === 'all') return entries;

        var user = VizAccount.getCurrentUser();
        // For now, simple filtering
        // guild/friends require guild membership data which we can add later
        if (currentTab === 'world') {
            // Show duel events only
            return entries.filter(function(e) {
                return e.type === 'duel';
            });
        }
        return entries;
    }

    function _getActionIcon(actionType) {
        var icons = {
            'hunt': '\u2694\uFE0F',
            'hunt_victory': '\uD83C\uDFC6',
            'hunt_defeat': '\uD83D\uDCA8',
            'character_created': '\u2728',
            'rest_complete': '\uD83D\uDCA4',
            'duel_completed': '\u2694\uFE0F',
            'duel_forfeit': '\uD83C\uDFF3\uFE0F'
        };
        return icons[actionType] || '\uD83D\uDCDC';
    }

    return { render: render };
})();
