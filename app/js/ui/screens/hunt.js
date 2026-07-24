/**
 * Viz Magic — PvE Hunt Combat Screen
 */
var HuntScreen = (function() {
    'use strict';

    var selectedCreature = null;
    var selectedSpell = null;
    var stoneItemId = null;
    var HUNT_HP_DISPLAY_MAX = 5000;

    function render() {
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
        var zone = (ch && ch.currentZone) || 'commons_first_light';
        var creatures = _filterCreaturesForLevel(GameCreatures.getCreaturesForZone(zone), ch);
        var spells = ch ? GameSpells.getAvailableSpells(ch.className, ch.level) : [];

        selectedCreature = null;
        selectedSpell = null;

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
                    'aria-label="' + c.name + '. Level ' + c.minLevel + ' to ' + c.maxLevel + '">' +
                    '<span class="creature-name">' + c.name + '</span>' +
                    '<span class="creature-level">Lv ' + c.minLevel + '-' + c.maxLevel + '</span>' +
                    '</button>';
            }

            html += '</div>';
        }

        html += '<h2><span class="section-icon vmagic-breathe" aria-hidden="true">🪄</span> ' + t('hunt_choose_spell') + '</h2>' +
            '<p class="quest-desc">' + t('hunt_min_mana_hint') + '</p>' +
            '<div class="spell-grid" role="radiogroup" aria-label="' + t('hunt_choose_spell') + '">';

        for (var j = 0; j < spells.length; j++) {
            var s = spells[j];
            var spellTooWeak = (s.manaCost || 0) < VizMagicConfig.ENERGY.MIN_HUNT_COST;
            html += '<button class="spell-btn ' + Helpers.schoolClass(s.school) + (spellTooWeak ? ' spell-btn-disabled' : '') + '" data-id="' + s.id + '" role="radio" aria-checked="false" ' +
                'tabindex="' + (j === 0 ? '0' : '-1') + '" type="button" ' +
                (spellTooWeak ? 'disabled aria-disabled="true" ' : '') +
                'aria-label="' + s.name + '. ' + t('hunt_mana_cost', {cost: Helpers.bpToPercent(s.manaCost)}) + (spellTooWeak ? '. ' + t('hunt_spell_too_weak') : '') + '">' +
                '<span class="spell-name">' + s.name + '</span>' +
                '<span class="spell-cost">' + Helpers.manaCost(s.manaCost) + '</span>' +
                (spellTooWeak ? '<span class="spell-warning">' + t('hunt_spell_too_weak') + '</span>' : '') +
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
            armageddonSectionHtml += '<button class="btn btn-danger armageddon-locked-btn" type="button" data-armageddon-lock="stone" style="width:100%"><span class="armageddon-explosion-icon" aria-hidden="true">💥</span> ' + t('hunt_armageddon_launch') + '</button>';
        } else {
            armageddonSectionHtml += '<label class="armageddon-label">' +
                '<input type="checkbox" id="armageddon-confirm-cb"> ' +
                t('hunt_armageddon_confirm') + '</label>' +
                '<button class="btn btn-danger" id="btn-armageddon" disabled style="width:100%"><span class="armageddon-explosion-icon" aria-hidden="true">💥</span> ' +
                t('hunt_armageddon_launch') + '</button>';
        }
        armageddonSectionHtml += '</div>';

        html += armageddonSectionHtml +
            '<div id="hunt-result" aria-live="assertive"></div>' +
            '</div>';

        el.innerHTML = html;
        _bindEvents(el);
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
        for (var i = 0; i < creatures.length; i++) {
            var c = creatures[i];
            if (!c) continue;
            if ((c.minLevel || 1) <= level && (c.maxLevel || level) >= level) {
                out.push(c);
            }
        }
        return out;
    }

    function _bindEvents(el) {
        A11y.bindRadioGroup(el.querySelector('.creature-list[role="radiogroup"]'), '.creature-card', function(option) {
            selectedCreature = option.getAttribute('data-id');
            SoundManager.play('tap');
            _checkReady();
        });

        A11y.bindRadioGroup(el.querySelector('.spell-grid[role="radiogroup"]'), '.spell-btn', function(option) {
            selectedSpell = option.getAttribute('data-id');
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
        Helpers.$('btn-attack').disabled = !(selectedCreature && selectedSpell);
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

            if ((spell.manaCost || 0) < VizMagicConfig.ENERGY.MIN_HUNT_COST) {
                resultEl.innerHTML = '<p class="error">' + t('hunt_spell_too_weak') + '</p>';
                btn.disabled = false;
                return;
            }

            if (playerEnergy < spell.manaCost) {
                resultEl.innerHTML = '<p class="error">' + t('hunt_not_enough_mana') + '</p>';
                btn.disabled = false;
                return;
            }

            resultEl.innerHTML = _renderPendingState(t, creature, spell, true);
            SoundManager.play('tap');
            SoundManager.vibrate('light');

            VizBroadcast.huntAction(
                selectedCreature,
                ch.currentZone || 'commons_first_light',
                selectedSpell,
                spell.manaCost,
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
                    if (broadcastResult && broadcastResult.action) {
                        blockNum = broadcastResult.action.block_num || 0;
                    }

                    _resolveHuntFromBlock(blockNum, ch, creature, spell, playerEnergy, user, resultEl, t);
                }
            );
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
                    if (broadcastResult && broadcastResult.action) {
                        blockNum = broadcastResult.action.block_num || 0;
                    }

                    _resolveArmageddonFromBlock(blockNum, ch, creature, playerEnergy, user, stoneId, resultEl, t);
                }
            );
        });
    }

    function _resolveArmageddonFromBlock(blockNum, ch, creature, playerEnergy, user, stoneId, resultEl, t) {
        var _doResolve = function(fateEntropy, finalBlockNum) {
            // Route through state-engine — single authoritative path (same as hunt)
            var armaResult = StateEngine.processArmageddonResult(user, selectedCreature, stoneId, finalBlockNum);
            if (!armaResult) {
                resultEl.innerHTML = '<p class="error">' + t('hunt_armageddon_no_stone') + '</p>';
                return;
            }
            var xp = armaResult.xpGained;
            var xpResult = { levelsGained: armaResult.levelsGained };

            var state = StateEngine.getState();

            // Save checkpoint
            state.headBlock = finalBlockNum;
            CheckpointSystem.saveCheckpoint('global', finalBlockNum, state, function() {});

            // Update Grimoire
            VizAccount.updateGrimoire({ class: ch.className, name: ch.name, level: ch.level, xp: ch.xp }, function() {});

            SoundManager.play('victory');
            SoundManager.vibrate('triple');

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

        viz.api.getBlock(blockNum, function(err, block) {
            if (err || !block) {
                viz.api.getDynamicGlobalProperties(function(err2, dgp) {
                    if (err2 || !dgp) {
                        resultEl.innerHTML = '<p class="error">' + t('error_network') + '</p>';
                        return;
                    }
                    viz.api.getBlock(dgp.head_block_number, function(err3, b) {
                        var entropy = (!err3 && b) ? (b.witness_signature || b.previous || '') : '';
                        _doResolve(entropy, dgp.head_block_number);
                    });
                });
                return;
            }
            var entropy = block.witness_signature || block.previous || '';
            _doResolve(entropy, blockNum);
        });
    }

    /**
     * Fetch block data from chain, extract witness_signature as Fate Entropy,
     * then resolve combat deterministically.
     * If block_num is 0 or fetch fails, falls back to DGP head block.
     */
    function _resolveHuntFromBlock(blockNum, ch, creature, spell, playerEnergy, user, resultEl, t) {
        var _doResolve = function(fateEntropy, finalBlockNum) {
            console.log('Hunt resolving with Fate Entropy (witness_signature):', fateEntropy.substring(0, 32) + '..., block:', finalBlockNum);

            // Route through state-engine — single authoritative path for all item creation
            var result = StateEngine.processHuntResult(user, selectedCreature, selectedSpell, fateEntropy, finalBlockNum, playerEnergy);
            if (!result) {
                resultEl.innerHTML = '<p class="error">' + t('error_network') + '</p>';
                return;
            }

            // ch is a reference to the same object in worldState — already updated by processHuntResult
            var state = StateEngine.getState();

            // Record armageddon_stone drops on-chain for verifiability
            if (result.victory && result.loot) {
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

            // Update head block in state
            state.headBlock = finalBlockNum;

            // Persist to IndexedDB checkpoint (survives page reload)
            CheckpointSystem.saveCheckpoint('global', finalBlockNum, state, function(saveErr) {
                if (saveErr) {
                    console.log('Checkpoint save error:', saveErr);
                } else {
                    console.log('State checkpointed at block', finalBlockNum, '— XP:', ch.xp, 'Lv:', ch.level);
                }
            });

            // Update Grimoire on chain (cache hint for level/xp)
            VizAccount.updateGrimoire({
                class: ch.className,
                name: ch.name,
                level: ch.level,
                xp: ch.xp
            }, function(grimErr) {
                if (grimErr) {
                    console.log('Grimoire update error (non-fatal):', grimErr);
                } else {
                    console.log('Grimoire updated on chain: Lv', ch.level, 'XP', ch.xp);
                }
            });

            SoundManager.play(result.victory ? 'victory' : 'defeat');
            SoundManager.vibrate(result.victory ? 'medium' : 'triple');
            A11y.announceCombatResult(result, creature.name);

            resultEl.innerHTML = _renderCombatResult(t, result, creature);
            _bindResultActions();
        };

        var _fetchBlock = function(num) {
            viz.api.getBlock(num, function(err, block) {
                if (err || !block) {
                    console.log('get_block failed, falling back to DGP');
                    _fallbackDGP();
                    return;
                }
                // Use witness_signature as Fate Entropy — unforgeable, unique per block
                var entropy = block.witness_signature || block.previous || '';
                _doResolve(entropy, num);
            });
        };

        var _fallbackDGP = function() {
            viz.api.getDynamicGlobalProperties(function(err, dgp) {
                if (err || !dgp) {
                    // Ultimate fallback — should not happen if connected
                    console.log('DGP fallback also failed');
                    resultEl.innerHTML = _renderBlockedState(t, creature, spell, new Error('chain_unavailable'));
                    _bindResultActions();
                    return;
                }
                var headNum = dgp.head_block_number;
                _fetchBlock(headNum);
            });
        };

        if (blockNum > 0) {
            _fetchBlock(blockNum);
        } else {
            _fallbackDGP();
        }
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

    function _renderPendingState(t, creature, spell, showHome) {
        var html = '<div class="combat-result pending">' +
            '<h2>' + t('hunt_pending_title') + '</h2>' +
            '<p>' + Helpers.escapeHtml(creature.name) + '</p>' +
            '<p>' + Helpers.escapeHtml(spell.name) + '</p>' +
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
            '<button class="btn btn-primary" id="btn-hunt-again">' + t('hunt_again') + '</button>' +
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

    function _bindResultActions() {
        var againBtn = Helpers.$('btn-hunt-again');
        var homeBtn = Helpers.$('btn-hunt-home');

        if (againBtn) {
            againBtn.addEventListener('click', function() { render(); });
        }
        if (homeBtn) {
            homeBtn.addEventListener('click', function() { Helpers.EventBus.emit('navigate', 'home'); });
        }
    }

    return { render: render };
})();
