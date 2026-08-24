/**
 * Viz Magic — Magical Guide Screen
 */
var HelpScreen = (function() {
    'use strict';

    var HELP_LIBRARY_ASSET_VERSION = '20260817d';
    var HELP_SECRET_LIBRARY_ASSET_VERSION = '20260822a';
    var HELP_UNKNOWN_LIBRARY_ASSET_VERSION = '20260824a';
    var secretLibraryBusy = false;
    var unknownLibraryBusy = false;
    var secretLibraryExpiryTimer = null;
    var HELP_LIBRARY_MAPS = [
        { id: 'commons_first_light', title: 'The Commons of First Light Ур. 1-10' },
        { id: 'covenant_bazaar', title: 'The Covenant Bazaar Ур. 3-50' },
        { id: 'deep_currents', title: 'The Deep Currents Ур. 5-20' },
        { id: 'ember_wastes', title: 'The Ember Wastes Ур. 5-20' },
        { id: 'duel_spires', title: 'The Duel Spires Ур. 5-50' },
        { id: 'iron_root', title: 'The Iron Root Ур. 10-25' },
        { id: 'shattered_sky', title: 'The Shattered Sky Ур. 12-25' },
        { id: 'forklands', title: 'The Forklands Ур. 15-50' },
        { id: 'the_veil', title: 'The Veil Ур. 18-30' },
        { id: 'starfall_vault', title: 'The Starfall Vault Ур. 51-60' },
        { id: 'emberheart', title: 'The Emberheart Ур. 61-70' },
        { id: 'prismatic_depths', title: 'The Prismatic Depths Ур. 71-80' },
        { id: 'timeless_maze', title: 'The Timeless Maze Ур. 81-90' },
        { id: 'grandmaster_peak', title: 'The Grandmaster Peak Ур. 91-100' },
        { id: 'void_sanctum', title: 'The Void Sanctum Ур. 101+' }
    ];
    var HELP_SECRET_LIBRARY_MAPS = [
        { id: '01', titleKey: 'help_secret_map_01_title', textKey: 'help_secret_map_01_text' },
        { id: '02', titleKey: 'help_secret_map_02_title', textKey: 'help_secret_map_02_text' },
        { id: '03', titleKey: 'help_secret_map_03_title', textKey: 'help_secret_map_03_text' },
        { id: '04', titleKey: 'help_secret_map_04_title', textKey: 'help_secret_map_04_text' },
        { id: '05', titleKey: 'help_secret_map_05_title', textKey: 'help_secret_map_05_text' },
        { id: '06', titleKey: 'help_secret_map_06_title', textKey: 'help_secret_map_06_text' },
        { id: '07', titleKey: 'help_secret_map_07_title', textKey: 'help_secret_map_07_text' },
        { id: '08', titleKey: 'help_secret_map_08_title', textKey: 'help_secret_map_08_text' },
        { id: '09', titleKey: 'help_secret_map_09_title', textKey: 'help_secret_map_09_text' },
        { id: '10', titleKey: 'help_secret_map_10_title', textKey: 'help_secret_map_10_text' },
        { id: '11', titleKey: 'help_secret_map_11_title', textKey: 'help_secret_map_11_text' },
        { id: '12', titleKey: 'help_secret_map_12_title', textKey: 'help_secret_map_12_text' },
        { id: '13', titleKey: 'help_secret_map_13_title', textKey: 'help_secret_map_13_text' },
        { id: '14', titleKey: 'help_secret_map_14_title', textKey: 'help_secret_map_14_text' },
        { id: '15', titleKey: 'help_secret_map_15_title', textKey: 'help_secret_map_15_text' }
    ];
    var HELP_UNKNOWN_LIBRARY_MAPS = [
        { id: '13', titleKey: 'help_unknown_map_13_title', textKey: 'help_unknown_map_13_text' },
        { id: '14', titleKey: 'help_unknown_map_14_title', textKey: 'help_unknown_map_14_text' },
        { id: '09', titleKey: 'help_unknown_map_09_title', textKey: 'help_unknown_map_09_text' },
        { id: '10', titleKey: 'help_unknown_map_10_title', textKey: 'help_unknown_map_10_text' },
        { id: '11', titleKey: 'help_unknown_map_11_title', textKey: 'help_unknown_map_11_text' },
        { id: '06', titleKey: 'help_unknown_map_06_title', textKey: 'help_unknown_map_06_text' },
        { id: '01', titleKey: 'help_unknown_map_01_title', textKey: 'help_unknown_map_01_text' },
        { id: '02', titleKey: 'help_unknown_map_02_title', textKey: 'help_unknown_map_02_text' },
        { id: '03', titleKey: 'help_unknown_map_03_title', textKey: 'help_unknown_map_03_text' },
        { id: '04', titleKey: 'help_unknown_map_04_title', textKey: 'help_unknown_map_04_text' }
    ];
    var HELP_UNKNOWN_LIBRARY_FADING_MAPS = [
        { id: '15', titleKey: 'help_unknown_map_15_title', textKey: 'help_unknown_map_15_text' },
        { id: '12', titleKey: 'help_unknown_map_12_title', textKey: 'help_unknown_map_12_text' },
        { id: '07', titleKey: 'help_unknown_map_07_title', textKey: 'help_unknown_map_07_text' },
        { id: '08', titleKey: 'help_unknown_map_08_title', textKey: 'help_unknown_map_08_text' },
        { id: '05', titleKey: 'help_unknown_map_05_title', textKey: 'help_unknown_map_05_text' }
    ];

    function render() {
        var t = Helpers.t;
        var el = Helpers.$('screen-help');
        if (!el) return;

        var sections = [
            { key: 'mana',        icon: 'mana' },
            { key: 'hp',          icon: 'hp' },
            { key: 'quests',      icon: 'quests' },
            { key: 'travel_exploration', icon: 'map' },
            { key: 'hunt',        icon: 'hunt' },
            { key: 'armageddon',  icon: 'boss' },
            { key: 'crafting',    icon: 'crafting' },
            { key: 'marketplace', icon: 'marketplace' },
            { key: 'leaderboard', icon: 'leaderboard' },
            { key: 'narrator',    icon: 'news' },
            { key: 'classes',     icon: 'character' },
            { key: 'magic_ranks', icon: 'leaderboard' },
            { key: 'duels',       icon: 'arena' },
            { key: 'guilds',      icon: 'guild' },
            { key: 'boss',        icon: 'boss' },
            { key: 'temple',      icon: 'temple' },
            { key: 'shares',      icon: 'core' },
            { key: 'blockchain',  icon: 'link' }
        ];

        var html = '<div class="help-screen magical-guide-screen">' +
            '<article class="help-book" aria-labelledby="magical-guide-title">' +
                '<div class="help-book-binding" aria-hidden="true"></div>' +
                '<header class="help-book-cover">' +
                    '<h1 id="magical-guide-title">' + Helpers.icon('help', 'screen-title-icon vmagic-breathe') + ' ' + t('help_title') + '</h1>' +
                    '<p class="help-intro">' + t('help_intro') + '</p>' +
                '</header>' +
                '<section class="help-practical-pages" aria-label="' + t('help_practical_label') + '">' +
                    '<h2 class="help-book-chapter">' + Helpers.icon('chronicle', 'section-icon vmagic-breathe') + ' ' + t('help_practical_title') + '</h2>';

        for (var i = 0; i < sections.length; i++) {
            var s = sections[i];
            html += '<section class="help-section help-page" aria-label="' + t('help_section_' + s.key) + '">' +
                '<h3 id="help-section-' + s.key + '" tabindex="-1">' + Helpers.icon(s.icon, 'section-icon vmagic-breathe') + ' ' + t('help_section_' + s.key) + '</h3>' +
                '<p>' + t('help_' + s.key + '_text') + '</p>' +
                '</section>';
        }

        html += '</section>' + _renderLorePages(t) + '</article></div>';
        el.innerHTML = html;
        _bindNavLinks(el);
        _bindLibraryLinks(el);
        _bindSecretLibrary(el);
        _bindUnknownLibrary(el);
        _scheduleSecretLibraryExpiry();
    }

    function _scheduleSecretLibraryExpiry() {
        if (secretLibraryExpiryTimer) clearTimeout(secretLibraryExpiryTimer);
        secretLibraryExpiryTimer = setTimeout(function() {
            secretLibraryExpiryTimer = null;
            if (document.querySelector('.help-secret-library-map-card, .help-unknown-library-map-card')) ModalComponent.hide();
            render();
        }, StateEngine.getLibraryMidnightDelay());
    }

    function _bindNavLinks(el) {
        var links = el.querySelectorAll('.help-nav-link');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', function() {
                var target = this.getAttribute('data-help-nav');
                if (target) {
                    if (typeof SoundManager !== 'undefined') SoundManager.play('tap');
                    Helpers.EventBus.emit('navigate', target);
                }
            });
        }
    }

    function _bindLibraryLinks(el) {
        var links = el.querySelectorAll('.help-library-link');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', function() {
                var id = this.getAttribute('data-library-map');
                var entry = _findLibraryEntry(id);
                if (entry) {
                    if (typeof SoundManager !== 'undefined') SoundManager.play('tap');
                    _openLibraryMap(entry);
                }
            });
        }
    }

    function _renderLorePages(t) {
        return '<section class="help-lore-pages" aria-label="' + t('help_lore_label') + '">' +
            '<h2 class="help-book-chapter">' + Helpers.icon('spark', 'section-icon vmagic-breathe') + ' ' + t('help_lore_title') + '</h2>' +
            '<p class="help-lore-intro">' + t('help_lore_intro') + '</p>' +
            '<div class="help-lore-page-grid">' +
                '<article class="help-lore-page">' +
                    '<h3>' + Helpers.icon('weather', 'section-icon vmagic-breathe') + ' ' + t('help_section_world_days') + '</h3>' +
                    '<p>' + t('help_world_days_text') + '</p>' +
                '</article>' +
                '<article class="help-lore-page">' +
                    '<h3>' + Helpers.icon('festival', 'section-icon vmagic-breathe') + ' ' + t('help_section_world_months') + '</h3>' +
                    '<p>' + t('help_world_months_text') + '</p>' +
                '</article>' +
            '</div>' + _renderMagicLibrary(t) + _renderSecretLibrary(t) + _renderUnknownLibrary(t) + '</section>';
    }

    function _renderMagicLibrary(t) {
        var html = '<article class="help-magic-library" aria-labelledby="help-magic-library-title">' +
            '<h3 id="help-magic-library-title">' + Helpers.icon('map', 'section-icon vmagic-breathe') + ' ' + t('help_magic_library_title') + '</h3>' +
            '<p>' + t('help_magic_library_intro') + '</p>' +
            '<div class="help-library-list">';
        for (var i = 0; i < HELP_LIBRARY_MAPS.length; i++) {
            var entry = HELP_LIBRARY_MAPS[i];
            html += '<button type="button" class="help-library-link" data-library-map="' + entry.id + '">' + Helpers.escapeHtml(entry.title) + '</button>';
        }
        html += '</div></article>';
        return html;
    }

    function _renderSecretLibrary(t) {
        var user = VizAccount.getCurrentUser ? VizAccount.getCurrentUser() : '';
        var day = StateEngine.getLibraryDay();
        var unlocked = StateEngine.hasLibraryAccess(user, 'chapter2', day);
        var html = '<article class="help-magic-library help-secret-library" aria-labelledby="help-secret-library-title">' +
            '<h3 id="help-secret-library-title" tabindex="-1">' + Helpers.icon('map', 'section-icon vmagic-breathe') + ' ' + t('help_magic_library_chapter_two_title') + '</h3>' +
            '<p>' + t('help_magic_library_chapter_two_intro') + '</p>' +
            '<p class="help-library-danger">' + t('help_magic_library_chapter_two_warning') + '</p>' +
            '<p id="help-secret-library-status" class="help-secret-library-status" role="status" aria-live="polite"></p>';
        if (!unlocked) {
            html += '<div class="help-secret-library-lock">' +
                '<p>' + t('help_magic_library_chapter_two_locked') + '</p>' +
                '<button type="button" class="btn btn-primary" id="help-secret-library-unlock">' + t('help_magic_library_chapter_two_unlock') + '</button>' +
                '</div>';
        } else {
            html += '<p class="help-secret-library-midnight" role="status">' + t('help_magic_library_chapter_two_opened') + '</p>' +
                '<div class="help-library-list help-secret-library-list">';
            for (var i = 0; i < HELP_SECRET_LIBRARY_MAPS.length; i++) {
                var entry = HELP_SECRET_LIBRARY_MAPS[i];
                html += '<button type="button" class="help-library-link help-secret-library-link" data-secret-library-map="' + entry.id + '">' + Helpers.escapeHtml(t(entry.titleKey)) + '</button>';
            }
            html += '</div>';
        }
        html += '</article>';
        return html;
    }

    function _renderUnknownLibrary(t) {
        var user = VizAccount.getCurrentUser ? VizAccount.getCurrentUser() : '';
        var day = StateEngine.getLibraryDay();
        var unlocked = StateEngine.hasLibraryAccess(user, 'chapter3', day);
        var html = '<article class="help-magic-library help-secret-library help-unknown-library" aria-labelledby="help-unknown-library-title">' +
            '<h3 id="help-unknown-library-title" tabindex="-1">' + Helpers.icon('map', 'section-icon vmagic-breathe') + ' ' + t('help_magic_library_chapter_three_title') + '</h3>' +
            '<p>' + t('help_magic_library_chapter_three_intro') + '</p>' +
            '<p class="help-library-danger">' + t('help_magic_library_chapter_three_warning') + '</p>' +
            '<p id="help-unknown-library-status" class="help-secret-library-status" role="status" aria-live="polite"></p>';
        if (!unlocked) {
            html += '<div class="help-secret-library-lock">' +
                '<p>' + t('help_magic_library_chapter_three_locked') + '</p>' +
                '<button type="button" class="btn btn-primary" id="help-unknown-library-unlock">' + t('help_magic_library_chapter_three_unlock') + '</button>' +
                '</div>';
        } else {
            html += '<p class="help-secret-library-midnight" role="status">' + t('help_magic_library_chapter_three_opened') + '</p>' +
                '<div class="help-library-list help-secret-library-list">';
            for (var i = 0; i < HELP_UNKNOWN_LIBRARY_MAPS.length; i++) {
                var entry = HELP_UNKNOWN_LIBRARY_MAPS[i];
                html += '<button type="button" class="help-library-link help-secret-library-link help-unknown-library-link" data-unknown-library-map="' + entry.id + '">' + Helpers.escapeHtml(t(entry.titleKey)) + '</button>';
            }
            if (HELP_UNKNOWN_LIBRARY_FADING_MAPS.length) {
                html += '<hr class="help-unknown-library-divider">' +
                    '<p id="help-unknown-library-fading-title" class="help-unknown-library-fading-title">' + t('help_unknown_library_fading_path') + '</p>' +
                    '<div role="group" aria-labelledby="help-unknown-library-fading-title">';
                for (var j = 0; j < HELP_UNKNOWN_LIBRARY_FADING_MAPS.length; j++) {
                    var fadingEntry = HELP_UNKNOWN_LIBRARY_FADING_MAPS[j];
                    html += '<button type="button" class="help-library-link help-secret-library-link help-unknown-library-link" data-unknown-library-map="' + fadingEntry.id + '">' + Helpers.escapeHtml(t(fadingEntry.titleKey)) + '</button>';
                }
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</article>';
        return html;
    }

    function _bindSecretLibrary(el) {
        var unlock = Helpers.$('help-secret-library-unlock');
        if (unlock) unlock.addEventListener('click', _unlockSecretLibrary);
        var links = el.querySelectorAll('.help-secret-library-link');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', function() {
                var entry = _findSecretLibraryEntry(this.getAttribute('data-secret-library-map'));
                if (entry) {
                    if (typeof SoundManager !== 'undefined') SoundManager.play('tap');
                    _openSecretLibraryMap(entry);
                }
            });
        }
    }

    function _bindUnknownLibrary(el) {
        var unlock = Helpers.$('help-unknown-library-unlock');
        if (unlock) unlock.addEventListener('click', _unlockUnknownLibrary);
        var links = el.querySelectorAll('.help-unknown-library-link');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', function() {
                var entry = _findUnknownLibraryEntry(this.getAttribute('data-unknown-library-map'));
                if (entry) {
                    if (typeof SoundManager !== 'undefined') SoundManager.play('tap');
                    _openUnknownLibraryMap(entry);
                }
            });
        }
    }

    function _findUnknownLibraryEntry(id) {
        var allMaps = HELP_UNKNOWN_LIBRARY_MAPS.concat(HELP_UNKNOWN_LIBRARY_FADING_MAPS);
        for (var i = 0; i < allMaps.length; i++) {
            if (allMaps[i].id === id) return allMaps[i];
        }
        return null;
    }

    function _findSecretLibraryEntry(id) {
        for (var i = 0; i < HELP_SECRET_LIBRARY_MAPS.length; i++) {
            if (HELP_SECRET_LIBRARY_MAPS[i].id === id) return HELP_SECRET_LIBRARY_MAPS[i];
        }
        return null;
    }

    function _setSecretLibraryStatus(message) {
        var status = Helpers.$('help-secret-library-status');
        if (status) status.textContent = message || '';
    }


    function _preflightSecretLibraryEntitlement(user, day, callback, chapter) {
        chapter = chapter || 'chapter2';
        if (StateEngine.hasLibraryAccess(user, chapter, day)) {
            callback(null, true);
            return;
        }
        if (typeof HistorySource === 'undefined' || !HistorySource.findAccountAction ||
                typeof BlockProcessor === 'undefined' || !BlockProcessor.processBlock) {
            callback(new Error('library_history_check_unavailable'));
            return;
        }
        HistorySource.findAccountAction(
            user,
            VizMagicConfig.PROTOCOLS.VM,
            VizMagicConfig.ACTION_TYPES.LIBRARY_UNLOCK,
            function(historyErr, unlockEvent) {
                if (historyErr) {
                    callback(historyErr);
                    return;
                }
                if (!unlockEvent || !unlockEvent.blockNum) {
                    callback(null, false);
                    return;
                }
                HistorySource.getBlock(unlockEvent.blockNum, function(blockErr, block) {
                    if (blockErr || !block) {
                        callback(blockErr || new Error('library_proof_block_unavailable'));
                        return;
                    }
                    try {
                        var processed = BlockProcessor.processBlock(block, unlockEvent.blockNum);
                        var hasTodayAction = false;
                        var vmActions = processed.vmActions || [];
                        for (var i = 0; i < vmActions.length; i++) {
                            var item = vmActions[i] || {};
                            var action = item.action || {};
                            if (item.sender === user && action.type === VizMagicConfig.ACTION_TYPES.LIBRARY_UNLOCK &&
                                    action.data && action.data.chapter === chapter && action.data.day === day) {
                                hasTodayAction = true;
                                break;
                            }
                        }
                        if (!hasTodayAction) {
                            callback(null, false);
                            return;
                        }
                        if (!StateEngine.verifyLibraryUnlockProof(processed, user, chapter, day)) {
                            callback(new Error('library_unlock_proof_invalid'));
                            return;
                        }
                        StateEngine.processLibraryUnlockResult(user, unlockEvent.blockNum, day, chapter);
                        StateEngine.saveCheckpoint(function() {});
                        callback(null, true);
                    } catch (err) {
                        callback(err);
                    }
                });
            },
            function(event) {
                var payload = event && event.payload ? event.payload : {};
                var data = payload.d || payload.data || {};
                return data.chapter === chapter && data.day === day;
            }
        );
    }

    function _confirmSecretLibraryBroadcastProof(user, day, result, callback, chapter) {
        chapter = chapter || 'chapter2';
        var blockNum = result ? Number(result.block_num || result.block || 0) : 0;
        if (!blockNum || typeof HistorySource === 'undefined' || !HistorySource.getBlock) {
            callback(new Error('library_confirmation_pending'));
            return;
        }
        HistorySource.getBlock(blockNum, function(blockErr, block) {
            if (blockErr || !block) {
                callback(blockErr || new Error('library_confirmation_pending'));
                return;
            }
            try {
                var processed = BlockProcessor.processBlock(block, blockNum);
                if (!StateEngine.verifyLibraryUnlockProof(processed, user, chapter, day)) {
                    callback(new Error('library_unlock_proof_invalid'));
                    return;
                }
                var event = StateEngine.processLibraryUnlockResult(user, blockNum, day, chapter);
                if (!event) {
                    callback(new Error('library_unlock_state_rejected'));
                    return;
                }
                StateEngine.saveCheckpoint(function() {});
                callback(null, event);
            } catch (err) {
                callback(err);
            }
        });
    }

    function _resetSecretLibraryAction(button) {
        secretLibraryBusy = false;
        if (button) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = button.getAttribute('data-idle-label') || Helpers.t('help_magic_library_chapter_two_unlock');
        }
    }

    function _waitForSecretLibraryProof(user, day, result, attempt, callback, chapter) {
        chapter = chapter || 'chapter2';
        if (StateEngine.getLibraryDay() !== day) {
            callback(new Error('library_day_changed'));
            return;
        }
        function retry() {
            if (attempt >= 40) {
                callback(new Error('library_confirmation_pending'));
                return;
            }
            setTimeout(function() {
                _waitForSecretLibraryProof(user, day, null, attempt + 1, callback, chapter);
            }, 1500);
        }
        if (result && attempt === 0) {
            _confirmSecretLibraryBroadcastProof(user, day, result, function(proofErr, event) {
                if (!proofErr) callback(null, event);
                else retry();
            }, chapter);
            return;
        }
        _preflightSecretLibraryEntitlement(user, day, function(historyErr, unlocked) {
            if (!historyErr && unlocked) {
                callback(null, true);
                return;
            }
            retry();
        }, chapter);
    }

    function _finishSecretLibraryOpen(messageKey, headingId) {
        ModalComponent.hide();
        Toast.success(Helpers.t(messageKey));
        render();
        setTimeout(function() {
            var heading = Helpers.$(headingId || 'help-secret-library-title');
            if (heading) heading.focus();
        }, 0);
    }

    function _unlockSecretLibrary() {
        if (secretLibraryBusy) return;
        var user = VizAccount.getCurrentUser ? VizAccount.getCurrentUser() : '';
        if (!user) {
            ModalComponent.hide();
            Toast.error(Helpers.t('error_no_account'));
            return;
        }
        var confirm = Helpers.$('help-secret-library-unlock');
        var day = StateEngine.getLibraryDay();
        secretLibraryBusy = true;
        if (confirm) {
            confirm.setAttribute('data-idle-label', confirm.textContent);
            confirm.disabled = true;
            confirm.setAttribute('aria-busy', 'true');
            confirm.textContent = Helpers.t('help_secret_library_checking');
        }

        _preflightSecretLibraryEntitlement(user, day, function(historyErr, alreadyUnlocked) {
            if (historyErr) {
                _resetSecretLibraryAction(confirm);
                Toast.error(Helpers.t('help_secret_library_history_check_failed'));
                return;
            }
            if (alreadyUnlocked) {
                secretLibraryBusy = false;
                _finishSecretLibraryOpen('help_magic_library_chapter_two_already_open');
                return;
            }

            VizAccount.getAccount(user, function(energyErr, accountData) {
                if (energyErr || !accountData) {
                    _resetSecretLibraryAction(confirm);
                    Toast.error(Helpers.t('help_magic_library_chapter_two_energy_failed'));
                    return;
                }
                var currentEnergy = VizAccount.calculateCurrentEnergy(accountData);
                if (currentEnergy < VizMagicConfig.LIBRARY.CHAPTER_TWO_COST) {
                    _resetSecretLibraryAction(confirm);
                    Toast.error(Helpers.t('help_magic_library_chapter_two_not_enough'));
                    return;
                }
                if (StateEngine.getLibraryDay() !== day) {
                    _resetSecretLibraryAction(confirm);
                    _unlockSecretLibrary();
                    return;
                }
                VizBroadcast.libraryUnlockAction(
                    VizMagicConfig.LIBRARY.CHAPTER_TWO_COST,
                    day,
                    function(err, result) {
                        if (err) {
                            _resetSecretLibraryAction(confirm);
                            Toast.error(Helpers.t('help_magic_library_chapter_two_failed'));
                            return;
                        }
                        if (confirm) confirm.textContent = Helpers.t('help_secret_library_waiting_confirmation');
                        _setSecretLibraryStatus(Helpers.t('help_secret_library_waiting_confirmation'));
                        _waitForSecretLibraryProof(user, day, result, 0, function(proofErr) {
                            if (proofErr) {
                                Toast.error(Helpers.t('help_secret_library_confirmation_pending'));
                                return;
                            }
                            secretLibraryBusy = false;
                            _finishSecretLibraryOpen('help_magic_library_chapter_two_success');
                        });
                    }
                );
            });
        });
    }

    function _setUnknownLibraryStatus(message) {
        var status = Helpers.$('help-unknown-library-status');
        if (status) status.textContent = message || '';
    }

    function _resetUnknownLibraryAction(button) {
        unknownLibraryBusy = false;
        if (button) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = button.getAttribute('data-idle-label') || Helpers.t('help_magic_library_chapter_three_unlock');
        }
    }

    function _unlockUnknownLibrary() {
        if (unknownLibraryBusy) return;
        var user = VizAccount.getCurrentUser ? VizAccount.getCurrentUser() : '';
        if (!user) {
            ModalComponent.hide();
            Toast.error(Helpers.t('error_no_account'));
            return;
        }
        var button = Helpers.$('help-unknown-library-unlock');
        var day = StateEngine.getLibraryDay();
        unknownLibraryBusy = true;
        if (button) {
            button.setAttribute('data-idle-label', button.textContent);
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.textContent = Helpers.t('help_secret_library_checking');
        }
        _preflightSecretLibraryEntitlement(user, day, function(historyErr, alreadyUnlocked) {
            if (historyErr) {
                _resetUnknownLibraryAction(button);
                Toast.error(Helpers.t('help_secret_library_history_check_failed'));
                return;
            }
            if (alreadyUnlocked) {
                unknownLibraryBusy = false;
                _finishSecretLibraryOpen('help_magic_library_chapter_three_already_open', 'help-unknown-library-title');
                return;
            }
            VizAccount.getAccount(user, function(energyErr, accountData) {
                if (energyErr || !accountData) {
                    _resetUnknownLibraryAction(button);
                    Toast.error(Helpers.t('help_magic_library_chapter_three_energy_failed'));
                    return;
                }
                var currentEnergy = VizAccount.calculateCurrentEnergy(accountData);
                if (currentEnergy < VizMagicConfig.LIBRARY.CHAPTER_THREE_COST) {
                    _resetUnknownLibraryAction(button);
                    Toast.error(Helpers.t('help_magic_library_chapter_three_not_enough'));
                    return;
                }
                if (StateEngine.getLibraryDay() !== day) {
                    _resetUnknownLibraryAction(button);
                    _unlockUnknownLibrary();
                    return;
                }
                VizBroadcast.libraryUnlockChapterAction(
                    'chapter3',
                    VizMagicConfig.LIBRARY.CHAPTER_THREE_COST,
                    day,
                    function(err, result) {
                        if (err) {
                            _resetUnknownLibraryAction(button);
                            Toast.error(Helpers.t('help_magic_library_chapter_three_failed'));
                            return;
                        }
                        if (button) button.textContent = Helpers.t('help_secret_library_waiting_confirmation');
                        _setUnknownLibraryStatus(Helpers.t('help_secret_library_waiting_confirmation'));
                        _waitForSecretLibraryProof(user, day, result, 0, function(proofErr) {
                            if (proofErr) {
                                Toast.error(Helpers.t('help_secret_library_confirmation_pending'));
                                return;
                            }
                            unknownLibraryBusy = false;
                            _finishSecretLibraryOpen('help_magic_library_chapter_three_success', 'help-unknown-library-title');
                        }, 'chapter3');
                    }
                );
            });
        }, 'chapter3');
    }

    function _findLibraryEntry(id) {
        for (var i = 0; i < HELP_LIBRARY_MAPS.length; i++) {
            if (HELP_LIBRARY_MAPS[i].id === id) return HELP_LIBRARY_MAPS[i];
        }
        return null;
    }

    function _openLibraryMap(entry) {
        var title = Helpers.escapeHtml(entry.title);
        var description = Helpers.t('map_lore_' + entry.id);
        var html = '<div class="help-library-map-card">';
        html += '<div class="lore-map-title">' + Helpers.icon('map', 'region-icon vmagic-breathe') + ' ' + title + '</div>';
        html += '<div class="lore-map-viewport help-library-map-viewport" id="help-library-map-viewport">';
        html += '<img class="lore-map-image help-library-map-image" id="help-library-map-image" src="assets/library-maps-v2/map-' + entry.id + '.jpg?v=' + HELP_LIBRARY_ASSET_VERSION + '" alt="' + Helpers.escapeHtml(Helpers.t('help_magic_library_image_alt', { name: entry.title })) + '" loading="lazy">';
        html += '</div>';
        html += '<p class="lore-map-text help-library-map-text">' + description + '</p>';
        html += '<div class="modal-actions lore-map-actions help-library-map-actions"><button type="button" class="btn btn-secondary" id="help-library-zoom-toggle">' + Helpers.t('map_zoom_toggle') + '</button><button type="button" class="btn btn-primary" id="help-library-close">' + Helpers.t('close') + '</button></div>';
        html += '</div>';
        ModalComponent.show(html);
        var modal = Helpers.$('modal-container');
        var viewport = Helpers.$('help-library-map-viewport');
        var zoomBtn = Helpers.$('help-library-zoom-toggle');
        if (zoomBtn && viewport && modal) {
            zoomBtn.addEventListener('click', function() {
                modal.classList.add('help-library-fullscreen');
                viewport.classList.add('zoomed');
            });
            viewport.addEventListener('click', function(e) {
                if (modal.classList.contains('help-library-fullscreen')) {
                    e.preventDefault();
                    _closeLibraryFullscreen(modal, viewport);
                }
            });
        }
        var closeBtn = Helpers.$('help-library-close');
        if (closeBtn) closeBtn.addEventListener('click', function() {
            if (modal && modal.classList.contains('help-library-fullscreen')) {
                _closeLibraryFullscreen(modal, viewport);
                return;
            }
            ModalComponent.hide();
        });
    }

    function _openSecretLibraryMap(entry) {
        _openPaidLibraryMap(entry, 'chapter2');
    }

    function _openUnknownLibraryMap(entry) {
        _openPaidLibraryMap(entry, 'chapter3');
    }

    function _openPaidLibraryMap(entry, chapter) {
        var titleText = Helpers.t(entry.titleKey);
        var title = Helpers.escapeHtml(titleText);
        var description = Helpers.t(entry.textKey);
        var imagePath = chapter === 'chapter3'
            ? 'assets/library-maps-chapter3/unknown-map-' + entry.id + '.jpg?v=' + HELP_UNKNOWN_LIBRARY_ASSET_VERSION
            : 'assets/library-maps-chapter2/secret-map-' + entry.id + '.jpg?v=' + HELP_SECRET_LIBRARY_ASSET_VERSION;
        var cardClass = chapter === 'chapter3' ? ' help-unknown-library-map-card' : '';
        var html = '<div class="help-library-map-card help-secret-library-map-card' + cardClass + '">';
        html += '<div class="lore-map-title">' + Helpers.icon('map', 'region-icon vmagic-breathe') + ' ' + title + '</div>';
        html += '<div class="lore-map-viewport help-library-map-viewport" id="help-library-map-viewport">';
        html += '<img class="lore-map-image help-library-map-image" id="help-library-map-image" src="' + imagePath + '" alt="' + Helpers.escapeHtml(Helpers.t('help_magic_library_image_alt', { name: titleText })) + '" loading="lazy">';
        html += '</div>';
        html += '<p class="lore-map-text help-library-map-text">' + description + '</p>';
        html += '<div class="modal-actions lore-map-actions help-library-map-actions"><button type="button" class="btn btn-secondary" id="help-library-zoom-toggle">' + Helpers.t('map_zoom_toggle') + '</button><button type="button" class="btn btn-primary" id="help-library-close">' + Helpers.t('close') + '</button></div>';
        html += '</div>';
        ModalComponent.show(html);
        var modal = Helpers.$('modal-container');
        var viewport = Helpers.$('help-library-map-viewport');
        var zoomBtn = Helpers.$('help-library-zoom-toggle');
        if (zoomBtn && viewport && modal) {
            zoomBtn.addEventListener('click', function() {
                modal.classList.add('help-library-fullscreen');
                viewport.classList.add('zoomed');
            });
            viewport.addEventListener('click', function(e) {
                if (modal.classList.contains('help-library-fullscreen')) {
                    e.preventDefault();
                    _closeLibraryFullscreen(modal, viewport);
                }
            });
        }
        var closeBtn = Helpers.$('help-library-close');
        if (closeBtn) closeBtn.addEventListener('click', function() {
            if (modal && modal.classList.contains('help-library-fullscreen')) {
                _closeLibraryFullscreen(modal, viewport);
                return;
            }
            ModalComponent.hide();
        });
    }

    function _closeLibraryFullscreen(modal, viewport) {
        if (modal) modal.classList.remove('help-library-fullscreen');
        if (viewport) viewport.classList.remove('zoomed');
    }

    return { render: render };
})();
