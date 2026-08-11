/**
 * Viz Magic — World Map Screen
 * Region list, territory control overlay, active sieges,
 * travel, creatures/resources/lore per location.
 */
var MapScreen = (function() {
    'use strict';

    var t = Helpers.t;
    var pendingTravel = null;
    var PENDING_TRAVEL_TTL_MS = 5 * 60 * 1000;
    var TRAVEL_COST_LOW = 10;    // 0.1%
    var TRAVEL_COST_HIGH = 100;  // 1%
    var TRAVEL_COST_BURST = 300; // 3%
    var TRAVEL_TREASURY = 'denis-skripnik'; // travel fee receiver (game account), same award pattern as hunt->author
    var TRAVEL_FIND_TYPES = ['shadow_shard', 'thorn_essence', 'ancient_shard', 'altar_spark', 'data_core'];

    /** Region emoji icons */
    var REGION_ICONS = {
        commons_first_light: '\uD83C\uDF1F',  // 🌟
        ember_wastes:        '\uD83D\uDD25',   // 🔥
        deep_currents:       '\uD83C\uDF0A',   // 🌊
        iron_root:           '\u26F0\uFE0F',    // ⛰️
        shattered_sky:       '\uD83C\uDF29\uFE0F', // 🌩️
        the_veil:            '\uD83C\uDF19',    // 🌙
        forklands:           '\u2694\uFE0F',    // ⚔️
        covenant_bazaar:     '\uD83C\uDFEA',   // 🏪
        duel_spires:         '\uD83C\uDFF0'    // 🏰
    };

    /** School colors for territory display */
    function render() {
        var container = Helpers.$('screen-map');
        if (!container) return;

        var user = VizAccount.getCurrentUser();
        var state = StateEngine.getState();
        var character = state.characters ? state.characters[user] : null;
        var confirmedZone = character ? character.currentZone : 'commons_first_light';
        if (pendingTravel && pendingTravel.account === user && pendingTravel.to === confirmedZone) {
            pendingTravel = null;
        } else if (pendingTravel && pendingTravel.account === user && pendingTravel.at && (Date.now() - pendingTravel.at) > PENDING_TRAVEL_TTL_MS) {
            pendingTravel = null;
        }
        var currentZone = confirmedZone;
        var myGuild = null;
        if (user && state.guilds) {
            myGuild = GuildSystem.findGuildByMember(state.guilds, user);
        }

        var regions = GameRegions.getAll();
        var regionIds = [];
        for (var rid in regions) {
            if (regions.hasOwnProperty(rid)) regionIds.push(rid);
        }
        regionIds.sort(function(a, b) {
            var ar = regions[a] || {};
            var br = regions[b] || {};
            if ((ar.minLevel || 0) !== (br.minLevel || 0)) {
                return (ar.minLevel || 0) - (br.minLevel || 0);
            }
            if ((ar.maxLevel || 0) !== (br.maxLevel || 0)) {
                return (ar.maxLevel || 0) - (br.maxLevel || 0);
            }
            return String(ar.name || a).localeCompare(String(br.name || b));
        });

        var html = '';
        html += '<div class="map-screen" role="region" aria-label="' + t('map_title') + '">';
        html += '<h1><span class="screen-title-icon vmagic-breathe" aria-hidden="true">🗺️</span> ' + t('map_title') + '</h1>';

        // Current location
        if (character) {
            var curRegion = GameRegions.getRegion(currentZone);
            var curName = curRegion ? curRegion.name : currentZone;
            html += '<p class="map-current-location">' + t('map_current') + ': <strong>' + curName + '</strong></p>';
            if (pendingTravel && pendingTravel.account === user) {
                var pendingRegion = GameRegions.getRegion(pendingTravel.to);
                var pendingName = pendingRegion ? pendingRegion.name : pendingTravel.to;
                html += '<p class="map-siege-alert" role="status">⏳ ' + t('map_pending_travel_to') + ' <strong>' + pendingName + '</strong></p>';
            }
        }

        // Active sieges summary
        var activeSieges = state.territories ? TerritorySystem.getAllActiveSieges(state.territories) : [];
        if (activeSieges.length > 0) {
            html += '<div class="map-siege-alert" role="alert" aria-label="' + t('map_active_sieges') + '">';
            html += '\u2694\uFE0F ' + t('map_active_sieges') + ': ' + activeSieges.length;
            html += '</div>';
        }

        // Region list
        html += '<div class="region-list" role="list" aria-label="' + t('map_regions') + '">';

        for (var ri = 0; ri < regionIds.length; ri++) {
            var regionId = regionIds[ri];
            var region = regions[regionId];
            var territory = state.territories ? state.territories[regionId] : null;
            var icon = REGION_ICONS[regionId] || '\uD83C\uDF0D';
            var isCurrent = regionId === currentZone;
            var controllerGuild = territory ? territory.controllerGuild : null;
            var controllerGuildObj = controllerGuild && state.guilds ? state.guilds[controllerGuild] : null;
            var hasSiege = territory && territory.activeSieges;
            var siegeCount = 0;
            if (hasSiege) {
                for (var s = 0; s < territory.activeSieges.length; s++) {
                    if (territory.activeSieges[s].state === 'active') siegeCount++;
                }
            }

            // Territory benefits for my guild
            var benefits = null;
            if (territory && myGuild) {
                benefits = TerritorySystem.getTerritoryBenefits(territory, myGuild.id);
            }

            var schoolCls = region.school ? Helpers.schoolClass(region.school) : '';

            html += '<section class="region-card region-card-' + regionId + (isCurrent ? ' region-current' : '') + ' ' + schoolCls + '" ';
            html += 'role="listitem" data-region="' + regionId + '" aria-label="' + region.name + '">';

            // Region header
            html += '<div class="region-header">';
            html += '<span class="region-icon vmagic-breathe" aria-hidden="true">' + icon + '</span>';
            html += '<div class="region-info">';
            html += '<h2 class="region-name">' + region.name + '</h2>';
            html += '<span class="region-level">' + t('map_level') + ' ' + region.minLevel + '-' + region.maxLevel + '</span>';
            if (region.school) {
                html += ' <span class="region-school">' + t('school_' + region.school) + '</span>';
            }
            if (region.pvpEnabled) {
                html += ' <span class="region-pvp">' + t('map_pvp') + '</span>';
            }
            html += '</div>';
            if (isCurrent) {
                html += '<span class="region-here" aria-label="' + t('map_you_are_here') + '">\uD83D\uDCCD</span>';
            }
            html += '</div>';

            // Description
            html += '<p class="region-desc">' + region.description + '</p>';

            // Territory control overlay
            if (controllerGuildObj) {
                html += '<div class="region-controller">';
                html += '\uD83C\uDFF3\uFE0F ' + t('map_controlled_by') + ': ';
                html += '<strong>[' + _esc(controllerGuildObj.tag) + '] ' + _esc(controllerGuildObj.name) + '</strong>';
                html += '</div>';
            }

            // Active siege indicator
            if (siegeCount > 0) {
                html += '<div class="region-siege-indicator">';
                html += '\u2694\uFE0F ' + t('territory_under_siege') + ' (' + siegeCount + ')';
                html += '</div>';
            }

            // Benefits display
            if (benefits && benefits.homeBonus > 0) {
                html += '<div class="region-benefits">';
                html += '\u2728 +' + Math.floor(benefits.homeBonus / 10) + '% ' + t('map_home_bonus');
                html += '</div>';
            } else if (benefits && benefits.tax > 0) {
                html += '<div class="region-tax">';
                html += '\uD83D\uDCB0 ' + t('map_tax') + ': ' + (benefits.tax / 100) + '%';
                html += '</div>';
            }

            // Travel button
            if (pendingTravel && pendingTravel.account === user && regionId === pendingTravel.to) {
                html += '<div class="region-benefits" role="status">⏳ ' + t('map_pending_travel_short') + '</div>';
            } else if (!isCurrent && character && !(pendingTravel && pendingTravel.account === user)) {
                html += '<div class="region-travel-options">';
                html += '<button class="btn btn-secondary btn-sm region-travel-btn" ';
                html += 'data-region="' + regionId + '" data-cost="' + TRAVEL_COST_LOW + '" ';
                html += 'aria-label="' + t('map_travel_to') + ' ' + region.name + ' ' + Helpers.manaCost(TRAVEL_COST_LOW) + '">';
                html += '\uD83D\uDEB6 ' + Helpers.manaCost(TRAVEL_COST_LOW);
                html += '</button>';
                html += '<button class="btn btn-primary btn-sm region-travel-btn" ';
                html += 'data-region="' + regionId + '" data-cost="' + TRAVEL_COST_HIGH + '" ';
                html += 'aria-label="' + t('map_travel_to') + ' ' + region.name + ' ' + Helpers.manaCost(TRAVEL_COST_HIGH) + '">';
                html += '\uD83D\uDEB6 ' + Helpers.manaCost(TRAVEL_COST_HIGH);
                html += '</button>';
                html += '<button class="btn btn-secondary btn-sm region-travel-btn" ';
                html += 'data-region="' + regionId + '" data-cost="' + TRAVEL_COST_BURST + '" ';
                html += 'aria-label="' + t('map_travel_to') + ' ' + region.name + ' ' + Helpers.manaCost(TRAVEL_COST_BURST) + '">';
                html += '\uD83D\uDEB6 ' + Helpers.manaCost(TRAVEL_COST_BURST);
                html += '</button>';
                html += '</div>';
                html += '<p class="region-travel-hint">' + t('map_travel_hint') + '</p>';
            }

            html += '</section>';
        }

        html += '</div>';
        html += '</div>';

        container.innerHTML = html;
        _bindEvents(container, user, state);
    }

    /**
     * Bind map events
     */
    function _bindEvents(container, user, state) {
        var travelBtns = container.querySelectorAll('.region-travel-btn');
        for (var i = 0; i < travelBtns.length; i++) {
            travelBtns[i].addEventListener('click', function() {
                var regionId = this.getAttribute('data-region');
                var cost = parseInt(this.getAttribute('data-cost'), 10) || TRAVEL_COST_HIGH;
                _travelTo(regionId, user, cost);
            });
        }
    }

    /**
     * Travel to a region
     * @param {string} regionId
     * @param {string} user
     * @param {number} cost - energy cost in basis points (10 = 0.1%, 100 = 1%)
     */
    function _travelTo(regionId, user, cost) {
        if (!user) {
            Toast.error(t('error_no_account'));
            return;
        }

        var region = GameRegions.getRegion(regionId);
        if (!region) return;

        // Check level requirements
        var character = StateEngine.getCharacter(user);
        if (character && character.level < region.minLevel) {
            Toast.error(t('map_level_too_low'));
            return;
        }

        if (_dailyQuestAlreadyVisitedRegion(user, regionId)) {
            Toast.info(t('map_region_already_visited_today'));
        }

        // Travel costs energy (same award pattern as hunt pays the creature's author).
        VizAccount.getAccount(user, function(err, accountData) {
            var playerEnergy = 10000;
            if (!err && accountData) {
                playerEnergy = VizAccount.calculateCurrentEnergy(accountData);
            }
            if (playerEnergy < cost) {
                Toast.error(t('map_not_enough_energy'));
                return;
            }

            // Broadcast move action
            var moveAction = {
                t: VizMagicConfig.ACTION_TYPES.MOVE,
                d: { zone: regionId }
            };
            var previousZone = character ? character.currentZone : '';

            VizBroadcast.gameAction(moveAction, function(err2) {
                if (err2) {
                    Toast.error(t('error_network'));
                    return;
                }

                var stateAfterMove = StateEngine.getState();
                var optimisticBlock = (stateAfterMove.headBlock || 0) + 1;
                StateEngine.processMoveResult(user, regionId, optimisticBlock);
                stateAfterMove.headBlock = Math.max(stateAfterMove.headBlock || 0, optimisticBlock);
                pendingTravel = { account: user, from: previousZone, to: regionId, at: Date.now() };
                Toast.success(t('map_traveled') + ' ' + region.name);
                SoundManager.play('transition');
                try {
                    CheckpointSystem.saveCheckpoint('global', stateAfterMove.headBlock || optimisticBlock, stateAfterMove, function() {});
                } catch (e) {}

                // Pay travel fee: energy goes to the game account (like hunt->author award).
                if (cost > 0) {
                    VizBroadcast.award(TRAVEL_TREASURY, cost, 0, 'viz://vm/travel/ ' + regionId, [], function(awardErr) {
                        if (awardErr) {
                            Toast.info(t('map_travel_fee_failed'));
                        }
                    });
                }

                // Higher energy investment -> chance of a travelling find.
                _grantTravelFind(user, cost, optimisticBlock);

                render();
            });
        });
    }

        function _rollTravelFind(cost) {
        var t = Helpers.t;
        if (cost >= 300) {
            if (Math.random() >= 0.7) return null;
            var doubled = Math.random() < 0.3;
            var type = TRAVEL_FIND_TYPES[Math.floor(Math.random() * TRAVEL_FIND_TYPES.length)];
            var name = Helpers.t('item_' + type) || type;
            if (doubled) return { type: type, rarity: 2, msg: t('map_find_double', { item: name }) };
            return { type: type, rarity: 1, msg: t('map_find_item', { item: name }) };
        }
        if (cost >= 100) {
            if (Math.random() >= 0.35) return null;
            var type2 = TRAVEL_FIND_TYPES[Math.floor(Math.random() * TRAVEL_FIND_TYPES.length)];
            return { type: type2, rarity: 1, msg: t('map_find_item', { item: Helpers.t('item_' + type2) || type2 }) };
        }
        return null;
    }

    function _grantTravelFind(user, cost, blockNum) {
        var t = Helpers.t;
        var find = _rollTravelFind(cost);
        if (!find || !user) return;
        var state = StateEngine.getState();
        var inv = state.inventories && state.inventories[user];
        if (!inv) {
            inv = [];
            if (!state.inventories) state.inventories = {};
            state.inventories[user] = inv;
        }
        var item = ItemSystem.createItem(find.type, user, find.rarity, blockNum || 0, '', true);
        inv.push(item);
        try {
            CheckpointSystem.saveCheckpoint('global', state.headBlock || blockNum || 0, state, function() {});
        } catch (e) {}
        Toast.success(find.msg);
    }

    function _dailyQuestAlreadyVisitedRegion(user, regionId) {
        if (!user || !regionId) return false;
        var state = StateEngine.getState();
        var quests = state && state.quests && state.quests[user] ? state.quests[user] : null;
        var active = quests && quests.active ? quests.active : [];
        for (var i = 0; i < active.length; i++) {
            var quest = active[i];
            if (!quest || quest.completed || !quest.isDaily) continue;
            var objectives = quest.objectives || [];
            for (var j = 0; j < objectives.length; j++) {
                var obj = objectives[j];
                if (!obj || obj.type !== 'explore' || !obj.uniqueTarget) continue;
                var seen = obj.seenTargets || [];
                for (var k = 0; k < seen.length; k++) {
                    if (seen[k] === regionId) return true;
                }
            }
        }
        return false;
    }

    /**
     * Escape HTML
     */
    function _esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    return { render: render };
})();
