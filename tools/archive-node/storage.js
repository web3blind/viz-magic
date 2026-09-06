'use strict';

var fs = require('fs');
var path = require('path');
var originalEmitWarning = process.emitWarning;
process.emitWarning = function(warning) {
    var text = String(warning && warning.message || warning || '');
    if (text.indexOf('SQLite is an experimental feature') !== -1) return;
    return originalEmitWarning.apply(process, arguments);
};
var sqlite = require('node:sqlite');
process.emitWarning = originalEmitWarning;
var DatabaseSync = sqlite.DatabaseSync;

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function sanitizePart(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120) || '_';
}

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        return fallback;
    }
}

function writeJsonAtomic(file, data) {
    ensureDir(path.dirname(file));
    var tmp = file + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
}

function ArchiveStore(rootDir) {
    this.rootDir = rootDir || path.join(process.cwd(), 'data', 'archive-node');
    ensureDir(this.rootDir);
    this.dbPath = path.join(this.rootDir, 'archive.sqlite');
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA temp_store = MEMORY');
    this._initSchema();
}

ArchiveStore.prototype._initSchema = function() {
    this.db.exec([
        'CREATE TABLE IF NOT EXISTS blocks (',
        '  block_num INTEGER PRIMARY KEY,',
        '  block_id TEXT,',
        '  previous TEXT,',
        '  timestamp TEXT,',
        '  source_node TEXT,',
        '  indexed_at TEXT,',
        '  event_count INTEGER NOT NULL DEFAULT 0,',
        '  virtual_complete INTEGER NOT NULL DEFAULT 0,',
        '  raw_json TEXT NOT NULL',
        ')',
        ';',
        'CREATE TABLE IF NOT EXISTS events (',
        '  id TEXT PRIMARY KEY,',
        '  block_num INTEGER NOT NULL,',
        '  block_id TEXT,',
        '  previous TEXT,',
        '  timestamp TEXT,',
        '  tx_index INTEGER NOT NULL,',
        '  op_index INTEGER NOT NULL,',
        '  virtual_op INTEGER NOT NULL DEFAULT 0,',
        '  tx_id TEXT,',
        '  op_type TEXT NOT NULL,',
        '  protocol TEXT NOT NULL,',
        '  type TEXT,',
        '  sender TEXT,',
        '  account TEXT,',
        '  accounts_json TEXT,',
        '  payload_json TEXT,',
        '  raw_json TEXT NOT NULL',
        ')',
        ';',
        'CREATE TABLE IF NOT EXISTS event_accounts (',
        '  event_id TEXT NOT NULL,',
        '  account TEXT NOT NULL,',
        '  protocol TEXT NOT NULL,',
        '  block_num INTEGER NOT NULL,',
        '  PRIMARY KEY(event_id, account)',
        ')',
        ';',
        'CREATE TABLE IF NOT EXISTS meta (',
        '  key TEXT PRIMARY KEY,',
        '  value TEXT NOT NULL',
        ')',
        ';',
        'CREATE INDEX IF NOT EXISTS idx_events_block ON events(block_num)',
        ';',
        'CREATE INDEX IF NOT EXISTS idx_events_protocol_block ON events(protocol, block_num)',
        ';',
        'CREATE INDEX IF NOT EXISTS idx_event_accounts_account_protocol ON event_accounts(account, protocol, block_num)',
        ';'
    ].join('\n'));
    var eventColumns = this.db.prepare('PRAGMA table_info(events)').all().map(function(row) { return row.name; });
    if (eventColumns.indexOf('tx_id') === -1) this.db.exec('ALTER TABLE events ADD COLUMN tx_id TEXT');
    if (eventColumns.indexOf('virtual_op') === -1) this.db.exec('ALTER TABLE events ADD COLUMN virtual_op INTEGER NOT NULL DEFAULT 0');
    var blockColumns = this.db.prepare('PRAGMA table_info(blocks)').all().map(function(row) { return row.name; });
    if (blockColumns.indexOf('virtual_complete') === -1) this.db.exec('ALTER TABLE blocks ADD COLUMN virtual_complete INTEGER NOT NULL DEFAULT 0');
    this._setMeta('schema_version', 3);
};

ArchiveStore.prototype._getMeta = function(key, fallback) {
    var row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch (err) { return fallback; }
};

ArchiveStore.prototype._setMeta = function(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)').run(key, JSON.stringify(value));
};

ArchiveStore.prototype.getCursor = function() {
    return this._getMeta('cursor', { lastIndexedBlock: 0, updatedAt: null });
};

ArchiveStore.prototype.setCursor = function(lastIndexedBlock) {
    this._setMeta('cursor', {
        lastIndexedBlock: Number(lastIndexedBlock) || 0,
        updatedAt: new Date().toISOString()
    });
};

ArchiveStore.prototype.truncateAfter = function(lastIrreversibleBlock) {
    var blockNum = Number(lastIrreversibleBlock);
    if (!Number.isSafeInteger(blockNum) || blockNum < 0) throw new Error('invalid irreversible block');
    this.db.exec('BEGIN IMMEDIATE');
    try {
        this.db.prepare('DELETE FROM event_accounts WHERE event_id IN (SELECT id FROM events WHERE block_num > ?)').run(blockNum);
        this.db.prepare('DELETE FROM events WHERE block_num > ?').run(blockNum);
        this.db.prepare('DELETE FROM blocks WHERE block_num > ?').run(blockNum);
        this.db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)').run('cursor', JSON.stringify({
            lastIndexedBlock: blockNum,
            updatedAt: new Date().toISOString()
        }));
        this.db.exec('COMMIT');
    } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
    }
};

ArchiveStore.prototype.getStatus = function() {
    var cursor = this.getCursor();
    var status = this._getMeta('status', {});
    status.lastIndexedBlock = cursor.lastIndexedBlock || 0;
    status.cursorUpdatedAt = cursor.updatedAt || null;
    return status;
};

ArchiveStore.prototype.setStatus = function(status) {
    status = status || {};
    status.updatedAt = new Date().toISOString();
    this._setMeta('status', status);
};

ArchiveStore.prototype.hasBlock = function(blockNum) {
    return !!this.db.prepare('SELECT 1 AS ok FROM blocks WHERE block_num = ?').get(Number(blockNum));
};

ArchiveStore.prototype.getBlockRecord = function(blockNum) {
    var row = this.db.prepare('SELECT * FROM blocks WHERE block_num = ?').get(Number(blockNum));
    if (!row) return null;
    return {
        blockNum: row.block_num,
        block_id: row.block_id || '',
        previous: row.previous || '',
        timestamp: row.timestamp || '',
        sourceNode: row.source_node || '',
        indexedAt: row.indexed_at || '',
        eventCount: row.event_count || 0,
        virtualComplete: row.virtual_complete === 1,
        block: JSON.parse(row.raw_json)
    };
};

ArchiveStore.prototype.eventKey = function(event) {
    return [event.blockNum, event.txIndex, event.opIndex, event.virtualOp || 0, event.protocol, event.type, event.sender || event.account || ''].join(':');
};

ArchiveStore.prototype._thinBlock = function(block, events) {
    var thin = {
        previous: block && (block.previous || block.previous_block_id || '') || '',
        timestamp: block && block.timestamp || '',
        block_id: block && (block.block_id || block.id || '') || '',
        transactions: [],
        virtual_operations: [],
        virtualReceiptsComplete: block && block.virtualReceiptsComplete === true
    };
    var byTx = {};
    events = events || [];
    for (var i = 0; i < events.length; i += 1) {
        var ev = events[i];
        var txIndex = Number(ev.txIndex) || 0;
        if (!byTx[txIndex]) {
            byTx[txIndex] = { operations: [] };
            thin.transactions[txIndex] = byTx[txIndex];
            byTx[txIndex].transaction_id = ev.txId || '';
        }
        while (byTx[txIndex].operations.length < Number(ev.opIndex || 0)) byTx[txIndex].operations.push(null);
        if (ev.opType === 'receive_award') {
            thin.virtual_operations.push({
                trx_id: ev.txId || '', block: Number(ev.blockNum) || 0,
                trx_in_block: txIndex, op_in_trx: Number(ev.opIndex) || 0,
                virtual_op: Number(ev.virtualOp) || 0, op: ['receive_award', ev.raw || {}]
            });
        } else if (ev.opType === 'custom') {
            byTx[txIndex].operations.push(['custom', ev.raw || {}]);
        } else if (ev.opType === 'award') {
            byTx[txIndex].operations.push(['award', ev.raw || {}]);
        } else if (ev.opType === 'transfer') {
            byTx[txIndex].operations.push(['transfer', ev.raw || {}]);
        } else if (ev.opType === 'fixed_award') {
            byTx[txIndex].operations.push(['fixed_award', ev.raw || {}]);
        }
    }
    return thin;
};

ArchiveStore.prototype.putBlock = function(blockNum, block, sourceNode, events, metadata) {
    var now = new Date().toISOString();
    var bn = Number(blockNum);
    var blockId = block && (block.block_id || block.id || '') || '';
    var previous = block && (block.previous || block.previous_block_id || '') || '';
    var timestamp = block && block.timestamp || '';
    this.db.exec('BEGIN IMMEDIATE');
    try {
        this.db.prepare('DELETE FROM event_accounts WHERE block_num = ?').run(bn);
        this.db.prepare('DELETE FROM events WHERE block_num = ?').run(bn);
        block.virtualReceiptsComplete = !!(metadata && metadata.virtualComplete);
        var storedBlock = this._thinBlock(block, events || []);
        this.db.prepare([
            'INSERT OR REPLACE INTO blocks(block_num, block_id, previous, timestamp, source_node, indexed_at, event_count, virtual_complete, raw_json)',
            'VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ].join(' ')).run(bn, blockId, previous, timestamp, sourceNode || '', now, events ? events.length : 0, metadata && metadata.virtualComplete ? 1 : 0, JSON.stringify(storedBlock));
        this.db.exec('COMMIT');
    } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
    }
};

ArchiveStore.prototype._insertEventsUnsafe = function(events) {
    var insertEvent = this.db.prepare([
        'INSERT OR REPLACE INTO events(id, block_num, block_id, previous, timestamp, tx_index, op_index, virtual_op, tx_id, op_type, protocol, type, sender, account, accounts_json, payload_json, raw_json)',
        'VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ].join(' '));
    var insertAccount = this.db.prepare('INSERT OR REPLACE INTO event_accounts(event_id, account, protocol, block_num) VALUES(?, ?, ?, ?)');
    var self = this;
    (events || []).forEach(function(event) {
        event.id = event.id || self.eventKey(event);
        var accounts = event.accounts || [];
        insertEvent.run(
            event.id, Number(event.blockNum) || 0, event.block_id || '', event.previous || '', event.timestamp || '',
            Number(event.txIndex) || 0, Number(event.opIndex) || 0, Number(event.virtualOp) || 0, event.txId || '', event.opType || '',
            event.protocol || '', event.type || '', event.sender || '', event.account || '',
            JSON.stringify(accounts), JSON.stringify(event.payload || null), JSON.stringify(event.raw || null)
        );
        for (var i = 0; i < accounts.length; i += 1) {
            insertAccount.run(event.id, accounts[i], event.protocol || '_', Number(event.blockNum) || 0);
        }
    });
};

ArchiveStore.prototype.putEventsForBlock = function(events) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
        this._insertEventsUnsafe(events);
        this.db.exec('COMMIT');
    } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
    }
};

ArchiveStore.prototype.putBlockWithEvents = function(blockNum, block, sourceNode, events, metadata) {
    var bn = Number(blockNum);
    var blockId = block && (block.block_id || block.id || '') || '';
    var previous = block && (block.previous || block.previous_block_id || '') || '';
    var timestamp = block && block.timestamp || '';
    var now = new Date().toISOString();
    events = events || [];
    var parent = this.db.prepare('SELECT block_id FROM blocks WHERE block_num = ?').get(bn - 1);
    if (parent && parent.block_id && previous !== parent.block_id) {
        throw new Error('archive_chain_discontinuity_at_' + bn);
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
        var existing = this.db.prepare('SELECT block_id FROM blocks WHERE block_num = ?').get(bn);
        if (existing && existing.block_id && existing.block_id !== blockId) {
            this.db.prepare('DELETE FROM event_accounts WHERE event_id IN (SELECT id FROM events WHERE block_num >= ?)').run(bn);
            this.db.prepare('DELETE FROM events WHERE block_num >= ?').run(bn);
            this.db.prepare('DELETE FROM blocks WHERE block_num >= ?').run(bn);
        }
        this.db.prepare('DELETE FROM event_accounts WHERE event_id IN (SELECT id FROM events WHERE block_num = ?)').run(bn);
        this.db.prepare('DELETE FROM events WHERE block_num = ?').run(bn);
        block.virtualReceiptsComplete = !!(metadata && metadata.virtualComplete);
        var storedBlock = this._thinBlock(block, events);
        this.db.prepare([
            'INSERT OR REPLACE INTO blocks(block_num, block_id, previous, timestamp, source_node, indexed_at, event_count, virtual_complete, raw_json)',
            'VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ].join(' ')).run(bn, blockId, previous, timestamp, sourceNode || '', now, events.length, metadata && metadata.virtualComplete ? 1 : 0, JSON.stringify(storedBlock));
        this._insertEventsUnsafe(events);
        this.db.exec('COMMIT');
    } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
    }
};

ArchiveStore.prototype._eventFromRow = function(row) {
    return {
        blockNum: row.block_num,
        block_id: row.block_id || '',
        previous: row.previous || '',
        timestamp: row.timestamp || '',
        txIndex: row.tx_index,
        opIndex: row.op_index,
        virtualOp: row.virtual_op || 0,
        txId: row.tx_id || '',
        opType: row.op_type || '',
        protocol: row.protocol || '',
        type: row.type || '',
        sender: row.sender || '',
        account: row.account || '',
        accounts: JSON.parse(row.accounts_json || '[]'),
        payload: JSON.parse(row.payload_json || 'null'),
        raw: JSON.parse(row.raw_json || 'null'),
        id: row.id
    };
};

ArchiveStore.prototype.queryEvents = function(options) {
    options = options || {};
    var start = Number(options.start || options.from || 0);
    var end = Number(options.end || options.to || 2147483647);
    var limit = Math.max(1, Math.min(Number(options.limit || 500), 5000));
    var params = [];
    var where = ['e.block_num >= ?', 'e.block_num <= ?'];
    params.push(start, end);
    var sql = 'SELECT e.* FROM events e';
    if (options.account && options.protocol) {
        sql += ' JOIN event_accounts ea ON ea.event_id = e.id';
        where.push('ea.account = ?');
        where.push('ea.protocol = ?');
        params.push(String(options.account), String(options.protocol));
    } else if (options.protocol) {
        where.push('e.protocol = ?');
        params.push(String(options.protocol));
    } else if (options.protocols && options.protocols.length) {
        where.push('e.protocol IN (' + options.protocols.map(function() { return '?'; }).join(',') + ')');
        options.protocols.forEach(function(protocol) { params.push(String(protocol)); });
    }
    sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY e.block_num DESC, e.tx_index DESC, e.op_index DESC, e.virtual_op DESC LIMIT ?';
    params.push(limit);
    var stmt = this.db.prepare(sql);
    var rows = stmt.all.apply(stmt, params);
    rows = rows.map(this._eventFromRow).reverse();
    return rows;
};

ArchiveStore.prototype.queryEventsByTypePrefix = function(prefix, options) {
    options = options || {};
    var start = Number(options.start || options.from || 0);
    var end = Number(options.end || options.to || 2147483647);
    var limit = Math.max(1, Math.min(Number(options.limit || 5000), 50000));
    var stmt = this.db.prepare([
        'SELECT e.* FROM events e',
        'WHERE e.block_num >= ? AND e.block_num <= ? AND e.type LIKE ?',
        'ORDER BY e.block_num ASC, e.tx_index ASC, e.op_index ASC, e.virtual_op ASC LIMIT ?'
    ].join(' '));
    return stmt.all(start, end, String(prefix || '') + '%', limit).map(this._eventFromRow);
};

ArchiveStore.prototype.setVirtualReceiptStartBlock = function(blockNum) {
    var value = Number(blockNum);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('invalid virtual receipt start block');
    var existing = Number(this._getMeta('virtual_receipt_start_block', 0));
    if (!existing || value < existing) this._setMeta('virtual_receipt_start_block', value);
};

ArchiveStore.prototype.getVirtualReceiptStartBlock = function() {
    return Number(this._getMeta('virtual_receipt_start_block', 0)) || 0;
};

ArchiveStore.prototype.getFirstIndexedBlock = function() {
    var row = this.db.prepare('SELECT MIN(block_num) AS first FROM blocks').get();
    return Number(row && row.first || 0);
};

ArchiveStore.prototype.isBlockRangeComplete = function(start, end) {
    start = Number(start);
    end = Number(end);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end < start) return false;
    var row = this.db.prepare('SELECT COUNT(*) AS total FROM blocks WHERE block_num >= ? AND block_num <= ?').get(start, end);
    return Number(row && row.total || 0) === end - start + 1;
};

ArchiveStore.prototype.isVirtualRangeComplete = function(start, end) {
    start = Number(start);
    end = Number(end);
    var receiptStart = this.getVirtualReceiptStartBlock();
    if (!receiptStart || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return false;
    var requiredStart = Math.max(start, receiptStart);
    if (end < requiredStart) return true;
    var row = this.db.prepare([
        'SELECT COUNT(*) AS total, SUM(CASE WHEN virtual_complete = 1 THEN 1 ELSE 0 END) AS complete',
        'FROM blocks WHERE block_num >= ? AND block_num <= ?'
    ].join(' ')).get(requiredStart, end);
    var expected = end - requiredStart + 1;
    return Number(row && row.total || 0) === expected && Number(row && row.complete || 0) === expected;
};

module.exports = {
    ArchiveStore: ArchiveStore,
    ensureDir: ensureDir,
    readJson: readJson,
    writeJsonAtomic: writeJsonAtomic,
    sanitizePart: sanitizePart
};
