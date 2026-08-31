/**
 * Viz Magic — World Map Screen
 * Region list, territory control overlay, active sieges,
 * travel, creatures/resources/lore per location.
 */
var MapScreen = (function() {
    'use strict';

    var t = Helpers.t;
    var pendingTravel = null;
    var MAP_ASSET_VERSION = '20260826w';
    var PENDING_TRAVEL_TTL_MS = 5 * 60 * 1000;
    var TRAVEL_COST_LOW = 10;    // 0.1%
    var TRAVEL_COST_HIGH = 100;  // 1%
    var TRAVEL_COST_BURST = 300; // 3%
    var EXPLORATION_COSTS = [100, 300, 500, 700, 900, 1100];
    var TRAVEL_TREASURY = 'denis-skripnik'; // travel fee receiver (game account), same award pattern as hunt->author
    var TRAVEL_FIND_TYPES = ['shadow_shard', 'thorn_essence', 'ancient_shard', 'altar_spark', 'data_core'];

    /** Region emoji icons */
    var REGION_ICONS = {
        commons_first_light: 'spark',
        ember_wastes:        'spark',
        deep_currents:       'mana',
        iron_root:           'map',
        shattered_sky:       'weather',
        the_veil:            'prophecy',
        forklands:           'arena',
        covenant_bazaar:     'marketplace',
        duel_spires:         'arena',
        starfall_vault:      'xp',
        emberheart:          'hp',
        prismatic_depths:    'core',
        timeless_maze:       'chronicle',
        grandmaster_peak:    'leaderboard',
        void_sanctum:        'prophecy'
    };

    var WORLD_MAP_LEVEL_RANGES = {
        commons_first_light: '1-7',
        covenant_bazaar: '8-14',
        deep_currents: '15-21',
        ember_wastes: '22-28',
        duel_spires: '29-35',
        iron_root: '36-42',
        shattered_sky: '43-49',
        forklands: '50-56',
        the_veil: '57-63',
        starfall_vault: '64-70',
        emberheart: '71-77',
        prismatic_depths: '78-84',
        timeless_maze: '85-91',
        grandmaster_peak: '92-98',
        void_sanctum: '99-105'
    };

    function _regionLevelRange(region) {
        if (!region) return '';
        if (WORLD_MAP_LEVEL_RANGES[region.id]) return WORLD_MAP_LEVEL_RANGES[region.id];
        return region.minLevel + '-' + region.maxLevel;
    }

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
        html += '<h1>' + Helpers.icon('map', 'screen-title-icon vmagic-breathe') + ' ' + t('map_title') + '</h1>';
        // v133: travel explanation once under the page title, not repeated in every region block
        html += '<p class="map-travel-hint-page">' + t('map_travel_hint') +
            '<a href="#help-section-travel_exploration" class="help-nav-link map-help-link" data-help-section="travel_exploration">' +
            t('map_travel_help_link') + '</a>.</p>';

        if (character && pendingTravel && pendingTravel.account === user) {
            var pendingRegion = GameRegions.getRegion(pendingTravel.to);
            var pendingName = pendingRegion ? pendingRegion.name : pendingTravel.to;
            html += '<p class="map-siege-alert" role="status">⏳ ' + t('map_pending_travel_to') + ' <strong>' + pendingName + '</strong></p>';
        }

        // Active sieges summary
        var activeSieges = state.territories ? TerritorySystem.getAllActiveSieges(state.territories) : [];
        if (activeSieges.length > 0) {
            html += '<div class="map-siege-alert" role="alert" aria-label="' + t('map_active_sieges') + '">';
            html += Helpers.icon('arena', 'section-icon') + ' ' + t('map_active_sieges') + ': ' + activeSieges.length;
            html += '</div>';
        }

        // Region list
        html += '<div class="region-list" role="list" aria-label="' + t('map_regions') + '">';

        for (var ri = 0; ri < regionIds.length; ri++) {
            var regionId = regionIds[ri];
            var region = regions[regionId];
            var territory = state.territories ? state.territories[regionId] : null;
            var icon = REGION_ICONS[regionId] || 'map';
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
            html += Helpers.icon(icon, 'region-icon vmagic-breathe');
            html += '<div class="region-info">';
            // v134: region names become active links that open a lore "map" modal
            html += '<button type="button" class="region-name region-lore-link" data-lore-region="' + regionId + '" ';
            html += 'aria-label="' + t('map_view_lore') + ' ' + region.name + '">' + region.name + '</button>';
            html += '<span class="region-level">' + t('map_level') + ' ' + _regionLevelRange(region) + '</span>';
            if (region.school) {
                html += ' <span class="region-school">' + t('school_' + region.school) + '</span>';
            }
            if (region.pvpEnabled) {
                html += ' <span class="region-pvp">' + t('map_pvp') + '</span>';
            }
            html += '</div>';
            if (isCurrent) {
                html += '<span class="region-here">' + Helpers.icon('compass', 'region-status-icon') + ' ' + t('map_you_are_here') + '</span>';
            }
            html += '</div>';

            // Description
            html += '<p class="region-desc">' + region.description + '</p>';

            // v134: lore snippet under each block header — a flavor "card" describing the region as a painted map
            html += '<p class="region-lore">' + t('map_lore_' + regionId) + '</p>';

            // Territory control overlay
            if (controllerGuildObj) {
                html += '<div class="region-controller">';
                html += Helpers.icon('guild', 'region-status-icon') + ' ' + t('map_controlled_by') + ': ';
                html += '<strong>[' + _esc(controllerGuildObj.tag) + '] ' + _esc(controllerGuildObj.name) + '</strong>';
                html += '</div>';
            }

            // Active siege indicator
            if (siegeCount > 0) {
                html += '<div class="region-siege-indicator">';
                html += Helpers.icon('arena', 'region-status-icon') + ' ' + t('territory_under_siege') + ' (' + siegeCount + ')';
                html += '</div>';
            }

            // Benefits display
            if (benefits && benefits.homeBonus > 0) {
                html += '<div class="region-benefits">';
                html += Helpers.icon('spark', 'region-status-icon') + ' +' + Math.floor(benefits.homeBonus / 10) + '% ' + t('map_home_bonus');
                html += '</div>';
            } else if (benefits && benefits.tax > 0) {
                html += '<div class="region-tax">';
                html += Helpers.icon('marketplace', 'region-status-icon') + ' ' + t('map_tax') + ': ' + (benefits.tax / 100) + '%';
                html += '</div>';
            }

            // Travel remains available in every region block, including the current one.
            // Reward-bearing exploration is presented only on the current region and
            // stays disabled until deterministic entropy and payment verification ship.
            if (pendingTravel && pendingTravel.account === user && regionId === pendingTravel.to) {
                html += '<div class="region-benefits" role="status">⏳ ' + t('map_pending_travel_short') + '</div>';
            } else if (character && !(pendingTravel && pendingTravel.account === user)) {
                html += '<div class="region-action-group region-travel-group">';
                html += '<span class="energy-path-shimmer" aria-hidden="true"></span>';
                html += '<div class="map-action-heading" role="heading" aria-level="3">' + t('map_travel_heading') + '</div>';
                html += '<div class="region-travel-options">';
                html += '<button class="btn btn-secondary btn-sm region-travel-btn" ';
                html += 'data-region="' + regionId + '" data-cost="' + TRAVEL_COST_LOW + '" ';
                html += 'aria-label="' + t('map_travel_to') + ' ' + region.name + ' ' + Helpers.manaCost(TRAVEL_COST_LOW) + '">';
                html += Helpers.icon('map', 'travel-icon') + ' ' + Helpers.manaCost(TRAVEL_COST_LOW);
                html += '</button>';
                html += '</div>';
                html += '</div>';

                if (isCurrent) {
                    var explorationNoteId = 'map-exploration-note-' + regionId;
                    html += '<div class="region-action-group region-exploration-group">';
                    html += '<div class="map-action-heading map-exploration-heading" role="heading" aria-level="3">' + t('map_exploration_heading') + '</div>';
                    html += '<span class="sr-only" id="' + explorationNoteId + '">' + t('map_exploration_unavailable') + '</span>';
                    html += '<div class="region-exploration-options">';
                    for (var ec = 0; ec < EXPLORATION_COSTS.length; ec++) {
                        var explorationCost = EXPLORATION_COSTS[ec];
                        html += '<button type="button" class="btn btn-secondary btn-sm region-exploration-btn" disabled ';
                        html += 'aria-describedby="' + explorationNoteId + '" ';
                        html += 'aria-label="' + t('map_exploration_heading') + ' ' + Helpers.manaCost(explorationCost) + '. ' + t('map_exploration_unavailable') + '">';
                        html += Helpers.manaCost(explorationCost);
                        html += '</button>';
                    }
                    html += '</div>';
                    html += '</div>';
                }
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
        var helpLinks = container.querySelectorAll('.map-help-link');
        for (var h = 0; h < helpLinks.length; h++) {
            helpLinks[h].addEventListener('click', function(e) {
                if (e && e.preventDefault) e.preventDefault();
                var helpSection = this.getAttribute('data-help-section');
                Helpers.EventBus.emit('navigate', 'help');
                setTimeout(function() {
                    var target = Helpers.$('help-section-' + helpSection);
                    if (!target) return;
                    if (target.scrollIntoView) target.scrollIntoView({ block: 'start' });
                    if (target.focus) target.focus();
                }, 0);
            });
        }

        var travelBtns = container.querySelectorAll('.region-travel-btn');
        for (var i = 0; i < travelBtns.length; i++) {
            travelBtns[i].addEventListener('click', function() {
                var regionId = this.getAttribute('data-region');
                var cost = parseInt(this.getAttribute('data-cost'), 10) || TRAVEL_COST_HIGH;
                _travelTo(regionId, user, cost);
            });
        }
        // v134: region names are active links that open a lore "map" card
        var loreLinks = container.querySelectorAll('.region-lore-link');
        for (var l = 0; l < loreLinks.length; l++) {
            loreLinks[l].addEventListener('click', function() {
                var regionId = this.getAttribute('data-lore-region');
                _openLore(regionId);
            });
        }
    }

    /**
     * v134: show the painted-map style description of a region in a modal,
     * sized to the in-game tab, with a Close button.
     */
    function _openLore(regionId) {
        var region = GameRegions.getRegion(regionId);
        if (!region) return;
        var icon = REGION_ICONS[regionId] || 'map';
        var loreText = t('map_lore_' + regionId);
        var html = '<div class="lore-map-card">';
        html += '<div class="lore-map-title">' + Helpers.icon(icon, 'region-icon vmagic-breathe') + ' ' + region.name + '</div>';
        html += '<div class="lore-map-level">' + t('map_level') + ' ' + _regionLevelRange(region) + '</div>';
        // v144: show the current painted-map image with a cache-busting version.
        // Portal guidance is visual inside the artwork; no extra hint text is shown here.
        html += '<div class="lore-map-viewport" id="lore-map-viewport">';
        html += '<img class="lore-map-image" id="lore-map-image" src="assets/maps/map-' + regionId + '.jpg?v=' + MAP_ASSET_VERSION + '" alt="' + t('map_lore_image_alt', { name: region.name }) + '" loading="lazy" onerror="this.style.display=\'none\';var nx=document.getElementById(\'lore-fallback\');if(nx)nx.style.display=\'block\';">';
        html += '<span class="energy-path-shimmer energy-path-shimmer-map" aria-hidden="true"></span>';
        html += '</div>';
        html += '<p class="lore-map-text" id="lore-fallback" style="display:none">' + loreText + '</p>';
        html += '<div class="modal-actions lore-map-actions"><button type="button" class="btn btn-secondary" id="lore-zoom-toggle">' + t('map_zoom_toggle') + '</button><button type="button" class="btn btn-primary" id="lore-close">' + t('close') + '</button></div>';
        html += '</div>';
        ModalComponent.show(html);
        var modal = Helpers.$('modal-container');
        var viewport = Helpers.$('lore-map-viewport');
        var zoomBtn = Helpers.$('lore-zoom-toggle');
        if (zoomBtn && viewport && modal) {
            zoomBtn.addEventListener('click', function() {
                modal.classList.add('lore-map-fullscreen');
                viewport.classList.add('zoomed');
            });
            viewport.addEventListener('click', function(e) {
                if (modal.classList.contains('lore-map-fullscreen')) {
                    e.preventDefault();
                    _closeLoreFullscreen(modal, viewport);
                }
            });
        }
        var closeBtn = Helpers.$('lore-close');
        if (closeBtn) closeBtn.addEventListener('click', function() {
            if (modal && modal.classList.contains('lore-map-fullscreen')) {
                _closeLoreFullscreen(modal, viewport);
                return;
            }
            ModalComponent.hide();
        });
    }

    function _closeLoreFullscreen(modal, viewport) {
        if (modal) modal.classList.remove('lore-map-fullscreen');
        if (viewport) viewport.classList.remove('zoomed');
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
