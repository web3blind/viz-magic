/**
 * Viz Magic — World Map Screen
 * Region list, territory control overlay, active sieges,
 * travel, creatures/resources/lore per location.
 */
var MapScreen = (function() {
    'use strict';

    var t = Helpers.t;

    /** Region emoji icons */
    var REGION_ICONS = {
        commons_first_light: '\uD83C\uDF1F',  // 🌟
        ember_wastes:        '\uD83D\uDD25',   // 🔥
        deep_currents:       '\uD83C\uDF0A',   // 🌊
        iron_root:           '\u26F0\uFE0F',    // ⛰️
        shattered_sky:       '\uD83C\uDF29\uFE0F', // 🌩️
        the_veil:            '\uD83C\uDF11',    // 🌑
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
        var currentZone = character ? character.currentZone : 'commons_first_light';
        var myGuild = null;
        if (user && state.guilds) {
            myGuild = GuildSystem.findGuildByMember(state.guilds, user);
        }

        var regions = GameRegions.getAll();

        var html = '';
        html += '<div class="map-screen" role="region" aria-label="' + t('map_title') + '">';
        html += '<h1>' + t('map_title') + '</h1>';

        // Current location
        if (character) {
            var curRegion = GameRegions.getRegion(currentZone);
            var curName = curRegion ? curRegion.name : currentZone;
            html += '<p class="map-current-location">' + t('map_current') + ': <strong>' + curName + '</strong></p>';
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

        for (var regionId in regions) {
            if (!regions.hasOwnProperty(regionId)) continue;
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

            html += '<section class="region-card' + (isCurrent ? ' region-current' : '') + ' ' + schoolCls + '" ';
            html += 'role="listitem" aria-label="' + region.name + '">';

            // Region header
            html += '<div class="region-header">';
            html += '<span class="region-icon" aria-hidden="true">' + icon + '</span>';
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
            if (!isCurrent && character) {
                html += '<button class="btn btn-primary btn-sm region-travel-btn" ';
                html += 'data-region="' + regionId + '" ';
                html += 'aria-label="' + t('map_travel_to') + ' ' + region.name + '">';
                html += '\uD83D\uDEB6 ' + t('map_travel') + ' (' + t('map_travel_cost') + ')';
                html += '</button>';
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
                _travelTo(regionId, user);
            });
        }
    }

    /**
     * Travel to a region (costs 1 Mana = 100 energy bp)
     */
    function _travelTo(regionId, user) {
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

        // Broadcast move action + award (1 Mana = 100 energy)
        var moveAction = {
            t: VizMagicConfig.ACTION_TYPES.MOVE,
            d: { zone: regionId }
        };

        VizBroadcast.gameAction(moveAction, function(err) {
            if (err) {
                Toast.error(t('error_network'));
            } else {
                Toast.success(t('map_traveled') + ' ' + region.name);
                SoundManager.play('transition');
                render();
            }
        });
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
