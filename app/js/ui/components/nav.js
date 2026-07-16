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
            { id: 'hunt',        icon: '\uD83C\uDFF9', label: t('nav_hunt') },
            { id: 'map',         icon: '\uD83D\uDDFA\uFE0F', label: t('nav_map') },
            { id: 'guild',       icon: '\uD83D\uDEE1\uFE0F', label: t('nav_guild') },
            { id: 'marketplace', icon: '\uD83C\uDFEA', label: t('nav_bazaar') },
            { id: 'crafting',    icon: '\uD83D\uDD28', label: t('nav_crafting') },
            { id: 'quests',      icon: '\uD83D\uDCDC', label: t('nav_quests') },
            { id: 'temple',      icon: '\u26EA', label: t('nav_temple') },
            { id: 'world-boss',  icon: '\uD83D\uDC32', label: t('nav_world-boss') }
        ];

        var html = '';
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            var isActive = tab.id === activeTab ? ' active' : '';
            html += '<button type="button" class="nav-tab' + isActive + '" data-screen="' + tab.id + '" ';
            if (tab.id === activeTab) html += 'aria-current="page" ';
            html += 'aria-label="' + tab.label + '">';
            html += '<span class="nav-icon" aria-hidden="true">' + tab.icon + '</span>';
            html += '<span class="nav-label">' + tab.label + '</span>';
            html += '</button>';
        }
        nav.innerHTML = html;
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
