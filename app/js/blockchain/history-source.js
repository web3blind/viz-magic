/**
 * Viz Magic — History Source
 * Read-only source layer for old public chain history.
 * VIZ RPC remains the live source; optional archive mirrors can serve old
 * blocks when a public node no longer keeps enough history.
 */
var HistorySource = (function() {
    'use strict';

    function _makeError(message) {
        try { return new Error(message); } catch (e) { return { message: message }; }
    }

    function _archiveMirrors() {
        if (typeof VizMagicConfig === 'undefined' || !VizMagicConfig.HISTORY_ARCHIVE_MIRRORS) {
            return [];
        }
        return VizMagicConfig.HISTORY_ARCHIVE_MIRRORS;
    }

    function _normalizeMirror(mirror) {
        if (typeof mirror === 'string') {
            return { url: mirror };
        }
        return mirror || {};
    }

    function _mirrorUrl(mirror, blockNum) {
        var pattern = mirror.url || mirror.blockUrl || '';
        if (!pattern) return '';
        if (pattern.indexOf('{block}') !== -1) {
            return pattern.replace('{block}', encodeURIComponent(String(blockNum)));
        }
        return pattern.replace(/\/$/, '') + '/' + encodeURIComponent(String(blockNum)) + '.json';
    }

    function _eventsUrl(mirror, blockNum) {
        var pattern = mirror.eventsUrl || mirror.blockEventsUrl || '';
        if (!pattern && mirror.apiBase) {
            pattern = String(mirror.apiBase).replace(/\/$/, '') + '/v1/events/block/{block}.json';
        }
        if (!pattern) return '';
        if (pattern.indexOf('{block}') !== -1) {
            return pattern.replace('{block}', encodeURIComponent(String(blockNum)));
        }
        return pattern.replace(/\/$/, '') + '/' + encodeURIComponent(String(blockNum)) + '.json';
    }

    function _guildsUrl(mirror) {
        var pattern = mirror.guildsUrl || '';
        if (!pattern && mirror.apiBase) {
            pattern = String(mirror.apiBase).replace(/\/$/, '') + '/v1/guilds';
        }
        return pattern;
    }

    function _eventsPayloadToThinBlock(payload) {
        if (!payload || !payload.events) return null;
        var events = payload.events || [];
        var block = {
            previous: payload.previous || '',
            timestamp: payload.timestamp || '',
            block_id: payload.block_id || payload.blockId || '',
            transactions: []
        };
        var byTx = {};
        for (var i = 0; i < events.length; i++) {
            var ev = events[i] || {};
            var txIndex = ev.txIndex || ev.tx_index || 0;
            if (!byTx[txIndex]) {
                byTx[txIndex] = { operations: [] };
                block.transactions.push(byTx[txIndex]);
            }
            if (ev.opType === 'custom' || ev.op_type === 'custom') {
                byTx[txIndex].operations.push(['custom', ev.raw || {}]);
            } else if (ev.opType === 'award' || ev.op_type === 'award') {
                byTx[txIndex].operations.push(['award', ev.raw || {}]);
            }
        }
        return block;
    }

    function _extractBlockFromMirrorPayload(payload) {
        if (!payload) return null;
        if (payload.previous && payload.timestamp && payload.transactions) return payload;
        if (payload.block && payload.block.previous && payload.block.transactions) return payload.block;
        if (payload.result && payload.result.previous && payload.result.transactions) return payload.result;
        if (payload.data && payload.data.block && payload.data.block.transactions) return payload.data.block;
        return null;
    }

    function _requestJson(url, timeoutMs, callback) {
        if (typeof XMLHttpRequest === 'undefined') {
            callback(_makeError('HTTP archive fetch is unavailable'));
            return;
        }
        var xhr = new XMLHttpRequest();
        var completed = false;
        var timer = setTimeout(function() {
            if (completed) return;
            completed = true;
            try { xhr.abort(); } catch (e) {}
            callback(_makeError('Archive mirror timeout'));
        }, timeoutMs || 6000);

        xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4 || completed) return;
            completed = true;
            clearTimeout(timer);
            if (xhr.status < 200 || xhr.status >= 300) {
                callback(_makeError('Archive mirror HTTP ' + xhr.status));
                return;
            }
            try {
                callback(null, JSON.parse(xhr.responseText));
            } catch (parseErr) {
                callback(parseErr);
            }
        };
        try {
            xhr.open('GET', url, true);
            xhr.send(null);
        } catch (err) {
            if (completed) return;
            completed = true;
            clearTimeout(timer);
            callback(err);
        }
    }

    function _getBlockEventsFromMirrors(blockNum, index, callback) {
        var mirrors = _archiveMirrors();
        if (!mirrors.length || index >= mirrors.length) {
            callback(_makeError('Block events unavailable from archive mirrors'));
            return;
        }
        var mirror = _normalizeMirror(mirrors[index]);
        var eventsUrl = _eventsUrl(mirror, blockNum);
        if (!eventsUrl) {
            _getBlockEventsFromMirrors(blockNum, index + 1, callback);
            return;
        }
        _requestJson(eventsUrl, mirror.timeoutMs || 6000, function(err, payload) {
            var block = err ? null : _eventsPayloadToThinBlock(payload);
            if (block) {
                callback(null, block);
                return;
            }
            _getBlockEventsFromMirrors(blockNum, index + 1, callback);
        });
    }

    function _getBlockFromMirrors(blockNum, index, callback) {
        var mirrors = _archiveMirrors();
        if (!mirrors.length || index >= mirrors.length) {
            callback(_makeError('Block unavailable from VIZ RPC and archive mirrors'));
            return;
        }
        var mirror = _normalizeMirror(mirrors[index]);
        var url = _mirrorUrl(mirror, blockNum);
        if (!url) {
            _getBlockFromMirrors(blockNum, index + 1, callback);
            return;
        }
        _requestJson(url, mirror.timeoutMs || 6000, function(err, payload) {
            var block = err ? null : _extractBlockFromMirrorPayload(payload);
            if (block) {
                callback(null, block);
                return;
            }
            _getBlockFromMirrors(blockNum, index + 1, callback);
        });
    }

    function getBlock(blockNum, callback) {
        callback = callback || function() {};
        if (!blockNum || blockNum <= 0) {
            callback(_makeError('Invalid block number'));
            return;
        }
        if (typeof viz === 'undefined' || !viz.api || !viz.api.getBlock) {
            _getBlockEventsFromMirrors(blockNum, 0, function(eventsErr, eventsBlock) {
                if (!eventsErr && eventsBlock) {
                    callback(null, eventsBlock);
                    return;
                }
                _getBlockFromMirrors(blockNum, 0, callback);
            });
            return;
        }
        viz.api.getBlock(blockNum, function(err, block) {
            if (!err && block) {
                callback(null, block);
                return;
            }
            _getBlockEventsFromMirrors(blockNum, 0, function(eventsErr, eventsBlock) {
                if (!eventsErr && eventsBlock) {
                    callback(null, eventsBlock);
                    return;
                }
                _getBlockFromMirrors(blockNum, 0, callback);
            });
        });
    }

    function getAccountProtocol(account, protocol, callback) {
        callback = callback || function() {};
        if (!account || !protocol) {
            callback(_makeError('Account and protocol are required'));
            return;
        }
        if (typeof VizAccount === 'undefined' || !VizAccount.getAccountProtocol) {
            callback(_makeError('Account protocol lookup is unavailable'));
            return;
        }
        VizAccount.getAccountProtocol(account, protocol, callback);
    }

    function getAccountActions(account, protocol, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        options = options || {};
        callback = callback || function() {};
        if (protocol !== VizMagicConfig.PROTOCOLS.VM) {
            callback(null, []);
            return;
        }
        if (typeof VMProtocol === 'undefined' || !VMProtocol.traverseChain) {
            callback(_makeError('VM protocol traversal is unavailable'));
            return;
        }
        VMProtocol.traverseChain(account, options.limit || 5000, callback, HistorySource);
    }

    function getCapabilities(callback) {
        callback = callback || function() {};
        if (typeof VizConnection !== 'undefined' && VizConnection.checkHistoryCapability) {
            VizConnection.checkHistoryCapability(callback);
            return;
        }
        callback(null, {
            live: false,
            recentBlocks: false,
            historicalBlocks: false,
            checkedAt: Date.now(),
            node: ''
        });
    }

    function getGuildDirectory(callback) {
        callback = callback || function() {};
        var mirrors = _archiveMirrors();
        function next(index) {
            if (!mirrors.length || index >= mirrors.length) {
                callback(_makeError('Guild directory unavailable from archive mirrors'));
                return;
            }
            var mirror = _normalizeMirror(mirrors[index]);
            var url = _guildsUrl(mirror);
            if (!url) {
                next(index + 1);
                return;
            }
            _requestJson(url, mirror.timeoutMs || 6000, function(err, payload) {
                if (!err && payload && (payload.guilds || payload.guildMap)) {
                    callback(null, payload);
                    return;
                }
                next(index + 1);
            });
        }
        next(0);
    }

    return {
        getBlock: getBlock,
        getAccountProtocol: getAccountProtocol,
        getAccountActions: getAccountActions,
        getCapabilities: getCapabilities,
        getGuildDirectory: getGuildDirectory
    };
})();
