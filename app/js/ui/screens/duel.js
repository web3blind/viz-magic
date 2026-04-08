/**
 * Viz Magic — PvP Duel Screen
 * Commit-reveal duel UI with accessibility support.
 * Phases: Pre-Duel → Seal (Commit) → Waiting → Reveal/Result
 */
var DuelScreen = (function() {
    'use strict';

    var SEAL_TIMER_SECONDS = 15;
    var STATE_POLL_INTERVAL_MS = 3000;
    var registeredListeners = false;
    var _statePollTimer = null;
    var _hydratingAccounts = {};

    var duelState = _createInitialState();

    function _createInitialState() {
        return {
            phase: 'pre',
            combatRef: '',
            opponent: '',
            currentRound: 1,
            totalRounds: 3,
            selectedIntent: null,
            sealTimer: null,
            sealTimeLeft: SEAL_TIMER_SECONDS,
            strategySecret: null,
            strategyRound: 0,
            roundResults: [],
            revealRoundNumber: 0,
            lastSeenResolvedRound: 0,
            challengeData: null,
            autoMode: false,
            pendingAction: '',
            waitingMessageKey: 'duel_waiting_chain',
            errorKey: '',
            opponentCommitted: false,
            opponentRevealedIntent: '',
            myRevealedIntent: '',
            finalWinsMe: 0,
            finalWinsOpp: 0
        };
    }

    function render(opts) {
        opts = opts || {};
        var el = Helpers.$('screen-duel');
        if (!el) return;

        if (opts.opponent) duelState.opponent = opts.opponent;
        if (opts.combatRef) duelState.combatRef = String(opts.combatRef);
        if (opts.challengeData) duelState.challengeData = opts.challengeData;

        _ensureCharacterHydrated(duelState.opponent);
        _syncFromState();
        _ensureEventListeners();

        // Manage state polling — active during waiting phase
        if (duelState.phase === 'waiting') {
            _startStatePoll();
        } else {
            _stopStatePoll();
        }

        switch (duelState.phase) {
            case 'pre':
                _renderPreDuel(el);
                break;
            case 'seal':
                _renderSealPhase(el);
                break;
            case 'waiting':
                _renderWaiting(el);
                break;
            case 'reveal':
                _renderReveal(el);
                break;
            case 'result':
                _renderResult(el);
                break;
            default:
                _renderPreDuel(el);
                break;
        }
    }

    function startDuel(opponent, combatRef, challengeData) {
        _stopStatePoll();
        duelState = _createInitialState();
        duelState.opponent = opponent || '';
        duelState.combatRef = combatRef ? String(combatRef) : '';
        duelState.challengeData = challengeData || null;
        duelState.phase = 'pre';

        // For a brand-new outgoing duel we must not reuse a stale local secret
        // from an older attempt against the same opponent.
        if (!duelState.combatRef) {
            _clearPersistedSecret();
        }

        // Try to restore secret from localStorage (survives page reload)
        _restoreSecret();

        // If this is an accept flow from arena, go directly to seal phase
        if (challengeData && challengeData.source === 'arena_accept' && combatRef) {
            duelState.phase = 'seal';
            duelState.pendingAction = 'accept';
        }

        Helpers.EventBus.emit('navigate', 'duel');
    }

    /**
     * Restore duel secret from localStorage after page reload.
     */
    function _restoreSecret() {
        try {
            var secretKey = VizMagicConfig.STORAGE_PREFIX + 'duel_secret';
            var saved = localStorage.getItem(secretKey);
            if (!saved) return;
            var data = JSON.parse(saved);
            if (!data || !data.secret || !data.secret.hash) return;

            // Restore only for an already identified duel after reload.
            // For fresh outgoing duels without combatRef, stale secrets must not lock UI.
            if (!duelState.combatRef || data.combatRef !== duelState.combatRef) {
                return;
            }

            duelState.strategySecret = data.secret;
            duelState.strategyRound = data.round || 1;
            duelState.selectedIntent = data.secret.intent;
            duelState.currentRound = data.round || 1;
            console.log('Duel secret restored from localStorage for combat', duelState.combatRef, 'round', data.round || 1);
        } catch(e) {
            console.log('Could not restore duel secret:', e);
        }
    }

    function _clearPersistedSecret() {
        try {
            localStorage.removeItem(VizMagicConfig.STORAGE_PREFIX + 'duel_secret');
        } catch (e) {
            console.log('Could not clear duel secret:', e);
        }
    }

    function _renderPreDuel(el) {
        var t = Helpers.t;
        var user = VizAccount.getCurrentUser();
        var participants = _getResolvedParticipants();
        var myAccount = participants.me || user;
        var oppAccount = participants.opponent || duelState.opponent;
        var myChar = StateEngine.getCharacter(myAccount) || {};
        var oppChar = StateEngine.getCharacter(oppAccount) || {};
        duelState.opponent = oppAccount || duelState.opponent;
        var myDuels = _getPlayerStats(myAccount);
        var oppDuels = _getPlayerStats(oppAccount);
        var pendingNotice = '';
        var beginLabel = duelState.combatRef ? t('duel_begin') : t('duel_begin_real');

        if (!duelState.combatRef) {
            pendingNotice = '<p class="duel-hint">' + t('duel_real_only_notice') + '</p>';
        }
        if (duelState.errorKey) {
            pendingNotice += '<p class="error">' + t(duelState.errorKey) + '</p>';
        }

        var html = '<div class="duel-screen" role="region" aria-label="' + t('duel_title') + '">' +
            '<div aria-live="polite" id="duel-announcer" class="sr-only"></div>' +
            '<h1>' + t('duel_title') + '</h1>' +
            '<div class="duel-matchup">' +
                '<div class="duel-mage duel-mage-left">' +
                    '<span class="duel-mage-icon" aria-hidden="true">' + Helpers.classIcon(myChar.className) + '</span>' +
                    '<strong>' + Helpers.escapeHtml(myChar.name || myAccount || t('duel_you')) + '</strong>' +
                    '<span class="duel-mage-info">' + t('home_level') + ' ' + (myChar.level || 1) + '</span>' +
                    '<span class="duel-mage-info">' + t('duel_wins') + ': ' + myDuels.wins + '</span>' +
                '</div>' +
                '<span class="duel-vs" aria-hidden="true">VS</span>' +
                '<div class="duel-mage duel-mage-right">' +
                    '<span class="duel-mage-icon" aria-hidden="true">' + Helpers.classIcon(oppChar.className) + '</span>' +
                    '<strong>' + Helpers.escapeHtml(oppChar.name || oppAccount || '???') + '</strong>' +
                    '<span class="duel-mage-info">' + t('home_level') + ' ' + (oppChar.level || 1) + '</span>' +
                    '<span class="duel-mage-info">' + t('duel_wins') + ': ' + oppDuels.wins + '</span>' +
                '</div>' +
            '</div>' +
            '<p class="duel-format">' + t('duel_best_of_3') + '</p>' +
            pendingNotice +
            '<div class="duel-actions">' +
                '<button class="btn btn-primary btn-large btn-glow" id="btn-duel-begin" ' +
                    'aria-label="' + beginLabel + '">' + beginLabel + '</button>' +
                '<button class="btn btn-secondary" id="btn-duel-decline" ' +
                    'aria-label="' + t('duel_decline') + '">' + t('duel_decline') + '</button>' +
            '</div>' +
            '</div>';

        el.innerHTML = html;

        Helpers.$('btn-duel-begin').addEventListener('click', function() {
            SoundManager.play('duel_start');
            SoundManager.vibrate('heavy');
            duelState.errorKey = '';
            duelState.phase = 'seal';
            render();
        });

        Helpers.$('btn-duel-decline').addEventListener('click', function() {
            if (duelState.combatRef) {
                DuelProtocol.forfeitDuel(duelState.combatRef, 'declined', function() {});
            }
            Helpers.EventBus.emit('navigate', 'home');
        });

        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.announce(t('duel_narrator_pre', {
                opponent: oppChar.name || oppAccount
            }));
        }
    }

    function _renderSealPhase(el) {
        var t = Helpers.t;
        var round = duelState.currentRound;
        var intents = [
            { id: 'strike', icon: '\uD83D\uDD25', name: t('intent_strike'), hint: t('intent_strike_hint') },
            { id: 'guard',  icon: '\uD83D\uDEE1\uFE0F', name: t('intent_guard'),  hint: t('intent_guard_hint') },
            { id: 'weave',  icon: '\u26A1', name: t('intent_weave'), hint: t('intent_weave_hint') },
            { id: 'mend',   icon: '\uD83C\uDF00', name: t('intent_mend'), hint: t('intent_mend_hint') }
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
            '<p class="duel-hint">' + t('duel_manual_only_notice') + '</p>' +
            '</div>';

        el.innerHTML = html;
        _bindSealEvents(el);
        _startSealTimer();

        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.announce(t('duel_narrator_seal', { seconds: SEAL_TIMER_SECONDS }));
        }

        A11y.focusFirst(el.querySelector('.spell-card-grid'));
    }

    function _bindSealEvents(el) {
        var cards = el.querySelectorAll('.spell-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].addEventListener('click', _onIntentSelect);
        }

        el.addEventListener('keydown', function(e) {
            var keyNum = parseInt(e.key, 10);
            if (keyNum >= 1 && keyNum <= 4) {
                var intents = ['strike', 'guard', 'weave', 'mend'];
                var card = el.querySelector('[data-intent="' + intents[keyNum - 1] + '"]');
                if (card) card.click();
            }
        });
    }

    function _onIntentSelect() {
        if (duelState.selectedIntent) {
            console.log('DuelScreen: intent select ignored because selectedIntent already set', {
                selectedIntent: duelState.selectedIntent,
                combatRef: duelState.combatRef,
                opponent: duelState.opponent,
                pendingAction: duelState.pendingAction,
                currentRound: duelState.currentRound
            });
            return;
        }

        var intent = this.getAttribute('data-intent');
        duelState.selectedIntent = intent;
        console.log('DuelScreen: intent selected', {
            intent: intent,
            combatRef: duelState.combatRef,
            opponent: duelState.opponent,
            pendingAction: duelState.pendingAction,
            currentRound: duelState.currentRound
        });

        var cards = document.querySelectorAll('.spell-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].classList.remove('selected');
            cards[i].setAttribute('aria-checked', 'false');
        }
        this.classList.add('selected');
        this.setAttribute('aria-checked', 'true');

        SoundManager.play('seal');
        SoundManager.vibrate('seal');

        var self = this;
        setTimeout(function() {
            self.classList.add('sealed');
            var allCards = document.querySelectorAll('.spell-card');
            for (var j = 0; j < allCards.length; j++) {
                allCards[j].disabled = true;
            }
            _commitStrategy(intent);
        }, 300);

        var statusEl = Helpers.$('duel-seal-status');
        if (statusEl) {
            statusEl.textContent = Helpers.t('duel_sealed');
        }

        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.announce(Helpers.t('duel_narrator_sealed'));
        }
    }

    function _commitStrategy(intent) {
        console.log('DuelScreen: _commitStrategy start', {
            intent: intent,
            combatRef: duelState.combatRef,
            opponent: duelState.opponent,
            pendingAction: duelState.pendingAction,
            currentRound: duelState.currentRound
        });

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
            duelState.strategyRound = duelState.currentRound;

            // Persist secret to localStorage so it survives page reload
            try {
                var secretKey = VizMagicConfig.STORAGE_PREFIX + 'duel_secret';
                localStorage.setItem(secretKey, JSON.stringify({
                    opponent: duelState.opponent,
                    combatRef: duelState.combatRef,
                    round: duelState.currentRound,
                    secret: duelState.strategySecret
                }));
            } catch(e) {
                console.log('Could not persist duel secret:', e);
            }

            // Accept flow: broadcast accept with strategy hash
            if (duelState.pendingAction === 'accept' && duelState.combatRef) {
                console.log('DuelScreen: broadcasting accept', {
                    combatRef: duelState.combatRef,
                    round: duelState.currentRound,
                    hash: hash
                });
                DuelProtocol.acceptChallenge(
                    duelState.combatRef,
                    hash,
                    100,
                    function(err) {
                        if (err) {
                            duelState.errorKey = 'error_network';
                            Toast.error(Helpers.t('error_network'));
                            duelState.phase = 'pre';
                            render();
                            return;
                        }
                        duelState.pendingAction = '';
                        _moveToWaiting('duel_waiting_resolution');
                    }
                );
            } else if (duelState.combatRef && duelState.currentRound > 1) {
                duelState.pendingAction = 'commit';
                console.log('DuelScreen: broadcasting commit', {
                    combatRef: duelState.combatRef,
                    round: duelState.currentRound,
                    hash: hash
                });
                DuelProtocol.commitStrategy(
                    duelState.combatRef,
                    duelState.currentRound,
                    hash,
                    function(err) {
                        if (err) {
                            duelState.errorKey = 'error_network';
                            Toast.error(Helpers.t('error_network'));
                            duelState.phase = 'pre';
                            render();
                            return;
                        }
                        _moveToWaiting('duel_waiting_commit_chain');
                    }
                );
            } else if (!duelState.combatRef && duelState.opponent) {
                duelState.pendingAction = 'challenge';
                var currentBlock = StateEngine.getState().headBlock || 0;
                var deadline = currentBlock + VizMagicConfig.BLOCK.DUEL_ACCEPT_WINDOW;
                console.log('DuelScreen: broadcasting challenge', {
                    opponent: duelState.opponent,
                    currentBlock: currentBlock,
                    deadline: deadline,
                    hash: hash
                });
                DuelProtocol.createChallenge(
                    duelState.opponent,
                    'best_of_3', 3, 100, hash, deadline,
                    function(err) {
                        if (err) {
                            duelState.errorKey = 'error_network';
                            Toast.error(Helpers.t('error_network'));
                            duelState.phase = 'pre';
                            render();
                            return;
                        }
                        _moveToWaiting('duel_waiting_accept_chain');
                    }
                );
            } else if (duelState.combatRef && _canRevealCurrentRound()) {
                duelState.pendingAction = 'reveal';
                console.log('DuelScreen: broadcasting reveal', {
                    combatRef: duelState.combatRef,
                    round: duelState.currentRound,
                    hash: hash,
                    intent: intent
                });
                DuelProtocol.revealStrategy(
                    duelState.combatRef,
                    duelState.currentRound,
                    strategy,
                    '',
                    '',
                    function(err) {
                        if (err) {
                            duelState.errorKey = 'error_network';
                            Toast.error(Helpers.t('error_network'));
                            duelState.phase = 'pre';
                            render();
                            return;
                        }
                        duelState.myRevealedIntent = intent;
                        _moveToWaiting('duel_waiting_resolution');
                    }
                );
            } else {
                duelState.errorKey = duelState.combatRef ? 'duel_waiting_commit_chain' : 'duel_no_combat_ref';
                duelState.phase = 'pre';
                render();
            }
        }).catch(function() {
            duelState.errorKey = 'error_network';
            duelState.phase = 'pre';
            render();
        });
    }

    function _moveToWaiting(messageKey) {
        _clearSealTimer();
        duelState.waitingMessageKey = messageKey || 'duel_waiting_chain';
        duelState.phase = 'waiting';
        render();
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
                    duelState.errorKey = 'duel_manual_selection_required';
                    duelState.phase = 'pre';
                    render();
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

    function _renderWaiting(el) {
        var t = Helpers.t;
        var waitingText = t(duelState.waitingMessageKey || 'duel_waiting_chain');
        var errorText = duelState.errorKey ? '<p class="error">' + t(duelState.errorKey) + '</p>' : '';

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
            '<p class="duel-waiting-text">' + waitingText + '</p>' +
            '<div class="duel-waiting-dots" aria-hidden="true">' +
                '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
            '</div>' +
            errorText +
            '<p class="duel-hint">' + t('duel_waiting_honest_notice') + '</p>' +
            '<button class="btn btn-secondary" id="btn-duel-forfeit">' + t('duel_forfeit') + '</button>' +
            '</div>';

        el.innerHTML = html;
        SoundManager.play('waiting_tension');

        Helpers.$('btn-duel-forfeit').addEventListener('click', function() {
            if (duelState.combatRef) {
                DuelProtocol.forfeitDuel(duelState.combatRef, 'voluntary', function() {});
            }
            Helpers.EventBus.emit('navigate', 'home');
        });

        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.announce(t('duel_narrator_waiting'));
        }
    }

    function _renderReveal(el) {
        var t = Helpers.t;
        var lastRound = duelState.roundResults[duelState.roundResults.length - 1];
        if (!lastRound) {
            duelState.phase = 'waiting';
            render();
            return;
        }

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

        var revealRound = duelState.revealRoundNumber || duelState.roundResults.length || duelState.currentRound;
        var roundLabel = t('duel_round', { round: revealRound, total: duelState.totalRounds });
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

        var winsMe = 0;
        var winsOpp = 0;
        for (var i = 0; i < duelState.roundResults.length; i++) {
            var rr = duelState.roundResults[i].result;
            if (rr.winner === user) winsMe++;
            else if (!rr.draw) winsOpp++;
        }

        var duelOver = (winsMe >= 2 || winsOpp >= 2 || duelState.roundResults.length >= duelState.totalRounds);

        html += '<div class="duel-score" aria-label="' + t('duel_score') + '">' +
            '<span>' + winsMe + ' - ' + winsOpp + '</span>' +
            '</div>';

        if (duelOver) {
            html += '<div class="duel-actions">' +
                '<button class="btn btn-primary btn-large" id="btn-duel-finish">' + t('duel_see_results') + '</button>' +
                '</div>';
        } else {
            html += '<p class="duel-hint">' + _getStrategyHint(lastRound.oppIntent) + '</p>' +
                '<div class="duel-actions">' +
                '<button class="btn btn-primary btn-large" id="btn-duel-next">' + t('duel_next_round') + '</button>' +
                '</div>';
        }

        html += '</div>';
        el.innerHTML = html;

        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.announce(t('duel_narrator_reveal', {
                myIntent: intentNames[lastRound.myIntent],
                oppIntent: intentNames[lastRound.oppIntent],
                result: resultText
            }));
        }

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
                    duelState.lastSeenResolvedRound = Math.max(duelState.lastSeenResolvedRound, duelState.revealRoundNumber || duelState.roundResults.length);
                    duelState.revealRoundNumber = 0;
                    _clearPersistedSecret();
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
                    duelState.lastSeenResolvedRound = Math.max(duelState.lastSeenResolvedRound, duelState.revealRoundNumber || duelState.roundResults.length);
                    duelState.revealRoundNumber = 0;
                    duelState.currentRound = Math.max(duelState.currentRound + 1, duelState.lastSeenResolvedRound + 1);
                    duelState.selectedIntent = null;
                    duelState.strategySecret = null;
                    duelState.strategyRound = 0;
                    duelState.opponentCommitted = false;
                    duelState.opponentRevealedIntent = '';
                    duelState.myRevealedIntent = '';
                    _clearPersistedSecret();
                    duelState.phase = 'seal';
                    render();
                });
            }
        }
    }

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

        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.announce(resultTitle + '. ' + winsMe + ' ' + t('duel_to') + ' ' + winsOpp);
        }

        Helpers.$('btn-duel-rematch').addEventListener('click', function() {
            startDuel(duelState.opponent, duelState.combatRef, null);
        });

        Helpers.$('btn-duel-home').addEventListener('click', function() {
            Helpers.EventBus.emit('navigate', 'home');
        });
    }

    function _syncFromState() {
        var state = StateEngine.getState();
        if (!state || !state.duels) return;

        var duel = null;
        if (duelState.combatRef && state.duels.active && state.duels.active[duelState.combatRef]) {
            duel = state.duels.active[duelState.combatRef];
        } else if (duelState.combatRef && state.duels.pending && state.duels.pending[duelState.combatRef]) {
            duel = state.duels.pending[duelState.combatRef];
        }

        if (!duel && duelState.opponent) {
            duel = _findRelatedDuel(state, duelState.opponent);
            if (duel && duel.id) {
                duelState.combatRef = String(duel.id);
            }
        }

        if (!duel) return;

        duelState.totalRounds = duel.rounds || duelState.totalRounds;

        // Keep on-chain round as source of truth, but do not immediately roll
        // the UI back when the player has already advanced from a resolved round
        // into the next local seal step.
        var chainRound = duel.currentRound || duelState.currentRound;
        var localAdvancedRound =
            duelState.phase === 'seal' &&
            duelState.currentRound > chainRound &&
            duel.roundResults &&
            duel.roundResults.length === chainRound;

        duelState.currentRound = localAdvancedRound ? duelState.currentRound : chainRound;

        var user = VizAccount.getCurrentUser();
        duelState.opponent = _resolveOpponentFromDuel(duel, user, duelState.opponent);
        _ensureCharacterHydrated(duel.challenger);
        _ensureCharacterHydrated(duel.target);
        duelState.opponentCommitted = _hasOpponentCommitted(duel, user, duelState.currentRound);

        if (duel.roundResults && duel.roundResults.length) {
            duelState.roundResults = _mapRoundResults(duel, user);
            var latest = duelState.roundResults[duelState.roundResults.length - 1];
            if (latest) {
                duelState.myRevealedIntent = latest.myIntent;
                duelState.opponentRevealedIntent = latest.oppIntent;
                if (duel.status === 'completed') {
                    duelState.revealRoundNumber = duel.roundResults.length;
                    duelState.phase = 'result';
                    duelState.finalWinsMe = _countWinsForUser(duel.roundResults, user);
                    duelState.finalWinsOpp = _countLossesForUser(duel.roundResults, user);
                    _clearPersistedSecret();
                } else if (duel.roundResults.length > (duelState.lastSeenResolvedRound || 0)) {
                    duelState.revealRoundNumber = duel.roundResults.length;
                    duelState.phase = 'reveal';
                }
            }
        }

        if (duel.status === 'pending') {
            var isAcceptingPendingChallenge =
                duel.target === user &&
                duelState.pendingAction === 'accept';

            duelState.waitingMessageKey = isAcceptingPendingChallenge
                ? 'duel_waiting_resolution'
                : 'duel_waiting_accept_chain';

            if (duelState.phase !== 'seal') {
                duelState.phase = 'waiting';
            }
        }
        if (duel.status === 'active') {
            var activeRound = duel.currentRound || duelState.currentRound || 1;
            var hasCurrentCommit = _hasCurrentUserCommitted(duel, user, activeRound);
            var canReveal = _canRevealCurrentRound(duel);

            duelState.waitingMessageKey = canReveal ? 'duel_waiting_reveal_chain' : 'duel_waiting_commit_chain';

            if (duelState.strategySecret && duelState.strategyRound !== activeRound) {
                duelState.strategySecret = null;
                duelState.strategyRound = 0;
                duelState.selectedIntent = null;
                _clearPersistedSecret();
            }

            if (duelState.phase !== 'reveal' && duelState.phase !== 'result') {
                if (!hasCurrentCommit) {
                    duelState.phase = 'seal';
                } else {
                    duelState.phase = 'waiting';
                }
            }

            if (canReveal) {
                _maybeAutoRevealCurrentRound(duel);
            }
        }
    }

    function _getResolvedParticipants() {
        var user = VizAccount.getCurrentUser();
        var duel = _getCurrentDuel();
        return {
            me: user,
            opponent: _resolveOpponentFromDuel(duel, user, duelState.opponent)
        };
    }

    function _resolveOpponentFromDuel(duel, user, fallbackOpponent) {
        if (!duel || !user) return fallbackOpponent || '';
        if (duel.challenger === user) return duel.target || fallbackOpponent || '';
        if (duel.target === user) return duel.challenger || fallbackOpponent || '';
        return fallbackOpponent || duel.target || duel.challenger || '';
    }

    function _ensureCharacterHydrated(account) {
        if (!account || StateEngine.getCharacter(account) || _hydratingAccounts[account]) return;
        if (typeof VizAccount === 'undefined' || typeof VizAccount.getAccount !== 'function') return;
        if (typeof CharacterSystem === 'undefined' || typeof CharacterSystem.createCharacter !== 'function') return;

        _hydratingAccounts[account] = true;
        VizAccount.getAccount(account, function(err, accountData) {
            delete _hydratingAccounts[account];
            if (err || !accountData || StateEngine.getCharacter(account)) return;

            var grimoire = VizAccount.parseGrimoire(accountData);
            if (!grimoire || !grimoire.class) return;

            var state = StateEngine.getState();
            var character = CharacterSystem.createCharacter(account, grimoire.name || account, grimoire.class);
            if (!character) return;

            if (grimoire.level && grimoire.level > 1) {
                character.level = grimoire.level;
                character.xp = grimoire.xp || 0;
                if (typeof GameFormulas !== 'undefined' && GameFormulas.calculateMaxHp && CharacterSystem.getTotalStat) {
                    character.hp = GameFormulas.calculateMaxHp(character.className, character.level, CharacterSystem.getTotalStat(character, 'res'));
                    character.maxHp = character.hp;
                }
            }

            if (VizAccount.getEffectiveShares && CharacterSystem.updateCoreBonus) {
                var effectiveShares = VizAccount.getEffectiveShares(accountData);
                var cappedShares = Math.min(effectiveShares, 1000000000000);
                CharacterSystem.updateCoreBonus(character, cappedShares);
            }

            state.characters[account] = character;
            state.inventories[account] = state.inventories[account] || [];
            state.quests[account] = state.quests[account] || (typeof QuestSystem !== 'undefined' && QuestSystem.createPlayerQuestState
                ? QuestSystem.createPlayerQuestState()
                : {});

            if (App.getCurrentScreen() === 'duel') render();
        });
    }

    function _findRelatedDuel(state, opponent) {
        var user = VizAccount.getCurrentUser();
        var duel;
        var id;

        if (state.duels.pending) {
            for (id in state.duels.pending) {
                if (state.duels.pending.hasOwnProperty(id)) {
                    duel = state.duels.pending[id];
                    if (_duelInvolves(duel, user, opponent)) return duel;
                }
            }
        }

        if (state.duels.active) {
            for (id in state.duels.active) {
                if (state.duels.active.hasOwnProperty(id)) {
                    duel = state.duels.active[id];
                    if (_duelInvolves(duel, user, opponent)) return duel;
                }
            }
        }

        return null;
    }

    function _duelInvolves(duel, user, opponent) {
        return !!duel &&
            ((duel.challenger === user && duel.target === opponent) ||
             (duel.challenger === opponent && duel.target === user));
    }

    function _hasOpponentCommitted(duel, user, round) {
        var side = duel.challenger === user ? 'B' : 'A';
        return !!(duel.commits && duel.commits[round] && duel.commits[round][side]);
    }

    function _hasCurrentUserCommitted(duel, user, round) {
        var side = duel.challenger === user ? 'A' : 'B';
        return !!(duel.commits && duel.commits[round] && duel.commits[round][side]);
    }

    function _canRevealCurrentRound(duel) {
        duel = duel || DuelStateManager.getDuelStatus(duelState.combatRef, StateEngine.getState());
        if (!duel || duel.status !== 'active') return false;
        var user = VizAccount.getCurrentUser();
        if (!user) return false;
        var round = duel.currentRound || duelState.currentRound || 1;
        return _hasCurrentUserCommitted(duel, user, round);
    }

    function _mapRoundResults(duel, user) {
        var mapped = [];
        for (var i = 0; i < duel.roundResults.length; i++) {
            var result = duel.roundResults[i];
            var roundNumber = i + 1;
            var reveals = duel.reveals && duel.reveals[roundNumber] ? duel.reveals[roundNumber] : {};
            var mySide = duel.challenger === user ? 'A' : 'B';
            var oppSide = mySide === 'A' ? 'B' : 'A';
            mapped.push({
                result: result,
                myIntent: reveals[mySide] ? reveals[mySide].intent : '',
                oppIntent: reveals[oppSide] ? reveals[oppSide].intent : ''
            });
        }
        return mapped;
    }

    function _hasCurrentUserRevealed(duel, user, round) {
        var side = duel.challenger === user ? 'A' : 'B';
        return !!(duel.reveals && duel.reveals[round] && duel.reveals[round][side]);
    }

    function _maybeAutoRevealCurrentRound(duel) {
        if (!duel || duel.status !== 'active') return;
        if (!duelState.strategySecret || !duelState.strategySecret.hash) return;
        if (duelState.strategyRound !== (duel.currentRound || duelState.currentRound || 1)) return;
        if (duelState.pendingAction === 'reveal') return;

        var user = VizAccount.getCurrentUser();
        var round = duel.currentRound || duelState.currentRound || 1;
        if (!user || _hasCurrentUserRevealed(duel, user, round)) return;
        if (!_hasCurrentUserCommitted(duel, user, round)) return;

        duelState.pendingAction = 'reveal';
        duelState.phase = 'waiting';
        duelState.waitingMessageKey = 'duel_waiting_resolution';

        DuelProtocol.revealStrategy(
            duel.id,
            round,
            {
                intent: duelState.strategySecret.intent,
                spell: duelState.strategySecret.spell || '',
                energy: duelState.strategySecret.energy || 100,
                salt: duelState.strategySecret.salt
            },
            '',
            '',
            function(err) {
                if (err) {
                    duelState.pendingAction = '';
                    duelState.errorKey = 'error_network';
                    if (App.getCurrentScreen() === 'duel') render();
                    return;
                }
                duelState.myRevealedIntent = duelState.strategySecret.intent || '';
                if (App.getCurrentScreen() === 'duel') render();
            }
        );
    }

    function _countWinsForUser(roundResults, user) {
        var wins = 0;
        for (var i = 0; i < roundResults.length; i++) {
            if (roundResults[i].winner === user) wins++;
        }
        return wins;
    }

    function _countLossesForUser(roundResults, user) {
        var losses = 0;
        for (var i = 0; i < roundResults.length; i++) {
            if (roundResults[i].winner && roundResults[i].winner !== user) losses++;
        }
        return losses;
    }

    function _ensureEventListeners() {
        if (registeredListeners) return;
        registeredListeners = true;

        Helpers.EventBus.on('duel_reveal', function(data) {
            if (!duelState.combatRef || String(data.combatRef) !== String(duelState.combatRef)) return;
            duelState.waitingMessageKey = 'duel_waiting_resolution';
            if (data.account === duelState.opponent) {
                duelState.opponentRevealedIntent = data.intent || '';
            }
            _syncFromState();
            if (App.getCurrentScreen() === 'duel') render();
        });

        Helpers.EventBus.on('duel_commit', function(data) {
            if (!duelState.combatRef || String(data.combatRef) !== String(duelState.combatRef)) return;
            if (data.account === duelState.opponent) {
                duelState.opponentCommitted = true;
                duelState.waitingMessageKey = 'duel_waiting_reveal_chain';
            }
            if (App.getCurrentScreen() === 'duel') render();
        });

        Helpers.EventBus.on('duel_challenge', function(data) {
            // When our own challenge is confirmed on chain, capture the combatRef
            var user = VizAccount.getCurrentUser();
            if (data.account === user && data.target === duelState.opponent && !duelState.combatRef) {
                duelState.combatRef = String(data.challengeRef);
                console.log('DuelScreen: Challenge confirmed, ref:', duelState.combatRef);
            }
        });

        Helpers.EventBus.on('duel_accepted', function(data) {
            if (duelState.opponent && (data.challenger === duelState.opponent || data.target === duelState.opponent)) {
                duelState.combatRef = String(data.combatRef);
                duelState.waitingMessageKey = 'duel_waiting_resolution';
                _syncFromState();
                if (App.getCurrentScreen() === 'duel') render();
            }
        });

        Helpers.EventBus.on('duel_completed', function(data) {
            if (!duelState.combatRef || String(data.combatRef) !== String(duelState.combatRef)) return;
            _syncFromState();
            if (App.getCurrentScreen() === 'duel') render();
        });
    }

    /**
     * Start polling duel state for opponent updates.
     * Checks StateEngine world state every STATE_POLL_INTERVAL_MS
     * for changes to the current duel (accept, commit, reveal, result).
     */
    function _startStatePoll() {
        if (_statePollTimer) return;

        var _prevStatus = '';
        var _prevRound = 0;
        var _prevPhase = duelState.phase;

        // Capture initial state snapshot for comparison
        var duel = _getCurrentDuel();
        if (duel) {
            _prevStatus = duel.status || '';
            _prevRound = duel.currentRound || 0;
        }

        _statePollTimer = setInterval(function() {
            if (App.getCurrentScreen() !== 'duel') {
                _stopStatePoll();
                return;
            }

            var currentDuel = _getCurrentDuel();
            if (!currentDuel) return;

            var changed = false;

            // Check if duel status changed
            if (currentDuel.status !== _prevStatus) {
                _prevStatus = currentDuel.status;
                changed = true;
            }

            // Check if round advanced
            if (currentDuel.currentRound !== _prevRound) {
                _prevRound = currentDuel.currentRound;
                changed = true;
            }

            // Check if opponent committed or revealed
            var user = VizAccount.getCurrentUser();
            var oppCommitted = _hasOpponentCommitted(currentDuel, user, currentDuel.currentRound || 1);
            if (oppCommitted && !duelState.opponentCommitted) {
                duelState.opponentCommitted = true;
                changed = true;
            }

            // Check for round results
            if (currentDuel.roundResults && currentDuel.roundResults.length > duelState.roundResults.length) {
                changed = true;
            }

            if (changed) {
                var oldPhase = duelState.phase;
                _syncFromState();

                // If phase changed, re-render
                if (duelState.phase !== oldPhase || changed) {
                    render();
                }
            }
        }, STATE_POLL_INTERVAL_MS);
    }

    /**
     * Stop state polling.
     */
    function _stopStatePoll() {
        if (_statePollTimer) {
            clearInterval(_statePollTimer);
            _statePollTimer = null;
        }
    }

    /**
     * Get current duel object from StateEngine world state.
     */
    function _getCurrentDuel() {
        var state = StateEngine.getState();
        if (!state || !state.duels) return null;

        if (duelState.combatRef) {
            if (state.duels.active && state.duels.active[duelState.combatRef]) {
                return state.duels.active[duelState.combatRef];
            }
            if (state.duels.pending && state.duels.pending[duelState.combatRef]) {
                return state.duels.pending[duelState.combatRef];
            }
            // Check history for completed duels
            if (state.duels.history) {
                for (var i = 0; i < state.duels.history.length; i++) {
                    if (state.duels.history[i].id === duelState.combatRef) {
                        return state.duels.history[i];
                    }
                }
            }
        }

        // Try finding by opponent
        if (duelState.opponent) {
            return _findRelatedDuel(state, duelState.opponent);
        }

        return null;
    }

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
        for (var intent in beats) {
            if (beats.hasOwnProperty(intent) && beats[intent] === lastOppIntent) {
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
            if (!oppI) continue;
            intentCounts[oppI] = (intentCounts[oppI] || 0) + 1;
        }

        var maxIntent = '';
        var maxCount = 0;
        for (var k in intentCounts) {
            if (intentCounts.hasOwnProperty(k) && intentCounts[k] > maxCount) {
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

    Helpers.EventBus.on('navigate', function(screen) {
        if (screen !== 'duel') {
            _clearSealTimer();
            _stopStatePoll();
        }
    });

    return {
        render: render,
        startDuel: startDuel
    };
})();
