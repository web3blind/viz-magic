'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), 'utf8'); }
function test(name, fn) {
  try {
    fn();
    console.log('PASS ' + name);
  } catch (err) {
    console.error('FAIL ' + name + ': ' + err.message);
    process.exitCode = 1;
  }
}
function runScript(context, relativePath) {
  vm.createContext(context);
  vm.runInContext(read(relativePath), context, { filename: relativePath });
  return context;
}

function loadProgression() {
  const context = {
    console,
    VizMagicConfig: {
      APP_VERSION: 1,
      PROGRESSION: { LEGACY_VERSION: 1, CURRENT_VERSION: 2, V2_ACTIVATION_BLOCK: 1000 },
      LEVELING: { SOFT_CAP: 50 },
      DOMINANCE: {}
    }
  };
  vm.createContext(context);
  vm.runInContext(read('app/js/engine/formulas.js'), context, { filename: 'formulas.js' });
  vm.runInContext(read('app/js/engine/character.js'), context, { filename: 'character.js' });
  return context;
}

function loadAccount(oldSession, storageOptions) {
  storageOptions = storageOptions || {};
  const storage = {
    value: oldSession == null ? null : JSON.stringify(oldSession),
    removed: false,
    getItem: function() { return this.value; },
    setItem: function(_key, value) {
      if (storageOptions.failWrites) throw new Error('quota');
      this.value = value;
    },
    removeItem: function() { this.removed = true; this.value = null; }
  };
  const context = {
    console: { log: function() {} },
    localStorage: storage,
    VizMagicConfig: { STORAGE_PREFIX: 'vm_test_' },
    CryptoUtils: {},
    viz: { auth: { wifToPublic: function() { return 'PUB'; }, wifIsValid: function() { return true; } }, api: {} }
  };
  runScript(context, 'app/js/blockchain/account.js');
  return { context, storage };
}

test('paid action proof requires one exact same-transaction award for each v2 action', function () {
  assert.ok(fs.existsSync(path.join(root, 'app/js/engine/action-proof.js')), 'action-proof module is missing');
  const context = { console, VizMagicConfig: {
    PAID_ACTIONS: { V2_ACTIVATION_BLOCK: 5000, TRAVEL_RECEIVER: 'treasury' },
    ACTION_TYPES: { HUNT: 'hunt', HUNT_ARMAGEDDON: 'hunt.armageddon', MOVE: 'move' }
  }, GameCreatures: { getCreature: function() { return { author: 'author' }; } } };
  runScript(context, 'app/js/engine/action-proof.js');
  const action = { type: 'hunt', version: 2, data: { creature: 'wisp', energy: 100 } };
  const awards = [{ initiator: 'alice', receiver: 'author', energy: 100, memo: 'viz://vm/hunt/v2/wisp/100', txIndex: 3 }];
  const verifier = context.ActionProof.createVerifier(awards, 6000);
  assert.strictEqual(verifier.verify('alice', 3, action).valid, true);
  assert.strictEqual(verifier.verify('alice', 3, action).valid, false, 'one award must not authorize two actions');
  assert.strictEqual(context.ActionProof.createVerifier(awards, 6000).verify('alice', 2, action).valid, false, 'payment from another transaction must fail');
  assert.strictEqual(context.ActionProof.createVerifier([{ initiator: 'alice', receiver: 'author', energy: 99, memo: awards[0].memo, txIndex: 3 }], 6000).verify('alice', 3, action).valid, false, 'wrong amount must fail');
  assert.strictEqual(context.ActionProof.createVerifier([], 4999).verify('alice', 1, { type: 'hunt', version: 1, data: { creature: 'wisp', energy: 100 } }).legacy, true, 'historical v1 action before activation must remain replayable without archived empty-memo award');
  assert.strictEqual(context.ActionProof.createVerifier([], 6000).verify('alice', 1, { type: 'hunt', version: 1, data: { creature: 'wisp', energy: 100 } }).valid, false, 'new unproved legacy action must fail after activation');
  assert.strictEqual(context.ActionProof.getRequirement({ type: 'hunt.armageddon', version: 2, data: { creature: 'wisp' } }), null, 'Armageddon must bind an exact owned stone id');
  assert.strictEqual(context.ActionProof.getRequirement({ type: 'move', version: 2, data: { zone: 'x', energy: 999 } }), null, 'travel must use an approved energy tier');
  assert.strictEqual(context.ActionProof.isPaidAction({ type: 'move', data: { zone: 'x', energy: 999 } }), true, 'malformed paid intent must fail closed rather than becoming a free action');
});

test('paid broadcast builders bind award and v2 action into one regular-auth transaction', function () {
  let sent = null;
  const context = {
    console,
    VizAccount: {
      getRegularKey: function() { return 'fixture-regular'; },
      getCurrentUser: function() { return 'alice'; },
      getAccountProtocol: function(account, protocol, callback) { callback(null, { custom_sequence_block_num: 44 }); }
    },
    viz: { broadcast: { send: function(transaction, keys, callback) { sent = transaction; callback(null, { block_num: 99 }); } } },
    GameCreatures: { getCreature: function() { return { author: 'creator' }; } }
  };
  vm.createContext(context);
  runScript(context, 'app/js/config.js');
  runScript(context, 'app/js/protocols/vm-protocol.js');
  runScript(context, 'app/js/engine/action-proof.js');
  runScript(context, 'app/js/blockchain/broadcast.js');

  let error = null;
  context.VizBroadcast.huntAction('ember_wisp', 'commons_first_light', 'firebolt', 100, 'creator', function(err) { error = err; });
  assert.ifError(error);
  assert.deepStrictEqual(Array.from(sent.operations, function(op) { return op[0]; }), ['award', 'custom']);
  assert.strictEqual(sent.operations[0][1].memo, 'viz://vm/hunt/v2/ember_wisp/100');
  const payload = JSON.parse(sent.operations[1][1].json);
  assert.strictEqual(payload.v, 2);
  assert.strictEqual(payload.d.energy, 100);

  sent = null;
  context.VizBroadcast.travelAction('veil_archipelago', 300, function(err) { error = err; });
  assert.ifError(error);
  assert.deepStrictEqual(Array.from(sent.operations, function(op) { return op[0]; }), ['award', 'custom']);
  assert.strictEqual(sent.operations[0][1].receiver, context.VizMagicConfig.PAID_ACTIONS.TRAVEL_RECEIVER);
});

test('historical operation shapes preserve sender, tx index, op index, and empty memos', function () {
  const context = {
    console,
    VizMagicConfig: { PROTOCOLS: { VM: 'VIZMAGIC', V: 'V', VE: 'VE' } },
    VMProtocol: { parseAction: function() { return null; } },
    VoiceProtocol: { parseMessage: function() { return null; }, parseEvent: function() { return null; } }
  };
  runScript(context, 'app/js/engine/block-processor.js');
  const processed = context.BlockProcessor.processBlock({
    block_id: 'old-block', previous: 'old-previous', timestamp: '2020-01-01T00:00:00', transactions: [{ operations: [
      { type: 'award_operation', value: { initiator: 'old-player', receiver: 'old-author', energy: 100, memo: '' } },
      { op_type: 'award', op_data: { initiator: 'old-player', receiver: 'old-author', energy: 300 } }
    ] }]
  }, 123);
  assert.strictEqual(processed.awards.length, 2);
  assert.strictEqual(processed.awards[0].memo, '');
  assert.strictEqual(processed.awards[0].txIndex, 0);
  assert.strictEqual(processed.awards[1].opIndex, 1);
});

test('VE protocol parses current append/edit/hide payloads as canonical state events', function () {
  const context = { console, VizMagicConfig: { PROTOCOLS: { VE: 'VE' } } };
  runScript(context, 'app/js/protocols/voice.js');
  const append = context.VoiceProtocol.parseEvent({ action: 'append', d: { item_ref: 'item-1', enchant: 'fire' } });
  const edit = context.VoiceProtocol.parseEvent({ action: 'edit', d: { item_ref: 'item-1', op: 'reforge' } });
  const hide = context.VoiceProtocol.parseEvent({ action: 'hide', d: { item_ref: 'item-1', op: 'consume' } });
  assert.strictEqual(append.eventType, 'enchant');
  assert.strictEqual(edit.eventType, 'reforge');
  assert.strictEqual(hide.eventType, 'consume');
  assert.strictEqual(append.data.item_ref, 'item-1');
});

test('deterministic travel and reforge outcomes repeat from identical chain evidence', function () {
  assert.ok(fs.existsSync(path.join(root, 'app/js/engine/deterministic-actions.js')), 'deterministic action module is missing');
  const context = { console };
  runScript(context, 'app/js/engine/deterministic-actions.js');
  const first = context.DeterministicActions.travelFind('prev-hash', 7001, 'alice', 'ember_wastes', 300);
  const second = context.DeterministicActions.travelFind('prev-hash', 7001, 'alice', 'ember_wastes', 300);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(context.DeterministicActions.reforgeStats({ pot: 4, res: 3, swf: 2, int: 1, for_: 0 }, 'prev-hash', 'alice', 'item-1'))),
    JSON.parse(JSON.stringify(context.DeterministicActions.reforgeStats({ pot: 4, res: 3, swf: 2, int: 1, for_: 0 }, 'prev-hash', 'alice', 'item-1')))
  );
});

test('SHARES account assets normalize to integer micro-SHARES and include received delegation', function () {
  const loaded = loadAccount(null);
  const account = {
    vesting_shares: '100.250000 SHARES',
    received_vesting_shares: '5.500000 SHARES',
    delegated_vesting_shares: '1.250000 SHARES'
  };
  assert.strictEqual(loaded.context.VizAccount.getEffectiveShares(account), 104500000);
});

test('core bonus is capped and remains a small optional bonus across no-stake and whale balances', function () {
  const context = { console, VizMagicConfig: {} };
  runScript(context, 'app/js/engine/formulas.js');
  assert.strictEqual(context.GameFormulas.coreBonusFromShares(0), 0);
  assert.ok(context.GameFormulas.coreBonusFromShares(1000000) > 0, 'one liquid SHARES should produce a visible but small bonus');
  assert.ok(context.GameFormulas.coreBonusFromShares(1000000000000000) <= 5, 'whale bonus must be strictly small and capped');
});

test('progression remains coherent above level 60 without an artificial upper cap', function () {
  const context = loadProgression();
  const xpFor105 = context.GameFormulas.totalXpForLevel(105, 2);
  const character = context.CharacterSystem.createCharacter('alice', 'Alice', 'embercaster', 1000);
  context.CharacterSystem.addXp(character, xpFor105, 1001);
  assert.strictEqual(character.level, 105);
  assert.strictEqual(context.GameFormulas.levelFromXp(xpFor105, 2), 105);
});

test('untrusted grimoire metadata cannot self-assert progression but an explicit legacy import remains available', function () {
  const context = loadProgression();
  const forged = { level: 99, xp: 999999999, progression_version: 2 };
  const normal = context.CharacterSystem.createCharacter('alice', 'Alice', 'embercaster', 1000);
  const imported = context.CharacterSystem.createCharacter('legacy', 'Legacy', 'embercaster', 1000);
  context.CharacterSystem.restoreProgression(normal, forged);
  context.CharacterSystem.restoreProgression(imported, forged, { authoritativeLegacyCheckpoint: true });
  assert.strictEqual(normal.level, 1, 'self-asserted metadata must not grant level');
  assert.strictEqual(normal.xp, 0, 'self-asserted metadata must not grant XP');
  assert.strictEqual(normal.progressionSource, 'metadata-unverified');
  assert.strictEqual(imported.level, 99, 'explicit legacy checkpoint migration must preserve legitimate progress');
});

test('old checkpoint schemas are normalized instead of silently discarding character progress', function () {
  const oldState = { checkpointSchemaVersion: 1, headBlock: 44, characters: { alice: { name: 'Alice', level: 12, xp: 12345 } } };
  const context = {
    console: { log: function() {} },
    VizMagicConfig: { ACTION_TYPES: {}, HP_REGEN: { HP_REGEN_RATE: 500, HP_REGEN_CAP_PCT: 30 } },
    CheckpointSystem: {
      init: function(cb) { cb(null); },
      loadLatestCheckpoint: function(_scope, cb) { cb(null, { state: oldState }); }
    }
  };
  runScript(context, 'app/js/engine/state-engine.js');
  let loaded;
  context.StateEngine.init(function(_err, state) { loaded = state; });
  assert.strictEqual(loaded.characters.alice.level, 12);
  assert.strictEqual(loaded.headBlock, 44);
  assert.strictEqual(loaded.characters.alice.progressionSource, 'legacy-checkpoint');
});

test('legacy active key migrates to memory only while regular-key login remains persisted', function () {
  const loaded = loadAccount({ currentUser: 'alice', users: { alice: { regular_key: 'REGULAR_SECRET', active_key: 'ACTIVE_SECRET' } } });
  loaded.context.VizAccount.init();
  const persisted = JSON.parse(loaded.storage.value);
  assert.strictEqual(loaded.context.VizAccount.getRegularKey(), 'REGULAR_SECRET');
  assert.strictEqual(loaded.context.VizAccount.getActiveKey(), 'ACTIVE_SECRET', 'migration should keep the active key usable in the current page');
  assert.strictEqual(persisted.users.alice.regular_key, 'REGULAR_SECRET');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(persisted.users.alice, 'active_key'), false, 'old persistence is not consent');
  assert.strictEqual(loaded.context.VizAccount.isActiveKeyPersistenceEnabled(), false);
});

test('active-key persistence migration fails closed when storage rewrite fails', function () {
  const loaded = loadAccount({ currentUser: 'alice', users: { alice: { regular_key: 'REGULAR_SECRET', active_key: 'ACTIVE_SECRET' } } }, { failWrites: true });
  loaded.context.VizAccount.init();
  assert.strictEqual(loaded.storage.removed, true, 'unsafe legacy session must be removed if it cannot be sanitized');
  assert.strictEqual(loaded.context.VizAccount.getActiveKey(), 'ACTIVE_SECRET', 'current-page use remains available in memory');
});

test('active-key opt-in, opt-out, reload, and migration are explicit and idempotent', function () {
  const migrated = loadAccount({ currentUser: 'alice', users: { alice: { regular_key: 'regular', active_key: 'legacy-active' } } });
  migrated.context.VizAccount.init();
  const once = migrated.storage.value;
  migrated.context.VizAccount.init();
  assert.strictEqual(migrated.storage.value, once, 'a second migration must not rewrite or re-consent');
  const afterReload = loadAccount(JSON.parse(once));
  afterReload.context.VizAccount.init();
  assert.strictEqual(afterReload.context.VizAccount.getRegularKey(), 'regular');
  assert.ok(!afterReload.context.VizAccount.getActiveKey(), 'legacy active key must not return after reload');

  const loaded = loadAccount(null);
  loaded.context.viz.api.getAccounts = function(_accounts, callback) {
    callback(null, [{
      vesting_shares: '0.000000 SHARES', received_vesting_shares: '0.000000 SHARES', delegated_vesting_shares: '0.000000 SHARES',
      regular_authority: { weight_threshold: 1, key_auths: [['PUB', 1]] }, active_authority: { weight_threshold: 1, key_auths: [['PUB', 1]] }
    }]);
  };
  let error = null;
  loaded.context.VizAccount.login('alice', 'regular', function(err) { error = err; });
  assert.ifError(error);
  loaded.context.VizAccount.saveActiveKey('active', true, function(err) { error = err; });
  assert.ifError(error);
  let persisted = JSON.parse(loaded.storage.value);
  assert.strictEqual(persisted.users.alice.active_key, 'active');
  assert.strictEqual(persisted.users.alice.active_key_persist, true);
  loaded.context.VizAccount.clearActiveKey();
  loaded.context.VizAccount.saveActiveKey('session-only', false, function(err) { error = err; });
  assert.ifError(error);
  persisted = JSON.parse(loaded.storage.value);
  assert.strictEqual(persisted.users.alice.active_key, undefined);
  assert.strictEqual(loaded.context.VizAccount.getActiveKey(), 'session-only');
});

test('active-key consent and map support copy are explicit and honest', function () {
  const guild = read('app/js/ui/screens/guild.js');
  const ru = read('app/js/i18n/ru.js');
  const en = read('app/js/i18n/en.js');
  assert.ok(/type="checkbox"[^>]*id="guild-active-key-persist"/.test(guild));
  assert.ok(/Сохранить - небезопасно/.test(ru), 'exact Russian unchecked opt-in label is required');
  assert.ok(/добровольн/i.test(ru), 'Russian map copy must explain voluntary world support');
  assert.ok(/voluntary/i.test(en), 'English map copy must explain voluntary world support');
  assert.ok(!/SHARES[^\n]{0,120}(быстр|faster)[^\n]{0,60}(энерг|energy|mana)/i.test(ru + '\n' + en), 'SHARES copy must not promise faster energy regeneration');
  assert.ok(!/Viewing takes 10% of your life energy|Просмотр отнимает 10% жизненной энергии/.test(ru + en), 'map copy must not frame public art as a paid JPEG view');
});

test('repository exposes one real npm test gate', function() {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts && pkg.scripts.test && !/no test specified/.test(pkg.scripts.test));
  assert.ok(/audit-remediation\.test\.js/.test(pkg.scripts.test));
});

test('remediation bundles publish through a fresh service-worker cache', function() {
  assert.ok(/var CACHE_NAME = 'viz-magic-v220'/.test(read('app/sw.js')));
  assert.ok(read('app/index.html').includes('20260905'));
});

if (process.exitCode) process.exit(process.exitCode);
