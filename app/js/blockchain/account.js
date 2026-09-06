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
    var SESSION_SCHEMA_VERSION = 2;
    var progressionRecoveryPending = {};
    var lastStorageError = '';

    function _sessionStorage() {
        try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch (e) { return null; }
    }

    /**
     * Initialize — restore session from localStorage
     */
    function init() {
        var saved = null;
        try {
            saved = localStorage.getItem(prefix + 'session');
        } catch (storageReadError) {
            console.log('Failed to read saved session:', storageReadError);
        }
        if (!saved) {
            var fallbackStorage = _sessionStorage();
            try { saved = fallbackStorage ? fallbackStorage.getItem(prefix + 'session_safe') : null; } catch (fallbackReadError) {}
        }
        if (saved) {
            try {
                var session = JSON.parse(saved);
                currentUser = session.currentUser || '';
                users = session.users || {};
                var needsSanitizing = Number(session.schemaVersion || 1) < SESSION_SCHEMA_VERSION;
                for (var account in users) {
                    if (!users.hasOwnProperty(account) || !users[account]) continue;
                    if (users[account].active_key && users[account].active_key_persist !== true) {
                        // Keep a legacy key available only for this page lifetime,
                        // then rewrite storage without treating old persistence as consent.
                        users[account].active_key_persist = false;
                        needsSanitizing = true;
                    }
                }
                if (needsSanitizing) _saveSession();
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
            var keyAuths = [];
            if (account.regular_authority && account.regular_authority.key_auths) {
                keyAuths = account.regular_authority.key_auths;
            }
            var threshold = account.regular_authority ? account.regular_authority.weight_threshold : 1;

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
     * Get the active key for current user (optional, required for delegation)
     * @returns {string|null}
     */
    function getActiveKey() {
        if (!currentUser || !users[currentUser]) return null;
        return users[currentUser].active_key || null;
    }

    /**
     * Check if active key is saved for current user
     * @returns {boolean}
     */
    function hasActiveKey() {
        return !!getActiveKey();
    }

    /**
     * Save active key after validating against chain.
     * @param {string} activeKey - WIF private active key
     * @param {Function} callback - (err)
     */
    function saveActiveKey(activeKey, persist, callback) {
        if (typeof persist === 'function') {
            callback = persist;
            persist = false;
        }
        callback = callback || function() {};
        if (!currentUser || !users[currentUser]) {
            callback(new Error('not_logged_in'));
            return;
        }
        activeKey = activeKey.trim();
        if (!activeKey) {
            callback(new Error('empty_key'));
            return;
        }

        // Validate against chain active_authority
        getAccount(currentUser, function(err, account) {
            if (err) {
                callback(err);
                return;
            }

            var keyAuths = (account.active_authority && account.active_authority.key_auths) || [];
            var threshold = account.active_authority ? account.active_authority.weight_threshold : 1;
            var valid = false;

            for (var i = 0; i < keyAuths.length; i++) {
                if (keyAuths[i][1] >= threshold) {
                    try {
                        if (viz.auth.wifIsValid(activeKey, keyAuths[i][0])) {
                            valid = true;
                            break;
                        }
                    } catch(e) {
                        // invalid format
                    }
                }
            }

            if (!valid) {
                callback(new Error('invalid_active_key'));
                return;
            }

            users[currentUser].active_key = activeKey;
            users[currentUser].active_key_persist = persist === true;
            if (!_saveSession()) {
                users[currentUser].active_key_persist = false;
                callback(new Error('storage_write_failed'));
                return;
            }
            callback(null);
        });
    }

    /**
     * Remove saved active key for current user
     */
    function clearActiveKey() {
        if (!currentUser || !users[currentUser]) return;
        delete users[currentUser].active_key;
        users[currentUser].active_key_persist = false;
        _saveSession();
    }

    function isActiveKeyPersistenceEnabled() {
        return !!(currentUser && users[currentUser] && users[currentUser].active_key_persist === true);
    }

    function getLastStorageError() {
        return lastStorageError;
    }

    function setProgressionRecoveryPending(account, pending) {
        if (!account) return;
        progressionRecoveryPending[account] = pending === true;
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

    var MAX_PROFILE_AVATAR_CHARS = 32768;

    function getProfileAvatar(account) {
        if (!account) return '';
        try {
            var meta = JSON.parse(account.json_metadata || '{}');
            var profile = meta.profile || {};
            var avatar = profile.avatar || profile.profile_image || profile.profile_image_url || profile.image || profile.picture || '';
            return sanitizeAvatarUrl(avatar);
        } catch(e) {
            return '';
        }
    }

    function sanitizeAvatarUrl(url) {
        if (!url || typeof url !== 'string') return '';
        url = url.trim();
        if (url.length > MAX_PROFILE_AVATAR_CHARS) return '';
        if (/^https?:\/\//i.test(url)) return url;
        if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url.replace(/\s+/g, '');
        return '';
    }

    function updateProfileAvatar(avatarDataUrl, callback) {
        callback = callback || function() {};
        var safeAvatar = sanitizeAvatarUrl(avatarDataUrl);
        if (!safeAvatar) {
            callback(new Error('invalid_avatar'));
            return;
        }
        _updateProfileField('avatar', safeAvatar, callback);
    }

    function removeProfileAvatar(callback) {
        callback = callback || function() {};
        _updateProfileField('avatar', '', callback);
    }

    function _updateProfileField(field, value, callback) {
        if (!isLoggedIn()) {
            callback(new Error('not_logged_in'));
            return;
        }
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
            if (!meta.profile || typeof meta.profile !== 'object') meta.profile = {};
            if (value) meta.profile[field] = value;
            else delete meta.profile[field];

            viz.broadcast.accountMetadata(
                users[currentUser].regular_key,
                currentUser,
                JSON.stringify(meta),
                function(updateErr, result) {
                    callback(updateErr, result);
                }
            );
        });
    }

    /**
     * Update Grimoire (game metadata) on chain
     * @param {Object} grimoireData - game-specific metadata
     * @param {Function} callback - (err, result)
     */
    function updateGrimoire(grimoireData, callback) {
        callback = callback || function() {};
        if (!isLoggedIn()) {
            callback(new Error('not_logged_in'));
            return;
        }
        if (progressionRecoveryPending[currentUser]) {
            callback(new Error('progression_recovery_pending'));
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
     * @returns {number} effective shares in integer micro-SHARES
     */
    function getEffectiveShares(account) {
        var own = parseFloat(account.vesting_shares) || 0;
        var received = parseFloat(account.received_vesting_shares) || 0;
        var delegated = parseFloat(account.delegated_vesting_shares) || 0;
        return Math.max(0, Math.round((own + received - delegated) * 1000000));
    }

    /**
     * Save session to localStorage
     */
    function _saveSession() {
        var persistedUsers = {};
        var safeUsers = {};
        for (var account in users) {
            if (!users.hasOwnProperty(account) || !users[account]) continue;
            persistedUsers[account] = { regular_key: users[account].regular_key };
            safeUsers[account] = { regular_key: users[account].regular_key };
            if (users[account].active_key && users[account].active_key_persist === true) {
                persistedUsers[account].active_key = users[account].active_key;
                persistedUsers[account].active_key_persist = true;
            }
        }
        var payload = JSON.stringify({
            schemaVersion: SESSION_SCHEMA_VERSION,
            currentUser: currentUser,
            users: persistedUsers
        });
        var safePayload = JSON.stringify({
            schemaVersion: SESSION_SCHEMA_VERSION,
            currentUser: currentUser,
            users: safeUsers
        });
        try {
            localStorage.setItem(prefix + 'session', payload);
            var fallbackStorage = _sessionStorage();
            if (fallbackStorage) fallbackStorage.removeItem(prefix + 'session_safe');
            lastStorageError = '';
            return true;
        } catch (storageWriteError) {
            // A legacy active key must never remain persisted merely because
            // migration failed. Preserve the regular login for this tab/reload
            // in sessionStorage, but never copy an active key into the fallback.
            try { localStorage.removeItem(prefix + 'session'); } catch (removeError) {}
            try {
                var safeStorage = _sessionStorage();
                if (safeStorage) safeStorage.setItem(prefix + 'session_safe', safePayload);
            } catch (fallbackWriteError) {}
            lastStorageError = 'storage_write_failed';
            console.log('Failed to save session safely:', storageWriteError);
            return false;
        }
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
        getProfileAvatar: getProfileAvatar,
        sanitizeAvatarUrl: sanitizeAvatarUrl,
        updateProfileAvatar: updateProfileAvatar,
        removeProfileAvatar: removeProfileAvatar,
        updateGrimoire: updateGrimoire,
        calculateCurrentEnergy: calculateCurrentEnergy,
        getEffectiveShares: getEffectiveShares,
        getActiveKey: getActiveKey,
        hasActiveKey: hasActiveKey,
        isActiveKeyPersistenceEnabled: isActiveKeyPersistenceEnabled,
        getLastStorageError: getLastStorageError,
        setProgressionRecoveryPending: setProgressionRecoveryPending,
        saveActiveKey: saveActiveKey,
        clearActiveKey: clearActiveKey
    };
})();
