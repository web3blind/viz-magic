/**
 * Viz Magic — IndexedDB State Persistence
 * Save and load game state checkpoints to IndexedDB.
 */
var CheckpointSystem = (function() {
    'use strict';

    var cfg = VizMagicConfig;
    var DB_NAME = cfg.STORAGE_PREFIX + 'game_state';
    var DB_VERSION = 1;
    var STORE_NAME = 'checkpoints';
    var db = null;

    /**
     * Initialize IndexedDB
     * @param {Function} callback - (err)
     */
    function init(callback) {
        if (!window.indexedDB) {
            console.log('IndexedDB not supported');
            callback(new Error('indexeddb_not_supported'));
            return;
        }

        var request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function(event) {
            var database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                var store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('blockNum', 'blockNum', { unique: false });
                store.createIndex('account', 'account', { unique: false });
            }
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            console.log('CheckpointSystem: IndexedDB initialized');
            callback(null);
        };

        request.onerror = function(event) {
            console.log('CheckpointSystem: IndexedDB error', event.target.error);
            callback(event.target.error);
        };
    }

    /**
     * Save a checkpoint
     * @param {string} account - account name (or 'global' for world state)
     * @param {number} blockNum - block number of checkpoint
     * @param {Object} state - state data to persist
     * @param {Function} callback - (err)
     */
    function saveCheckpoint(account, blockNum, state, callback) {
        if (!db) {
            callback(new Error('db_not_initialized'));
            return;
        }

        var checkpoint = {
            id: account + '_' + blockNum,
            account: account,
            blockNum: blockNum,
            state: state,
            timestamp: Date.now()
        };

        var tx = db.transaction([STORE_NAME], 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var request = store.put(checkpoint);

        request.onsuccess = function() {
            // Clean old checkpoints (keep only last 5 per account)
            _cleanOldCheckpoints(account, 5);
            callback(null);
        };

        request.onerror = function(event) {
            callback(event.target.error);
        };
    }

    /**
     * Load the latest checkpoint for an account
     * @param {string} account
     * @param {Function} callback - (err, checkpoint)
     */
    function loadLatestCheckpoint(account, callback) {
        if (!db) {
            callback(new Error('db_not_initialized'));
            return;
        }

        var tx = db.transaction([STORE_NAME], 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var index = store.index('account');
        var range = IDBKeyRange.only(account);
        var request = index.openCursor(range, 'prev'); // Descending by key

        var latest = null;

        request.onsuccess = function(event) {
            var cursor = event.target.result;
            if (cursor && !latest) {
                latest = cursor.value;
            }
            // Only need the first (latest) result
            if (!latest && cursor) {
                cursor.continue();
            } else {
                callback(null, latest);
            }
        };

        request.onerror = function(event) {
            callback(event.target.error);
        };
    }

    /**
     * Load a checkpoint by exact block number
     * @param {string} account
     * @param {number} blockNum
     * @param {Function} callback
     */
    function loadCheckpointAt(account, blockNum, callback) {
        if (!db) {
            callback(new Error('db_not_initialized'));
            return;
        }

        var tx = db.transaction([STORE_NAME], 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var request = store.get(account + '_' + blockNum);

        request.onsuccess = function(event) {
            callback(null, event.target.result || null);
        };

        request.onerror = function(event) {
            callback(event.target.error);
        };
    }

    /**
     * Clean old checkpoints, keeping only the N most recent
     */
    function _cleanOldCheckpoints(account, keepCount) {
        if (!db) return;

        var tx = db.transaction([STORE_NAME], 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var index = store.index('account');
        var range = IDBKeyRange.only(account);
        var request = index.openCursor(range, 'prev');

        var count = 0;
        request.onsuccess = function(event) {
            var cursor = event.target.result;
            if (cursor) {
                count++;
                if (count > keepCount) {
                    cursor.delete();
                }
                cursor.continue();
            }
        };
    }

    /**
     * Clear all checkpoints
     * @param {Function} callback
     */
    function clearAll(callback) {
        if (!db) {
            callback(new Error('db_not_initialized'));
            return;
        }

        var tx = db.transaction([STORE_NAME], 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var request = store.clear();

        request.onsuccess = function() { callback(null); };
        request.onerror = function(e) { callback(e.target.error); };
    }

    return {
        init: init,
        saveCheckpoint: saveCheckpoint,
        loadLatestCheckpoint: loadLatestCheckpoint,
        loadCheckpointAt: loadCheckpointAt,
        clearAll: clearAll
    };
})();
