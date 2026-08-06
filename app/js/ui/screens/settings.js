/**
 * Viz Magic — Settings Screen
 * Language, sound, accessibility, account, about.
 */
var SettingsScreen = (function() {
    'use strict';

    var STORAGE_PREFIX = VizMagicConfig.STORAGE_PREFIX;
    var pendingAvatarDataUrl = '';

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
        var currentCharacter = user && typeof StateEngine !== 'undefined' && StateEngine.getCharacter ? StateEngine.getCharacter(user) : null;
        var currentAvatar = currentCharacter && currentCharacter.avatarUrl ? currentCharacter.avatarUrl : '';
        var currentLang = Helpers.getCurrentLang ? Helpers.getCurrentLang() : 'ru';
        var highContrast = _getStoredBool('high_contrast', false);
        var reducedMotion = _getStoredBool('reduced_motion', false);
        var iconMotion = _getStoredText('icon_motion', 'sparkle');
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
                    '<h2><span class="section-icon settings-section-icon vmagic-breathe" aria-hidden="true">👅</span> ' + t('settings_language') + '</h2>' +
                    '<div class="settings-toggle-group">' +
                        '<button class="btn btn-sm' + (currentLang === 'ru' ? ' btn-primary' : ' btn-secondary') + '" id="lang-ru" aria-pressed="' + (currentLang === 'ru') + '">\uD83C\uDDF7\uD83C\uDDFA Русский</button>' +
                        '<button class="btn btn-sm' + (currentLang === 'en' ? ' btn-primary' : ' btn-secondary') + '" id="lang-en" aria-pressed="' + (currentLang === 'en') + '">\uD83C\uDDEC\uD83C\uDDE7 English</button>' +
                    '</div>' +
                '</section>' +

                // Sound
                '<section class="settings-section" aria-label="' + t('settings_sound') + '">' +
                    '<h2><span class="section-icon settings-section-icon vmagic-breathe" aria-hidden="true">🔊</span> ' + t('settings_sound') + '</h2>' +
                    _renderSlider('sfx-volume', t('settings_sfx'), sfxVolume, '🔔') +
                    _renderSlider('music-volume', t('settings_music'), musicVolume, '🎵') +
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
                    '<button type="button" class="btn btn-primary btn-sm narrator-test-btn" id="btn-test-narrator">' + t('narrator_test') + '</button>' +
                    '<div class="settings-field">' +
                        '<label for="sound-density" class="input-label">' + t('settings_sound_density') + '</label>' +
                        '<select id="sound-density" class="input-field">' +
                            '<option value="minimal">' + t('settings_density_minimal') + '</option>' +
                            '<option value="standard" selected>' + t('settings_density_standard') + '</option>' +
                            '<option value="rich">' + t('settings_density_rich') + '</option>' +
                        '</select>' +
                    '</div>' +
                    _renderToggle('haptics-toggle', t('settings_haptics'), true, '📳') +
                '</section>' +

                // Accessibility
                '<section class="settings-section" aria-label="' + t('settings_accessibility') + '">' +
                    '<h2><span class="section-icon settings-section-icon vmagic-breathe" aria-hidden="true">♿</span> ' + t('settings_accessibility') + '</h2>' +
                    _renderToggle('contrast-toggle', t('settings_high_contrast'), highContrast) +
                    _renderToggle('motion-toggle', t('settings_reduced_motion'), reducedMotion) +
                    '<p class="settings-help-text">' + t('settings_reduced_motion_hint') + '</p>' +
                    '<div class="settings-accessibility-spacer" aria-hidden="true"></div>' +
                    _renderIconMotionOptions(iconMotion, t) +
                    '<p class="settings-help-text">' + t('settings_icon_motion_hint') + '</p>' +
                '</section>' +

                // Notifications
                '<section class="settings-section" aria-label="' + t('settings_notifications') + '">' +
                    '<h2><span class="section-icon settings-section-icon vmagic-breathe" aria-hidden="true">✉️</span> ' + t('settings_notifications') + '</h2>' +
                    _renderToggle('notif-events', t('settings_notif_events'), true) +
                    _renderToggle('notif-boss', t('settings_notif_boss'), true) +
                    _renderToggle('notif-quests', t('settings_notif_quests'), true) +
                '</section>' +

                // Account
                '<section class="settings-section" aria-label="' + t('settings_account') + '">' +
                    '<h2><span class="section-icon settings-section-icon vmagic-breathe" aria-hidden="true">🧙</span> ' + t('settings_account') + '</h2>' +
                    (user ? (
                        '<div class="settings-account-info">' +
                            '<div class="account-row"><span class="account-label">' + t('settings_account_name') + '</span><span class="account-value">' + Helpers.escapeHtml(user) + '</span></div>' +
                            _renderAvatarUpload(currentAvatar, currentCharacter, t) +
                        '</div>'
                    ) : '<p class="settings-not-logged">' + t('settings_not_logged') + '</p>') +
                '</section>' +

                // About
                '<section class="settings-section" aria-label="' + t('settings_about') + '">' +
                    '<h2><span class="section-icon settings-section-icon vmagic-breathe" aria-hidden="true">ℹ️</span> ' + t('settings_about') + '</h2>' +
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

    function _renderSlider(id, label, defaultValue, icon) {
        var iconHtml = icon ? '<span class="settings-control-icon vmagic-breathe" aria-hidden="true">' + icon + '</span> ' : '';
        return '<div class="settings-field">' +
            '<label for="' + id + '" class="input-label">' + iconHtml + label + '</label>' +
            '<input type="range" id="' + id + '" min="0" max="100" value="' + defaultValue + '" class="settings-slider" aria-label="' + label + '">' +
        '</div>';
    }

    function _renderToggle(id, label, defaultOn, icon) {
        var iconHtml = icon ? '<span class="settings-control-icon vmagic-breathe" aria-hidden="true">' + icon + '</span> ' : '';
        return '<div class="settings-field settings-toggle">' +
            '<label for="' + id + '" class="settings-toggle-label">' + iconHtml + label + '</label>' +
            '<button id="' + id + '" class="settings-toggle-btn' + (defaultOn ? ' active' : '') + '" ' +
                'role="switch" aria-checked="' + defaultOn + '" aria-label="' + label + '">' +
                '<span class="toggle-knob"></span>' +
            '</button>' +
        '</div>';
    }

    function _renderIconMotionOptions(currentMode, t) {
        var options = [
            { value: 'off', label: t('settings_icon_motion_off') },
            { value: 'sync', label: t('settings_icon_motion_sync') },
            { value: 'sparkle', label: t('settings_icon_motion_sparkle') }
        ];
        var html = '<div class="settings-field settings-icon-motion" role="group" aria-label="' + t('settings_icon_motion') + '">' +
            '<span class="input-label">' + t('settings_icon_motion') + '</span>' +
            '<div class="settings-toggle-group settings-choice-group">';
        for (var i = 0; i < options.length; i++) {
            html += '<button type="button" class="btn btn-sm ' + (currentMode === options[i].value ? 'btn-primary' : 'btn-secondary') + ' icon-motion-option" ' +
                'data-icon-motion="' + options[i].value + '" aria-pressed="' + (currentMode === options[i].value) + '">' + options[i].label + '</button>';
        }
        return html + '</div></div>';
    }

    function _renderAvatarUpload(currentAvatar, currentCharacter, t) {
        var previewSrc = pendingAvatarDataUrl || currentAvatar || '';
        var preview = previewSrc ? '<img class="account-avatar profile-avatar settings-avatar-preview" src="' + Helpers.escapeHtml(previewSrc) + '" alt="" aria-hidden="true" loading="lazy" decoding="async">' : _renderDefaultAvatarPreview(currentCharacter);
        return '<div class="settings-avatar-field">' +
            '<div class="settings-avatar-heading">' +
                '<label for="avatar-upload" class="input-label">' + t('settings_avatar') + '</label>' +
                '<span class="settings-avatar-preview-slot" id="avatar-preview-slot">' + preview + '</span>' +
            '</div>' +
            '<div class="settings-avatar-row">' +
                '<input id="avatar-upload" class="input-field settings-avatar-input" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="avatar-help avatar-preview-hint avatar-status">' +
            '</div>' +
            '<p class="settings-help-text" id="avatar-help">' + t('settings_avatar_hint') + '</p>' +
            _renderAvatarModeChoice(t) +
            '<p class="settings-help-text" id="avatar-preview-hint">' + t('settings_avatar_preview_hint') + '</p>' +
            '<div class="settings-avatar-actions">' +
                '<button type="button" class="btn btn-primary btn-sm" id="btn-avatar-save"' + (pendingAvatarDataUrl ? '' : ' disabled') + '>' + t('settings_avatar_save') + '</button>' +
                '<button type="button" class="btn btn-secondary btn-sm" id="btn-avatar-remove"' + (currentAvatar ? '' : ' disabled') + '>' + t('settings_avatar_remove') + '</button>' +
            '</div>' +
            '<p class="settings-help-text" id="avatar-status" role="status" aria-live="polite"></p>' +
        '</div>';
    }


    function _renderDefaultAvatarPreview(currentCharacter) {
        return '<span class="account-avatar profile-avatar settings-avatar-preview default-avatar" aria-hidden="true">' + Helpers.classIcon((currentCharacter && currentCharacter.className) || 'embercaster') + '</span>';
    }

    function _renderAvatarModeChoice(t) {
        var currentMode = _getStoredText('avatar_fit_mode', 'fit');
        return '<div class="settings-field settings-avatar-mode" role="group" aria-label="' + t('settings_avatar_mode') + '">' +
            '<span class="input-label">' + t('settings_avatar_mode') + '</span>' +
            '<div class="settings-toggle-group settings-choice-group">' +
                '<button type="button" class="btn btn-sm ' + (currentMode === 'fit' ? 'btn-primary' : 'btn-secondary') + ' avatar-mode-option" data-avatar-mode="fit" aria-pressed="' + (currentMode === 'fit') + '">' + t('settings_avatar_mode_fit') + '</button>' +
                '<button type="button" class="btn btn-sm ' + (currentMode === 'crop' ? 'btn-primary' : 'btn-secondary') + ' avatar-mode-option" data-avatar-mode="crop" aria-pressed="' + (currentMode === 'crop') + '">' + t('settings_avatar_mode_crop') + '</button>' +
            '</div>' +
            '<p class="settings-help-text">' + t('settings_avatar_mode_hint') + '</p>' +
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

        // Icon motion buttons
        var motionOptions = el.querySelectorAll('.icon-motion-option');
        for (var mo = 0; mo < motionOptions.length; mo++) {
            motionOptions[mo].addEventListener('click', function() {
                var mode = this.getAttribute('data-icon-motion') || 'sparkle';
                try { localStorage.setItem(STORAGE_PREFIX + 'icon_motion', mode); } catch (e) {}
                if (document && document.body) document.body.setAttribute('data-icon-motion', mode);
                SoundManager.play('tap');
                render();
            });
        }

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

        // Avatar upload
        var avatarModeOptions = el.querySelectorAll('.avatar-mode-option');
        for (var amo = 0; amo < avatarModeOptions.length; amo++) {
            avatarModeOptions[amo].addEventListener('click', function() {
                var mode = this.getAttribute('data-avatar-mode') === 'crop' ? 'crop' : 'fit';
                try { localStorage.setItem(STORAGE_PREFIX + 'avatar_fit_mode', mode); } catch (e) {}
                SoundManager.play('tap');
                render();
            });
        }
        var avatarInput = el.querySelector('#avatar-upload');
        if (avatarInput) avatarInput.addEventListener('change', function() {
            _handleAvatarUpload(this.files && this.files[0], el);
        });
        var avatarSaveBtn = el.querySelector('#btn-avatar-save');
        if (avatarSaveBtn) avatarSaveBtn.addEventListener('click', function() {
            _savePendingAvatar(el);
        });
        var avatarRemoveBtn = el.querySelector('#btn-avatar-remove');
        if (avatarRemoveBtn) avatarRemoveBtn.addEventListener('click', function() {
            _removeAvatar(el);
        });

        // Realm info
        var realmBtn = el.querySelector('#btn-realm-info');
        if (realmBtn) realmBtn.addEventListener('click', function() {
            Modal.show(
                Helpers.t('settings_realm_magic'),
                '<p>' + Helpers.t('settings_realm_magic_desc') + '</p>'
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

    var AVATAR_INPUT_MAX_BYTES = 2 * 1024 * 1024;
    var AVATAR_OUTPUT_MAX_CHARS = 32768;
    var AVATAR_TARGET_SIZE = 192;

    function _setAvatarStatus(el, key, isError) {
        var status = el && el.querySelector ? el.querySelector('#avatar-status') : null;
        if (status) {
            status.textContent = Helpers.t(key);
            status.className = 'settings-help-text' + (isError ? ' settings-error-text' : '');
        }
    }

    function _handleAvatarUpload(file, el) {
        if (!file) return;
        if (!/^image\/(png|jpeg|webp)$/.test(file.type || '') || file.size > AVATAR_INPUT_MAX_BYTES) {
            _setAvatarStatus(el, 'settings_avatar_error_type', true);
            return;
        }
        _setAvatarStatus(el, 'settings_avatar_processing', false);
        _readMagicBytes(file, function(ok) {
            if (!ok) {
                _setAvatarStatus(el, 'settings_avatar_error_type', true);
                return;
            }
            var avatarMode = _getStoredText('avatar_fit_mode', 'fit') === 'crop' ? 'crop' : 'fit';
            _encodeAvatar(file, avatarMode, function(err, dataUrl) {
                if (err || !dataUrl || dataUrl.length > AVATAR_OUTPUT_MAX_CHARS || !VizAccount.sanitizeAvatarUrl(dataUrl)) {
                    pendingAvatarDataUrl = '';
                    _setAvatarStatus(el, 'settings_avatar_error_process', true);
                    return;
                }
                pendingAvatarDataUrl = dataUrl;
                _setAvatarPreview(el, dataUrl);
                _setAvatarStatus(el, 'settings_avatar_ready', false);
                var saveBtn = el.querySelector('#btn-avatar-save');
                if (saveBtn) saveBtn.disabled = false;
            });
        });
    }

    function _readMagicBytes(file, callback) {
        var reader = new FileReader();
        reader.onerror = function() { callback(false); };
        reader.onload = function() {
            var bytes = new Uint8Array(reader.result || []);
            var isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A;
            var isJpeg = bytes.length > 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
            var isWebp = bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
            callback(isPng || isJpeg || isWebp);
        };
        reader.readAsArrayBuffer(file.slice(0, 16));
    }

    function _encodeAvatar(file, mode, callback) {
        mode = mode === 'crop' ? 'crop' : 'fit';
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function() {
            try {
                var size = AVATAR_TARGET_SIZE;
                var canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                var ctx = canvas.getContext('2d');
                var iw = img.naturalWidth || img.width;
                var ih = img.naturalHeight || img.height;
                if (!iw || !ih || iw <= 0 || ih <= 0 || iw > 6000 || ih > 6000) throw new Error('bad_dimensions');
                ctx.clearRect(0, 0, size, size);
                if (mode === 'crop') {
                    var side = Math.min(iw, ih);
                    var sx = Math.floor((iw - side) / 2);
                    var sy = Math.floor((ih - side) / 2);
                    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
                } else {
                    var scale = Math.min(size / iw, size / ih);
                    var dw = Math.round(iw * scale);
                    var dh = Math.round(ih * scale);
                    var dx = Math.floor((size - dw) / 2);
                    var dy = Math.floor((size - dh) / 2);
                    ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
                }
                var dataUrl = canvas.toDataURL('image/webp', 0.82);
                if (!/^data:image\/webp;base64,/.test(dataUrl) || dataUrl.length > AVATAR_OUTPUT_MAX_CHARS) {
                    dataUrl = canvas.toDataURL('image/png');
                }
                URL.revokeObjectURL(url);
                callback(null, dataUrl);
            } catch (e) {
                URL.revokeObjectURL(url);
                callback(e);
            }
        };
        img.onerror = function() {
            URL.revokeObjectURL(url);
            callback(new Error('decode_failed'));
        };
        img.src = url;
    }

    function _setAvatarPreview(el, dataUrl) {
        var slot = el && el.querySelector ? el.querySelector('#avatar-preview-slot') : null;
        if (slot) {
            slot.innerHTML = dataUrl ? '<img class="account-avatar profile-avatar settings-avatar-preview" src="' + Helpers.escapeHtml(dataUrl) + '" alt="" aria-hidden="true" loading="lazy" decoding="async">' : _renderDefaultAvatarPreview((function(){ var user = VizAccount.getCurrentUser && VizAccount.getCurrentUser(); return user && StateEngine.getCharacter ? StateEngine.getCharacter(user) : null; })());
        }
    }

    function _savePendingAvatar(el) {
        if (!pendingAvatarDataUrl) {
            _setAvatarStatus(el, 'settings_avatar_error_process', true);
            return;
        }
        _setAvatarStatus(el, 'settings_avatar_saving', false);
        VizAccount.updateProfileAvatar(pendingAvatarDataUrl, function(saveErr) {
            if (saveErr) {
                _setAvatarStatus(el, 'settings_avatar_error_save', true);
                return;
            }
            _applyCurrentAvatar(pendingAvatarDataUrl);
            pendingAvatarDataUrl = '';
            Toast.success(Helpers.t('settings_avatar_saved'));
            render();
        });
    }

    function _removeAvatar(el) {
        pendingAvatarDataUrl = '';
        _setAvatarStatus(el, 'settings_avatar_saving', false);
        VizAccount.removeProfileAvatar(function(err) {
            if (err) {
                _setAvatarStatus(el, 'settings_avatar_error_save', true);
                return;
            }
            _applyCurrentAvatar('');
            Toast.success(Helpers.t('settings_avatar_removed'));
            render();
        });
    }

    function _applyCurrentAvatar(dataUrl) {
        var user = VizAccount.getCurrentUser();
        var ch = user && StateEngine.getCharacter ? StateEngine.getCharacter(user) : null;
        if (ch) ch.avatarUrl = dataUrl || '';
    }

    return { render: render };
})();
