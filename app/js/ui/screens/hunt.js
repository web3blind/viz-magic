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

        // Simulate combat with a pseudo block hash
        var user = VizAccount.getCurrentUser();
        var ch = StateEngine.getCharacter(user) || CharacterSystem.createCharacter(user || 'demo', 'Demo Mage', 'embercaster');
        var creature = GameCreatures.getCreature(selectedCreature);
        var spell = GameSpells.getSpell(selectedSpell);

        // Generate pseudo block hash for demo
        var pseudoHash = Date.now().toString(16) + Math.random().toString(16).substring(2);
        while (pseudoHash.length < 40) pseudoHash += '0';

        var result = CombatSystem.resolveHunt(ch, creature, spell, pseudoHash, 0, 10000);

        SoundManager.play(result.victory ? 'victory' : 'defeat');
        SoundManager.vibrate(result.victory ? 'medium' : 'triple');
        A11y.announceCombatResult(result, creature.name);

        var html = '<div class="combat-result ' + (result.victory ? 'victory' : 'defeat') + '">';
        html += '<h2>' + (result.victory ? t('hunt_victory') : t('hunt_defeat')) + '</h2>';
        html += '<p>' + creature.name + ' (Lv' + result.creatureLevel + ')</p>';
        if (result.critical) html += '<p class="critical">\u26A1 Critical Hit!</p>';
        html += '<p>Damage dealt: ' + result.damageDealt + '</p>';
        html += '<p>Damage taken: ' + result.damageTaken + '</p>';
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

        resultEl.innerHTML = html;

        Helpers.$('btn-hunt-again').addEventListener('click', function() { render(); });
        Helpers.$('btn-hunt-home').addEventListener('click', function() { Helpers.EventBus.emit('navigate', 'home'); });
    }

    return { render: render };
})();