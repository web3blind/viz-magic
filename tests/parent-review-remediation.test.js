'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function load(context, file) {
  vm.createContext(context);
  vm.runInContext(read(file), context, { filename: file });
  return context;
}
function test(name, fn) {
  try {
    fn();
    console.log('PASS ' + name);
  } catch (error) {
    console.error('FAIL ' + name + ': ' + error.message);
    process.exitCode = 1;
  }
}

test('legacy paid actions enter compatibility before v2 proof requirements', function () {
  const context = {
    console,
    VizMagicConfig: {
      PROTOCOLS: { VM: 'VM' },
      PAID_ACTIONS: { V2_ACTIVATION_BLOCK: 83500000, TRAVEL_RECEIVER: 'treasury' },
      ACTION_TYPES: { HUNT: 'hunt', HUNT_ARMAGEDDON: 'hunt.armageddon', MOVE: 'move' }
    },
    GameCreatures: { getCreature: function() { return { author: 'author' }; } }
  };
  load(context, 'app/js/engine/action-proof.js');
  load(context, 'app/js/protocols/vm-protocol.js');
  const legacyHunt = { type: 'hunt', version: 1, data: { creature: 'wisp', spell: 'firebolt' } };
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(context.ActionProof.createVerifier([], 83499999).verify('alice', 0, legacyHunt))),
    { valid: true, legacy: true, error: null }
  );
  const legacyArmageddon = { type: 'hunt.armageddon', version: 1, data: { creature: 'wisp', stone_ref: 'stone-1' } };
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(context.ActionProof.createVerifier([], 83499999).verify('alice', 0, legacyArmageddon))),
    { valid: true, legacy: true, error: null }
  );
  assert.strictEqual(context.VMProtocol.createArmageddonAction('wisp', 'commons_first_light', 'stone-1').d.energy, 10000);
});

test('v2 hunt and travel validation rejects impossible zones and malformed energy', function () {
  const context = {
    console,
    VizMagicConfig: {
      PROTOCOLS: { VM: 'VM' },
      ACTION_TYPES: { HUNT: 'hunt', HUNT_ARMAGEDDON: 'hunt.armageddon', MOVE: 'move' },
      CLASSES: {}, ENERGY: { MIN_HUNT_COST: 100, MAX: 10000 }
    },
    CharacterSystem: { isFallen: function() { return false; } },
    GameSpells: { getSpell: function() { return { manaCost: 100 }; } },
    GameRegions: { getRegion: function(id) { return id === 'commons_first_light' ? { id } : null; } },
    GameCreatures: { getCreature: function(id) { return id === 'wisp' ? { id, zone: 'commons_first_light' } : null; } }
  };
  load(context, 'app/js/engine/validator.js');
  const state = { characters: { alice: { spells: ['firebolt'], currentZone: 'commons_first_light' } } };
  const hunt = function(zone, energy) {
    return context.ActionValidator.validate({ type: 'hunt', version: 2, data: { creature: 'wisp', spell: 'firebolt', zone, energy } }, state, 'alice', 83500001);
  };
  assert.strictEqual(hunt('nonexistent-zone', 100).valid, false);
  assert.strictEqual(hunt('commons_first_light', 100).valid, true);
  for (const energy of [0, -1, NaN, Infinity]) {
    assert.strictEqual(context.ActionValidator.validate({ type: 'move', version: 2, data: { zone: 'commons_first_light', energy } }, state, 'alice', 83500001).valid, false);
  }
});

test('deterministic travel preserves the accepted 35/30 percent and double-find mechanics', function () {
  const context = { console };
  load(context, 'app/js/engine/deterministic-actions.js');
  function count(energy) {
    let hits = 0;
    let doubles = 0;
    for (let i = 0; i < 20000; i++) {
      const found = context.DeterministicActions.travelFind('entropy-' + i, 90000000 + i, 'alice', 'ember_wastes', energy);
      if (found) {
        hits++;
        if (found.quantity === 2 && found.rarity === 2) doubles++;
      }
    }
    return { hits, doubles };
  }
  const standard = count(100);
  const burst = count(300);
  assert.ok(standard.hits > 6600 && standard.hits < 7400, '100-energy find chance must remain approximately 35%');
  assert.ok(burst.hits > 5600 && burst.hits < 6400, '300-energy find chance must remain approximately 30%');
  assert.ok(burst.doubles > 1500 && burst.doubles < 2100, '30% of burst finds should remain doubled');
  assert.strictEqual(context.DeterministicActions.travelFind('x', 1, 'alice', 'zone', 10), null);
});

test('progression handles huge and nonfinite XP in bounded time without a level cap', function () {
  const context = { console, VizMagicConfig: { DOMINANCE: {} } };
  load(context, 'app/js/engine/formulas.js');
  assert.strictEqual(context.GameFormulas.levelFromXp(Infinity, 2), 1);
  assert.strictEqual(context.GameFormulas.levelFromXp(NaN, 2), 1);
  const started = Date.now();
  const level = context.GameFormulas.levelFromXp(Number.MAX_SAFE_INTEGER, 2);
  assert.ok(Number.isSafeInteger(level) && level > 105);
  assert.ok(Date.now() - started < 100, 'huge XP lookup must be bounded and efficient');
  const hugeTotal = context.GameFormulas.totalXpForLevel(level, 2);
  assert.ok(Number.isSafeInteger(hugeTotal));
});

test('one authoritative XP action levels a character in bounded time without iterative caps', function () {
  const context = { console };
  load(context, 'app/js/config.js');
  load(context, 'app/js/engine/formulas.js');
  load(context, 'app/js/engine/character.js');
  const character = context.CharacterSystem.createCharacter('alice', 'Alice', 'embercaster', 90000000);
  const started = Date.now();
  const result = context.CharacterSystem.addXp(character, Number.MAX_SAFE_INTEGER, 90000001);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 200, 'large safe-integer XP must not drive a per-level loop');
  assert.strictEqual(character.xp, Number.MAX_SAFE_INTEGER);
  assert.ok(character.level > 60);
  assert.ok(result.levelsGained > 0);
});

test('VM traversal reports missing history instead of pretending partial recovery is complete', function () {
  const context = {
    console,
    VizMagicConfig: { PROTOCOLS: { VM: 'VM', V: 'V', VE: 'VE' }, ACTION_TYPES: {}, APP_VERSION: 2 },
    VizAccount: { getAccountProtocol: function(_account, _protocol, cb) { cb(null, { custom_sequence_block_num: 200 }); } }
  };
  load(context, 'app/js/protocols/vm-protocol.js');
  let receivedError = null;
  context.VMProtocol.traverseChain('alice', 10, function(error) { receivedError = error; }, {
    getBlock: function(_block, cb) { cb(new Error('archive unavailable')); }
  });
  assert.match(String(receivedError && receivedError.message || receivedError), /archive unavailable|history/i);
});

test('RPC range ingestion stops on a missing block instead of skipping it', function () {
  const seen = [];
  const context = {
    console: { log: function() {}, error: console.error },
    setTimeout: function(fn) { fn(); return 1; },
    VizMagicConfig: { PROTOCOLS: { VM: 'VM', V: 'V', VE: 'VE' } },
    HistorySource: {
      getBlock: function(blockNum, callback) {
        if (blockNum === 2) callback(new Error('rpc gap fixture'));
        else callback(null, { block_id: 'b' + blockNum, previous: 'p' + blockNum, timestamp: '', transactions: [] });
      }
    },
    VMProtocol: { extractActions: function() { return []; } },
    VoiceProtocol: { extractPosts: function() { return []; } },
    MarketProtocol: { extractEvents: function() { return []; } }
  };
  load(context, 'app/js/engine/block-processor.js');
  let completionError = null;
  context.BlockProcessor.processBlockRange(1, 3, function(_processed, blockNum) { seen.push(blockNum); }, function(error) { completionError = error; });
  assert.deepStrictEqual(seen, [1]);
  assert.match(String(completionError && completionError.message || completionError), /rpc gap fixture/);
});

test('HistorySource paginates and de-duplicates the complete archive range', function () {
  const pages = [
    [{ id: 'c', blockNum: 3 }, { id: 'd', blockNum: 4 }],
    [{ id: 'a', blockNum: 1 }, { id: 'b', blockNum: 2 }]
  ];
  let call = 0;
  function FakeXHR() {}
  FakeXHR.prototype.open = function(_method, url) { this.url = url; };
  FakeXHR.prototype.send = function() {
    this.readyState = 4;
    this.status = 200;
    let events;
    if (this.url.indexOf('/health') !== -1) {
      this.responseText = JSON.stringify({ lastIndexedBlock: 4 });
      this.onreadystatechange();
      return;
    }
    if (this.url.indexOf('/events/block/3') !== -1) events = [{ id: 'c', blockNum: 3 }];
    else if (this.url.indexOf('/events/block/1') !== -1) events = [{ id: 'a', blockNum: 1 }];
    else events = pages[call++] || [];
    this.responseText = JSON.stringify({ events });
    this.onreadystatechange();
  };
  FakeXHR.prototype.abort = function() {};
  const context = {
    console,
    setTimeout: function() { return 1; }, clearTimeout: function() {},
    VizMagicConfig: { HISTORY_ARCHIVE_MIRRORS: [{ apiBase: 'https://archive.invalid' }], PROTOCOLS: { VM: 'VM' } },
    XMLHttpRequest: FakeXHR
  };
  load(context, 'app/js/blockchain/history-source.js');
  let result = null;
  let rangeError = null;
  context.HistorySource.getAllEventsRange({ start: 1, end: 4, protocol: 'VM,V,VE,award', limit: 2 }, function(error, events) {
    rangeError = error;
    result = events;
  });
  assert.ifError(rangeError);
  assert.deepStrictEqual(Array.from(result, function(event) { return event.id; }), ['a', 'b', 'c', 'd']);
  assert.strictEqual(call, 2);
  let archiveHead = 0;
  context.HistorySource.getArchiveHead(function(err, head) {
    assert.ifError(err);
    archiveHead = head;
  });
  assert.strictEqual(archiveHead, 4);
});

if (process.exitCode) process.exit(process.exitCode);
