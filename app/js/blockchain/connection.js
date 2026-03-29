/**
 * Viz Magic — VIZ Node Connection Manager
 * Handles connecting to VIZ nodes, auto-reconnect, node switching on failure.
 * Uses the global `viz` object from viz.min.js.
 */
var VizConnection = (function() {
    'use strict';

    var cfg = VizMagicConfig;
    var currentNodeIndex = 0;
    var currentNode = cfg.NODES[0];
    var dgp = {};
    var connected = false;
    var reconnectTimer = null;
    var reconnectDelay = 3000;
    var maxReconnectDelay = 30000;
    var latencies = {};
    var onConnectCallbacks = [];
    var onDisconnectCallbacks = [];

    /**
     * Initialize connection — pick best node or use saved preference
     * @param {Function} callback - called when connected (err, dgp)
     */
    function init(callback) {
        callback = callback || function() {};

        var savedNode = localStorage.getItem(cfg.STORAGE_PREFIX + 'api_node');
        if (savedNode) {
            currentNode = savedNode;
            _connectToNode(currentNode, function(err) {
                if (err) {
                    console.log('Saved node failed, selecting best node...');
                    _selectBestNode(callback);
                } else {
                    callback(null, dgp);
                }
            });
        } else {
            _selectBestNode(callback);
        }
    }

    /**
     * Test all nodes and connect to the fastest one
     */
    function _selectBestNode(callback) {
        var pending = cfg.NODES.length;
        var bestLatency = Infinity;
        var bestNode = cfg.NODES[0];

        cfg.NODES.forEach(function(node, index) {
            _measureLatency(node, function(latency) {
                pending--;
                if (latency >= 0 && latency < bestLatency) {
                    bestLatency = latency;
                    bestNode = node;
                    currentNodeIndex = index;
                }
                latencies[node] = latency;

                if (pending <= 0) {
                    console.log('Best node:', bestNode, 'latency:', bestLatency + 'ms');
                    _connectToNode(bestNode, function(err) {
                        if (err) {
                            _tryNextNode(callback);
                        } else {
                            callback(null, dgp);
                        }
                    });
                }
            });
        });
    }

    /**
     * Measure latency to a node via getDynamicGlobalProperties
     */
    function _measureLatency(node, callback) {
        var startTime = Date.now();
        var protocol = node.substring(0, node.indexOf(':'));
        var timeout = 5000;

        if (protocol === 'ws' || protocol === 'wss') {
            var socket;
            try {
                socket = new WebSocket(node);
            } catch (e) {
                callback(-1);
                return;
            }
            var timer = setTimeout(function() {
                try { socket.close(); } catch(e) {}
                callback(-1);
            }, timeout);

            socket.onopen = function() {
                socket.send('{"id":1,"method":"call","jsonrpc":"2.0","params":["database_api","get_dynamic_global_properties",[]]}');
            };
            socket.onmessage = function(event) {
                clearTimeout(timer);
                var latency = Date.now() - startTime;
                try {
                    var json = JSON.parse(event.data);
                    if (json.result && json.result.head_block_number) {
                        callback(latency);
                    } else {
                        callback(-1);
                    }
                } catch(e) {
                    callback(-1);
                }
                try { socket.close(); } catch(e) {}
            };
            socket.onerror = function() {
                clearTimeout(timer);
                callback(-1);
            };
        } else {
            // HTTP/HTTPS
            var xhr = new XMLHttpRequest();
            xhr.timeout = timeout;
            xhr.overrideMimeType('text/plain');
            xhr.open('POST', node);
            xhr.setRequestHeader('accept', 'application/json');
            xhr.setRequestHeader('content-type', 'application/json');
            xhr.ontimeout = function() { callback(-1); };
            xhr.onerror = function() { callback(-1); };
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        var latency = Date.now() - startTime;
                        try {
                            var json = JSON.parse(xhr.response);
                            if (json.result && json.result.head_block_number) {
                                callback(latency);
                            } else {
                                callback(-1);
                            }
                        } catch(e) {
                            callback(-1);
                        }
                    } else {
                        callback(-1);
                    }
                }
            };
            xhr.send('{"id":1,"method":"call","jsonrpc":"2.0","params":["database_api","get_dynamic_global_properties",[]]}');
        }
    }

    /**
     * Connect to a specific node and update DGP
     */
    function _connectToNode(node, callback) {
        currentNode = node;
        viz.config.set('websocket', node);
        console.log('Connecting to node:', node);

        _updateDGP(function(err) {
            if (err) {
                console.log('Node connection failed:', node, err);
                connected = false;
                _fireDisconnect();
                callback(err);
            } else {
                connected = true;
                localStorage.setItem(cfg.STORAGE_PREFIX + 'api_node', node);
                _fireConnect();
                _scheduleRefresh();
                callback(null);
            }
        });
    }

    /**
     * Try the next node in the list
     */
    function _tryNextNode(callback) {
        currentNodeIndex = (currentNodeIndex + 1) % cfg.NODES.length;
        var node = cfg.NODES[currentNodeIndex];
        console.log('Trying next node:', node);
        _connectToNode(node, function(err) {
            if (err) {
                if (currentNodeIndex === 0) {
                    // We've tried all nodes, schedule reconnect
                    _scheduleReconnect(callback);
                } else {
                    _tryNextNode(callback);
                }
            } else {
                callback(null, dgp);
            }
        });
    }

    /**
     * Fetch Dynamic Global Properties from the chain
     */
    function _updateDGP(callback) {
        viz.api.getDynamicGlobalProperties(function(err, response) {
            if (err || !response) {
                callback(err || new Error('Empty DGP response'));
            } else {
                dgp = response;
                callback(null);
            }
        });
    }

    /**
     * Schedule periodic DGP refresh (every 30 seconds)
     */
    var refreshTimer = null;
    function _scheduleRefresh() {
        clearInterval(refreshTimer);
        refreshTimer = setInterval(function() {
            _updateDGP(function(err) {
                if (err) {
                    console.log('DGP refresh failed, reconnecting...');
                    connected = false;
                    _fireDisconnect();
                    _tryNextNode(function() {});
                }
            });
        }, 30000);
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    function _scheduleReconnect(callback) {
        clearTimeout(reconnectTimer);
        console.log('Scheduling reconnect in', reconnectDelay + 'ms');
        reconnectTimer = setTimeout(function() {
            _selectBestNode(function(err) {
                if (err) {
                    reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
                    _scheduleReconnect(callback);
                } else {
                    reconnectDelay = 3000;
                    callback(null, dgp);
                }
            });
        }, reconnectDelay);
    }

    /** Fire onConnect callbacks */
    function _fireConnect() {
        for (var i = 0; i < onConnectCallbacks.length; i++) {
            try { onConnectCallbacks[i](dgp); } catch(e) { console.error(e); }
        }
    }

    /** Fire onDisconnect callbacks */
    function _fireDisconnect() {
        for (var i = 0; i < onDisconnectCallbacks.length; i++) {
            try { onDisconnectCallbacks[i](); } catch(e) { console.error(e); }
        }
    }

    /**
     * Get current DGP
     * @returns {Object} dynamic global properties
     */
    function getDGP() {
        return dgp;
    }

    /**
     * Check if connected
     * @returns {boolean}
     */
    function isConnected() {
        return connected;
    }

    /**
     * Get current node URL
     * @returns {string}
     */
    function getCurrentNode() {
        return currentNode;
    }

    /**
     * Register callback for connect event
     */
    function onConnect(cb) {
        onConnectCallbacks.push(cb);
    }

    /**
     * Register callback for disconnect event
     */
    function onDisconnect(cb) {
        onDisconnectCallbacks.push(cb);
    }

    /**
     * Force switch to a specific node
     */
    function switchNode(node, callback) {
        callback = callback || function() {};
        _connectToNode(node, callback);
    }

    return {
        init: init,
        getDGP: getDGP,
        isConnected: isConnected,
        getCurrentNode: getCurrentNode,
        onConnect: onConnect,
        onDisconnect: onDisconnect,
        switchNode: switchNode
    };
})();
