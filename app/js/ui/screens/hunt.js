/**
 * Viz Magic — PvE Hunt Combat Screen
 */
var HuntScreen = (function() {
    'use strict';

    var selectedCreature = null;
    var selectedSpell = null;

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-hunt');
        if (!el) return;

        var user = VizAccount.getCurrentUser();
        var ch = StateEngine.getCharacter(user);

        // Auto-restore HP between hunts (rest at camp)
        if (ch && ch.hp <= 0 && ch.maxHp) {
            ch.hp = ch.maxHp;
        } else if (ch && ch.hp <= 0) {
            ch.hp = GameFormulas.calculateMaxHp(ch.className, ch.level, CharacterSystem.getTotalStat(ch, 'res'));
            ch.maxHp = ch.hp;
        }
        var zone = (ch && ch.currentZone) || 'commons_first_light';
        var creatures = GameCreatures.getCreaturesForZone(zone);
        var spells = ch ? GameSpells.getAvailableSpells(ch.className, ch.level) : [];

        selectedCreature = null;
        selectedSpell = null;

        var html = '<div class="hunt-screen">' +
            '<h1>' + t('hunt_title') + '</h1>' +
            '<h2>' + t('hunt_choose_creature') + '</h2>' +
            '<div class="creature-list" role="radiogroup" aria-label="' + t('hunt_choose_creature') + '">';

        for (var i = 0; i < creatures.length; i++) {
            var c = creatures[i];
            html += '<button class="creature-card" data-id="' + c.id + '" role="radio" aria-checked="false" ' +
                'aria-label="' + c.name + '. Level ' + c.minLevel + ' to ' + c.maxLevel + '">' +
                '<span class="creature-name">' + c.name + '</span>' +
                '<span class="creature-level">Lv ' + c.minLevel + '-' + c.maxLevel + '</span>' +
                '</button>';
        }

        html += '</div><h2>' + t('hunt_choose_spell') + '</h2>' +
            '<div class="spell-grid" role="radiogroup" aria-label="' + t('hunt_choose_spell') + '">';

        for (var j = 0; j < spells.length; j++) {
            var s = spells[j];
            html += '<button class="spell-btn" data-id="' + s.id + '" role="radio" aria-checked="false" ' +
                'aria-label="' + s.name + '. ' + t('hunt_mana_cost', {cost: Math.floor(s.manaCost/100)}) + '" ' +
                'style="border-color:' + Helpers.schoolColor(s.school) + '">' +
                '<span class="spell-name">' + s.name + '</span>' +
                '<span class="spell-cost">' + Math.floor(s.manaCost/100) + '% MP</span>' +
                '</button>';
        }

        html += '</div>' +
            '<button class="btn btn-primary btn-large" id="btn-attack" disabled>' + t('hunt_attack') + '</button>' +
            '<div id="hunt-result" aria-live="assertive"></div>' +
            '</div>';

        el.innerHTML = html;
        _bindEvents(el);
    }

    function _bindEvents(el) {
        var creatureCards = el.querySelectorAll('.creature-card');
        for (var i = 0; i < creatureCards.length; i++) {
            creatureCards[i].addEventListener('click', function() {
                selectedCreature = this.getAttribute('data-id');
                SoundManager.play('tap');
                for (var k = 0; k < creatureCards.length; k++) {
                    creatureCards[k].classList.remove('selected');
                    creatureCards[k].setAttribute('aria-checked', 'false');
                }
                this.classList.add('selected');
                this.setAttribute('aria-checked', 'true');
                _checkReady();
            });
        }

        var spellBtns = el.querySelectorAll('.spell-btn');
        for (var j = 0; j < spellBtns.length; j++) {
            spellBtns[j].addEventListener('click', function() {
                selectedSpell = this.getAttribute('data-id');
                SoundManager.play('tap');
                for (var k = 0; k < spellBtns.length; k++) {
                    spellBtns[k].classList.remove('selected');
                    spellBtns[k].setAttribute('aria-checked', 'false');
                }
                this.classList.add('selected');
                this.setAttribute('aria-checked', 'true');
                _checkReady();
            });
        }

        Helpers.$('btn-attack').addEventListener('click', _doHunt);
    }

    function _checkReady() {
        Helpers.$('btn-attack').disabled = !(selectedCreature && selectedSpell);
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
                creature.npcAccount || '',
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

    /**
     * Fetch block data from chain, extract witness_signature as Fate Entropy,
     * then resolve combat deterministically.
     * If block_num is 0 or fetch fails, falls back to DGP head block.
     */
    function _resolveHuntFromBlock(blockNum, ch, creature, spell, playerEnergy, user, resultEl, t) {
        var _doResolve = function(fateEntropy, finalBlockNum) {
            console.log('Hunt resolving with Fate Entropy (witness_signature):', fateEntropy.substring(0, 32) + '..., block:', finalBlockNum);

            var result = CombatSystem.resolveHunt(ch, creature, spell, fateEntropy, finalBlockNum, playerEnergy);

            // Apply results to local state
            var state = StateEngine.getState();
            if (result.victory) {
                CharacterSystem.addXp(ch, result.xpGained);
                if (!state.inventories[user]) state.inventories[user] = [];
                for (var li = 0; li < result.loot.length; li++) {
                    var lootItem = ItemSystem.createItem(
                        result.loot[li].type, user, result.loot[li].rarity, finalBlockNum, '', true
                    );
                    state.inventories[user].push(lootItem);
                }
                if (typeof QuestSystem !== 'undefined' && state.quests && state.quests[user]) {
                    QuestSystem.updateQuestProgress(state.quests[user], 'hunt', { target: selectedCreature, count: 1 });
                }
            } else {
                // Defeat: partial XP (25%)
                var defeatXp = Math.floor(GameFormulas.huntXp(ch.level, result.creatureLevel, creature.baseXp || 50) / 4);
                if (defeatXp > 0) CharacterSystem.addXp(ch, defeatXp);
            }

            ch.hp = result.hpRemaining;
            if (ch.hp <= 0) ch.hp = 0;

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