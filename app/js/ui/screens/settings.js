/**
 * Viz Magic — Settings Screen
 * Language, sound, accessibility, account, about.
 */
var SettingsScreen = (function() {
    'use strict';

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-settings');
        if (!el) return;

        var user = VizAccount.getCurrentUser();
        var currentLang = Helpers.getCurrentLang ? Helpers.getCurrentLang() : 'ru';

        el.innerHTML =
            '<div class="settings-screen">' +
                '<h1>' + t('settings_title') + '</h1>' +

                // Language
                '<section class="settings-section" aria-label="' + t('settings_language') + '">' +
                    '<h2>' + t('settings_language') + '</h2>' +
                    '<div class="settings-toggle-group">' +
                        '<button class="btn btn-sm' + (currentLang === 'ru' ? ' btn-primary' : ' btn-secondary') + '" id="lang-ru" aria-pressed="' + (currentLang === 'ru') + '">\uD83C\uDDF7\uD83C\uDDFA \u0420\u0443\u0441\u0441\u043A\u0438\u0439</button>' +
                        '<button class="btn btn-sm' + (currentLang === 'en' ? ' btn-primary' : ' btn-secondary') + '" id="lang-en" aria-pressed="' + (currentLang === 'en') + '">\uD83C\uDDEC\uD83C\uDDE7 English</button>' +
                    '</div>' +
                '</section>' +

                // Sound
                '<section class="settings-section" aria-label="' + t('settings_sound') + '">' +
                    '<h2>' + t('settings_sound') + '</h2>' +
                    _renderSlider('sfx-volume', t('settings_sfx'), 50) +
                    _renderSlider('music-volume', t('settings_music'), 50) +
                    _renderToggle('narrator-toggle', t('narrator_toggle'), true) +
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
                    _renderToggle('contrast-toggle', t('settings_high_contrast'), false) +
                    _renderToggle('motion-toggle', t('settings_reduced_motion'), false) +
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

        // Toggle buttons
        var toggleBtns = el.querySelectorAll('.settings-toggle-btn');
        for (var i = 0; i < toggleBtns.length; i++) {
            toggleBtns[i].addEventListener('click', function() {
                var isActive = this.classList.toggle('active');
                this.setAttribute('aria-checked', isActive);
                SoundManager.play('tap');

                // Apply specific toggles
                if (this.id === 'contrast-toggle') {
                    document.body.classList.toggle('high-contrast', isActive);
                }
                if (this.id === 'motion-toggle') {
                    document.body.classList.toggle('reduced-motion', isActive);
                }
                if (this.id === 'narrator-toggle' && typeof BattleNarrator !== 'undefined') {
                    BattleNarrator.setEnabled(isActive);
                }
                if (this.id === 'haptics-toggle') {
                    // Store preference
                    try { localStorage.setItem(VizMagicConfig.STORAGE_PREFIX + 'haptics', isActive ? '1' : '0'); } catch(e) {}
                }
            });
        }

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
