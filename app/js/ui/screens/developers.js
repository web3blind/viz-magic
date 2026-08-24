/**
 * Viz Magic — Creators book / support screen.
 * Keeps the stable `developers` route while presenting its player-facing name as Creators.
 */
var DevelopersScreen = (function() {
    'use strict';

    var DEVELOPER_ACCOUNT = 'denis-skripnik';
    var REWARD_OPTIONS = [100]; // one quick reward button: 1.00%

    function _externalLink(href, labelKey) {
        return '<a class="creators-link" href="' + href + '" target="_blank" rel="noopener noreferrer">' + Helpers.t(labelKey) + '</a>';
    }

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-developers');
        if (!el) return;
        el.setAttribute('aria-label', t('developers_title'));

        var user = typeof VizAccount !== 'undefined' ? VizAccount.getCurrentUser() : '';
        var html = '<div class="developers-screen creators-screen">';
        html += '<article class="creators-book" aria-labelledby="creators-book-title">';
        html += '<div class="creators-book-binding" aria-hidden="true"></div>';
        html += '<header class="creators-book-cover">';
        html += '<p class="creators-book-kicker">' + t('developers_book_kicker') + '</p>';
        html += '<h1 id="creators-book-title">' + Helpers.icon('chronicle', 'screen-title-icon vmagic-breathe') + ' ' + t('developers_title') + '</h1>';
        html += '<p class="creators-book-intro">' + t('developers_intro') + '</p>';
        html += '</header>';

        html += '<section class="creators-page creators-page-denis" aria-labelledby="creators-denis-title">';
        html += '<p class="creators-page-number" aria-hidden="true">I</p>';
        html += '<h2 id="creators-denis-title">' + Helpers.icon('spark', 'section-icon vmagic-breathe') + ' ' + t('developers_denis_title') + '</h2>';
        html += '<p>' + t('developers_denis_text_1') + '</p>';
        html += '<p>' + t('developers_denis_text_2') + '</p>';
        html += '<p>' + t('developers_denis_text_3') + '</p>';
        html += '<nav class="creators-link-list" aria-label="' + t('developers_denis_links_label') + '">';
        html += _externalLink('https://github.com/web3blind', 'developers_link_github');
        html += _externalLink('https://t.me/blind_dev', 'developers_link_telegram');
        html += _externalLink('https://vk.ru/denis_skripnik', 'developers_link_vk_profile');
        html += _externalLink('https://vk.ru/blind_dev', 'developers_link_vk_blog');
        html += _externalLink('https://x.com/denis_skripnik', 'developers_link_x');
        html += _externalLink('https://life.blinddev.xyz/', 'developers_link_life');
        html += _externalLink('https://vk.ru/life_harbor_game', 'developers_link_life_story');
        html += '</nav>';
        html += '</section>';

        html += '<div class="creators-book-seal" aria-hidden="true"></div>';

        html += '<section class="creators-page creators-page-evgeny" aria-labelledby="creators-evgeny-title">';
        html += '<p class="creators-page-number" aria-hidden="true">II</p>';
        html += '<h2 id="creators-evgeny-title">' + Helpers.icon('map', 'section-icon vmagic-breathe') + ' ' + t('developers_evgeny_title') + '</h2>';
        html += '<p>' + t('developers_evgeny_text_1') + '</p>';
        html += '<p>' + t('developers_evgeny_text_2') + '</p>';
        html += '<p>' + t('developers_evgeny_text_3') + '</p>';
        html += '<nav class="creators-link-list" aria-label="' + t('developers_evgeny_links_label') + '">';
        html += _externalLink('https://vk.ru/id55771964', 'developers_link_evgeny_vk');
        html += '</nav>';
        html += '</section>';

        html += '<section class="creators-page creators-gratitude" aria-labelledby="creators-reward-title">';
        html += '<h2 id="creators-reward-title">' + Helpers.icon('core', 'section-icon vmagic-breathe') + ' ' + t('developers_reward_title') + '</h2>';
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
        html += '</article>';
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
