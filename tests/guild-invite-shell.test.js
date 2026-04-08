const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function loadScript(ctx, relativePath) {
  const code = fs.readFileSync(path.join(root, relativePath), 'utf8');
  vm.runInContext(code, ctx, { filename: relativePath });
}

const context = vm.createContext({
  console,
  Date,
  Math,
  setTimeout,
  clearTimeout,
  VizMagicConfig: null,
  GuildSystem: null,
  ActionValidator: null,
  CheckpointSystem: {
    init(callback) { callback(null); },
    loadLatestCheckpoint(account, callback) { callback(null, null); },
    saveCheckpoint(account, block, state, callback) { callback(null); }
  },
  QuestSystem: undefined,
  TerritorySystem: undefined,
  CharacterSystem: undefined,
  InventorySystem: undefined,
  MarketplaceSystem: undefined,
  LociSystem: undefined,
  WorldBossSystem: undefined,
  SocialSystem: undefined,
  DuelStateManager: undefined
});
context.window = context;

loadScript(context, 'app/js/config.js');
loadScript(context, 'app/js/engine/guild.js');
loadScript(context, 'app/js/engine/validator.js');
loadScript(context, 'app/js/engine/state-engine.js');

const AT = context.VizMagicConfig.ACTION_TYPES;
const StateEngine = context.StateEngine;

function processAction(sender, type, data, blockNum) {
  return StateEngine.processBlock({
    vmActions: [{ sender, action: { type, data: data || {} } }],
    voicePosts: [],
    veEvents: [],
    awards: [],
    blockHash: 'block-' + blockNum,
    blockNum,
    timestamp: ''
  });
}

const inviteEvents = processAction('guildleader', AT.GUILD_INVITE, {
  guild_id: 'ancients',
  target: 'targetmage'
}, 101);

const stateAfterInvite = StateEngine.getState();
assert.strictEqual(inviteEvents.length, 1, 'invite event should be emitted');
assert.ok(stateAfterInvite.guilds.ancients, 'placeholder guild should be materialized');
assert.strictEqual(stateAfterInvite.guilds.ancients.isPlaceholder, true, 'guild should be marked as placeholder');
assert.ok(stateAfterInvite.guilds.ancients.invites.targetmage, 'target invite should be stored');
assert.ok(stateAfterInvite.guilds.ancients.members.guildleader, 'inviter should be added as placeholder founder');

const joinEvents = processAction('targetmage', AT.GUILD_ACCEPT, {
  guild_id: 'ancients'
}, 102);

const stateAfterJoin = StateEngine.getState();
assert.strictEqual(joinEvents.length, 1, 'join event should be emitted');
assert.ok(stateAfterJoin.guilds.ancients.members.targetmage, 'target should be able to join placeholder guild');
assert.strictEqual(stateAfterJoin.guilds.ancients.invites.targetmage, undefined, 'invite should be consumed on join');

console.log('guild invite shell flow: ok');
