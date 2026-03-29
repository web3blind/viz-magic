/**
 * Viz Magic — Toast Notification Component
 */
var Toast = (function() {
    'use strict';

    var container = null;

    function _getContainer() {
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('role', 'status');
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * Show a toast notification
     * @param {string} message
     * @param {string} [type] - 'info', 'success', 'error', 'warning'
     * @param {number} [duration] - ms (default 3000)
     */
    function show(message, type, duration) {
        type = type || 'info';
        duration = duration || 3000;

        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.textContent = message;
        toast.setAttribute('role', 'alert');

        _getContainer().appendChild(toast);
        A11y.announce(message);

        // Animate in
        requestAnimationFrame(function() {
            toast.classList.add('show');
        });

        // Auto-dismiss
        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, duration);
    }

    function success(msg) { show(msg, 'success'); }
    function error(msg) { show(msg, 'error', 4000); }
    function info(msg) { show(msg, 'info'); }

    return { show: show, success: success, error: error, info: info };
})();
