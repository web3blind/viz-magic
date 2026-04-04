/**
 * Viz Magic — Quest Log Screen
 * Active quests, available quests, daily prophecy, quest details.
 */
var QuestsScreen = (function() {
    'use strict';

    var currentTab = 'active';

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-quests');
        if (!el) return;

        var user = VizAccount.getCurrentUser();
        var character = StateEngine.getCharacter(user);
        var state = StateEngine.getState();
        if (!state.quests) state.quests = {};
        if (!state.quests[user]) {
            state.quests[user] = QuestSystem.createPlayerQuestState();
        }
        var playerQuests = state.quests[user];
        var blockNum = state.headBlock || 0;

        el.innerHTML =
            '<div class="quests-screen">' +
                '<h1>' + t('quest_title') + '</h1>' +
                _renderTabs(t) +
                '<div id="quests-content" role="region" aria-live="polite"></div>' +
            '</div>';

        _bindTabs(el);
        _renderTabContent(character, playerQuests, blockNum);
    }

    function _renderTabs(t) {
        var tabs = [
            { id: 'active', label: t('quest_tab_active') },
            { id: 'available', label: t('quest_tab_available') },
            { id: 'daily', label: t('quest_tab_daily') },
            { id: 'completed', label: t('quest_tab_completed') }
        ];
        var html = '<div class="quest-tabs" role="tablist" aria-label="' + t('quest_title') + '">';
        for (var i = 0; i < tabs.length; i++) {
            var active = tabs[i].id === currentTab ? ' active' : '';
            html += '<button class="btn btn-secondary btn-sm' + active + '" data-tab="' + tabs[i].id + '" ' +
                    'role="tab" aria-selected="' + (tabs[i].id === currentTab) + '">' +
                    tabs[i].label + '</button>';
        }
        html += '</div>';
        return html;
    }

    function _bindTabs(el) {
        var buttons = el.querySelectorAll('.quest-tabs button');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', function() {
                currentTab = this.getAttribute('data-tab');
                SoundManager.play('tap');
                render();
            });
        }
    }

    function _renderTabContent(character, playerQuests, blockNum) {
        var container = Helpers.$('quests-content');
        if (!container) return;
        var t = Helpers.t;

        switch (currentTab) {
            case 'active':
                container.innerHTML = _renderActiveQuests(playerQuests, t);
                break;
            case 'available':
                container.innerHTML = _renderAvailableQuests(character, playerQuests, blockNum, t);
                break;
            case 'daily':
                container.innerHTML = _renderDailyProphecy(character, playerQuests, blockNum, t);
                break;
            case 'completed':
                container.innerHTML = _renderCompletedQuests(playerQuests, t);
                break;
        }

        _bindQuestActions(container, character, playerQuests, blockNum);
    }

    function _renderActiveQuests(playerQuests, t) {
        var quests = playerQuests.active || [];
        if (quests.length === 0) {
            return '<div class="empty-state">' + t('quest_no_active') + '</div>';
        }

        var html = '<ul class="quest-list" role="list">';
        for (var i = 0; i < quests.length; i++) {
            html += _renderQuestCard(quests[i], t, true);
        }
        html += '</ul>';
        return html;
    }

    function _renderAvailableQuests(character, playerQuests, blockNum, t) {
        var quests = QuestSystem.getAvailableQuests(character, playerQuests, blockNum);
        if (quests.length === 0) {
            return '<div class="empty-state">' + t('quest_none_available') + '</div>';
        }

        var html = '<ul class="quest-list" role="list">';
        for (var i = 0; i < quests.length; i++) {
            html += _renderAvailableCard(quests[i], t);
        }
        html += '</ul>';
        return html;
    }

    function _renderDailyProphecy(character, playerQuests, blockNum, t) {
        if (!character) {
            return '<div class="empty-state">' + t('quest_login_required') + '</div>';
        }
        var prophecy = QuestSystem.generateDailyProphecy(blockNum, character.level);

        var html = '<div class="daily-prophecy-card">' +
            '<div class="prophecy-header">' +
                '<span class="prophecy-icon" aria-hidden="true">\uD83D\uDD2E</span>' +
                '<h2>' + t('home_daily_prophecy') + '</h2>' +
            '</div>' +
            '<h3>' + t(prophecy.titleKey) + '</h3>' +
            '<p class="prophecy-desc">' + t(prophecy.descriptionKey) + '</p>';

        // Objectives
        html += '<div class="prophecy-objectives">';
        for (var i = 0; i < prophecy.objectives.length; i++) {
            var obj = prophecy.objectives[i];
            html += '<div class="quest-objective">' +
                t('quest_obj_' + obj.type) + ': ' + obj.required +
            '</div>';
        }
        html += '</div>';

        // Rewards
        if (prophecy.rewards) {
            html += '<div class="quest-rewards">' +
                '<span class="reward-xp">\u2B50 ' + (prophecy.rewards.xp || 0) + ' XP</span>';
            if (prophecy.rewards.awardEnergy) {
                html += ' <span class="reward-energy">\u26A1 ' + Helpers.bpToPercent(prophecy.rewards.awardEnergy) + ' ' + t('home_mana') + '</span>';
            }
            html += '</div>';
        }

        // Check if already accepted today
        var isAccepted = false;
        for (var j = 0; j < (playerQuests.active || []).length; j++) {
            if (playerQuests.active[j].id === prophecy.id) {
                isAccepted = true;
                break;
            }
        }

        if (!isAccepted) {
            html += '<button class="btn btn-primary btn-glow quest-accept-btn" data-quest-id="' + prophecy.id + '" data-daily="true">' +
                t('quest_accept') + '</button>';
        } else {
            html += '<p class="quest-accepted-label">\u2714 ' + t('quest_already_accepted') + '</p>';
        }

        html += '</div>';
        return html;
    }

    function _renderCompletedQuests(playerQuests, t) {
        var completed = playerQuests.completed || [];
        if (completed.length === 0) {
            return '<div class="empty-state">' + t('quest_none_completed') + '</div>';
        }

        var html = '<ul class="quest-list completed" role="list">';
        for (var i = completed.length - 1; i >= Math.max(0, completed.length - 20); i--) {
            var q = completed[i];
            html += '<li class="quest-card quest-completed-card">' +
                '<span class="quest-icon" aria-hidden="true">\u2714</span>' +
                '<span class="quest-name">' + Helpers.t(q.id) + '</span>' +
            '</li>';
        }
        html += '</ul>';
        return html;
    }

    function _renderQuestCard(quest, t, showActions) {
        var html = '<li class="quest-card' + (quest.completed ? ' quest-ready' : '') + '" role="listitem">';
        html += '<div class="quest-card-header">';
        html += '<span class="quest-type-badge">' + t('quest_type_' + quest.type) + '</span>';
        html += '<h3 class="quest-name">' + t(quest.titleKey) + '</h3>';
        html += '</div>';

        // Objectives with progress bars
        html += '<div class="quest-objectives">';
        for (var i = 0; i < quest.objectives.length; i++) {
            var obj = quest.objectives[i];
            var pct = Math.floor((obj.current / obj.required) * 100);
            html += '<div class="quest-objective">' +
                '<span class="obj-label">' + t('quest_obj_' + obj.type) + (obj.target ? ' (' + obj.target + ')' : '') + '</span>' +
                '<div class="progress-bar" role="progressbar" aria-valuenow="' + obj.current + '" aria-valuemax="' + obj.required + '">' +
                    '<div class="progress-fill" style="width:' + pct + '%"></div>' +
                    '<span class="progress-text">' + obj.current + '/' + obj.required + '</span>' +
                '</div>' +
            '</div>';
        }
        html += '</div>';

        // Actions
        if (showActions) {
            html += '<div class="quest-actions">';
            if (quest.completed && !quest.claimed) {
                html += '<button class="btn btn-primary btn-sm quest-complete-btn" data-quest-id="' + quest.id + '">' +
                    t('quest_claim_reward') + '</button>';
            }
            html += '<button class="btn btn-secondary btn-sm quest-abandon-btn" data-quest-id="' + quest.id + '">' +
                t('quest_abandon') + '</button>';
            html += '</div>';
        }

        html += '</li>';
        return html;
    }

    function _renderAvailableCard(quest, t) {
        var html = '<li class="quest-card quest-available" role="listitem">';
        html += '<div class="quest-card-header">';
        html += '<span class="quest-type-badge">' + t('quest_type_' + quest.type) + '</span>';
        html += '<h3 class="quest-name">' + t(quest.titleKey) + '</h3>';
        html += '</div>';
        html += '<p class="quest-desc">' + t(quest.descriptionKey) + '</p>';
        html += '<div class="quest-req">' + t('home_level') + ' ' + (quest.minLevel || 1) + '+</div>';

        // Rewards preview
        if (quest.rewards) {
            html += '<div class="quest-rewards">';
            html += '<span class="reward-xp">\u2B50 ' + quest.rewards.xp + ' XP</span>';
            if (quest.rewards.awardEnergy) {
                html += ' <span class="reward-energy">\u26A1 ' + Helpers.bpToPercent(quest.rewards.awardEnergy) + ' ' + Helpers.t('home_mana') + '</span>';
            }
            html += '</div>';
        }

        // NPC giver
        if (quest.giverNpc) {
            var npcInfo = (typeof NPCFramework !== 'undefined') ? NPCFramework.getNPCInfo(quest.giverNpc) : null;
            if (npcInfo) {
                html += '<div class="quest-giver">' + npcInfo.icon + ' ' + t(npcInfo.nameKey) + '</div>';
            }
        }

        html += '<button class="btn btn-primary btn-sm quest-accept-btn" data-quest-id="' + quest.id + '">' +
            t('quest_accept') + '</button>';
        html += '</li>';
        return html;
    }

    function _bindQuestActions(container, character, playerQuests, blockNum) {
        // Accept buttons
        var acceptBtns = container.querySelectorAll('.quest-accept-btn');
        for (var i = 0; i < acceptBtns.length; i++) {
            acceptBtns[i].addEventListener('click', function() {
                var questId = this.getAttribute('data-quest-id');
                var isDaily = this.getAttribute('data-daily') === 'true';
                var questData;

                if (isDaily) {
                    questData = QuestSystem.generateDailyProphecy(blockNum, character.level);
                } else {
                    questData = GameQuests.getQuest(questId);
                }

                if (questData) {
                    var result = QuestSystem.acceptQuest(questData, character, playerQuests, blockNum);
                    if (result.success) {
                        SoundManager.play('quest_accept');
                        Toast.success(Helpers.t('quest_accepted'));
                        render();
                    } else {
                        Toast.error(Helpers.t('quest_error_' + result.error));
                    }
                }
            });
        }

        // Complete buttons
        var completeBtns = container.querySelectorAll('.quest-complete-btn');
        for (var j = 0; j < completeBtns.length; j++) {
            completeBtns[j].addEventListener('click', function() {
                var questId = this.getAttribute('data-quest-id');
                var user = VizAccount.getCurrentUser();
                var inventory = StateEngine.getInventory(user);
                var result = QuestSystem.completeQuest(questId, playerQuests, character, inventory, blockNum);
                if (result.success) {
                    SoundManager.play('quest_complete');
                    Toast.success(Helpers.t('quest_completed') + ' +' + result.rewards.xp + ' XP');
                    render();
                }
            });
        }

        // Abandon buttons
        var abandonBtns = container.querySelectorAll('.quest-abandon-btn');
        for (var k = 0; k < abandonBtns.length; k++) {
            abandonBtns[k].addEventListener('click', function() {
                var questId = this.getAttribute('data-quest-id');
                QuestSystem.abandonQuest(questId, playerQuests);
                Toast.info(Helpers.t('quest_abandoned'));
                render();
            });
        }
    }

    return { render: render };
})();
