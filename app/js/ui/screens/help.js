/**
 * Viz Magic — Help / Game Guide Screen
 */
var HelpScreen = (function() {
    'use strict';

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-help');
        if (!el) return;

        var sections = [
            { key: 'mana',        icon: '\u2728' },
            { key: 'hp',          icon: '\u2764\uFE0F' },
            { key: 'hunt',        icon: '\u2694\uFE0F' },
            { key: 'armageddon',  icon: '\u26A0\uFE0F' },
            { key: 'crafting',    icon: '\uD83D\uDD28' },
            { key: 'marketplace', icon: '\uD83C\uDFEA' },
            { key: 'leaderboard', icon: '\uD83C\uDFC6' },
            { key: 'narrator',    icon: '\uD83D\uDD0A' },
            { key: 'classes',     icon: '\uD83E\uDDD9' },
            { key: 'shares',      icon: '\uD83D\uDC8E' },
            { key: 'blockchain',  icon: '\u26D3\uFE0F' }
        ];

        var html = '<div class="help-screen">' +
            '<h1>' + t('help_title') + '</h1>' +
            '<p class="help-intro">' + t('help_intro') + '</p>';

        for (var i = 0; i < sections.length; i++) {
            var s = sections[i];
            html += '<section class="help-section" aria-label="' + t('help_section_' + s.key) + '">' +
                '<h2>' + s.icon + ' ' + t('help_section_' + s.key) + '</h2>' +
                '<p>' + t('help_' + s.key + '_text') + '</p>' +
                '</section>';
        }

        html += '</div>';
        el.innerHTML = html;
    }

    return { render: render };
})();
