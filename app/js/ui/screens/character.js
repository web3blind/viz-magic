/**
 * Viz Magic — Character Sheet Screen
 */
var CharacterScreen = (function() {
    'use strict';

    var CHARACTER_HP_DISPLAY_MAX = 1000;
    var CHARACTER_XP_DISPLAY_MAX = 10000;
    var VIZ_ENERGY_DOC_URL = 'https://viz-blockchain.github.io/viz-cpp-node/introduction/key-concepts#energy-system';

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-character');
        if (!el) return;

        var user = VizAccount.getCurrentUser();
        var ch = StateEngine.getCharacter(user);
        if (!ch) {
            el.innerHTML = '<div class="character-sheet"><h1>' + t('nav_character') + '</h1><div class="empty-state">' + t('loading') + '</div></div>';
            return;
        }
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
                '<h1 class="character-title-line">' + _renderAvatarMark(ch, ch.name || user, 'screen-title-icon profile-title-avatar vmagic-breathe') + ' <span class="character-title-name">' + Helpers.escapeHtml(ch.name || user || '') + '</span></h1>' +
                '<div class="char-header">' +
                    '<div><h2><span class="char-icon character-title-class-icon vmagic-breathe" aria-hidden="true">' + Helpers.classIcon(ch.className || 'embercaster') + '</span> ' + _classGuideName(ch.className, t) + ' <span class="title-dot" aria-hidden="true">•</span> <span class="character-title-level">' + t('home_level') + ' ' + ch.level + '</span></h2></div>' +
                '</div>' +
                ProgressBar.create({id:'char-mana-bar', label:t('home_mana'), labelHtml:Helpers.icon('mana', 'vital-label-icon vm-icon vmagic-breathe') + ' ' + t('home_mana'), value:0, max:100, color:'#2196f3', href: VIZ_ENERGY_DOC_URL, ariaLabel: t('char_mana_external_aria')}) +
                '<p class="quest-desc character-vital-note">' + t('char_mana_explainer') + '</p>' +
                ProgressBar.create({id:'char-hp-bar', label:'HP', labelHtml:Helpers.icon('hp', 'vital-label-icon vm-icon vmagic-breathe') + ' HP', value:ch.hp, max:ch.maxHp, displayValue:hpShown, displayMax:CHARACTER_HP_DISPLAY_MAX, color:'#e53935', button: true, ariaLabel: t('char_hp_button_aria')}) +
                '<p class="quest-desc character-vital-note">' + t('char_hp_explainer') + '</p>' +
                ProgressBar.create({id:'char-xp-bar', label:'XP', labelHtml:Helpers.icon('xp', 'vital-label-icon vm-icon vmagic-breathe') + ' XP', value:xpCurrent, max:xpNeeded, displayValue:xpShown, displayMax:CHARACTER_XP_DISPLAY_MAX, color:'#ffc107', button: true, ariaLabel: t('char_xp_button_aria')}) +
                '<p class="quest-desc character-vital-note">' + t('char_xp_explainer') + '</p>' +
                '<h2>' + Helpers.icon('stats', 'section-icon vmagic-breathe') + ' ' + t('char_stats') + '</h2>' +
                '<div class="stats-list">' +
                    _statRow(t('char_potency'), ch.pot || 0, corePerStat, 0, totalPot) +
                    _statRow(t('char_resilience'), ch.res || 0, corePerStat, 0, totalRes) +
                    _statRow(t('char_swiftness'), ch.swf || 0, corePerStat, 0, totalSwf) +
                    _statRow(t('char_intellect'), ch.int || 0, corePerStat, 0, totalInt) +
                    _statRow(t('char_fortune'), ch.for_ || 0, corePerStat, 0, totalFor) +
                '</div>' +
                '<p class="quest-desc">' + t('char_stats_growth_hint') + '</p>' +
                '<h2>' + Helpers.icon('core', 'section-icon vmagic-breathe') + ' ' + t('char_core') + '</h2>' +
                '<p>' + t('char_core_power') + ': ' + Helpers.formatNumber(ch.coreBonus) + '</p>' +
                '<p>' + t('char_core_per_stat', { value: corePerStat }) + '</p>' +
                '<h2>' + Helpers.icon('spells', 'section-icon vmagic-breathe') + ' ' + t('char_spells') + '</h2>' +
                _renderSpells(ch) +
            '</div>';

        _bindEvents(el);

        if (user) {
            VizAccount.getAccount(user, function(err, accountData) {
                if (!err && accountData) {
                    var currentEnergy = VizAccount.calculateCurrentEnergy(accountData);
                    ProgressBar.update('char-mana-bar', currentEnergy / 100, 100);
                    _refreshProfileAvatar(user, ch, accountData);
                }
            });
        }
    }

    function _refreshProfileAvatar(user, ch, accountData) {
        if (!user || !ch || !VizAccount.getProfileAvatar) return;
        var freshAvatar = VizAccount.getProfileAvatar(accountData) || '';
        if ((ch.avatarUrl || '') === freshAvatar) return;
        ch.avatarUrl = freshAvatar;
        var header = document.querySelector('#screen-character .char-header');
        if (!header) return;
        var titleAvatar = document.querySelector('#screen-character .profile-title-avatar');
        if (titleAvatar && titleAvatar.parentNode) {
            titleAvatar.outerHTML = _renderAvatarMark(ch, ch.name || user, 'screen-title-icon profile-title-avatar vmagic-breathe');
        }
    }

    function _renderAvatarMark(ch, name, extraClass) {
        ch = ch || {};
        if (ch.avatarUrl) return '<img class="account-avatar defaultable-avatar ' + (extraClass || '') + '" src="' + Helpers.escapeHtml(ch.avatarUrl) + '" alt="" aria-hidden="true" loading="lazy" decoding="async">';
        return '<span class="account-avatar default-avatar ' + (extraClass || '') + '" aria-hidden="true">' + Helpers.classIcon(ch.className || 'embercaster') + '</span>';
    }

    function _scaleForDisplay(value, max, displayMax) {
        if (!max || max <= 0) return 0;
        var shown = Math.round(Math.max(0, value) * displayMax / max);
        if (shown > displayMax) shown = displayMax;
        return shown;
    }

    function _statRow(label, baseValue, corePerStat, equipBonus, totalValue) {
        return '<div class="stat-row"><span class="stat-label">' + label + '</span>' +
            '<span class="stat-formula">' + baseValue + ' + ' + corePerStat + ' + ' + equipBonus + ' =</span>' +
            '<span class="stat-value">' + totalValue + '</span></div>';
    }

    function _classGuideName(className, t) {
        var names = {
            stonewarden: 'Каменный Страж',
            embercaster: 'Огнеплёт',
            moonrunner: 'Лунный Странник',
            bloomsage: 'Цветомудрец'
        };
        if (typeof LangEN !== 'undefined' && Helpers.getCurrentLang && Helpers.getCurrentLang() === 'en') {
            names = {
                stonewarden: 'Stonewarden',
                embercaster: 'Embercaster',
                moonrunner: 'Moonrunner',
                bloomsage: 'Bloomsage'
            };
        }
        return names[className] || t('class_' + className);
    }

    function _bindEvents(el) {
        var hpBar = el.querySelector('#char-hp-bar');
        if (hpBar) hpBar.addEventListener('click', function() { _showVitalDetails('hp'); });
        var xpBar = el.querySelector('#char-xp-bar');
        if (xpBar) xpBar.addEventListener('click', function() { _showVitalDetails('xp'); });

        var buttons = el.querySelectorAll('.spell-item-button');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', function() {
                _showSpellDetails(this.getAttribute('data-spell-id'));
            });
        }
    }

    function _renderSpells(ch) {
        var t = Helpers.t;
        var html = '<div class="spell-list">';
        for (var i = 0; i < ch.spells.length; i++) {
            var spell = GameSpells.getSpell(ch.spells[i]);
            if (spell) {
                var descKey = 'spell_' + spell.id + '_desc';
                var desc = t(descKey);
                if (!desc || desc === descKey) desc = spell.description;
                html += '<button type="button" class="spell-item spell-item-button ' + Helpers.schoolClass(spell.school) + '" data-spell-id="' + spell.id + '" aria-label="' + Helpers.escapeHtml(spell.name + '. ' + desc) + '">' +
                    '<strong>' + Helpers.escapeHtml(spell.name) + '</strong><br>' +
                    '<small>' + Helpers.escapeHtml(desc) + '</small>' +
                    '</button>';
            }
        }
        return html + '</div>';
    }

    function _showSpellDetails(spellId) {
        var t = Helpers.t;
        var spell = GameSpells.getSpell(spellId);
        if (!spell) return;
        var body = '<div class="modal-content spell-detail-modal">' +
            '<h2 class="modal-title">' + Helpers.icon('spells', 'spell-detail-title-icon vmagic-breathe') + ' ' + t('char_spell_details') + '</h2>' +
            '<div class="modal-body">' +
            '<dl class="spell-detail-list">' +
            '<dt>' + t('char_spell_school') + '</dt><dd>' + Helpers.escapeHtml(spell.school) + '</dd>' +
            '<dt>' + t('char_spell_mana_cost') + '</dt><dd>' + Helpers.bpToPercent(spell.manaCost || 0) + ' Mana</dd>' +
            '<dt>' + t('char_spell_level_req') + '</dt><dd>' + (spell.levelReq || 1) + '</dd>' +
            '<dt>' + t('char_spell_multiplier') + '</dt><dd>×' + ((spell.multiplier || 1000) / 1000).toFixed(2) + '</dd>' +
            '<dt>' + t('char_spell_intent') + '</dt><dd>' + Helpers.escapeHtml(spell.intent || '') + '</dd>' +
            '<dt>' + t('char_spell_effect') + '</dt><dd>' + Helpers.escapeHtml(spell.effect || '') + '</dd>' +
            '</dl></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-primary modal-close">' + t('char_spell_close') + '</button></div>' +
            '</div>';
        Modal.show(body);
    }


    function _showVitalDetails(kind) {
        var t = Helpers.t;
        var iconName = kind === 'hp' ? 'hp' : 'xp';
        var title = kind === 'hp' ? t('char_hp_modal_title') : t('char_xp_modal_title');
        var bodyKey = kind === 'hp' ? 'char_hp_modal_body' : 'char_xp_modal_body';
        var body = '<div class="modal-content character-vital-modal">' +
            '<h2 class="modal-title">' + Helpers.icon(iconName, 'modal-title-icon vmagic-breathe') + ' ' + title + '</h2>' +
            '<div class="modal-body"><p>' + t(bodyKey) + '</p></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-primary modal-close">' + t('char_spell_close') + '</button></div>' +
            '</div>';
        Modal.show(body);
    }

    return { render: render };
})();