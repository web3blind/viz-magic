/**
 * Viz Magic — Developers / Support Screen
 * Shows who builds the game and lets a player voluntarily award the developer.
 */
var DevelopersScreen = (function() {
    'use strict';

    var DEVELOPER_ACCOUNT = 'denis-skripnik';
    var REWARD_OPTIONS = [100]; // one quick reward button: 1.00%

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-developers');
        if (!el) return;

        var user = typeof VizAccount !== 'undefined' ? VizAccount.getCurrentUser() : '';
        var html = '<div class="developers-screen">';
        html += '<h1>🛠️ ' + t('developers_title') + '</h1>';
        html += '<section class="developers-card" aria-label="' + t('developers_about_title') + '">';
        html += '<h2><span class="section-icon vmagic-breathe" aria-hidden="true">🧙</span> ' + t('developers_about_title') + '</h2>';
        html += '<p>' + t('developers_about_text') + '</p>';
        html += '<p><strong>' + t('developers_primary_dev') + ':</strong> @' + DEVELOPER_ACCOUNT + '</p>';
        html += '</section>';

        html += '<section class="developers-card" aria-label="' + t('developers_reward_title') + '">';
        html += '<h2>💎 ' + t('developers_reward_title') + '</h2>';
        html += '<p>' + t('developers_reward_text') + '</p>';
        html += '<p class="developers-note">' + t('developers_reward_note') + '</p>';
        if (!user) {
            html += '<div class="empty-state">' + t('developers_login_required') + '</div>';
        } else {
            html += '<div class="developers-custom-reward">';
            html += '<label for="developers-custom-energy" class="input-label">' + t('developers_custom_reward_label') + '</label>';
            html += '<input id="developers-custom-energy" class="input-field" type="number" min="0.01" max="100" step="0.01" inputmode="decimal" placeholder="0.25">';
            html += '<p class="developers-note">' + t('developers_custom_reward_hint') + '</p>';
            html += '<button type="button" class="btn btn-primary dev-custom-reward-btn">' + t('developers_custom_reward_button') + '</button>';
            html += '</div>';
            html += '<div class="developers-reward-options" role="group" aria-label="' + t('developers_reward_title') + '">';
            for (var i = 0; i < REWARD_OPTIONS.length; i++) {
                html += '<button type="button" class="btn btn-primary dev-reward-btn" data-energy="' + REWARD_OPTIONS[i] + '">' +
                    t('developers_reward_button', { amount: Helpers.bpToPercent(REWARD_OPTIONS[i]) }) + '</button>';
            }
            html += '</div>';
        }
        html += '</section>';
        html += '</div>';
        el.innerHTML = html;
        _bindEvents(el);
    }

    function _bindEvents(el) {
        var customBtn = el.querySelector('.dev-custom-reward-btn');
        if (customBtn) {
            customBtn.addEventListener('click', function() {
                var input = el.querySelector('#developers-custom-energy');
                var percent = input ? parseFloat(String(input.value || '').replace(',', '.')) : 0;
                if (!(percent >= 0.01 && percent <= 100)) {
                    Toast.error(Helpers.t('developers_reward_invalid'));
                    SoundManager.play('error');
                    return;
                }
                _confirmReward(Math.round(percent * 100));
            });
        }

        var buttons = el.querySelectorAll('.dev-reward-btn');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', function() {
                var energy = parseInt(this.getAttribute('data-energy'), 10) || 0;
                _confirmReward(energy);
            });
        }
    }

    function _confirmReward(energy) {
        var t = Helpers.t;
        SoundManager.play('tap');
        Modal.show({
            title: t('developers_reward_confirm_title'),
            text: t('developers_reward_confirm_text', { amount: Helpers.bpToPercent(energy), account: DEVELOPER_ACCOUNT }),
            buttons: [
                {
                    text: t('developers_reward_confirm_button'),
                    className: 'btn-primary',
                    action: function() { _sendReward(energy); }
                },
                {
                    text: t('cancel'),
                    className: 'btn-secondary',
                    action: function() {}
                }
            ]
        });
    }

    function _sendReward(energy) {
        var t = Helpers.t;
        var memo = 'viz://vm/developers/thanks — ' + t('developers_reward_memo');
        VizBroadcast.award(DEVELOPER_ACCOUNT, energy, 0, memo, [], function(err) {
            if (err) {
                Toast.error(t('developers_reward_error'));
                SoundManager.play('error');
                return;
            }
            Toast.success(t('developers_reward_success'));
            SoundManager.play('success');
            SoundManager.vibrate('success');
        });
    }

    return { render: render };
})();
