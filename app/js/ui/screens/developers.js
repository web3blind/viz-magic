/**
 * Viz Magic — Creators book / support screen.
 * Keeps the stable `developers` route while presenting its player-facing name as Creators.
 */
var DevelopersScreen = (function() {
    'use strict';

    var CREATORS = {
        denis: { id: 'denis', account: 'denis-skripnik', nameKey: 'developers_denis_name' },
        evgeny: { id: 'evgeny', account: 'ko4evnik', nameKey: 'developers_evgeny_name' }
    };
    var REWARD_OPTIONS = [100]; // one quick reward button: 1.00%

    function _externalLink(href, labelKey) {
        return '<a class="creators-link" href="' + href + '" target="_blank" rel="noopener noreferrer">' + Helpers.t(labelKey) + '</a>';
    }

    function _renderRewardSeal(creator, t, user) {
        if (!creator.account) return '';
        var inputId = 'creators-custom-energy-' + creator.id;
        var titleId = 'creators-reward-' + creator.id;
        var html = '<section class="creators-page-gratitude" aria-labelledby="' + titleId + '">';
        html += '<h3 id="' + titleId + '">' + Helpers.icon('core', 'section-icon vmagic-breathe') + ' ' + t('developers_reward_title') + '</h3>';
        html += '<p>' + t('developers_reward_text', { creator: t(creator.nameKey), account: creator.account }) + '</p>';
        html += '<p class="developers-note">' + t('developers_reward_note') + '</p>';
        if (!user) {
            html += '<div class="empty-state">' + t('developers_login_required', { creator: t(creator.nameKey) }) + '</div>';
        } else {
            html += '<div class="developers-custom-reward">';
            html += '<label for="' + inputId + '" class="input-label">' + t('developers_custom_reward_label') + '</label>';
            html += '<input id="' + inputId + '" class="input-field" type="number" min="0.01" max="100" step="0.01" inputmode="decimal" placeholder="0.25">';
            html += '<p class="developers-note">' + t('developers_custom_reward_hint') + '</p>';
            html += '<button type="button" class="btn btn-primary dev-custom-reward-btn" data-creator="' + creator.id + '">' + t('developers_custom_reward_button') + '</button>';
            html += '</div>';
            html += '<div class="developers-reward-options" role="group" aria-label="' + t('developers_reward_group_label', { creator: t(creator.nameKey) }) + '">';
            for (var i = 0; i < REWARD_OPTIONS.length; i++) {
                html += '<button type="button" class="btn btn-primary dev-reward-btn" data-creator="' + creator.id + '" data-energy="' + REWARD_OPTIONS[i] + '">' +
                    t('developers_reward_button', { amount: Helpers.bpToPercent(REWARD_OPTIONS[i]) }) + '</button>';
            }
            html += '</div>';
        }
        html += '</section>';
        return html;
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
        html += _renderRewardSeal(CREATORS.denis, t, user);
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
        html += _renderRewardSeal(CREATORS.evgeny, t, user);
        html += '</section>';
        html += '</article>';
        html += '</div>';
        el.innerHTML = html;
        _bindEvents(el);
    }

    function _creatorFromButton(button) {
        return CREATORS[button.getAttribute('data-creator')] || null;
    }

    function _bindEvents(el) {
        var customButtons = el.querySelectorAll('.dev-custom-reward-btn');
        for (var i = 0; i < customButtons.length; i++) {
            customButtons[i].addEventListener('click', function() {
                var creator = _creatorFromButton(this);
                if (!creator || !creator.account) return;
                var input = el.querySelector('#creators-custom-energy-' + creator.id);
                var percent = input ? parseFloat(String(input.value || '').replace(',', '.')) : 0;
                if (!(percent >= 0.01 && percent <= 100)) {
                    Toast.error(Helpers.t('developers_reward_invalid'));
                    SoundManager.play('error');
                    return;
                }
                _confirmReward(creator, Math.round(percent * 100));
            });
        }

        var buttons = el.querySelectorAll('.dev-reward-btn');
        for (var j = 0; j < buttons.length; j++) {
            buttons[j].addEventListener('click', function() {
                var creator = _creatorFromButton(this);
                var energy = parseInt(this.getAttribute('data-energy'), 10) || 0;
                if (creator && creator.account) _confirmReward(creator, energy);
            });
        }
    }

    function _confirmReward(creator, energy) {
        var t = Helpers.t;
        SoundManager.play('tap');
        Modal.show({
            title: t('developers_reward_confirm_title'),
            text: t('developers_reward_confirm_text', {
                amount: Helpers.bpToPercent(energy),
                creator: t(creator.nameKey),
                account: creator.account
            }),
            buttons: [
                {
                    text: t('developers_reward_confirm_button'),
                    className: 'btn-primary',
                    action: function() { _sendReward(creator, energy); }
                },
                {
                    text: t('cancel'),
                    className: 'btn-secondary',
                    action: function() {}
                }
            ]
        });
    }

    function _sendReward(creator, energy) {
        var t = Helpers.t;
        var creatorName = t(creator.nameKey);
        var memo = 'viz://vm/developers/thanks — ' + t('developers_reward_memo', { creator: creatorName });
        VizBroadcast.award(creator.account, energy, 0, memo, [], function(err) {
            if (err) {
                Toast.error(t('developers_reward_error', { creator: creatorName }));
                SoundManager.play('error');
                return;
            }
            Toast.success(t('developers_reward_success', { creator: creatorName }));
            SoundManager.play('success');
            SoundManager.vibrate('success');
        });
    }

    return { render: render };
})();
