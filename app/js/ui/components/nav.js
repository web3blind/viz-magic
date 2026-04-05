/**
 * Viz Magic — Bottom Navigation Component
 */
var NavComponent = (function() {
    'use strict';

    var activeTab = 'home';

    function render() {
        var t = Helpers.t;
        var nav = Helpers.$('bottom-nav');
        if (!nav) return;

        var tabs = [
            { id: 'home',        icon: '\uD83C\uDFE0', label: t('nav_home') },
            { id: 'hunt',        icon: '\u2694\uFE0F',  label: t('nav_hunt') },
            { id: 'guild',       icon: '\uD83D\uDEE1\uFE0F', label: t('nav_guild') },
            { id: 'marketplace', icon: '\uD83C\uDFEA', label: t('nav_bazaar') },
            { id: 'character',   icon: '🧙', label: t('nav_character') },
            { id: 'help',        icon: '❓', label: t('nav_help') },
            { id: 'leaderboard', icon: '\uD83C\uDFC6', label: t('nav_leaderboard') }
        ];

        var html = '';
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            var isActive = tab.id === activeTab ? ' active' : '';
            html += '<button class="nav-tab' + isActive + '" data-screen="' + tab.id + '" ';
            html += 'role="tab" aria-selected="' + (tab.id === activeTab) + '" ';
            html += 'aria-label="' + tab.label + '">';
            html += '<span class="nav-icon" aria-hidden="true">' + tab.icon + '</span>';
            html += '<span class="nav-label">' + tab.label + '</span>';
            html += '</button>';
        }
        nav.innerHTML = html;
        nav.setAttribute('role', 'tablist');
        nav.setAttribute('aria-label', 'Main navigation');

        // Event listeners
        var buttons = nav.querySelectorAll('.nav-tab');
        for (var j = 0; j < buttons.length; j++) {
            buttons[j].addEventListener('click', function() {
                var screen = this.getAttribute('data-screen');
                SoundManager.play('tap');
                Helpers.EventBus.emit('navigate', screen);
            });
        }
    }

    function setActive(tabId) {
        activeTab = tabId;
        render();
    }

    return { render: render, setActive: setActive };
})();
