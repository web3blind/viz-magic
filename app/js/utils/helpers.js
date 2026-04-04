/**
 * Viz Magic — Common Utilities
 */
var Helpers = (function() {
    'use strict';

    /**
     * Simple event bus for app-wide communication
     */
    var EventBus = (function() {
        var listeners = {};

        function on(event, callback) {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(callback);
        }

        function off(event, callback) {
            if (!listeners[event]) return;
            listeners[event] = listeners[event].filter(function(cb) {
                return cb !== callback;
            });
        }

        function emit(event, data) {
            if (!listeners[event]) return;
            for (var i = 0; i < listeners[event].length; i++) {
                try {
                    listeners[event][i](data);
                } catch(e) {
                    console.error('EventBus error on ' + event + ':', e);
                }
            }
        }

        return { on: on, off: off, emit: emit };
    })();

    /**
     * Get DOM element by ID
     * @param {string} id
     * @returns {HTMLElement|null}
     */
    function $(id) {
        return document.getElementById(id);
    }

    /**
     * Query selector shorthand
     * @param {string} selector
     * @param {HTMLElement} [parent]
     * @returns {HTMLElement|null}
     */
    function $q(selector, parent) {
        return (parent || document).querySelector(selector);
    }

    /**
     * Query selector all
     * @param {string} selector
     * @param {HTMLElement} [parent]
     * @returns {NodeList}
     */
    function $qa(selector, parent) {
        return (parent || document).querySelectorAll(selector);
    }

    /**
     * Get current language strings
     * @returns {Object}
     */
    function lang() {
        var saved = localStorage.getItem(VizMagicConfig.STORAGE_PREFIX + 'lang');
        if (saved === 'en') return LangEN;
        return LangRU; // Default to Russian
    }

    /**
     * Set app language
     * @param {string} code - 'ru' or 'en'
     */
    function setLang(code) {
        localStorage.setItem(VizMagicConfig.STORAGE_PREFIX + 'lang', code);
    }

    /**
     * Get current language code
     * @returns {string} 'ru' or 'en'
     */
    function getCurrentLang() {
        return localStorage.getItem(VizMagicConfig.STORAGE_PREFIX + 'lang') || 'ru';
    }

    /**
     * Localize a string with variable substitution
     * @param {string} key - lang key
     * @param {Object} [vars] - {key: value} for substitution
     * @returns {string}
     */
    function t(key, vars) {
        var str = lang()[key] || key;
        if (vars) {
            for (var k in vars) {
                str = str.replace('{' + k + '}', vars[k]);
            }
        }
        return str;
    }

    /**
     * Format a number with separators
     * @param {number} num
     * @returns {string}
     */
    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /**
     * Format time ago
     * @param {string|Date} timestamp
     * @returns {string}
     */
    function timeAgo(timestamp) {
        var time = new Date(timestamp).getTime();
        var now = Date.now();
        var diff = Math.floor((now - time) / 1000);

        if (diff < 60) return diff + 's';
        if (diff < 3600) return Math.floor(diff / 60) + 'm';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h';
        return Math.floor(diff / 86400) + 'd';
    }

    /**
     * Debounce a function
     */
    function debounce(func, wait) {
        var timeout;
        return function() {
            var context = this;
            var args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(function() {
                func.apply(context, args);
            }, wait);
        };
    }

    /**
     * Escape HTML entities
     */
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    /**
     * Check if VIZ account name format is valid
     */
    function isValidAccountName(name) {
        if (!name || name.length < 2 || name.length > 25) return false;
        return /^[a-z][a-z0-9\-]*[a-z0-9]$/.test(name) && !/--/.test(name);
    }

    /**
     * Convert mana basis points (0–10000) to display percent string
     * Example: 100 → "1.00%", 5000 → "50.00%", 10000 → "100.00%"
     * @param {number} bp - energy in basis points
     * @returns {string}
     */
    function bpToPercent(bp) {
        return (bp / 100).toFixed(2) + '%';
    }

    /**
     * Get rarity color class
     */
    function rarityClass(rarity) {
        var classes = ['rarity-common', 'rarity-uncommon', 'rarity-rare', 'rarity-epic', 'rarity-legendary'];
        return classes[rarity] || classes[0];
    }

    /**
     * Get class icon emoji
     */
    function classIcon(className) {
        var icons = {
            stonewarden: '\uD83D\uDEE1\uFE0F',
            embercaster: '\uD83D\uDD25',
            moonrunner: '\uD83C\uDF19',
            bloomsage: '\uD83C\uDF3F'
        };
        return icons[className] || '\u2728';
    }

    /**
     * Get school color
     */
    function schoolColor(school) {
        var colors = {
            ignis: '#e53935',
            aqua: '#039be5',
            terra: '#43a047',
            ventus: '#b0bec5',
            umbra: '#7b1fa2'
        };
        return colors[school] || '#9e9e9e';
    }

    function schoolClass(school) {
        return school ? 'school-' + school : '';
    }

    return {
        EventBus: EventBus,
        $: $,
        $q: $q,
        $qa: $qa,
        lang: lang,
        setLang: setLang,
        getCurrentLang: getCurrentLang,
        t: t,
        formatNumber: formatNumber,
        timeAgo: timeAgo,
        debounce: debounce,
        escapeHtml: escapeHtml,
        isValidAccountName: isValidAccountName,
        bpToPercent: bpToPercent,
        rarityClass: rarityClass,
        classIcon: classIcon,
        schoolColor: schoolColor,
        schoolClass: schoolClass
    };
})();
