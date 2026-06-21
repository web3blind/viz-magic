const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function test(name, fn) {
  try {
    fn();
    console.log('PASS ' + name);
  } catch (err) {
    console.error('FAIL ' + name + ': ' + err.message);
    process.exitCode = 1;
  }
}

function loadQuestSystem() {
  const context = { console, VizMagicConfig: {} };
  vm.createContext(context);
  vm.runInContext(read('app/js/data/quests.js'), context, { filename: 'quests.js' });
  vm.runInContext(read('app/js/engine/quest-system.js'), context, { filename: 'quest-system.js' });
  return context;
}

const appJs = read('app/js/ui/app.js');
const toastJs = read('app/js/ui/components/toast.js');
const craftingJs = read('app/js/ui/screens/crafting.js');
const inventoryJs = read('app/js/ui/screens/inventory.js');
const huntJs = read('app/js/ui/screens/hunt.js');
const mapJs = read('app/js/ui/screens/map.js');
const chronicleJs = read('app/js/ui/screens/chronicle.js');
const guildJs = read('app/js/ui/screens/guild.js');
const leaderboardJs = read('app/js/ui/screens/leaderboard.js');
const characterJs = read('app/js/ui/screens/character.js');
const stateEngineJs = read('app/js/engine/state-engine.js');
const questsJs = read('app/js/data/quests.js');
const ruJs = read('app/js/i18n/ru.js');
const enJs = read('app/js/i18n/en.js');

test('blessing quest requires different receivers', function () {
  const context = loadQuestSystem();
  const playerQuests = {
    active: [{
      id: 'q_blessings',
      objectives: [{ type: 'social', target: 'blessing', required: 2, current: 0, uniqueTarget: true }]
    }],
    completed: []
  };

  context.QuestSystem.updateQuestProgress(playerQuests, 'social', { target: 'blessing', uniqueKey: 'alice', count: 1 });
  context.QuestSystem.updateQuestProgress(playerQuests, 'social', { target: 'blessing', uniqueKey: 'alice', count: 1 });
  assert.strictEqual(playerQuests.active[0].objectives[0].current, 1, 'same receiver should not count twice');

  context.QuestSystem.updateQuestProgress(playerQuests, 'social', { target: 'blessing', uniqueKey: 'bob', count: 1 });
  assert.strictEqual(playerQuests.active[0].objectives[0].current, 2, 'different receiver should count');
  assert.strictEqual(playerQuests.active[0].completed, true, 'quest should complete after required unique receivers');
});

test('accepted quests preserve unique-target metadata', function () {
  const context = loadQuestSystem();
  const questState = { active: [], completed: [] };
  const questTemplate = {
    id: 'unique_explore',
    type: 'explore',
    minLevel: 1,
    objectives: [{ type: 'explore', required: 2, uniqueTarget: true }]
  };
  const accepted = context.QuestSystem.acceptQuest(questTemplate, { level: 3 }, questState, 10);
  assert.strictEqual(accepted.success, true, 'quest should be accepted');
  assert.strictEqual(questState.active[0].objectives[0].uniqueTarget, true, 'uniqueTarget should be copied to active quest objective');
  assert.ok(Array.isArray(questState.active[0].objectives[0].seenTargets), 'seenTargets should be an array');
  assert.strictEqual(questState.active[0].objectives[0].seenTargets.length, 0, 'seenTargets should start empty');
});

test('quest data marks blessing and explore objectives as unique-target tasks', function () {
  assert.ok(/q_blessings[\s\S]*target: 'blessing', required: 5, uniqueTarget: true/.test(questsJs), 'blessing quest must require unique targets');
  assert.ok(/q_visit_regions[\s\S]*type: 'explore', required: 3, uniqueTarget: true/.test(questsJs), 'visit regions quest must require unique regions');
  assert.ok(/QuestSystem\.updateQuestProgress\(worldState\.quests\[award\.initiator\], 'social', \{ target: 'blessing', uniqueKey: award\.receiver/.test(stateEngineJs), 'blessing progress must key by receiver');
  assert.ok(/QuestSystem\.updateQuestProgress\(worldState\.quests\[sender\], 'explore', \{ target: data\.zone, uniqueKey: data\.zone/.test(stateEngineJs), 'explore progress must key by region');
});

test('connection degradation toasts are keyed to prevent duplicate storms', function () {
  assert.ok(/var activeKeys = \{\}/.test(toastJs), 'Toast should track active keyed toasts');
  assert.ok(/options\.key/.test(toastJs), 'Toast.show should accept key option');
  assert.ok(/key: 'conn_disconnected'/.test(appJs), 'disconnect toast should be keyed');
  assert.ok(/key: 'conn_history_limited'/.test(appJs), 'history-limited toast should be keyed');
});

test('consumable and crafting messages explain concrete effects and requirements', function () {
  assert.ok(/function _consumeSuccessMessage/.test(craftingJs), 'consumable success helper missing');
  assert.ok(/consume_success_hp/.test(craftingJs + ruJs + enJs), 'HP consumable message should exist');
  assert.ok(/consume_success_mana/.test(craftingJs + ruJs + enJs), 'Mana consumable message should exist');
  assert.ok(/craft_required_mana/.test(craftingJs + ruJs + enJs), 'crafting mana requirement copy missing');
  assert.ok(/Helpers\.bpToPercent\(recipe\.manaCost/.test(craftingJs), 'recipe cards should show mana cost when mana blocks crafting');
});

test('inventory rows show textual rarity beside item names', function () {
  assert.ok(/var rarityName = t\('rarity_' \+ rInfo\.name\)/.test(inventoryJs), 'inventory should translate rarity name');
  assert.ok(/Helpers\.escapeHtml\(label\) \+ ' \(' \+ Helpers\.escapeHtml\(rarityName\)/.test(inventoryJs), 'inventory item name should include textual rarity');
});

test('hunt and map UX fixes prevent known loops and confusing copy', function () {
  assert.ok(/ch\.currentZone = 'commons_first_light'/.test(huntJs), 'return-to-commons should locally restore a huntable zone');
  assert.ok(/function _filterCreaturesForLevel/.test(huntJs), 'hunt should filter creatures by player level');
  assert.ok(/c\.maxLevel[^\n]+>= level/.test(huntJs), 'hunt should reject creatures below current player level');
  assert.ok(/hunt_returned_to_commons/.test(huntJs + ruJs + enJs), 'return-to-commons status copy missing');
  assert.ok(/regionIds\.sort/.test(mapJs), 'map should sort regions by level');
  assert.ok(/Armageddon Stone is consumed on launch/.test(enJs), 'Armageddon copy should not duplicate stone requirement');
  assert.ok(/Камень Армагеддона расходуется/.test(ruJs), 'Russian Armageddon copy should not duplicate stone requirement');
  assert.ok(/Thornvine/.test(ruJs + enJs), 'Armageddon copy should mention where to find the stone');
});

test('chronicle keeps loaded tabs visible and shows sent blessings immediately', function () {
  assert.ok(/var cachedFeedHtml = \{\}/.test(chronicleJs), 'chronicle should cache rendered tab HTML');
  assert.ok(/cachedFeedHtml\[currentTab\]/.test(chronicleJs), 'chronicle should reuse loaded tab HTML before async refresh');
  assert.ok(/function _injectLocalBlessing/.test(chronicleJs), 'chronicle should add local blessing feedback after broadcast success');
  assert.ok(/_injectLocalBlessing\(account, energy\)/.test(chronicleJs), 'blessing success path should inject visible local action');
});

test('guild joining explains and enforces preparation requirements', function () {
  assert.ok(/var GUILD_JOIN_MIN_LEVEL = 4/.test(guildJs), 'guild join level gate should be explicit');
  assert.ok(/guild_join_requirements/.test(guildJs), 'guild screen should explain join requirements');
  assert.ok(/guild_join_requirements:\s*'[^']*\{level\}/.test(enJs), 'English guild join requirements copy missing');
  assert.ok(/guild_join_requirements:\s*'[^']*\{level\}/.test(ruJs), 'Russian guild join requirements copy missing');
  assert.ok(/guild_join_locked/.test(guildJs), 'locked join button key missing');
  assert.ok(/guild_join_locked:\s*'[^']*\{level\}/.test(enJs), 'English locked join button copy missing');
  assert.ok(/guild_join_locked:\s*'[^']*\{level\}/.test(ruJs), 'Russian locked join button copy missing');
  assert.ok(/character\.level < GUILD_JOIN_MIN_LEVEL/.test(guildJs), 'join handler should guard low-level direct clicks');
});

test('archive-backed guilds normalize missing optional arrays and rerender visible screen', function () {
  assert.ok(/function _normalizeGuild/.test(guildJs), 'guild screen should normalize archive guild payloads');
  assert.ok(/guild\.wars = guild\.wars \|\| \[\]/.test(guildJs), 'archive guilds should get default wars array');
  assert.ok(/guild\.quests = guild\.quests \|\| \[\]/.test(guildJs), 'archive guilds should get default quests array');
  assert.ok(/guild\.announcements = guild\.announcements \|\| \[\]/.test(guildJs), 'archive guilds should get default announcements array');
  assert.ok(/function _isScreenVisible/.test(guildJs), 'guild screen should have an aria-hidden visibility helper');
  assert.ok(/getAttribute\('aria-hidden'\) !== 'true'/.test(guildJs), 'aria-hidden="false" should count as visible');
});

test('high-traffic UI narration and inventory stat labels are translated', function () {
  ['char_level_up', 'stat_pot', 'stat_res', 'stat_swf', 'stat_int', 'stat_for', 'duel_narrator_pre', 'duel_narrator_seal', 'duel_narrator_sealed', 'duel_narrator_waiting', 'duel_narrator_reveal'].forEach(function (key) {
    assert.ok(enJs.indexOf(key + ':') !== -1, 'English translation missing: ' + key);
    assert.ok(ruJs.indexOf(key + ':') !== -1, 'Russian translation missing: ' + key);
  });
});

test('leaderboard has local character fallback while 24h scan is empty or slow', function () {
  assert.ok(/function _fallbackRowsFromState/.test(leaderboardJs), 'leaderboard should expose local fallback rows');
  assert.ok(/rows = _fallbackRowsFromState\(\)/.test(leaderboardJs), 'leaderboard should use fallback when snapshot rows are empty');
  assert.ok(/state\.characters/.test(leaderboardJs), 'leaderboard fallback should read current state characters');
});

test('character screen explains how stats can grow', function () {
  assert.ok(/char_stats_growth_hint/.test(characterJs + ruJs + enJs), 'character screen should include stats growth guidance');
  assert.ok(/экипиров/.test(ruJs), 'Russian stats guidance should mention equipment');
  assert.ok(/enchantments/.test(enJs), 'English stats guidance should mention enchantments');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
