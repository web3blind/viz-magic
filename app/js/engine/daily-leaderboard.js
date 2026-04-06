/**
 * Viz Magic — Daily Leaderboard
 * Rolling 24h leaderboard based on XP earned from hunt actions in the last 28800 blocks.
 * Runs only when the leaderboard screen requests it.
 */
var DailyLeaderboard = (function() {
    'use strict';

    var WINDOW_BLOCKS = 28800;
    var BATCH_SIZE = 20;
    var YIELD_MS = 20;
    var _initialized = false;
    var _loading = false;
    var _subscribers = [];
    var _snapshot = _emptySnapshot();

    function _emptySnapshot() {
        return {
            ready: false,
            loading: false,
            progressPct: 0,
            statusText: '',
            windowStartBlock: 0,
            windowEndBlock: 0,
            lastScannedBlock: 0,
            lastUpdatedAt: 0,
            players: {},
            characters: {},
            rows: []
        };
    }

    function init(callback) {
        callback = callback || function() {};
        if (_initialized) {
            callback(null);
            return;
        }

        DailyLeaderboardStorage.init(function(err) {
            if (err) {
                callback(err);
                return;
            }

            DailyLeaderboardStorage.getMeta(function(metaErr, meta) {
                if (!metaErr && meta) {
                    _snapshot = _normalizeMeta(meta);
                }
                _initialized = true;
                callback(null);
            });
        });
    }

    function subscribe(fn) {
        if (typeof fn !== 'function') return function() {};
        _subscribers.push(fn);
        fn(_snapshot);
        return function() {
            for (var i = 0; i < _subscribers.length; i++) {
                if (_subscribers[i] === fn) {
                    _subscribers.splice(i, 1);
                    break;
                }
            }
        };
    }

    function getSnapshot() {
        return _snapshot;
    }

    function ensureLoaded(callback) {
        callback = callback || function() {};
        init(function(err) {
            if (err) {
                callback(err, _snapshot);
                return;
            }

            if (_loading) {
                callback(null, _snapshot);
                return;
            }

            viz.api.getDynamicGlobalProperties(function(dgpErr, dgp) {
                if (dgpErr || !dgp) {
                    callback(dgpErr || new Error('dgp_unavailable'), _snapshot);
                    return;
                }

                var headBlock = dgp.head_block_number;
                var targetStart = Math.max(1, headBlock - WINDOW_BLOCKS + 1);
                var needsFullBuild = !_snapshot.ready || !_snapshot.windowEndBlock || !_snapshot.characters;

                if (needsFullBuild) {
                    _buildWindow(targetStart, headBlock, callback);
                    return;
                }

                if (headBlock <= _snapshot.windowEndBlock) {
                    callback(null, _snapshot);
                    return;
                }

                _incrementalUpdate(targetStart, headBlock, callback);
            });
        });
    }

    function _buildWindow(startBlock, endBlock, callback) {
        _loading = true;
        _setSnapshot({
            loading: true,
            ready: false,
            progressPct: 0,
            statusText: Helpers.t('leaderboard_loading_status', { percent: 0 }),
            windowStartBlock: startBlock,
            windowEndBlock: endBlock,
            lastScannedBlock: startBlock - 1,
            players: {},
            characters: {},
            rows: []
        });

        DailyLeaderboardStorage.clearAll(function() {
            var ctx = {
                startBlock: startBlock,
                endBlock: endBlock,
                totalBlocks: Math.max(1, endBlock - startBlock + 1),
                players: {},
                characters: {},
                characterFetchCache: {},
                processedBlocks: 0
            };

            _scanRange(ctx, startBlock, endBlock, function(err) {
                _loading = false;
                if (err) {
                    callback(err, _snapshot);
                    return;
                }
                _finalizeSnapshot(ctx, startBlock, endBlock, callback);
            });
        });
    }

    function _incrementalUpdate(targetStart, headBlock, callback) {
        _loading = true;
        _setSnapshot({
            loading: true,
            progressPct: 0,
            statusText: Helpers.t('leaderboard_updating_status', { percent: 0 })
        });

        var ctx = {
            startBlock: _snapshot.windowEndBlock + 1,
            endBlock: headBlock,
            totalBlocks: Math.max(1, headBlock - _snapshot.windowEndBlock),
            players: _cloneObject(_snapshot.players || {}),
            characters: _cloneObject(_snapshot.characters || {}),
            characterFetchCache: {},
            processedBlocks: 0
        };

        _scanRange(ctx, ctx.startBlock, ctx.endBlock, function(err) {
            if (err) {
                _loading = false;
                callback(err, _snapshot);
                return;
            }

            DailyLeaderboardStorage.getBlockContributionsInRange(1, targetStart - 1, function(rangeErr, oldBlocks) {
                if (!rangeErr && oldBlocks && oldBlocks.length) {
                    for (var i = 0; i < oldBlocks.length; i++) {
                        _subtractBlockContribution(ctx.players, oldBlocks[i]);
                    }
                }

                DailyLeaderboardStorage.deleteBlocksBefore(targetStart, function() {
                    _loading = false;
                    _finalizeSnapshot({
                        players: ctx.players,
                        characters: ctx.characters
                    }, targetStart, headBlock, callback);
                });
            });
        });
    }

    function _scanRange(ctx, startBlock, endBlock, callback) {
        if (startBlock > endBlock) {
            callback(null);
            return;
        }

        var current = startBlock;

        function step() {
            if (current > endBlock) {
                callback(null);
                return;
            }

            var batchEnd = Math.min(endBlock, current + BATCH_SIZE - 1);
            _scanBatch(ctx, current, batchEnd, function(err) {
                if (err) {
                    callback(err);
                    return;
                }
                current = batchEnd + 1;
                setTimeout(step, YIELD_MS);
            });
        }

        step();
    }

    function _scanBatch(ctx, startBlock, endBlock, callback) {
        var current = startBlock;

        function next() {
            if (current > endBlock) {
                callback(null);
                return;
            }

            viz.api.getBlock(current, function(err, block) {
                if (err || !block) {
                    ctx.processedBlocks++;
                    _updateProgress(ctx, current);
                    current++;
                    next();
                    return;
                }

                var processed = BlockProcessor.processBlock(block, current);
                _processProcessedBlock(ctx, processed, function(processErr) {
                    if (processErr) {
                        callback(processErr);
                        return;
                    }
                    ctx.processedBlocks++;
                    _updateProgress(ctx, current);
                    current++;
                    next();
                });
            });
        }

        next();
    }

    function _processProcessedBlock(ctx, processed, callback) {
        var vmActions = processed.vmActions || [];
        var blockContrib = {
            blockNum: processed.blockNum,
            players: {}
        };
        var index = 0;

        function nextAction() {
            if (index >= vmActions.length) {
                DailyLeaderboardStorage.putBlockContribution(blockContrib, function() {
                    callback(null);
                });
                return;
            }

            var vmAction = vmActions[index++];
            _applyVmAction(ctx, processed, vmAction, blockContrib, nextAction);
        }

        nextAction();
    }

    function _applyVmAction(ctx, processed, vmAction, blockContrib, callback) {
        var sender = vmAction.sender;
        var action = vmAction.action;

        _ensureCharacter(ctx, sender, action, function() {
            if (!action) {
                callback();
                return;
            }

            if (action.type === VizMagicConfig.ACTION_TYPES.CHAR_ATTUNE) {
                _handleCharAttune(ctx, sender, action.data || {});
                callback();
                return;
            }

            if (action.type === VizMagicConfig.ACTION_TYPES.HUNT) {
                _handleHunt(ctx, sender, action.data || {}, processed, blockContrib);
                callback();
                return;
            }

            if (action.type === VizMagicConfig.ACTION_TYPES.HUNT_ARMAGEDDON) {
                _handleArmageddon(ctx, sender, action.data || {}, processed, blockContrib);
                callback();
                return;
            }

            callback();
        });
    }

    function _ensureCharacter(ctx, account, action, callback) {
        callback = callback || function() {};
        if (!account) {
            callback();
            return;
        }
        if (ctx.characters[account]) {
            callback();
            return;
        }

        if (action && action.type === VizMagicConfig.ACTION_TYPES.CHAR_ATTUNE && action.data && action.data.class) {
            _handleCharAttune(ctx, account, action.data);
            callback();
            return;
        }

        if (ctx.characterFetchCache[account] === 'pending') {
            setTimeout(function() { _ensureCharacter(ctx, account, action, callback); }, 25);
            return;
        }

        ctx.characterFetchCache[account] = 'pending';
        VizAccount.getAccount(account, function(err, accountData) {
            var character = null;
            if (!err && accountData) {
                var grimoire = VizAccount.parseGrimoire(accountData);
                if (grimoire && grimoire.class) {
                    character = CharacterSystem.createCharacter(account, grimoire.name || account, grimoire.class);
                    if (character) {
                        character.level = grimoire.level || character.level;
                        character.xp = grimoire.xp || 0;
                        character.hp = GameFormulas.calculateMaxHp(character.className, character.level, CharacterSystem.getTotalStat(character, 'res'));
                        character.maxHp = character.hp;
                    }
                }
            }

            if (!character) {
                character = CharacterSystem.createCharacter(account, account, 'embercaster');
            }

            ctx.characters[account] = character;
            ctx.characterFetchCache[account] = 'done';
            callback();
        });
    }

    function _handleCharAttune(ctx, account, data) {
        var character = CharacterSystem.createCharacter(account, data.name || account, data.class || 'embercaster');
        if (character) {
            ctx.characters[account] = character;
        }
    }

    function _handleHunt(ctx, account, data, processed, blockContrib) {
        var character = ctx.characters[account];
        if (!character) return;

        var creature = GameCreatures.getCreature(data.creature);
        var spell = GameSpells.getSpell(data.spell);
        if (!creature || !spell) return;

        var result = CombatSystem.resolveHunt(character, creature, spell, processed.blockHash || '', processed.blockNum, VizMagicConfig.ENERGY.MAX);
        if (!result || !result.victory) return;

        CharacterSystem.addXp(character, result.xpGained);
        _addContribution(ctx.players, blockContrib.players, account, character.name || account, result.xpGained, 1);
    }

    function _handleArmageddon(ctx, account, data, processed, blockContrib) {
        var character = ctx.characters[account];
        if (!character) return;

        var creature = GameCreatures.getCreature(data.creature);
        if (!creature) return;

        var xp = GameFormulas.armageddonXp(character.level, creature.minLevel, creature.baseXp || 25);
        CharacterSystem.addXp(character, xp);
        _addContribution(ctx.players, blockContrib.players, account, character.name || account, xp, 1);
    }

    function _addContribution(players, blockPlayers, account, name, xp, hunts) {
        if (!players[account]) {
            players[account] = { account: account, name: name || account, xp24h: 0, hunts24h: 0, lastSeenBlock: 0 };
        }
        players[account].name = name || players[account].name || account;
        players[account].xp24h += xp || 0;
        players[account].hunts24h += hunts || 0;

        if (!blockPlayers[account]) {
            blockPlayers[account] = { xp: 0, hunts: 0, name: name || account };
        }
        blockPlayers[account].xp += xp || 0;
        blockPlayers[account].hunts += hunts || 0;
        blockPlayers[account].name = name || blockPlayers[account].name || account;
    }

    function _subtractBlockContribution(players, blockContrib) {
        if (!blockContrib || !blockContrib.players) return;
        for (var account in blockContrib.players) {
            if (!blockContrib.players.hasOwnProperty(account) || !players[account]) continue;
            players[account].xp24h = Math.max(0, (players[account].xp24h || 0) - (blockContrib.players[account].xp || 0));
            players[account].hunts24h = Math.max(0, (players[account].hunts24h || 0) - (blockContrib.players[account].hunts || 0));
            if (players[account].xp24h <= 0 && players[account].hunts24h <= 0) {
                delete players[account];
            }
        }
    }

    function _finalizeSnapshot(ctx, startBlock, endBlock, callback) {
        var rows = _buildRows(ctx.players || {});
        var meta = {
            ready: true,
            loading: false,
            progressPct: 100,
            statusText: '',
            windowStartBlock: startBlock,
            windowEndBlock: endBlock,
            lastScannedBlock: endBlock,
            lastUpdatedAt: Date.now(),
            players: ctx.players || {},
            characters: ctx.characters || {},
            rows: rows
        };

        DailyLeaderboardStorage.setMeta(meta, function(err) {
            _setSnapshot(meta);
            callback(err, _snapshot);
        });
    }

    function _buildRows(players) {
        var rows = [];
        for (var account in players) {
            if (!players.hasOwnProperty(account)) continue;
            if ((players[account].xp24h || 0) <= 0 && (players[account].hunts24h || 0) <= 0) continue;
            rows.push({
                account: account,
                name: players[account].name || account,
                xp: players[account].xp24h || 0,
                hunts: players[account].hunts24h || 0
            });
        }

        rows.sort(function(a, b) {
            if (b.xp !== a.xp) return b.xp - a.xp;
            if (b.hunts !== a.hunts) return b.hunts - a.hunts;
            return a.account < b.account ? -1 : 1;
        });

        return rows.slice(0, 100);
    }

    function _updateProgress(ctx, currentBlock) {
        var pct = Math.max(0, Math.min(100, Math.floor(ctx.processedBlocks * 100 / ctx.totalBlocks)));
        _setSnapshot({
            loading: true,
            progressPct: pct,
            lastScannedBlock: currentBlock,
            statusText: Helpers.t('leaderboard_loading_status', { percent: pct })
        });
    }

    function _setSnapshot(patch) {
        _snapshot = _merge(_snapshot, patch || {});
        if (_snapshot.players) {
            _snapshot.rows = _buildRows(_snapshot.players);
        }
        _emit();
    }

    function _normalizeMeta(meta) {
        var snapshot = _emptySnapshot();
        snapshot = _merge(snapshot, meta || {});
        snapshot.ready = !!snapshot.ready;
        snapshot.loading = false;
        snapshot.players = snapshot.players || {};
        snapshot.characters = snapshot.characters || {};
        snapshot.rows = _buildRows(snapshot.players);
        return snapshot;
    }

    function _emit() {
        for (var i = 0; i < _subscribers.length; i++) {
            try { _subscribers[i](_snapshot); } catch (e) {}
        }
    }

    function _merge(target, patch) {
        var out = _cloneObject(target || {});
        for (var k in patch) {
            if (patch.hasOwnProperty(k)) {
                out[k] = patch[k];
            }
        }
        return out;
    }

    function _cloneObject(input) {
        if (!input) return {};
        return JSON.parse(JSON.stringify(input));
    }

    return {
        init: init,
        subscribe: subscribe,
        getSnapshot: getSnapshot,
        ensureLoaded: ensureLoaded,
        WINDOW_BLOCKS: WINDOW_BLOCKS
    };
})();
