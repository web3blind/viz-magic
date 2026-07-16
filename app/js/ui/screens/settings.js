/**
 * Viz Magic — Settings Screen
 * Language, sound, accessibility, account, about.
 */
var SettingsScreen = (function() {
    'use strict';

    var STORAGE_PREFIX = VizMagicConfig.STORAGE_PREFIX;

    function _getStoredBool(key, fallback) {
        try {
            var value = localStorage.getItem(STORAGE_PREFIX + key);
            if (value === '1' || value === 'true') return true;
            if (value === '0' || value === 'false') return false;
        } catch (e) {}
        return !!fallback;
    }

    function _getStoredNumber(key, fallback) {
        try {
            var value = localStorage.getItem(STORAGE_PREFIX + key);
            if (value !== null && value !== '') {
                var num = parseFloat(value);
                if (!isNaN(num)) return num;
            }
        } catch (e) {}
        return fallback;
    }

    function _getStoredText(key, fallback) {
        try {
            var value = localStorage.getItem(STORAGE_PREFIX + key);
            if (value !== null && value !== '') return value;
        } catch (e) {}
        return fallback;
    }

    function _setStoredBool(key, value) {
        try {
            localStorage.setItem(STORAGE_PREFIX + key, value ? '1' : '0');
        } catch (e) {}
    }

    function _setStoredNumber(key, value) {
        try {
            localStorage.setItem(STORAGE_PREFIX + key, String(value));
        } catch (e) {}
    }

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-settings');
        if (!el) return;

        var user = VizAccount.getCurrentUser();
        var currentLang = Helpers.getCurrentLang ? Helpers.getCurrentLang() : 'ru';
        var highContrast = _getStoredBool('high_contrast', false);
        var reducedMotion = _getStoredBool('reduced_motion', false);
        var sfxVolume = Math.round(_getStoredNumber('sfx_volume', 0.5) * 100);
        var musicVolume = Math.round(_getStoredNumber('music_volume', 0.5) * 100);
        var narratorEnabled = (typeof BattleNarrator !== 'undefined' && BattleNarrator.isEnabled) ? BattleNarrator.isEnabled() : _getStoredBool('battle_narrator', false);
        var narratorVoice = (typeof BattleNarrator !== 'undefined' && BattleNarrator.getVoiceOptions) ? BattleNarrator.getVoiceOptions() : {
            gender: _getStoredText('narrator_voice_gender', 'male'),
            timbre: _getStoredText('narrator_voice_timbre', 'rough')
        };
        if (typeof SoundManager !== 'undefined') SoundManager.setVolume(sfxVolume / 100);

        el.innerHTML =
            '<div class="settings-screen">' +
                '<h1><span class="screen-title-icon vmagic-breathe" aria-hidden="true">⚙️</span> ' + t('settings_title') + '</h1>' +

                // Language
                '<section class="settings-section" aria-label="' + t('settings_language') + '">' +
                    '<h2>' + t('settings_language') + '</h2>' +
                    '<div class="settings-toggle-group">' +
                        '<button class="btn btn-sm' + (currentLang === 'ru' ? ' btn-primary' : ' btn-secondary') + '" id="lang-ru" aria-pressed="' + (currentLang === 'ru') + '">\uD83C\uDDF7\uD83C\uDDFA Русский</button>' +
                        '<button class="btn btn-sm' + (currentLang === 'en' ? ' btn-primary' : ' btn-secondary') + '" id="lang-en" aria-pressed="' + (currentLang === 'en') + '">\uD83C\uDDEC\uD83C\uDDE7 English</button>' +
                    '</div>' +
                '</section>' +

                // Sound
                '<section class="settings-section" aria-label="' + t('settings_sound') + '">' +
                    '<h2>' + t('settings_sound') + '</h2>' +
                    _renderSlider('sfx-volume', t('settings_sfx'), sfxVolume) +
                    _renderSlider('music-volume', t('settings_music'), musicVolume) +
                    _renderToggle('narrator-toggle', t('narrator_toggle'), narratorEnabled) +
                    _renderSelect('narrator-voice-gender', t('narrator_voice_gender'), [
                        { value: 'male', label: t('narrator_voice_male') },
                        { value: 'female', label: t('narrator_voice_female') }
                    ], narratorVoice.gender || 'male') +
                    _renderSelect('narrator-voice-timbre', t('narrator_voice_timbre'), [
                        { value: 'rough', label: t('narrator_timbre_rough') },
                        { value: 'neutral', label: t('narrator_timbre_neutral') },
                        { value: 'soft', label: t('narrator_timbre_soft') }
                    ], narratorVoice.timbre || 'rough') +
                    '<p class="settings-help-text">' + t('narrator_voice_hint') + '</p>' +
                    '<button type="button" class="btn btn-secondary btn-sm" id="btn-test-narrator">' + t('narrator_test') + '</button>' +
                    '<div class="settings-field">' +
                        '<label for="sound-density" class="input-label">' + t('settings_sound_density') + '</label>' +
                        '<select id="sound-density" class="input-field">' +
                            '<option value="minimal">' + t('settings_density_minimal') + '</option>' +
                            '<option value="standard" selected>' + t('settings_density_standard') + '</option>' +
                            '<option value="rich">' + t('settings_density_rich') + '</option>' +
                        '</select>' +
                    '</div>' +
                    _renderToggle('haptics-toggle', t('settings_haptics'), true) +
                '</section>' +

                // Accessibility
                '<section class="settings-section" aria-label="' + t('settings_accessibility') + '">' +
                    '<h2>' + t('settings_accessibility') + '</h2>' +
                    _renderToggle('contrast-toggle', t('settings_high_contrast'), highContrast) +
                    _renderToggle('motion-toggle', t('settings_reduced_motion'), reducedMotion) +
                '</section>' +

                // Notifications
                '<section class="settings-section" aria-label="' + t('settings_notifications') + '">' +
                    '<h2>' + t('settings_notifications') + '</h2>' +
                    _renderToggle('notif-events', t('settings_notif_events'), true) +
                    _renderToggle('notif-boss', t('settings_notif_boss'), true) +
                    _renderToggle('notif-quests', t('settings_notif_quests'), true) +
                '</section>' +

                // Account
                '<section class="settings-section" aria-label="' + t('settings_account') + '">' +
                    '<h2>' + t('settings_account') + '</h2>' +
                    (user ? (
                        '<div class="settings-account-info">' +
                            '<div class="account-row"><span class="account-label">' + t('settings_account_name') + '</span><span class="account-value">' + Helpers.escapeHtml(user) + '</span></div>' +
                        '</div>'
                    ) : '<p class="settings-not-logged">' + t('settings_not_logged') + '</p>') +
                '</section>' +

                // About
                '<section class="settings-section" aria-label="' + t('settings_about') + '">' +
                    '<h2>' + t('settings_about') + '</h2>' +
                    '<div class="settings-about">' +
                        '<p><strong>Viz Magic</strong> v' + VizMagicConfig.APP_VERSION + '</p>' +
                        '<p>' + t('settings_about_desc') + '</p>' +
                        '<button class="btn btn-secondary btn-sm" id="btn-realm-info">' + t('settings_realm_magic') + '</button>' +
                        '<a href="https://info.viz.world/" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">' + t('settings_realm_archives') + '</a>' +
                    '</div>' +
                '</section>' +

                // Logout
                (user ? (
                    '<section class="settings-section settings-logout">' +
                        '<button class="btn btn-secondary settings-logout-btn" id="btn-logout">' + t('logout') + '</button>' +
                    '</section>'
                ) : '') +

            '</div>';

        _bindEvents(el);
    }

    function _renderSlider(id, label, defaultValue) {
        return '<div class="settings-field">' +
            '<label for="' + id + '" class="input-label">' + label + '</label>' +
            '<input type="range" id="' + id + '" min="0" max="100" value="' + defaultValue + '" class="settings-slider" aria-label="' + label + '">' +
        '</div>';
    }

    function _renderToggle(id, label, defaultOn) {
        return '<div class="settings-field settings-toggle">' +
            '<label for="' + id + '" class="settings-toggle-label">' + label + '</label>' +
            '<button id="' + id + '" class="settings-toggle-btn' + (defaultOn ? ' active' : '') + '" ' +
                'role="switch" aria-checked="' + defaultOn + '" aria-label="' + label + '">' +
                '<span class="toggle-knob"></span>' +
            '</button>' +
        '</div>';
    }

    function _renderSelect(id, label, options, selectedValue) {
        var html = '<div class="settings-field">' +
            '<label for="' + id + '" class="input-label">' + label + '</label>' +
            '<select id="' + id + '" class="input-field" aria-label="' + label + '">';
        for (var i = 0; i < options.length; i++) {
            html += '<option value="' + options[i].value + '"' + (options[i].value === selectedValue ? ' selected' : '') + '>' + options[i].label + '</option>';
        }
        return html + '</select></div>';
    }

    function _bindEvents(el) {
        // Language toggles
        var langRu = el.querySelector('#lang-ru');
        var langEn = el.querySelector('#lang-en');
        if (langRu) langRu.addEventListener('click', function() {
            if (typeof Helpers.setLang === 'function') Helpers.setLang('ru');
            SoundManager.play('tap');
            render();
            NavComponent.render();
        });
        if (langEn) langEn.addEventListener('click', function() {
            if (typeof Helpers.setLang === 'function') Helpers.setLang('en');
            SoundManager.play('tap');
            render();
            NavComponent.render();
        });

        // SFX volume slider
        var sfxSlider = el.querySelector('#sfx-volume');
        if (sfxSlider) sfxSlider.addEventListener('input', function() {
            SoundManager.setVolume(this.value / 100);
        });

        var musicSlider = el.querySelector('#music-volume');
        if (musicSlider) musicSlider.addEventListener('input', function() {
            _setStoredNumber('music_volume', this.value / 100);
        });

        // Toggle buttons
        var toggleBtns = el.querySelectorAll('.settings-toggle-btn');
        for (var i = 0; i < toggleBtns.length; i++) {
            toggleBtns[i].addEventListener('click', function() {
                var isActive = this.classList.toggle('active');
                this.setAttribute('aria-checked', isActive);
                SoundManager.play('tap');

                // Apply specific toggles
                if (this.id === 'contrast-toggle') {
                    if (isActive) {
                        document.body.classList.add('high-contrast');
                        document.body.setAttribute('data-theme', 'high-contrast');
                    } else {
                        document.body.classList.remove('high-contrast');
                        document.body.removeAttribute('data-theme');
                    }
                    _setStoredBool('high_contrast', isActive);
                }
                if (this.id === 'motion-toggle') {
                    document.body.classList.toggle('reduced-motion', isActive);
                    try { localStorage.setItem(STORAGE_PREFIX + 'reduced_motion', isActive ? '1' : '0'); } catch (e) {}
                    _setStoredBool('reduced_motion', isActive);
                }
                if (this.id === 'narrator-toggle' && typeof BattleNarrator !== 'undefined') {
                    BattleNarrator.setEnabled(isActive);
                    if (isActive) BattleNarrator.announce(Helpers.t('narrator_test_message'), 'assertive');
                }
                if (this.id === 'haptics-toggle') {
                    _setStoredBool('haptics', isActive);
                }
            });
        }

        var narratorGender = el.querySelector('#narrator-voice-gender');
        var narratorTimbre = el.querySelector('#narrator-voice-timbre');
        function updateNarratorVoice() {
            if (typeof BattleNarrator !== 'undefined' && BattleNarrator.setVoiceOptions) {
                BattleNarrator.setVoiceOptions(narratorGender ? narratorGender.value : 'male', narratorTimbre ? narratorTimbre.value : 'rough');
            } else {
                try {
                    localStorage.setItem(STORAGE_PREFIX + 'narrator_voice_gender', narratorGender ? narratorGender.value : 'male');
                    localStorage.setItem(STORAGE_PREFIX + 'narrator_voice_timbre', narratorTimbre ? narratorTimbre.value : 'rough');
                } catch (e) {}
            }
        }
        if (narratorGender) narratorGender.addEventListener('change', function() { updateNarratorVoice(); SoundManager.play('tap'); });
        if (narratorTimbre) narratorTimbre.addEventListener('change', function() { updateNarratorVoice(); SoundManager.play('tap'); });

        // Narrator test
        var narratorTest = el.querySelector('#btn-test-narrator');
        if (narratorTest) narratorTest.addEventListener('click', function() {
            SoundManager.play('tap');
            if (typeof BattleNarrator !== 'undefined') {
                updateNarratorVoice();
                BattleNarrator.setEnabled(true);
                var toggle = el.querySelector('#narrator-toggle');
                if (toggle) {
                    toggle.classList.add('active');
                    toggle.setAttribute('aria-checked', 'true');
                }
                BattleNarrator.announce(Helpers.t('narrator_test_message'), 'assertive');
                BattleNarrator.spatialHint('center', 660);
            }
        });

        // Realm info
        var realmBtn = el.querySelector('#btn-realm-info');
        if (realmBtn) realmBtn.addEventListener('click', function() {
            Modal.show(
                Helpers.t('settings_realm_magic'),
                '<p>' + Helpers.t('settings_realm_magic_desc') + '</p>',
                [{ label: Helpers.t('close'), action: function() { Modal.close(); } }]
            );
        });

        // Logout
        var logoutBtn = el.querySelector('#btn-logout');
        if (logoutBtn) logoutBtn.addEventListener('click', function() {
            if (typeof VizAccount !== 'undefined' && VizAccount.logout) {
                VizAccount.logout();
            }
            SoundManager.play('tap');
            Helpers.EventBus.emit('navigate', 'landing');
        });
    }

    return { render: render };
})();
