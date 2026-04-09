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
        var bossState = state.worldBoss || WorldBoss.getDefaultState();
        var status = WorldBoss.getBossStatus(bossState, user, blockNum);

        if (!status.active) {
            el.innerHTML = _renderInactive(t, blockNum);
        } else if (status.defeated) {
            el.innerHTML = _renderDefeated(t, status, bossState);
        } else {
            el.innerHTML = _renderActive(t, status, blockNum);
        }

        _bindActions(el, bossState, user, blockNum);
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
        var loot = WorldBoss.distributeLoot(bossState);

        var html = '<div class="boss-screen">' +
            '<h1>' + t('boss_title') + '</h1>' +
            '<div class="boss-defeated">' +
                '<div class="boss-icon-large defeated" aria-hidden="true">\uD83D\uDC32</div>' +
                '<h2>' + t('boss_defeated') + '!</h2>' +
                '<p>' + t('boss_defeated_desc') + '</p>' +
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

    function _renderLeaderboard(leaderboard, t) {
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

                // Broadcast boss attack to blockchain so all clients see the result
                var actionData = VMProtocol.createBossAttackAction('attack');
                VizBroadcast.gameAction(actionData, function(err) {
                    attackBtn.disabled = false;
                    if (err) {
                        Toast.error(Helpers.t('error_network'));
                        return;
                    }

                    SoundManager.play('boss_roar');
                    SoundManager.vibrate('heavy');

                    // Optimistic local update for immediate feedback
                    var pot = (typeof CharacterSystem !== 'undefined' && CharacterSystem.getTotalStat)
                        ? CharacterSystem.getTotalStat(character, 'pot') : (character.pot || 10);
                    var damage = pot * 5 + character.level * 10;
                    var result = WorldBoss.attackBoss(bossState, user, damage, 'attack', blockNum, '');
                    if (result.success) {
                        Toast.success(Helpers.t('boss_attack_success') + ' -' + result.damage + ' HP');
                        if (result.bossDefeated) {
                            Toast.success(Helpers.t('boss_defeated'));
                            SoundManager.play('duel_victory');
                        }
                    }
                    render();
                });
            });
        }
    }

    function _formatNum(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return '' + n;
    }

    return { render: render };
})();
