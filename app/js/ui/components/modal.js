/**
 * Viz Magic — Modal Dialog Component
 */
var ModalComponent = (function() {
    'use strict';

    var currentTrap = null;

    function show(titleOrHtml, content, buttons) {
        var overlay = Helpers.$('modal-overlay');
        var modal = Helpers.$('modal-container');
        if (!overlay || !modal) return;

        var html;
        // Support two calling conventions:
        // 1. show(rawHtml)         — guild.js style: pass pre-built HTML string
        // 2. show({title,text,buttons}) — object style used by marketplace/crafting
        // 3. show(title, content, buttons) — legacy positional args
        if (typeof titleOrHtml === 'string' && content === undefined) {
            // Raw HTML mode — guild.js builds its own markup
            html = titleOrHtml;
        } else if (titleOrHtml && typeof titleOrHtml === 'object') {
            // Object mode: {title, text, buttons}
            var opts = titleOrHtml;
            html = '<div class="modal-content">';
            if (opts.title) html += '<h2 class="modal-title">' + Helpers.escapeHtml(opts.title) + '</h2>';
            if (opts.text)  html += '<p>' + Helpers.escapeHtml(opts.text) + '</p>';
            html += '<div class="modal-actions">';
            if (opts.buttons) {
                for (var i = 0; i < opts.buttons.length; i++) {
                    var b = opts.buttons[i];
                    html += '<button class="btn ' + (b.className || 'btn-secondary') + '" data-action="' + i + '">';
                    html += Helpers.escapeHtml(b.text || b.label || '');
                    html += '</button>';
                }
            }
            html += '<button class="btn btn-secondary modal-close" aria-label="' + Helpers.t('close') + '">' + Helpers.t('close') + '</button>';
            html += '</div></div>';
            buttons = opts.buttons;
        } else {
            // Legacy positional: show(title, content, buttons)
            html = '<div class="modal-content">';
            html += '<h2 class="modal-title">' + Helpers.escapeHtml(titleOrHtml) + '</h2>';
            html += '<div class="modal-body">' + (content || '') + '</div>';
            html += '<div class="modal-actions">';
            if (buttons) {
                for (var bi = 0; bi < buttons.length; bi++) {
                    var btn = buttons[bi];
                    html += '<button class="btn ' + (btn.primary ? 'btn-primary' : 'btn-secondary') + '" data-action="' + bi + '">';
                    html += Helpers.escapeHtml(btn.label || btn.text || '');
                    html += '</button>';
                }
            }
            html += '<button class="btn btn-secondary modal-close" aria-label="' + Helpers.t('close') + '">' + Helpers.t('close') + '</button>';
            html += '</div></div>';
        }

        modal.innerHTML = html;
        overlay.classList.add('show');
        modal.classList.add('show');

        currentTrap = A11y.trapFocus(modal);
        A11y.focusFirst(modal);

        // Button handlers for data-action buttons
        var actionBtns = modal.querySelectorAll('[data-action]');
        for (var j = 0; j < actionBtns.length; j++) {
            actionBtns[j].addEventListener('click', function() {
                var idx = parseInt(this.getAttribute('data-action'));
                if (buttons && buttons[idx] && (buttons[idx].action || buttons[idx].onClick)) {
                    var fn = buttons[idx].action || buttons[idx].onClick;
                    fn();
                }
                hide();
            });
        }
        var closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', hide);
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) hide();
        });

        document.addEventListener('keydown', _escHandler);
    }

    function hide() {
        var overlay = Helpers.$('modal-overlay');
        var modal = Helpers.$('modal-container');
        if (overlay) overlay.classList.remove('show');
        if (modal) modal.classList.remove('show');
        if (currentTrap) { currentTrap(); currentTrap = null; }
        document.removeEventListener('keydown', _escHandler);
    }

    function _escHandler(e) {
        if (e.key === 'Escape') hide();
    }

    return { show: show, hide: hide };
})();

// Convenience alias used across all screen modules
var Modal = ModalComponent;
