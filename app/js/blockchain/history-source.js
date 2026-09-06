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

    function _rangeUrl(mirror, options) {
        var pattern = mirror.rangeUrl || '';
        if (!pattern && mirror.apiBase) {
            pattern = String(mirror.apiBase).replace(/\/$/, '') + '/v1/range';
        }
        if (!pattern) return '';
        options = options || {};
        var params = [];
        if (options.protocol) params.push('protocol=' + encodeURIComponent(String(options.protocol)));
        if (options.account) params.push('account=' + encodeURIComponent(String(options.account)));
        if (options.start || options.from) params.push('start=' + encodeURIComponent(String(options.start || options.from)));
        if (options.end || options.to) params.push('end=' + encodeURIComponent(String(options.end || options.to)));
        if (options.limit) params.push('limit=' + encodeURIComponent(String(options.limit)));
        if (!params.length) return pattern;
        return pattern + (pattern.indexOf('?') === -1 ? '?' : '&') + params.join('&');
    }

    function _healthUrl(mirror) {
        if (!mirror) return '';
        if (mirror.healthUrl) return mirror.healthUrl;
        if (mirror.apiBase) return String(mirror.apiBase).replace(/\/$/, '') + '/health';
        return '';
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
        for (var i = 0; i < events.length; i++) {
            var ev = events[i] || {};
            var txIndex = Number(typeof ev.txIndex !== 'undefined' ? ev.txIndex : ev.tx_index) || 0;
            var opIndex = Number(typeof ev.opIndex !== 'undefined' ? ev.opIndex : ev.op_index) || 0;
            while (block.transactions.length <= txIndex) block.transactions.push({ operations: [] });
            var operations = block.transactions[txIndex].operations;
            while (operations.length <= opIndex) operations.push(null);
            if (ev.opType === 'custom' || ev.op_type === 'custom') {
                operations[opIndex] = ['custom', ev.raw || {}];
            } else if (ev.opType === 'award' || ev.op_type === 'award') {
                operations[opIndex] = ['award', ev.raw || ev.payload || {}];
            }
        }
        return block;
    }

    function eventsToThinBlock(events, metadata) {
        metadata = metadata || {};
        return _eventsPayloadToThinBlock({
            events: events || [],
            previous: metadata.previous || '',
            timestamp: metadata.timestamp || '',
            block_id: metadata.block_id || metadata.blockId || ''
        });
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

    // Proof-sensitive callers must not accept a thin event-index response as
    // evidence that an award was absent. This path uses only full RPC/archive
    // blocks, whose transaction operation lists are authoritative.
    function getProofBlock(blockNum, callback) {
        callback = callback || function() {};
        if (!blockNum || blockNum <= 0) {
            callback(_makeError('Invalid block number'));
            return;
        }
        if (typeof viz === 'undefined' || !viz.api || !viz.api.getBlock) {
            _getBlockFromMirrors(blockNum, 0, callback);
            return;
        }
        viz.api.getBlock(blockNum, function(err, block) {
            if (!err && block) {
                callback(null, block);
                return;
            }
            _getBlockFromMirrors(blockNum, 0, callback);
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

    function getEventsRange(options, callback) {
        callback = callback || function() {};
        options = options || {};
        var mirrors = _archiveMirrors();
        function next(index) {
            if (!mirrors.length || index >= mirrors.length) {
                callback(_makeError('Event range unavailable from archive mirrors'));
                return;
            }
            var mirror = _normalizeMirror(mirrors[index]);
            var url = _rangeUrl(mirror, options);
            if (!url) {
                next(index + 1);
                return;
            }
            _requestJson(url, mirror.timeoutMs || 6000, function(err, payload) {
                if (!err && payload && payload.events) {
                    callback(null, payload.events, payload);
                    return;
                }
                next(index + 1);
            });
        }
        next(0);
    }

    function getArchiveHead(callback) {
        callback = callback || function() {};
        var mirrors = _archiveMirrors();
        function next(index) {
            if (!mirrors.length || index >= mirrors.length) {
                callback(_makeError('Archive health unavailable'));
                return;
            }
            var mirror = _normalizeMirror(mirrors[index]);
            var url = _healthUrl(mirror);
            if (!url) {
                next(index + 1);
                return;
            }
            _requestJson(url, mirror.timeoutMs || 6000, function(err, payload) {
                var head = payload && Number(payload.lastIndexedBlock || payload.last_indexed_block || 0);
                if (!err && Number.isInteger(head) && head > 0) {
                    callback(null, head);
                    return;
                }
                next(index + 1);
            });
        }
        next(0);
    }

    function getEventsForBlock(blockNum, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        options = options || {};
        callback = callback || function() {};
        var mirrors = _archiveMirrors();
        function next(index) {
            if (!mirrors.length || index >= mirrors.length) {
                callback(_makeError('Block events unavailable from archive mirrors'));
                return;
            }
            var mirror = _normalizeMirror(mirrors[index]);
            var url = _eventsUrl(mirror, blockNum);
            if (!url) {
                next(index + 1);
                return;
            }
            if (options.protocol) {
                url += (url.indexOf('?') === -1 ? '?' : '&') + 'protocol=' + encodeURIComponent(String(options.protocol));
            }
            _requestJson(url, mirror.timeoutMs || 6000, function(err, payload) {
                if (!err && payload && payload.events) {
                    callback(null, payload.events, payload);
                    return;
                }
                next(index + 1);
            });
        }
        next(0);
    }

    function getAllEventsRange(options, callback) {
        callback = callback || function() {};
        options = options || {};
        var start = Number(options.start || options.from || 0);
        var originalEnd = Number(options.end || options.to || 2147483647);
        var pageLimit = Math.max(1, Math.min(Number(options.limit || 5000), 5000));
        var nextEnd = originalEnd;
        var pages = [];
        var seen = {};

        function finish() {
            var all = [];
            for (var p = 0; p < pages.length; p++) all = all.concat(pages[p]);
            all.sort(function(a, b) {
                if (Number(a.blockNum || 0) !== Number(b.blockNum || 0)) return Number(a.blockNum || 0) - Number(b.blockNum || 0);
                if (Number(a.txIndex || 0) !== Number(b.txIndex || 0)) return Number(a.txIndex || 0) - Number(b.txIndex || 0);
                return Number(a.opIndex || 0) - Number(b.opIndex || 0);
            });
            callback(null, all);
        }

        function addPage(events) {
            var page = [];
            for (var i = 0; i < events.length; i++) {
                var event = events[i] || {};
                var identity = event.id || [event.blockNum, event.txIndex, event.opIndex, event.protocol, event.type].join(':');
                if (!seen[identity]) {
                    seen[identity] = true;
                    page.push(event);
                }
            }
            pages.unshift(page);
        }

        function loadPage() {
            var request = {};
            for (var key in options) {
                if (options.hasOwnProperty(key)) request[key] = options[key];
            }
            request.start = start;
            request.end = nextEnd;
            request.limit = pageLimit;
            getEventsRange(request, function(err, events) {
                if (err) {
                    callback(err);
                    return;
                }
                events = events || [];
                var oldest = null;
                for (var i = 0; i < events.length; i++) {
                    var event = events[i] || {};
                    var blockNum = Number(event.blockNum || 0);
                    if (blockNum && (oldest === null || blockNum < oldest)) oldest = blockNum;
                }
                if (events.length < pageLimit || oldest === null) {
                    addPage(events);
                    finish();
                    return;
                }
                // A full range page may split the oldest boundary block. Hydrate that
                // block through the block endpoint before moving the cursor behind it.
                getEventsForBlock(oldest, { protocol: options.protocol || '' }, function(blockErr, boundaryEvents) {
                    if (blockErr) {
                        callback(blockErr);
                        return;
                    }
                    var completePage = [];
                    for (var e = 0; e < events.length; e++) {
                        if (Number(events[e] && events[e].blockNum || 0) > oldest) completePage.push(events[e]);
                    }
                    completePage = (boundaryEvents || []).concat(completePage);
                    addPage(completePage);
                    if (oldest <= start) {
                        finish();
                        return;
                    }
                    var candidateEnd = oldest - 1;
                    if (candidateEnd >= nextEnd) {
                        callback(_makeError('Archive range pagination made no progress'));
                        return;
                    }
                    nextEnd = candidateEnd;
                    loadPage();
                });
            });
        }

        loadPage();
    }

    function findAccountAction(account, protocol, actionType, callback) {
        callback = callback || function() {};
        var matcher = typeof arguments[4] === 'function' ? arguments[4] : null;
        if (!account || !protocol || !actionType) {
            callback(_makeError('Account, protocol and action type are required'));
            return;
        }
        var pageLimit = 5000;
        var nextEnd = 2147483647;

        function matches(candidate) {
            if (!matcher) return true;
            try {
                return !!matcher(candidate);
            } catch (err) {
                callback(err);
                return null;
            }
        }

        function scanRecentChain() {
            if (typeof VMProtocol === 'undefined' || !VMProtocol.traverseChain) {
                callback(_makeError('Recent VM history lookup is unavailable'));
                return;
            }
            getAccountProtocol(account, protocol, function(pointerErr, pointer) {
                if (pointerErr) {
                    callback(pointerErr);
                    return;
                }
                if (!pointer || !pointer.custom_sequence_block_num) {
                    callback(null, null);
                    return;
                }
                VMProtocol.traverseChain(account, 100, function(recentErr, actions) {
                    if (recentErr) {
                        callback(recentErr);
                        return;
                    }
                    actions = actions || [];
                    for (var i = 0; i < actions.length; i++) {
                        var entry = actions[i] || {};
                        if (entry.action && entry.action.type === actionType) {
                            var candidate = {
                                blockNum: entry.blockNum,
                                type: actionType,
                                sender: entry.sender,
                                payload: entry.action
                            };
                            var accepted = matches(candidate);
                            if (accepted === null) return;
                            if (accepted) {
                                callback(null, candidate);
                                return;
                            }
                        }
                    }
                    callback(null, null);
                }, HistorySource);
            });
        }

        function loadPage() {
            getEventsRange({
                account: account,
                protocol: protocol,
                start: 1,
                end: nextEnd,
                limit: pageLimit
            }, function(err, events) {
                if (err) {
                    callback(err);
                    return;
                }
                events = events || [];
                for (var i = events.length - 1; i >= 0; i--) {
                    var event = events[i] || {};
                    if (event.type === actionType || (event.payload && (event.payload.t === actionType || event.payload.type === actionType))) {
                        var accepted = matches(event);
                        if (accepted === null) return;
                        if (accepted) {
                            callback(null, event);
                            return;
                        }
                    }
                }
                if (events.length >= pageLimit) {
                    var oldestBlock = nextEnd;
                    for (var j = 0; j < events.length; j++) {
                        var blockNum = Number(events[j] && events[j].blockNum) || 0;
                        if (blockNum > 0 && blockNum < oldestBlock) oldestBlock = blockNum;
                    }
                    if (oldestBlock > 1 && oldestBlock <= nextEnd) {
                        nextEnd = oldestBlock - 1;
                        loadPage();
                        return;
                    }
                }
                scanRecentChain();
            });
        }
        loadPage();
    }

    return {
        getBlock: getBlock,
        getProofBlock: getProofBlock,
        getAccountProtocol: getAccountProtocol,
        getAccountActions: getAccountActions,
        getCapabilities: getCapabilities,
        getGuildDirectory: getGuildDirectory,
        getEventsRange: getEventsRange,
        getArchiveHead: getArchiveHead,
        getEventsForBlock: getEventsForBlock,
        getAllEventsRange: getAllEventsRange,
        eventsToThinBlock: eventsToThinBlock,
        findAccountAction: findAccountAction
    };
})();
