/**
 * Viz Magic — Accessible Progress Bar Component
 */
var ProgressBar = (function() {
    'use strict';

    /**
     * Create a progress bar HTML string
     * @param {Object} opts - {id, label, value, max, color, showText}
     * @returns {string} HTML
     */
    function create(opts) {
        var pct = Math.min(100, Math.floor((opts.value / opts.max) * 100));
        var color = opts.color || 'var(--color-primary)';
        var displayValue = (typeof opts.displayValue !== 'undefined') ? opts.displayValue : opts.value;
        var displayMax = (typeof opts.displayMax !== 'undefined') ? opts.displayMax : opts.max;
        var text = opts.showText !== false ? (displayValue + ' / ' + displayMax) : '';
        var ariaValue = (typeof opts.ariaValue !== 'undefined') ? opts.ariaValue : displayValue;
        var ariaMax = (typeof opts.ariaMax !== 'undefined') ? opts.ariaMax : displayMax;

        var tag = opts.href ? 'a' : (opts.button ? 'button' : 'div');
        var attrs = '';
        var classes = 'progress-bar';
        if (opts.href) {
            classes += ' progress-bar-link';
            attrs += ' href="' + Helpers.escapeHtml(opts.href) + '" target="_blank" rel="noopener noreferrer"';
        }
        if (opts.button) {
            classes += ' progress-bar-button';
            attrs += ' type="button"';
        }

        return '<div class="progress-bar-wrapper">' +
            (opts.label ? '<span class="progress-label">' + (opts.labelHtml || Helpers.escapeHtml(opts.label)) + '</span>' : '') +
            '<' + tag + ' class="' + classes + '" role="' + (opts.href || opts.button ? 'button' : 'progressbar') + '" ' +
            'aria-valuenow="' + ariaValue + '" aria-valuemin="0" aria-valuemax="' + ariaMax + '" ' +
            'aria-label="' + Helpers.escapeHtml(opts.ariaLabel || ((opts.label || '') + ' ' + ariaValue + ' of ' + ariaMax)) + '"' +
            (opts.id ? ' id="' + opts.id + '"' : '') + attrs + '>' +
            '<div class="progress-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
            (text ? '<span class="progress-text">' + text + '</span>' : '') +
            '</' + tag + '></div>';
    }

    /**
     * Update an existing progress bar
     */
    function update(id, value, max, displayValue, displayMax) {
        var el = Helpers.$(id);
        if (!el) return;
        var pct = Math.min(100, Math.floor((value / max) * 100));
        var shownValue = (typeof displayValue !== 'undefined') ? displayValue : value;
        var shownMax = (typeof displayMax !== 'undefined') ? displayMax : max;
        el.setAttribute('aria-valuenow', shownValue);
        el.setAttribute('aria-valuemax', shownMax);
        var label = el.getAttribute('aria-label') || '';
        var labelName = label.split(' ')[0] || '';
        if (labelName) {
            el.setAttribute('aria-label', labelName + ' ' + shownValue + ' of ' + shownMax);
        }
        var fill = el.querySelector('.progress-fill');
        if (fill) fill.style.width = pct + '%';
        var text = el.querySelector('.progress-text');
        if (text) text.textContent = shownValue + ' / ' + shownMax;
    }

    return { create: create, update: update };
})();
