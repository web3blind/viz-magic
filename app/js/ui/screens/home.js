/**
 * Viz Magic — Home Dashboard Screen
 * With Phase 5: Daily Prophecy, world event banners, boss alert.
 */
var HomeScreen = (function() {
    'use strict';

    var PRIMARY_HOME_SCREENS = ['home', 'inventory', 'guild', 'crafting', 'map', 'hunt', 'quests', 'arena', 'marketplace', 'temple', 'world-boss'];
    var SECONDARY_HOME_SCREENS = ['character', 'leaderboard', 'chronicle', 'settings', 'help', 'developers'];
    var HOME_HP_DISPLAY_MAX = 5000;
    var HOME_XP_DISPLAY_MAX = 3000;

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
        var hpShown = _scaleForDisplay(character.hp, character.maxHp, HOME_HP_DISPLAY_MAX);
        var xpShown = _scaleForDisplay(xpCurrent, xpNeeded, HOME_XP_DISPLAY_MAX);

        el.innerHTML =
            '<div class="home-dashboard">' +
                // World event banner
                _renderWorldEventBanner(state, blockNum, t) +

                // Boss alert
                _renderBossAlert(state, blockNum, t) +

                '<section class="home-summary home-summary-button" role="button" tabindex="0" aria-label="' + t('home_open_character') + '">' +
                    '<h1>' + t('home_welcome') + ', ' + Helpers.escapeHtml(character.name) + '</h1>' +
                    '<p>' + Helpers.classIcon(character.className) + ' ' + t('class_' + character.className) +
                        ' \u2022 ' + t('home_level') + ' ' + character.level + '</p>' +
                    ProgressBar.create({id:'hp-bar', label:'❤️ HP', value:character.hp, max:character.maxHp, displayValue:hpShown, displayMax:HOME_HP_DISPLAY_MAX, color:'#e53935'}) +
                    ProgressBar.create({id:'xp-bar', label:'⭐ XP', value:xpCurrent, max:xpNeeded, displayValue:xpShown, displayMax:HOME_XP_DISPLAY_MAX, color:'#ffc107'}) +
                    ProgressBar.create({id:'mana-bar', label:'⚡ ' + t('home_mana'), value:0, max:100, color:'#2196f3'}) +
                    '<button class="help-tip-btn" aria-label="' + t('help_tip_mana') + '" ' +
                    'title="' + t('help_tip_mana') + '" ' +
                    'onclick="Helpers.EventBus.emit(\'navigate\', \'help\')">❓</button>' +
                '</section>' +

                // Season indicator
                _renderSeasonIndicator(state, blockNum, t) +

                // Daily Prophecy
                _renderDailyProphecy(character, state, blockNum, t) +

                '<section class="home-actions" aria-label="' + t('home_primary_actions') + '">' +
                    '<h2>' + t('home_primary_actions') + '</h2>' +
                    '<div class="action-grid">' +
                        _renderActionTiles(PRIMARY_HOME_SCREENS, true) +
                    '</div>' +
                '</section>' +
                '<section class="home-actions home-actions-secondary" aria-label="' + t('home_secondary_actions') + '">' +
                    '<h2>' + t('home_secondary_actions') + '</h2>' +
                    '<div class="action-grid">' +
                        _renderActionTiles(SECONDARY_HOME_SCREENS, false) +
                    '</div>' +
                '</section>' +
                '<section class="home-install" aria-label="' + t('home_install_shortcut') + '">' +
                    '<h2><span class="section-icon vmagic-breathe" aria-hidden="true">\uD83D\uDCF2</span> ' + t('home_install_shortcut') + '</h2>' +
                    '<p>' + t('home_install_shortcut_text') + '</p>' +
                    '<button type="button" class="btn btn-secondary" id="btn-install-shortcut">' + t('home_install_shortcut_button') + '</button>' +
                '</section>' +
            '</div>';

        var tiles = el.querySelectorAll('.action-tile');
        for (var i = 0; i < tiles.length; i++) {
            tiles[i].addEventListener('click', function() {
                SoundManager.play('tap');
                Helpers.EventBus.emit('navigate', this.getAttribute('data-screen'));
            });
        }

        var eventButtons = el.querySelectorAll('.event-banner-button');
        for (var eb = 0; eb < eventButtons.length; eb++) {
            eventButtons[eb].addEventListener('click', function() {
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

        var prophecyBtn = el.querySelector('.prophecy-mini-button');
        if (prophecyBtn) {
            prophecyBtn.addEventListener('click', function() {
                SoundManager.play('tap');
                Helpers.EventBus.emit('navigate', 'quests');
            });
        }

        var summaryBtn = el.querySelector('.home-summary-button');
        if (summaryBtn) {
            summaryBtn.addEventListener('click', function(e) {
                if (e.target && e.target.closest && e.target.closest('.help-tip-btn')) return;
                SoundManager.play('tap');
                Helpers.EventBus.emit('navigate', 'character');
            });
            summaryBtn.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    SoundManager.play('tap');
                    Helpers.EventBus.emit('navigate', 'character');
                }
            });
        }

        var installBtn = Helpers.$('btn-install-shortcut');
        if (installBtn) {
            installBtn.addEventListener('click', function() {
                SoundManager.play('tap');
                if (typeof App !== 'undefined' && App.installShortcut) {
                    App.installShortcut();
                }
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

    function _scaleForDisplay(value, max, displayMax) {
        if (!max || max <= 0) return 0;
        var shown = Math.round(Math.max(0, value) * displayMax / max);
        if (shown > displayMax) shown = displayMax;
        return shown;
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
            var descKey = evt.nameKey + '_desc';
            var desc = t(descKey);
            if (!desc || desc === descKey) desc = '';
            var target = evt.type === 'minor_rift' ? 'hunt' : '';
            var tag = target ? 'button' : 'div';
            var attrs = target ? ' type="button" data-screen="' + target + '"' : '';
            var effectBadge = evt.type === 'weave_surge' ? '<span class="event-effect-badge">⚡ Мана ×' + (evt.manaRegenMultiplier || 2) + '</span>' : '';
            html += '<' + tag + ' class="event-banner-item event-banner-' + evt.type + (target ? ' event-banner-button' : '') + '"' + attrs + ' aria-label="' +
                t(evt.nameKey) + (desc ? '. ' + desc : '') + ' ' + t('event_time_left', {time: timeStr}) + '">' +
                '<span class="event-icon" aria-hidden="true">' + evt.icon + '</span>' +
                '<span class="event-copy">' +
                    '<span class="event-name">' + t(evt.nameKey) + '</span>' +
                    (desc ? '<span class="event-desc">' + desc + '</span>' : '') +
                '</span>' +
                effectBadge +
                '<span class="event-timer">' + timeStr + '</span>' +
            '</' + tag + '>';
        }
        html += '</div>';
        return html;
    }

    function _renderBossAlert(state, blockNum, t) {
        if (!state.worldBoss || !state.worldBoss.active || state.worldBoss.defeated) return '';

        var bossStatus = (typeof WorldBoss !== 'undefined') ? WorldBoss.getBossStatus(state.worldBoss, '', blockNum) : null;
        if (!bossStatus || !bossStatus.active) return '';

        return '<button class="boss-alert" role="alert" aria-label="' + t('boss_active_alert') + '">' +
            '<span class="boss-alert-mark" aria-hidden="true">🐲</span>' +
            '<span class="boss-alert-text">' + t('boss_active_alert') + '</span>' +
            '<span class="boss-alert-hp">' + bossStatus.hpPercent + '% HP</span>' +
        '</button>';
    }

    function _renderSeasonIndicator(state, blockNum, t) {
        if (typeof WorldEvents === 'undefined') return '';
        var season = WorldEvents.getCurrentSeason(blockNum);
        if (!season) return '';

        var sky = WorldEvents.getCurrentSky ? WorldEvents.getCurrentSky(blockNum) : null;
        var weather = WorldEvents.getCurrentWeather ? WorldEvents.getCurrentWeather(blockNum) : null;
        var skyText = sky ? (sky.summaryText || t(sky.summaryKey)) : '';
        var forecast = weather ? t(weather.summaryKey) : '';
        var effect = weather ? t(weather.effectKey) : '';
        var festival = WorldEvents.getCurrentFestival ? WorldEvents.getCurrentFestival(blockNum) : null;
        var magicNews = WorldEvents.getCurrentMagicNews ? WorldEvents.getCurrentMagicNews(blockNum) : null;
        var festivalHtml = festival ? '<div class="forecast-card forecast-card-festival">' +
                '<span class="forecast-kicker">' + t(festival.prefixKey || 'festival_today_prefix') + '</span>' +
                '<p class="forecast-line"><span class="forecast-icon vmagic-breathe" aria-hidden="true">' + (festival.icon || '🎆') + '</span> ' + t(festival.nameKey) + '</p>' +
                '<p class="forecast-omen">' + (festival.descText || t(festival.descKey)) + '</p>' +
            '</div>' : '';
        return '<section class="season-indicator magical-forecast" aria-label="' + t('weather_forecast_label') + '">' +
            '<div class="forecast-card forecast-card-season">' +
                '<span class="forecast-icon forecast-weather-icon" aria-hidden="true">\uD83E\uDDED</span>' +
                '<span class="forecast-kicker">' + t('weather_forecast_title') + '</span>' +
                '<p class="forecast-line">' + t(season.nameKey) + '</p>' +
            '</div>' +
            '<div class="forecast-card forecast-card-sky">' +
                '<span class="forecast-icon forecast-sky-icon" aria-hidden="true">' + (sky ? sky.icon : '\u26C5') + '</span>' +
                '<span class="forecast-kicker">' + t('weather_sky_title') + '</span>' +
                '<p class="forecast-line">' + skyText + '</p>' +
            '</div>' +
            '<div class="forecast-card forecast-card-effect">' +
                '<span class="forecast-icon vmagic-breathe" aria-hidden="true">\uD83C\uDFF9</span>' +
                '<span class="forecast-kicker">' + t('season_effect_prefix') + '</span>' +
                '<p class="season-bonus">' + t('school_' + season.dominant) + ' +20%, ' +
                    t('school_' + season.secondary) + ' +10%. ' + effect + '</p>' +
            '</div>' +
            festivalHtml +
            (magicNews ? '<div class="forecast-card forecast-card-news">' +
                '<span class="forecast-icon" aria-hidden="true">' + magicNews.icon + '</span>' +
                '<span class="forecast-kicker">' + t('magic_news_title') + '</span>' +
                '<p class="forecast-line">' + t(magicNews.summaryKey) + '</p>' +
            '</div>' : '') +
        '</section>';
    }

    function _renderDailyProphecy(character, state, blockNum, t) {
        if (typeof QuestSystem === 'undefined') return '';

        var prophecy = QuestSystem.generateDailyProphecy(blockNum, character.level);
        if (!prophecy) return '';

        return '<section class="home-prophecy" aria-label="' + t('home_daily_prophecy') + '">' +
            '<button type="button" class="prophecy-mini prophecy-mini-button" aria-label="' + t('home_daily_prophecy') + ': ' + t(prophecy.titleKey) + '">' +
                '<span class="prophecy-icon vmagic-breathe" aria-hidden="true">\uD83D\uDD2E</span>' +
                '<div class="prophecy-info">' +
                    '<h3>' + t('home_daily_prophecy') + '</h3>' +
                    '<p class="daily-quest-title">' + t(prophecy.titleKey) + '</p>' +
                    '<p class="daily-quest-desc"><small>' + t(prophecy.descriptionKey) + '</small></p>' +
                    '<span class="prophecy-reward">\u2B50 ' + (prophecy.rewards ? prophecy.rewards.xp : 0) + ' XP</span>' +
                '</div>' +
            '</button>' +
        '</section>';
    }

    function _renderActionTiles(screens, primary) {
        var html = '';
        for (var i = 0; i < screens.length; i++) {
            html += _tile(screens[i], _iconForScreen(screens[i]), _labelForScreen(screens[i], primary));
        }
        return html;
    }

    function _labelForScreen(screen, primary) {
        var t = Helpers.t;
        if (primary && screen === 'marketplace') return t('nav_bazaar');
        if (primary && screen === 'crafting') return t('nav_crafting');
        if (screen === 'world-boss') return t('nav_world-boss');
        if (screen === 'developers') return t('nav_developers');
        if (screen === 'settings') return t('nav_settings') || t('settings');
        if (screen === 'arena') return t('nav_duel') || t('nav_arena');
        return t('nav_' + screen) || screen;
    }

    function _iconForScreen(screen) {
        var icons = {
            home: '\uD83C\uDFE0',
            hunt: '\uD83C\uDFF9',
            map: '\uD83D\uDDFA\uFE0F',
            guild: '\uD83D\uDEE1\uFE0F',
            marketplace: '\uD83C\uDFEA',
            crafting: '\uD83D\uDD28',
            character: '\uD83E\uDDD9',
            help: '\u2753',
            leaderboard: '\uD83C\uDFC6',
            temple: '\u26EA',
            inventory: '\uD83C\uDF92',
            chronicle: '\uD83D\uDCDD',
            arena: '\u2694\uFE0F',
            quests: '\uD83D\uDCDC',
            'world-boss': '\uD83D\uDC32',
            settings: '\u2699\uFE0F',
            developers: '\uD83D\uDEE0\uFE0F'
        };
        return icons[screen] || '\u2728';
    }

    function _tile(screen, icon, label) {
        return '<button class="action-tile" data-screen="' + screen + '" aria-label="' + label + '">' +
            '<span class="tile-icon" aria-hidden="true">' + icon + '</span>' +
            '<span class="tile-label">' + label + '</span>' +
            '</button>';
    }

    return { render: render };
})();
