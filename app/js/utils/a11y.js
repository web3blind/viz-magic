/**
 * Viz Magic — Accessibility Helpers
 * Screen reader announcements, focus management, ARIA utilities.
 */
var A11y = (function() {
    'use strict';

    var liveRegion = null;
    var STORAGE_PREFIX = (typeof VizMagicConfig !== 'undefined' && VizMagicConfig.STORAGE_PREFIX) || 'viz_magic_';

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
        applyPreferences();
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
        if (!container || !container.querySelector) return;
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
        if (!container || !container.querySelectorAll) {
            return function() {};
        }

        var focusableElements = container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements.length) {
            return function() {};
        }

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
            var active = document.activeElement || document.body;
            var tag = (active.tagName || '').toLowerCase();
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

    function _setStoredBool(key, value) {
        try {
            localStorage.setItem(STORAGE_PREFIX + key, value ? '1' : '0');
        } catch (e) {}
    }

    function _getStoredBool(key, fallback) {
        try {
            var raw = localStorage.getItem(STORAGE_PREFIX + key);
            if (raw === '1' || raw === 'true') return true;
            if (raw === '0' || raw === 'false') return false;
        } catch (e) {}
        return !!fallback;
    }

    function _getStoredText(key, fallback) {
        try {
            var raw = localStorage.getItem(STORAGE_PREFIX + key);
            if (raw !== null && raw !== '') return raw;
        } catch (e) {}
        return fallback;
    }

    function setHighContrast(enabled) {
        if (!document || !document.body) return;
        if (enabled) {
            document.body.classList.add('high-contrast');
            document.body.setAttribute('data-theme', 'high-contrast');
        } else {
            document.body.classList.remove('high-contrast');
            document.body.removeAttribute('data-theme');
        }
        _setStoredBool('high_contrast', enabled);
    }

    function setReducedMotion(enabled) {
        if (!document || !document.body) return;
        document.body.classList.toggle('reduced-motion', !!enabled);
        _setStoredBool('reduced_motion', enabled);
    }

    function setIconMotion(mode) {
        if (!document || !document.body) return;
        if (mode !== 'off' && mode !== 'sync' && mode !== 'sparkle') mode = 'sparkle';
        document.body.setAttribute('data-icon-motion', mode);
    }

    function applyPreferences() {
        setHighContrast(_getStoredBool('high_contrast', false));
        setReducedMotion(_getStoredBool('reduced_motion', false));
        setIconMotion(_getStoredText('icon_motion', 'sparkle'));
    }

    function bindRadioGroup(container, selector, onSelect) {
        if (!container || !selector) return [];
        var options = container.querySelectorAll(selector);
        if (!options.length) return [];

        function setSelected(option, shouldNotify) {
            for (var i = 0; i < options.length; i++) {
                var current = options[i];
                var isSelected = current === option;
                current.setAttribute('aria-checked', isSelected ? 'true' : 'false');
                current.setAttribute('tabindex', isSelected ? '0' : '-1');
                if (current.classList) {
                    current.classList.toggle('selected', isSelected);
                }
            }
            if (option && option.focus) option.focus();
            if (shouldNotify && typeof onSelect === 'function') onSelect(option);
        }

        var selectedOption = null;
        for (var idx = 0; idx < options.length; idx++) {
            if (options[idx].getAttribute('aria-checked') === 'true') {
                selectedOption = options[idx];
                break;
            }
        }
        if (selectedOption) {
            setSelected(selectedOption, false);
        } else {
            for (var baseIdx = 0; baseIdx < options.length; baseIdx++) {
                options[baseIdx].setAttribute('tabindex', baseIdx === 0 ? '0' : '-1');
                if (options[baseIdx].classList) {
                    options[baseIdx].classList.remove('selected');
                }
            }
        }

        function moveFrom(currentOption, delta) {
            var currentIndex = 0;
            for (var i = 0; i < options.length; i++) {
                if (options[i] === currentOption) {
                    currentIndex = i;
                    break;
                }
            }
            var nextIndex = (currentIndex + delta + options.length) % options.length;
            setSelected(options[nextIndex], true);
        }

        function onKeyDown(e) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                moveFrom(this, 1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                moveFrom(this, -1);
            } else if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setSelected(this, true);
            }
        }

        function onClick() {
            setSelected(this, true);
        }

        for (var j = 0; j < options.length; j++) {
            options[j].addEventListener('click', onClick);
            options[j].addEventListener('keydown', onKeyDown);
        }

        return options;
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
        bindRadioGroup: bindRadioGroup,
        setHighContrast: setHighContrast,
        setReducedMotion: setReducedMotion,
        setIconMotion: setIconMotion,
        applyPreferences: applyPreferences,
        prefersReducedMotion: prefersReducedMotion,
        likelyScreenReader: likelyScreenReader
    };
})();
