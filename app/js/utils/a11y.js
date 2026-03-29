/**
 * Viz Magic — Accessibility Helpers
 * Screen reader announcements, focus management, ARIA utilities.
 */
var A11y = (function() {
    'use strict';

    var liveRegion = null;

    /**
     * Initialize the accessibility system
     * Creates an ARIA live region for dynamic announcements.
     */
    function init() {
        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.id = 'a11y-live';
            liveRegion.setAttribute('role', 'status');
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            liveRegion.className = 'sr-only';
            document.body.appendChild(liveRegion);
        }
    }

    /**
     * Announce a message to screen readers
     * @param {string} message
     * @param {string} [priority] - 'polite' or 'assertive'
     */
    function announce(message, priority) {
        if (!liveRegion) init();
        liveRegion.setAttribute('aria-live', priority || 'polite');
        // Clear then set to trigger announcement
        liveRegion.textContent = '';
        setTimeout(function() {
            liveRegion.textContent = message;
        }, 100);
    }

    /**
     * Announce combat result
     * @param {Object} result - CombatResult
     * @param {string} creatureName
     */
    function announceCombatResult(result, creatureName) {
        var msg = '';
        if (result.victory) {
            msg = Helpers.t('hunt_victory') + ' ';
            msg += creatureName + '. ';
            if (result.critical) msg += 'Critical hit! ';
            msg += result.damageDealt + ' damage dealt. ';
            msg += Helpers.t('hunt_xp_gained') + ': ' + result.xpGained + '. ';
            if (result.loot.length > 0) {
                msg += Helpers.t('hunt_loot') + ': ';
                for (var i = 0; i < result.loot.length; i++) {
                    msg += result.loot[i].name;
                    if (i < result.loot.length - 1) msg += ', ';
                }
                msg += '.';
            }
        } else {
            msg = Helpers.t('hunt_defeat') + ' ';
            msg += creatureName + '. ';
            msg += result.damageTaken + ' damage taken. ';
        }
        announce(msg, 'assertive');
    }

    /**
     * Move focus to the first focusable element in a container
     * @param {HTMLElement} container
     */
    function focusFirst(container) {
        var focusable = container.querySelector(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
            focusable.focus();
        }
    }

    /**
     * Trap focus within a container (for modals)
     * @param {HTMLElement} container
     * @returns {Function} cleanup function to remove trap
     */
    function trapFocus(container) {
        var focusableElements = container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        var firstFocusable = focusableElements[0];
        var lastFocusable = focusableElements[focusableElements.length - 1];

        function handler(e) {
            if (e.key !== 'Tab') return;

            if (e.shiftKey) {
                if (document.activeElement === firstFocusable) {
                    lastFocusable.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === lastFocusable) {
                    firstFocusable.focus();
                    e.preventDefault();
                }
            }
        }

        container.addEventListener('keydown', handler);
        return function() {
            container.removeEventListener('keydown', handler);
        };
    }

    /**
     * Set up keyboard shortcuts for game navigation
     */
    function initKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            // Only when no input is focused
            var tag = document.activeElement.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            switch (e.key.toLowerCase()) {
                case 'h': Helpers.EventBus.emit('navigate', 'home'); break;
                case 'c': Helpers.EventBus.emit('navigate', 'character'); break;
                case 'b': Helpers.EventBus.emit('navigate', 'inventory'); break;
                case '?':
                    announce('Keyboard shortcuts: H for Home, C for Character, B for Bag, 1-5 for spells in combat.');
                    break;
            }
        });
    }

    /**
     * Check if prefers-reduced-motion is enabled
     * @returns {boolean}
     */
    function prefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /**
     * Check if screen reader is likely active
     * (Heuristic — not 100% reliable)
     * @returns {boolean}
     */
    function likelyScreenReader() {
        return prefersReducedMotion() || navigator.userAgent.indexOf('TalkBack') !== -1;
    }

    return {
        init: init,
        announce: announce,
        announceCombatResult: announceCombatResult,
        focusFirst: focusFirst,
        trapFocus: trapFocus,
        initKeyboardShortcuts: initKeyboardShortcuts,
        prefersReducedMotion: prefersReducedMotion,
        likelyScreenReader: likelyScreenReader
    };
})();
