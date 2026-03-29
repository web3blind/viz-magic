/**
 * Viz Magic — PvP Duel Screen
 * Commit-reveal duel UI with accessibility support.
 * Phases: Pre-Duel → Seal (Commit) → Reveal → Result
 */
var DuelScreen = (function() {
    'use strict';

    var SEAL_TIMER_SECONDS = 15;

    /** Current duel UI state */
    var duelState = {
        phase: 'pre',       // pre, seal, waiting, reveal, result
        combatRef: '',
        opponent: '',
        currentRound: 1,
        totalRounds: 3,
        selectedIntent: null,
        sealTimer: null,
        sealTimeLeft: SEAL_TIMER_SECONDS,
        strategySecret: null, // {intent, spell, energy, salt, key, iv, hash}
        roundResults: [],
        challengeData: null,
        autoMode: false
    };

    /**
     * Render the duel screen.
     * @param {Object} [opts] - {opponent, combatRef, challengeData}
     */
    function render(opts) {
        opts = opts || {};
        var el = Helpers.$('screen-duel');
        if (!el) return;

        if (opts.opponent) duelState.opponent = opts.opponent;
        if (opts.combatRef) duelState.combatRef = opts.combatRef;
        if (opts.challengeData) duelState.challengeData = opts.challengeData;

        switch (duelState.phase) {
            case 'pre':     _renderPreDuel(el); break;
            case 'seal':    _renderSealPhase(el); break;
            case 'waiting': _renderWaiting(el); break;
            case 'reveal':  _renderReveal(el); break;
            case 'result':  _renderResult(el); break;
            default:        _renderPreDuel(el); break;
        }
    }

    /**
     * Show duel screen with specific opponent.
     */
    function startDuel(opponent, combatRef, challengeData) {
        duelState = {
            phase: 'pre',
            combatRef: combatRef || '',
            opponent: opponent,
            currentRound: 1,
            totalRounds: 3,
            selectedIntent: null,
            sealTimer: null,
            sealTimeLeft: SEAL_TIMER_SECONDS,
            strategySecret: null,
            roundResults: [],
            challengeData: challengeData || null,
            autoMode: false
        };
        Helpers.EventBus.emit('navigate', 'duel');
    }

    // --- Pre-Duel Phase ---

    function _renderPreDuel(el) {
        var t = Helpers.t;
        var user = VizAccount.getCurrentUser();
        var myChar = StateEngine.getCharacter(user) || {};
        var oppChar = StateEngine.getCharacter(duelState.opponent) || {};
        var myDuels = _getPlayerStats(user);
        var oppDuels = _getPlayerStats(duelState.opponent);

        var html = '<div class="duel-screen" role="region" aria-label="' + t('duel_title') + '">' +
            '<div aria-live="polite" id="duel-announcer" class="sr-only"></div>' +
            '<h1>' + t('duel_title') + '</h1>' +
            '<div class="duel-matchup">' +
                '<div class="duel-mage duel-mage-left">' +
                    '<span class="duel-mage-icon" aria-hidden="true">' + Helpers.classIcon(myChar.className) + '</span>' +
                    '<strong>' + Helpers.escapeHtml(myChar.name || user || t('duel_you')) + '</strong>' +
                    '<span class="duel-mage-info">' + t('home_level') + ' ' + (myChar.level || 1) + '</span>' +
                    '<span class="duel-mage-info">' + t('duel_wins') + ': ' + myDuels.wins + '</span>' +
                '</div>' +
                '<span class="duel-vs" aria-hidden="true">VS</span>' +
                '<div class="duel-mage duel-mage-right">' +
                    '<span class="duel-mage-icon" aria-hidden="true">' + Helpers.classIcon(oppChar.className) + '</span>' +
                    '<strong>' + Helpers.escapeHtml(oppChar.name || duelState.opponent || '???') + '</strong>' +
                    '<span class="duel-mage-info">' + t('home_level') + ' ' + (oppChar.level || 1) + '</span>' +
                    '<span class="duel-mage-info">' + t('duel_wins') + ': ' + oppDuels.wins + '</span>' +
                '</div>' +
            '</div>' +
            '<p class="duel-format">' + t('duel_best_of_3') + '</p>' +
            '<div class="duel-actions">' +
                '<button class="btn btn-primary btn-large btn-glow" id="btn-duel-begin" ' +
                    'aria-label="' + t('duel_begin') + '">' + t('duel_begin') + '</button>' +
                '<button class="btn btn-secondary btn-glow" id="btn-duel-auto" ' +
                    'aria-label="' + t('duel_auto_mode') + '">' + t('duel_auto_mode') + '</button>' +
                '<button class="btn btn-secondary" id="btn-duel-decline" ' +
                    'aria-label="' + t('duel_decline') + '">' + t('duel_decline') + '</button>' +
            '</div>' +
            '</div>';

        el.innerHTML = html;

        Helpers.$('btn-duel-begin').addEventListener('click', function() {
            SoundManager.play('duel_start');
            SoundManager.vibrate('heavy');
            duelState.phase = 'seal';
            render();
        });

        Helpers.$('btn-duel-auto').addEventListener('click', function() {
            SoundManager.play('duel_start');
            SoundManager.vibrate('heavy');
            duelState.autoMode = true;
            duelState.phase = 'seal';
            render();
        });

        Helpers.$('btn-duel-decline').addEventListener('click', function() {
            if (duelState.combatRef) {
                DuelProtocol.forfeitDuel(duelState.combatRef, 'declined', function() {});
            }
            Helpers.EventBus.emit('navigate', 'home');
        });

        // Battle Narrator announcement
        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.announce(t('duel_narrator_pre', {
                opponent: oppChar.name || duelState.opponent
            }));
        }
    }

    // --- Seal Phase (Commit) ---

    function _renderSealPhase(el) {
        var t = Helpers.t;
        var round = duelState.currentRound;

        var intents = [
            { id: 'strike', icon: '\uD83D\uDD25', name: t('intent_strike'), hint: t('intent_strike_hint') },
            { id: 'guard',  icon: '\uD83D\uDEE1\uFE0F', name: t('intent_guard'),  hint: t('intent_guard_hint') },
            { id: 'weave',  icon: '\u26A1',     name: t('intent_weave'),  hint: t('intent_weave_hint') },
            { id: 'mend',   icon: '\uD83C\uDF00',  name: t('intent_mend'),   hint: t('intent_mend_hint') }
        ];

        var html = '<div class="duel-screen" role="region" aria-label="' + t('duel_seal_phase') + '">' +
            '<div aria-live="polite" id="duel-announcer" class="sr-only"></div>' +
            '<h1>' + t('duel_seal_title') + '</h1>' +
            '<p class="duel-round-info">' + t('duel_round', { round: round, total: duelState.totalRounds }) + '</p>' +
            '<div class="duel-timer" id="duel-timer" role="timer" aria-live="assertive" aria-label="' + t('duel_timer') + '">' +
                '<span id="timer-display">' + SEAL_TIMER_SECONDS + '</span>' +
            '</div>' +
            '<div class="spell-card-grid" role="radiogroup" aria-label="' + t('duel_choose_intent') + '">';

        for (var i = 0; i < intents.length; i++) {
            var intent = intents[i];
            html += '<button class="spell-card" data-intent="' + intent.id + '" ' +
                'role="radio" aria-checked="false" tabindex="0" ' +
                'aria-label="' + intent.name + '. ' + intent.hint + '" ' +
                'accesskey="' + (i + 1) + '">' +
                '<span class="spell-card-icon" aria-hidden="true">' + intent.icon + '</span>' +
                '<span class="spell-card-name">' + intent.name + '</span>' +
                '<span class="spell-card-hint">' + intent.hint + '</span>' +
                '</button>';
        }

        html += '</div>' +
            '<div id="duel-seal-status" class="duel-seal-status" aria-live="polite"></div>' +
            '</div>';

        el.innerHTML = html;
        _bindSealEvents(el);
        _startSealTimer();

        // Narrator
        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.announce(t('duel_narrator_seal', { seconds: SEAL_TIMER_SECONDS }));
        }

        // Focus first spell card
        A11y.focusFirst(el.querySelector('.spell-card-grid'));

        // Auto-mode: pick random intent after 1 second
        if (duelState.autoMode) {
            setTimeout(function() {
                if (duelState.phase === 'seal' && !duelState.selectedIntent) {
                    var intents = ['strike', 'guard', 'weave', 'mend'];
                    var rand = intents[Math.floor(Math.random() * 4)];
                    var card = document.querySelector('[data-intent="' + rand + '"]');
                    if (card) card.click();
                }
            }, 1000);
        }
    }

    function _bindSealEvents(el) {
        var cards = el.querySelectorAll('.spell-card');

        for (var i = 0; i < cards.length; i++) {
            cards[i].addEventListener('click', _onIntentSelect);
        }

        // Keyboard: 1-4 for spell selection
        el.addEventListener('keydown', function(e) {
            var keyNum = parseInt(e.key);
            if (keyNum >= 1 && keyNum <= 4) {
                var intents = ['strike', 'guard', 'weave', 'mend'];
                var card = el.querySelector('[data-intent="' + intents[keyNum - 1] + '"]');
                if (card) card.click();
            }
        });
    }

    function _onIntentSelect() {
        if (duelState.selectedIntent) return; // Already sealed

        var intent = this.getAttribute('data-intent');
        duelState.selectedIntent = intent;

        // Visual feedback
        var cards = document.querySelectorAll('.spell-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].classList.remove('selected');
            cards[i].setAttribute('aria-checked', 'false');
        }
        this.classList.add('selected');
        this.setAttribute('aria-checked', 'true');

        SoundManager.play('seal');
        SoundManager.vibrate('seal');

        // Seal animation
        var self = this;
        setTimeout(function() {
            self.classList.add('sealed');

            // Disable all cards
            var allCards = document.querySelectorAll('.spell-card');
            for (var j = 0; j < allCards.length; j++) {
                allCards[j].disabled = true;
            }

            _commitStrategy(intent);
        }, 300);

        // Status text
        var statusEl = Helpers.$('duel-seal-status');
        if (statusEl) {
            statusEl.textContent = Helpers.t('duel_sealed');
        }

        // Narrator
        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.announce(Helpers.t('duel_narrator_sealed'));
        }
    }

    function _commitStrategy(intent) {
        // Generate salt and encryption key
        var salt = DuelSystem.generateSalt();
        var strategy = {
            intent: intent,
            spell: '',
            energy: 100,
            salt: salt
        };

        DuelSystem.generateCommitHash(strategy).then(function(hash) {
            duelState.strategySecret = {
                intent: intent,
                spell: '',
                energy: 100,
                salt: salt,
                hash: hash
            };

            // Broadcast commit
            if (duelState.combatRef && duelState.currentRound > 1) {
                DuelProtocol.commitStrategy(
                    duelState.combatRef,
                    duelState.currentRound,
                    hash,
                    function(err) {
                        if (err) {
                            Toast.error(Helpers.t('error_network'));
                        }
                    }
                );
            } else if (!duelState.combatRef && duelState.opponent) {
                // This is a new challenge — broadcast challenge with hash
                var currentBlock = StateEngine.getState().headBlock || 0;
                var deadline = currentBlock + VizMagicConfig.BLOCK.DUEL_ACCEPT_WINDOW;
                DuelProtocol.createChallenge(
                    duelState.opponent,
                    'best_of_3', 3, 100, hash, deadline,
                    function(err) {
                        if (err) {
                            Toast.error(Helpers.t('error_network'));
                        }
                    }
                );
            }

            // Transition to waiting
            _clearSealTimer();
            duelState.phase = 'waiting';
            render();
        });
    }

    function _startSealTimer() {
        duelState.sealTimeLeft = SEAL_TIMER_SECONDS;
        _clearSealTimer();

        duelState.sealTimer = setInterval(function() {
            duelState.sealTimeLeft--;
            var display = Helpers.$('timer-display');
            if (display) {
                display.textContent = duelState.sealTimeLeft;
            }
            if (duelState.sealTimeLeft <= 5) {
                SoundManager.play('tap');
            }
            if (duelState.sealTimeLeft <= 0) {
                _clearSealTimer();
                if (!duelState.selectedIntent) {
                    // Auto-select random intent
                    var intents = ['strike', 'guard', 'weave', 'mend'];
                    var rand = intents[Math.floor(Math.random() * 4)];
                    var card = document.querySelector('[data-intent="' + rand + '"]');
                    if (card) card.click();
                }
            }
        }, 1000);
    }

    function _clearSealTimer() {
        if (duelState.sealTimer) {
            clearInterval(duelState.sealTimer);
            duelState.sealTimer = null;
        }
    }

    // --- Waiting Phase ---

    function _renderWaiting(el) {
        var t = Helpers.t;

        var html = '<div class="duel-screen" role="region" aria-label="' + t('duel_waiting') + '">' +
            '<div aria-live="polite" id="duel-announcer" class="sr-only"></div>' +
            '<h1>' + t('duel_sealed') + '</h1>' +
            '<div class="duel-waiting-display">' +
                '<div class="sealed-envelope sealed-mine" aria-label="' + t('duel_your_seal') + '">' +
                    '<span class="seal-icon" aria-hidden="true">\uD83D\uDD12</span>' +
                '</div>' +
                '<div class="sealed-envelope sealed-opponent ' +
                    (duelState.opponentCommitted ? 'committed' : 'pending') + '" ' +
                    'aria-label="' + t('duel_opponent_seal') + '">' +
                    '<span class="seal-icon" aria-hidden="true">' +
                    (duelState.opponentCommitted ? '\uD83D\uDD12' : '\u2753') +
                    '</span>' +
                '</div>' +
            '</div>' +
            '<p class="duel-waiting-text">' + t('duel_waiting_opponent') + '</p>' +
            '<div class="duel-waiting-dots" aria-hidden="true">' +
                '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
            '</div>' +
            '<button class="btn btn-secondary" id="btn-duel-forfeit">' + t('duel_forfeit') + '</button>' +
            '</div>';

        el.innerHTML = html;

        // Play tension sound
        SoundManager.play('waiting_tension');

        Helpers.$('btn-duel-forfeit').addEventListener('click', function() {
            if (duelState.combatRef) {
                DuelProtocol.forfeitDuel(duelState.combatRef, 'voluntary', function() {});
            }
            Helpers.EventBus.emit('navigate', 'home');
        });

        // Listen for opponent commit/reveal events
        _listenForOpponent();

        // Narrator
        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.announce(t('duel_narrator_waiting'));
        }

        // For demo/testing: auto-advance after 3 seconds
        setTimeout(function() {
            if (duelState.phase === 'waiting') {
                _simulateOpponentReveal();
            }
        }, 3000);
    }

    function _listenForOpponent() {
        Helpers.EventBus.on('duel_reveal', function(data) {
            if (data.combatRef === duelState.combatRef) {
                duelState.phase = 'reveal';
                render();
            }
        });
    }

    function _simulateOpponentReveal() {
        // For demo: simulate opponent choosing and reveal
        var intents = ['strike', 'guard', 'weave', 'mend'];
        var oppIntent = intents[Math.floor(Math.random() * 4)];

        var secret = duelState.strategySecret;
        if (!secret) return;

        // Build mock round result
        var user = VizAccount.getCurrentUser();
        var myChar = StateEngine.getCharacter(user) || {};
        var oppChar = StateEngine.getCharacter(duelState.opponent) || {};
        var pseudoHash = Date.now().toString(16) + Math.random().toString(16).substring(2);
        while (pseudoHash.length < 40) pseudoHash += '0';

        var roundResult = DuelSystem.resolveRound(
            {
                account: user || 'player',
                potency: (myChar.stats && myChar.stats.pot) || 10,
                resilience: (myChar.stats && myChar.stats.res) || 5,
                level: myChar.level || 1,
                school: myChar.school || 'ignis',
                strategy: { intent: secret.intent, spell: '', energy: 100, salt: secret.salt }
            },
            {
                account: duelState.opponent || 'opponent',
                potency: (oppChar.stats && oppChar.stats.pot) || 10,
                resilience: (oppChar.stats && oppChar.stats.res) || 5,
                level: oppChar.level || 1,
                school: oppChar.school || 'aqua',
                strategy: { intent: oppIntent, spell: '', energy: 100, salt: 'demo' }
            },
            pseudoHash
        );

        duelState.roundResults.push({
            result: roundResult,
            myIntent: secret.intent,
            oppIntent: oppIntent
        });

        duelState.phase = 'reveal';
        render();
    }

    // --- Reveal Phase ---

    function _renderReveal(el) {
        var t = Helpers.t;
        var lastRound = duelState.roundResults[duelState.roundResults.length - 1];
        if (!lastRound) { duelState.phase = 'pre'; render(); return; }

        var result = lastRound.result;
        var user = VizAccount.getCurrentUser() || 'player';
        var iWon = result.winner === user;
        var isDraw = result.draw;

        var intentNames = {
            strike: t('intent_strike'),
            guard: t('intent_guard'),
            weave: t('intent_weave'),
            mend: t('intent_mend')
        };

        var intentIcons = {
            strike: '\uD83D\uDD25',
            guard: '\uD83D\uDEE1\uFE0F',
            weave: '\u26A1',
            mend: '\uD83C\uDF00'
        };

        SoundManager.play('seals_break');
        SoundManager.vibrate('reveal');

        var roundLabel = t('duel_round', { round: duelState.currentRound, total: duelState.totalRounds });
        var resultClass = iWon ? 'round-won' : (isDraw ? 'round-draw' : 'round-lost');
        var resultText = iWon ? t('duel_round_won') : (isDraw ? t('duel_round_draw') : t('duel_round_lost'));

        if (iWon) SoundManager.play('round_won');

        var html = '<div class="duel-screen" role="region" aria-label="' + t('duel_reveal_phase') + '">' +
            '<div aria-live="assertive" id="duel-announcer" class="sr-only"></div>' +
            '<h1>' + t('duel_reveal_title') + '</h1>' +
            '<p class="duel-round-info">' + roundLabel + '</p>' +
            '<div class="duel-reveal-display">' +
                '<div class="reveal-card reveal-mine reveal-animation">' +
                    '<span class="reveal-icon" aria-hidden="true">' + (intentIcons[lastRound.myIntent] || '') + '</span>' +
                    '<span class="reveal-name">' + (intentNames[lastRound.myIntent] || '') + '</span>' +
                '</div>' +
                '<span class="duel-vs" aria-hidden="true">VS</span>' +
                '<div class="reveal-card reveal-opponent reveal-animation">' +
                    '<span class="reveal-icon" aria-hidden="true">' + (intentIcons[lastRound.oppIntent] || '') + '</span>' +
                    '<span class="reveal-name">' + (intentNames[lastRound.oppIntent] || '') + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="duel-round-result ' + resultClass + '">' +
                '<h2>' + resultText + '</h2>' +
                '<p>' + t('duel_damage_dealt') + ': ' + result.damageA + '</p>' +
                '<p>' + t('duel_damage_taken') + ': ' + result.damageB + '</p>' +
            '</div>';

        // Check if duel is over
        var winsMe = 0;
        var winsOpp = 0;
        for (var i = 0; i < duelState.roundResults.length; i++) {
            var rr = duelState.roundResults[i].result;
            if (rr.winner === user) winsMe++;
            else if (!rr.draw) winsOpp++;
        }

        var duelOver = (winsMe >= 2 || winsOpp >= 2 || duelState.roundResults.length >= duelState.totalRounds);

        // Score display
        html += '<div class="duel-score" aria-label="' + t('duel_score') + '">' +
            '<span>' + winsMe + ' - ' + winsOpp + '</span>' +
            '</div>';

        if (duelOver) {
            html += '<div class="duel-actions">' +
                '<button class="btn btn-primary btn-large" id="btn-duel-finish">' + t('duel_see_results') + '</button>' +
                '</div>';
        } else {
            // Strategy hint
            html += '<p class="duel-hint">' + _getStrategyHint(lastRound.oppIntent) + '</p>';
            html += '<div class="duel-actions">' +
                '<button class="btn btn-primary btn-large" id="btn-duel-next">' + t('duel_next_round') + '</button>' +
                '</div>';
        }

        html += '</div>';
        el.innerHTML = html;

        // Narrator
        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.announce(t('duel_narrator_reveal', {
                myIntent: intentNames[lastRound.myIntent],
                oppIntent: intentNames[lastRound.oppIntent],
                result: resultText
            }));
        }

        // Announce for screen readers
        var announcer = Helpers.$('duel-announcer');
        if (announcer) {
            announcer.textContent = resultText + '. ' +
                (intentNames[lastRound.myIntent] || '') + ' ' + t('duel_vs') + ' ' +
                (intentNames[lastRound.oppIntent] || '');
        }

        if (duelOver) {
            var finishBtn = Helpers.$('btn-duel-finish');
            if (finishBtn) {
                finishBtn.addEventListener('click', function() {
                    duelState.phase = 'result';
                    duelState.finalWinsMe = winsMe;
                    duelState.finalWinsOpp = winsOpp;
                    render();
                });
            }
        } else {
            var nextBtn = Helpers.$('btn-duel-next');
            if (nextBtn) {
                nextBtn.addEventListener('click', function() {
                    duelState.currentRound++;
                    duelState.selectedIntent = null;
                    duelState.strategySecret = null;
                    duelState.phase = 'seal';
                    render();
                });
            }
        }

        // Auto-mode: auto-advance after 2 seconds
        if (duelState.autoMode) {
            setTimeout(function() {
                if (duelState.phase === 'reveal') {
                    if (duelOver) {
                        var btn = Helpers.$('btn-duel-finish');
                        if (btn) btn.click();
                    } else {
                        var btn = Helpers.$('btn-duel-next');
                        if (btn) btn.click();
                    }
                }
            }, 2000);
        }
    }

    // --- Result Phase ---

    function _renderResult(el) {
        var t = Helpers.t;
        var user = VizAccount.getCurrentUser() || 'player';
        var winsMe = duelState.finalWinsMe || 0;
        var winsOpp = duelState.finalWinsOpp || 0;
        var iWon = winsMe > winsOpp;
        var isDraw = winsMe === winsOpp;

        if (iWon) {
            SoundManager.play('duel_victory');
            SoundManager.vibrate('double');
        } else if (!isDraw) {
            SoundManager.play('duel_defeat');
            SoundManager.vibrate('triple');
        }

        var resultClass = iWon ? 'duel-victory' : (isDraw ? 'duel-draw' : 'duel-defeat');
        var resultTitle = iWon ? t('duel_victory') : (isDraw ? t('duel_draw') : t('duel_defeat'));
        var xp = iWon ? 150 : 50;

        var intentNames = {
            strike: t('intent_strike'),
            guard: t('intent_guard'),
            weave: t('intent_weave'),
            mend: t('intent_mend')
        };

        var html = '<div class="duel-screen" role="region" aria-label="' + t('duel_result_phase') + '">' +
            '<div aria-live="assertive" id="duel-announcer" class="sr-only"></div>' +
            '<div class="duel-result ' + resultClass + '">' +
            '<h1>' + resultTitle + '</h1>' +
            '<p class="duel-final-score">' + winsMe + ' : ' + winsOpp + '</p>' +
            '<h2>' + t('duel_round_summary') + '</h2>';

        // Round-by-round summary
        for (var i = 0; i < duelState.roundResults.length; i++) {
            var rr = duelState.roundResults[i];
            var roundWinner = rr.result.winner === user;
            var roundDraw = rr.result.draw;
            var roundIcon = roundWinner ? '\u2705' : (roundDraw ? '\u2796' : '\u274C');

            html += '<div class="round-summary-row" role="listitem">' +
                '<span class="round-num">' + t('duel_round_label', { n: (i + 1) }) + '</span>' +
                '<span>' + (intentNames[rr.myIntent] || '?') + ' vs ' + (intentNames[rr.oppIntent] || '?') + '</span>' +
                '<span aria-hidden="true">' + roundIcon + '</span>' +
                '</div>';
        }

        html += '<div class="duel-rewards">' +
            '<p>' + t('duel_xp_gained', { xp: xp }) + '</p>' +
            '</div>';

        // Opponent pattern insight
        var insight = _getOpponentInsight();
        if (insight) {
            html += '<p class="duel-insight">' + insight + '</p>';
        }

        html += '<div class="duel-actions">' +
            '<button class="btn btn-primary" id="btn-duel-rematch" aria-label="' + t('duel_rematch') + '">' +
                t('duel_rematch') + '</button>' +
            '<button class="btn btn-secondary" id="btn-duel-home" aria-label="' + t('hunt_home') + '">' +
                t('hunt_home') + '</button>' +
            '</div>' +
            '</div></div>';

        el.innerHTML = html;

        // Narrator
        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.announce(resultTitle + '. ' + winsMe + ' ' + t('duel_to') + ' ' + winsOpp);
        }

        Helpers.$('btn-duel-rematch').addEventListener('click', function() {
            startDuel(duelState.opponent, '', null);
        });

        Helpers.$('btn-duel-home').addEventListener('click', function() {
            Helpers.EventBus.emit('navigate', 'home');
        });
    }

    // --- Helpers ---

    function _getPlayerStats(account) {
        var state = StateEngine.getState();
        if (!state.duels || !state.duels.leaderboard || !state.duels.leaderboard[account]) {
            return { wins: 0, losses: 0, draws: 0 };
        }
        return state.duels.leaderboard[account];
    }

    function _getStrategyHint(lastOppIntent) {
        var t = Helpers.t;
        var beats = VizMagicConfig.INTENT_BEATS;
        // Find what beats the opponent's last intent
        for (var intent in beats) {
            if (beats[intent] === lastOppIntent) {
                var names = {
                    strike: t('intent_strike'),
                    guard: t('intent_guard'),
                    weave: t('intent_weave'),
                    mend: t('intent_mend')
                };
                return t('duel_hint_text', { intent: names[intent] || intent });
            }
        }
        return '';
    }

    function _getOpponentInsight() {
        var t = Helpers.t;
        if (duelState.roundResults.length < 2) return '';

        var intentCounts = {};
        for (var i = 0; i < duelState.roundResults.length; i++) {
            var oppI = duelState.roundResults[i].oppIntent;
            intentCounts[oppI] = (intentCounts[oppI] || 0) + 1;
        }

        var maxIntent = '';
        var maxCount = 0;
        for (var k in intentCounts) {
            if (intentCounts[k] > maxCount) {
                maxCount = intentCounts[k];
                maxIntent = k;
            }
        }

        if (maxCount >= 2) {
            var names = {
                strike: t('intent_strike'),
                guard: t('intent_guard'),
                weave: t('intent_weave'),
                mend: t('intent_mend')
            };
            return t('duel_insight_pattern', { intent: names[maxIntent] || maxIntent });
        }
        return '';
    }

    // Clean up on navigation away
    Helpers.EventBus.on('navigate', function(screen) {
        if (screen !== 'duel') {
            _clearSealTimer();
        }
    });

    return {
        render: render,
        startDuel: startDuel
    };
})();
