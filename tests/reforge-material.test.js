'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let failures = 0;

function load(context, rel) {
  const code = fs.readFileSync(path.join(root, rel), 'utf8');
  vm.runInNewContext(code, context, { filename: rel });
}

function test(name, fn) {
  try {
    fn();
    console.log('PASS ' + name);
  } catch (error) {
    failures++;
    console.error('FAIL ' + name + ': ' + error.message);
  }
}

function makeContext(checkpointRef) {
  checkpointRef = checkpointRef || { state: null };
  const context = {
    console: { log: function() {}, error: console.error },
    VizMagicConfig: {
      PROTOCOLS: { VM: 'VM', VE: 'VE', V: 'V' },
      ACTION_TYPES: { CRAFT: 'craft' },
      ENERGY: { MAX: 10000 },
      RARITY: { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 },
      HP_REGEN: { HP_REGEN_RATE: 100, HP_REGEN_CAP_PCT: 30 },
      VE_ACTIONS: {
        V2_ACTIVATION_BLOCK: 83500000,
        REFORGE_MATERIAL_TYPE: 'fire_dust',
        REFORGE_MATERIAL_QUANTITY: 2,
        MANA_POTION_ITEM_TYPE: 'mana_potion'
      },
      LIBRARY: {}
    },
    CheckpointSystem: {
      init: function(callback) { callback(null); },
      loadLatestCheckpoint: function(_scope, callback) {
        callback(null, checkpointRef.state ? { state: JSON.parse(JSON.stringify(checkpointRef.state)) } : null);
      },
      saveCheckpoint: function(_scope, _blockNum, state, callback) {
        checkpointRef.state = JSON.parse(JSON.stringify(state));
        callback(null);
      }
    },
    ActionValidator: { validate: function() { return { valid: true }; } },
    VizBroadcast: { custom: function() { throw new Error('broadcast is forbidden in tests'); } }
  };
  [
    'app/js/engine/items.js',
    'app/js/data/creatures.js',
    'app/js/data/recipes.js',
    'app/js/engine/crafting.js',
    'app/js/engine/enchanting.js',
    'app/js/engine/deterministic-actions.js',
    'app/js/protocols/voice.js',
    'app/js/engine/block-processor.js',
    'app/js/protocols/market-protocol.js',
    'app/js/engine/state-engine.js'
  ].forEach(function(file) { load(context, file); });
  context.GameRecipes.registerCraftedTemplates();
  context.StateEngine.init(function(error) { assert.ifError(error); });
  return context;
}

function addCharacter(context, account) {
  const state = context.StateEngine.getState();
  state.characters[account] = {
    account: account,
    name: account,
    className: 'embercaster',
    level: 10,
    mana: 10000,
    hp: 100,
    maxHp: 100,
    stats: { int: 3 },
    equipment: {}
  };
  state.inventories[account] = [];
  return state;
}

function item(context, type, owner, id, blockNum) {
  const value = context.ItemSystem.createItem(type, owner, 1, blockNum || 10, '', false);
  value.id = id;
  return value;
}

function rawBlock(context, blockNum, actions, label) {
  return {
    block_id: 'block-' + label,
    previous: 'entropy-' + label,
    timestamp: '2026-09-06T08:00:00',
    transactions: [{
      operations: actions.map(function(action) {
        return ['custom', {
          id: context.VizMagicConfig.PROTOCOLS.VE,
          required_regular_auths: ['alice'],
          json: JSON.stringify(action)
        }];
      })
    }]
  };
}

function processActions(context, blockNum, actions, label) {
  const processed = context.BlockProcessor.processBlock(rawBlock(context, blockNum, actions, label), blockNum);
  return context.StateEngine.processBlock(processed, { advanceHead: false, runMaintenance: false });
}

function setupReforge(context, suffix) {
  const state = addCharacter(context, 'alice');
  const target = item(context, 'oak_wand', 'alice', 'wand-' + suffix, 20);
  const dustOne = item(context, 'fire_dust', 'alice', 'dust-' + suffix + '-1', 21);
  const dustTwo = item(context, 'fire_dust', 'alice', 'dust-' + suffix + '-2', 22);
  state.inventories.alice.push(target, dustOne, dustTwo);
  return { state, target, dustOne, dustTwo };
}

test('reforge v2 payload binds exactly two existing Fire Dust item identities', function() {
  const context = makeContext();
  const action = context.MarketProtocol.createReforgeAction('wand-1', ['dust-1', 'dust-2']);
  assert.strictEqual(action.v, 2);
  assert.deepStrictEqual(Array.from(action.d.material_refs), ['dust-1', 'dust-2']);
  assert.strictEqual(action.d.item_ref, 'wand-1');
});

test('Fire Dust is an obtainable starter drop already used by real recipes', function() {
  const context = makeContext();
  const emberWisp = context.GameCreatures.getCreature('ember_wisp');
  const fireDustDrop = emberWisp.lootTable.filter(function(drop) { return drop.itemType === 'fire_dust'; })[0];
  assert.ok(fireDustDrop && fireDustDrop.dropRate === 400, 'Fire Dust must remain a 40% starter-creature drop');
  const recipes = context.GameRecipes.getAll();
  assert.ok(Object.keys(recipes).some(function(id) {
    return recipes[id].materials.some(function(material) { return material.type === 'fire_dust'; });
  }), 'Fire Dust must remain part of the established recipe economy');
});

test('legacy reforge remains valid before activation and old-format free reforge closes at activation', function() {
  const before = makeContext();
  const legacySetup = setupReforge(before, 'legacy');
  const legacyAction = { protocol: 'VE', action: 'edit', d: { item_ref: legacySetup.target.id, op: 'reforge' } };
  const legacyEvents = processActions(before, before.VizMagicConfig.VE_ACTIONS.V2_ACTIVATION_BLOCK - 1, [legacyAction], 'legacy');
  assert.strictEqual(legacyEvents.filter(function(event) { return event.type === 've_reforge'; }).length, 1);
  assert.strictEqual(legacySetup.dustOne.consumed, undefined);
  assert.strictEqual(legacySetup.dustTwo.consumed, undefined);

  const current = makeContext();
  const currentSetup = setupReforge(current, 'current-free');
  const currentAction = { protocol: 'VE', action: 'edit', d: { item_ref: currentSetup.target.id, op: 'reforge' } };
  const currentEvents = processActions(current, current.VizMagicConfig.VE_ACTIONS.V2_ACTIVATION_BLOCK, [currentAction], 'current-free');
  assert.strictEqual(currentEvents.length, 0);
  assert.strictEqual(currentSetup.dustOne.consumed, undefined);
  assert.strictEqual(currentSetup.dustTwo.consumed, undefined);
});

test('valid reforge consumes exact owned materials once and survives checkpoint replay', function() {
  const checkpoint = { state: null };
  let context = makeContext(checkpoint);
  let setup = setupReforge(context, 'valid');
  const blockNum = context.VizMagicConfig.VE_ACTIONS.V2_ACTIVATION_BLOCK;
  let action = context.MarketProtocol.createReforgeAction(setup.target.id, [setup.dustOne.id, setup.dustTwo.id]);
  const events = processActions(context, blockNum, [action], 'valid');
  assert.strictEqual(events.filter(function(event) { return event.type === 've_reforge'; }).length, 1);
  assert.strictEqual(setup.dustOne.consumed, true);
  assert.strictEqual(setup.dustTwo.consumed, true);
  assert.deepStrictEqual(Array.from(events[0].result.consumedIds), [setup.dustOne.id, setup.dustTwo.id]);
  const afterFirst = JSON.stringify(context.StateEngine.getState());
  assert.strictEqual(processActions(context, blockNum, [action], 'valid').length, 0);
  assert.strictEqual(JSON.stringify(context.StateEngine.getState()), afterFirst);

  context.StateEngine.saveCheckpoint(function(error) { assert.ifError(error); });
  context = makeContext(checkpoint);
  action = context.MarketProtocol.createReforgeAction('wand-valid', ['dust-valid-1', 'dust-valid-2']);
  assert.strictEqual(processActions(context, blockNum, [action], 'valid').length, 0);
  const reloaded = context.StateEngine.getState();
  const original = JSON.parse(afterFirst);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(reloaded.inventories)), original.inventories);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(reloaded.actionOutcomes)), original.actionOutcomes);
});

test('reforge rejects missing, duplicate, wrong-type and wrong-owner material identities without mutation', function() {
  const variants = [
    { name: 'empty', refs: function() { return []; } },
    { name: 'one', refs: function(s) { return [s.dustOne.id]; } },
    { name: 'duplicate', refs: function(s) { return [s.dustOne.id, s.dustOne.id]; } },
    { name: 'wrong-type', mutate: function(c, s) { s.dustTwo.type = 'shadow_shard'; }, refs: function(s) { return [s.dustOne.id, s.dustTwo.id]; } },
    { name: 'wrong-owner', mutate: function(c, s) { s.dustTwo.owner = 'bob'; }, refs: function(s) { return [s.dustOne.id, s.dustTwo.id]; } }
  ];
  variants.forEach(function(variant, index) {
    const context = makeContext();
    const setup = setupReforge(context, variant.name);
    if (variant.mutate) variant.mutate(context, setup);
    const before = JSON.stringify(context.StateEngine.getInventory('alice'));
    const action = context.MarketProtocol.createReforgeAction(setup.target.id, variant.refs(setup));
    const events = processActions(context, context.VizMagicConfig.VE_ACTIONS.V2_ACTIVATION_BLOCK + index, [action], variant.name);
    assert.strictEqual(events.length, 0, variant.name);
    assert.strictEqual(JSON.stringify(context.StateEngine.getInventory('alice')), before, variant.name);
  });
});

test('two reforges cannot share the same exact material items', function() {
  const context = makeContext();
  const setup = setupReforge(context, 'shared');
  const secondTarget = item(context, 'oak_wand', 'alice', 'wand-shared-2', 23);
  setup.state.inventories.alice.push(secondTarget);
  const refs = [setup.dustOne.id, setup.dustTwo.id];
  const actions = [
    context.MarketProtocol.createReforgeAction(setup.target.id, refs),
    context.MarketProtocol.createReforgeAction(secondTarget.id, refs)
  ];
  const events = processActions(context, context.VizMagicConfig.VE_ACTIONS.V2_ACTIVATION_BLOCK + 10, actions, 'shared');
  assert.strictEqual(events.filter(function(event) { return event.type === 've_reforge'; }).length, 1);
  assert.strictEqual(events[0].itemId, setup.target.id);
  assert.strictEqual(setup.dustOne.consumed, true);
  assert.strictEqual(setup.dustTwo.consumed, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(secondTarget.stats)), { pot: 3, res: 0, swf: 0, int: 1, for_: 0 });
});

test('reforge stats are deterministic across fresh replay', function() {
  function replay() {
    const context = makeContext();
    const setup = setupReforge(context, 'deterministic');
    const action = context.MarketProtocol.createReforgeAction(setup.target.id, [setup.dustOne.id, setup.dustTwo.id]);
    const events = processActions(context, context.VizMagicConfig.VE_ACTIONS.V2_ACTIVATION_BLOCK + 20, [action], 'deterministic');
    return JSON.stringify({ item: setup.target, event: events[0] });
  }
  assert.strictEqual(replay(), replay());
});

test('mana potion stays owned and unusable after activation while legitimate old replay remains valid', function() {
  const current = makeContext();
  let state = addCharacter(current, 'alice');
  let potion = item(current, 'mana_potion', 'alice', 'potion-current', 30);
  state.inventories.alice.push(potion);
  let consume = current.MarketProtocol.createConsumeAction(potion.id);
  let events = processActions(current, current.VizMagicConfig.VE_ACTIONS.V2_ACTIVATION_BLOCK, [consume], 'potion-current');
  assert.strictEqual(events.length, 0);
  assert.notStrictEqual(potion.consumed, true);

  const legacy = makeContext();
  state = addCharacter(legacy, 'alice');
  potion = item(legacy, 'mana_potion', 'alice', 'potion-legacy', 30);
  state.inventories.alice.push(potion);
  consume = legacy.MarketProtocol.createConsumeAction(potion.id);
  events = processActions(legacy, legacy.VizMagicConfig.VE_ACTIONS.V2_ACTIVATION_BLOCK - 1, [consume], 'potion-legacy');
  assert.strictEqual(events.filter(function(event) { return event.type === 've_consume'; }).length, 1);
  assert.strictEqual(potion.consumed, true);
});

test('mana potion is absent from new recipe offers without deleting historical recipe data', function() {
  const context = makeContext();
  const state = addCharacter(context, 'alice');
  const offered = context.CraftingSystem.getAvailableRecipes(state.characters.alice, state.inventories.alice, '');
  assert.ok(context.GameRecipes.getRecipe('mana_potion'), 'historical recipe must remain readable for replay');
  assert.strictEqual(offered.some(function(entry) { return entry.recipe.id === 'mana_potion'; }), false);
});

test('old mana potion craft history replays but new old-format craft is rejected at activation', function() {
  function craftAt(blockNum, suffix) {
    const context = makeContext();
    const state = addCharacter(context, 'alice');
    const materials = [
      item(context, 'sparkdust', 'alice', 'spark-' + suffix + '-1', 31),
      item(context, 'sparkdust', 'alice', 'spark-' + suffix + '-2', 32),
      item(context, 'chronicle_ink', 'alice', 'ink-' + suffix, 33)
    ];
    state.inventories.alice.push.apply(state.inventories.alice, materials);
    const processed = {
      blockNum: blockNum,
      blockHash: 'craft-' + suffix,
      huntEntropy: 'craft-entropy-' + suffix,
      timestamp: '2026-09-06T08:00:00',
      awards: [], veEvents: [], voicePosts: [],
      vmActions: [{
        sender: 'alice', txIndex: 0, opIndex: 0, blockNum: blockNum,
        action: { type: 'craft', version: 1, data: { recipe: 'mana_potion', materials: materials.map(function(value) { return value.id; }), location: '' } }
      }]
    };
    return { events: context.StateEngine.processBlock(processed, { advanceHead: false, runMaintenance: false }), inventory: state.inventories.alice };
  }

  const activation = 83500000;
  const legacy = craftAt(activation - 1, 'legacy-craft');
  assert.strictEqual(legacy.events.filter(function(event) { return event.type === 'item_crafted' && event.itemType === 'mana_potion'; }).length, 1);
  const current = craftAt(activation, 'current-craft');
  assert.strictEqual(current.events.length, 0);
  assert.strictEqual(current.inventory.some(function(value) { return value.type === 'mana_potion'; }), false);
  assert.strictEqual(current.inventory.some(function(value) { return value.consumed; }), false);
});

if (failures) process.exitCode = 1;
