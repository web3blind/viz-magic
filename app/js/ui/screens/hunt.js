/**
 * Viz Magic — PvE Hunt Combat Screen
 */
var HuntScreen = (function() {
    'use strict';

    var selectedCreature = null;
    var selectedSpell = null;
    var selectedHuntEnergy = 100;
    var stoneItemId = null;
    var recoveryGeneration = 0;
    var recoveryTimer = null;
    var MAX_AUTOMATIC_RECOVERY_RETRIES = 6;
    var RECOVERY_RETRY_MS = 3000;
    var HUNT_HP_DISPLAY_MAX = 5000;
    var HUNT_POWER_OPTIONS = [
        { energy: 100, labelKey: 'hunt_power_cautious' },
        { energy: 300, labelKey: 'hunt_power_confident' },
        { energy: 500, labelKey: 'hunt_power_strong' },
        { energy: 700, labelKey: 'hunt_power_fierce' }
    ];

    function _pendingHuntKey(account) {
        return VizMagicConfig.STORAGE_PREFIX + 'pending_hunt_' + String(account || '').toLowerCase();
    }

    function _loadPendingHunt(account) {
        if (!account) return null;
        try {
            var pending = JSON.parse(localStorage.getItem(_pendingHuntKey(account)) || 'null');
            if (!pending || pending.version !== 1 || pending.account !== account ||
                    !pending.creature || !pending.spell || !Number.isSafeInteger(Number(pending.energy)) || Number(pending.energy) <= 0) {
                return null;
            }
            pending.blockNum = Number(pending.blockNum || 0);
            pending.submittedAfterBlock = Number(pending.submittedAfterBlock || 0);
            return pending;
        } catch (e) {
            return null;
        }
    }

    function _savePendingHunt(pending) {
        if (!pending || !pending.account) return;
        try { localStorage.setItem(_pendingHuntKey(pending.account), JSON.stringify(pending)); } catch (e) {}
    }

    function _clearPendingHunt(account) {
        if (!account) return;
        try { localStorage.removeItem(_pendingHuntKey(account)); } catch (e) {}
    }

    function _cancelRecovery() {
        recoveryGeneration++;
        if (recoveryTimer) clearTimeout(recoveryTimer);
        recoveryTimer = null;
    }

    function _currentObservedBlock() {
        var stateBlock = Number(StateEngine.getState().headBlock || 0);
        var dgp = typeof VizConnection !== 'undefined' && VizConnection.getDGP ? VizConnection.getDGP() : null;
        var chainBlock = Number(dgp && (dgp.head_block_number || dgp.last_irreversible_block_num) || 0);
        return Math.max(stateBlock, chainBlock);
    }

    function render() {
        _cancelRecovery();
        var t = Helpers.t;
        var el = Helpers.$('screen-hunt');
        if (!el) return;

        var user = VizAccount.getCurrentUser();
        var ch = StateEngine.getCharacter(user);
        var state = StateEngine.getState();

        // Auto-restore HP between hunts (rest at camp)
        if (ch && ch.hp <= 0 && ch.maxHp) {
            ch.hp = ch.maxHp;
        } else if (ch && ch.hp <= 0) {
            ch.hp = GameFormulas.calculateMaxHp(ch.className, ch.level, CharacterSystem.getTotalStat(ch, 'res'));
            ch.maxHp = ch.hp;
        }
        var level = ch ? (ch.level || 1) : 1;
        var zone = (ch && ch.currentZone) || 'commons_first_light';
        var creatures = _filterCreaturesForLevel(GameCreatures.getCreaturesForZone(zone), ch);
        var spells = ch ? GameSpells.getAvailableSpells(ch.className, ch.level) : [];

        selectedCreature = null;
        selectedSpell = _getDefaultHuntSpellId(spells);
        selectedHuntEnergy = 100;

        var needsRest = ch && ch.maxHp && ch.hp < ch.maxHp;
        var hpShown = ch && ch.maxHp ? _scaleForDisplay(ch.hp || 0, ch.maxHp, HUNT_HP_DISPLAY_MAX) : 0;
        var hpText = ch && ch.maxHp ? (Helpers.formatNumber(hpShown) + ' / ' + Helpers.formatNumber(HUNT_HP_DISPLAY_MAX)) : '';
        var html = '<div class="hunt-screen">' +
            '<h1><span class="screen-title-icon vmagic-breathe" aria-hidden="true">🏹</span> ' + t('hunt_title') + '</h1>' +
            '<section class="hunt-rest-section" aria-label="' + t('hunt_rest_title') + '">' +
                '<h2><span class="section-icon vmagic-breathe" aria-hidden="true">⛺</span> ' + t('hunt_rest_title') + '</h2>' +
                '<p class="quest-desc">' + t('hunt_rest_desc') + (hpText ? ' ' + t('hunt_rest_hp_now', {hp: hpText}) : '') + '</p>' +
                '<button class="btn btn-secondary" id="btn-rest-camp" type="button"' + (needsRest ? '' : ' disabled') + '>' +
                    (needsRest ? t('hunt_rest_button') : t('hunt_rest_full')) +
                '</button>' +
            '</section>' +
            '<h2><span class="section-icon vmagic-breathe" aria-hidden="true">🐾</span> ' + t('hunt_choose_creature') + '</h2>';

        if (!creatures.length) {
            html += '<div class="creature-list" role="status" aria-live="polite">' +
                '<p class="empty-state">' + t('hunt_no_creatures_here') + '</p>' +
                '<p class="quest-desc">' + t('hunt_no_creatures_hint') + '</p>' +
                '<button class="btn btn-secondary" id="btn-return-commons">' + t('hunt_return_to_commons') + '</button>' +
            '</div>';
        } else {
            html += '<div class="creature-list" role="radiogroup" aria-label="' + t('hunt_choose_creature') + '">';

            for (var i = 0; i < creatures.length; i++) {
                var c = creatures[i];
                html += '<button class="creature-card" data-id="' + c.id + '" role="radio" aria-checked="false" ' +
                    'tabindex="' + (i === 0 ? '0' : '-1') + '" type="button" ' +
                    'aria-label="' + c.name + '. ' + t('hunt_creature_level_aria', { min: c.minLevel, max: c.maxLevel }) + '">' +
                    '<span class="creature-main"><span class="creature-icon vmagic-breathe" aria-hidden="true">' + Helpers.escapeHtml(c.icon || '✦') + '</span>' +
                    '<span class="creature-name">' + Helpers.escapeHtml(c.name) + '</span></span>' +
                    '<span class="creature-level">Lv ' + c.minLevel + '-' + c.maxLevel + '</span>' +
                    (c.minLevel > level ? '<span class="creature-danger-hint">' + t('hunt_danger_hint') + '</span>' : '') +
                    '</button>';
            }

            html += '</div>';
        }

        html += '<h2><span class="section-icon vmagic-breathe" aria-hidden="true">🪄</span> ' + t('hunt_choose_spell_power') + '</h2>' +
            '<p class="quest-desc">' + t('hunt_power_hint') + '</p>' +
            '<div class="hunt-power-grid" role="radiogroup" aria-label="' + t('hunt_choose_spell_power') + '">';

        for (var pi = 0; pi < HUNT_POWER_OPTIONS.length; pi++) {
            var power = HUNT_POWER_OPTIONS[pi];
            html += '<button class="hunt-power-btn" data-energy="' + power.energy + '" role="radio" aria-checked="' + (pi === 0 ? 'true' : 'false') + '" ' +
                'tabindex="' + (pi === 0 ? '0' : '-1') + '" type="button" ' +
                'aria-label="' + t(power.labelKey) + '. ' + t('hunt_mana_cost', {cost: Helpers.bpToPercent(power.energy)}) + '">' +
                '<span class="hunt-power-label">' + t(power.labelKey) + '</span>' +
                '<span class="hunt-power-cost">' + Helpers.bpToPercent(power.energy) + '</span>' +
                '</button>';
        }

        html += '</div>' +
            '<button class="btn btn-primary btn-large" id="btn-attack" disabled>' + t('hunt_attack') + '</button>';

        // --- Armageddon section ---
        stoneItemId = null;
        var hasStone = false;
        if (user && state && state.inventories && state.inventories[user]) {
            var inv = state.inventories[user];
            for (var ai = 0; ai < inv.length; ai++) {
                if (inv[ai] && inv[ai].type === 'armageddon_stone' && !inv[ai].consumed) {
                    hasStone = true;
                    stoneItemId = inv[ai].id;
                    break;
                }
            }
        }

        var armageddonSectionHtml = '<div class="armageddon-section">' +
            '<h2><span class="section-icon vmagic-breathe" aria-hidden="true">&#9888;&#65039;</span> ' + t('hunt_armageddon_title') + ' !!!' +
            '<button class="help-tip-btn" aria-label="' + t('help_tip_armageddon') + '" ' +
            'title="' + t('help_tip_armageddon') + '" ' +
            'onclick="Helpers.EventBus.emit(\'navigate\', \'help\')">❓</button>' +
            '</h2>' +
            '<p>' + t('hunt_armageddon_desc') + '</p>';

        if (!hasStone) {
            armageddonSectionHtml += '<p class="armageddon-note">' + t('hunt_armageddon_no_stone') + '</p>';
            armageddonSectionHtml += '<button class="btn btn-danger armageddon-locked-btn" type="button" data-armageddon-lock="stone" style="width:100%"><span class="armageddon-explosion-icon vmagic-breathe" aria-hidden="true">💥</span> ' + t('hunt_armageddon_launch') + '</button>';
        } else {
            armageddonSectionHtml += '<label class="armageddon-label">' +
                '<input type="checkbox" id="armageddon-confirm-cb"> ' +
                t('hunt_armageddon_confirm') + '</label>' +
                '<button class="btn btn-danger" id="btn-armageddon" disabled style="width:100%"><span class="armageddon-explosion-icon vmagic-breathe" aria-hidden="true">💥</span> ' +
                t('hunt_armageddon_launch') + '</button>';
        }
        armageddonSectionHtml += '</div>';

        html += armageddonSectionHtml +
            '<div id="hunt-result" aria-live="assertive"></div>' +
            '</div>';

        el.innerHTML = html;
        _bindEvents(el);
        _resumePendingOrRecentHunt(user, ch);
    }

    function _scaleForDisplay(value, max, displayMax) {
        if (!max || max <= 0) return 0;
        var shown = Math.round(Math.max(0, value) * displayMax / max);
        if (shown > displayMax) shown = displayMax;
        return shown;
    }

    function _filterCreaturesForLevel(creatures, character) {
        if (!character || !creatures || !creatures.length) return creatures || [];
        var level = character.level || 1;
        var out = [];
        var deadly = [];
        for (var i = 0; i < creatures.length; i++) {
            var c = creatures[i];
            if (!c) continue;
            var min = c.minLevel || 1;
            var max = c.maxLevel || min;
            if (max <= level + 2) continue; // stale habitat: too much weaker than the player (tier 5-10 leaves at level 8)
            if (c.deadly === true) {
                if (min <= level + 2 && deadly.length === 0) deadly.push(c); // one honest high-risk target
            } else if (min <= level + 2) {
                out.push(c);
            }
        }
        if (deadly.length) out.push(deadly[0]);
        out.sort(function(x, y) {
            var xm = (x.maxLevel || 0), ym = (y.maxLevel || 0);
            if (xm !== ym) return xm - ym;
            return (x.minLevel || 0) - (y.minLevel || 0);
        });
        return out;
    }

    function _isDangerCreature(creature, character) {
        if (!creature || !character) return false;
        return creature.deadly === true;
    }

    function _getDefaultHuntSpellId(spells) {
        if (!spells || !spells.length) return null;
        for (var i = 0; i < spells.length; i++) {
            if (spells[i] && (spells[i].manaCost || 0) >= VizMagicConfig.ENERGY.MIN_HUNT_COST) {
                return spells[i].id;
            }
        }
        return spells[0] && spells[0].id;
    }

    function _bindEvents(el) {
        A11y.bindRadioGroup(el.querySelector('.creature-list[role="radiogroup"]'), '.creature-card', function(option) {
            selectedCreature = option.getAttribute('data-id');
            SoundManager.play('tap');
            _checkReady();
        });

        _syncHuntPowerOptions();

        A11y.bindRadioGroup(el.querySelector('.hunt-power-grid[role="radiogroup"]'), '.hunt-power-btn', function(option) {
            selectedHuntEnergy = Number(option.getAttribute('data-energy')) || 100;
            SoundManager.play('tap');
            _checkReady();
        });

        Helpers.$('btn-attack').addEventListener('click', _doHunt);

        var restBtn = Helpers.$('btn-rest-camp');
        if (restBtn) {
            restBtn.addEventListener('click', _doRest);
        }

        var returnBtn = Helpers.$('btn-return-commons');
        if (returnBtn) {
            returnBtn.addEventListener('click', function() {
                var user = VizAccount.getCurrentUser();
                var ch = StateEngine.getCharacter(user);
                if (ch) {
                    ch.currentZone = 'commons_first_light';
                    Toast.info(Helpers.t('hunt_returned_to_commons'));
                    try {
                        CheckpointSystem.saveCheckpoint('global', StateEngine.getState().headBlock || 0, StateEngine.getState(), function() {});
                    } catch (e) {}
                }
                render();
            });
        }

        // Armageddon confirm checkbox and launch button
        var armaCb = el.querySelector('#armageddon-confirm-cb');
        var armaBtn = el.querySelector('#btn-armageddon');
        if (armaCb && armaBtn) {
            armaCb.addEventListener('change', function() {
                armaBtn.disabled = !armaCb.checked;
            });
            armaBtn.addEventListener('click', function() {
                if (!armaCb.checked) {
                    Toast.info(Helpers.t('hunt_armageddon_envy'));
                    return;
                }
                _doArmageddon(stoneItemId);
            });
        }
        var lockedBtns = el.querySelectorAll('.armageddon-locked-btn');
        for (var lb = 0; lb < lockedBtns.length; lb++) {
            lockedBtns[lb].addEventListener('click', function() {
                SoundManager.play('tap');
                Toast.info(Helpers.t('hunt_armageddon_envy'));
            });
        }
    }

    function _checkReady() {
        Helpers.$('btn-attack').disabled = !(selectedCreature && selectedSpell && selectedHuntEnergy);
    }

    function _getSelectedHuntEnergy(spell) {
        var spellCost = spell && spell.manaCost ? spell.manaCost : VizMagicConfig.ENERGY.MIN_HUNT_COST;
        var chosen = selectedHuntEnergy || VizMagicConfig.ENERGY.MIN_HUNT_COST;
        return Math.max(spellCost, chosen);
    }

    function _syncHuntPowerOptions() {
        var spell = GameSpells.getSpell(selectedSpell);
        var minEnergy = spell && spell.manaCost ? spell.manaCost : VizMagicConfig.ENERGY.MIN_HUNT_COST;
        var buttons = document.querySelectorAll('.hunt-power-btn');
        var firstEnabled = null;
        var selectedStillEnabled = false;
        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var energy = Number(btn.getAttribute('data-energy')) || 0;
            var disabled = energy < minEnergy;
            btn.disabled = disabled;
            btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
            if (disabled && btn.getAttribute('aria-checked') === 'true') {
                btn.setAttribute('aria-checked', 'false');
                btn.classList.remove('selected');
            }
            if (!disabled && !firstEnabled) firstEnabled = btn;
            if (!disabled && energy === selectedHuntEnergy) selectedStillEnabled = true;
        }
        if (!selectedStillEnabled && firstEnabled) {
            selectedHuntEnergy = Number(firstEnabled.getAttribute('data-energy')) || minEnergy;
            firstEnabled.setAttribute('aria-checked', 'true');
            firstEnabled.classList.add('selected');
            firstEnabled.tabIndex = 0;
        }
    }

    function _doRest() {
        var t = Helpers.t;
        var resultEl = Helpers.$('hunt-result');
        var btn = Helpers.$('btn-rest-camp');
        var user = VizAccount.getCurrentUser();
        var ch = StateEngine.getCharacter(user);
        if (!user || !ch) {
            if (resultEl) resultEl.innerHTML = '<p class="error">' + t('error_network') + '</p>';
            return;
        }
        if (!ch.maxHp || ch.hp >= ch.maxHp) return;
        if (btn) btn.disabled = true;
        if (resultEl) resultEl.innerHTML = '<p class="pending">' + t('hunt_rest_pending') + '</p>';
        SoundManager.play('tap');
        VizBroadcast.restAction(function(err, broadcastResult) {
            if (err) {
                if (resultEl) resultEl.innerHTML = '<p class="error">' + t('hunt_rest_error') + '</p>';
                if (btn) btn.disabled = false;
                return;
            }
            var blockNum = (broadcastResult && broadcastResult.action && broadcastResult.action.block_num) || (StateEngine.getState().headBlock || 0);
            var ev = StateEngine.processRestResult(user, blockNum);
            if (!ev) {
                if (resultEl) resultEl.innerHTML = '<p class="error">' + t('hunt_rest_error') + '</p>';
                if (btn) btn.disabled = false;
                return;
            }
            CheckpointSystem.saveCheckpoint('global', blockNum, StateEngine.getState(), function() {});
            if (resultEl) resultEl.innerHTML = '<p class="success">' + t('hunt_rest_success') + '</p>';
            render();
        });
    }

    function _doHunt() {
        if (!selectedCreature || !selectedSpell) return;
        _cancelRecovery();
        var t = Helpers.t;
        var resultEl = Helpers.$('hunt-result');
        var btn = Helpers.$('btn-attack');
        btn.disabled = true;

        var user = VizAccount.getCurrentUser();
        var ch = StateEngine.getCharacter(user) || CharacterSystem.createCharacter(user || 'demo', 'Demo Mage', 'embercaster');

        // Ensure HP is restored before combat (rest between hunts)
        if (ch && ch.hp <= 0) {
            ch.hp = ch.maxHp || GameFormulas.calculateMaxHp(ch.className, ch.level, CharacterSystem.getTotalStat(ch, 'res'));
            if (!ch.maxHp) ch.maxHp = ch.hp;
        }
        var creature = GameCreatures.getCreature(selectedCreature);
        var spell = GameSpells.getSpell(selectedSpell);

        if (!user || !creature || !spell) {
            resultEl.innerHTML = '<p class="error">' + t('error_network') + '</p>';
            btn.disabled = false;
            return;
        }

        VizAccount.getAccount(user, function(err, accountData) {
            var playerEnergy = 10000;
            if (!err && accountData) {
                playerEnergy = VizAccount.calculateCurrentEnergy(accountData);
            }

            var huntEnergy = _getSelectedHuntEnergy(spell);

            if ((spell.manaCost || 0) < VizMagicConfig.ENERGY.MIN_HUNT_COST) {
                resultEl.innerHTML = '<p class="error">' + t('hunt_spell_too_weak') + '</p>';
                btn.disabled = false;
                return;
            }

            if (playerEnergy < huntEnergy) {
                resultEl.innerHTML = '<p class="error">' + t('hunt_not_enough_mana') + '</p>';
                btn.disabled = false;
                return;
            }

            resultEl.innerHTML = _renderPendingState(t, creature, spell, true, huntEnergy);
            SoundManager.play('tap');
            SoundManager.vibrate('light');
            var submittedAfterBlock = _currentObservedBlock();

            VizBroadcast.huntAction(
                selectedCreature,
                ch.currentZone || 'commons_first_light',
                selectedSpell,
                huntEnergy,
                creature.author || '',
                function(broadcastErr, broadcastResult) {
                    if (broadcastErr) {
                        console.log('Hunt broadcast error:', broadcastErr);
                        resultEl.innerHTML = _renderBlockedState(t, creature, spell, broadcastErr);
                        _bindResultActions();
                        btn.disabled = false;
                        return;
                    }

                    // Get block_num from broadcast result, then fetch the actual block
                    // to use witness_signature as Fate Entropy (unforgeable, unique per block)
                    var blockNum = 0;
                    if (broadcastResult) blockNum = Number(broadcastResult.block_num || broadcastResult.block || 0);
                    var pendingHunt = {
                        version: 1,
                        status: 'submitted',
                        account: user,
                        creature: creature.id,
                        spell: spell.id,
                        energy: huntEnergy,
                        blockNum: blockNum,
                        submittedAfterBlock: submittedAfterBlock,
                        txId: String(broadcastResult && (broadcastResult.id || broadcastResult.trx_id || broadcastResult.transaction_id) || '')
                    };
                    _savePendingHunt(pendingHunt);
                    _resolveHuntFromBlock(blockNum, ch, creature, spell, huntEnergy, user, resultEl, t, pendingHunt);
                }
            );
        });
    }

    function _huntCandidateData(candidate) {
        var payload = candidate && candidate.payload || {};
        return payload.d || payload.data || payload;
    }

    function _resumePendingOrRecentHunt(user, ch) {
        if (!user || !ch || typeof HistorySource === 'undefined' || !HistorySource.findAccountAction) return;
        var generation = recoveryGeneration;
        var pending = _loadPendingHunt(user);
        if (pending) {
            var pendingCreature = GameCreatures.getCreature(pending.creature);
            var pendingSpell = GameSpells.getSpell(pending.spell);
            var pendingResultEl = Helpers.$('hunt-result');
            if (!pendingCreature || !pendingSpell || !pendingResultEl) return;
            pendingResultEl.innerHTML = _renderSubmittedState(Helpers.t, pendingCreature, pendingSpell);
            _resolveHuntFromBlock(pending.blockNum, ch, pendingCreature, pendingSpell, pending.energy, user, pendingResultEl, Helpers.t, pending);
            return;
        }

        var lastAppliedHunt = Number(ch.lastHuntBlock || 0);
        var recovery = StateEngine.getState().recovery && StateEngine.getState().recovery[user];
        var allowLatestApplied = !!(recovery && recovery.status === 'pending');
        HistorySource.findAccountAction(user, VizMagicConfig.PROTOCOLS.VM, VizMagicConfig.ACTION_TYPES.HUNT, function(err, candidate) {
            var candidateBlock = Number(candidate && candidate.blockNum || 0);
            if (generation !== recoveryGeneration || err || !candidate || candidateBlock < lastAppliedHunt ||
                    (candidateBlock === lastAppliedHunt && !allowLatestApplied)) return;
            var data = _huntCandidateData(candidate);
            var creature = GameCreatures.getCreature(data.creature);
            var spell = GameSpells.getSpell(data.spell);
            var energy = Number(data.energy || 0);
            var resultEl = Helpers.$('hunt-result');
            if (!creature || !spell || !energy || !resultEl) return;
            var recoveredPending = {
                version: 1,
                status: 'submitted',
                account: user,
                creature: creature.id,
                spell: spell.id,
                energy: energy,
                blockNum: Number(candidate.blockNum || 0),
                txId: String(candidate.txId || '')
            };
            _savePendingHunt(recoveredPending);
            _resolveHuntFromBlock(recoveredPending.blockNum, ch, creature, spell, energy, user, resultEl, Helpers.t, recoveredPending);
        }, function(candidate) {
            var candidateBlock = Number(candidate && candidate.blockNum || 0);
            return candidateBlock > lastAppliedHunt || (allowLatestApplied && candidateBlock === lastAppliedHunt);
        });
    }

    function _doArmageddon(stoneId) {
        var t = Helpers.t;
        var resultEl = Helpers.$('hunt-result');

        var user = VizAccount.getCurrentUser();
        var ch = StateEngine.getCharacter(user) || CharacterSystem.createCharacter(user || 'demo', 'Demo Mage', 'embercaster');

        if (!selectedCreature) {
            resultEl.innerHTML = '<p class="error">' + t('hunt_choose_creature') + '</p>';
            return;
        }
        var creature = GameCreatures.getCreature(selectedCreature);
        if (!creature) return;

        VizAccount.getAccount(user, function(err, accountData) {
            var playerEnergy = 0;
            if (!err && accountData) {
                playerEnergy = VizAccount.calculateCurrentEnergy(accountData);
            }

            if (playerEnergy < 10000) {
                resultEl.innerHTML = '<p class="error">' + t('hunt_armageddon_no_mana') + '</p>';
                return;
            }

            // Disable button to prevent double-click
            var armaBtn = Helpers.$('btn-armageddon');
            if (armaBtn) armaBtn.disabled = true;

            VizBroadcast.armageddonAction(
                selectedCreature,
                ch.currentZone || 'commons_first_light',
                stoneId || '',
                10000,
                creature.author || '',
                function(broadcastErr, broadcastResult) {
                    if (broadcastErr) {
                        resultEl.innerHTML = '<p class="error">' + t('hunt_blocked_text') + '</p>';
                        if (armaBtn) armaBtn.disabled = false;
                        return;
                    }

                    var blockNum = 0;
                    if (broadcastResult) blockNum = Number(broadcastResult.block_num || broadcastResult.block || 0);

                    _resolveArmageddonFromBlock(blockNum, ch, creature, playerEnergy, user, stoneId, resultEl, t);
                }
            );
        });
    }

    function _resolveArmageddonFromBlock(blockNum, ch, creature, playerEnergy, user, stoneId, resultEl, t) {
        var _doResolve = function(finalBlockNum, block) {
            var processed = BlockProcessor.processBlock(block, finalBlockNum);
            var blockEvents = StateEngine.processBlock(processed, { advanceHead: false, runMaintenance: false });
            if (!blockEvents.length && StateEngine.getProcessedActionOutcome) {
                blockEvents = StateEngine.getProcessedActionOutcome(processed, 'vm', function(record) {
                    var data = record.action && record.action.data || {};
                    return record.sender === user && record.action && record.action.type === VizMagicConfig.ACTION_TYPES.HUNT_ARMAGEDDON &&
                        data.creature === creature.id && String(data.stone || data.stone_ref || '') === String(stoneId || '');
                });
            }
            var armaResult = null;
            for (var eventIndex = 0; eventIndex < blockEvents.length; eventIndex++) {
                var candidate = blockEvents[eventIndex];
                if (candidate.type === 'armageddon_used' && candidate.account === user && candidate.creature === selectedCreature) {
                    armaResult = candidate;
                    break;
                }
            }
            if (!armaResult) {
                resultEl.innerHTML = '<p class="error">' + t('hunt_armageddon_no_stone') + '</p>';
                return;
            }
            var xp = armaResult.xpGained;
            var xpResult = { levelsGained: armaResult.levelsGained };

            var state = StateEngine.getState();

            // Persist the confirmed outcome without advancing the contiguous polling cursor.
            CheckpointSystem.saveCheckpoint('global', state.headBlock || 0, state, function() {});

            // Update Grimoire
            VizAccount.updateGrimoire(CharacterSystem.toGrimoire(ch), function() {});

            SoundManager.play('victory');
            SoundManager.vibrate('triple');

            if (xpResult && xpResult.levelsGained > 0 && typeof Toast !== 'undefined') {
                Toast.success(t('char_level_up') + ' — ' + t('home_level') + ' ' + ch.level, 7000, { key: 'level_up' });
            }

            var resultHtml = '<div class="combat-result victory">' +
                '<h2 style="color:var(--color-error)">&#9888;&#65039; ' + t('hunt_armageddon_victory') + '</h2>' +
                '<p>' + creature.name + '</p>' +
                '<p>' + t('hunt_armageddon_xp') + ': <strong>' + xp + '</strong></p>';
            if (xpResult && xpResult.levelsGained > 0) {
                resultHtml += '<p>&#127881; ' + t('char_level_up') + ' &#8594; Lv ' + ch.level + '</p>';
            }
            resultHtml += '<button class="btn btn-secondary" id="btn-hunt-home">' + t('hunt_home') + '</button>' +
                '</div>';
            resultEl.innerHTML = resultHtml;
            _bindResultActions();
        };

        if (!blockNum) {
            resultEl.innerHTML = '<p role="status">' + t('hunt_submitted_text') + '</p>';
            return;
        }
        HistorySource.getBlock(blockNum, function(err, block) {
            if (err || !block) {
                resultEl.innerHTML = '<p role="status">' + t('hunt_submitted_text') + '</p>';
                return;
            }
            _doResolve(blockNum, block);
        });
    }

    /**
     * Fetch block data from chain and use the previous block id as canonical Fate Entropy.
     * `previous` is available from live RPC and every archive replay path.
     * then resolve combat deterministically.
     * If block_num is 0 or fetch fails, falls back to DGP head block.
     */
    function _resolveHuntFromBlock(blockNum, ch, creature, spell, playerEnergy, user, resultEl, t, pendingHunt) {
        _cancelRecovery();
        var generation = recoveryGeneration;
        var retryCount = 0;
        pendingHunt = pendingHunt || _loadPendingHunt(user) || {
            version: 1, status: 'submitted', account: user, creature: creature.id,
            spell: spell.id, energy: playerEnergy, blockNum: Number(blockNum || 0), txId: ''
        };
        var _matchesHuntRecord = function(record) {
            var data = record.action && record.action.data || {};
            if (record.sender !== user || !record.action || record.action.type !== VizMagicConfig.ACTION_TYPES.HUNT ||
                    data.creature !== creature.id || data.spell !== spell.id || Number(data.energy || 0) !== Number(playerEnergy || 0)) {
                return false;
            }
            return !(pendingHunt.txId && record.txId && pendingHunt.txId !== record.txId);
        };
        var _doResolve = function(fateEntropy, finalBlockNum, block) {
            if (generation !== recoveryGeneration) return;
            console.log('Hunt resolving with canonical Fate Entropy:', fateEntropy.substring(0, 32) + '..., block:', finalBlockNum);

            var processed = BlockProcessor.processBlock(block, finalBlockNum);
            var priorOutcome = StateEngine.getProcessedActionOutcome
                ? StateEngine.getProcessedActionOutcome(processed, 'vm', _matchesHuntRecord)
                : [];
            var allBlockEvents = StateEngine.processBlock(processed, { advanceHead: false, runMaintenance: false });
            var blockEvents = StateEngine.getProcessedActionOutcome
                ? StateEngine.getProcessedActionOutcome(processed, 'vm', _matchesHuntRecord)
                : allBlockEvents;
            var newlyApplied = priorOutcome.length === 0 && blockEvents.length > 0;
            var result = null;
            for (var eventIndex = 0; eventIndex < blockEvents.length; eventIndex++) {
                var candidate = blockEvents[eventIndex];
                if ((candidate.type === 'hunt_victory' || candidate.type === 'hunt_defeat') && candidate.account === user && candidate.creature === creature.id) {
                    result = candidate.result;
                    break;
                }
            }
            if (!result) {
                resultEl.innerHTML = _renderBlockedState(t, creature, spell, new Error('paid_action_proof_missing'));
                _bindResultActions(function() { _attemptRecovery(0); });
                return;
            }

            if (recoveryTimer) clearTimeout(recoveryTimer);
            recoveryTimer = null;
            pendingHunt.status = 'confirmed';
            pendingHunt.blockNum = finalBlockNum;
            _savePendingHunt(pendingHunt);

            // ch is a reference to the same object in worldState — already updated by processHuntResult
            var state = StateEngine.getState();

            // Record armageddon_stone drops on-chain for verifiability
            if (newlyApplied && result.victory && result.loot) {
                for (var li = 0; li < result.loot.length; li++) {
                    if (result.loot[li].type === 'armageddon_stone') {
                        (function(lootItem) {
                            VizBroadcast.gameAction({
                                t: 'loot.acquire',
                                d: {
                                    item: 'armageddon_stone',
                                    item_id: lootItem.itemId || '',
                                    hunt_block: finalBlockNum
                                }
                            }, function(err) {
                                if (err) {
                                    console.log('loot.acquire broadcast failed (non-fatal):', err);
                                } else {
                                    console.log('armageddon_stone recorded on-chain');
                                }
                            });
                        })(result.loot[li]);
                    }
                }
            }

            // Persist the confirmed outcome without advancing over unseen history.
            CheckpointSystem.saveCheckpoint('global', state.headBlock || 0, state, function(saveErr) {
                if (saveErr) {
                    console.log('Checkpoint save error:', saveErr);
                } else {
                    console.log('State checkpointed after confirmed block', finalBlockNum, '— XP:', ch.xp, 'Lv:', ch.level);
                }
            });

            // Update Grimoire on chain (cache hint for level/xp)
            if (newlyApplied) {
                VizAccount.updateGrimoire(CharacterSystem.toGrimoire(ch), function(grimErr) {
                    if (grimErr) {
                        console.log('Grimoire update error (non-fatal):', grimErr);
                    } else {
                        console.log('Grimoire updated on chain: Lv', ch.level, 'XP', ch.xp);
                    }
                });
            }

            SoundManager.play(result.victory ? 'victory' : 'defeat');
            SoundManager.vibrate(result.victory ? 'medium' : 'triple');
            A11y.announceCombatResult(result, creature.name);

            if (result.levelsGained > 0 && typeof Toast !== 'undefined') {
                Toast.success(t('char_level_up') + ' — ' + t('home_level') + ' ' + ch.level, 7000, { key: 'level_up' });
            }
            resultEl.innerHTML = _renderCombatResult(t, result, creature);
            _bindResultActions();
        };

        var _scheduleRetry = function(attempt) {
            if (attempt >= MAX_AUTOMATIC_RECOVERY_RETRIES || generation !== recoveryGeneration) return;
            if (recoveryTimer) clearTimeout(recoveryTimer);
            recoveryTimer = setTimeout(function() {
                recoveryTimer = null;
                if (generation !== recoveryGeneration || !resultEl || !resultEl.isConnected) return;
                _attemptRecovery(attempt + 1);
            }, RECOVERY_RETRY_MS);
        };

        var _showSubmitted = function(attempt) {
            if (generation !== recoveryGeneration) return;
            resultEl.innerHTML = _renderSubmittedState(t, creature, spell);
            _bindResultActions(function() { _attemptRecovery(0); });
            _scheduleRetry(attempt || 0);
        };

        var _fetchBlock = function(num, attempt) {
            var loader = HistorySource.getProofBlock || HistorySource.getBlock;
            loader.call(HistorySource, num, function(err, block) {
                if (generation !== recoveryGeneration) return;
                if (err || !block) {
                    console.log('Paid hunt proof block unavailable; leaving result pending');
                    _showSubmitted(attempt);
                    return;
                }
                pendingHunt.blockNum = num;
                _savePendingHunt(pendingHunt);
                // The previous block id is deterministic and preserved by archive mirrors.
                var entropy = block.previous || block.block_id || '';
                _doResolve(entropy, num, block);
            });
        };

        var _attemptRecovery = function(attempt) {
            retryCount = attempt || 0;
            if (generation !== recoveryGeneration) return;
            if (Number(pendingHunt.blockNum || blockNum || 0) > 0) {
                _fetchBlock(Number(pendingHunt.blockNum || blockNum), retryCount);
                return;
            }
            HistorySource.findAccountAction(user, VizMagicConfig.PROTOCOLS.VM, VizMagicConfig.ACTION_TYPES.HUNT, function(err, candidate) {
                if (generation !== recoveryGeneration) return;
                if (err || !candidate) {
                    _showSubmitted(retryCount);
                    return;
                }
                pendingHunt.blockNum = Number(candidate.blockNum || 0);
                pendingHunt.txId = String(candidate.txId || pendingHunt.txId || '');
                if (!pendingHunt.blockNum) {
                    _showSubmitted(retryCount);
                    return;
                }
                _savePendingHunt(pendingHunt);
                _fetchBlock(pendingHunt.blockNum, retryCount);
            }, function(candidate) {
                var data = _huntCandidateData(candidate);
                if (candidate.sender !== user || data.creature !== creature.id || data.spell !== spell.id ||
                        Number(data.energy || 0) !== Number(playerEnergy || 0)) return false;
                if (pendingHunt.submittedAfterBlock && Number(candidate.blockNum || 0) <= Number(pendingHunt.submittedAfterBlock)) return false;
                if (pendingHunt.txId && candidate.txId && pendingHunt.txId !== candidate.txId) return false;
                return true;
            });
        };

        _showSubmitted(0);
        _attemptRecovery(0);
    }

    function _renderCombatResult(t, result, creature) {
        var html = '<div class="combat-result ' + (result.victory ? 'victory' : 'defeat') + '">';
        html += '<h2>' + (result.victory ? t('hunt_victory') : t('hunt_defeat')) + '</h2>';
        html += '<p>' + creature.name + ' (Lv' + result.creatureLevel + ')</p>';
        if (result.critical) html += '<p class="critical">\u26A1 Critical Hit!</p>';
        html += '<p>' + t('hunt_damage_dealt') + ': ' + result.damageDealt + '</p>';
        html += '<p>' + t('hunt_damage_taken') + ': ' + result.damageTaken + '</p>';
        if (result.victory) {
            html += '<p>' + t('hunt_xp_gained') + ': ' + result.xpGained + '</p>';
            if (result.loot.length > 0) {
                html += '<h3>' + t('hunt_loot') + '</h3>';
                for (var i = 0; i < result.loot.length; i++) {
                    html += '<p class="' + Helpers.rarityClass(result.loot[i].rarity) + '">' +
                        ItemSystem.getRarityInfo(result.loot[i].rarity).symbol + ' ' + result.loot[i].name + '</p>';
                }
            }
        }
        html += '<button class="btn btn-primary" id="btn-hunt-again">' + t('hunt_again') + '</button>';
        html += '<button class="btn btn-secondary" id="btn-hunt-home">' + t('hunt_home') + '</button>';
        html += '</div>';
        return html;
    }

    function _renderPendingState(t, creature, spell, showHome, huntEnergy) {
        var html = '<div class="combat-result pending">' +
            '<h2>' + t('hunt_pending_title') + '</h2>' +
            '<p>' + Helpers.escapeHtml(creature.name) + '</p>' +
            '<p>' + Helpers.escapeHtml(spell.name) + '</p>' +
            (huntEnergy ? '<p>' + t('hunt_mana_badge', {cost: Helpers.bpToPercent(huntEnergy)}) + '</p>' : '') +
            '<p>' + t('hunt_pending_text') + '</p>';

        if (showHome) {
            html += '<button class="btn btn-secondary" id="btn-hunt-home">' + t('hunt_home') + '</button>';
        }

        html += '</div>';
        return html;
    }

    function _renderSubmittedState(t, creature, spell) {
        return '<div class="combat-result pending">' +
            '<h2>' + t('hunt_submitted_title') + '</h2>' +
            '<p>' + Helpers.escapeHtml(creature.name) + '</p>' +
            '<p>' + Helpers.escapeHtml(spell.name) + '</p>' +
            '<p>' + t('hunt_submitted_text') + '</p>' +
            '<button class="btn btn-primary" id="btn-hunt-retry">' + t('hunt_retry_result') + '</button>' +
            '<button class="btn btn-secondary" id="btn-hunt-home">' + t('hunt_home') + '</button>' +
            '</div>';
    }

    function _renderBlockedState(t, creature, spell, broadcastErr) {
        var reason = '';
        if (broadcastErr && broadcastErr.message === 'hunt_requires_chain_target') {
            reason = t('hunt_blocked_no_chain_target');
        } else {
            reason = t('hunt_blocked_text');
        }

        return '<div class="combat-result defeat">' +
            '<h2>' + t('hunt_blocked_title') + '</h2>' +
            '<p>' + Helpers.escapeHtml(creature.name) + '</p>' +
            '<p>' + Helpers.escapeHtml(spell.name) + '</p>' +
            '<p>' + reason + '</p>' +
            '<button class="btn btn-primary" id="btn-hunt-again">' + t('hunt_again') + '</button>' +
            '<button class="btn btn-secondary" id="btn-hunt-home">' + t('hunt_home') + '</button>' +
            '</div>';
    }

    function _bindResultActions(retryCallback) {
        var againBtn = Helpers.$('btn-hunt-again');
        var retryBtn = Helpers.$('btn-hunt-retry');
        var homeBtn = Helpers.$('btn-hunt-home');

        if (againBtn) {
            againBtn.addEventListener('click', function() {
                _clearPendingHunt(VizAccount.getCurrentUser());
                render();
            });
        }
        if (retryBtn && retryCallback) {
            retryBtn.addEventListener('click', retryCallback);
        }
        if (homeBtn) {
            homeBtn.addEventListener('click', function() {
                _cancelRecovery();
                Helpers.EventBus.emit('navigate', 'home');
            });
        }
    }

    return { render: render };
})();
