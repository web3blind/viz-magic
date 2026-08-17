/**
 * Viz Magic — Magical Guide Screen
 */
var HelpScreen = (function() {
    'use strict';

    var HELP_LIBRARY_MAPS = [
        { id: 'commons_first_light', title: 'The Commons of First Light Ур. 1-10' },
        { id: 'covenant_bazaar', title: 'The Covenant Bazaar Ур. 3-50' },
        { id: 'deep_currents', title: 'The Deep Currents Ур. 5-20' },
        { id: 'ember_wastes', title: 'The Ember Wastes Ур. 5-20' },
        { id: 'duel_spires', title: 'The Duel Spires Ур. 5-50' },
        { id: 'iron_root', title: 'The Iron Root Ур. 10-25' },
        { id: 'shattered_sky', title: 'The Shattered Sky Ур. 12-25' },
        { id: 'forklands', title: 'The Forklands Ур. 15-50' },
        { id: 'the_veil', title: 'The Veil Ур. 18-30' },
        { id: 'starfall_vault', title: 'The Starfall Vault Ур. 51-60' },
        { id: 'emberheart', title: 'The Emberheart Ур. 61-70' },
        { id: 'prismatic_depths', title: 'The Prismatic Depths Ур. 71-80' },
        { id: 'timeless_maze', title: 'The Timeless Maze Ур. 81-90' },
        { id: 'grandmaster_peak', title: 'The Grandmaster Peak Ур. 91-100' },
        { id: 'void_sanctum', title: 'The Void Sanctum Ур. 101+' }
    ];

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-help');
        if (!el) return;

        var sections = [
            { key: 'mana',        icon: 'mana' },
            { key: 'hp',          icon: 'hp' },
            { key: 'quests',      icon: 'quests' },
            { key: 'hunt',        icon: 'hunt' },
            { key: 'armageddon',  icon: 'boss' },
            { key: 'crafting',    icon: 'crafting' },
            { key: 'marketplace', icon: 'marketplace' },
            { key: 'leaderboard', icon: 'leaderboard' },
            { key: 'narrator',    icon: 'news' },
            { key: 'classes',     icon: 'character' },
            { key: 'magic_ranks', icon: 'leaderboard' },
            { key: 'duels',       icon: 'arena' },
            { key: 'guilds',      icon: 'guild' },
            { key: 'boss',        icon: 'boss' },
            { key: 'temple',      icon: 'temple' },
            { key: 'shares',      icon: 'core' },
            { key: 'blockchain',  icon: 'link' }
        ];

        var html = '<div class="help-screen magical-guide-screen">' +
            '<article class="help-book" aria-labelledby="magical-guide-title">' +
                '<div class="help-book-binding" aria-hidden="true"></div>' +
                '<header class="help-book-cover">' +
                    '<h1 id="magical-guide-title">' + Helpers.icon('help', 'screen-title-icon vmagic-breathe') + ' ' + t('help_title') + '</h1>' +
                    '<p class="help-intro">' + t('help_intro') + '</p>' +
                '</header>' +
                '<section class="help-practical-pages" aria-label="' + t('help_practical_label') + '">' +
                    '<h2 class="help-book-chapter">' + Helpers.icon('chronicle', 'section-icon vmagic-breathe') + ' ' + t('help_practical_title') + '</h2>';

        for (var i = 0; i < sections.length; i++) {
            var s = sections[i];
            html += '<section class="help-section help-page" aria-label="' + t('help_section_' + s.key) + '">' +
                '<h3 id="help-section-' + s.key + '">' + Helpers.icon(s.icon, 'section-icon vmagic-breathe') + ' ' + t('help_section_' + s.key) + '</h3>' +
                '<p>' + t('help_' + s.key + '_text') + '</p>' +
                '</section>';
        }

        html += '</section>' + _renderLorePages(t) + '</article></div>';
        el.innerHTML = html;
        _bindNavLinks(el);
        _bindLibraryLinks(el);
    }

    function _bindNavLinks(el) {
        var links = el.querySelectorAll('.help-nav-link');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', function() {
                var target = this.getAttribute('data-help-nav');
                if (target) {
                    if (typeof SoundManager !== 'undefined') SoundManager.play('tap');
                    Helpers.EventBus.emit('navigate', target);
                }
            });
        }
    }

    function _bindLibraryLinks(el) {
        var links = el.querySelectorAll('.help-library-link');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', function() {
                var id = this.getAttribute('data-library-map');
                var entry = _findLibraryEntry(id);
                if (entry) {
                    if (typeof SoundManager !== 'undefined') SoundManager.play('tap');
                    _openLibraryMap(entry);
                }
            });
        }
    }

    function _renderLorePages(t) {
        return '<section class="help-lore-pages" aria-label="' + t('help_lore_label') + '">' +
            '<h2 class="help-book-chapter">' + Helpers.icon('spark', 'section-icon vmagic-breathe') + ' ' + t('help_lore_title') + '</h2>' +
            '<p class="help-lore-intro">' + t('help_lore_intro') + '</p>' +
            '<div class="help-lore-page-grid">' +
                '<article class="help-lore-page">' +
                    '<h3>' + Helpers.icon('weather', 'section-icon vmagic-breathe') + ' ' + t('help_section_world_days') + '</h3>' +
                    '<p>' + t('help_world_days_text') + '</p>' +
                '</article>' +
                '<article class="help-lore-page">' +
                    '<h3>' + Helpers.icon('festival', 'section-icon vmagic-breathe') + ' ' + t('help_section_world_months') + '</h3>' +
                    '<p>' + t('help_world_months_text') + '</p>' +
                '</article>' +
            '</div>' + _renderMagicLibrary(t) + '</section>';
    }

    function _renderMagicLibrary(t) {
        var html = '<article class="help-magic-library" aria-labelledby="help-magic-library-title">' +
            '<h3 id="help-magic-library-title">' + Helpers.icon('map', 'section-icon vmagic-breathe') + ' ' + t('help_magic_library_title') + '</h3>' +
            '<p>' + t('help_magic_library_intro') + '</p>' +
            '<div class="help-library-list">';
        for (var i = 0; i < HELP_LIBRARY_MAPS.length; i++) {
            var entry = HELP_LIBRARY_MAPS[i];
            html += '<button type="button" class="help-library-link" data-library-map="' + entry.id + '">' + Helpers.escapeHtml(entry.title) + '</button>';
        }
        html += '</div></article>';
        return html;
    }

    function _findLibraryEntry(id) {
        for (var i = 0; i < HELP_LIBRARY_MAPS.length; i++) {
            if (HELP_LIBRARY_MAPS[i].id === id) return HELP_LIBRARY_MAPS[i];
        }
        return null;
    }

    function _openLibraryMap(entry) {
        var title = Helpers.escapeHtml(entry.title);
        var description = Helpers.t('map_lore_' + entry.id);
        var html = '<div class="help-library-map-card">';
        html += '<div class="lore-map-title">' + Helpers.icon('map', 'region-icon vmagic-breathe') + ' ' + title + '</div>';
        html += '<p class="lore-map-text help-library-map-text">' + description + '</p>';
        html += '<div class="modal-actions lore-map-actions help-library-map-actions"><button type="button" class="btn btn-primary" id="help-library-close">' + Helpers.t('close') + '</button></div>';
        html += '</div>';
        ModalComponent.show(html);
        var closeBtn = Helpers.$('help-library-close');
        if (closeBtn) closeBtn.addEventListener('click', ModalComponent.hide);
    }

    return { render: render };
})();
