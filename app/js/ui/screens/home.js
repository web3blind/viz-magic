/**
 * Viz Magic — Home Dashboard Screen
 * With Phase 5: Daily Prophecy, world event banners, boss alert.
 */
var HomeScreen = (function() {
    'use strict';

    var PRIMARY_HOME_SCREENS = ['home', 'inventory', 'guild', 'crafting', 'map', 'hunt', 'quests', 'arena', 'marketplace', 'temple', 'world-boss'];
    var SECONDARY_HOME_SCREENS = ['character', 'leaderboard', 'chronicle', 'settings', 'help', 'developers'];
    var HOME_HP_DISPLAY_MAX = 1000;
    var HOME_XP_DISPLAY_MAX = 10000;
    var WORLD_MONTH_NAMES = ['Медведица', 'Медвежонок', 'Кассиопея', 'Орион', 'Пегас', 'Лебедь', 'Дракон', 'Крест', 'Пёс', 'Центавр', 'Скорпион', 'Киль'];

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-home');
        if (!el) return;

        var user = VizAccount.getCurrentUser();
        var character = StateEngine.getCharacter(user);
        var hasCharacter = !!character;
        var state = StateEngine.getState();
        var blockNum = state.headBlock || 0;

        if (!character) {
            character = { name: user || t('loading'), className: '', level: 0, hp: 0, maxHp: 1, xp: 0 };
        }

        var xpNeeded = hasCharacter ? (CharacterSystem.getXpForNextLevel(character) || 1000) : 1;
        var xpCurrent = hasCharacter ? CharacterSystem.getLevelProgress(character) : 0;
        if (xpCurrent < 0) xpCurrent = 0;
        var hpShown = hasCharacter ? _scaleForDisplay(character.hp, character.maxHp, HOME_HP_DISPLAY_MAX) : 0;
        var xpShown = hasCharacter ? _scaleForDisplay(xpCurrent, xpNeeded, HOME_XP_DISPLAY_MAX) : 0;
        var displayName = _displayCharacterName(character, hasCharacter, user, t);
        var characterLine = hasCharacter ? ('<span class="home-character-icon vmagic-breathe" aria-hidden="true">' + Helpers.classIcon(character.className) + '</span> ' + t('class_' + character.className) + ' \u2022 ' + t('home_level') + ' ' + character.level + (Helpers.magicRank ? (' \u2022 ' + t(Helpers.magicRank(character.level))) : '')) : t('loading');
        var vitalBars = hasCharacter ? (
            ProgressBar.create({id:'mana-bar', label:t('home_mana'), labelHtml:Helpers.icon('mana', 'vital-label-icon vm-icon vmagic-breathe') + ' ' + t('home_mana'), value:0, max:100, color:'#2196f3'}) +
            ProgressBar.create({id:'hp-bar', label:'HP', labelHtml:Helpers.icon('hp', 'vital-label-icon vm-icon vmagic-breathe') + ' HP', value:character.hp, max:character.maxHp, displayValue:hpShown, displayMax:HOME_HP_DISPLAY_MAX, color:'#e53935'}) +
            ProgressBar.create({id:'xp-bar', label:'XP', labelHtml:Helpers.icon('xp', 'vital-label-icon vm-icon vmagic-breathe') + ' XP', value:xpCurrent, max:xpNeeded, displayValue:xpShown, displayMax:HOME_XP_DISPLAY_MAX, color:'#ffc107'})
        ) : ProgressBar.create({id:'mana-bar', label:t('home_mana'), labelHtml:Helpers.icon('mana', 'vital-label-icon vm-icon vmagic-breathe') + ' ' + t('home_mana'), value:0, max:100, color:'#2196f3'});

        el.innerHTML =
            '<div class="home-dashboard">' +
                // World event banner
                _renderWorldEventBanner(state, blockNum, t) +

                // Boss alert
                _renderBossAlert(state, blockNum, t) +

                '<section class="home-summary home-summary-button" role="button" tabindex="0" aria-label="' + t('home_open_character') + '">' +
                    '<h1><span class="home-welcome-text">' + t('home_welcome') + ',</span> <span class="player-name-rune"><span class="player-name-rune-spark" aria-hidden="true">✦</span><span class="player-name-rune-text">' + Helpers.escapeHtml(displayName) + '</span><span class="player-name-rune-spark" aria-hidden="true">✦</span></span></h1>' +
                    '<p>' + characterLine + '</p>' +
                    vitalBars +
                    '<button class="help-tip-btn" aria-label="' + t('help_tip_mana') + '" ' +
                    'title="' + t('help_tip_mana') + '" ' +
                    'onclick="Helpers.EventBus.emit(\'navigate\', \'help\')">' + Helpers.icon('help', 'help-tip-icon') + '</button>' +
                '</section>' +


                // Season indicator
                _renderSeasonIndicator(state, blockNum, t) +

                // Daily Prophecy
                (hasCharacter ? _renderDailyProphecy(character, state, blockNum, t) : '') +

                '<section class="home-actions" aria-label="' + t('home_primary_actions') + '">' +
                    '<h2>' + t('home_primary_actions') + '</h2>' +
                    '<div class="action-grid">' +
                        _renderActionTiles(PRIMARY_HOME_SCREENS, true, hasCharacter ? character : null) +
                    '</div>' +
                '</section>' +
                '<section class="home-actions home-actions-secondary" aria-label="' + t('home_secondary_actions') + '">' +
                    '<h2>' + t('home_secondary_actions') + '</h2>' +
                    '<div class="action-grid">' +
                        _renderActionTiles(SECONDARY_HOME_SCREENS, false, hasCharacter ? character : null) +
                    '</div>' +
                '</section>' +
                _renderLorePages(blockNum, t) +
                '<section class="home-share" aria-label="' + t('home_share_title') + '">' +
                    '<h2>' + Helpers.icon('link', 'section-icon vmagic-breathe') + ' ' + t('home_share_title') + '</h2>' +
                    '<p>' + t('home_share_desc') + '</p>' +
                    '<button type="button" class="btn btn-primary btn-share-game" id="btn-share-game">' + t('home_share_button') + '</button>' +
                '</section>' +
                '<section class="home-install" aria-label="' + t('home_install_shortcut') + '">' +
                    '<h2>' + Helpers.icon('phone', 'section-icon vmagic-breathe') + ' ' + t('home_install_shortcut') + '</h2>' +
                    '<p>' + t('home_install_shortcut_text') + '</p>' +
                    '<button type="button" class="btn btn-primary btn-install-shortcut" id="btn-install-shortcut">' + t('home_install_shortcut_button') + '</button>' +
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
            eventButtons[eb].addEventListener('click', function(e) {
                if (e && e.preventDefault) e.preventDefault();
                SoundManager.play('tap');
                var screen = this.getAttribute('data-screen') || (this.closest && this.closest('[data-screen]') && this.closest('[data-screen]').getAttribute('data-screen'));
                if (screen) Helpers.EventBus.emit('navigate', screen);
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

        var shareBtn = Helpers.$('btn-share-game');
        if (shareBtn) {
            shareBtn.addEventListener('click', function() {
                SoundManager.play('tap');
                var url = (window.location.origin || 'https://vizmagic.web3blind.xyz') + '/';
                if (navigator.share) {
                    navigator.share({ title: 'Viz Magic', url: url }).catch(function() {});
                } else {
                    var ta = document.createElement('textarea');
                    ta.value = url;
                    ta.setAttribute('readonly', '');
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    try { document.execCommand('copy'); } catch (e) {}
                    document.body.removeChild(ta);
                    Toast.success(t('home_share_copied'));
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

        // Fetch real mana from blockchain only after the VIZ transport is ready.
        // Startup must render Home from local state even when network initialization lags.
        if (user && typeof VizConnection !== 'undefined' && VizConnection.isConnected && VizConnection.isConnected()) {
            try {
                VizAccount.getAccount(user, function(err, accountData) {
                    if (!err && accountData) {
                        var currentEnergy = VizAccount.calculateCurrentEnergy(accountData);
                        ProgressBar.update('mana-bar', currentEnergy / 100, 100);
                    }
                });
            } catch (e) {
                console.log('Home mana refresh skipped until VIZ transport is ready:', e && e.message ? e.message : e);
            }
        }
    }

    function _displayCharacterName(character, hasCharacter, user, t) {
        if (!hasCharacter || !character) return user || t('loading');
        if (character.className === 'stonewarden' && character.name === 'Стражник') {
            return t('class_stonewarden');
        }
        return character.name || user || t('loading');
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
            var target = (evt.type === 'minor_rift' || evt.type === 'weave_surge') ? 'hunt' : '';
            var tag = target ? 'button' : 'div';
            var attrs = target ? ' type="button" data-screen="' + target + '" data-event-type="' + evt.type + '"' : '';
            var eventIcon = evt.type === 'weave_surge' ? 'spark' : (evt.type === 'minor_rift' ? 'rift' : 'festival');
            var effectBadge = evt.type === 'weave_surge' ? '<span class="event-effect-badge">' + Helpers.icon('spark', 'event-effect-icon') + ' ' + t('home_weave_hunt_hint') + ' ' + String(t('home_mana')).toLowerCase() + ' ×' + (evt.manaRegenMultiplier || 2) + '</span>' : '';
            html += '<' + tag + ' class="event-banner-item event-banner-' + evt.type + (target ? ' event-banner-button' : '') + '"' + attrs + ' aria-label="' +
                t(evt.nameKey) + (desc ? '. ' + desc : '') + ' ' + t('event_time_left', {time: timeStr}) + '">' +
                Helpers.icon(eventIcon, 'event-icon vmagic-breathe') +
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


    function _formatSignedPercent(value) {
        var pct = Math.round((value - 1000) / 10);
        return (pct > 0 ? '+' : '') + pct + '%';
    }

    function _formatSeasonBonus(value) {
        var pct = Math.round((value || 0) / 10);
        return (pct > 0 ? '+' : '') + pct + '%';
    }

    function _formatWeatherEffect(weather, t) {
        var parts = [];
        if (weather.creatureAttackMod && weather.creatureAttackMod !== 1000) {
            parts.push(t('weather_dynamic_creature') + ' ' + _formatSignedPercent(weather.creatureAttackMod));
        }
        if (weather.playerDefenseMod && weather.playerDefenseMod !== 1000) {
            parts.push(t('weather_dynamic_defense') + ' ' + _formatSignedPercent(weather.playerDefenseMod));
        }
        if (!parts.length) return t(weather.effectKey);
        return parts.join(', ') + '.';
    }

    function _formatSignedTemperature(value) {
        return (value > 0 ? '+' : '') + value;
    }

    function _getWorldMonthName() {
        var daySeed = (typeof WorldEvents !== 'undefined' && WorldEvents.getMoscowDayIndex) ? WorldEvents.getMoscowDayIndex() : 0;
        var date = new Date(Date.now() + (3 * 60 * 60 * 1000));
        var idx = date.getUTCMonth ? date.getUTCMonth() : (Math.floor(Math.max(0, daySeed) / 30) % 12);
        if (idx < 0 || idx >= WORLD_MONTH_NAMES.length) idx = 0;
        return WORLD_MONTH_NAMES[idx];
    }

    function _seasonColorClass(seasonId) {
        if (seasonId === 'summer') return 'season-color-summer';
        if (seasonId === 'autumn') return 'season-color-autumn';
        if (seasonId === 'winter') return 'season-color-winter';
        if (seasonId === 'spring') return 'season-color-spring';
        return '';
    }

    function _weatherPrecipitationLabel(weather, seasonId, t) {
        var id = weather && weather.id ? String(weather.id) : '';
        var labels = [
            [/tropical|monsoon/, 'тропический ливень'],
            [/thunder|lightning|storm/, 'ливень'],
            [/hail/, 'град'],
            [/blizzard|snow.*storm|heavy_snow/, 'затяжной снегопад'],
            [/snow.*rain|sleet/, 'снег с дождём'],
            [/snow|frost|ice|winter/, 'снег'],
            [/drizzle|mist_rain|fine_rain/, 'моросящий дождь'],
            [/rain|swamp|mushroom|grass/, 'мелкий дождь'],
            [/dense_fog|thick_fog/, 'плотный туман'],
            [/fog|mist/, 'туман'],
            [/hurricane/, 'ураган'],
            [/tornado|whirl/, 'смерч'],
            [/long_rain|endless_rain/, 'продолжительный дождь']
        ];
        for (var i = 0; i < labels.length; i++) {
            if (labels[i][0].test(id)) return labels[i][1];
        }
        if (seasonId === 'winter' && weather && weather.creatureAttackMod && weather.creatureAttackMod > 1000) return 'снег';
        return t('weather_report_no_rain');
    }

    function _formatWeatherReport(season, dominantBonus, secondaryBonus, weather, t) {
        var daySeed = (typeof WorldEvents !== 'undefined' && WorldEvents.getMoscowDayIndex) ? WorldEvents.getMoscowDayIndex() : 0;
        var seasonId = season && season.id ? season.id : '';
        var air = 0;
        if (seasonId === 'winter') air = -30 + (daySeed % 31);
        else if (seasonId === 'summer') air = 18 + (daySeed % 13);
        else if (seasonId === 'spring') air = -5 + (daySeed % 21);
        else air = -10 + (daySeed % 26);
        if (air > 30) air = 30;
        if (air < -30) air = -30;
        var wind = 3 + ((daySeed + (weather && weather.creatureAttackMod ? weather.creatureAttackMod : 0)) % 10);
        var precipitation = _weatherPrecipitationLabel(weather, seasonId, t);
        var parts = [
            t('weather_report_air') + ' ' + _formatSignedTemperature(air)
        ];
        if (seasonId === 'spring' || seasonId === 'summer' || seasonId === 'autumn') {
            parts.push(t('weather_report_water') + ' +' + (daySeed % 21));
        }
        parts.push(t('weather_report_wind') + ' ' + wind + ' ' + t('weather_report_wind_unit') + ', ' + precipitation);
        return parts.join('; ') + '.';
    }

    function _renderBossAlert(state, blockNum, t) {
        var bossWindow = (typeof WorldEvents !== 'undefined' && WorldEvents.checkWorldBossWindow) ? WorldEvents.checkWorldBossWindow(blockNum) : null;
        if (!bossWindow || !bossWindow.active) return '';
        if (!state.worldBoss || !state.worldBoss.active || state.worldBoss.defeated) return '';
        if (state.worldBoss.endBlock && blockNum > state.worldBoss.endBlock) return '';
        if (bossWindow.spawnBlock && state.worldBoss.spawnBlock && state.worldBoss.spawnBlock !== bossWindow.spawnBlock) return '';

        var bossStatus = (typeof WorldBoss !== 'undefined') ? WorldBoss.getBossStatus(state.worldBoss, '', blockNum) : null;
        if (!bossStatus || !bossStatus.active) return '';

        return '<button class="boss-alert" role="alert" aria-label="' + t('boss_active_alert') + '">' +
            Helpers.icon('boss', 'boss-alert-mark boss-alert-icon vmagic-breathe') +
            '<span class="boss-alert-text">' + t('boss_active_alert') + '</span>' +
            '<span class="boss-alert-hp">' + bossStatus.hpPercent + '% HP</span>' +
        '</button>';
    }

    function _renderSeasonIndicator(state, blockNum, t) {
        if (typeof WorldEvents === 'undefined') return '';
        var season = WorldEvents.getCurrentSeason(blockNum);
        if (!season) return '';

        var sky = WorldEvents.getCurrentSky ? WorldEvents.getCurrentSky(blockNum) : null;
        var worldDay = WorldEvents.getCurrentWorldDay ? WorldEvents.getCurrentWorldDay() : null;
        var weather = WorldEvents.getCurrentWeather ? WorldEvents.getCurrentWeather(blockNum) : null;
        var skyText = sky ? (t(sky.summaryKey) + (sky.twistText ? ' ' + sky.twistText : '')) : '';
        var effect = weather ? _formatWeatherEffect(weather, t) : '';
        var bonuses = WorldEvents.getSeasonalBonuses ? WorldEvents.getSeasonalBonuses(blockNum) : null;
        var dominantBonus = bonuses && bonuses[season.dominant] !== undefined ? bonuses[season.dominant] : season.dominantBonus;
        var secondaryBonus = bonuses && bonuses[season.secondary] !== undefined ? bonuses[season.secondary] : season.secondaryBonus;
        var festival = WorldEvents.getCurrentFestival ? WorldEvents.getCurrentFestival(blockNum) : null;
        var magicNews = WorldEvents.getCurrentMagicNews ? WorldEvents.getCurrentMagicNews(blockNum) : null;
        var festivalHtml = festival ? '<div class="forecast-card forecast-card-festival">' +
                '<div class="forecast-head">' +
                    Helpers.icon('festival', 'forecast-icon vmagic-breathe') +
                    '<span class="forecast-kicker">' + t(festival.prefixKey || 'festival_today_prefix') + '</span>' +
                '</div>' +
                '<p class="forecast-line">' + (festival.nameText || t(festival.nameKey)) + '</p>' +
                '<p class="forecast-omen">' + (festival.descText || t(festival.descKey)) + '</p>' +
            '</div>' : '';
        return '<section class="season-indicator magical-forecast" aria-label="' + t('weather_forecast_label') + '">' +
            '<div class="forecast-card forecast-card-season forecast-card-hunt-summary">' +
                '<div class="forecast-head">' +
                    Helpers.icon('compass', 'forecast-icon forecast-weather-icon vmagic-breathe') +
                    '<p class="forecast-line"><span class="forecast-season-name ' + _seasonColorClass(season.id) + '">' + t(season.nameKey) + '</span> · <span class="forecast-world-month ' + _seasonColorClass(season.id) + '">' + _getWorldMonthName() + '</span></p>' +
                '</div>' +
                Helpers.icon('hunt', 'forecast-icon forecast-hunt-icon vmagic-breathe') +
                '<p class="forecast-kicker forecast-hunt-copy">' + t('weather_hunt_effect_sentence') + '</p>' +
                '<p class="season-bonus">' + _formatWeatherReport(season, dominantBonus, secondaryBonus, weather, t) + ' ' + effect + '</p>' +
            '</div>' +
            '<div class="forecast-card forecast-card-sky">' +
                '<div class="forecast-head">' +
                    Helpers.icon('weather', 'forecast-icon forecast-sky-icon') +
                    '<span class="forecast-kicker">' + (worldDay ? t(worldDay.nameKey) : t('weather_sky_title')) + '</span>' +
                '</div>' +
                '<p class="forecast-line">' + skyText + '</p>' +
            '</div>' +
            festivalHtml +
            (magicNews ? '<div class="forecast-card forecast-card-news">' +
                '<div class="forecast-head">' +
                    Helpers.icon('news', 'forecast-icon') +
                    '<span class="forecast-kicker">' + t('magic_news_title') + '</span>' +
                '</div>' +
                '<p class="forecast-line">' + t(magicNews.summaryKey) + (magicNews.twistText ? ' ' + magicNews.twistText : '') + '</p>' +
            '</div>' : '') +
        '</section>';
    }

    function _renderLorePages(blockNum, t) {
        if (typeof WorldEvents === 'undefined' || !WorldEvents.getCurrentLorePages) return '';
        var pages = WorldEvents.getCurrentLorePages(blockNum) || [];
        if (!pages.length) return '';
        var html = '<section class="home-lore-pages" aria-label="' + t('home_lore_pages_label') + '">';
        for (var i = 0; i < pages.length; i++) {
            var page = pages[i];
            html += '<article class="home-lore-card">' +
                '<h2>' + Helpers.icon('chronicle', 'section-icon vmagic-breathe') + ' ' + t(page.titleKey) + '</h2>' +
                '<p>' + page.text + '</p>' +
            '</article>';
        }
        if (pages.dailyTail) {
            html += '<p class="home-lore-daily-tail">' + pages.dailyTail + '</p>';
        }
        html += '</section>';
        return html;
    }

    function _renderDailyProphecy(character, state, blockNum, t) {
        if (typeof QuestSystem === 'undefined') return '';

        var prophecy = QuestSystem.generateDailyProphecy(blockNum, character.level);
        if (!prophecy) return '';

        return '<section class="home-prophecy" aria-label="' + t('home_daily_prophecy') + '">' +
            '<button type="button" class="prophecy-mini prophecy-mini-button" aria-label="' + t('home_daily_prophecy') + ': ' + t(prophecy.titleKey) + '">' +
                Helpers.icon('prophecy', 'prophecy-icon vmagic-breathe') +
                '<div class="prophecy-info">' +
                    '<h3>' + t('home_daily_prophecy') + '</h3>' +
                    '<p class="daily-quest-title">' + t(prophecy.titleKey) + '</p>' +
                    '<p class="daily-quest-desc"><small>' + t(prophecy.descriptionKey) + '</small></p>' +
                    '<span class="prophecy-reward">' + Helpers.icon('xp', 'prophecy-reward-icon') + ' ' + (prophecy.rewards ? prophecy.rewards.xp : 0) + ' XP</span>' +
                '</div>' +
            '</button>' +
        '</section>';
    }

    function _renderActionTiles(screens, primary, character) {
        var html = '';
        for (var i = 0; i < screens.length; i++) {
            html += _tile(screens[i], _iconClassForScreen(screens[i]), _labelForScreen(screens[i], primary), character);
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

    function _iconClassForScreen(screen) {
        var icons = {
            home: 'home',
            hunt: 'hunt',
            map: 'map',
            guild: 'guild',
            marketplace: 'marketplace',
            crafting: 'crafting',
            character: 'character',
            help: 'help',
            leaderboard: 'leaderboard',
            temple: 'temple',
            inventory: 'inventory',
            chronicle: 'chronicle',
            arena: 'arena',
            quests: 'quests',
            'world-boss': 'boss',
            settings: 'settings',
            developers: 'developers'
        };
        return icons[screen] || 'spark';
    }

    function _tile(screen, iconClass, label, character) {
        var iconHtml = Helpers.icon(iconClass, 'tile-icon vm-icon');
        if (screen === 'character' && character) {
            iconHtml = _renderAvatarMark(character, 'tile-icon tile-avatar-icon');
        }
        return '<button class="action-tile" data-screen="' + screen + '" aria-label="' + label + '">' +
            iconHtml +
            '<span class="tile-label">' + label + '</span>' +
            '</button>';
    }

    function _renderAvatarMark(character, extraClass) {
        character = character || {};
        var name = character.name || '';
        if (character.avatarUrl) {
            return '<img class="account-avatar defaultable-avatar ' + (extraClass || '') + '" src="' + Helpers.escapeHtml(character.avatarUrl) + '" alt="" aria-hidden="true" loading="lazy" decoding="async">';
        }
        return '<span class="account-avatar default-avatar ' + (extraClass || '') + '" aria-hidden="true">' + (character.className ? Helpers.classIcon(character.className) : Helpers.icon('character', 'class-svg-icon')) + '</span>';
    }

    return { render: render };
})();
