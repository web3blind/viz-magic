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
        var text = opts.showText !== false ? (opts.value + ' / ' + opts.max) : '';

        return '<div class="progress-bar-wrapper">' +
            (opts.label ? '<span class="progress-label">' + Helpers.escapeHtml(opts.label) + '</span>' : '') +
            '<div class="progress-bar" role="progressbar" ' +
            'aria-valuenow="' + opts.value + '" aria-valuemin="0" aria-valuemax="' + opts.max + '" ' +
            'aria-label="' + Helpers.escapeHtml(opts.label || '') + ' ' + opts.value + ' of ' + opts.max + '"' +
            (opts.id ? ' id="' + opts.id + '"' : '') + '>' +
            '<div class="progress-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
            (text ? '<span class="progress-text">' + text + '</span>' : '') +
            '</div></div>';
    }

    /**
     * Update an existing progress bar
     */
    function update(id, value, max) {
        var el = Helpers.$(id);
        if (!el) return;
        var pct = Math.min(100, Math.floor((value / max) * 100));
        el.setAttribute('aria-valuenow', value);
        el.setAttribute('aria-valuemax', max);
        var fill = el.querySelector('.progress-fill');
        if (fill) fill.style.width = pct + '%';
        var text = el.querySelector('.progress-text');
        if (text) text.textContent = value + ' / ' + max;
    }

    return { create: create, update: update };
})();
