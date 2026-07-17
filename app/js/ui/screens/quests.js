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
                '<h1><span class="screen-title-icon vmagic-breathe" aria-hidden="true">📜</span> ' + t('quest_title') + '</h1>' +
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

        var limit = QuestSystem.MAX_ACTIVE_QUESTS || 5;
        var html = '<p class="quest-limit-note" role="status">' +
            t('quest_active_count', { count: quests.length, max: limit }) + '</p>' +
            '<ul class="quest-list" role="list">';
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
            html += _renderAvailableCard(quests[i], t, playerQuests);
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
            '<h3 class="daily-quest-title"><span class="section-icon vmagic-breathe" aria-hidden="true">' + (prophecy.type === 'duel' ? '⚔️' : '🧭') + '</span> ' + t(prophecy.titleKey) + '</h3>' +
            '<p class="prophecy-desc">' + t(prophecy.descriptionKey) + '</p>' +
            '<p class="quest-desc">Сначала выбери ежедневное пророчество, затем выполни его отдельную цель ниже. Благословения нужны только если сегодняшняя цель — благословить других магов.</p>';

        // Objectives
        html += '<div class="prophecy-objectives">';
        for (var i = 0; i < prophecy.objectives.length; i++) {
            var obj = prophecy.objectives[i];
            html += '<div class="quest-objective">' +
                _describeObjective(obj, t) +
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

        var limit = QuestSystem.MAX_ACTIVE_QUESTS || 5;
        var isFull = (playerQuests.active || []).length >= limit;
        if (!isAccepted && !isFull) {
            html += '<button class="btn btn-primary btn-glow quest-accept-btn" data-quest-id="' + prophecy.id + '" data-daily="true">' +
                t('quest_accept') + '</button>';
        } else if (!isAccepted && isFull) {
            html += '<p class="quest-limit-note" role="status">' + t('quest_limit_reached_daily') + '</p>' +
                '<button class="btn btn-primary btn-glow" disabled aria-disabled="true">' + t('quest_accept') + '</button>';
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
            var title = _completedQuestTitle(q, t);
            html += '<li class="quest-card quest-completed-card">' +
                '<span class="quest-icon" aria-hidden="true">\u2714</span>' +
                '<span class="quest-name">' + Helpers.escapeHtml(title) + '</span>' +
            '</li>';
        }
        html += '</ul>';
        return html;
    }

    function _completedQuestTitle(q, t) {
        if (!q) return '';
        if (q.titleKey) return t(q.titleKey);
        if (typeof GameQuests !== 'undefined' && GameQuests.getQuest) {
            var quest = GameQuests.getQuest(q.id);
            if (quest && quest.titleKey) return t(quest.titleKey);
        }
        if (/^daily_[0-9]+_[0-9]+$/.test(q.id || '')) return t('quest_daily_hunt');
        return String(q.id || '').replace(/^q_/, '').replace(/_/g, ' ');
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
                '<span class="obj-label">' + _describeObjective(obj, t) + '</span>' +
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

    function _renderAvailableCard(quest, t, playerQuests) {
        var html = '<li class="quest-card quest-available" role="listitem">';
        html += '<div class="quest-card-header">';
        html += '<span class="quest-type-badge">' + t('quest_type_' + quest.type) + '</span>';
        html += '<h3 class="quest-name">' + t(quest.titleKey) + '</h3>';
        html += '</div>';
        html += '<p class="quest-desc">' + t(quest.descriptionKey) + '</p>';
        html += '<p class="quest-desc">' + _questHint(quest, t) + '</p>';
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

        var limit = QuestSystem.MAX_ACTIVE_QUESTS || 5;
        var isFull = playerQuests && playerQuests.active && playerQuests.active.length >= limit;
        if (isFull) {
            html += '<p class="quest-limit-note" role="status">' + t('quest_limit_reached_short') + '</p>' +
                '<button class="btn btn-primary btn-sm" disabled aria-disabled="true">' + t('quest_accept') + '</button>';
        } else {
            html += '<button class="btn btn-primary btn-sm quest-accept-btn" data-quest-id="' + quest.id + '">' +
                t('quest_accept') + '</button>';
        }
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
                    var limit = QuestSystem.MAX_ACTIVE_QUESTS || 5;
                    if ((playerQuests.active || []).length >= limit) {
                        Toast.info(Helpers.t('quest_limit_reached_toast'));
                        render();
                        return;
                    }
                    _broadcastQuestAction('accept', questId, isDaily, blockNum);
                }
            });
        }

        // Complete buttons
        var completeBtns = container.querySelectorAll('.quest-complete-btn');
        for (var j = 0; j < completeBtns.length; j++) {
            completeBtns[j].addEventListener('click', function() {
                var questId = this.getAttribute('data-quest-id');
                _broadcastQuestAction('complete', questId, false, blockNum);
            });
        }

        // Abandon buttons
        var abandonBtns = container.querySelectorAll('.quest-abandon-btn');
        for (var k = 0; k < abandonBtns.length; k++) {
            abandonBtns[k].addEventListener('click', function() {
                var questId = this.getAttribute('data-quest-id');
                _broadcastQuestAction('abandon', questId, false, blockNum);
            });
        }
    }

    function _broadcastQuestAction(kind, questId, isDaily, dailyBlock) {
        var cfg = VizMagicConfig;
        var type = cfg.ACTION_TYPES.QUEST_ACCEPT;
        if (kind === 'complete') type = cfg.ACTION_TYPES.QUEST_COMPLETE;
        if (kind === 'abandon') type = cfg.ACTION_TYPES.QUEST_ABANDON;
        var data = { quest_id: questId || '' };
        if (isDaily) {
            data.daily = true;
            data.daily_block = dailyBlock || 0;
        }

        if (kind === 'accept') {
            var state = StateEngine.getState();
            var userForLimit = VizAccount.getCurrentUser();
            var active = state.quests && state.quests[userForLimit] && state.quests[userForLimit].active ? state.quests[userForLimit].active : [];
            if (active.length >= (QuestSystem.MAX_ACTIVE_QUESTS || 5)) {
                Toast.info(Helpers.t('quest_limit_reached_toast'));
                return;
            }
        }

        VizBroadcast.questAction(type, data, function(err, result) {
            if (err) {
                Toast.error(Helpers.t('error_network'));
                return;
            }

            var user = VizAccount.getCurrentUser();
            var currentHead = StateEngine.getState().headBlock || 0;
            var finalBlockNum =
                (result && result.block_num) ||
                (result && result.action && result.action.block_num) ||
                (currentHead + 1);
            var event = null;
            if (kind === 'accept') {
                event = StateEngine.processQuestAcceptResult(user, questId, isDaily, dailyBlock, finalBlockNum);
            } else if (kind === 'complete') {
                event = StateEngine.processQuestCompleteResult(user, questId, finalBlockNum);
            } else if (kind === 'abandon') {
                event = StateEngine.processQuestAbandonResult(user, questId, finalBlockNum);
            }

            if (!event) {
                if (kind === 'accept') {
                    Toast.info(Helpers.t('quest_limit_reached_toast'));
                } else {
                    Toast.error(Helpers.t('error_network'));
                }
                return;
            }

            StateEngine.getState().headBlock = finalBlockNum;
            CheckpointSystem.saveCheckpoint('global', finalBlockNum, StateEngine.getState(), function() {});
            if (kind === 'complete') {
                SoundManager.play('quest_complete');
                Toast.success(Helpers.t('quest_completed'));
            } else if (kind === 'abandon') {
                Toast.info(Helpers.t('quest_abandoned'));
            } else {
                SoundManager.play('quest_accept');
                Toast.success(Helpers.t('quest_accepted'));
            }
            render();
        });
    }

    function _describeObjective(obj, t) {
        if (!obj) return '';
        if (obj.type === 'explore') return t('quest_obj_explore_detail', { count: obj.required });
        if (obj.type === 'social' && obj.target === 'blessing') return t('quest_obj_bless_detail', { count: obj.required });
        if (obj.type === 'social' && obj.target === 'guild_join') return t('quest_obj_guild_join_detail', { count: obj.required });
        if (obj.type === 'territory' && obj.target === 'siege') return t('quest_obj_territory_detail', { count: obj.required });
        if (obj.type === 'craft' && obj.target === 'enchant') return t('quest_obj_enchant_detail', { count: obj.required });
        return t('quest_obj_' + obj.type) + ': ' + obj.required;
    }

    function _questHint(quest, t) {
        if (!quest) return '';
        if (quest.id === 'q_visit_regions') return t('quest_visit_regions_hint');
        if (quest.id === 'q_blessings') return t('quest_blessings_hint');
        return t('quest_generic_hint');
    }

    return { render: render };
})();
