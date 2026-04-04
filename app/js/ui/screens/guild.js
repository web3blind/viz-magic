/**
 * Viz Magic — Guild Hall Screen
 * Guild info, quest board, territory, members, patronage.
 * Shows recommended guilds if player is not in one.
 */
var GuildScreen = (function() {
    'use strict';

    var t = Helpers.t;

    function render() {
        var container = Helpers.$('screen-guild');
        if (!container) return;

        var user = VizAccount.getCurrentUser();
        var state = StateEngine.getState();
        var myGuild = null;

        if (user && state.guilds) {
            myGuild = GuildSystem.findGuildByMember(state.guilds, user);
        }

        if (myGuild) {
            _renderGuildHall(container, myGuild, user, state);
        } else {
            _renderNoGuild(container, state);
        }
    }

    /**
     * Render guild hall for a member
     */
    function _renderGuildHall(container, guild, user, state) {
        var memberCount = GuildSystem.getMemberCount(guild);
        var members = GuildSystem.getMembersSorted(guild);
        var myMember = guild.members[user];
        var isOfficer = GuildSystem.isOfficer(guild, user);
        var territories = state.territories ? TerritorySystem.getGuildTerritories(state.territories, guild.id) : [];
        var activeWars = GuildSystem.getActiveWars(guild);

        var html = '';

        // Header / Banner
        html += '<div class="guild-hall" role="region" aria-label="' + t('guild_title') + '">';
        html += '<header class="guild-banner">';
        html += '<h1 class="guild-name">' + _esc(guild.name) + '</h1>';
        html += '<p class="guild-tag">[' + _esc(guild.tag) + ']</p>';
        if (guild.motto) {
            html += '<p class="guild-motto" aria-label="' + t('guild_motto') + '">' + _esc(guild.motto) + '</p>';
        }
        html += '<div class="guild-meta">';
        html += '<span class="guild-level">' + t('guild_level') + ': ' + guild.level + '</span>';
        html += '<span class="guild-members-count">' + t('guild_members') + ': ' + memberCount + '</span>';
        if (guild.school) {
            html += '<span class="guild-school">' + t('guild_school') + ': ' + t('school_' + guild.school) + '</span>';
        }
        html += '</div>';
        html += '</header>';

        // Your rank
        html += '<div class=\"guild-my-rank\" aria-label=\"' + t('guild_your_rank') + '\">';
        html += GuildSystem.RANK_ICONS[myMember.rank] + ' ' + t('rank_' + myMember.rank);
        html += '</div>';

        // Active key section (required for delegation / patronage)
        html += _renderActiveKeySection();

        // Quest Board
        html += '<section class="guild-quests" aria-label="' + t('guild_quest_board') + '">';
        html += '<h2>' + t('guild_quest_board') + '</h2>';
        if (guild.quests && guild.quests.length > 0) {
            html += '<ul class="guild-quest-list" role="list">';
            for (var q = 0; q < guild.quests.length; q++) {
                var quest = guild.quests[q];
                if (quest.completed) continue;
                var pct = quest.target > 0 ? Math.min(100, Math.floor((quest.progress * 100) / quest.target)) : 0;
                html += '<li class="guild-quest-item">';
                html += '<div class="quest-name">' + _esc(quest.name) + '</div>';
                html += '<div class="progress-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">';
                html += '<div class="progress-fill" style="width:' + pct + '%"></div>';
                html += '<span class="progress-text">' + quest.progress + '/' + quest.target + '</span>';
                html += '</div>';
                html += '</li>';
            }
            html += '</ul>';
        } else {
            html += '<p class="empty-state">' + t('guild_no_quests') + '</p>';
        }
        html += '</section>';

        // Territory section
        html += '<section class="guild-territories" aria-label="' + t('guild_territories') + '">';
        html += '<h2>' + t('guild_territories') + '</h2>';
        if (territories.length > 0) {
            html += '<ul class="territory-list" role="list">';
            for (var ti = 0; ti < territories.length; ti++) {
                var region = GameRegions.getRegion(territories[ti]);
                var regionName = region ? region.name : territories[ti];
                var tState = state.territories[territories[ti]];
                var underAttack = tState && tState.activeSieges && tState.activeSieges.length > 0;
                html += '<li class="territory-item' + (underAttack ? ' under-siege' : '') + '">';
                html += '<span class="territory-name">' + regionName + '</span>';
                if (underAttack) {
                    html += ' <span class="siege-indicator" aria-label="' + t('territory_under_siege') + '">\u2694\uFE0F ' + t('territory_under_siege') + '</span>';
                }
                html += '</li>';
            }
            html += '</ul>';
        } else {
            html += '<p class="empty-state">' + t('guild_no_territories') + '</p>';
        }
        html += '</section>';

        // Active Wars
        if (activeWars.length > 0) {
            html += '<section class="guild-wars" aria-label="' + t('guild_wars') + '">';
            html += '<h2>' + t('guild_wars') + '</h2>';
            html += '<ul class="war-list" role="list">';
            for (var w = 0; w < activeWars.length; w++) {
                var war = activeWars[w];
                html += '<li class="war-item">';
                html += _esc(war.attacker) + ' \u2694\uFE0F ' + _esc(war.defender);
                html += ' — ' + war.score.attacker + ':' + war.score.defender;
                html += '</li>';
            }
            html += '</ul>';
            html += '</section>';
        }

        // Members list
        html += '<section class="guild-member-list" aria-label="' + t('guild_members') + '">';
        html += '<h2>' + t('guild_members') + '</h2>';
        html += '<ul class="member-list" role="list">';
        for (var m = 0; m < members.length; m++) {
            var member = members[m];
            var icon = GuildSystem.RANK_ICONS[member.rank] || '\uD83E\uDDD9';
            html += '<li class="member-item">';
            html += '<span class="member-icon" aria-hidden="true">' + icon + '</span>';
            html += '<span class="member-name">' + _esc(member.account) + '</span>';
            html += '<span class="member-rank">' + t('rank_' + member.rank) + '</span>';
            if (member.delegatedShares > 0) {
                html += '<span class="member-delegation">' + _formatShares(member.delegatedShares) + '</span>';
            }
            if (member.account !== user) {
                // Delegate button — available to all officers for any non-self member
                html += ' <button class="btn btn-sm btn-secondary guild-delegate-btn" ';
                html += 'data-account="' + member.account + '" ';
                html += 'aria-label="' + t('guild_patronage_delegate') + ' ' + member.account + '">';
                html += '🤝';
                html += '</button>';
            }
            if (isOfficer && member.rank !== GuildSystem.RANKS.FOUNDER && member.account !== user) {
                html += ' <button class="btn btn-sm btn-secondary guild-promote-btn" ';
                html += 'data-account="' + member.account + '" ';
                html += 'aria-label="' + t('guild_promote') + ' ' + member.account + '">';
                html += t('guild_promote');
                html += '</button>';
            }
            html += '</li>';
        }
        html += '</ul>';
        html += '</section>';

        // Guild Board (Announcements)
        html += '<section class="guild-board" aria-label="' + t('guild_board') + '">';
        html += '<h2>' + t('guild_board') + '</h2>';
        if (guild.announcements && guild.announcements.length > 0) {
            html += '<ul class="announcement-list" role="list">';
            for (var a = guild.announcements.length - 1; a >= Math.max(0, guild.announcements.length - 5); a--) {
                html += '<li class="announcement-item">' + _esc(guild.announcements[a]) + '</li>';
            }
            html += '</ul>';
        } else {
            html += '<p class="empty-state">' + t('guild_no_announcements') + '</p>';
        }
        html += '</section>';

        // Action buttons
        html += '<div class="guild-actions">';
        if (isOfficer) {
            html += '<button class="btn btn-primary guild-btn" id="btn-guild-recruit" aria-label="' + t('guild_recruit') + '">';
            html += '\uD83D\uDCE8 ' + t('guild_recruit') + '</button>';

            html += '<button class="btn btn-secondary guild-btn" id="btn-guild-patronage" aria-label="' + t('guild_patronage') + '">';
            html += '\uD83E\uDD1D ' + t('guild_patronage') + '</button>';
        }

        html += '<button class="btn btn-secondary guild-btn" id="btn-guild-treasury" aria-label="' + t('guild_treasury') + '">';
        html += '\uD83D\uDCB0 ' + t('guild_treasury') + '</button>';

        html += '<button class="btn btn-secondary guild-btn" id="btn-guild-settings" aria-label="' + t('guild_settings') + '">';
        html += '\u2699\uFE0F ' + t('guild_settings') + '</button>';

        html += '<button class="btn btn-secondary guild-btn guild-leave-btn" id="btn-guild-leave" aria-label="' + t('guild_leave') + '">';
        html += t('guild_leave') + '</button>';

        html += '</div>';
        html += '</div>';

        container.innerHTML = html;
        _bindGuildEvents(container, guild, user);
        _bindActiveKeyEvents(container);
    }

    /**
     * Render no-guild state: recommended guilds + create button
     */
    function _renderNoGuild(container, state) {
        var html = '';
        html += '<div class="guild-hall" role="region" aria-label="' + t('guild_title') + '">';
        html += '<h1>' + t('guild_title') + '</h1>';
        html += '<p class="guild-no-guild-text">' + t('guild_not_member') + '</p>';

        // Create guild button
        html += '<button class="btn btn-primary btn-large guild-btn" id="btn-guild-create" aria-label="' + t('guild_create') + '">';
        html += '\uD83C\uDFF0 ' + t('guild_create') + '</button>';

        // Recommended guilds
        var guildList = _getGuildList(state);
        if (guildList.length > 0) {
            html += '<section class="recommended-guilds" aria-label="' + t('guild_recommended') + '">';
            html += '<h2>' + t('guild_recommended') + '</h2>';
            html += '<ul class="guild-list" role="list">';
            for (var i = 0; i < guildList.length; i++) {
                var g = guildList[i];
                var count = GuildSystem.getMemberCount(g);
                html += '<li class="guild-card">';
                html += '<div class="guild-card-header">';
                html += '<strong>' + _esc(g.name) + '</strong>';
                html += ' <span class="guild-tag">[' + _esc(g.tag) + ']</span>';
                html += '</div>';
                if (g.motto) html += '<p class="guild-card-motto">' + _esc(g.motto) + '</p>';
                html += '<div class="guild-card-meta">';
                html += '<span>' + t('guild_level') + ' ' + g.level + '</span>';
                html += '<span>' + count + ' ' + t('guild_members') + '</span>';
                if (g.school) html += '<span>' + t('school_' + g.school) + '</span>';
                html += '</div>';
                html += '<button class="btn btn-primary btn-sm guild-join-btn" data-guild="' + g.id + '" ';
                html += 'aria-label="' + t('guild_join') + ' ' + _esc(g.name) + '">';
                html += t('guild_join') + '</button>';
                html += '</li>';
            }
            html += '</ul>';
            html += '</section>';
        }

        // Active key section
        html += _renderActiveKeySection();

        html += '</div>';
        container.innerHTML = html;
        _bindNoGuildEvents(container);
        _bindActiveKeyEvents(container);
    }

    /**
     * Get list of all guilds for display
     */
    function _getGuildList(state) {
        var list = [];
        if (!state.guilds) return list;
        for (var gid in state.guilds) {
            if (state.guilds.hasOwnProperty(gid)) {
                list.push(state.guilds[gid]);
            }
        }
        // Sort by level desc, then member count desc
        list.sort(function(a, b) {
            if (b.level !== a.level) return b.level - a.level;
            return GuildSystem.getMemberCount(b) - GuildSystem.getMemberCount(a);
        });
        return list;
    }

    /**
     * Bind guild hall events
     */
    function _bindGuildEvents(container, guild, user) {
        // Leave button
        var leaveBtn = container.querySelector('#btn-guild-leave');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', function() {
                if (confirm(t('guild_leave_confirm'))) {
                    GuildProtocol.broadcastLeaveGuild(guild.id, function(err) {
                        if (err) {
                            Toast.error(t('error_network'));
                        } else {
                            Toast.success(t('guild_left'));
                            SoundManager.play('transition');
                            // Optimistic update: remove player from guild locally
                            var leaveState = StateEngine.getState();
                            var leaveUser = VizAccount.getCurrentUser();
                            if (leaveState.guilds && guild.id && leaveState.guilds[guild.id]) {
                                GuildSystem.leaveGuild(leaveState.guilds[guild.id], leaveUser);
                            }
                            render();
                        }
                    });
                }
            });
        }

        // Recruit button
        var recruitBtn = container.querySelector('#btn-guild-recruit');
        if (recruitBtn) {
            recruitBtn.addEventListener('click', function() {
                _showRecruitModal(guild);
            });
        }

        // Patronage button (general)
        var patronageBtn = container.querySelector('#btn-guild-patronage');
        if (patronageBtn) {
            patronageBtn.addEventListener('click', function() {
                _showPatronageModal(guild, user);
            });
        }

        // Quick-delegate buttons on each member row
        var delegateBtns = container.querySelectorAll('.guild-delegate-btn');
        for (var di = 0; di < delegateBtns.length; di++) {
            delegateBtns[di].addEventListener('click', function() {
                var account = this.getAttribute('data-account');
                _showPatronageModal(guild, user, account);
            });
        }

        // Promote buttons
        var promoteBtns = container.querySelectorAll('.guild-promote-btn');
        for (var i = 0; i < promoteBtns.length; i++) {
            promoteBtns[i].addEventListener('click', function() {
                var account = this.getAttribute('data-account');
                _showPromoteModal(guild, account);
            });
        }

        // Treasury button
        var treasuryBtn = container.querySelector('#btn-guild-treasury');
        if (treasuryBtn) {
            treasuryBtn.addEventListener('click', function() {
                _showTreasuryModal(guild);
            });
        }
    }

    /**
     * Bind no-guild events
     */
    function _bindNoGuildEvents(container) {
        // Create guild
        var createBtn = container.querySelector('#btn-guild-create');
        if (createBtn) {
            createBtn.addEventListener('click', function() {
                _showCreateGuildModal();
            });
        }

        // Join buttons
        var joinBtns = container.querySelectorAll('.guild-join-btn');
        for (var i = 0; i < joinBtns.length; i++) {
            joinBtns[i].addEventListener('click', function() {
                var guildId = this.getAttribute('data-guild');
                GuildProtocol.broadcastJoinGuild(guildId, function(err) {
                    if (err) {
                        Toast.error(t('error_network'));
                    } else {
                        Toast.success(t('guild_joined'));
                        SoundManager.play('success');
                        // Optimistic update: add player to guild locally
                        var state = StateEngine.getState();
                        var user = VizAccount.getCurrentUser();
                        var blockNum = state.headBlock || 0;
                        if (state.guilds && state.guilds[guildId]) {
                            GuildSystem.joinGuild(state.guilds[guildId], user, blockNum);
                        }
                        render();
                    }
                });
            });
        }
    }

    /**
     * Show create guild modal
     */
    function _showCreateGuildModal() {
        var html = '<div class="modal-content">';
        html += '<h2 class="modal-title">' + t('guild_create') + '</h2>';
        html += '<label class="input-label" for="guild-id">' + t('guild_id_label') + '</label>';
        html += '<input type="text" class="input-field" id="guild-id" maxlength="16" placeholder="my-guild">';
        html += '<label class="input-label" for="guild-name">' + t('guild_name_label') + '</label>';
        html += '<input type="text" class="input-field" id="guild-name" maxlength="40">';
        html += '<label class="input-label" for="guild-tag">' + t('guild_tag_label') + '</label>';
        html += '<input type="text" class="input-field" id="guild-tag" maxlength="5" placeholder="TAG">';
        html += '<label class="input-label" for="guild-motto">' + t('guild_motto') + '</label>';
        html += '<input type="text" class="input-field" id="guild-motto" maxlength="100">';
        html += '<label class="input-label" for="guild-school">' + t('guild_school') + '</label>';
        html += '<select class="input-field" id="guild-school">';
        html += '<option value="">' + t('guild_no_school') + '</option>';
        html += '<option value="ignis">Ignis</option>';
        html += '<option value="aqua">Aqua</option>';
        html += '<option value="terra">Terra</option>';
        html += '<option value="ventus">Ventus</option>';
        html += '<option value="umbra">Umbra</option>';
        html += '</select>';
        html += '<div class="modal-actions">';
        html += '<button class="btn btn-primary" id="modal-create-guild">' + t('confirm') + '</button>';
        html += '<button class="btn btn-secondary" id="modal-cancel">' + t('cancel') + '</button>';
        html += '</div>';
        html += '</div>';

        ModalComponent.show(html);

        Helpers.$('modal-create-guild').addEventListener('click', function() {
            var guildId = Helpers.$('guild-id').value.trim().toLowerCase();
            var name = Helpers.$('guild-name').value.trim();
            var tag = Helpers.$('guild-tag').value.trim().toUpperCase();
            var motto = Helpers.$('guild-motto').value.trim();
            var school = Helpers.$('guild-school').value;

            if (!guildId || !name || !tag) {
                Toast.error(t('guild_create_missing'));
                return;
            }

            GuildProtocol.broadcastCreateGuild(guildId, name, tag, school, motto, {}, function(err) {
                ModalComponent.hide();
                if (err) {
                    Toast.error(t('error_network'));
                } else {
                    Toast.success(t('guild_created'));
                    SoundManager.play('success');
                    // Optimistic update: apply guild to local state immediately
                    // (block-processor will confirm when the tx lands on-chain)
                    var state = StateEngine.getState();
                    if (!state.guilds) state.guilds = {};
                    var user = VizAccount.getCurrentUser();
                    var blockNum = state.headBlock || 0;
                    var newGuild = GuildSystem.createGuild(guildId, user, {
                        name: name, tag: tag, school: school, motto: motto, charter: {}
                    }, blockNum);
                    if (newGuild) state.guilds[guildId] = newGuild;
                    render();
                }
            });
        });

        Helpers.$('modal-cancel').addEventListener('click', function() {
            ModalComponent.hide();
        });
    }

    /**
     * Show recruit modal
     */
    function _showRecruitModal(guild) {
        var html = '<div class="modal-content">';
        html += '<h2 class="modal-title">' + t('guild_recruit') + '</h2>';
        html += '<label class="input-label" for="recruit-target">' + t('guild_recruit_target') + '</label>';
        html += '<input type="text" class="input-field" id="recruit-target" placeholder="account-name">';
        html += '<div class="modal-actions">';
        html += '<button class="btn btn-primary" id="modal-recruit">' + t('guild_invite_send') + '</button>';
        html += '<button class="btn btn-secondary" id="modal-cancel">' + t('cancel') + '</button>';
        html += '</div>';
        html += '</div>';

        ModalComponent.show(html);

        Helpers.$('modal-recruit').addEventListener('click', function() {
            var target = Helpers.$('recruit-target').value.trim().toLowerCase();
            if (!target) return;
            GuildProtocol.broadcastInviteToGuild(guild.id, target, function(err) {
                ModalComponent.hide();
                if (err) {
                    Toast.error(t('error_network'));
                } else {
                    Toast.success(t('guild_invite_sent'));
                    SoundManager.play('tap');
                }
            });
        });

        Helpers.$('modal-cancel').addEventListener('click', function() { ModalComponent.hide(); });
    }

    /**
     * Render active key section.
     * Shows a notice + input if active key is not saved,
     * or a "saved" badge if it is.
     */
    function _renderActiveKeySection() {
        var html = '<section class="guild-active-key" aria-label="' + t('guild_active_key_section') + '">';
        if (VizAccount.hasActiveKey()) {
            html += '<div class="active-key-status active-key-ok">';
            html += '<span class="active-key-icon" aria-hidden="true">🔑</span> ';
            html += '<span>' + t('guild_active_key_saved') + '</span>';
            html += ' <button class="btn btn-sm btn-secondary" id="btn-clear-active-key">' + t('guild_active_key_clear') + '</button>';
            html += '</div>';
        } else {
            html += '<div class="active-key-status active-key-missing">';
            html += '<p class="active-key-notice">' + t('guild_active_key_needed') + '</p>';
            html += '<label class="input-label" for="input-active-key">' + t('guild_active_key_label') + '</label>';
            html += '<input type="password" class="input-field" id="input-active-key" placeholder="5J..." autocomplete="off">';
            html += '<button class="btn btn-primary btn-sm" id="btn-save-active-key">' + t('guild_active_key_save') + '</button>';
            html += '</div>';
        }
        html += '</section>';
        return html;
    }

    /**
     * Bind active key form events
     */
    function _bindActiveKeyEvents(container) {
        var saveBtn = container.querySelector('#btn-save-active-key');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                var input = container.querySelector('#input-active-key');
                var key = input ? input.value.trim() : '';
                if (!key) return;
                saveBtn.disabled = true;
                VizAccount.saveActiveKey(key, function(err) {
                    saveBtn.disabled = false;
                    if (err) {
                        Toast.error(t('guild_active_key_invalid'));
                    } else {
                        Toast.success(t('guild_active_key_saved'));
                        SoundManager.play('success');
                        render(); // refresh to show saved badge
                    }
                });
            });
        }

        var clearBtn = container.querySelector('#btn-clear-active-key');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                VizAccount.clearActiveKey();
                render();
            });
        }
    }

    /**
     * Show patronage modal (delegate SHARES to a member)
     * @param {Object} guild
     * @param {string} user - current user
     * @param {string} [prefillAccount] - optional account to pre-fill in the target field
     */
    function _showPatronageModal(guild, user, prefillAccount) {
        var html = '<div class="modal-content">';
        html += '<h2 class="modal-title">' + t('guild_patronage') + '</h2>';
        html += '<p>' + t('guild_patronage_desc') + '</p>';
        html += '<label class="input-label" for="patronage-target">' + t('guild_patronage_target') + '</label>';
        html += '<input type="text" class="input-field" id="patronage-target" placeholder="account-name"'
              + (prefillAccount ? ' value="' + _esc(prefillAccount) + '"' : '') + '>';
        html += '<label class="input-label" for="patronage-shares">' + t('guild_patronage_amount') + '</label>';
        html += '<input type="number" class="input-field" id="patronage-shares" min="1" placeholder="1000">';
        html += '<p class="input-feedback">' + t('guild_patronage_note') + '</p>';
        html += '<div class="modal-actions">';
        html += '<button class="btn btn-primary" id="modal-patronage">' + t('guild_patronage_delegate') + '</button>';
        html += '<button class="btn btn-secondary" id="modal-cancel">' + t('cancel') + '</button>';
        html += '</div>';
        html += '</div>';

        ModalComponent.show(html);

        Helpers.$('modal-patronage').addEventListener('click', function() {
            var target = Helpers.$('patronage-target').value.trim().toLowerCase();
            var shares = parseInt(Helpers.$('patronage-shares').value, 10);
            if (!target || !shares || shares <= 0) return;

            if (typeof VizBroadcast.delegateShares === 'function') {
                VizBroadcast.delegateShares(target, shares, function(err) {
                    ModalComponent.hide();
                    if (err) {
                        Toast.error(t('guild_patronage_error'));
                    } else {
                        Toast.success(t('guild_patronage_success'));
                        SoundManager.play('success');
                    }
                });
            } else {
                ModalComponent.hide();
                Toast.error(t('guild_patronage_no_active_key'));
            }
        });

        Helpers.$('modal-cancel').addEventListener('click', function() { ModalComponent.hide(); });
    }

    /**
     * Show promote modal
     */
    function _showPromoteModal(guild, targetAccount) {
        var html = '<div class="modal-content">';
        html += '<h2 class="modal-title">' + t('guild_promote') + ' ' + _esc(targetAccount) + '</h2>';
        html += '<label class="input-label" for="promote-rank">' + t('guild_choose_rank') + '</label>';
        html += '<select class="input-field" id="promote-rank">';
        var ranks = ['archon', 'warden', 'quartermaster', 'chronicler', 'initiate'];
        for (var i = 0; i < ranks.length; i++) {
            html += '<option value="' + ranks[i] + '">' + t('rank_' + ranks[i]) + '</option>';
        }
        html += '</select>';
        html += '<div class="modal-actions">';
        html += '<button class="btn btn-primary" id="modal-promote">' + t('confirm') + '</button>';
        html += '<button class="btn btn-secondary" id="modal-cancel">' + t('cancel') + '</button>';
        html += '</div>';
        html += '</div>';

        ModalComponent.show(html);

        Helpers.$('modal-promote').addEventListener('click', function() {
            var rank = Helpers.$('promote-rank').value;
            GuildProtocol.broadcastPromote(guild.id, targetAccount, rank, function(err) {
                ModalComponent.hide();
                if (err) {
                    Toast.error(t('error_network'));
                } else {
                    Toast.success(t('guild_promoted'));
                    SoundManager.play('tap');
                    render();
                }
            });
        });

        Helpers.$('modal-cancel').addEventListener('click', function() { ModalComponent.hide(); });
    }

    /**
     * Show treasury info modal
     */
    function _showTreasuryModal(guild) {
        var tithe = guild.charter.tithe_pct ? (guild.charter.tithe_pct / 100) : 0;
        var html = '<div class="modal-content">';
        html += '<h2 class="modal-title">' + t('guild_treasury') + '</h2>';
        html += '<p>' + t('guild_tithe_rate') + ': ' + tithe + '%</p>';
        html += '<p>' + t('guild_treasury_account') + ': ' + _esc(guild.founder) + '</p>';
        html += '<p>' + t('guild_total_delegated') + ': ' + _formatShares(guild.totalDelegated) + '</p>';
        html += '<div class="modal-actions">';
        html += '<button class="btn btn-secondary" id="modal-cancel">' + t('close') + '</button>';
        html += '</div>';
        html += '</div>';

        ModalComponent.show(html);
        Helpers.$('modal-cancel').addEventListener('click', function() { ModalComponent.hide(); });
    }

    /**
     * Format micro-SHARES to display
     */
    function _formatShares(microShares) {
        var amount = (microShares || 0) / 1000000;
        return amount.toFixed(6) + ' SHARES';
    }

    /**
     * Escape HTML
     */
    function _esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Initialize EventBus subscriptions for reactive guild state updates.
     * Called once when the screen module loads.
     */
    function init() {
        var events = ['guild_created', 'guild_joined', 'guild_left', 'guild_promoted'];
        for (var i = 0; i < events.length; i++) {
            Helpers.EventBus.on(events[i], function() {
                // Re-render only if guild screen is currently visible
                var container = Helpers.$('screen-guild');
                if (container && !container.getAttribute('aria-hidden')) {
                    render();
                }
            });
        }
    }

    return { render: render, init: init };
})();
