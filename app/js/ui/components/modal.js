/**
 * Viz Magic — Modal Dialog Component
 */
var ModalComponent = (function() {
    'use strict';

    var currentTrap = null;

    function show(title, content, buttons) {
        var overlay = Helpers.$('modal-overlay');
        var modal = Helpers.$('modal-container');
        if (!overlay || !modal) return;

        var html = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + Helpers.escapeHtml(title) + '">';
        html += '<h2 class="modal-title">' + Helpers.escapeHtml(title) + '</h2>';
        html += '<div class="modal-content">' + content + '</div>';
        html += '<div class="modal-actions">';
        if (buttons) {
            for (var i = 0; i < buttons.length; i++) {
                var btn = buttons[i];
                html += '<button class="btn ' + (btn.primary ? 'btn-primary' : 'btn-secondary') + '" data-action="' + i + '">';
                html += Helpers.escapeHtml(btn.label);
                html += '</button>';
            }
        }
        html += '<button class="btn btn-secondary modal-close" aria-label="' + Helpers.t('close') + '">' + Helpers.t('close') + '</button>';
        html += '</div></div>';

        modal.innerHTML = html;
        overlay.classList.add('show');
        modal.classList.add('show');

        currentTrap = A11y.trapFocus(modal);
        A11y.focusFirst(modal);

        // Button handlers
        var actionBtns = modal.querySelectorAll('[data-action]');
        for (var j = 0; j < actionBtns.length; j++) {
            actionBtns[j].addEventListener('click', function() {
                var idx = parseInt(this.getAttribute('data-action'));
                if (buttons[idx] && buttons[idx].action) buttons[idx].action();
                hide();
            });
        }
        modal.querySelector('.modal-close').addEventListener('click', hide);
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
