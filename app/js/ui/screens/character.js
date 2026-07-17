/**
 * Viz Magic — Character Sheet Screen
 */
var CharacterScreen = (function() {
    'use strict';

    var CHARACTER_HP_DISPLAY_MAX = 5000;
    var CHARACTER_XP_DISPLAY_MAX = 3000;

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-character');
        if (!el) return;

        var user = VizAccount.getCurrentUser();
        var ch = StateEngine.getCharacter(user);
        if (!ch) { ch = { name: user || 'Unknown', className: 'embercaster', level: 1, pot: 10, res: 6, swf: 8, int: 7, for_: 5, coreBonus: 0, spells: ['firebolt'], maxHp: 100, hp: 100 }; }
        ch.coreBonus = ch.coreBonus || 0;
        ch.spells = ch.spells || [];

        var corePerStat = Math.floor((ch.coreBonus || 0) / 5);
        var totalPot = (typeof CharacterSystem !== 'undefined' && CharacterSystem.getTotalStat) ? CharacterSystem.getTotalStat(ch, 'pot') : ((ch.pot || 0) + corePerStat);
        var totalRes = (typeof CharacterSystem !== 'undefined' && CharacterSystem.getTotalStat) ? CharacterSystem.getTotalStat(ch, 'res') : ((ch.res || 0) + corePerStat);
        var totalSwf = (typeof CharacterSystem !== 'undefined' && CharacterSystem.getTotalStat) ? CharacterSystem.getTotalStat(ch, 'swf') : ((ch.swf || 0) + corePerStat);
        var totalInt = (typeof CharacterSystem !== 'undefined' && CharacterSystem.getTotalStat) ? CharacterSystem.getTotalStat(ch, 'int') : ((ch.int || 0) + corePerStat);
        var totalFor = (typeof CharacterSystem !== 'undefined' && CharacterSystem.getTotalStat) ? CharacterSystem.getTotalStat(ch, 'for_') : ((ch.for_ || 0) + corePerStat);
        var xpNeeded = GameFormulas.xpForLevel(ch.level + 1) || 1000;
        var xpCurrent = (ch.xp || 0) - GameFormulas.totalXpForLevel(ch.level);
        if (xpCurrent < 0) xpCurrent = 0;
        var hpShown = _scaleForDisplay(ch.hp, ch.maxHp, CHARACTER_HP_DISPLAY_MAX);
        var xpShown = _scaleForDisplay(xpCurrent, xpNeeded, CHARACTER_XP_DISPLAY_MAX);

        el.innerHTML =
            '<div class="character-sheet">' +
                '<h1><span class="screen-title-icon vmagic-breathe" aria-hidden="true">🧙</span> ' + t('char_title') + '</h1>' +
                '<div class="char-header">' +
                    '<span class="char-icon vmagic-breathe" aria-hidden="true">' + Helpers.classIcon(ch.className) + '</span>' +
                    '<div><h2>' + Helpers.escapeHtml(ch.name) + '</h2>' +
                    '<p>' + t('class_' + ch.className) + ' \u2022 ' + t('home_level') + ' ' + ch.level + '</p></div>' +
                '</div>' +
                ProgressBar.create({id:'char-hp-bar', label:'❤️ HP', value:ch.hp, max:ch.maxHp, displayValue:hpShown, displayMax:CHARACTER_HP_DISPLAY_MAX, color:'#e53935'}) +
                '<p class="quest-desc character-vital-note">' + t('char_hp_explainer') + '</p>' +
                ProgressBar.create({id:'char-xp-bar', label:'⭐ XP', value:xpCurrent, max:xpNeeded, displayValue:xpShown, displayMax:CHARACTER_XP_DISPLAY_MAX, color:'#ffc107'}) +
                '<p class="quest-desc character-vital-note">' + t('char_xp_explainer') + '</p>' +
                ProgressBar.create({id:'char-mana-bar', label:'⚡ ' + t('home_mana'), value:0, max:100, color:'#2196f3'}) +
                '<p class="quest-desc character-vital-note">' + t('char_mana_explainer') + '</p>' +
                '<h2><span class="section-icon vmagic-breathe" aria-hidden="true">📊</span> ' + t('char_stats') + '</h2>' +
                '<div class="stats-list">' +
                    _statRow(t('char_potency'), totalPot) +
                    _statRow(t('char_resilience'), totalRes) +
                    _statRow(t('char_swiftness'), totalSwf) +
                    _statRow(t('char_intellect'), totalInt) +
                    _statRow(t('char_fortune'), totalFor) +
                '</div>' +
                '<p class="quest-desc">' + t('char_stats_growth_hint') + '</p>' +
                '<h2><span class="section-icon vmagic-breathe" aria-hidden="true">💠</span> ' + t('char_core') + '</h2>' +
                '<p>' + t('char_core_power') + ': ' + Helpers.formatNumber(ch.coreBonus) + '</p>' +
                '<p>' + t('char_core_per_stat', { value: corePerStat }) + '</p>' +
                '<h2><span class="section-icon vmagic-breathe" aria-hidden="true">🪄</span> ' + t('char_spells') + '</h2>' +
                _renderSpells(ch) +
            '</div>';

        if (user) {
            VizAccount.getAccount(user, function(err, accountData) {
                if (!err && accountData) {
                    var currentEnergy = VizAccount.calculateCurrentEnergy(accountData);
                    ProgressBar.update('char-mana-bar', currentEnergy / 100, 100);
                }
            });
        }
    }

    function _scaleForDisplay(value, max, displayMax) {
        if (!max || max <= 0) return 0;
        var shown = Math.round(Math.max(0, value) * displayMax / max);
        if (shown > displayMax) shown = displayMax;
        return shown;
    }

    function _statRow(label, value) {
        return '<div class="stat-row"><span class="stat-label">' + label + '</span><span class="stat-value">' + value + '</span></div>';
    }

    function _renderSpells(ch) {
        var t = Helpers.t;
        var html = '<div class="spell-list">';
        for (var i = 0; i < ch.spells.length; i++) {
            var spell = GameSpells.getSpell(ch.spells[i]);
            if (spell) {
                var descKey = 'spell_' + spell.id + '_desc';
                var desc = t(descKey);
                // Fall back to English description if i18n key not found
                if (!desc || desc === descKey) desc = spell.description;
                html += '<div class="spell-item ' + Helpers.schoolClass(spell.school) + '">' +
                    '<strong>' + spell.name + '</strong><br>' +
                    '<small>' + desc + '</small>' +
                    '</div>';
            }
        }
        return html + '</div>';
    }

    return { render: render };
})();