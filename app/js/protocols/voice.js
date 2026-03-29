/**
 * Viz Magic — Voice (V) Protocol Reader
 * Reads and parses V protocol messages for the Realm Chronicle social feed.
 */
var VoiceProtocol = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /**
     * V protocol message types:
     *   (default/omitted) = text
     *   'p' = publication (article)
     *   'e' = encoded (encrypted)
     *
     * VE event types:
     *   'h' = hide
     *   'e' = edit
     *   'a' = append
     */

    /**
     * Parse a V protocol message
     * @param {string|Object} input - JSON string or object from custom op
     * @returns {Object|null} parsed message
     */
    function parseMessage(input) {
        var obj;
        if (typeof input === 'string') {
            try {
                obj = JSON.parse(input);
            } catch(e) {
                return null;
            }
        } else {
            obj = input;
        }

        if (!obj) return null;

        var result = {
            previousBlock: obj.p || 0,
            type: obj.t || 'text',
            data: obj.d || {}
        };

        // Parse based on type
        if (result.type === 'text' || !obj.t) {
            result.type = 'text';
            result.text = (result.data && result.data.t) || '';
            result.reply = (result.data && result.data.r) || null;
            result.share = (result.data && result.data.s) || null;
            result.beneficiaries = (result.data && result.data.b) || [];
        } else if (result.type === 'p') {
            result.type = 'publication';
            result.title = (result.data && result.data.t) || '';
            result.markdown = (result.data && result.data.m) || '';
            result.description = (result.data && result.data.d) || '';
            result.image = (result.data && result.data.i) || '';
            result.reply = (result.data && result.data.r) || null;
            result.share = (result.data && result.data.s) || null;
        } else if (result.type === 'e') {
            result.type = 'encoded';
            result.comment = obj.c || '';
            result.encryptedData = result.data;
        }

        return result;
    }

    /**
     * Parse a VE (Voice Events) protocol message
     * @param {string|Object} input
     * @returns {Object|null} parsed event
     */
    function parseEvent(input) {
        var obj;
        if (typeof input === 'string') {
            try {
                obj = JSON.parse(input);
            } catch(e) {
                return null;
            }
        } else {
            obj = input;
        }

        if (!obj) return null;

        return {
            previousBlock: obj.p || 0,
            eventType: obj.e || '',    // 'h'=hide, 'e'=edit, 'a'=append
            targetBlock: obj.b || 0,
            targetAccount: obj.a || '',
            data: obj.d || null
        };
    }

    /**
     * Create a text post for the Realm Chronicle
     * @param {string} text
     * @param {number} previousBlock
     * @param {Object} [options] - {reply, share, beneficiaries}
     * @returns {Object} protocol object
     */
    function createTextPost(text, previousBlock, options) {
        options = options || {};
        var d = { t: text };
        if (options.reply) d.r = options.reply;
        if (options.share) d.s = options.share;
        if (options.beneficiaries && options.beneficiaries.length > 0) {
            d.b = options.beneficiaries;
        }

        return {
            p: previousBlock || 0,
            d: d
        };
    }

    /**
     * Load chronicle entries for an account by traversing backward chain
     * @param {string} account
     * @param {number} maxEntries
     * @param {Function} callback - (err, entries[])
     */
    function loadChronicle(account, maxEntries, callback) {
        maxEntries = maxEntries || 20;
        var entries = [];

        VizAccount.getAccountProtocol(account, cfg.PROTOCOLS.V, function(err, response) {
            if (err || !response || !response.custom_sequence_block_num) {
                callback(null, entries);
                return;
            }

            _fetchEntry(response.custom_sequence_block_num, entries, maxEntries, account, callback);
        });
    }

    /**
     * Recursively fetch chronicle entries
     */
    function _fetchEntry(blockNum, entries, remaining, targetAccount, callback) {
        if (!blockNum || blockNum <= 0 || remaining <= 0) {
            callback(null, entries);
            return;
        }

        viz.api.getBlock(blockNum, function(err, block) {
            if (err || !block) {
                callback(null, entries);
                return;
            }

            var previousBlock = 0;
            var found = false;

            if (block.transactions) {
                for (var i = 0; i < block.transactions.length; i++) {
                    var tx = block.transactions[i];
                    if (tx.operations) {
                        for (var j = 0; j < tx.operations.length; j++) {
                            var op = tx.operations[j];
                            if (op[0] === 'custom' && op[1].id === cfg.PROTOCOLS.V) {
                                var sender = '';
                                if (op[1].required_regular_auths && op[1].required_regular_auths.length > 0) {
                                    sender = op[1].required_regular_auths[0];
                                }
                                if (targetAccount && sender !== targetAccount) continue;

                                var parsed = parseMessage(op[1].json);
                                if (parsed) {
                                    entries.push({
                                        blockNum: blockNum,
                                        blockTime: block.timestamp,
                                        sender: sender,
                                        message: parsed
                                    });
                                    previousBlock = parsed.previousBlock;
                                    found = true;
                                }
                            }
                        }
                    }
                }
            }

            if (found && previousBlock > 0) {
                _fetchEntry(previousBlock, entries, remaining - 1, targetAccount, callback);
            } else {
                callback(null, entries);
            }
        });
    }

    return {
        parseMessage: parseMessage,
        parseEvent: parseEvent,
        createTextPost: createTextPost,
        loadChronicle: loadChronicle
    };
})();
