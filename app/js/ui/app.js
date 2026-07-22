/**
 * Viz Magic — Main App Controller
 * Screen routing, initialization sequence, event bus integration.
 */
var App = (function() {
    'use strict';

    var currentScreen = 'landing';
    var screens = ['landing', 'onboarding', 'login', 'home', 'character', 'hunt', 'inventory', 'chronicle', 'duel', 'arena', 'guild', 'map', 'marketplace', 'crafting', 'quests', 'world-boss', 'settings', 'help', 'leaderboard', 'temple', 'developers'];
    var initialized = false;
    var _pollTimer = null;
    var _lastPolledBlock = 0;
    var _pollBusy = false;
    var _syncStartBlock = 0;
    var _syncVisible = false;
    var _lastSyncPercent = -1;
    var _deferredInstallPrompt = null;
    var INSTALL_ACK_KEY = VizMagicConfig.STORAGE_PREFIX + 'install_shortcut_ack';
    var POLL_INTERVAL_MS = 3000;

    /**
     * Initialize the application
     */
    function init() {
        if (initialized) return;
        initialized = true;

        // Initialize accessibility
        A11y.init();
        A11y.initKeyboardShortcuts();

        _showPendingInstallNotice();

        // Initialize Battle Narrator
        if (typeof BattleNarrator !== 'undefined') {
            BattleNarrator.init();
        }

        // Initialize guild screen EventBus subscriptions
        if (typeof GuildScreen !== 'undefined' && GuildScreen.init) {
            GuildScreen.init();
        }

        // Initialize account system
        VizAccount.init();

        // Register navigation handler IMMEDIATELY (before async init)
        Helpers.EventBus.on('navigate', navigateTo);

        // Render landing immediately
        _renderScreen('landing');

        // Initialize connection to VIZ node
        _showConnectionStatus();
        VizConnection.init(function(err) {
            if (err) {
                console.log('Connection failed, working offline');
                Toast.info(Helpers.t('conn_disconnected'), 4000, { key: 'conn_disconnected' });
            } else {
                console.log('Connected to VIZ network');
                _checkHistoryCapabilityNotice();
            }

            // Initialize game state engine
            StateEngine.init(function(err, state) {
                if (err) console.log('State engine init error:', err);

                // Start block polling for real-time state sync
                _startBlockPolling();

                // Determine starting screen
                if (VizAccount.isLoggedIn()) {
                    // Restore character from blockchain grimoire
                    var user = VizAccount.getCurrentUser();
                    VizAccount.getAccount(user, function(accErr, accountData) {
                        if (accErr) {
                            console.log('Could not fetch account on startup:', accErr);
                            navigateTo('home');
                            return;
                        }
                        var grimoire = VizAccount.parseGrimoire(accountData);
                        if (grimoire && grimoire.class && grimoire.name) {
                            // Recreate character in StateEngine from on-chain data
                            var state = StateEngine.getState();
                            // If checkpoint already has this character (from IndexedDB), keep it
                            if (!state.characters[user]) {
                                var character = CharacterSystem.createCharacter(user, grimoire.name, grimoire.class);
                                if (character) {
                                    // Restore level/xp from Grimoire cache hint
                                    if (grimoire.level && grimoire.level > 1) {
                                        character.level = grimoire.level;
                                        character.xp = grimoire.xp || 0;
                                        character.hp = GameFormulas.calculateMaxHp(character.className, character.level, CharacterSystem.getTotalStat(character, 'res'));
                                        character.maxHp = character.hp;
                                    }

                                    // Sync Magic Core from on-chain SHARES with heavy compression.
                                    // This keeps SHARES meaningful but prevents whales from becoming unbeatable.
                                    var effectiveShares = VizAccount.getEffectiveShares(accountData);
                                    var cappedShares = Math.min(effectiveShares, 1000000000000); // cap at 1,000,000 SHARES (6 decimals)
                                    CharacterSystem.updateCoreBonus(character, cappedShares);

                                    state.characters[user] = character;
                                }
                            } else {
                                console.log('Character already in state from checkpoint, keeping checkpoint data');
                            }
                            state.inventories[user] = state.inventories[user] || [];
                            if (!state.quests) state.quests = {};
                            if (!state.quests[user]) {
                                state.quests[user] = (typeof QuestSystem !== 'undefined')
                                    ? QuestSystem.createPlayerQuestState()
                                    : { active: [], completed: [], dailyProphecyDay: 0 };
                            }
                            var ch = state.characters[user];
                            console.log('Character restored: ' + (ch ? ch.name + ' Lv' + ch.level + ' XP:' + ch.xp : 'none'));
                            navigateTo('home');
                        } else {
                            // No grimoire on chain — send to onboarding
                            console.log('No grimoire found for', user, '— redirecting to onboarding');
                            navigateTo('onboarding');
                        }
                    });
                } else {
                    navigateTo('landing');
                }
            });
        });

        // Connection status events
        VizConnection.onConnect(function() {
            Toast.success(Helpers.t('conn_connected'));
        });
        VizConnection.onDisconnect(function() {
            Toast.info(Helpers.t('conn_disconnected'), 4000, { key: 'conn_disconnected' });
        });

        // Register PWA install
        _registerPWA();
    }

    /**
     * Navigate to a screen
     * @param {string} screenId
     */
    function navigateTo(screenId) {
        // Login screen is standalone now

        if (screens.indexOf(screenId) === -1) {
            console.log('Unknown screen:', screenId);
            return;
        }

        // Hide all screens
        for (var i = 0; i < screens.length; i++) {
            var el = Helpers.$('screen-' + screens[i]);
            if (el) {
                el.classList.remove('active');
                el.setAttribute('aria-hidden', 'true');
            }
        }

        // Show target screen
        var target = Helpers.$('screen-' + screenId);
        if (target) {
            target.classList.add('active');
            target.setAttribute('aria-hidden', 'false');
        }

        currentScreen = screenId;

        // Render the screen content
        _renderScreen(screenId);

        // Update navigation
        var gameScreens = ['home', 'character', 'hunt', 'inventory', 'chronicle', 'duel', 'arena', 'guild', 'map', 'marketplace', 'crafting', 'quests', 'world-boss', 'settings', 'help', 'leaderboard', 'temple', 'developers'];
        var nav = Helpers.$('bottom-nav');
        if (gameScreens.indexOf(screenId) !== -1) {
            nav.classList.add('show');
            NavComponent.setActive(screenId);
        } else {
            nav.classList.remove('show');
        }

        _moveFocusToScreen(target, screenId);

        // Announce screen change
        var screenTitle = Helpers.t('nav_' + screenId) || screenId;
        A11y.announce(screenTitle);

        // Play transition sound
        if (initialized) {
            SoundManager.play('transition');
        }
    }

    /**
     * Render a specific screen
     */
    function _renderScreen(screenId) {
        switch (screenId) {
            case 'landing':    LandingScreen.render(); break;
            case 'login':      LoginScreen.render(); break;
            case 'onboarding': OnboardingScreen.render(); break;
            case 'home':       HomeScreen.render(); break;
            case 'character':  CharacterScreen.render(); break;
            case 'hunt':       HuntScreen.render(); break;
            case 'inventory':  InventoryScreen.render(); break;
            case 'chronicle':  ChronicleScreen.render(); break;
            case 'duel':       DuelScreen.render(); break;
            case 'arena':      ArenaScreen.render(); break;
            case 'guild':      GuildScreen.render(); break;
            case 'map':        MapScreen.render(); break;
            case 'marketplace': MarketplaceScreen.render(); break;
            case 'crafting':    CraftingScreen.render(); break;
            case 'quests':      if (typeof QuestsScreen !== 'undefined') QuestsScreen.render(); break;
            case 'world-boss':  if (typeof WorldBossScreen !== 'undefined') WorldBossScreen.render(); break;
            case 'settings':    if (typeof SettingsScreen !== 'undefined') SettingsScreen.render(); break;
            case 'help':        if (typeof HelpScreen !== 'undefined') HelpScreen.render(); break;
            case 'leaderboard': if (typeof LeaderboardScreen !== 'undefined') LeaderboardScreen.render(); break;
            case 'temple':      if (typeof TempleScreen !== 'undefined') TempleScreen.render(); break;
            case 'developers':  if (typeof DevelopersScreen !== 'undefined') DevelopersScreen.render(); break;
        }
    }

    function _moveFocusToScreen(target, screenId) {
        if (!target) return;

        var appMain = Helpers.$('app-main');
        if (appMain) {
            appMain.setAttribute('data-current-screen', screenId);
        }

        var focusTarget = target.querySelector('h1, [data-screen-focus], [role="heading"]');
        if (!focusTarget) {
            focusTarget = target;
        }
        if (!focusTarget.getAttribute('tabindex')) {
            focusTarget.setAttribute('tabindex', '-1');
        }

        setTimeout(function() {
            if (focusTarget && focusTarget.focus) {
                focusTarget.focus();
            }
        }, 0);
    }

    /**
     * Show initial connection status
     */
    function _showConnectionStatus() {
        _updateSyncStatus(0, true);
    }

    function _updateSyncStatus(percent, forceShow) {
        var statusEl = Helpers.$('connection-status');
        if (!statusEl) return;

        percent = Math.max(0, Math.min(100, Math.ceil(percent || 0)));

        if (!forceShow && percent >= 100) {
            _syncVisible = false;
            _lastSyncPercent = percent;
            statusEl.classList.remove('show');
            return;
        }

        if (_syncVisible && _lastSyncPercent === percent) {
            return;
        }

        statusEl.textContent = 'Синхронизация с Миром... ' + percent + '%';
        statusEl.classList.add('show');
        _syncVisible = true;
        _lastSyncPercent = percent;
    }

    /**
     * Register PWA service worker
     */
    function _registerPWA() {
        if ('file://' === document.location.origin) return;
        window.addEventListener('beforeinstallprompt', function(event) {
            event.preventDefault();
            _deferredInstallPrompt = event;
        });
        window.addEventListener('appinstalled', function() {
            _deferredInstallPrompt = null;
            try { localStorage.setItem(INSTALL_ACK_KEY, '1'); } catch (e) {}
            if (typeof Toast !== 'undefined') {
                Toast.success(Helpers.t('home_install_shortcut_installed'), 7000, { key: 'install_shortcut_installed' });
            }
        });
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function(registration) {
                console.log('Service Worker Registered');
                if (registration && registration.update) {
                    registration.update().catch(function(updateErr) {
                        console.log('SW update check failed:', updateErr);
                    });
                }
            }).catch(function(err) {
                console.log('SW registration failed:', err);
            });
        }
    }

    function _showPendingInstallNotice() {
        try {
            if (localStorage.getItem(INSTALL_ACK_KEY) === '1') {
                localStorage.removeItem(INSTALL_ACK_KEY);
                setTimeout(function() {
                    if (typeof Toast !== 'undefined') Toast.success(Helpers.t('home_install_shortcut_installed'), 7000, { key: 'install_shortcut_installed' });
                }, 600);
            }
        } catch (e) {}
    }

    function installShortcut() {
        if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
            if (typeof Toast !== 'undefined') Toast.info(Helpers.t('home_install_shortcut_already'), 5000, { key: 'install_shortcut_already' });
            return;
        }
        if (_deferredInstallPrompt) {
            if (typeof Toast !== 'undefined') Toast.info(Helpers.t('home_install_shortcut_requested'), 7000, { key: 'install_shortcut_requested' });
            _deferredInstallPrompt.prompt();
            _deferredInstallPrompt.userChoice.then(function(choice) {
                _deferredInstallPrompt = null;
                if (choice && choice.outcome === 'accepted' && typeof Toast !== 'undefined') {
                    try { localStorage.setItem(INSTALL_ACK_KEY, '1'); } catch (e) {}
                    Toast.success(Helpers.t('home_install_shortcut_installed'), 7000, { key: 'install_shortcut_installed' });
                } else {
                    if (typeof Toast !== 'undefined') Toast.info(Helpers.t('home_install_shortcut_requested'), 7000, { key: 'install_shortcut_requested' });
                    _showInstallInstructions();
                }
            });
            return;
        }
        if (typeof Toast !== 'undefined') Toast.info(Helpers.t('home_install_shortcut_requested'), 7000, { key: 'install_shortcut_requested' });
        _showInstallInstructions();
    }

    function _showInstallInstructions() {
        var text = '<p>' + Helpers.t('home_install_shortcut_manual') + '</p>' +
            '<ol>' +
                '<li>' + Helpers.t('home_install_step_1') + '</li>' +
                '<li>' + Helpers.t('home_install_step_2') + '</li>' +
                '<li>' + Helpers.t('home_install_step_3') + '</li>' +
            '</ol>';
        if (typeof Modal !== 'undefined' && Modal.show) {
            Modal.show(Helpers.t('home_install_shortcut'), text);
            return;
        }
        if (typeof Toast !== 'undefined') {
            Toast.info(Helpers.t('home_install_shortcut_manual'), 9000, { key: 'install_shortcut_manual' });
        }
    }

    /**
     * Start periodic block polling for real-time state sync.
     * Every POLL_INTERVAL_MS checks chain head and processes new blocks
     * through BlockProcessor → StateEngine → checkpoint save.
     */
    /** Whether we have already run the historical chain recovery */
    var _chainRecoveryDone = false;
    /** Whether chain recovery is currently running */
    var _chainRecoveryBusy = false;
    /** Set of block numbers already processed during recovery to prevent duplicates */
    var _recoveryProcessedBlocks = {};

    /**
     * Process a single block during recovery, skipping if already seen.
     * Prevents duplicate items/XP when the same block appears in
     * multiple accounts' chains.
     */
    function _processRecoveryBlock(blockNum, block) {
        if (_recoveryProcessedBlocks[blockNum]) return;
        _recoveryProcessedBlocks[blockNum] = true;
        var processed = BlockProcessor.processBlock(block, blockNum);
        StateEngine.processBlock(processed);
    }

    function _getHistoryBlock(blockNum, callback) {
        if (typeof HistorySource !== 'undefined' && HistorySource.getBlock) {
            HistorySource.getBlock(blockNum, callback);
            return;
        }
        viz.api.getBlock(blockNum, callback);
    }

    function _checkHistoryCapabilityNotice() {
        if (typeof VizConnection === 'undefined' || !VizConnection.checkHistoryCapability) return;
        VizConnection.checkHistoryCapability(function(err, capability) {
            if (err || !capability || capability.historicalBlocks) return;
            console.log('App: Selected VIZ node has limited history; archive mirror may be needed for old recovery');
            if (capability.recentBlocks && typeof Toast !== 'undefined') {
                Toast.info(Helpers.t('conn_history_limited'), 4000, { key: 'conn_history_limited' });
            }
        });
    }

    /**
     * Recover the current user's full action history by traversing the
     * backward-linked chain of VM custom operations (custom_sequence_block_num).
     * Only runs once per session when there is no IndexedDB checkpoint
     * (i.e. fresh device / cleared storage).
     *
     * Processes each historical block through the normal
     * BlockProcessor → StateEngine pipeline so inventory, XP, crafting,
     * guild-create and every other action type are replayed exactly
     * the same way as during live polling.
     *
     * After recovery finishes, normal 24-hour forward polling takes over
     * for shared/world state (other players' guild invites, world boss,
     * marketplace listings, etc.).
     *
     * @param {number} headBlock - current chain head from dgp
     * @param {Function} callback - called when recovery is complete
     */
    function _recoverChainHistory(headBlock, callback) {
        if (_chainRecoveryBusy) { callback(); return; }
        _chainRecoveryBusy = true;

        var user = VizAccount.getCurrentUser();
        if (!user) {
            _chainRecoveryDone = true;
            _chainRecoveryBusy = false;
            callback();
            return;
        }

        var recentWindowStart = Math.max(1, headBlock - 28800);

        _updateSyncStatus(0, true);
        console.log('App: Starting chain history recovery for', user);

        // Traverse the full backward chain (up to 5000 actions)
        VMProtocol.traverseChain(user, 5000, function(err, actions) {
            if (err || !actions || actions.length === 0) {
                console.log('App: No chain history found, falling back to 24h window');
                _chainRecoveryDone = true;
                _chainRecoveryBusy = false;
                callback();
                return;
            }

            // Collect block numbers that are OLDER than the 24h window
            // (blocks inside the window will be processed by normal polling)
            var historicalBlocks = [];
            var seen = {};
            for (var i = 0; i < actions.length; i++) {
                var bn = actions[i].blockNum;
                if (bn < recentWindowStart && !seen[bn]) {
                    seen[bn] = true;
                    historicalBlocks.push(bn);
                }
            }

            if (historicalBlocks.length === 0) {
                console.log('App: All actions within 24h window, no extra recovery needed');
                _chainRecoveryDone = true;
                _chainRecoveryBusy = false;
                callback();
                return;
            }

            // Sort ascending so state is built in chronological order
            historicalBlocks.sort(function(a, b) { return a - b; });

            console.log('App: Recovering', historicalBlocks.length, 'historical blocks (oldest:', historicalBlocks[0], ')');

            var idx = 0;

            function processNext() {
                if (idx >= historicalBlocks.length) {
                    // After user's own chain is recovered, discover other players
                    _recoverKnownAccountsChains(recentWindowStart, headBlock, function() {
                        // Set headBlock to current chain head so checkpoint is up-to-date.
                        // Without this, worldState.headBlock would point to the last
                        // historical block and a crash+restart would trigger a huge catch-up.
                        var state = StateEngine.getState();
                        state.headBlock = headBlock;

                        StateEngine.saveCheckpoint(function() {
                            console.log('App: Chain history recovery complete,', historicalBlocks.length, 'blocks processed');
                            _chainRecoveryDone = true;
                            _chainRecoveryBusy = false;
                            _recoveryProcessedBlocks = {}; // free memory
                            callback();
                        });
                    });
                    return;
                }

                var pct = (idx / historicalBlocks.length) * 80; // 0-80% for recovery
                _updateSyncStatus(pct, true);

                var blockNum = historicalBlocks[idx];
                _getHistoryBlock(blockNum, function(bErr, block) {
                    if (bErr || !block) {
                        console.log('App: Could not fetch historical block', blockNum);
                        idx++;
                        processNext();
                        return;
                    }

                    _processRecoveryBlock(blockNum, block);
                    idx++;

                    // Small delay to avoid hammering the node
                    setTimeout(processNext, 10);
                });
            }

            processNext();
        });
    }

    /**
     * After recovering the current user's chain, traverse VM chains of
     * other accounts discovered during replay (guild invite targets,
     * item transfer recipients, etc.) to rebuild guild rosters,
     * marketplace listings, and the social feed account list.
     * Processes up to 100 actions per account, only blocks older than
     * the 24h window (to avoid overlap with normal polling).
     * Uses _recoveryProcessedBlocks to skip blocks already seen.
     */
    function _recoverKnownAccountsChains(recentWindowStart, currentHead, callback) {
        var state = StateEngine.getState();
        var user = VizAccount.getCurrentUser();
        var others = [];

        // Collect accounts discovered during user's chain replay
        if (state.social && state.social.knownAccounts) {
            for (var i = 0; i < state.social.knownAccounts.length; i++) {
                var acct = state.social.knownAccounts[i];
                if (acct && acct !== user) others.push(acct);
            }
        }

        if (others.length === 0) {
            console.log('App: No other accounts discovered, skipping secondary recovery');
            callback();
            return;
        }

        console.log('App: Recovering chains for', others.length, 'discovered accounts');
        var acctIdx = 0;

        function nextAccount() {
            if (acctIdx >= others.length) {
                console.log('App: Secondary account recovery complete');
                callback();
                return;
            }

            var account = others[acctIdx++];
            _updateSyncStatus(80 + (acctIdx / others.length) * 15, true); // 80-95%

            VMProtocol.traverseChain(account, 100, function(err, actions) {
                if (err || !actions || actions.length === 0) {
                    nextAccount();
                    return;
                }

                // Collect historical blocks for this account, skip already-processed
                var blocks = [];
                for (var i = 0; i < actions.length; i++) {
                    var bn = actions[i].blockNum;
                    if (bn < recentWindowStart && !_recoveryProcessedBlocks[bn]) {
                        blocks.push(bn);
                    }
                }

                if (blocks.length === 0) {
                    nextAccount();
                    return;
                }

                blocks.sort(function(a, b) { return a - b; });
                var bIdx = 0;

                function nextBlock() {
                    if (bIdx >= blocks.length) {
                        nextAccount();
                        return;
                    }

                    var blockNum = blocks[bIdx];
                    _getHistoryBlock(blockNum, function(bErr, block) {
                        if (!bErr && block) {
                            _processRecoveryBlock(blockNum, block);
                        }
                        bIdx++;
                        setTimeout(nextBlock, 10);
                    });
                }

                nextBlock();
            });
        }

        nextAccount();
    }

    function _startBlockPolling() {
        if (_pollTimer) return;

        var state = StateEngine.getState();
        _lastPolledBlock = state.headBlock || 0;
        console.log('App: Block polling started from block', _lastPolledBlock);

        _pollTimer = setInterval(function() {
            if (_pollBusy) return;
            if (!VizConnection.isConnected()) return;

            _pollBusy = true;
            viz.api.getDynamicGlobalProperties(function(err, dgp) {
                if (err || !dgp) {
                    _pollBusy = false;
                    return;
                }

                var headBlock = dgp.head_block_number;

                // If we have no lastPolledBlock, start from recent history.
                // Use a wide recovery window so guild state, duel flows, and
                // world boss encounters survive reloads and fresh logins.
                // 28800 blocks ≈ 24 hours — matches DUEL_ACCEPT_WINDOW.
                if (_lastPolledBlock === 0) {
                    // On a fresh device (no checkpoint), first recover the user's
                    // full action history via backward chain traversal before
                    // starting the normal 24h forward replay.
                    // Keep _pollBusy=true so no other poll ticks fire during recovery.
                    if (!_chainRecoveryDone) {
                        _recoverChainHistory(headBlock, function() {
                            // Recovery done — release lock, next tick sets 24h window
                            _pollBusy = false;
                        });
                        return;
                    }
                    _lastPolledBlock = Math.max(1, headBlock - 28800);
                }

                if (headBlock <= _lastPolledBlock) {
                    _syncStartBlock = 0;
                    _updateSyncStatus(100);
                    _pollBusy = false;
                    return;
                }

                if (!(_lastPolledBlock === 0 || (headBlock - _lastPolledBlock) >= 10)) {
                    _pollBusy = false;
                    return;
                }

                if (_syncStartBlock === 0 || _lastPolledBlock < _syncStartBlock) {
                    _syncStartBlock = _lastPolledBlock;
                }

                _updateSyncStatus(_calculateSyncPercent(_lastPolledBlock, headBlock));

                var startBlock = _lastPolledBlock + 1;
                var endBlock = _nextCatchupBatchEnd(startBlock, headBlock);

                _processBlockBatch(startBlock, endBlock, headBlock);
            });
        }, POLL_INTERVAL_MS);
    }

    /**
     * Choose a catch-up batch size based on remaining gap.
     * Keep large gaps moving quickly after stale checkpoints/reloads, then
     * shrink near head so UI updates stay responsive.
     */
    function _nextCatchupBatchEnd(startBlock, chainHead) {
        var remaining = Math.max(0, chainHead - startBlock + 1);
        var maxBatch = remaining > 1000 ? 200 : remaining > 100 ? 50 : 10;
        return Math.min(chainHead, startBlock + maxBatch - 1);
    }

    /**
     * Process a batch of blocks sequentially, then save checkpoint.
     */
    function _processBlockBatch(startBlock, endBlock, chainHead) {
        if (_shouldUseArchiveEventBatch(startBlock, endBlock, chainHead)) {
            _processArchiveEventBatch(startBlock, endBlock, chainHead, function(usedArchive) {
                if (!usedArchive) {
                    _processBlockBatchFromRpc(startBlock, endBlock, chainHead);
                }
            });
            return;
        }

        _processBlockBatchFromRpc(startBlock, endBlock, chainHead);
    }

    function _shouldUseArchiveEventBatch(startBlock, endBlock, chainHead) {
        return typeof HistorySource !== 'undefined' &&
            HistorySource.getEventsRange &&
            chainHead - startBlock > 1000;
    }

    function _processArchiveEventBatch(startBlock, endBlock, chainHead, done) {
        HistorySource.getEventsRange({
            protocol: VizMagicConfig.PROTOCOLS.VM,
            start: startBlock,
            end: endBlock,
            limit: 1000
        }, function(err, events) {
            if (err || !events) {
                done(false);
                return;
            }

            events = events || [];
            events.sort(function(a, b) {
                if ((a.blockNum || 0) !== (b.blockNum || 0)) return (a.blockNum || 0) - (b.blockNum || 0);
                if ((a.txIndex || 0) !== (b.txIndex || 0)) return (a.txIndex || 0) - (b.txIndex || 0);
                return (a.opIndex || 0) - (b.opIndex || 0);
            });

            var grouped = {};
            var order = [];
            for (var i = 0; i < events.length; i++) {
                var ev = events[i];
                var blockNum = ev.blockNum || 0;
                if (!blockNum) continue;
                if (!grouped[blockNum]) {
                    grouped[blockNum] = {
                        vmActions: [],
                        voicePosts: [],
                        veEvents: [],
                        awards: [],
                        blockHash: ev.block_id || ev.previous || '',
                        blockNum: blockNum,
                        timestamp: ev.timestamp || ''
                    };
                    order.push(blockNum);
                }
                var parsedAction = VMProtocol.parseAction(ev.raw && ev.raw.json ? ev.raw.json : JSON.stringify(ev.payload || {}));
                if (parsedAction) {
                    grouped[blockNum].vmActions.push({
                        sender: ev.sender || '',
                        action: parsedAction,
                        blockNum: blockNum,
                        raw: ev.raw || {}
                    });
                }
            }

            var eventsCollected = [];
            for (var j = 0; j < order.length; j++) {
                var processed = grouped[order[j]];
                var stateEvents = StateEngine.processBlock(processed);
                for (var k = 0; k < stateEvents.length; k++) {
                    eventsCollected.push(stateEvents[k]);
                }
            }

            // Archive mode intentionally skips empty blocks. Advance the head so
            // stale checkpoints can catch up in seconds without replaying tens
            // of thousands of empty blocks through RPC.
            var state = StateEngine.getState();
            state.headBlock = endBlock;
            _finishProcessedBatch(endBlock, chainHead, eventsCollected);
            done(true);
        });
    }

    function _processBlockBatchFromRpc(startBlock, endBlock, chainHead) {
        var eventsCollected = [];

        BlockProcessor.processBlockRange(startBlock, endBlock, function(processed, blockNum) {
            // Feed each processed block into StateEngine
            var events = StateEngine.processBlock(processed);
            for (var i = 0; i < events.length; i++) {
                eventsCollected.push(events[i]);
            }
        }, function(err) {
            _finishProcessedBatch(endBlock, chainHead, eventsCollected);
        });
    }

    function _finishProcessedBatch(endBlock, chainHead, eventsCollected) {
        _lastPolledBlock = endBlock;

        // Emit game events to EventBus for UI reactivity
        for (var i = 0; i < eventsCollected.length; i++) {
            var evt = eventsCollected[i];
            if (evt.type) {
                Helpers.EventBus.emit(evt.type, evt);
            }
        }

        // Save checkpoint periodically (every batch)
        StateEngine.saveCheckpoint(function(cpErr) {
            if (cpErr) {
                console.log('App: Checkpoint save error:', cpErr);
            }

            _updateSyncStatus(_calculateSyncPercent(endBlock, chainHead));
            _refreshActiveScreenAfterSync(eventsCollected);

            // If there are more blocks to process, continue immediately
            if (endBlock < chainHead) {
                var nextStart = endBlock + 1;
                var nextEnd = _nextCatchupBatchEnd(nextStart, chainHead);
                _processBlockBatch(nextStart, nextEnd, chainHead);
            } else {
                _syncStartBlock = 0;
                _updateSyncStatus(100);
                _pollBusy = false;
            }
        });
    }

    function _calculateSyncPercent(processedBlock, chainHead) {
        if (!chainHead || processedBlock >= chainHead) return 100;
        if (!_syncStartBlock || chainHead <= _syncStartBlock) return 100;

        var done = processedBlock - _syncStartBlock;
        var total = chainHead - _syncStartBlock;
        if (total <= 0) return 100;

        return (done / total) * 100;
    }

    function _refreshActiveScreenAfterSync(eventsCollected) {
        var reactiveScreens = {
            home: true,
            character: true,
            quests: true,
            map: true,
            chronicle: true,
            guild: true,
            arena: true,
            marketplace: true,
            leaderboard: true,
            'world-boss': true
        };

        if (!reactiveScreens[currentScreen]) return;
        if (!eventsCollected || !eventsCollected.length) return;

        _renderScreen(currentScreen);
    }

    /**
     * Stop block polling (for cleanup)
     */
    function _stopBlockPolling() {
        if (_pollTimer) {
            clearInterval(_pollTimer);
            _pollTimer = null;
        }
        _pollBusy = false;
    }

    /**
     * Get current screen
     */
    function getCurrentScreen() {
        return currentScreen;
    }

    return {
        init: init,
        navigateTo: navigateTo,
        installShortcut: installShortcut,
        getCurrentScreen: getCurrentScreen
    };
})();

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
