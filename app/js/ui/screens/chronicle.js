/**
 * Viz Magic — Realm Chronicle (Social Feed) Screen
 * Functional feed with tabs, bless button, post composer, and narrative cards.
 */
var ChronicleScreen = (function() {
    'use strict';

    var MAX_POST_LENGTH = 280;
    var BLESS_ENERGY = 100; // 1% = 100 basis points
    var BLESS_MEMO_PREFIX = 'viz://vm/bless/';
    var currentTab = 'all'; // all, guild, friends, world
    var REQUIRED_TAG = '#viz_magic';

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
            text = _ensureRequiredTag(text);
            if (!text || text.length > MAX_POST_LENGTH) return;
            SoundManager.play('bless_send');

            VizBroadcast.chroniclePost(text, function(err) {
                if (err) {
                    Toast.error(Helpers.t('error_network'));
                } else {
                    _injectLocalPost(text);
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

        feed.innerHTML = '<p class="empty-state">' + Helpers.t('loading') + '</p>';

        var state = StateEngine.getState();
        var entries = _collectPostEntries(state);
        var accounts = _getFeedAccounts(state);

        if (!accounts.length || typeof VoiceProtocol === 'undefined' || !VoiceProtocol.loadChronicle) {
            _renderFeedEntries(_filterByTab(entries, state));
            return;
        }

        _loadVoiceEntriesForAccounts(accounts, 20, function(voiceEntries) {
            for (var i = 0; i < voiceEntries.length; i++) {
                entries.push(voiceEntries[i]);
            }
            _renderFeedEntries(_filterByTab(_dedupeEntries(entries), state));
        });
    }

    function _getFeedAccounts(state) {
        var accounts = [];
        var seen = {};
        var user = VizAccount.getCurrentUser();

        function add(account) {
            if (!account || seen[account]) return;
            seen[account] = true;
            accounts.push(account);
        }

        add(user);

        if (state && state.social && state.social.knownAccounts) {
            for (var i = 0; i < state.social.knownAccounts.length; i++) {
                add(state.social.knownAccounts[i]);
            }
        }

        if (state && state.characters) {
            for (var account in state.characters) {
                if (state.characters.hasOwnProperty(account)) add(account);
            }
        }

        if (typeof GuildSystem !== 'undefined' && state && state.guilds && user) {
            var guild = GuildSystem.findGuildByMember(state.guilds, user);
            if (guild && guild.members) {
                for (var member in guild.members) {
                    if (guild.members.hasOwnProperty(member)) add(member);
                }
            }
        }

        return accounts;
    }

    function _loadVoiceEntriesForAccounts(accounts, maxEntries, callback) {
        var allEntries = [];
        var index = 0;

        function next() {
            if (index >= accounts.length) {
                callback(allEntries);
                return;
            }

            var account = accounts[index++];
            VoiceProtocol.loadChronicle(account, maxEntries, function(err, voiceEntries) {
                if (!err && voiceEntries && voiceEntries.length) {
                    for (var i = 0; i < voiceEntries.length; i++) {
                        var normalized = _normalizeVoiceEntry(voiceEntries[i]);
                        if (normalized) allEntries.push(normalized);
                    }
                }
                next();
            });
        }

        next();
    }

    function _normalizeVoiceEntry(voiceEntry) {
        if (!voiceEntry || !voiceEntry.message) return null;
        var voiceText = '';
        if (voiceEntry.message.type === 'text') voiceText = voiceEntry.message.text || '';
        else if (voiceEntry.message.type === 'publication') voiceText = voiceEntry.message.title || voiceEntry.message.description || '';
        if (!voiceText || !_hasRequiredTag(voiceText)) return null;

        return {
            type: 'voice',
            account: voiceEntry.sender,
            text: voiceText,
            actionType: 'chronicle_post',
            timestamp: voiceEntry.blockTime || null,
            blockNum: voiceEntry.blockNum || 0
        };
    }

    function _collectPostEntries(state) {
        var entries = [];

        if (state.recentActions) {
            for (var i = state.recentActions.length - 1; i >= 0 && entries.length < 50; i--) {
                var action = state.recentActions[i];
                var postText = _actionToPostText(action);
                if (postText && _entryMatchesRequiredTag(action.type, postText)) {
                    entries.push({
                        type: 'action',
                        account: action.sender,
                        text: postText,
                        actionType: action.type,
                        timestamp: action.timestamp,
                        blockNum: action.blockNum
                    });
                }
            }
        }

        return entries;
    }

    function _renderFeedEntries(entries) {
        var feed = Helpers.$('chronicle-feed');
        if (!feed) return;

        entries.sort(function(a, b) {
            return (b.blockNum || 0) - (a.blockNum || 0);
        });

        if (entries.length === 0) {
            feed.innerHTML = '<p class="empty-state">' + Helpers.t('chronicle_empty') + '</p>';
            return;
        }

        var html = '';
        for (var k = 0; k < entries.length; k++) {
            html += _renderEntry(entries[k]);
        }
        feed.innerHTML = html;

        var blessBtns = feed.querySelectorAll('.bless-button');
        for (var m = 0; m < blessBtns.length; m++) {
            blessBtns[m].addEventListener('click', _onBless);
        }
    }

    function _dedupeEntries(entries) {
        var seen = {};
        var out = [];
        for (var i = 0; i < entries.length; i++) {
            var key = (entries[i].account || '') + '|' + (entries[i].blockNum || 0) + '|' + (entries[i].actionType || '') + '|' + (entries[i].text || '');
            if (seen[key]) continue;
            seen[key] = true;
            out.push(entries[i]);
        }
        return out;
    }

    function _injectLocalPost(text) {
        var state = StateEngine.getState();
        var user = VizAccount.getCurrentUser();
        if (!state || !user) return;
        state.recentActions.push({
            type: 'chronicle_post',
            sender: user,
            blockNum: (state.headBlock || 0) + 1,
            timestamp: Date.now(),
            text: text,
            message: { type: 'text', text: text },
            events: []
        });
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
                    'aria-label="' + Helpers.escapeHtml(t('chronicle_bless_cost', { cost: Helpers.manaCost(BLESS_ENERGY), name: charName })) + '">' +
                    '✨ ' + t('chronicle_bless') + ' · ' + Helpers.manaCost(BLESS_ENERGY) +
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

        var memo = BLESS_MEMO_PREFIX + account;
        VizBroadcast.award(account, BLESS_ENERGY, 0, memo, [], function(err) {
            if (err) {
                Toast.error(Helpers.t('error_low_mana'));
            } else {
                Toast.success('\u2728 ' + Helpers.t('chronicle_blessed'));
                SoundManager.play('bless_recv');
            }
        });
    }

    function _hasRequiredTag(text) {
        if (!text) return false;
        return String(text).toLowerCase().indexOf(REQUIRED_TAG) !== -1;
    }

    function _ensureRequiredTag(text) {
        text = (text || '').trim();
        if (!text) return '';
        if (_hasRequiredTag(text)) return text;
        return text + ' ' + REQUIRED_TAG;
    }

    function _entryMatchesRequiredTag(actionType, text) {
        if (actionType === 'chronicle_post') {
            return _hasRequiredTag(text);
        }
        return true;
    }

    function _actionToPostText(action) {
        if (!action || action.type !== 'chronicle_post') return null;
        return action.text || (action.message && action.message.text) || '';
    }

    function _filterByTab(entries, state) {
        if (currentTab === 'all') return entries;

        var user = VizAccount.getCurrentUser();
        if (currentTab === 'friends') {
            return user ? entries.filter(function(e) { return e.account === user; }) : [];
        }

        if (currentTab === 'guild') {
            if (typeof GuildSystem === 'undefined' || !state || !state.guilds || !user) return [];
            var guild = GuildSystem.findGuildByMember(state.guilds, user);
            if (!guild || !guild.members) return [];
            return entries.filter(function(e) {
                return e.account && guild.members[e.account];
            });
        }

        if (currentTab === 'world') {
            return entries.filter(function(e) {
                return e.type === 'voice' || e.actionType === 'chronicle_post';
            });
        }

        return entries;
    }

    function _getActionIcon(actionType) {
        var icons = {
            'chronicle_post': '\uD83D\uDCDD',
            'hunt': '\u2694\uFE0F',
            'hunt_victory': '\uD83C\uDFC6',
            'hunt_defeat': '\uD83D\uDCA8',
            'character_created': '\u2728',
            'rest_complete': '\uD83D\uDCA4',
            'blessing_sent': '\u2728',
            'duel_completed': '\u2694\uFE0F',
            'duel_forfeit': '\uD83C\uDFF3\uFE0F'
        };
        return icons[actionType] || '\uD83D\uDCDC';
    }

    return { render: render };
})();
