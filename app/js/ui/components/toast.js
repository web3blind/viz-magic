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
    function show(message, type, duration, options) {
        type = type || 'info';
        duration = duration || 3000;
        options = options || {};

        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.textContent = message;
        toast.setAttribute('role', 'alert');

        if (options.actionLabel) {
            toast.setAttribute('tabindex', '0');
            toast.setAttribute('aria-label', message + '. ' + options.actionLabel);
        }

        _getContainer().appendChild(toast);
        A11y.announce(message);

        if (typeof options.onClick === 'function') {
            toast.addEventListener('click', function() {
                options.onClick();
            });
            toast.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    options.onClick();
                }
            });
        }

        // Animate in
        requestAnimationFrame(function() {
            toast.classList.add('show');
        });

        if (duration <= 0) {
            return toast;
        }

        // Auto-dismiss
        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, duration);
    }

    function success(msg, duration, options) { show(msg, 'success', duration || 3000, options); }
    function error(msg, duration, options) { show(msg, 'error', duration || 4000, options); }
    function info(msg, duration, options) { show(msg, 'info', duration || 3000, options); }

    return { show: show, success: success, error: error, info: info };
})();
