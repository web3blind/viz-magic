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
                'tabindex="' + ((c.id === selectedClass || (!selectedClass && i === 0)) ? '0' : '-1') + '" type="button" ' +
                'data-class="' + c.id + '" aria-label="' + t('class_' + c.id) + '. ' + t('class_' + c.id + '_desc') + '">' +
                '<span class="class-icon" aria-hidden="true">' + c.icon + '</span>' +
                '<h3>' + t('class_' + c.id) + '</h3>' +
                '<p class="class-quote">' + t('class_' + c.id + '_desc') + '</p>' +
                '<p class="class-detail">' + t('class_' + c.id + '_detail') + '</p>' +
                '<span class="class-diff">' + c.diff + '</span>' +
                '</button>';
        }

        html += '</div>' +
            _renderPathPortrait(t) +
            '<div class="onboarding-buttons">' +
                '<button class="btn btn-secondary" id="btn-class-back">' + t('onboarding_back') + '</button>' +
                '<button class="btn btn-primary" id="btn-class-next" ' + (selectedClass ? '' : 'disabled') + '>' + t('onboarding_next') + '</button>' +
            '</div></div>';

        el.innerHTML = html;

        A11y.bindRadioGroup(el.querySelector('.class-grid[role="radiogroup"]'), '.class-card', function(option) {
            selectedClass = option.getAttribute('data-class');
            SoundManager.play('tap');
            Helpers.$('btn-class-next').disabled = false;
        });

        Helpers.$('btn-class-back').addEventListener('click', function() {
            Helpers.EventBus.emit('navigate', 'login');
        });

        Helpers.$('btn-class-next').addEventListener('click', function() {
            if (!selectedClass) return;
            SoundManager.play('transition');
            _createCharacterAndFinish();
        });
    }

    function _renderPathPortrait(t) {
        if (!selectedClass) {
            return '<section class="class-portrait-card" aria-live="polite">' +
                '<h2>' + t('onboarding_path_portrait_title') + '</h2>' +
                '<p class="onboarding-text">' + t('onboarding_path_portrait_empty') + '</p>' +
            '</section>';
        }

        return '<section class="class-portrait-card" aria-live="polite">' +
            '<h2>' + t('onboarding_path_portrait_title') + ': ' + t('class_' + selectedClass) + '</h2>' +
            '<p class="onboarding-text">' + t('class_' + selectedClass + '_portrait') + '</p>' +
        '</section>';
    }

    function _createCharacterAndFinish() {
        var user = VizAccount.getCurrentUser();
        if (!user) {
            Helpers.EventBus.emit('navigate', 'login');
            return;
        }

        var recovery = StateEngine.getRecoveryStatus ? StateEngine.getRecoveryStatus(user) : { status: 'pending' };
        if (recovery.status !== 'complete') {
            Toast.info(Helpers.t('onboarding_recovery_pending'));
            return;
        }

        var displayName = mageName || user;
        var actionData = VMProtocol.createCharAttuneAction(selectedClass, displayName);
        VizBroadcast.gameAction(actionData, function(err2, broadcastResult) {
            if (err2) {
                console.log('Char attune broadcast error:', err2);
                Toast.info(Helpers.t('onboarding_confirmation_pending'));
                return;
            }
            var blockNum = broadcastResult && broadcastResult.action && Number(broadcastResult.action.block_num || 0);
            if (!blockNum || typeof HistorySource === 'undefined' || !HistorySource.getBlock) {
                Toast.info(Helpers.t('onboarding_confirmation_pending'));
                return;
            }
            HistorySource.getBlock(blockNum, function(blockErr, block) {
                if (blockErr || !block) {
                    Toast.info(Helpers.t('onboarding_confirmation_pending'));
                    return;
                }
                var processed = BlockProcessor.processBlock(block, blockNum);
                var events = StateEngine.processBlock(processed, { advanceHead: false, runMaintenance: false });
                if (!events.length && StateEngine.getProcessedBlockOutcomes) events = StateEngine.getProcessedBlockOutcomes(processed);
                var created = null;
                for (var i = 0; i < events.length; i++) {
                    if (events[i].type === 'character_created' && events[i].account === user) created = events[i];
                }
                var character = StateEngine.getCharacter(user);
                if (!created || !character) {
                    Toast.info(Helpers.t('onboarding_confirmation_pending'));
                    return;
                }
                StateEngine.saveCheckpoint(function() {});
                VizAccount.updateGrimoire(CharacterSystem.toGrimoire(character), function(metaErr) {
                    if (metaErr) console.log('Grimoire cache save error:', metaErr);
                });
                SoundManager.play('success');
                Helpers.EventBus.emit('navigate', 'home');
            });
        });
    }

    return { render: render, startForAccount: startForAccount };
})();
