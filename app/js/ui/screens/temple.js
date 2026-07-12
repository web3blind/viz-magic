/**
 * Viz Magic — Temple Screen
 * Small, economics-safe offerings to symbolic VIZ accounts.
 */
var TempleScreen = (function() {
    'use strict';

    var OFFERING_ENERGY = 50; // 0.50% mana — deliberately small
    var busy = false;

    var DEITIES = [
        {
            id: 'fire_goddess',
            target: 'null',
            image: 'assets/deities/goddess-fire.svg',
            item: 'flame_votive_mark'
        },
        {
            id: 'labor_god',
            target: 'committee',
            image: 'assets/deities/god-labor.svg',
            item: 'labor_votive_mark'
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
            '<img class="temple-deity-image" src="' + deity.image + '" alt="" aria-hidden="true">' +
            '<div class="temple-deity-copy">' +
                '<h2>' + t('temple_' + deity.id + '_name') + '</h2>' +
                '<p class="temple-domain">' + t('temple_' + deity.id + '_domain') + '</p>' +
                '<p>' + t('temple_' + deity.id + '_text') + '</p>' +
                '<p class="temple-target">' + t('temple_offering_target') + ': <code>' + deity.target + '</code></p>' +
                '<p class="temple-reward">' + t('temple_reward') + ': ' + t('item_' + deity.item) + '</p>' +
                '<p class="temple-cooldown">' + cooldownText + '</p>' +
                '<button type="button" class="btn btn-primary temple-offer-btn" data-deity="' + deity.id + '">' +
                    t('temple_offer_button').replace('{cost}', Helpers.bpToPercent(OFFERING_ENERGY)) +
                '</button>' +
            '</div>' +
        '</article>';
    }

    function _makeOffering(deityId) {
        if (busy) return;
        var deity = null;
        for (var i = 0; i < DEITIES.length; i++) {
            if (DEITIES[i].id === deityId) deity = DEITIES[i];
        }
        if (!deity) return;
        if (!VizAccount.isLoggedIn || !VizAccount.isLoggedIn()) {
            Toast.error(Helpers.t('not_logged_in'));
            return;
        }

        busy = true;
        Toast.info(Helpers.t('temple_offering_started'));
        VizBroadcast.templeOffering(deity.id, deity.target, OFFERING_ENERGY, function(err, result) {
            busy = false;
            if (err) {
                Toast.error(Helpers.t('temple_offering_failed'));
                return;
            }
            var blockNum = 0;
            if (result && result.action) {
                blockNum = result.action.block_num || result.action.block || 0;
            }
            var event = StateEngine.processTempleOfferingResult(
                VizAccount.getCurrentUser(), deity.id, deity.target, OFFERING_ENERGY, blockNum
            );
            if (event && event.type === 'temple_offering_rejected') {
                Toast.info(Helpers.t('temple_cooldown_active'));
            } else {
                StateEngine.saveCheckpoint(function() {});
                Toast.success(Helpers.t('temple_offering_success'));
            }
            render();
        });
    }

    return { render: render };
})();
