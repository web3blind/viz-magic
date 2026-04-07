/**
 * Viz Magic — Onboarding / Character Creation Flow
 * New flow: after successful VIZ login without grimoire,
 * the user only chooses a class for the existing VIZ account.
 */
var OnboardingScreen = (function() {
    'use strict';

    var selectedClass = '';
    var mageName = '';

    function render() {
        var el = Helpers.$('screen-onboarding');
        if (!el) return;
        _renderClassStep(el, Helpers.t);
    }

    function startForAccount(account) {
        selectedClass = '';
        mageName = (account || '').trim();
    }

    function _renderClassStep(el, t) {
        var classes = [
            { id: 'stonewarden', icon: '\uD83D\uDEE1\uFE0F', diff: t('class_difficulty_easy') },
            { id: 'embercaster', icon: '\uD83D\uDD25', diff: t('class_difficulty_easy') },
            { id: 'moonrunner',  icon: '\uD83C\uDF19', diff: t('class_difficulty_medium') },
            { id: 'bloomsage',   icon: '\uD83C\uDF3F', diff: t('class_difficulty_medium') }
        ];

        var html = '<div class="onboarding-step">' +
            '<h1>' + t('onboarding_class_title') + '</h1>' +
            '<p class="onboarding-text">' + t('onboarding_class_text').replace(/\n/g, '<br>') + '</p>' +
            '<p class="onboarding-text">' + t('onboarding_existing_account_notice', { account: mageName || '' }) + '</p>' +
            '<div class="class-grid" role="radiogroup" aria-label="' + t('onboarding_class_title') + '">';

        for (var i = 0; i < classes.length; i++) {
            var c = classes[i];
            var sel = c.id === selectedClass ? ' selected' : '';
            html += '<button class="class-card' + sel + '" role="radio" aria-checked="' + (c.id === selectedClass) + '" ' +
                'data-class="' + c.id + '" aria-label="' + t('class_' + c.id) + '. ' + t('class_' + c.id + '_desc') + '">' +
                '<span class="class-icon" aria-hidden="true">' + c.icon + '</span>' +
                '<h3>' + t('class_' + c.id) + '</h3>' +
                '<p class="class-quote">' + t('class_' + c.id + '_desc') + '</p>' +
                '<p class="class-detail">' + t('class_' + c.id + '_detail') + '</p>' +
                '<span class="class-diff">' + c.diff + '</span>' +
                '</button>';
        }

        html += '</div>' +
            '<div class="onboarding-buttons">' +
                '<button class="btn btn-secondary" id="btn-class-back">' + t('onboarding_back') + '</button>' +
                '<button class="btn btn-primary" id="btn-class-next" ' + (selectedClass ? '' : 'disabled') + '>' + t('onboarding_next') + '</button>' +
            '</div></div>';

        el.innerHTML = html;

        var cards = el.querySelectorAll('.class-card');
        for (var j = 0; j < cards.length; j++) {
            cards[j].addEventListener('click', function() {
                selectedClass = this.getAttribute('data-class');
                SoundManager.play('tap');
                for (var k = 0; k < cards.length; k++) {
                    cards[k].classList.remove('selected');
                    cards[k].setAttribute('aria-checked', 'false');
                }
                this.classList.add('selected');
                this.setAttribute('aria-checked', 'true');
                Helpers.$('btn-class-next').disabled = false;
            });
        }

        Helpers.$('btn-class-back').addEventListener('click', function() {
            Helpers.EventBus.emit('navigate', 'login');
        });

        Helpers.$('btn-class-next').addEventListener('click', function() {
            if (!selectedClass) return;
            SoundManager.play('transition');
            _createCharacterAndFinish();
        });
    }

    function _createCharacterAndFinish() {
        var user = VizAccount.getCurrentUser();
        if (!user) {
            Helpers.EventBus.emit('navigate', 'login');
            return;
        }

        var displayName = mageName || user;
        var state = StateEngine.getState();
        var character = CharacterSystem.createCharacter(user, displayName, selectedClass);
        if (character) {
            state.characters[user] = character;
            state.inventories[user] = state.inventories[user] || [];
            state.quests[user] = state.quests[user] || (typeof QuestSystem !== 'undefined' ? QuestSystem.createPlayerQuestState() : {});
        }

        var actionData = VMProtocol.createCharAttuneAction(selectedClass, displayName);
        VizBroadcast.gameAction(actionData, function(err2) {
            if (err2) {
                console.log('Char attune broadcast error (may already exist):', err2);
            }
        });

        VizAccount.updateGrimoire({ class: selectedClass, name: displayName }, function(err3) {
            if (err3) {
                console.log('Grimoire save error:', err3);
            }
        });

        SoundManager.play('success');
        Helpers.EventBus.emit('navigate', 'home');
    }

    return { render: render, startForAccount: startForAccount };
})();
