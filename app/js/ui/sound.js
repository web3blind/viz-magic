/**
 * Viz Magic — Sound Effects Manager
 * Web Audio API structure for game sounds.
 */
var SoundManager = (function() {
    'use strict';

    var audioCtx = null;
    var enabled = true;
    var volume = 0.5;
    var sounds = {};

    /**
     * Initialize the audio context (must be called from user interaction)
     */
    function init() {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch(e) {
            console.log('Web Audio not supported');
            enabled = false;
        }
    }

    /**
     * Play a synthesized sound effect
     * @param {string} soundId
     */
    function play(soundId) {
        if (!enabled) return;
        // Lazily initialize on first play call — this always happens inside a user gesture
        if (!audioCtx) init();
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        switch (soundId) {
            case 'tap':              _playTap(); break;
            case 'transition':       _playTransition(); break;
            case 'equip':            _playEquip(); break;
            case 'spell_fire':       _playSpellFire(); break;
            case 'spell_earth':      _playSpellEarth(); break;
            case 'error':            _playError(); break;
            case 'success':          _playSuccess(); break;
            case 'bless_send':       _playBlessSend(); break;
            case 'bless_recv':       _playBlessRecv(); break;
            case 'victory':          _playVictory(); break;
            case 'defeat':           _playDefeat(); break;
            case 'critical':         _playCritical(); break;
            case 'levelup':          _playLevelUp(); break;
            case 'seal':             _playSeal(); break;
            case 'reveal':           _playReveal(); break;
            case 'duel_start':       _playDuelStart(); break;
            case 'seals_break':      _playSealsBreak(); break;
            case 'round_won':        _playRoundWon(); break;
            case 'duel_victory':     _playDuelVictory(); break;
            case 'duel_defeat':      _playDuelDefeat(); break;
            case 'waiting_tension':  _playWaitingTension(); break;
            case 'craft_start':      _playCraftStart(); break;
            case 'craft_complete':   _playCraftComplete(); break;
            case 'market_buy':       _playMarketBuy(); break;
            case 'market_sell':      _playMarketSell(); break;
            case 'enchant':          _playEnchant(); break;
            case 'boss_roar':        _playBossRoar(); break;
            case 'quest_accept':     _playQuestAccept(); break;
            case 'quest_complete':   _playQuestComplete(); break;
            case 'season_change':    _playSeasonChange(); break;
            case 'world_event':      _playWorldEvent(); break;
        }
    }

    /** Soft crystalline click */
    function _playTap() {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.setValueAtTime(volume * 0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    }

    /** Whoosh + chime */
    function _playTransition() {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.2);
        osc.type = 'sine';
        gain.gain.setValueAtTime(volume * 0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }

    /** Metallic click + sparks */
    function _playEquip() {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 1200;
        osc.type = 'triangle';
        gain.gain.setValueAtTime(volume * 0.4, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    }

    /** Fire crackle */
    function _playSpellFire() {
        var bufferSize = audioCtx.sampleRate * 0.3;
        var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }
        var source = audioCtx.createBufferSource();
        source.buffer = buffer;
        var gain = audioCtx.createGain();
        gain.gain.value = volume * 0.3;
        var filter = audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        source.start();
    }

    /** Stone grinding */
    function _playSpellEarth() {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 150;
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(volume * 0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    }

    /** Low dissonant thud */
    function _playError() {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 200;
        osc.type = 'square';
        gain.gain.setValueAtTime(volume * 0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }

    /** Ascending fanfare */
    function _playSuccess() {
        [523, 659, 784].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            var t = audioCtx.currentTime + i * 0.1;
            gain.gain.setValueAtTime(volume * 0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);
        });
    }

    /** Warm chime */
    function _playBlessSend() {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(volume * 0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    }

    /** Warm bell + ethereal note */
    function _playBlessRecv() {
        [660, 880].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(volume * 0.25, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.6);
        });
    }

    /** Victory fanfare */
    function _playVictory() {
        [523, 659, 784, 1047].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            var t = audioCtx.currentTime + i * 0.12;
            gain.gain.setValueAtTime(volume * 0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        });
    }

    /** Solemn but dignified chord */
    function _playDefeat() {
        [330, 262].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            var t = audioCtx.currentTime + i * 0.2;
            gain.gain.setValueAtTime(volume * 0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
            osc.start(t);
            osc.stop(t + 0.6);
        });
    }

    /** Screen shake + enhanced effects */
    function _playCritical() {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 100;
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(volume * 0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    }

    /** Ascending major scale */
    function _playLevelUp() {
        [523, 587, 659, 698, 784, 880, 988, 1047].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            var t = audioCtx.currentTime + i * 0.08;
            gain.gain.setValueAtTime(volume * 0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.2);
        });
    }

    /** Wax seal stamp */
    function _playSeal() {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 300;
        osc.type = 'triangle';
        gain.gain.setValueAtTime(volume * 0.4, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    }

    /** Breaking glass + magic burst */
    function _playReveal() {
        // Noise burst
        var bufferSize = audioCtx.sampleRate * 0.15;
        var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
        }
        var source = audioCtx.createBufferSource();
        source.buffer = buffer;
        var gain = audioCtx.createGain();
        gain.gain.value = volume * 0.3;
        source.connect(gain);
        gain.connect(audioCtx.destination);
        source.start();
    }

    /** War horn — duel start */
    function _playDuelStart() {
        // Low brass-like sustained note
        [130, 165, 196].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sawtooth';
            var t = audioCtx.currentTime + i * 0.15;
            gain.gain.setValueAtTime(volume * 0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
            osc.start(t);
            osc.stop(t + 0.6);
        });
    }

    /** Glass shatter — seals break */
    function _playSealsBreak() {
        var bufferSize = audioCtx.sampleRate * 0.2;
        var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
        }
        var source = audioCtx.createBufferSource();
        source.buffer = buffer;
        var gain = audioCtx.createGain();
        gain.gain.value = volume * 0.4;
        var filter = audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        source.start();
        // Follow with a magical chime
        var osc = audioCtx.createOscillator();
        var g2 = audioCtx.createGain();
        osc.connect(g2);
        g2.connect(audioCtx.destination);
        osc.frequency.value = 1047;
        osc.type = 'sine';
        g2.gain.setValueAtTime(volume * 0.2, audioCtx.currentTime + 0.15);
        g2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
        osc.start(audioCtx.currentTime + 0.15);
        osc.stop(audioCtx.currentTime + 0.6);
    }

    /** Victory chime — round won */
    function _playRoundWon() {
        [659, 784, 988].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            var t = audioCtx.currentTime + i * 0.08;
            gain.gain.setValueAtTime(volume * 0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
            osc.start(t);
            osc.stop(t + 0.25);
        });
    }

    /** Full fanfare — duel victory */
    function _playDuelVictory() {
        [523, 659, 784, 988, 1047, 1319].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            var t = audioCtx.currentTime + i * 0.1;
            gain.gain.setValueAtTime(volume * 0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc.start(t);
            osc.stop(t + 0.5);
        });
    }

    /** Somber chord — duel defeat */
    function _playDuelDefeat() {
        [330, 277, 220, 165].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            var t = audioCtx.currentTime + i * 0.2;
            gain.gain.setValueAtTime(volume * 0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.7);
            osc.start(t);
            osc.stop(t + 0.7);
        });
    }

    /** Building drone — waiting tension */
    function _playWaitingTension() {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(100, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(200, audioCtx.currentTime + 1.5);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(volume * 0.1, audioCtx.currentTime + 1.0);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 1.5);
    }

    /** Anvil strike + sparkle — craft start */
    function _playCraftStart() {
        // Metallic strike
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 600;
        osc.type = 'triangle';
        gain.gain.setValueAtTime(volume * 0.4, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
        // Follow with rising sparkle
        var osc2 = audioCtx.createOscillator();
        var g2 = audioCtx.createGain();
        osc2.connect(g2);
        g2.connect(audioCtx.destination);
        osc2.frequency.setValueAtTime(800, audioCtx.currentTime + 0.15);
        osc2.frequency.linearRampToValueAtTime(1600, audioCtx.currentTime + 0.6);
        osc2.type = 'sine';
        g2.gain.setValueAtTime(volume * 0.2, audioCtx.currentTime + 0.15);
        g2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
        osc2.start(audioCtx.currentTime + 0.15);
        osc2.stop(audioCtx.currentTime + 0.6);
    }

    /** Magical reveal — craft complete */
    function _playCraftComplete() {
        [523, 784, 1047, 1319].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            var t = audioCtx.currentTime + i * 0.08;
            gain.gain.setValueAtTime(volume * 0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        });
    }

    /** Coin clink — market buy */
    function _playMarketBuy() {
        [1200, 1400].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            var t = audioCtx.currentTime + i * 0.08;
            gain.gain.setValueAtTime(volume * 0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            osc.start(t);
            osc.stop(t + 0.15);
        });
    }

    /** Register clink — market sell */
    function _playMarketSell() {
        [800, 1000, 1200].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'triangle';
            var t = audioCtx.currentTime + i * 0.06;
            gain.gain.setValueAtTime(volume * 0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.2);
        });
    }

    /** Magical hum — enchant */
    function _playEnchant() {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.5);
        osc.type = 'sine';
        gain.gain.setValueAtTime(volume * 0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.6);
        // Add shimmer
        var osc2 = audioCtx.createOscillator();
        var g2 = audioCtx.createGain();
        osc2.connect(g2);
        g2.connect(audioCtx.destination);
        osc2.frequency.value = 1320;
        osc2.type = 'sine';
        g2.gain.setValueAtTime(volume * 0.15, audioCtx.currentTime + 0.3);
        g2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.7);
        osc2.start(audioCtx.currentTime + 0.3);
        osc2.stop(audioCtx.currentTime + 0.7);
    }

    /** Deep dragon roar — boss attack */
    function _playBossRoar() {
        // Low rumble
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(60, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(40, audioCtx.currentTime + 0.8);
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(volume * 0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.8);
        // Follow with noise burst
        var bufferSize = audioCtx.sampleRate * 0.2;
        var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }
        var source = audioCtx.createBufferSource();
        source.buffer = buffer;
        var g2 = audioCtx.createGain();
        g2.gain.value = volume * 0.3;
        var filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        source.connect(filter);
        filter.connect(g2);
        g2.connect(audioCtx.destination);
        source.start(audioCtx.currentTime + 0.3);
    }

    /** Scroll unroll — quest accept */
    function _playQuestAccept() {
        [440, 523, 659].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            var t = audioCtx.currentTime + i * 0.1;
            gain.gain.setValueAtTime(volume * 0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
            osc.start(t);
            osc.stop(t + 0.25);
        });
    }

    /** Triumphant chord — quest complete */
    function _playQuestComplete() {
        [523, 659, 784, 1047].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            var t = audioCtx.currentTime + i * 0.12;
            gain.gain.setValueAtTime(volume * 0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc.start(t);
            osc.stop(t + 0.5);
        });
    }

    /** Wind chime cascade — season change */
    function _playSeasonChange() {
        [880, 1047, 1319, 1568, 1760].forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            var t = audioCtx.currentTime + i * 0.15;
            gain.gain.setValueAtTime(volume * 0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
            osc.start(t);
            osc.stop(t + 0.6);
        });
    }

    /** Mystic pulse — world event */
    function _playWorldEvent() {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(600, audioCtx.currentTime + 0.4);
        osc.type = 'triangle';
        gain.gain.setValueAtTime(volume * 0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    }

    /**
     * Enable/disable sound
     * @param {boolean} state
     */
    function setEnabled(state) {
        enabled = state;
    }

    /**
     * Set volume (0-1)
     * @param {number} vol
     */
    function setVolume(vol) {
        volume = Math.max(0, Math.min(1, vol));
    }

    /**
     * Trigger haptic feedback if available
     * @param {string} pattern - 'light', 'medium', 'heavy', 'double', 'triple'
     */
    function vibrate(pattern) {
        if (!navigator.vibrate) return;
        switch (pattern) {
            case 'light':   navigator.vibrate(10); break;
            case 'medium':  navigator.vibrate(30); break;
            case 'heavy':   navigator.vibrate(50); break;
            case 'double':  navigator.vibrate([30, 50, 30]); break;
            case 'triple':  navigator.vibrate([20, 30, 20, 30, 20]); break;
            case 'seal':    navigator.vibrate([40, 20, 40]); break;
            case 'reveal':  navigator.vibrate([20, 30, 50]); break;
            case 'loot':    navigator.vibrate([20, 20, 20, 20, 50, 20, 50]); break;
        }
    }

    /**
     * Return the shared AudioContext (or null if not yet initialized).
     * Used by BattleNarrator to avoid creating a second context.
     * @returns {AudioContext|null}
     */
    function getAudioContext() {
        return audioCtx;
    }

    return {
        init: init,
        play: play,
        setEnabled: setEnabled,
        setVolume: setVolume,
        vibrate: vibrate,
        getAudioContext: getAudioContext
    };
})();
