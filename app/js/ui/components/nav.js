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
            { id: 'home',        iconClass: 'vm-icon-home', label: t('nav_home') },
            { id: 'hunt',        iconClass: 'vm-icon-hunt', label: t('nav_hunt') },
            { id: 'map',         iconClass: 'vm-icon-map', label: t('nav_map') },
            { id: 'guild',       iconClass: 'vm-icon-guild', label: t('nav_guild') },
            { id: 'marketplace', iconClass: 'vm-icon-marketplace', label: t('nav_bazaar') },
            { id: 'crafting',    iconClass: 'vm-icon-crafting', label: t('nav_crafting') },
            { id: 'quests',      iconClass: 'vm-icon-quests', label: t('nav_quests') },
            { id: 'temple',      iconClass: 'vm-icon-temple', label: t('nav_temple') },
            { id: 'world-boss',  iconClass: 'vm-icon-boss', label: t('nav_world-boss') }
        ];

        var html = '';
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            var isActive = tab.id === activeTab ? ' active' : '';
            html += '<button type="button" class="nav-tab' + isActive + '" data-screen="' + tab.id + '" ';
            if (tab.id === activeTab) html += 'aria-current="page" ';
            html += 'aria-label="' + tab.label + '">';
            html += '<span class="nav-icon vm-icon ' + tab.iconClass + '" aria-hidden="true"></span>';
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
