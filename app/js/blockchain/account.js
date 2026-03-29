/**
 * Viz Magic — Account Operations
 * Login with regular key, validate against chain, store encrypted in localStorage,
 * getAccount wrapper, metadata read/write.
 */
var VizAccount = (function() {
    'use strict';

    var cfg = VizMagicConfig;
    var prefix = cfg.STORAGE_PREFIX;
    var currentUser = '';
    var users = {};

    /**
     * Initialize — restore session from localStorage
     */
    function init() {
        var saved = localStorage.getItem(prefix + 'session');
        if (saved) {
            try {
                var session = JSON.parse(saved);
                currentUser = session.currentUser || '';
                users = session.users || {};
            } catch(e) {
                console.log('Failed to parse saved session:', e);
                currentUser = '';
                users = {};
            }
        }
    }

    /**
     * Login with account name and regular key.
     * Validates the key against the chain.
     * @param {string} login - account name
     * @param {string} regularKey - WIF private regular key
     * @param {Function} callback - (err, accountData)
     */
    function login(login, regularKey, callback) {
        login = login.toLowerCase().trim();
        if (login.charAt(0) === '@') {
            login = login.substring(1);
        }
        regularKey = regularKey.trim();

        if (!login) {
            callback(new Error('empty_account'));
            return;
        }
        if (!regularKey) {
            callback(new Error('empty_key'));
            return;
        }

        viz.api.getAccounts([login], function(err, response) {
            if (err || !response || response.length === 0) {
                callback(new Error('account_not_found'));
                return;
            }

            var account = response[0];
            var regularValid = false;

            // Validate the regular key against chain authority
            var keyAuths = account.regular_authority.key_auths;
            var threshold = account.regular_authority.weight_threshold;

            for (var i = 0; i < keyAuths.length; i++) {
                if (keyAuths[i][1] >= threshold) {
                    try {
                        if (viz.auth.wifIsValid(regularKey, keyAuths[i][0])) {
                            regularValid = true;
                            break;
                        }
                    } catch(e) {
                        // Invalid key format
                    }
                }
            }

            if (!regularValid) {
                callback(new Error('invalid_regular_key'));
                return;
            }

            // Store session
            users[login] = { regular_key: regularKey };
            currentUser = login;
            _saveSession();

            callback(null, account);
        });
    }

    /**
     * Logout current user
     */
    function logout() {
        if (currentUser && users[currentUser]) {
            delete users[currentUser];
        }
        currentUser = '';
        _saveSession();
    }

    /**
     * Check if user is logged in
     * @returns {boolean}
     */
    function isLoggedIn() {
        return currentUser !== '' && users[currentUser] && users[currentUser].regular_key;
    }

    /**
     * Get current user name
     * @returns {string}
     */
    function getCurrentUser() {
        return currentUser;
    }

    /**
     * Get the regular key for current user
     * @returns {string|null}
     */
    function getRegularKey() {
        if (!currentUser || !users[currentUser]) return null;
        return users[currentUser].regular_key;
    }

    /**
     * Get full account data from chain
     * @param {string} accountName
     * @param {Function} callback - (err, account)
     */
    function getAccount(accountName, callback) {
        viz.api.getAccounts([accountName], function(err, response) {
            if (err || !response || response.length === 0) {
                callback(err || new Error('account_not_found'));
                return;
            }
            callback(null, response[0]);
        });
    }

    /**
     * Get account with protocol-specific data (custom_sequence info)
     * @param {string} accountName
     * @param {string} protocolId - e.g. 'VM', 'V', 'VE'
     * @param {Function} callback - (err, accountWithProtocol)
     */
    function getAccountProtocol(accountName, protocolId, callback) {
        viz.api.getAccount(accountName, protocolId, function(err, response) {
            if (err) {
                callback(err);
                return;
            }
            callback(null, response);
        });
    }

    /**
     * Parse Grimoire (game metadata) from account's json_metadata
     * @param {Object} account - account object from chain
     * @returns {Object} grimoire data or empty object
     */
    function parseGrimoire(account) {
        try {
            var meta = JSON.parse(account.json_metadata || '{}');
            return meta[cfg.GRIMOIRE_KEY] || {};
        } catch(e) {
            return {};
        }
    }

    /**
     * Update Grimoire (game metadata) on chain
     * @param {Object} grimoireData - game-specific metadata
     * @param {Function} callback - (err, result)
     */
    function updateGrimoire(grimoireData, callback) {
        if (!isLoggedIn()) {
            callback(new Error('not_logged_in'));
            return;
        }

        // First get current metadata to preserve non-game fields
        getAccount(currentUser, function(err, account) {
            if (err) {
                callback(err);
                return;
            }

            var meta = {};
            try {
                meta = JSON.parse(account.json_metadata || '{}');
            } catch(e) {
                meta = {};
            }

            meta[cfg.GRIMOIRE_KEY] = grimoireData;

            viz.broadcast.accountMetadata(
                users[currentUser].regular_key,
                currentUser,
                JSON.stringify(meta),
                function(err, result) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, result);
                    }
                }
            );
        });
    }

    /**
     * Calculate current mana (energy) for an account
     * @param {Object} account - account object from chain
     * @returns {number} current energy 0-10000
     */
    function calculateCurrentEnergy(account) {
        var lastEnergy = parseInt(account.energy) || 0;
        var lastUpdate = new Date(account.last_vote_time + 'Z').getTime() / 1000;
        var now = Date.now() / 1000;
        var elapsed = now - lastUpdate;

        var regen = Math.floor(10000 * elapsed / cfg.ENERGY.REGEN_SECONDS);
        var current = lastEnergy + regen;
        if (current > 10000) current = 10000;
        return current;
    }

    /**
     * Calculate effective shares (own + received - delegated)
     * @param {Object} account
     * @returns {number} effective shares in SHARES units
     */
    function getEffectiveShares(account) {
        var own = parseFloat(account.vesting_shares) || 0;
        var received = parseFloat(account.received_vesting_shares) || 0;
        var delegated = parseFloat(account.delegated_vesting_shares) || 0;
        return own + received - delegated;
    }

    /**
     * Save session to localStorage
     */
    function _saveSession() {
        localStorage.setItem(prefix + 'session', JSON.stringify({
            currentUser: currentUser,
            users: users
        }));
    }

    return {
        init: init,
        login: login,
        logout: logout,
        isLoggedIn: isLoggedIn,
        getCurrentUser: getCurrentUser,
        getRegularKey: getRegularKey,
        getAccount: getAccount,
        getAccountProtocol: getAccountProtocol,
        parseGrimoire: parseGrimoire,
        updateGrimoire: updateGrimoire,
        calculateCurrentEnergy: calculateCurrentEnergy,
        getEffectiveShares: getEffectiveShares
    };
})();
