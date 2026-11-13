'use strict';

var fs = require('fs');
var path = require('path');
var ArchiveStore = require('./storage').ArchiveStore;

function canonical(dir) {
    var full = path.resolve(dir);
    if (fs.existsSync(full)) return fs.realpathSync(full);
    return path.join(canonical(path.dirname(full)), path.basename(full));
}

function validateConfig(cfg) {
    if (!cfg || typeof cfg.dataDir !== 'string' || !cfg.dataDir) throw new Error('dataDir required');
    if (cfg.legacyDataDirs !== undefined && !Array.isArray(cfg.legacyDataDirs)) throw new Error('legacyDataDirs must be an array');
    var dirs = [cfg.dataDir].concat(cfg.legacyDataDirs || []);
    var keys = [];
    var inodes = [];
    dirs.forEach(function(dir) {
        if (typeof dir !== 'string' || !dir) throw new Error('invalid archive source path');
        var key = canonical(dir);
        keys.forEach(function(prior) {
            if (key === prior || key.startsWith(prior + path.sep) || prior.startsWith(key + path.sep)) throw new Error('archive source path overlap or duplicate');
        });
        keys.push(key);
        var db = path.join(key, 'archive.sqlite');
        if (fs.existsSync(db)) {
            var stat = fs.statSync(db), inode = stat.dev + ':' + stat.ino;
            if (inodes.indexOf(inode) !== -1) throw new Error('duplicate archive database source');
            inodes.push(inode);
        }
    });
    if (!Number.isSafeInteger(Number(cfg.startBlock)) || Number(cfg.startBlock) <= 0) throw new Error('invalid startBlock');
    if (cfg.autoGapRollover !== undefined && typeof cfg.autoGapRollover !== 'boolean') throw new Error('autoGapRollover must be boolean');
    if (cfg.historyStartBlock !== undefined && (!Number.isSafeInteger(cfg.historyStartBlock) || cfg.historyStartBlock <= 0)) throw new Error('invalid historyStartBlock');
    if (cfg.sourceNodes !== undefined) {
        if (!Array.isArray(cfg.sourceNodes) || !cfg.sourceNodes.length) throw new Error('sourceNodes required');
        var nodes = new Set();
        cfg.sourceNodes.forEach(function(node) {
            if (typeof node !== 'string' || !/^https?:\/\//.test(node)) throw new Error('invalid source node');
            var key = new URL(node).href;
            if (nodes.has(key)) throw new Error('duplicate source node');
            nodes.add(key);
        });
    }
    return cfg;
}

function validateWritableTail(cfg, live) {
    validateConfig(cfg);
    if (canonical(live.rootDir) !== canonical(cfg.dataDir)) throw new Error('live store dataDir mismatch');
    var last = live.db.prepare('SELECT MIN(block_num) AS first, MAX(block_num) AS last FROM blocks').get();
    var cursor = Number(live.getCursor().lastIndexedBlock || 0);
    if ((Number(last.last || 0) !== cursor) || (last.first && last.first < Number(cfg.startBlock))) throw new Error('live cursor/range mismatch; cannot skip or overwrite retained blocks');
    if (cursor && Number(cfg.startBlock) > cursor + 1) throw new Error('configured start would skip contiguous live cursor');
    (cfg.legacyDataDirs || []).forEach(function(dir) {
        var legacy = new ArchiveStore(dir, { readOnly: true });
        try {
            var lastLegacy = legacy.db.prepare('SELECT MAX(block_num) AS last FROM blocks').get();
            if (lastLegacy.last && Number(cfg.startBlock) <= lastLegacy.last) throw new Error('new live start overlaps retained source');
        } finally { legacy.db.close(); }
    });
}

function storedRanges(store) {
    return store.db.prepare('SELECT MIN(block_num) AS start, MAX(block_num) AS end FROM (SELECT block_num, block_num - ROW_NUMBER() OVER (ORDER BY block_num) AS grp FROM blocks) GROUP BY grp ORDER BY start').all().map(function(r) { return { start: r.start, end: r.end }; });
}

function mergeRanges(ranges) {
    var merged = [];
    ranges.slice().sort(function(a, b) { return a.start - b.start || a.end - b.end; }).forEach(function(r) {
        var prev = merged[merged.length - 1];
        if (prev && r.start <= prev.end + 1) prev.end = Math.max(prev.end, r.end);
        else merged.push({ start: r.start, end: r.end });
    });
    return merged;
}

function missing(ranges, start, end) {
    var gaps = [], next = start;
    ranges.forEach(function(r) {
        if (r.end < next || r.start > end) return;
        if (r.start > next) gaps.push({ start: next, end: Math.min(end, r.start - 1) });
        next = Math.max(next, r.end + 1);
    });
    if (next <= end) gaps.push({ start: next, end: end });
    return gaps;
}

function compareEvents(a, b) {
    return a.blockNum - b.blockNum || a.txIndex - b.txIndex || a.opIndex - b.opIndex || (a.virtualOp || 0) - (b.virtualOp || 0) || String(a.id).localeCompare(String(b.id));
}

function FederatedArchive(live, legacy, cfg) {
    validateConfig(cfg);
    this.live = live;
    this.legacy = legacy;
    this.stores = legacy.concat([live]);
    this.cfg = cfg;
    this.legacyRanges = [];
    this.rangeCache = new Map();
    legacy.forEach(function(s) {
        if (!s.readOnly) throw new Error('legacy archive must be readonly');
        var ranges = storedRanges(s);
        this.rangeCache.set(s, ranges);
        this.legacyRanges = this.legacyRanges.concat(ranges);
    }, this);
    this._validateOverlaps();
}

FederatedArchive.prototype._validateOverlaps = function() {
    for (var i = 0; i < this.stores.length; i += 1) {
        for (var j = i + 1; j < this.stores.length; j += 1) {
            var a = this.stores[i], b = this.stores[j];
            // Retained stores are immutable. Intersections are checked once at open.
            var ar = this.rangeCache.get(a) || storedRanges(a), br = this.rangeCache.get(b) || storedRanges(b);
            this.rangeCache.set(a, ar);
            this.rangeCache.set(b, br);
            ar.forEach(function(x) { br.forEach(function(y) {
                var start = Math.max(x.start, y.start), end = Math.min(x.end, y.end);
                if (start > end) return;
                var rows = a.db.prepare('SELECT block_num FROM blocks WHERE block_num BETWEEN ? AND ?').iterate(start, end);
                for (var row of rows) {
                    var left = a.getBlockRecord(row.block_num), right = b.getBlockRecord(row.block_num);
                    if (!left.block_id || left.block_id !== right.block_id || left.timestamp !== right.timestamp || left.previous !== right.previous) throw new Error('archive overlap identity mismatch at ' + row.block_num);
                }
            }); });
        }
    }
};

FederatedArchive.prototype.getCoverage = function() {
    var version = this.live.db.prepare('PRAGMA data_version').get().data_version + ':' + this.live.db.prepare('SELECT total_changes() AS n').get().n;
    if (this.liveVersion !== version) {
        this.liveRanges = storedRanges(this.live);
        this.liveVersion = version;
    }
    var liveRanges = this.liveRanges;
    var ranges = mergeRanges(this.legacyRanges.concat(liveRanges));
    var start = Number(this.cfg.historyStartBlock || (ranges.length ? ranges[0].start : this.cfg.startBlock));
    var end = Math.max(Number(this.live.getCursor().lastIndexedBlock || 0), ranges.length ? ranges[ranges.length - 1].end : start - 1, Number(this.cfg.startBlock) - 1);
    var gaps = missing(ranges, start, end);
    var historyComplete = start === 1 && gaps.length === 0 && end >= start;
    return { ranges: ranges, missingRanges: gaps, historyComplete: historyComplete, degraded: !historyComplete,
        liveRange: liveRanges.length ? liveRanges[liveRanges.length - 1] : null, liveRanges: liveRanges,
        retainedHistoryStartBlock: start, recordedMissingRanges: this.live._getMeta('missing_ranges', []) };
};

FederatedArchive.prototype.missingRanges = function(start, end) {
    return missing(this.getCoverage().ranges, Number(start), Number(end));
};
FederatedArchive.prototype.getStatus = function() { return Object.assign(this.live.getStatus(), this.getCoverage()); };
FederatedArchive.prototype.getCursor = function() { return this.live.getCursor(); };
FederatedArchive.prototype.getFirstIndexedBlock = function() { var r = this.getCoverage().ranges; return r.length ? r[0].start : 0; };
FederatedArchive.prototype.getVirtualReceiptStartBlock = function() {
    var starts = this.stores.map(function(s) { return s.getVirtualReceiptStartBlock(); }).filter(function(n) { return n > 0; });
    return starts.length ? Math.min.apply(Math, starts) : 0;
};
FederatedArchive.prototype.getBlockRecord = function(n) {
    var found = null;
    this.stores.forEach(function(s) { var r = s.getBlockRecord(n); if (r && (!found || r.virtualComplete)) found = r; });
    return found;
};
FederatedArchive.prototype.isBlockRangeComplete = function(start, end) {
    return Number.isSafeInteger(Number(start)) && start > 0 && Number.isSafeInteger(Number(end)) && end >= start && this.missingRanges(start, end).length === 0;
};
FederatedArchive.prototype.isVirtualRangeComplete = function(start, end) {
    if (!this.isBlockRangeComplete(start, end)) return false;
    var receiptStart = this.getVirtualReceiptStartBlock();
    if (!receiptStart) return false;
    // Count union coverage of receipt-complete blocks, not cursor-derived assumptions.
    var complete = [];
    this.stores.forEach(function(s) {
        var rows = s.db.prepare('SELECT MIN(block_num) AS start, MAX(block_num) AS end FROM (SELECT block_num, block_num - ROW_NUMBER() OVER (ORDER BY block_num) AS grp FROM blocks WHERE virtual_complete = 1 AND block_num BETWEEN ? AND ?) GROUP BY grp').all(Math.max(start, receiptStart), end);
        complete = complete.concat(rows);
    });
    return end < receiptStart || missing(mergeRanges(complete), Math.max(start, receiptStart), end).length === 0;
};
FederatedArchive.prototype._query = function(method, prefix, options) {
    options = options || {};
    var max = method === 'queryEvents' ? 5000 : 50000;
    var limit = Math.max(1, Math.min(Number(options.limit || (max === 5000 ? 500 : 5000)), max));
    var unique = new Map();
    this.stores.forEach(function(s) {
        var rows = method === 'queryEvents' ? s.queryEvents(options) : s.queryEventsByTypePrefix(prefix, options);
        rows.forEach(function(e) {
            var prior = unique.get(e.id);
            if (prior && JSON.stringify(prior) !== JSON.stringify(e)) throw new Error('archive overlapping event proof mismatch: ' + e.id);
            unique.set(e.id, e);
        });
    });
    var rows = Array.from(unique.values()).sort(compareEvents);
    return method === 'queryEvents' ? rows.slice(-limit) : rows.slice(0, limit);
};
FederatedArchive.prototype.queryEvents = function(options) { return this._query('queryEvents', null, options); };
FederatedArchive.prototype.queryEventsByTypePrefix = function(prefix, options) { return this._query('queryEventsByTypePrefix', prefix, options); };

function openArchive(cfg, live, legacy) {
    validateConfig(cfg);
    var segmented = !!((cfg.legacyDataDirs || []).length || cfg.autoGapRollover);
    live = live || new ArchiveStore(cfg.dataDir, { readOnly: segmented });
    if (!(cfg.legacyDataDirs || []).length && !cfg.autoGapRollover && !live._getMeta('missing_ranges', []).length) return live;
    legacy = legacy || (cfg.legacyDataDirs || []).map(function(dir) { return new ArchiveStore(dir, { readOnly: true }); });
    return new FederatedArchive(live, legacy, cfg);
}

module.exports = { FederatedArchive: FederatedArchive, validateConfig: validateConfig, validateWritableTail: validateWritableTail, openArchive: openArchive, storedRanges: storedRanges, mergeRanges: mergeRanges, missing: missing };
