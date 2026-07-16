/**
 * Viz Magic — World Boss Screen
 * Displays boss status, HP bar, attack button, leaderboard, loot.
 */
var WorldBossScreen = (function() {
    'use strict';

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-world-boss');
        if (!el) return;

        var user = VizAccount.getCurrentUser();
        var state = StateEngine.getState();
        var blockNum = state.headBlock || 0;
        var bossState = state.worldBoss || null;
        if (typeof WorldEvents !== 'undefined' && WorldEvents.checkWorldBossWindow) {
            var bossEvent = WorldEvents.checkWorldBossWindow(blockNum);
            if (bossEvent && bossEvent.active) {
                var playerCount = WorldBoss.DEFAULT_ENCOUNTER_PLAYERS || (state.characters ? Object.keys(state.characters).length : 1);
                var scheduledBoss = WorldBoss.spawnBoss(bossEvent.spawnBlock || blockNum, playerCount, WorldBoss.BOSS_ACCOUNT);
                if (!bossState || !bossState.active || bossState.spawnBlock !== scheduledBoss.spawnBlock || bossState.maxHp !== scheduledBoss.maxHp || bossState.currentHp > scheduledBoss.maxHp) {
                    state.worldBoss = scheduledBoss;
                    bossState = scheduledBoss;
                    _backfillKey = '';
                }
            }
        }
        bossState = bossState || WorldBoss.getDefaultState();
        var status = WorldBoss.getBossStatus(bossState, user, blockNum);

        if (!status.active) {
            el.innerHTML = _renderInactive(t, blockNum);
        } else if (status.defeated) {
            el.innerHTML = _renderDefeated(t, status, bossState);
        } else {
            el.innerHTML = _renderActive(t, status, blockNum);
        }

        _bindActions(el, bossState, user, blockNum);
        _ensureArchiveBackfill(bossState, blockNum);
    }


    var _backfillKey = '';

    function _ensureArchiveBackfill(bossState, blockNum) {
        if (!bossState || !bossState.active || bossState.defeated) return;
        if (typeof HistorySource === 'undefined' || !HistorySource.getEventsRange) return;
        var spawnBlock = bossState.spawnBlock || 0;
        if (!spawnBlock || !blockNum || blockNum < spawnBlock) return;
        var key = spawnBlock + ':' + Math.floor(blockNum / 50);
        if (_backfillKey === key) return;
        _backfillKey = key;

        HistorySource.getEventsRange({
            protocol: VizMagicConfig.PROTOCOLS.VM,
            start: spawnBlock,
            end: blockNum,
            limit: 1000
        }, function(err, events) {
            if (err || !events || !events.length) return;
            events.sort(function(a, b) {
                if ((a.blockNum || 0) !== (b.blockNum || 0)) return (a.blockNum || 0) - (b.blockNum || 0);
                if ((a.txIndex || 0) !== (b.txIndex || 0)) return (a.txIndex || 0) - (b.txIndex || 0);
                return (a.opIndex || 0) - (b.opIndex || 0);
            });

            var grouped = {};
            var order = [];
            var state = StateEngine.getState();
            var currentBoss = state.worldBoss || bossState;
            for (var i = 0; i < events.length; i++) {
                var ev = events[i] || {};
                if (ev.type !== 'boss.attack') continue;
                var sender = ev.sender || '';
                var contrib = currentBoss.contributions && currentBoss.contributions[sender];
                if (contrib && contrib.lastAttackBlock && contrib.lastAttackBlock >= ev.blockNum) continue;
                var parsedAction = VMProtocol.parseAction(ev.raw && ev.raw.json ? ev.raw.json : JSON.stringify(ev.payload || {}));
                if (!parsedAction) continue;
                var block = ev.blockNum || 0;
                if (!grouped[block]) {
                    grouped[block] = { vmActions: [], voicePosts: [], veEvents: [], awards: [], blockHash: ev.block_id || ev.previous || '', blockNum: block, timestamp: ev.timestamp || '' };
                    order.push(block);
                }
                grouped[block].vmActions.push({ sender: sender, action: parsedAction, blockNum: block, blockHash: ev.block_id || ev.previous || '', timestamp: ev.timestamp || '', raw: ev.raw || {} });
            }
            if (!order.length) return;
            var emitted = [];
            for (var j = 0; j < order.length; j++) {
                var evts = StateEngine.processBlock(grouped[order[j]]) || [];
                emitted = emitted.concat(evts);
            }
            for (var k = 0; k < emitted.length; k++) {
                if (emitted[k].type) Helpers.EventBus.emit(emitted[k].type, emitted[k]);
            }
            StateEngine.saveCheckpoint(function() {});
            render();
        });
    }

    function _renderInactive(t, blockNum) {
        // Check when next boss spawns
        var bossEvent = (typeof WorldEvents !== 'undefined') ? WorldEvents.checkWorldBossWindow(blockNum) : null;
        var nextInfo = '';
        if (!bossEvent && typeof WorldEvents !== 'undefined') {
            var upcoming = WorldEvents.getUpcomingEvents(blockNum);
            for (var i = 0; i < upcoming.length; i++) {
                if (upcoming[i].type === 'world_boss') {
                    var hours = Math.floor(upcoming[i].blocksUntil * 3 / 3600);
                    nextInfo = '<p class="boss-next">' + t('boss_next_spawn') + ': ~' + hours + 'h</p>';
                    break;
                }
            }
        }

        return '<div class="boss-screen">' +
            '<h1>' + t('boss_title') + '</h1>' +
            '<div class="boss-dormant">' +
                '<div class="boss-icon-large" aria-hidden="true">\uD83D\uDC32</div>' +
                '<h2>' + t('boss_dormant') + '</h2>' +
                '<p>' + t('boss_dormant_desc') + '</p>' +
                '<blockquote class="boss-motto">' + t('boss_motto') + '</blockquote>' +
                _renderBossLore(t) +
                nextInfo +
            '</div>' +
        '</div>';
    }

    function _renderActive(t, status, blockNum) {
        var hpPct = status.hpPercent;
        var hpColor = hpPct > 50 ? 'var(--color-error)' : hpPct > 25 ? 'var(--color-warning)' : '#ff0000';
        var timeRemaining = Math.floor(status.blocksRemaining * 3 / 60);
        var timeStr = timeRemaining > 60 ? Math.floor(timeRemaining / 60) + 'h ' + (timeRemaining % 60) + 'm' : timeRemaining + 'm';

        var html = '<div class="boss-screen">' +
            '<h1>' + t('boss_title') + '</h1>' +

            // Boss portrait and HP
            '<div class="boss-portrait">' +
                '<div class="boss-icon-large" aria-hidden="true">\uD83D\uDC32</div>' +
                '<h2>' + t('npc_aether_dragon') + '</h2>' +
                '<div class="boss-timer">\u23F1 ' + t('boss_time_remaining') + ': ' + timeStr + '</div>' +
            '</div>' +

            _renderBossLore(t) +

            // HP bar
            '<div class="boss-hp-section">' +
                '<div class="boss-hp-bar" role="meter" aria-valuenow="' + status.currentHp + '" ' +
                    'aria-valuemin="0" aria-valuemax="' + status.maxHp + '" aria-label="Boss HP">' +
                    '<div class="boss-hp-fill" style="width:' + hpPct + '%;background:' + hpColor + '"></div>' +
                    '<span class="boss-hp-text">' + _formatNum(status.currentHp) + ' / ' + _formatNum(status.maxHp) + '</span>' +
                '</div>' +
                '<div class="boss-hp-meta">' +
                    '<span>' + t('boss_total_damage') + ': ' + _formatNum(status.totalDamage) + '</span>' +
                    '<span>' + t('boss_contributors') + ': ' + status.contributors + '</span>' +
                '</div>' +
            '</div>' +

            // Player contribution
            '<div class="boss-my-contribution">' +
                '<h3>' + t('boss_your_contribution') + '</h3>' +
                '<div class="boss-my-stats">' +
                    '<span>' + t('boss_damage_dealt') + ': ' + _formatNum(status.myDamage) + '</span>' +
                    '<span>' + t('boss_attacks') + ': ' + status.myAttacks + '</span>' +
                    '<span>' + t('boss_loot_share') + ': ' + status.mySharePercent + '%</span>' +
                '</div>' +
            '</div>' +

            // Attack button
            '<div class="boss-attack-section">' +
                '<button class="btn btn-primary btn-large btn-glow boss-attack-btn" id="boss-attack-btn">' +
                    '\u2694\uFE0F ' + t('boss_attack') +
                '</button>' +
                '<p class="boss-attack-cost">' + t('boss_attack_cost') + '</p>' +
            '</div>' +

            // Leaderboard
            '<div class="boss-leaderboard">' +
                '<h3>' + t('boss_leaderboard') + '</h3>' +
                _renderLeaderboard(status.leaderboard, t) +
            '</div>' +

            // Counterattack log
            '<div class="boss-counter-log" role="log" aria-live="polite" aria-label="' + t('boss_counter_log') + '">' +
                '<h3>' + t('boss_counter_log') + '</h3>' +
                _renderCounterLog(status.recentCounterattacks, t) +
            '</div>' +
        '</div>';

        return html;
    }

    function _renderDefeated(t, status, bossState) {
        var loot = WorldBoss.calculateLootDistribution ? WorldBoss.calculateLootDistribution(bossState) : WorldBoss.distributeLoot(bossState);

        var html = '<div class="boss-screen">' +
            '<h1>' + t('boss_title') + '</h1>' +
            '<div class="boss-defeated">' +
                '<div class="boss-icon-large defeated" aria-hidden="true">\uD83D\uDC32</div>' +
                '<h2>' + t('boss_defeated') + '!</h2>' +
                '<p>' + t('boss_defeated_desc') + '</p>' +
                '<blockquote class="boss-motto">' + t('boss_motto') + '</blockquote>' +
            '</div>' +

            '<div class="boss-loot-section">' +
                '<h3>' + t('boss_loot_distribution') + '</h3>';

        if (loot.length > 0) {
            html += '<ul class="boss-loot-list" role="list">';
            for (var i = 0; i < Math.min(loot.length, 20); i++) {
                var entry = loot[i];
                var isMe = entry.account === VizAccount.getCurrentUser();
                html += '<li class="boss-loot-entry' + (isMe ? ' boss-loot-me' : '') + '">' +
                    '<span class="loot-rank">#' + (i + 1) + '</span>' +
                    '<span class="loot-name">' + Helpers.escapeHtml(entry.account) + (isMe ? ' \u2B50' : '') + '</span>' +
                    '<span class="loot-damage">' + _formatNum(entry.damage) + ' ' + t('boss_damage_dealt') + '</span>' +
                    '<span class="loot-share">' + entry.sharePercent + '%</span>' +
                    '<span class="loot-xp">+' + entry.xpReward + ' XP</span>' +
                '</li>';
            }
            html += '</ul>';
        }

        html += '</div></div>';
        return html;
    }

    function _renderBossLore(t) {
        return '<section class="boss-lore" aria-label="' + t('boss_lore_title') + '">' +
            '<h3><span class="section-icon vmagic-breathe" aria-hidden="true">🕵️</span> ' + t('boss_lore_title') + '</h3>' +
            '<p>' + t('boss_lore_text') + '</p>' +
            '<ul>' +
                '<li>' + t('boss_lore_rule_1') + '</li>' +
                '<li>' + t('boss_lore_rule_2') + '</li>' +
                '<li>' + t('boss_lore_rule_3') + '</li>' +
            '</ul>' +
        '</section>';
    }

    function _renderLeaderboard(leaderboard, t) {
        if (leaderboard && leaderboard.length) {
            leaderboard = leaderboard.slice().sort(function(a, b) {
                if ((b.damage || 0) !== (a.damage || 0)) return (b.damage || 0) - (a.damage || 0);
                if ((b.attacks || 0) !== (a.attacks || 0)) return (b.attacks || 0) - (a.attacks || 0);
                return String(a.account || '').localeCompare(String(b.account || ''));
            });
        }
        if (!leaderboard || leaderboard.length === 0) {
            return '<p class="empty-state">' + t('boss_no_attackers') + '</p>';
        }
        var user = VizAccount.getCurrentUser();
        var html = '<ol class="boss-lb-list">';
        for (var i = 0; i < leaderboard.length; i++) {
            var entry = leaderboard[i];
            var isMe = entry.account === user;
            html += '<li class="boss-lb-entry' + (isMe ? ' boss-lb-me' : '') + '">' +
                '<span class="lb-name">' + Helpers.escapeHtml(entry.account) + '</span>' +
                '<span class="lb-damage">' + _formatNum(entry.damage) + '</span>' +
            '</li>';
        }
        html += '</ol>';
        return html;
    }

    function _renderCounterLog(log, t) {
        if (!log || log.length === 0) {
            return '<p class="empty-state">' + t('boss_no_attacks_yet') + '</p>';
        }
        var html = '<ul class="boss-counter-list">';
        for (var i = log.length - 1; i >= 0; i--) {
            html += '<li class="counter-entry">' +
                '\uD83D\uDC32 \u2192 ' + Helpers.escapeHtml(log[i].target) +
                ' (-' + log[i].damage + ' HP)' +
            '</li>';
        }
        html += '</ul>';
        return html;
    }

    /** Mana cost for a boss attack: 200 basis points = 2% */
    var BOSS_ATTACK_MANA = 200;

    function _bindActions(el, bossState, user, blockNum) {
        var attackBtn = el.querySelector('#boss-attack-btn');
        if (attackBtn) {
            attackBtn.addEventListener('click', function() {
                var character = StateEngine.getCharacter(user);
                if (!character) {
                    Toast.error(Helpers.t('quest_login_required'));
                    return;
                }

                attackBtn.disabled = true;

                // Check mana before attacking
                VizAccount.getAccount(user, function(err, accountData) {
                    var playerEnergy = 10000;
                    if (!err && accountData) {
                        playerEnergy = VizAccount.calculateCurrentEnergy(accountData);
                    }

                    if (playerEnergy < BOSS_ATTACK_MANA) {
                        attackBtn.disabled = false;
                        Toast.error(Helpers.t('hunt_not_enough_mana'));
                        return;
                    }

                    // Broadcast boss attack to blockchain
                    var actionData = VMProtocol.createBossAttackAction('attack');
                    VizBroadcast.gameAction(actionData, function(gameErr) {
                        if (gameErr) {
                            attackBtn.disabled = false;
                            Toast.error(Helpers.t('error_network'));
                            return;
                        }

                        // Award to boss account — this spends mana (200 bp = 2%)
                        // Award goes to the boss author (developer who created the boss)
                        var bossAuthor = bossState.author || WorldBoss.BOSS_ACCOUNT;
                        VizBroadcast.award(bossAuthor, BOSS_ATTACK_MANA, 0, '', [], function(awardErr) {
                            attackBtn.disabled = false;
                            if (awardErr) {
                                console.log('Boss award failed (attack still recorded):', awardErr);
                            }

                            SoundManager.play('boss_roar');
                            SoundManager.vibrate('heavy');

                            // Show estimated damage as feedback (actual damage applied by state-engine from blockchain)
                            var pot = (typeof CharacterSystem !== 'undefined' && CharacterSystem.getTotalStat)
                                ? CharacterSystem.getTotalStat(character, 'pot') : (character.pot || 10);
                            var estimatedDamage = pot * 5 + character.level * 10;
                            Toast.success(Helpers.t('boss_attack_success') + ' ~' + estimatedDamage + ' HP');
                            _schedulePostAttackRefresh();
                            render();
                        });
                    });
                });
            });
        }
    }

    function _formatNum(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return '' + n;
    }

    // Auto-refresh boss screen when boss events arrive from blockchain
    var _bossListenersRegistered = false;
    function _ensureBossListeners() {
        if (_bossListenersRegistered) return;
        _bossListenersRegistered = true;
        var bossEvents = ['boss_attacked', 'boss_defeated', 'world_boss_spawn'];
        for (var i = 0; i < bossEvents.length; i++) {
            Helpers.EventBus.on(bossEvents[i], function() {
                var el = Helpers.$('screen-world-boss');
                if (el && !el.getAttribute('aria-hidden')) {
                    render();
                }
            });
        }
    }
    _ensureBossListeners();

    return { render: render };
})();
