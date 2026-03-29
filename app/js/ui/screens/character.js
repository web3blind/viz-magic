/**
 * Viz Magic — Character Sheet Screen
 */
var CharacterScreen = (function() {
    'use strict';

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-character');
        if (!el) return;

        var user = VizAccount.getCurrentUser();
        var ch = StateEngine.getCharacter(user);
        if (!ch) { ch = { name: user || 'Unknown', className: 'embercaster', level: 1, pot: 10, res: 6, swf: 8, int: 7, for_: 5, coreBonus: 0, spells: ['firebolt'], maxHp: 100, hp: 100 }; }

        el.innerHTML =
            '<div class="character-sheet">' +
                '<h1>' + t('char_title') + '</h1>' +
                '<div class="char-header">' +
                    '<span class="char-icon" aria-hidden="true">' + Helpers.classIcon(ch.className) + '</span>' +
                    '<div><h2>' + Helpers.escapeHtml(ch.name) + '</h2>' +
                    '<p>' + t('class_' + ch.className) + ' \u2022 ' + t('home_level') + ' ' + ch.level + '</p></div>' +
                '</div>' +
                ProgressBar.create({label:'HP', value:ch.hp, max:ch.maxHp, color:'#e53935'}) +
                '<h2>' + t('char_stats') + '</h2>' +
                '<div class="stats-list">' +
                    _statRow(t('char_potency'), ch.pot + ch.coreBonus) +
                    _statRow(t('char_resilience'), ch.res + ch.coreBonus) +
                    _statRow(t('char_swiftness'), ch.swf) +
                    _statRow(t('char_intellect'), ch.int) +
                    _statRow(t('char_fortune'), ch.for_) +
                '</div>' +
                '<h2>' + t('char_core') + '</h2>' +
                '<p>' + t('char_core_power') + ': ' + Helpers.formatNumber(ch.coreBonus) + '</p>' +
                '<h2>' + t('char_spells') + '</h2>' +
                _renderSpells(ch) +
            '</div>';
    }

    function _statRow(label, value) {
        return '<div class="stat-row"><span class="stat-label">' + label + '</span><span class="stat-value">' + value + '</span></div>';
    }

    function _renderSpells(ch) {
        var html = '<div class="spell-list">';
        for (var i = 0; i < ch.spells.length; i++) {
            var spell = GameSpells.getSpell(ch.spells[i]);
            if (spell) {
                html += '<div class="spell-item" style="border-left:3px solid ' + Helpers.schoolColor(spell.school) + '">' +
                    '<strong>' + spell.name + '</strong><br>' +
                    '<small>' + spell.description + '</small>' +
                    '</div>';
            }
        }
        return html + '</div>';
    }

    return { render: render };
})();