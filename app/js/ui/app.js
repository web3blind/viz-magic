/**
 * Viz Magic — Main App Controller
 * Screen routing, initialization sequence, event bus integration.
 */
var App = (function() {
    'use strict';

    var currentScreen = 'landing';
    var screens = ['landing', 'onboarding', 'login', 'home', 'character', 'hunt', 'inventory', 'chronicle', 'duel', 'arena', 'guild', 'map', 'marketplace', 'crafting', 'quests', 'world-boss', 'settings'];
    var initialized = false;

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
                            var character = CharacterSystem.createCharacter(user, grimoire.name, grimoire.class);
                            if (character) {
                                state.characters[user] = character;
                                state.inventories[user] = state.inventories[user] || [];
                                console.log('Character restored from grimoire:', grimoire.name, grimoire.class);
                            }
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
        var gameScreens = ['home', 'character', 'hunt', 'inventory', 'chronicle', 'duel', 'arena', 'guild', 'map', 'marketplace', 'crafting', 'quests', 'world-boss', 'settings'];
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
