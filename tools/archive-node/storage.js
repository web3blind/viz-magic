'use strict';

var fs = require('fs');
var path = require('path');

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

function readJsonLines(file) {
    try {
        var text = fs.readFileSync(file, 'utf8');
        if (!text.trim()) return [];
        return text.split(/\n+/).filter(Boolean).map(function(line) { return JSON.parse(line); });
    } catch (err) {
        return [];
    }
}

function appendJsonLine(file, item) {
    ensureDir(path.dirname(file));
    fs.appendFileSync(file, JSON.stringify(item) + '\n', 'utf8');
}

function ArchiveStore(rootDir) {
    this.rootDir = rootDir || path.join(process.cwd(), 'data', 'archive-node');
    this.blocksDir = path.join(this.rootDir, 'blocks');
    this.eventsDir = path.join(this.rootDir, 'events');
    ensureDir(this.blocksDir);
    ensureDir(this.eventsDir);
}

ArchiveStore.prototype.cursorPath = function() {
    return path.join(this.rootDir, 'cursor.json');
};

ArchiveStore.prototype.statusPath = function() {
    return path.join(this.rootDir, 'status.json');
};

ArchiveStore.prototype.blockPath = function(blockNum) {
    return path.join(this.blocksDir, String(blockNum) + '.json');
};

ArchiveStore.prototype.allEventsPath = function() {
    return path.join(this.eventsDir, 'all.jsonl');
};

ArchiveStore.prototype.protocolEventsPath = function(protocol) {
    return path.join(this.eventsDir, 'protocol-' + sanitizePart(protocol) + '.jsonl');
};

ArchiveStore.prototype.accountProtocolEventsPath = function(account, protocol) {
    return path.join(this.eventsDir, 'account-' + sanitizePart(account) + '-protocol-' + sanitizePart(protocol) + '.jsonl');
};

ArchiveStore.prototype.getCursor = function() {
    return readJson(this.cursorPath(), { lastIndexedBlock: 0, updatedAt: null });
};

ArchiveStore.prototype.setCursor = function(lastIndexedBlock) {
    writeJsonAtomic(this.cursorPath(), {
        lastIndexedBlock: Number(lastIndexedBlock) || 0,
        updatedAt: new Date().toISOString()
    });
};

ArchiveStore.prototype.getStatus = function() {
    var cursor = this.getCursor();
    var status = readJson(this.statusPath(), {});
    status.lastIndexedBlock = cursor.lastIndexedBlock || 0;
    status.cursorUpdatedAt = cursor.updatedAt || null;
    return status;
};

ArchiveStore.prototype.setStatus = function(status) {
    status = status || {};
    status.updatedAt = new Date().toISOString();
    writeJsonAtomic(this.statusPath(), status);
};

ArchiveStore.prototype.hasBlock = function(blockNum) {
    return fs.existsSync(this.blockPath(blockNum));
};

ArchiveStore.prototype.getBlockRecord = function(blockNum) {
    return readJson(this.blockPath(blockNum), null);
};

ArchiveStore.prototype.putBlock = function(blockNum, block, sourceNode, events) {
    var record = {
        blockNum: Number(blockNum),
        block_id: block && (block.block_id || block.id || ''),
        previous: block && (block.previous || block.previous_block_id || ''),
        timestamp: block && block.timestamp || '',
        sourceNode: sourceNode || '',
        indexedAt: new Date().toISOString(),
        eventCount: events ? events.length : 0,
        block: block
    };
    writeJsonAtomic(this.blockPath(blockNum), record);
};

ArchiveStore.prototype.eventKey = function(event) {
    return [event.blockNum, event.txIndex, event.opIndex, event.protocol, event.type, event.sender || event.account || ''].join(':');
};

ArchiveStore.prototype.putEventsForBlock = function(events) {
    var self = this;
    events.forEach(function(event) {
        event.id = event.id || self.eventKey(event);
        appendJsonLine(self.allEventsPath(), event);
        if (event.protocol) appendJsonLine(self.protocolEventsPath(event.protocol), event);
        var accounts = event.accounts || [];
        for (var i = 0; i < accounts.length; i += 1) {
            appendJsonLine(self.accountProtocolEventsPath(accounts[i], event.protocol || '_'), event);
        }
    });
};

ArchiveStore.prototype.queryEvents = function(options) {
    options = options || {};
    var file;
    if (options.account && options.protocol) file = this.accountProtocolEventsPath(options.account, options.protocol);
    else if (options.protocol) file = this.protocolEventsPath(options.protocol);
    else file = this.allEventsPath();
    var start = Number(options.start || options.from || 0);
    var end = Number(options.end || options.to || 2147483647);
    var limit = Math.max(1, Math.min(Number(options.limit || 500), 5000));
    var protocols = null;
    if (options.protocols && options.protocols.length) protocols = options.protocols;
    var rows = readJsonLines(file).filter(function(ev) {
        if (ev.blockNum < start || ev.blockNum > end) return false;
        if (protocols && protocols.indexOf(ev.protocol) === -1) return false;
        return true;
    });
    rows.sort(function(a, b) {
        if (a.blockNum !== b.blockNum) return a.blockNum - b.blockNum;
        if (a.txIndex !== b.txIndex) return a.txIndex - b.txIndex;
        return a.opIndex - b.opIndex;
    });
    if (rows.length > limit) rows = rows.slice(rows.length - limit);
    return rows;
};

module.exports = {
    ArchiveStore: ArchiveStore,
    ensureDir: ensureDir,
    readJson: readJson,
    writeJsonAtomic: writeJsonAtomic,
    readJsonLines: readJsonLines,
    sanitizePart: sanitizePart
};
