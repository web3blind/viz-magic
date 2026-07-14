/**
 * Viz Magic — Temple Screen
 * Small, economics-safe offerings to symbolic VIZ accounts.
 */
var TempleScreen = (function() {
    'use strict';

    var OFFERING_ENERGY = 50; // 0.50% mana — deliberately small
    var busy = false;

    var PRAYERS = {
        fire_goddess: ['fire_power', 'fire_second', 'fire_mercy'],
        labor_god: ['labor_hands', 'labor_craft', 'labor_patience']
    };

    var DEITIES = [
        {
            id: 'fire_goddess',
            target: 'null',
            image: 'assets/deities/goddess-fire.svg',
            icon: '🔥',
            item: 'flame_votive_mark',
            socialTag: '#fire'
        },
        {
            id: 'labor_god',
            target: 'committee',
            image: 'assets/deities/god-labor.svg',
            icon: '🔨',
            item: 'labor_votive_mark',
            socialTag: '#labor'
        }
    ];

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-temple');
        if (!el) return;
        var state = StateEngine.getState();
        var user = VizAccount.getCurrentUser();
        var temple = state.temple && user ? (state.temple[user] || {}) : {};

        var html = '<div class="temple-screen">' +
            '<div class="screen-header">' +
                '<h1 data-screen-focus>' + t('temple_title') + '</h1>' +
                '<p>' + t('temple_intro') + '</p>' +
                '<p class="temple-balance-note">' + t('temple_balance_note') + '</p>' +
                '<p id="temple-status-region" class="temple-status-region" role="status" aria-live="polite"></p>' +
            '</div>' +
            '<div class="temple-deities">';

        for (var i = 0; i < DEITIES.length; i++) {
            html += _renderDeity(DEITIES[i], temple, t);
        }

        html += '</div>' +
            '<section class="temple-rules" aria-label="' + t('temple_rules_title') + '">' +
                '<h2>' + t('temple_rules_title') + '</h2>' +
                '<ul>' +
                    '<li>' + t('temple_rule_cost') + '</li>' +
                    '<li>' + t('temple_rule_cooldown') + '</li>' +
                    '<li>' + t('temple_rule_no_pay_to_win') + '</li>' +
                    '<li>' + t('temple_rule_blessing') + '</li>' +
                '</ul>' +
            '</section>' +
        '</div>';
        el.innerHTML = html;

        var buttons = el.querySelectorAll('.temple-offer-btn');
        for (var j = 0; j < buttons.length; j++) {
            buttons[j].addEventListener('click', function() {
                _makeOffering(this.getAttribute('data-deity'));
            });
        }
    }

    function _renderDeity(deity, temple, t) {
        var last = temple[deity.id] || 0;
        var cooldownText = last ? t('temple_last_offering_recorded') : t('temple_no_offering_yet');
        return '<article class="temple-card temple-card-' + deity.id + '">' +
            '<div class="temple-deity-copy">' +
                '<h2><span aria-hidden="true">' + (deity.icon || '✦') + '</span> ' + t('temple_' + deity.id + '_name') + '</h2>' +
                '<p class="temple-domain">' + t('temple_' + deity.id + '_domain') + '</p>' +
                '<p>' + t('temple_' + deity.id + '_text') + '</p>' +
                '<p class="temple-target">' + t('temple_offering_target') + ': <code>' + deity.target + '</code></p>' +
                '<p class="temple-reward">' + t('temple_reward') + ': ' + t('item_' + deity.item) + '</p>' +
                '<label class="temple-prayer-label" for="temple-prayer-' + deity.id + '">' + t('temple_prayer_label') + '</label>' +
                _renderPrayerSelect(deity, t) +
                '<label class="temple-social-toggle">' +
                    '<input type="checkbox" id="temple-social-' + deity.id + '" checked> ' +
                    '<span>' + t('temple_social_publish') + '</span>' +
                '</label>' +
                '<p class="temple-social-note">' + t('temple_social_note') + '</p>' +
                '<p class="temple-cooldown">' + cooldownText + '</p>' +
                '<button type="button" class="btn btn-primary temple-offer-btn" data-deity="' + deity.id + '">' +
                    t('temple_offer_button').replace('{cost}', Helpers.bpToPercent(OFFERING_ENERGY)) +
                '</button>' +
            '</div>' +
        '</article>';
    }


    function _renderPrayerSelect(deity, t) {
        var list = PRAYERS[deity.id] || [];
        var html = '<select class="temple-prayer-select" id="temple-prayer-' + deity.id + '" data-deity="' + deity.id + '">';
        for (var i = 0; i < list.length; i++) {
            var key = 'temple_prayer_' + list[i];
            html += '<option value="' + key + '">' + t(key) + '</option>';
        }
        html += '</select>';
        return html;
    }

    function _setTempleStatus(message, isSuccess) {
        var el = Helpers.$('temple-status-region');
        if (!el) return;
        el.className = 'temple-status-region' + (isSuccess ? ' temple-status-success' : '');
        el.textContent = message || '';
    }

    function _makeOffering(deityId) {
        if (busy) return;
        var deity = null;
        for (var i = 0; i < DEITIES.length; i++) {
            if (DEITIES[i].id === deityId) deity = DEITIES[i];
        }
        if (!deity) return;
        if (!VizAccount.isLoggedIn || !VizAccount.isLoggedIn()) {
            _setTempleStatus(Helpers.t('not_logged_in'), false);
            Toast.error(Helpers.t('not_logged_in'));
            return;
        }

        var state = StateEngine.getState();
        var user = VizAccount.getCurrentUser();
        var headBlock = state.headBlock || 0;
        var last = state.temple && state.temple[user] ? (state.temple[user][deity.id] || 0) : 0;
        if (last && headBlock && headBlock - last < 28800) {
            _setTempleStatus(Helpers.t('temple_cooldown_active'), false);
            Toast.info(Helpers.t('temple_cooldown_active'));
            return;
        }
        var select = Helpers.$('temple-prayer-' + deity.id);
        var prayerText = select ? Helpers.t(select.value) : '';
        var socialToggle = Helpers.$('temple-social-' + deity.id);
        var shouldPublish = !socialToggle || socialToggle.checked;

        busy = true;
        _setTempleStatus(Helpers.t('temple_offering_started'), false);
        Toast.info(Helpers.t('temple_offering_started'));
        VizAccount.getAccount(user, function(energyErr, accountData) {
            if (energyErr || !accountData) {
                busy = false;
                _setTempleStatus(Helpers.t('temple_energy_check_failed'), false);
                Toast.error(Helpers.t('temple_energy_check_failed'));
                return;
            }
            var currentEnergy = VizAccount.calculateCurrentEnergy(accountData);
            if (currentEnergy < OFFERING_ENERGY) {
                busy = false;
                _setTempleStatus(Helpers.t('temple_not_enough_mana'), false);
                Toast.error(Helpers.t('temple_not_enough_mana'));
                return;
            }
            VizBroadcast.templeOffering(deity.id, deity.target, OFFERING_ENERGY, prayerText, function(err, result) {
                busy = false;
                if (err) {
                    _setTempleStatus(Helpers.t('temple_offering_failed'), false);
                    Toast.error(Helpers.t('temple_offering_failed'));
                    return;
                }
                var blockNum = 0;
                if (result && result.action) {
                    blockNum = result.action.block_num || result.action.block || 0;
                }
                var event = StateEngine.processTempleOfferingResult(
                    user, deity.id, deity.target, OFFERING_ENERGY, blockNum, prayerText
                );
                if (event && event.type === 'temple_offering_rejected') {
                    _setTempleStatus(Helpers.t('temple_cooldown_active'), false);
                    Toast.info(Helpers.t('temple_cooldown_active'));
                } else {
                    StateEngine.saveCheckpoint(function() {});
                    _setTempleStatus(Helpers.t('temple_offering_success'), true);
                    Toast.success(Helpers.t('temple_offering_success'));
                    if (shouldPublish) {
                        _publishPrayerPost(deity, prayerText, user);
                    }
                }
                render();
            });
        });
    }


    function _publishPrayerPost(deity, prayerText, user) {
        var character = StateEngine.getCharacter(user);
        var name = character && character.name ? character.name : user;
        var deityName = Helpers.t('temple_' + deity.id + '_name');
        var text = Helpers.t('temple_social_post')
            .replace('{name}', name)
            .replace('{deity}', deityName)
            .replace('{prayer}', prayerText)
            .replace('{tag}', deity.socialTag || '#temple');
        VizBroadcast.chroniclePost(text, function(err) {
            if (err) {
                Toast.info(Helpers.t('temple_social_failed'));
            } else {
                Toast.success(Helpers.t('temple_social_success'));
            }
        });
    }

    return { render: render };
})();
