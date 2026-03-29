/**
 * Viz Magic — Login Screen
 * For existing VIZ account holders
 */
var LoginScreen = (function() {
    'use strict';

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-login');
        if (!el) return;

        el.innerHTML =
            '<div class="screen-content login-screen">' +
                '<h1>' + t('login_title') + '</h1>' +
                '<p class="login-subtitle">' + t('login_subtitle') + '</p>' +
                '<form id="login-form" class="login-form">' +
                    '<div class="form-group">' +
                        '<label for="login-account">' + t('login_account_label') + '</label>' +
                        '<input type="text" id="login-account" class="input" ' +
                            'placeholder="' + t('login_account_placeholder') + '" ' +
                            'autocomplete="username" autocapitalize="none" spellcheck="false" ' +
                            'aria-label="' + t('login_account_label') + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="login-key">' + t('login_key_label') + '</label>' +
                        '<input type="password" id="login-key" class="input" ' +
                            'placeholder="' + t('login_key_placeholder') + '" ' +
                            'autocomplete="current-password" ' +
                            'aria-label="' + t('login_key_label') + '">' +
                    '</div>' +
                    '<div id="login-error" class="error-message" role="alert" aria-live="assertive"></div>' +
                    '<div id="login-status" class="login-status" aria-live="polite"></div>' +
                    '<button type="submit" class="btn btn-primary btn-large" id="btn-login">' +
                        t('login_button') +
                    '</button>' +
                '</form>' +
                '<p class="login-back">' +
                    '<a href="#" id="btn-login-back">' + t('login_back') + '</a>' +
                '</p>' +
            '</div>';

        var form = Helpers.$('login-form');
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            _doLogin();
        });

        Helpers.$('btn-login-back').addEventListener('click', function(e) {
            e.preventDefault();
            SoundManager.play('tap');
            Helpers.EventBus.emit('navigate', 'landing');
        });
    }

    function _doLogin() {
        var t = Helpers.t;
        var account = Helpers.$('login-account').value.trim().toLowerCase();
        var key = Helpers.$('login-key').value.trim();
        var errorEl = Helpers.$('login-error');
        var statusEl = Helpers.$('login-status');
        var btn = Helpers.$('btn-login');

        errorEl.textContent = '';
        statusEl.textContent = t('login_connecting');
        btn.disabled = true;

        if (account.charAt(0) === '@') account = account.substring(1);

        if (!account) {
            errorEl.textContent = t('error_no_mage_name');
            statusEl.textContent = '';
            btn.disabled = false;
            return;
        }
        if (!key) {
            errorEl.textContent = t('error_empty_key');
            statusEl.textContent = '';
            btn.disabled = false;
            return;
        }

        VizAccount.login(account, key, function(err, accountData) {
            btn.disabled = false;
            statusEl.textContent = '';

            if (err) {
                var msg = t('error_' + err.message) || t('error_generic');
                errorEl.textContent = msg;
                SoundManager.play('error');
                return;
            }

            SoundManager.play('success');
            SoundManager.play('tap');

            // Check if character exists (has Grimoire)
            var grimoire = VizAccount.parseGrimoire(accountData);
            if (grimoire && grimoire.class) {
                // Existing character — go to home
                Helpers.EventBus.emit('navigate', 'home');
            } else {
                // No character yet — go to onboarding (class selection)
                Helpers.EventBus.emit('navigate', 'onboarding');
            }
        });
    }

    return { render: render };
})();
