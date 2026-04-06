/**
 * Viz Magic — Daily Leaderboard Storage
 * Separate IndexedDB storage for 24h leaderboard cache and per-block contributions.
 */
var DailyLeaderboardStorage = (function() {
    'use strict';

    var DB_NAME = 'viz_magic_daily_leaderboard';
    var DB_VERSION = 1;
    var META_STORE = 'meta';
    var BLOCKS_STORE = 'blockContribs';
    var db = null;

    function init(callback) {
        callback = callback || function() {};
        if (db) {
            callback(null);
            return;
        }

        if (!window.indexedDB) {
            callback(new Error('indexeddb_not_supported'));
            return;
        }

        var request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function(event) {
            var database = event.target.result;
            if (!database.objectStoreNames.contains(META_STORE)) {
                database.createObjectStore(META_STORE, { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains(BLOCKS_STORE)) {
                database.createObjectStore(BLOCKS_STORE, { keyPath: 'blockNum' });
            }
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            callback(null);
        };

        request.onerror = function(event) {
            callback(event.target.error);
        };
    }

    function getMeta(callback) {
        _get(META_STORE, 'daily', callback);
    }

    function setMeta(meta, callback) {
        meta = meta || {};
        meta.id = 'daily';
        _put(META_STORE, meta, callback);
    }

    function getBlockContribution(blockNum, callback) {
        _get(BLOCKS_STORE, blockNum, callback);
    }

    function putBlockContribution(contrib, callback) {
        _put(BLOCKS_STORE, contrib, callback);
    }

    function getBlockContributionsInRange(startBlock, endBlock, callback) {
        callback = callback || function() {};
        if (!db) {
            callback(new Error('db_not_initialized'));
            return;
        }

        var tx = db.transaction([BLOCKS_STORE], 'readonly');
        var store = tx.objectStore(BLOCKS_STORE);
        var range = IDBKeyRange.bound(startBlock, endBlock);
        var request = store.openCursor(range);
        var items = [];

        request.onsuccess = function(event) {
            var cursor = event.target.result;
            if (cursor) {
                items.push(cursor.value);
                cursor.continue();
            } else {
                callback(null, items);
            }
        };

        request.onerror = function(event) {
            callback(event.target.error);
        };
    }

    function deleteBlocksBefore(blockNum, callback) {
        callback = callback || function() {};
        if (!db) {
            callback(new Error('db_not_initialized'));
            return;
        }

        var tx = db.transaction([BLOCKS_STORE], 'readwrite');
        var store = tx.objectStore(BLOCKS_STORE);
        var range = IDBKeyRange.upperBound(blockNum - 1);
        var request = store.openCursor(range);

        request.onsuccess = function(event) {
            var cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        tx.oncomplete = function() {
            callback(null);
        };
        tx.onerror = function(event) {
            callback(event.target.error);
        };
    }

    function clearAll(callback) {
        callback = callback || function() {};
        if (!db) {
            callback(new Error('db_not_initialized'));
            return;
        }

        var tx = db.transaction([META_STORE, BLOCKS_STORE], 'readwrite');
        tx.objectStore(META_STORE).clear();
        tx.objectStore(BLOCKS_STORE).clear();

        tx.oncomplete = function() { callback(null); };
        tx.onerror = function(event) { callback(event.target.error); };
    }

    function _get(storeName, key, callback) {
        callback = callback || function() {};
        if (!db) {
            callback(new Error('db_not_initialized'));
            return;
        }

        var tx = db.transaction([storeName], 'readonly');
        var store = tx.objectStore(storeName);
        var request = store.get(key);

        request.onsuccess = function(event) {
            callback(null, event.target.result || null);
        };

        request.onerror = function(event) {
            callback(event.target.error);
        };
    }

    function _put(storeName, value, callback) {
        callback = callback || function() {};
        if (!db) {
            callback(new Error('db_not_initialized'));
            return;
        }

        var tx = db.transaction([storeName], 'readwrite');
        var store = tx.objectStore(storeName);
        var request = store.put(value);

        request.onsuccess = function() {
            callback(null, value);
        };
        request.onerror = function(event) {
            callback(event.target.error);
        };
    }

    return {
        init: init,
        getMeta: getMeta,
        setMeta: setMeta,
        getBlockContribution: getBlockContribution,
        putBlockContribution: putBlockContribution,
        getBlockContributionsInRange: getBlockContributionsInRange,
        deleteBlocksBefore: deleteBlocksBefore,
        clearAll: clearAll
    };
})();
