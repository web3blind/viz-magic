/**
 * Viz Magic — Realm Chronicle (Social Feed) Screen
 * Functional feed with tabs, bless button, post composer, and narrative cards.
 */
var ChronicleScreen = (function() {
    'use strict';

    var MAX_POST_LENGTH = 280;
    var BLESS_ENERGY_LOW = 10;   // 0.1% = 10 basis points
    var BLESS_ENERGY_HIGH = 100; // 1% = 100 basis points
    var BLESS_MEMO_PREFIX = 'viz://vm/bless/';
    var currentTab = 'all'; // all, guild, friends, world
    var REQUIRED_TAG = '#viz_magic';
    var cachedFeedHtml = {};
    var DRAFT_KEY = VizMagicConfig.STORAGE_PREFIX + 'chronicle_draft';
    var FEED_CACHE_PREFIX = VizMagicConfig.STORAGE_PREFIX + 'chronicle_feed_';

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
                    'aria-label="' + t('chronicle_write') + '">' + Helpers.escapeHtml(_getDraft()) + '</textarea>' +
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

    function _getDraft() {
        try { return localStorage.getItem(DRAFT_KEY) || ''; } catch (e) { return ''; }
    }

    function _setDraft(text) {
        try { localStorage.setItem(DRAFT_KEY, text || ''); } catch (e) {}
    }

    function _getCachedFeed(tab) {
        try { return localStorage.getItem(FEED_CACHE_PREFIX + tab) || ''; } catch (e) { return ''; }
    }

    function _setCachedFeed(tab, html) {
        try { localStorage.setItem(FEED_CACHE_PREFIX + tab, html || ''); } catch (e) {}
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
                _setDraft(this.value);
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
            var optimisticBlock = _injectLocalPost(text);
            _renderLocalFeedNow();
            Helpers.$('chronicle-input').value = '';
            _setDraft('');
            Helpers.$('chronicle-char-count').textContent = '0/' + MAX_POST_LENGTH;

            VizBroadcast.chroniclePost(text, function(err) {
                if (err) {
                    _removeLocalPost(optimisticBlock, text);
                    _renderLocalFeedNow();
                    Toast.error(Helpers.t('error_network'));
                } else {
                    Toast.success('\u2728 ' + Helpers.t('chronicle_send'));
                    _loadFeed();
                }
            });
        });
    }

    function _loadFeed() {
        var feed = Helpers.$('chronicle-feed');
        if (!feed) return;

        if (!cachedFeedHtml[currentTab]) cachedFeedHtml[currentTab] = _getCachedFeed(currentTab);
        if (cachedFeedHtml[currentTab]) {
            feed.innerHTML = cachedFeedHtml[currentTab];
            _bindBlessButtons(feed);
        } else {
            feed.innerHTML = '<p class="empty-state">' + Helpers.t('loading') + '</p>';
        }

        var state = StateEngine.getState();
        var entries = _collectPostEntries(state);
        var accounts = _getFeedAccounts(state);

        _renderFeedEntries(_filterByTab(_dedupeEntries(entries), state));

        if (!accounts.length || typeof VoiceProtocol === 'undefined' || !VoiceProtocol.loadChronicle) {
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

        // Discover accounts from guild listings (visible even on fresh devices)
        if (state && state.guildListings) {
            for (var gl = 0; gl < state.guildListings.length; gl++) {
                if (state.guildListings[gl].sender) add(state.guildListings[gl].sender);
            }
        }

        // Discover accounts from all known guilds' member rosters
        if (state && state.guilds) {
            for (var gid in state.guilds) {
                if (state.guilds.hasOwnProperty(gid) && state.guilds[gid].members) {
                    for (var gm in state.guilds[gid].members) {
                        if (state.guilds[gid].members.hasOwnProperty(gm)) add(gm);
                    }
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
                        receiver: action.receiver || '',
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

    /** Increase recentActions limit to allow more chronicle content */
    var RECENT_ACTIONS_LIMIT = 200;

    function _renderFeedEntries(entries) {
        var feed = Helpers.$('chronicle-feed');
        if (!feed) return;

        entries.sort(function(a, b) {
            return (b.blockNum || 0) - (a.blockNum || 0);
        });

        var user = VizAccount.getCurrentUser();
        var blessableCount = 0;
        for (var b = 0; b < entries.length; b++) {
            if (entries[b].account && entries[b].account !== user) blessableCount++;
        }

        if (entries.length === 0) {
            feed.innerHTML = '<p class="empty-state">' + Helpers.t('chronicle_empty') + '</p>' +
                '<p class="chronicle-hint">' + Helpers.t('chronicle_bless_posts_only_hint') + '</p>';
            cachedFeedHtml[currentTab] = feed.innerHTML;
            return;
        }

        var html = '';
        if (blessableCount === 0) {
            html += '<p class="chronicle-hint">' + Helpers.t('chronicle_no_bless_targets_hint') + '</p>';
        }
        for (var k = 0; k < entries.length; k++) {
            html += _renderEntry(entries[k]);
        }
        feed.innerHTML = html;
        cachedFeedHtml[currentTab] = html;
        _setCachedFeed(currentTab, html);
        _bindBlessButtons(feed);
    }

    function _bindBlessButtons(feed) {
        var blessBtns = feed.querySelectorAll('.bless-button');
        for (var m = 0; m < blessBtns.length; m++) {
            blessBtns[m].addEventListener('click', _onBless);
        }
    }

    function _dedupeEntries(entries) {
        var seen = {};
        var out = [];
        for (var i = 0; i < entries.length; i++) {
            var key;
            if (entries[i].actionType === 'blessing_sent') {
                key = (entries[i].account || '') + '|blessing_sent|' + (entries[i].receiver || '') + '|' + (entries[i].text || '');
            } else if (entries[i].actionType === 'chronicle_post') {
                key = (entries[i].account || '') + '|chronicle_post|' + _normalizeDedupeText(entries[i].text || '');
            } else {
                key = (entries[i].account || '') + '|' + (entries[i].blockNum || 0) + '|' + (entries[i].actionType || '') + '|' + (entries[i].text || '');
            }
            if (seen[key]) continue;
            seen[key] = true;
            out.push(entries[i]);
        }
        return out;
    }

    function _normalizeDedupeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function _injectLocalPost(text) {
        var state = StateEngine.getState();
        var user = VizAccount.getCurrentUser();
        if (!state || !user) return 0;
        if (!state.recentActions) state.recentActions = [];
        var optimisticBlock = (state.headBlock || 0) + 1;
        state.recentActions.push({
            type: 'chronicle_post',
            sender: user,
            blockNum: optimisticBlock,
            timestamp: Date.now(),
            text: text,
            message: { type: 'text', text: text },
            optimistic: true,
            events: []
        });
        cachedFeedHtml = {};
        return optimisticBlock;
    }

    function _removeLocalPost(blockNum, text) {
        var state = StateEngine.getState();
        var user = VizAccount.getCurrentUser();
        if (!state || !state.recentActions || !user) return;
        for (var i = state.recentActions.length - 1; i >= 0; i--) {
            var action = state.recentActions[i];
            if (action && action.optimistic && action.sender === user && action.blockNum === blockNum && action.text === text) {
                state.recentActions.splice(i, 1);
                break;
            }
        }
        cachedFeedHtml = {};
    }

    function _renderLocalFeedNow() {
        var state = StateEngine.getState();
        var entries = _collectPostEntries(state);
        _renderFeedEntries(_filterByTab(_dedupeEntries(entries), state));
    }

    function _injectLocalBlessing(account, energy) {
        var state = StateEngine.getState();
        var user = VizAccount.getCurrentUser();
        if (!state || !user || !account) return;
        state.recentActions.push({
            type: 'blessing_sent',
            sender: user,
            receiver: account,
            blockNum: (state.headBlock || 0) + 1,
            timestamp: Date.now(),
            energy: energy || BLESS_ENERGY_LOW,
            memo: BLESS_MEMO_PREFIX + account,
            events: []
        });
        cachedFeedHtml = {};
        _updateLocalBlessingQuestProgress(account);
    }

    function _updateLocalBlessingQuestProgress(account) {
        var state = StateEngine.getState();
        var user = VizAccount.getCurrentUser();
        if (!state || !user || !account || !state.quests || !state.quests[user] || typeof QuestSystem === 'undefined') return;
        QuestSystem.updateQuestProgress(state.quests[user], 'social', { target: 'blessing', uniqueKey: account, count: 1 });
        try {
            CheckpointSystem.saveCheckpoint('global', state.headBlock || 0, state, function() {});
        } catch (e) {}
    }

    function _renderEntry(entry) {
        var t = Helpers.t;
        var charInfo = StateEngine.getCharacter(entry.account);
        var charName = (charInfo && charInfo.name) || entry.account || '???';
        var icon = _getActionIcon(entry.actionType);
        var timeStr = entry.timestamp ? Helpers.timeAgo(entry.timestamp) : '';

        var user = VizAccount.getCurrentUser();
        var canBless = entry.account && user && entry.account !== user;
        var actionsHtml = '';

        if (canBless) {
            actionsHtml = '<div class="chronicle-actions">' +
                '<button class="bless-button" data-account="' + (entry.account || '') + '" data-energy="' + BLESS_ENERGY_LOW + '" ' +
                    'aria-label="' + Helpers.escapeHtml(t('chronicle_bless')) + ' ' + Helpers.manaCost(BLESS_ENERGY_LOW) + '">' +
                    '✨ ' + Helpers.manaCost(BLESS_ENERGY_LOW) +
                '</button>' +
                '<button class="bless-button" data-account="' + (entry.account || '') + '" data-energy="' + BLESS_ENERGY_HIGH + '" ' +
                    'aria-label="' + Helpers.escapeHtml(t('chronicle_bless')) + ' ' + Helpers.manaCost(BLESS_ENERGY_HIGH) + '">' +
                    '✨ ' + Helpers.manaCost(BLESS_ENERGY_HIGH) +
                '</button>' +
            '</div>';
        }

        return '<article class="chronicle-entry" role="article" aria-label="' + Helpers.escapeHtml(charName) + '">' +
            '<div class="chronicle-entry-header">' +
                '<span class="chronicle-icon" aria-hidden="true">' + icon + '</span>' +
                '<strong class="chronicle-author">' + Helpers.escapeHtml(charName) + '</strong>' +
                (timeStr ? '<span class="chronicle-time">' + timeStr + '</span>' : '') +
            '</div>' +
            '<p class="chronicle-text">' + Helpers.escapeHtml(entry.text) + '</p>' +
            actionsHtml +
            '</article>';
    }

    function _onBless() {
        var account = this.getAttribute('data-account');
        var energy = parseInt(this.getAttribute('data-energy'), 10) || BLESS_ENERGY_HIGH;
        if (!account) return;

        var user = VizAccount.getCurrentUser();
        if (!user || user === account) return;

        SoundManager.play('bless_send');
        SoundManager.vibrate('light');

        var memo = BLESS_MEMO_PREFIX + account;
        VizBroadcast.award(account, energy, 0, memo, [], function(err) {
            if (err) {
                Toast.error(Helpers.t('error_low_mana'));
            } else {
                _injectLocalBlessing(account, energy);
                Toast.success('\u2728 ' + Helpers.t('chronicle_blessed'));
                SoundManager.play('bless_recv');
                _loadFeed();
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
        // Only chronicle_post entries require the #viz_magic tag
        // Game actions (hunt, duel, etc.) are always shown
        if (actionType === 'chronicle_post') {
            return _hasRequiredTag(text);
        }
        return true;
    }

    function _actionToPostText(action) {
        if (!action) return null;
        // Chronicle posts — return the text itself
        if (action.type === 'chronicle_post') {
            return action.text || (action.message && action.message.text) || '';
        }
        // Blessing entries from _processAward
        if (action.type === 'blessing_sent') {
            var blessName = _getCharName(action.sender);
            return Helpers.t('chronicle_narrative_bless', { name: blessName, target: (action.receiver || '') });
        }
        // Game actions from recentActions — generate narrative text
        var t = Helpers.t;
        var name = _getCharName(action.sender);
        // Check events array for result type
        var ev0 = (action.events && action.events.length > 0) ? action.events[0] : null;

        switch (action.type) {
            case 'hunt':
            case 'hunt.armageddon':
                if (ev0 && ev0.type === 'hunt_victory') {
                    return t('chronicle_narrative_hunt_win', { name: name, creature: (ev0.creature || '') });
                } else if (ev0 && ev0.type === 'hunt_defeat') {
                    return t('chronicle_narrative_hunt_lose', { name: name, creature: (ev0.creature || '') });
                }
                return t('chronicle_narrative_hunt', { name: name });
            case 'char.attune':
                return t('chronicle_narrative_awaken', { name: name });
            case 'rest':
                return t('chronicle_narrative_rest', { name: name });
            case 'craft':
                var itemName = (ev0 && ev0.itemName) ? ev0.itemName : '';
                return t('chronicle_narrative_craft', { name: name, item: itemName });
            case 'guild.create':
                var guildName = _guildNameForCreateAction(action, ev0);
                return t('chronicle_narrative_guild_created', { name: name, guild: guildName });
            case 'guild.accept':
                var gJoin = _guildDisplayName(ev0 && ev0.guildId, ev0 && ev0.guildName);
                return t('chronicle_narrative_guild_join', { name: name, guild: gJoin });
            case 'temple.offering':
                if (ev0 && ev0.type === 'temple_offering') {
                    return t('chronicle_narrative_temple', { name: name, deity: t('temple_' + ev0.deity + '_name') });
                }
                return null;
            case 'boss.attack':
                return name + ' ' + (t('boss_attack') || 'attacks the boss') + '!';
            case 'challenge':
            case 'reveal':
                return null; // Duel steps are noisy, skip
            default:
                return null;
        }
    }

    function _getCharName(account) {
        if (!account) return '???';
        var charInfo = StateEngine.getCharacter(account);
        return (charInfo && charInfo.name) ? charInfo.name : account;
    }

    function _guildNameForCreateAction(action, ev0) {
        if (ev0 && (ev0.guildName || ev0.guildId)) {
            return _guildDisplayName(ev0.guildId, ev0.guildName);
        }

        var state = StateEngine.getState();
        if (state && state.guilds) {
            for (var guildId in state.guilds) {
                if (!state.guilds.hasOwnProperty(guildId)) continue;
                var guild = state.guilds[guildId];
                if (!guild) continue;
                if (action && guild.createdBlock && action.blockNum && guild.createdBlock === action.blockNum) {
                    return guild.name || guildId;
                }
                if (action && action.sender && guild.founder === action.sender) {
                    return guild.name || guildId;
                }
            }
        }

        return Helpers.t('chronicle_unknown_guild');
    }

    function _guildDisplayName(guildId, eventName) {
        if (eventName) return eventName;
        var state = StateEngine.getState();
        if (guildId && state && state.guilds && state.guilds[guildId]) {
            return state.guilds[guildId].name || guildId;
        }
        return guildId || Helpers.t('chronicle_unknown_guild');
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
