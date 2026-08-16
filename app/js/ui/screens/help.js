/**
 * Viz Magic — Magical Guide Screen
 */
var HelpScreen = (function() {
    'use strict';

    var HELP_LIBRARY_ASSET_VERSION = '20260826n';
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
            { key: 'magic_ranks', icon: '🎓' },
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
                '<h3 id="help-section-' + s.key + '"><span class="section-icon vmagic-breathe" aria-hidden="true">' + s.icon + '</span> ' + t('help_section_' + s.key) + '</h3>' +
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
            '<h2 class="help-book-chapter"><span class="section-icon vmagic-breathe" aria-hidden="true">✨</span> ' + t('help_lore_title') + '</h2>' +
            '<p class="help-lore-intro">' + t('help_lore_intro') + '</p>' +
            '<div class="help-lore-page-grid">' +
                '<article class="help-lore-page">' +
                    '<h3><span class="section-icon vmagic-breathe" aria-hidden="true">🌌</span> ' + t('help_section_world_days') + '</h3>' +
                    '<p>' + t('help_world_days_text') + '</p>' +
                '</article>' +
                '<article class="help-lore-page">' +
                    '<h3><span class="section-icon vmagic-breathe" aria-hidden="true">🗓️</span> ' + t('help_section_world_months') + '</h3>' +
                    '<p>' + t('help_world_months_text') + '</p>' +
                '</article>' +
            '</div>' + _renderMagicLibrary(t) + '</section>';
    }

    function _renderMagicLibrary(t) {
        var html = '<article class="help-magic-library" aria-labelledby="help-magic-library-title">' +
            '<h3 id="help-magic-library-title"><span class="section-icon vmagic-breathe" aria-hidden="true">🗺️</span> ' + t('help_magic_library_title') + '</h3>' +
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
        html += '<div class="lore-map-title"><span class="region-icon vmagic-breathe" aria-hidden="true">🗺️</span> ' + title + '</div>';
        html += '<div class="lore-map-viewport help-library-map-viewport" id="help-library-map-viewport">';
        html += '<img class="lore-map-image help-library-map-image" id="help-library-map-image" src="assets/library-maps/map-' + entry.id + '.jpg?v=' + HELP_LIBRARY_ASSET_VERSION + '" alt="' + Helpers.escapeHtml(Helpers.t('help_magic_library_image_alt', { name: entry.title })) + '" loading="lazy">';
        html += '</div>';
        html += '<p class="lore-map-text help-library-map-text">' + description + '</p>';
        html += '<div class="modal-actions lore-map-actions help-library-map-actions"><button type="button" class="btn btn-secondary" id="help-library-zoom-toggle">' + Helpers.t('map_zoom_toggle') + '</button><button type="button" class="btn btn-primary" id="help-library-close">' + Helpers.t('close') + '</button></div>';
        html += '</div>';
        ModalComponent.show(html);
        var modal = Helpers.$('modal-container');
        var viewport = Helpers.$('help-library-map-viewport');
        var zoomBtn = Helpers.$('help-library-zoom-toggle');
        if (zoomBtn && viewport && modal) {
            zoomBtn.addEventListener('click', function() {
                modal.classList.add('help-library-fullscreen');
                viewport.classList.add('zoomed');
            });
            viewport.addEventListener('click', function(e) {
                if (modal.classList.contains('help-library-fullscreen')) {
                    e.preventDefault();
                    _closeLibraryFullscreen(modal, viewport);
                }
            });
        }
        var closeBtn = Helpers.$('help-library-close');
        if (closeBtn) closeBtn.addEventListener('click', function() {
            if (modal && modal.classList.contains('help-library-fullscreen')) {
                _closeLibraryFullscreen(modal, viewport);
                return;
            }
            ModalComponent.hide();
        });
    }

    function _closeLibraryFullscreen(modal, viewport) {
        if (modal) modal.classList.remove('help-library-fullscreen');
        if (viewport) viewport.classList.remove('zoomed');
    }

    return { render: render };
})();
