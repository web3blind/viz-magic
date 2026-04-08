/**
 * Viz Magic — Home Dashboard Screen
 * With Phase 5: Daily Prophecy, world event banners, boss alert.
 */
var HomeScreen = (function() {
    'use strict';

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-home');
        if (!el) return;

        var user = VizAccount.getCurrentUser();
        var character = StateEngine.getCharacter(user);
        var state = StateEngine.getState();
        var blockNum = state.headBlock || 0;

        if (!character) {
            character = { name: user || 'Mage', className: 'embercaster', level: 1, hp: 100, maxHp: 100, xp: 0 };
        }

        var xpNeeded = GameFormulas.xpForLevel(character.level + 1) || 1000;
        var xpCurrent = character.xp - GameFormulas.totalXpForLevel(character.level);
        if (xpCurrent < 0) xpCurrent = 0;

        el.innerHTML =
            '<div class="home-dashboard">' +
                // World event banner
                _renderWorldEventBanner(state, blockNum, t) +

                // Boss alert
                _renderBossAlert(state, blockNum, t) +

                '<section class="home-summary" aria-label="Character summary">' +
                    '<h1>' + t('home_welcome') + ', ' + Helpers.escapeHtml(character.name) + '</h1>' +
                    '<p>' + Helpers.classIcon(character.className) + ' ' + t('class_' + character.className) +
                        ' \u2022 ' + t('home_level') + ' ' + character.level + '</p>' +
                    ProgressBar.create({id:'hp-bar', label:'HP', value:character.hp, max:character.maxHp, color:'#e53935'}) +
                    ProgressBar.create({id:'xp-bar', label:'XP', value:xpCurrent, max:xpNeeded, color:'#ffc107'}) +
                    ProgressBar.create({id:'mana-bar', label:'⚡ ' + t('home_mana'), value:0, max:100, color:'#2196f3'}) +
                    '<button class="help-tip-btn" aria-label="' + t('help_tip_mana') + '" ' +
                    'title="' + t('help_tip_mana') + '" ' +
                    'onclick="Helpers.EventBus.emit(\'navigate\', \'help\')">❓</button>' +
                '</section>' +

                // Season indicator
                _renderSeasonIndicator(state, blockNum, t) +

                // Daily Prophecy
                _renderDailyProphecy(character, state, blockNum, t) +

                '<section class="home-actions" aria-label="Quick actions">' +
                    '<div class="action-grid">' +
                        _tile('hunt', '\u2694\uFE0F', t('home_quick_hunt')) +
                        _tile('quests', '\uD83D\uDCDC', t('nav_quests')) +
                        _tile('map', '\uD83D\uDDFA\uFE0F', t('nav_map')) +
                        _tile('inventory', '\uD83C\uDF92', t('home_bag')) +
                        _tile('chronicle', '\uD83D\uDCDD', t('home_chronicle')) +
                        _tile('character', '\uD83E\uDDD9', t('nav_character')) +
                        _tile('arena', '\u2694\uFE0F', t('nav_duel') || 'Арена') +
                        _tile('settings', '\u2699\uFE0F', t('settings')) +
                    '</div>' +
                '</section>' +
            '</div>';

        var tiles = el.querySelectorAll('.action-tile');
        for (var i = 0; i < tiles.length; i++) {
            tiles[i].addEventListener('click', function() {
                SoundManager.play('tap');
                Helpers.EventBus.emit('navigate', this.getAttribute('data-screen'));
            });
        }

        // Boss alert click
        var bossAlert = el.querySelector('.boss-alert');
        if (bossAlert) {
            bossAlert.addEventListener('click', function() {
                SoundManager.play('tap');
                Helpers.EventBus.emit('navigate', 'world-boss');
            });
        }

        // Fetch real mana from blockchain
        if (user) {
            VizAccount.getAccount(user, function(err, accountData) {
                if (!err && accountData) {
                    var currentEnergy = VizAccount.calculateCurrentEnergy(accountData);
                    ProgressBar.update('mana-bar', currentEnergy / 100, 100);
                }
            });
        }
    }

    function _renderWorldEventBanner(state, blockNum, t) {
        if (typeof WorldEvents === 'undefined') return '';

        var events = WorldEvents.getActiveEvents(blockNum);
        if (events.length === 0) return '';

        var html = '<div class="world-event-banner" role="status" aria-live="polite">';
        for (var i = 0; i < events.length; i++) {
            var evt = events[i];
            if (evt.type === 'world_boss') continue; // Shown separately
            var timeLeft = Math.floor(evt.blocksRemaining * 3 / 60);
            var timeStr = timeLeft > 60 ? Math.floor(timeLeft / 60) + 'h' : timeLeft + 'm';
            html += '<div class="event-banner-item">' +
                '<span class="event-icon" aria-hidden="true">' + evt.icon + '</span>' +
                '<span class="event-name">' + t(evt.nameKey) + '</span>' +
                '<span class="event-timer">' + timeStr + '</span>' +
            '</div>';
        }
        html += '</div>';
        return html;
    }

    function _renderBossAlert(state, blockNum, t) {
        if (!state.worldBoss || !state.worldBoss.active || state.worldBoss.defeated) return '';

        var bossStatus = (typeof WorldBoss !== 'undefined') ? WorldBoss.getBossStatus(state.worldBoss, '', blockNum) : null;
        if (!bossStatus || !bossStatus.active) return '';

        return '<button class="boss-alert" role="alert" aria-label="' + t('boss_active_alert') + '">' +
            '<span class="boss-alert-icon" aria-hidden="true">\uD83D\uDC32</span>' +
            '<span class="boss-alert-text">' + t('boss_active_alert') + '</span>' +
            '<span class="boss-alert-hp">' + bossStatus.hpPercent + '% HP</span>' +
        '</button>';
    }

    function _renderSeasonIndicator(state, blockNum, t) {
        if (typeof WorldEvents === 'undefined') return '';
        var season = WorldEvents.getCurrentSeason(blockNum);
        if (!season) return '';

        return '<div class="season-indicator">' +
            '<span class="season-icon" aria-hidden="true">' + season.icon + '</span>' +
            '<span class="season-name">' + t(season.nameKey) + '</span>' +
            '<span class="season-bonus">' + t('school_' + season.dominant) + ' +20%, ' +
                t('school_' + season.secondary) + ' +10%</span>' +
        '</div>';
    }

    function _renderDailyProphecy(character, state, blockNum, t) {
        if (typeof QuestSystem === 'undefined') return '';

        var prophecy = QuestSystem.generateDailyProphecy(blockNum, character.level);
        if (!prophecy) return '';

        return '<section class="home-prophecy" aria-label="' + t('home_daily_prophecy') + '">' +
            '<div class="prophecy-mini">' +
                '<span class="prophecy-icon" aria-hidden="true">\uD83D\uDD2E</span>' +
                '<div class="prophecy-info">' +
                    '<h3>' + t('home_daily_prophecy') + '</h3>' +
                    '<p>' + t(prophecy.titleKey) + '</p>' +
                    '<p><small>' + t('quest_daily_help_text') + '</small></p>' +
                    '<span class="prophecy-reward">\u2B50 ' + (prophecy.rewards ? prophecy.rewards.xp : 0) + ' XP</span>' +
                '</div>' +
            '</div>' +
        '</section>';
    }

    function _tile(screen, icon, label) {
        return '<button class="action-tile" data-screen="' + screen + '" aria-label="' + label + '">' +
            '<span class="tile-icon" aria-hidden="true">' + icon + '</span>' +
            '<span class="tile-label">' + label + '</span>' +
            '</button>';
    }

    return { render: render };
})();
