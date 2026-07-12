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

        return '<div class="progress-bar-wrapper">' +
            (opts.label ? '<span class="progress-label">' + Helpers.escapeHtml(opts.label) + '</span>' : '') +
            '<div class="progress-bar" role="progressbar" ' +
            'aria-valuenow="' + ariaValue + '" aria-valuemin="0" aria-valuemax="' + ariaMax + '" ' +
            'aria-label="' + Helpers.escapeHtml(opts.label || '') + ' ' + ariaValue + ' of ' + ariaMax + '"' +
            (opts.id ? ' id="' + opts.id + '"' : '') + '>' +
            '<div class="progress-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
            (text ? '<span class="progress-text">' + text + '</span>' : '') +
            '</div></div>';
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
        var fill = el.querySelector('.progress-fill');
        if (fill) fill.style.width = pct + '%';
        var text = el.querySelector('.progress-text');
        if (text) text.textContent = shownValue + ' / ' + shownMax;
    }

    return { create: create, update: update };
})();
