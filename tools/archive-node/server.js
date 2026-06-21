'use strict';

var http = require('http');
var url = require('url');
var path = require('path');
var storeMod = require('./storage');
var indexer = require('./indexer');

function json(res, status, payload, extraHeaders) {
    var headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Cache-Control': status === 200 ? 'public, max-age=30' : 'no-store'
    };
    Object.keys(extraHeaders || {}).forEach(function(key) { headers[key] = extraHeaders[key]; });
    res.writeHead(status, headers);
    res.end(JSON.stringify(payload));
}

function safeNum(value, fallback) {
    var n = Number(value);
    if (!isFinite(n) || Math.floor(n) !== n) return fallback;
    return n;
}

function pathParts(reqUrl) {
    return url.parse(reqUrl, true).pathname.replace(/\/+/g, '/').split('/').filter(Boolean);
}

function memberCount(guild) {
    return guild && guild.members ? Object.keys(guild.members).length : 0;
}

function ensureGuildShell(guilds, guildId, sender, blockNum) {
    if (!guildId) return null;
    if (guilds[guildId]) return guilds[guildId];
    guilds[guildId] = {
        id: guildId,
        name: guildId,
        tag: String(guildId).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 5) || 'GM',
        school: null,
        motto: '',
        charter: { membership: 'invite', tithe_pct: 1000, min_shares: 0 },
        founder: sender || '',
        createdBlock: Number(blockNum) || 0,
        level: 1,
        xp: 0,
        members: {},
        invites: {},
        announcements: [],
        isPlaceholder: true
    };
    return guilds[guildId];
}

function addInitialFounder(guild, sender, blockNum) {
    if (!guild || !sender || guild.members[sender]) return;
    guild.members[sender] = {
        account: sender,
        rank: 'founder',
        joinedBlock: Number(blockNum) || 0,
        delegatedShares: 0,
        pvpWins: 0,
        pvpLosses: 0,
        questContributions: 0
    };
}

function applyGuildEvent(guilds, listings, event) {
    var payload = event && event.payload || {};
    var data = payload.d || payload.data || {};
    var type = event && event.type || payload.t || payload.type || '';
    var sender = event && event.sender || '';
    var blockNum = event && event.blockNum || 0;
    var guildId = data.guild_id || data.id || data.guildId;
    var guild = null;

    if (type === 'guild.create') {
        guildId = data.id;
        if (!guildId || !data.name) return;
        guild = {
            id: guildId,
            name: data.name,
            tag: String(data.tag || guildId).toUpperCase().slice(0, 5),
            school: data.school || null,
            motto: data.motto || '',
            charter: data.charter || { membership: 'open', tithe_pct: 1000, min_shares: 0 },
            founder: sender,
            createdBlock: Number(blockNum) || 0,
            level: 1,
            xp: 0,
            members: {},
            invites: {},
            announcements: [],
            isPlaceholder: false
        };
        addInitialFounder(guild, sender, blockNum);
        guilds[guildId] = guild;
        listings[guildId] = { guild_id: guildId, created_block: Number(blockNum) || 0, sender: sender, blockNum: Number(blockNum) || 0 };
        return;
    }

    if (type === 'guild.listing') {
        if (!guildId || !data.created_block) return;
        listings[guildId] = { guild_id: guildId, created_block: Number(data.created_block) || 0, sender: sender, blockNum: Number(blockNum) || 0 };
        return;
    }

    if (!guildId) return;
    guild = ensureGuildShell(guilds, guildId, sender, blockNum);

    if (type === 'guild.invite') {
        if (sender) addInitialFounder(guild, sender, blockNum);
        if (data.target) guild.invites[data.target] = { inviter: sender, block: Number(blockNum) || 0 };
    } else if (type === 'guild.accept') {
        if (sender && !guild.members[sender]) {
            guild.members[sender] = { account: sender, rank: 'initiate', joinedBlock: Number(blockNum) || 0, delegatedShares: 0, pvpWins: 0, pvpLosses: 0, questContributions: 0 };
        }
        if (sender && guild.invites) delete guild.invites[sender];
    } else if (type === 'guild.leave') {
        if (sender && guild.members && guild.members[sender] && guild.members[sender].rank !== 'founder') delete guild.members[sender];
    } else if (type === 'guild.promote') {
        if (data.target) {
            if (!guild.members[data.target]) guild.members[data.target] = { account: data.target, rank: 'initiate', joinedBlock: Number(blockNum) || 0, delegatedShares: 0, pvpWins: 0, pvpLosses: 0, questContributions: 0 };
            guild.members[data.target].rank = data.rank || guild.members[data.target].rank;
        }
    } else if (type === 'guild.announce') {
        if (data.text) guild.announcements.push(String(data.text).slice(0, 500));
    }
}

function buildGuildDirectory(archive, options) {
    var rows = archive.queryEventsByTypePrefix('guild.', options || {});
    var guilds = {};
    var listings = {};
    for (var i = 0; i < rows.length; i += 1) applyGuildEvent(guilds, listings, rows[i]);
    var list = [];
    Object.keys(guilds).forEach(function(id) {
        var guild = guilds[id];
        if (!listings[id] && !guild.isPlaceholder) {
            listings[id] = { guild_id: id, created_block: guild.createdBlock || 0, sender: guild.founder || '', blockNum: guild.createdBlock || 0 };
        }
        guild.memberCount = memberCount(guild);
        list.push(guild);
    });
    list.sort(function(a, b) {
        if ((b.level || 1) !== (a.level || 1)) return (b.level || 1) - (a.level || 1);
        if ((b.memberCount || 0) !== (a.memberCount || 0)) return (b.memberCount || 0) - (a.memberCount || 0);
        return String(a.name || a.id).localeCompare(String(b.name || b.id));
    });
    return { guilds: guilds, listings: Object.keys(listings).map(function(id) { return listings[id]; }), list: list, sourceEvents: rows.length };
}

function createServer(options) {
    options = options || {};
    var startedAt = Date.now();
    var cfg = options.config || indexer.loadConfig(options.configPath || path.join(__dirname, 'config.json'));
    if (options.dataDir) cfg.dataDir = options.dataDir;
    var archive = options.store || new storeMod.ArchiveStore(cfg.dataDir);

    return http.createServer(function(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        if (req.method !== 'GET') {
            json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, OPTIONS' });
            return;
        }

        var parsedUrl = url.parse(req.url, true);
        var parts = pathParts(req.url);
        if (parts[0] === 'archive-mirror') parts.shift();

        if (parts.length === 1 && parts[0] === 'health') {
            var status = archive.getStatus();
            json(res, 200, {
                ok: true,
                service: 'viz-magic-game-archive',
                uptimeSec: Math.round((Date.now() - startedAt) / 1000),
                dataDir: cfg.dataDir,
                lastIndexedBlock: status.lastIndexedBlock || 0,
                cursorUpdatedAt: status.cursorUpdatedAt || null,
                storage: 'sqlite',
                readOnly: true
            }, { 'Cache-Control': 'no-store' });
            return;
        }

        if (parts.length === 2 && parts[0] === 'v1' && parts[1] === 'status') {
            var st = archive.getStatus();
            st.ok = st.ok !== false;
            st.service = 'viz-magic-game-archive';
            st.readOnly = true;
            st.storage = 'sqlite';
            json(res, 200, st, { 'Cache-Control': 'no-store' });
            return;
        }

        if (parts.length === 3 && parts[0] === 'v1' && parts[1] === 'block') {
            var blockRaw = parts[2].replace(/\.json$/, '');
            var blockNum = safeNum(blockRaw, 0);
            if (!blockNum || blockNum <= 0) {
                json(res, 400, { error: 'invalid_block' });
                return;
            }
            var record = archive.getBlockRecord(blockNum);
            if (!record) {
                json(res, 404, { error: 'block_not_indexed', blockNum: blockNum }, { 'Cache-Control': 'no-store' });
                return;
            }
            json(res, 200, {
                blockNum: record.blockNum,
                block_id: record.block_id,
                previous: record.previous,
                timestamp: record.timestamp,
                eventCount: record.eventCount || 0,
                sourceNode: record.sourceNode || '',
                indexedAt: record.indexedAt,
                block: record.block
            });
            return;
        }

        if (parts.length === 4 && parts[0] === 'v1' && parts[1] === 'events' && parts[2] === 'block') {
            var eventBlockRaw = parts[3].replace(/\.json$/, '');
            var eventBlockNum = safeNum(eventBlockRaw, 0);
            if (!eventBlockNum || eventBlockNum <= 0) {
                json(res, 400, { error: 'invalid_block' });
                return;
            }
            var eventBlockRecord = archive.getBlockRecord(eventBlockNum);
            if (!eventBlockRecord) {
                json(res, 404, { error: 'block_not_indexed', blockNum: eventBlockNum }, { 'Cache-Control': 'no-store' });
                return;
            }
            var blockEvents = archive.queryEvents({
                start: eventBlockNum,
                end: eventBlockNum,
                limit: 5000
            });
            json(res, 200, {
                blockNum: eventBlockRecord.blockNum,
                block_id: eventBlockRecord.block_id,
                previous: eventBlockRecord.previous,
                timestamp: eventBlockRecord.timestamp,
                eventCount: eventBlockRecord.eventCount || blockEvents.length,
                sourceNode: eventBlockRecord.sourceNode || '',
                indexedAt: eventBlockRecord.indexedAt,
                events: blockEvents,
                count: blockEvents.length
            });
            return;
        }

        if (parts.length === 2 && parts[0] === 'v1' && parts[1] === 'range') {
            var protocols = parsedUrl.query.protocol ? String(parsedUrl.query.protocol).split(',').map(function(x) { return x.trim(); }).filter(Boolean) : null;
            var events = archive.queryEvents({
                start: safeNum(parsedUrl.query.start || parsedUrl.query.from, 0),
                end: safeNum(parsedUrl.query.end || parsedUrl.query.to, 2147483647),
                protocols: protocols,
                limit: safeNum(parsedUrl.query.limit, 500)
            });
            json(res, 200, { events: events, count: events.length });
            return;
        }

        if (parts.length === 2 && parts[0] === 'v1' && parts[1] === 'guilds') {
            var directory = buildGuildDirectory(archive, {
                start: safeNum(parsedUrl.query.start || parsedUrl.query.from, 0),
                end: safeNum(parsedUrl.query.end || parsedUrl.query.to, 2147483647),
                limit: safeNum(parsedUrl.query.limit, 50000)
            });
            json(res, 200, {
                guilds: directory.list,
                guildMap: directory.guilds,
                listings: directory.listings,
                count: directory.list.length,
                sourceEvents: directory.sourceEvents,
                readOnly: true
            });
            return;
        }

        if (parts.length === 6 && parts[0] === 'v1' && parts[1] === 'account' && parts[3] === 'protocol' && parts[5] === 'actions') {
            var account = decodeURIComponent(parts[2]);
            var protocol = decodeURIComponent(parts[4]);
            var rows = archive.queryEvents({
                account: account,
                protocol: protocol,
                start: safeNum(parsedUrl.query.start || parsedUrl.query.from, 0),
                end: safeNum(parsedUrl.query.end || parsedUrl.query.to, 2147483647),
                limit: safeNum(parsedUrl.query.limit, 500)
            });
            json(res, 200, { account: account, protocol: protocol, actions: rows, count: rows.length });
            return;
        }

        if (parts.length === 6 && parts[0] === 'v1' && parts[1] === 'account' && parts[3] === 'protocol' && parts[5] === 'latest') {
            var latestAccount = decodeURIComponent(parts[2]);
            var latestProtocol = decodeURIComponent(parts[4]);
            var latestRows = archive.queryEvents({ account: latestAccount, protocol: latestProtocol, limit: 1 });
            json(res, 200, { account: latestAccount, protocol: latestProtocol, latest: latestRows.length ? latestRows[latestRows.length - 1] : null });
            return;
        }

        json(res, 404, { error: 'not_found' }, { 'Cache-Control': 'no-store' });
    });
}

if (require.main === module) {
    var configPath = process.env.ARCHIVE_NODE_CONFIG || path.join(__dirname, 'config.json');
    var cfg = indexer.loadConfig(configPath);
    var port = Number(process.env.PORT || process.env.ARCHIVE_NODE_PORT || cfg.port || 3007);
    var host = process.env.HOST || process.env.ARCHIVE_NODE_HOST || cfg.host || '127.0.0.1';
    var server = createServer({ config: cfg });
    server.listen(port, host, function() {
        console.log('viz-magic game archive listening on http://' + host + ':' + port);
    });
}

module.exports = {
    createServer: createServer,
    safeNum: safeNum,
    pathParts: pathParts,
    buildGuildDirectory: buildGuildDirectory
};
