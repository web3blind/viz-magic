/**
 * Viz Magic — Main App Controller
 * Screen routing, initialization sequence, event bus integration.
 */
var App = (function() {
    'use strict';

    var currentScreen = 'landing';
    var screens = ['landing', 'onboarding', 'login', 'home', 'character', 'hunt', 'inventory', 'chronicle', 'duel', 'arena', 'guild', 'map', 'marketplace', 'crafting', 'quests', 'world-boss', 'settings', 'help', 'leaderboard'];
    var initialized = false;
    var _pollTimer = null;
    var _lastPolledBlock = 0;
    var _pollBusy = false;
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
                Toast.info(Helpers.t('conn_disconnected'));
            } else {
                console.log('Connected to VIZ network');
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
            Toast.info(Helpers.t('conn_disconnected'));
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
        var gameScreens = ['home', 'character', 'hunt', 'inventory', 'chronicle', 'duel', 'arena', 'guild', 'map', 'marketplace', 'crafting', 'quests', 'world-boss', 'settings', 'help', 'leaderboard'];
        var nav = Helpers.$('bottom-nav');
        if (gameScreens.indexOf(screenId) !== -1) {
            nav.classList.add('show');
            NavComponent.setActive(screenId);
        } else {
            nav.classList.remove('show');
        }

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
        }
    }

    /**
     * Show initial connection status
     */
    function _showConnectionStatus() {
        var statusEl = Helpers.$('connection-status');
        if (statusEl) {
            statusEl.textContent = Helpers.t('conn_connecting');
            statusEl.classList.add('show');
            setTimeout(function() {
                statusEl.classList.remove('show');
            }, 3000);
        }
    }

    /**
     * Register PWA service worker
     */
    function _registerPWA() {
        if ('file://' === document.location.origin) return;
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function() {
                console.log('Service Worker Registered');
            }).catch(function(err) {
                console.log('SW registration failed:', err);
            });
        }
    }

    /**
     * Start periodic block polling for real-time state sync.
     * Every POLL_INTERVAL_MS checks chain head and processes new blocks
     * through BlockProcessor → StateEngine → checkpoint save.
     */
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

                // If we have no lastPolledBlock, start from recent history
                // (last 200 blocks ~ 10 minutes) to catch duel actions
                if (_lastPolledBlock === 0) {
                    _lastPolledBlock = Math.max(1, headBlock - 200);
                }

                if (headBlock <= _lastPolledBlock) {
                    _pollBusy = false;
                    return;
                }

                // Cap batch size to avoid overwhelming the node
                var startBlock = _lastPolledBlock + 1;
                var maxBatch = 10;
                var endBlock = Math.min(headBlock, startBlock + maxBatch - 1);

                _processBlockBatch(startBlock, endBlock, headBlock);
            });
        }, POLL_INTERVAL_MS);
    }

    /**
     * Process a batch of blocks sequentially, then save checkpoint.
     */
    function _processBlockBatch(startBlock, endBlock, chainHead) {
        var eventsCollected = [];

        BlockProcessor.processBlockRange(startBlock, endBlock, function(processed, blockNum) {
            // Feed each processed block into StateEngine
            var events = StateEngine.processBlock(processed);
            for (var i = 0; i < events.length; i++) {
                eventsCollected.push(events[i]);
            }
        }, function(err) {
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

                // If there are more blocks to process, continue immediately
                if (endBlock < chainHead) {
                    var nextStart = endBlock + 1;
                    var nextEnd = Math.min(chainHead, nextStart + 9);
                    _processBlockBatch(nextStart, nextEnd, chainHead);
                } else {
                    _pollBusy = false;
                }
            });
        });
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
        getCurrentScreen: getCurrentScreen
    };
})();

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
