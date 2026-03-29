/**
 * Viz Magic — Battle Narrator
 * Accessibility feature: announces all combat events via aria-live for screen readers.
 * Includes spatial audio hints for stereo panning.
 */
var BattleNarrator = (function() {
    'use strict';

    var enabled = false;
    var narratorEl = null;
    var audioCtx = null;

    /**
     * Initialize the Battle Narrator.
     * Creates a dedicated aria-live region.
     */
    function init() {
        // Check saved preference
        var saved = localStorage.getItem(VizMagicConfig.STORAGE_PREFIX + 'battle_narrator');
        enabled = saved === 'true' || saved === '1';

        // Also auto-enable if screen reader likely active
        if (A11y.likelyScreenReader()) {
            enabled = true;
        }

        // Create narrator live region
        if (!narratorEl) {
            narratorEl = document.createElement('div');
            narratorEl.id = 'battle-narrator';
            narratorEl.setAttribute('role', 'log');
            narratorEl.setAttribute('aria-live', 'polite');
            narratorEl.setAttribute('aria-atomic', 'false');
            narratorEl.setAttribute('aria-relevant', 'additions');
            narratorEl.className = 'sr-only';
            narratorEl.setAttribute('aria-label', Helpers.t('narrator_label'));
            document.body.appendChild(narratorEl);
        }

        // Listen for game events
        _bindEvents();
    }

    /**
     * Enable/disable the narrator.
     * @param {boolean} state
     */
    function setEnabled(state) {
        enabled = state;
        localStorage.setItem(VizMagicConfig.STORAGE_PREFIX + 'battle_narrator', state ? '1' : '0');
    }

    /**
     * Check if narrator is enabled.
     * @returns {boolean}
     */
    function isEnabled() {
        return enabled;
    }

    /**
     * Announce a message through the narrator.
     * @param {string} message
     * @param {string} [priority] - 'polite' (default) or 'assertive'
     */
    function announce(message, priority) {
        if (!enabled || !message) return;
        if (!narratorEl) init();

        narratorEl.setAttribute('aria-live', priority || 'polite');

        // Append new message as paragraph
        var p = document.createElement('p');
        p.textContent = message;
        narratorEl.appendChild(p);

        // Keep only last 10 messages
        while (narratorEl.children.length > 10) {
            narratorEl.removeChild(narratorEl.firstChild);
        }
    }

    /**
     * Play spatial audio hint.
     * @param {string} position - 'enemy' (top/center), 'player' (bottom), 'center'
     * @param {number} [freq] - frequency hint
     */
    function spatialHint(position, freq) {
        if (!enabled) return;

        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            var panner = audioCtx.createStereoPanner();

            osc.connect(gain);
            gain.connect(panner);
            panner.connect(audioCtx.destination);

            osc.frequency.value = freq || 440;
            osc.type = 'sine';

            // Spatial panning: enemy=center-up (0), player=slightly right (0.3)
            switch (position) {
                case 'enemy':
                    panner.pan.value = 0;
                    osc.frequency.value = freq || 600;
                    break;
                case 'player':
                    panner.pan.value = 0.3;
                    osc.frequency.value = freq || 400;
                    break;
                case 'center':
                default:
                    panner.pan.value = 0;
                    osc.frequency.value = freq || 500;
                    break;
            }

            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
        } catch(e) {
            // Silently fail if audio not available
        }
    }

    /**
     * Announce a PvE combat event.
     * @param {string} spellName
     * @param {string} creatureName
     * @param {number} damage
     * @param {boolean} critical
     */
    function announcePvEAttack(spellName, creatureName, damage, critical) {
        var t = Helpers.t;
        var msg = t('narrator_pve_attack', { spell: spellName, creature: creatureName, damage: damage });
        if (critical) {
            msg += ' ' + t('narrator_critical');
        }
        announce(msg, 'assertive');
        spatialHint('enemy');
    }

    /**
     * Announce PvP duel phase transition.
     * @param {string} phase - 'seal', 'sealed', 'waiting', 'reveal', 'result'
     * @param {Object} [data] - phase-specific data
     */
    function announceDuelPhase(phase, data) {
        var t = Helpers.t;
        data = data || {};

        switch (phase) {
            case 'seal':
                announce(t('narrator_duel_seal', { seconds: data.seconds || 15 }), 'assertive');
                spatialHint('center');
                break;

            case 'sealed':
                announce(t('narrator_duel_sealed'), 'polite');
                spatialHint('player');
                break;

            case 'waiting':
                announce(t('narrator_duel_waiting'), 'polite');
                break;

            case 'reveal':
                announce(t('narrator_duel_reveal', {
                    myIntent: data.myIntent || '',
                    oppIntent: data.oppIntent || '',
                    result: data.result || ''
                }), 'assertive');
                spatialHint('center', 700);
                break;

            case 'result':
                announce(t('narrator_duel_result', {
                    outcome: data.outcome || '',
                    score: data.score || ''
                }), 'assertive');
                break;
        }
    }

    /**
     * Bind to game event bus for automatic narration.
     */
    function _bindEvents() {
        Helpers.EventBus.on('hunt_victory', function(data) {
            if (!enabled) return;
            var t = Helpers.t;
            announce(t('narrator_hunt_victory', {
                creature: data.creature || '',
                xp: data.xp || 0
            }));
        });

        Helpers.EventBus.on('hunt_defeat', function(data) {
            if (!enabled) return;
            var t = Helpers.t;
            announce(t('narrator_hunt_defeat', { creature: data.creature || '' }));
        });

        Helpers.EventBus.on('duel_challenge', function(data) {
            if (!enabled) return;
            var t = Helpers.t;
            announce(t('narrator_duel_challenge', { opponent: data.target || data.account || '' }), 'assertive');
        });

        Helpers.EventBus.on('duel_completed', function(data) {
            if (!enabled) return;
            var t = Helpers.t;
            var user = VizAccount.getCurrentUser();
            var won = data.winner === user;
            announce(t(won ? 'narrator_duel_won' : 'narrator_duel_lost'), 'assertive');
        });
    }

    return {
        init: init,
        setEnabled: setEnabled,
        isEnabled: isEnabled,
        announce: announce,
        spatialHint: spatialHint,
        announcePvEAttack: announcePvEAttack,
        announceDuelPhase: announceDuelPhase
    };
})();
