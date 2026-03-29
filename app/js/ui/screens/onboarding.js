/**
 * Viz Magic — Onboarding / Character Creation Flow
 */
var OnboardingScreen = (function() {
    'use strict';

    var step = 0;
    var selectedClass = '';
    var mageName = '';

    function render() {
        var el = Helpers.$('screen-onboarding');
        if (!el) return;
        step = 0;
        _renderStep(el);
    }

    function _renderStep(el) {
        var t = Helpers.t;
        switch (step) {
            case 0: _renderNameStep(el, t); break;
            case 1: _renderClassStep(el, t); break;
            case 2: _renderLoginStep(el, t); break;
        }
    }

    function _renderNameStep(el, t) {
        el.innerHTML =
            '<div class="onboarding-step">' +
                '<h1>' + t('onboarding_awaken_title') + '</h1>' +
                '<p class="onboarding-text">' + t('onboarding_awaken_text').replace(/\n/g, '<br>') + '</p>' +
                '<label for="mage-name-input" class="input-label">' + t('onboarding_name_prompt') + '</label>' +
                '<input type="text" id="mage-name-input" class="input-field" ' +
                    'aria-label="' + t('onboarding_name_prompt') + '" ' +
                    'autocomplete="off" maxlength="50" value="' + Helpers.escapeHtml(mageName) + '">' +
                '<div id="name-feedback" class="input-feedback" aria-live="polite"></div>' +
                '<button class="btn btn-primary btn-large" id="btn-name-next" disabled>' +
                    t('onboarding_next') +
                '</button>' +
            '</div>';

        var input = Helpers.$('mage-name-input');
        var feedback = Helpers.$('name-feedback');
        var btn = Helpers.$('btn-name-next');

        input.addEventListener('input', Helpers.debounce(function() {
            mageName = input.value.trim();
            if (!mageName) {
                feedback.textContent = '';
                btn.disabled = true;
                return;
            }
            if (mageName.length < 2) {
                feedback.textContent = t('onboarding_name_invalid');
                feedback.className = 'input-feedback error';
                btn.disabled = true;
                return;
            }
            feedback.textContent = '\u2728 ' + t('onboarding_name_available');
            feedback.className = 'input-feedback success';
            btn.disabled = false;
        }, 300));

        btn.addEventListener('click', function() {
            if (!mageName) return;
            SoundManager.play('transition');
            step = 1;
            _renderStep(el);
        });

        // BUG 3 FIX: Re-validate on render when returning via Back button
        if (mageName && mageName.length >= 2) {
            feedback.textContent = '\u2728 ' + t('onboarding_name_available');
            feedback.className = 'input-feedback success';
            btn.disabled = false;
        }

        input.focus();
    }

    function _renderClassStep(el, t) {
        var classes = [
            { id: 'stonewarden', icon: '\uD83D\uDEE1\uFE0F', diff: t('class_difficulty_easy') },
            { id: 'embercaster', icon: '\uD83D\uDD25', diff: t('class_difficulty_easy') },
            { id: 'moonrunner',  icon: '\uD83C\uDF19', diff: t('class_difficulty_medium') },
            { id: 'bloomsage',   icon: '\uD83C\uDF3F', diff: t('class_difficulty_medium') }
        ];

        var html = '<div class="onboarding-step">' +
            '<h1>' + t('onboarding_class_title') + '</h1>' +
            '<p class="onboarding-text">' + t('onboarding_class_text').replace(/\n/g, '<br>') + '</p>' +
            '<div class="class-grid" role="radiogroup" aria-label="' + t('onboarding_class_title') + '">';

        for (var i = 0; i < classes.length; i++) {
            var c = classes[i];
            var sel = c.id === selectedClass ? ' selected' : '';
            html += '<button class="class-card' + sel + '" role="radio" aria-checked="' + (c.id === selectedClass) + '" ' +
                'data-class="' + c.id + '" aria-label="' + t('class_' + c.id) + '. ' + t('class_' + c.id + '_desc') + '">' +
                '<span class="class-icon" aria-hidden="true">' + c.icon + '</span>' +
                '<h3>' + t('class_' + c.id) + '</h3>' +
                '<p class="class-quote">' + t('class_' + c.id + '_desc') + '</p>' +
                '<p class="class-detail">' + t('class_' + c.id + '_detail') + '</p>' +
                '<span class="class-diff">' + c.diff + '</span>' +
                '</button>';
        }

        html += '</div>' +
            '<div class="onboarding-buttons">' +
                '<button class="btn btn-secondary" id="btn-class-back">' + t('onboarding_back') + '</button>' +
                '<button class="btn btn-primary" id="btn-class-next" ' + (selectedClass ? '' : 'disabled') + '>' +
                    t('onboarding_next') +
                '</button>' +
            '</div></div>';

        el.innerHTML = html;

        var cards = el.querySelectorAll('.class-card');
        for (var j = 0; j < cards.length; j++) {
            cards[j].addEventListener('click', function() {
                selectedClass = this.getAttribute('data-class');
                SoundManager.play('tap');
                for (var k = 0; k < cards.length; k++) {
                    cards[k].classList.remove('selected');
                    cards[k].setAttribute('aria-checked', 'false');
                }
                this.classList.add('selected');
                this.setAttribute('aria-checked', 'true');
                Helpers.$('btn-class-next').disabled = false;
            });
        }

        Helpers.$('btn-class-back').addEventListener('click', function() {
            step = 0;
            _renderStep(el);
        });

        Helpers.$('btn-class-next').addEventListener('click', function() {
            if (!selectedClass) return;
            SoundManager.play('transition');
            step = 2;
            _renderStep(el);
        });
    }

    /**
     * Create character locally and on chain, then navigate home.
     * BUG 1 FIX: Also creates the character in StateEngine immediately
     * so Hunt and other screens can find it without waiting for chain.
     * BUG 2 FIX: Called directly when user is already logged in.
     */
    function _createCharacterAndFinish() {
        var user = VizAccount.getCurrentUser();

        // Create character locally in StateEngine so all screens see it immediately
        var state = StateEngine.getState();
        var character = CharacterSystem.createCharacter(user, mageName, selectedClass);
        if (character) {
            state.characters[user] = character;
            state.inventories[user] = state.inventories[user] || [];
        }

        // Broadcast to chain
        var actionData = VMProtocol.createCharAttuneAction(selectedClass, mageName);
        VizBroadcast.gameAction(actionData, function(err2) {
            if (err2) {
                console.log('Char attune broadcast error (may already exist):', err2);
            }
        });

        // Save grimoire to blockchain so character persists across page reloads
        VizAccount.updateGrimoire({ class: selectedClass, name: mageName }, function(err3) {
            if (err3) {
                console.log('Grimoire save error:', err3);
            } else {
                console.log('Grimoire saved to chain for', user);
            }
        });

        SoundManager.play('success');
        Helpers.EventBus.emit('navigate', 'home');
    }

    function _renderLoginStep(el, t) {
        // BUG 2 FIX: If user is already logged in, skip the login form
        var currentUser = VizAccount.getCurrentUser();
        if (currentUser) {
            _createCharacterAndFinish();
            return;
        }

        el.innerHTML =
            '<div class="onboarding-step">' +
                '<h1>' + t('login_title') + '</h1>' +
                '<p class="onboarding-text">' +
                    'Class: ' + Helpers.classIcon(selectedClass) + ' ' + t('class_' + selectedClass) +
                    '<br>Name: ' + Helpers.escapeHtml(mageName) +
                '</p>' +
                '<label for="login-account" class="input-label">' + t('login_account') + '</label>' +
                '<input type="text" id="login-account" class="input-field" autocomplete="username">' +
                '<label for="login-key" class="input-label">' + t('login_key') + '</label>' +
                '<input type="password" id="login-key" class="input-field" autocomplete="current-password">' +
                '<div id="login-error" class="input-feedback error" aria-live="polite"></div>' +
                '<button class="btn btn-primary btn-large" id="btn-login-submit">' +
                    t('login_submit') +
                '</button>' +
                '<button class="btn btn-secondary" id="btn-login-back">' + t('onboarding_back') + '</button>' +
            '</div>';

        Helpers.$('btn-login-back').addEventListener('click', function() {
            step = 1;
            _renderStep(el);
        });

        Helpers.$('btn-login-submit').addEventListener('click', function() {
            var account = Helpers.$('login-account').value.trim();
            var key = Helpers.$('login-key').value.trim();
            var errorEl = Helpers.$('login-error');

            if (!account || !key) {
                errorEl.textContent = t('login_error_empty');
                return;
            }

            errorEl.textContent = Helpers.t('loading');
            VizAccount.login(account, key, function(err) {
                if (err) {
                    if (err.message === 'account_not_found') errorEl.textContent = t('login_error_not_found');
                    else if (err.message === 'invalid_regular_key') errorEl.textContent = t('login_error_wrong_key');
                    else errorEl.textContent = err.message;
                    return;
                }

                _createCharacterAndFinish();
            });
        });
    }

    return { render: render };
})();
