/**
 * Viz Magic — Landing Screen
 */
var LandingScreen = (function() {
    'use strict';

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-landing');
        if (!el) return;

        el.innerHTML =
            '<div class="landing">' +
                '<header class="landing-hero" role="banner">' +
                    '<h1 class="landing-title" aria-label="Viz Magic">' +
                        '<span class="title-glow">Viz Magic</span>' +
                    '</h1>' +
                    '<div class="landing-text">' +
                        '<p>' + t('landing_hero_line1') + '</p>' +
                        '<p>' + t('landing_hero_line2') + '</p>' +
                        '<p>' + t('landing_hero_line3') + '</p>' +
                        '<p>' + t('landing_hero_line4') + '</p>' +
                    '</div>' +
                    '<button class="btn btn-primary btn-glow btn-large" id="btn-begin">' +
                        t('landing_cta') +
                    '</button>' +
                    '<p class="landing-login-link">' +
                        '<a href="#" id="btn-login-link">' + t('landing_login') + ' \u2192</a>' +
                    '</p>' +
                '</header>' +
                '<section class="landing-cards" aria-label="Features">' +
                    '<div class="feature-card">' +
                        '<span class="feature-icon" aria-hidden="true">\u2694\uFE0F</span>' +
                        '<h3>' + t('landing_card_hunt') + '</h3>' +
                        '<p>' + t('landing_card_hunt_desc') + '</p>' +
                    '</div>' +
                    '<div class="feature-card">' +
                        '<span class="feature-icon" aria-hidden="true">\uD83C\uDFAF</span>' +
                        '<h3>' + t('landing_card_duel') + '</h3>' +
                        '<p>' + t('landing_card_duel_desc') + '</p>' +
                    '</div>' +
                    '<div class="feature-card">' +
                        '<span class="feature-icon" aria-hidden="true">\uD83D\uDCDC</span>' +
                        '<h3>' + t('landing_card_chronicle') + '</h3>' +
                        '<p>' + t('landing_card_chronicle_desc') + '</p>' +
                    '</div>' +
                '</section>' +
                '<section class="landing-assurances">' +
                    '<p>\u2728 ' + t('landing_free') + '</p>' +
                    '<p>\uD83D\uDCF1 ' + t('landing_mobile') + '</p>' +
                    '<p>\uD83E\uDD1D ' + t('landing_social') + '</p>' +
                '</section>' +
            '</div>';

        Helpers.$('btn-begin').addEventListener('click', function() {
            SoundManager.init();  // must be first — creates AudioContext inside user gesture
            SoundManager.play('tap');
            Helpers.EventBus.emit('navigate', 'onboarding');
        });
        Helpers.$('btn-login-link').addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Login link clicked, navigating to login screen');
            Helpers.EventBus.emit('navigate', 'login');
        });
    }

    return { render: render };
})();
