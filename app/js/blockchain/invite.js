/**
 * Viz Magic — Invite System
 * Create invites (Summoning Scrolls), register new accounts,
 * and claim invite balances.
 */
var VizInvite = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /**
     * Generate a new invite keypair
     * @returns {Object} {publicKey, privateKey}
     */
    function generateInviteKeys() {
        var password = viz.formatter.createSuggestedPassword();
        var keys = viz.auth.generateKeys('', password, ['active']);
        return {
            publicKey: keys.activePubkey || keys.active,
            privateKey: keys.active,
            password: password
        };
    }

    /**
     * Create an invite (Summoning Scroll)
     * Requires active key — not available through regular key login.
     * This is a placeholder for when active key operations are supported.
     * @param {string} activeWif - active private key
     * @param {string} creator - creator account
     * @param {string} balance - "10.000 VIZ"
     * @param {Function} callback
     */
    function createInvite(activeWif, creator, balance, callback) {
        var keys = generateInviteKeys();

        viz.broadcast.createInvite(
            activeWif,
            creator,
            balance,
            keys.publicKey,
            function(err, result) {
                if (err) {
                    callback(err);
                } else {
                    callback(null, {
                        result: result,
                        inviteKey: keys.privateKey,
                        invitePublicKey: keys.publicKey,
                        password: keys.password
                    });
                }
            }
        );
    }

    /**
     * Register a new account using an invite (Summoning Scroll activation)
     * @param {string} activeWif - any account's active key (initiator)
     * @param {string} initiator - initiator account name
     * @param {string} newAccountName - new account name
     * @param {string} inviteSecret - invite private key (WIF)
     * @param {string} newAccountPassword - password for new account
     * @param {Function} callback
     */
    function registerWithInvite(activeWif, initiator, newAccountName, inviteSecret, newAccountPassword, callback) {
        // Generate keys from the new password
        var newKeys = viz.auth.generateKeys(newAccountName, newAccountPassword, ['master', 'active', 'regular', 'memo']);
        // Use master public key for all auth levels of new account
        var newAccountKey = newKeys.masterPubkey || newKeys.master;

        viz.broadcast.inviteRegistration(
            activeWif,
            initiator,
            newAccountName,
            inviteSecret,
            newAccountKey,
            function(err, result) {
                if (err) {
                    callback(err);
                } else {
                    callback(null, {
                        result: result,
                        keys: newKeys,
                        accountName: newAccountName
                    });
                }
            }
        );
    }

    /**
     * Claim invite balance to an existing account (as liquid VIZ)
     * @param {string} activeWif - any account's active key
     * @param {string} initiator - initiator account name
     * @param {string} receiver - account receiving VIZ
     * @param {string} inviteSecret - invite private key
     * @param {Function} callback
     */
    function claimInvite(activeWif, initiator, receiver, inviteSecret, callback) {
        viz.broadcast.claimInviteBalance(
            activeWif,
            initiator,
            receiver,
            inviteSecret,
            callback
        );
    }

    /**
     * Use invite balance as SHARES (Attune Core — receive as vesting)
     * @param {string} activeWif
     * @param {string} initiator
     * @param {string} receiver
     * @param {string} inviteSecret
     * @param {Function} callback
     */
    function useInviteAsShares(activeWif, initiator, receiver, inviteSecret, callback) {
        viz.broadcast.useInviteBalance(
            activeWif,
            initiator,
            receiver,
            inviteSecret,
            callback
        );
    }

    /**
     * Get invite by public key
     * @param {string} publicKey
     * @param {Function} callback
     */
    function getInviteByKey(publicKey, callback) {
        viz.api.getInviteByKey(publicKey, callback);
    }

    /**
     * Generate an invite link for sharing
     * @param {string} inviteSecret - private key of the invite
     * @returns {string} shareable link
     */
    function generateInviteLink(inviteSecret) {
        return window.location.origin + '/?invite=' + encodeURIComponent(inviteSecret);
    }

    /**
     * Parse invite code from URL
     * @returns {string|null} invite secret if present
     */
    function parseInviteFromURL() {
        var params = new URLSearchParams(window.location.search);
        return params.get('invite') || null;
    }

    return {
        generateInviteKeys: generateInviteKeys,
        createInvite: createInvite,
        registerWithInvite: registerWithInvite,
        claimInvite: claimInvite,
        useInviteAsShares: useInviteAsShares,
        getInviteByKey: getInviteByKey,
        generateInviteLink: generateInviteLink,
        parseInviteFromURL: parseInviteFromURL
    };
})();
