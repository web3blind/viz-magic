/**
 * Viz Magic — Battle Narrator
 * Accessibility feature: announces all combat events via aria-live for screen readers.
 * Includes spatial audio hints for stereo panning.
 */
var BattleNarrator = (function() {
    'use strict';

    var enabled = false;
    var narratorEl = null;
    var voiceGender = 'male';
    var voiceTimbre = 'rough';

    /**
     * Initialize the Battle Narrator.
     * Creates a dedicated aria-live region.
     */
    function init() {
        // Check saved preference
        var saved = localStorage.getItem(VizMagicConfig.STORAGE_PREFIX + 'battle_narrator');
        enabled = saved === 'true' || saved === '1';
        voiceGender = _getStoredVoiceOption('narrator_voice_gender', 'male');
        voiceTimbre = _getStoredVoiceOption('narrator_voice_timbre', 'rough');

        // Also auto-enable if screen reader likely active
        if (A11y.likelyScreenReader()) {
            enabled = true;
        }

        // Create narrator live region. Keep it as one persistent status region:
        // mobile screen readers announce text replacement more reliably than
        // appended children inside role=log.
        if (!narratorEl) {
            narratorEl = document.createElement('div');
            narratorEl.id = 'battle-narrator';
            narratorEl.setAttribute('role', 'status');
            narratorEl.setAttribute('aria-live', 'polite');
            narratorEl.setAttribute('aria-atomic', 'true');
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

    function _getStoredVoiceOption(key, fallback) {
        try {
            var value = localStorage.getItem(VizMagicConfig.STORAGE_PREFIX + key);
            return value || fallback;
        } catch (e) {}
        return fallback;
    }

    function setVoiceOptions(gender, timbre) {
        voiceGender = gender || 'male';
        voiceTimbre = timbre || 'rough';
        try {
            localStorage.setItem(VizMagicConfig.STORAGE_PREFIX + 'narrator_voice_gender', voiceGender);
            localStorage.setItem(VizMagicConfig.STORAGE_PREFIX + 'narrator_voice_timbre', voiceTimbre);
        } catch (e) {}
    }

    function getVoiceOptions() {
        return { gender: voiceGender, timbre: voiceTimbre };
    }

    function _selectVoice(lang) {
        if (typeof window === 'undefined' || !window.speechSynthesis || !window.speechSynthesis.getVoices) return null;
        var voices = window.speechSynthesis.getVoices() || [];
        if (!voices.length) return null;
        var langPrefix = (lang || 'ru-RU').split('-')[0].toLowerCase();
        var localVoices = [];
        for (var i = 0; i < voices.length; i++) {
            var v = voices[i];
            if (v && v.lang && v.lang.toLowerCase().indexOf(langPrefix) === 0) localVoices.push(v);
        }
        var pool = localVoices.length ? localVoices : voices;
        var maleHints = /male|муж|alex|alexander|maxim|pavel|dmitry|nikolai|yuri|george|daniel|denis|sergey|anton/i;
        var femaleHints = /female|жен|anna|elena|irina|maria|oksana|svetlana|google русский|milena|alice/i;
        var hints = voiceGender === 'female' ? femaleHints : maleHints;
        for (var j = 0; j < pool.length; j++) {
            var name = (pool[j].name || '') + ' ' + (pool[j].voiceURI || '');
            if (hints.test(name)) return pool[j];
        }
        return pool[0] || null;
    }

    /**
     * Announce a message through the narrator.
     * @param {string} message
     * @param {string} [priority] - 'polite' (default) or 'assertive'
     */
    function announce(message, priority) {
        if (!enabled || !message) return;
        if (!narratorEl) init();

        var mode = priority || 'polite';
        narratorEl.setAttribute('aria-live', mode);
        narratorEl.setAttribute('role', mode === 'assertive' ? 'alert' : 'status');

        // Force a DOM text change so TalkBack/VoiceOver do not ignore repeated
        // announcements after navigation or re-render.
        narratorEl.textContent = '';
        setTimeout(function() {
            if (narratorEl) narratorEl.textContent = message;
        }, 25);

        _speak(message);
    }

    function _speak(message) {
        if (!message || typeof window === 'undefined' || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
        try {
            var utterance = new SpeechSynthesisUtterance(message);
            var lang = (Helpers.getCurrentLang && Helpers.getCurrentLang() === 'en') ? 'en-US' : 'ru-RU';
            var voice = _selectVoice(lang);
            utterance.lang = lang;
            if (voice) utterance.voice = voice;
            utterance.rate = (voiceTimbre === 'rough') ? 0.88 : (voiceTimbre === 'soft' ? 0.96 : 1);
            utterance.pitch = (voiceGender === 'male') ? (voiceTimbre === 'rough' ? 0.65 : 0.82) : (voiceTimbre === 'rough' ? 0.9 : 1.08);
            utterance.volume = 1;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        } catch (e) {}
    }

    /**
     * Play spatial audio hint.
     * @param {string} position - 'enemy' (top/center), 'player' (bottom), 'center'
     * @param {number} [freq] - frequency hint
     */
    function spatialHint(position, freq) {
        if (!enabled) return;

        try {
            // Reuse the shared AudioContext from SoundManager — never create a new one
            // here, because Android blocks AudioContext creation outside a user gesture.
            var ctx = (typeof SoundManager !== 'undefined') ? SoundManager.getAudioContext() : null;
            if (!ctx) return;

            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            var panner = ctx.createStereoPanner();

            osc.connect(gain);
            gain.connect(panner);
            panner.connect(ctx.destination);

            osc.type = 'sine';

            // Spatial panning: enemy=center (0), player=slightly right (0.3)
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

            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
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
        setVoiceOptions: setVoiceOptions,
        getVoiceOptions: getVoiceOptions,
        announce: announce,
        spatialHint: spatialHint,
        announcePvEAttack: announcePvEAttack,
        announceDuelPhase: announceDuelPhase
    };
})();
