/**
 * Viz Magic — Magical Guide Screen
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
            { key: 'quests',      icon: '\uD83D\uDCDC' },
            { key: 'hunt',        icon: '\uD83C\uDFF9' },
            { key: 'armageddon',  icon: '\u26A0\uFE0F' },
            { key: 'crafting',    icon: '\uD83D\uDD28' },
            { key: 'marketplace', icon: '\uD83C\uDFEA' },
            { key: 'leaderboard', icon: '\uD83C\uDFC6' },
            { key: 'narrator',    icon: '\uD83D\uDD0A' },
            { key: 'classes',     icon: '\uD83E\uDDD9' },
            { key: 'duels',       icon: '\uD83D\uDEE1\uFE0F' },
            { key: 'guilds',      icon: '\uD83C\uDFF0' },
            { key: 'boss',        icon: '\uD83D\uDC32' },
            { key: 'temple',      icon: '\u26EA' },
            { key: 'shares',      icon: '\uD83D\uDC8E' },
            { key: 'blockchain',  icon: '\u26D3\uFE0F' }
        ];

        var html = '<div class="help-screen magical-guide-screen">' +
            '<article class="help-book" aria-labelledby="magical-guide-title">' +
                '<div class="help-book-binding" aria-hidden="true"></div>' +
                '<header class="help-book-cover">' +
                    '<h1 id="magical-guide-title"><span class="screen-title-icon vmagic-breathe" aria-hidden="true">📖</span> ' + t('help_title') + '</h1>' +
                    '<p class="help-intro">' + t('help_intro') + '</p>' +
                '</header>' +
                '<section class="help-practical-pages" aria-label="' + t('help_practical_label') + '">' +
                    '<h2 class="help-book-chapter"><span class="section-icon vmagic-breathe" aria-hidden="true">🔖</span> ' + t('help_practical_title') + '</h2>';

        for (var i = 0; i < sections.length; i++) {
            var s = sections[i];
            html += '<section class="help-section help-page" aria-label="' + t('help_section_' + s.key) + '">' +
                '<h3><span class="section-icon vmagic-breathe" aria-hidden="true">' + s.icon + '</span> ' + t('help_section_' + s.key) + '</h3>' +
                '<p>' + t('help_' + s.key + '_text') + '</p>' +
                '</section>';
        }

        html += '</section>' + _renderLorePages(t) + '</article></div>';
        el.innerHTML = html;
    }

    function _renderLorePages(t) {
        return '<section class="help-lore-pages" aria-label="' + t('help_lore_label') + '">' +
            '<h2 class="help-book-chapter"><span class="section-icon vmagic-breathe" aria-hidden="true">✨</span> ' + t('help_lore_title') + '</h2>' +
            '<p class="help-lore-intro">' + t('help_lore_intro') + '</p>' +
            '<div class="help-lore-page-grid">' +
                '<article class="help-lore-page">' +
                    '<h3><span class="section-icon vmagic-breathe" aria-hidden="true">🌌</span> ' + t('help_section_world_days') + '</h3>' +
                    '<p>' + t('help_world_days_text') + '</p>' +
                '</article>' +
            '</div></section>';
    }

    return { render: render };
})();
