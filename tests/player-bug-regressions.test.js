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

function loadMarketplaceStateEngine() {
  const context = {
    console,
    ActionValidator: {
      validate: function () { return { valid: true }; }
    }
  };
  vm.createContext(context);
  vm.runInContext(read('app/js/config.js'), context, { filename: 'config.js' });
  vm.runInContext(read('app/js/engine/marketplace.js'), context, { filename: 'marketplace.js' });
  vm.runInContext(read('app/js/engine/state-engine.js'), context, { filename: 'state-engine.js' });
  return context;
}

const appJs = read('app/js/ui/app.js');
const toastJs = read('app/js/ui/components/toast.js');
const craftingJs = read('app/js/ui/screens/crafting.js');
const inventoryJs = read('app/js/ui/screens/inventory.js');
const huntJs = read('app/js/ui/screens/hunt.js');
const mapJs = read('app/js/ui/screens/map.js');
const chronicleJs = read('app/js/ui/screens/chronicle.js');
const mapScreenJs = read('app/js/ui/screens/map.js');
const questScreenJs = read('app/js/ui/screens/quests.js');
const guildJs = read('app/js/ui/screens/guild.js');
const leaderboardJs = read('app/js/ui/screens/leaderboard.js');
const characterJs = read('app/js/ui/screens/character.js');
const marketplaceJs = read('app/js/ui/screens/marketplace.js');
const stateEngineJs = read('app/js/engine/state-engine.js');
const questsJs = read('app/js/data/quests.js');
const indexHtml = read('app/index.html');
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

test('crafting live UI routes through state-engine and checkpoints result', function () {
  assert.ok(/function processCraftResult/.test(stateEngineJs), 'state engine should expose live craft path');
  assert.ok(/processCraftResult: processCraftResult/.test(stateEngineJs), 'live craft path should be exported');
  assert.ok(/StateEngine\.processCraftResult\(user, selectedRecipe, materialIds, character\.currentZone \|\| '', blockHash, blockNum\)/.test(craftingJs), 'crafting screen should process result through state engine');
  assert.ok(!/var craftRes = CraftingSystem\.craft\(/.test(craftingJs), 'crafting UI must not mutate inventory directly');
  assert.ok(/StateEngine\.saveCheckpoint\(function/.test(craftingJs), 'craft success should persist a checkpoint');
});

test('crafting replay consumes the selected material ids only once', function () {
  assert.ok(/function craftWithMaterialIds/.test(read('app/js/engine/crafting.js')), 'crafting system should support exact material ids');
  assert.ok(/data\.materials \|\| \[\]/.test(stateEngineJs), 'craft replay should read material ids from the action');
  assert.ok(/CraftingSystem\.craftWithMaterialIds/.test(stateEngineJs), 'state-engine craft replay should use exact material ids');
});

test('marketplace state is mirrored into world state for checkpoints', function () {
  const stateEngine = read('app/js/engine/state-engine.js');
  assert.ok(/function _syncMarketplaceState\(\)/.test(stateEngine), 'state engine should expose marketplace checkpoint sync helper');
  assert.ok(/MarketplaceEngine\.setMarketState\(worldState\.marketplace\)/.test(stateEngine), 'marketplace engine should replay from checkpoint world state');
  assert.ok(/worldState\.marketplace = MarketplaceEngine\.getMarketState\(\)/.test(stateEngine), 'marketplace mutations should be mirrored back into world state');
  assert.ok(/_handleMarketList[\s\S]*_syncMarketplaceState\(\)/.test(stateEngine), 'market list should sync after successful mutation');
  assert.ok(/_handleMarketCancel[\s\S]*_syncMarketplaceState\(\)/.test(stateEngine), 'market cancel should sync after successful mutation');
  assert.ok(/_handleMarketBuy[\s\S]*_syncMarketplaceState\(\)/.test(stateEngine), 'market buy should sync after successful mutation');
});

test('marketplace live UI routes successful actions through state-engine and checkpoints', function () {
  assert.ok(/function processMarketListResult/.test(stateEngineJs), 'state engine should expose live market list path');
  assert.ok(/function processMarketCancelResult/.test(stateEngineJs), 'state engine should expose live market cancel path');
  assert.ok(/function processMarketBuyResult/.test(stateEngineJs), 'state engine should expose live market buy path');
  assert.ok(/processMarketListResult: processMarketListResult/.test(stateEngineJs), 'live market list path should be exported');
  assert.ok(/processMarketCancelResult: processMarketCancelResult/.test(stateEngineJs), 'live market cancel path should be exported');
  assert.ok(/processMarketBuyResult: processMarketBuyResult/.test(stateEngineJs), 'live market buy path should be exported');
  assert.ok(/StateEngine\.processMarketListResult\(user, itemId, price, 0, blockNum\)/.test(marketplaceJs), 'marketplace list success should use state engine');
  assert.ok(/StateEngine\.processMarketBuyResult\(user, listingRef, blockNum\)/.test(marketplaceJs), 'marketplace buy success should use state engine');
  assert.ok(/StateEngine\.processMarketCancelResult\(user, listingRef, blockNum\)/.test(marketplaceJs), 'marketplace cancel success should use state engine');
  assert.ok(/StateEngine\.saveCheckpoint\(function/.test(marketplaceJs), 'marketplace live success should save checkpoints');
});

test('marketplace sell and buy replay transfers item without duplication', function () {
  const context = loadMarketplaceStateEngine();
  const AT = context.VizMagicConfig.ACTION_TYPES;
  const state = context.StateEngine.getState();
  state.characters.seller = { level: 3 };
  state.characters.buyer = { level: 3 };
  state.inventories.seller = [{
    id: '100_oak_wand',
    type: 'oak_wand',
    rarity: 0,
    owner: 'seller',
    equipped: false,
    consumed: false,
    listed: false,
    stats: { int: 1 }
  }];
  state.inventories.buyer = [];

  const listEvents = context.StateEngine.processBlock({
    blockNum: 200,
    blockHash: 'market-list-hash',
    vmActions: [{
      sender: 'seller',
      action: { type: AT.MARKET_LIST, data: { item_ref: '100_oak_wand', price: 7, expires_block: 0 } }
    }],
    voicePosts: [],
    awards: []
  });

  assert.strictEqual(listEvents.length, 1, 'listing should emit one event');
  assert.strictEqual(listEvents[0].type, 'market_listed', 'listing event type should be market_listed');
  assert.strictEqual(state.inventories.seller[0].listed, true, 'seller item should be marked listed');
  assert.ok(state.marketplace.listings['200_100_oak_wand'], 'listing should be stored in world state marketplace');

  const checkpointMarketplace = JSON.parse(JSON.stringify(state.marketplace));
  context.MarketplaceEngine.setMarketState({ listings: {}, history: [], priceHistory: {} });
  state.marketplace = checkpointMarketplace;

  const buyEvents = context.StateEngine.processBlock({
    blockNum: 201,
    blockHash: 'market-buy-hash',
    vmActions: [{
      sender: 'buyer',
      action: { type: AT.MARKET_BUY, data: { listing_ref: '200_100_oak_wand' } }
    }],
    voicePosts: [],
    awards: []
  });

  assert.strictEqual(buyEvents.length, 1, 'buy should emit one event after marketplace replay from checkpoint state');
  assert.strictEqual(buyEvents[0].type, 'market_sold', 'buy event type should be market_sold');
  assert.strictEqual(state.inventories.seller.length, 0, 'seller inventory should no longer contain sold item');
  assert.strictEqual(state.inventories.buyer.length, 1, 'buyer inventory should contain exactly one item');
  assert.strictEqual(state.inventories.buyer[0].id, '100_oak_wand', 'buyer should receive the exact item id');
  assert.strictEqual(state.inventories.buyer[0].owner, 'buyer', 'transferred item owner should be buyer');
  assert.strictEqual(state.inventories.buyer[0].listed, false, 'transferred item should not remain listed');
  assert.strictEqual(state.marketplace.listings['200_100_oak_wand'].state, 'sold', 'listing should be marked sold in world state');
  assert.strictEqual(state.marketplace.history.length, 1, 'sale should be recorded once in market history');
});

test('crafting recipes have templates and obtainable materials', function () {
  const context = { console, VizMagicConfig: { RARITY: { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 } } };
  vm.createContext(context);
  vm.runInContext(read('app/js/engine/items.js'), context, { filename: 'items.js' });
  vm.runInContext(read('app/js/data/recipes.js'), context, { filename: 'recipes.js' });
  vm.runInContext(read('app/js/data/creatures.js'), context, { filename: 'creatures.js' });
  context.GameRecipes.registerCraftedTemplates();
  const recipes = context.GameRecipes.getAll();
  const templates = context.ItemSystem.ITEM_TEMPLATES;
  const lootSources = {};
  Object.keys(context.GameCreatures.getAll()).forEach(function (creatureId) {
    (context.GameCreatures.getAll()[creatureId].lootTable || []).forEach(function (drop) {
      lootSources[drop.itemType] = true;
    });
  });
  Object.keys(recipes).forEach(function (recipeId) {
    const recipe = recipes[recipeId];
    const output = recipe.outputTemplate || recipe.resultType || recipe.id;
    assert.ok(templates[output], 'recipe output has no item template: ' + recipeId + ' -> ' + output);
    (recipe.materials || []).forEach(function (mat) {
      assert.ok(templates[mat.type], 'recipe material has no item template: ' + recipeId + ' needs ' + mat.type);
      assert.ok(lootSources[mat.type], 'recipe material has no loot source: ' + mat.type);
    });
  });
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
  assert.ok(/receiver: action\.receiver/.test(chronicleJs), 'chronicle entries should preserve blessing receiver for dedupe');
  assert.ok(/\|blessing_sent\|/.test(chronicleJs), 'blessing dedupe should ignore optimistic/replay block mismatch');
  assert.ok(/function _updateLocalBlessingQuestProgress/.test(chronicleJs), 'blessing quests should update immediately after a successful local blessing');
});



test('completed quest list resolves quest titles instead of raw ids', function () {
  assert.ok(/titleKey: quest\.titleKey/.test(read('app/js/engine/quest-system.js')), 'completed quest records should preserve titleKey for future claims');
  assert.ok(/function _completedQuestTitle/.test(questScreenJs), 'quest screen should resolve completed quest titles');
  assert.ok(/GameQuests\.getQuest\(q\.id\)/.test(questScreenJs), 'completed quest title should fall back to quest template');
  assert.ok(!/Helpers\.t\(q\.id\)/.test(questScreenJs), 'completed quest list must not translate raw quest ids');
});

test('chronicle guild narratives have a guild-name fallback', function () {
  assert.ok(/function _guildDisplayName/.test(chronicleJs), 'chronicle should resolve guild display names');
  assert.ok(/function _guildNameForCreateAction/.test(chronicleJs), 'chronicle should recover guild names for old create entries');
  assert.ok(/guildName: guild\.name/.test(stateEngineJs), 'guild join events should carry guildName');
  assert.ok(/chronicle_unknown_guild/.test(chronicleJs + ruJs + enJs), 'unknown guild fallback copy should exist');
});

test('stale checkpoint catch-up keeps using scaled batches after first batch', function () {
  assert.ok(/function _nextCatchupBatchEnd/.test(appJs), 'app should centralize catch-up batch sizing');
  assert.ok(/var remaining = Math\.max\(0, chainHead - startBlock \+ 1\)/.test(appJs), 'batch sizing should use remaining gap');
  assert.ok(/var nextEnd = _nextCatchupBatchEnd\(nextStart, chainHead\)/.test(appJs), 'continued catch-up should not fall back to fixed 10-block batches');
});

test('large stale checkpoint catch-up uses archive events instead of replaying empty blocks', function () {
  assert.ok(/function _processArchiveEventBatch\(startBlock, endBlock, chainHead, done\)/.test(appJs), 'app should have archive event catch-up path');
  assert.ok(/HistorySource\.getEventsRange/.test(appJs), 'archive catch-up should query event ranges');
  assert.ok(/state\.headBlock = endBlock/.test(appJs), 'archive catch-up should advance checkpoint past empty blocks');
  assert.ok(/arena: true/.test(appJs), 'arena should refresh when duel events arrive during catch-up');
  assert.ok(/js\/ui\/app\.js\?v=20260621d/.test(indexHtml), 'main app controller must be cache-busted when catch-up code changes');
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



test('service worker updates quickly and keeps navigations network-first', function () {
  const swJs = read('app/sw.js');
  assert.ok(/viz-magic-v25/.test(swJs), 'service worker cache version should be bumped');
  assert.ok(/self\.skipWaiting\(\)/.test(swJs), 'service worker should activate new cache without waiting for all tabs to close');
  assert.ok(/self\.clients\.claim\(\)/.test(swJs), 'service worker should claim clients after activation');
  assert.ok(/event\.request\.mode === 'navigate'[\s\S]*fetch\(event\.request\)/.test(swJs), 'navigation requests should prefer network to avoid stale cached index');
});



test('map travel updates through state-engine and blocks repeat-click loops', function () {
  assert.ok(/function processMoveResult/.test(stateEngineJs), 'state engine should expose live movement path');
  assert.ok(/processMoveResult: processMoveResult/.test(stateEngineJs), 'live movement path should be exported');
  assert.ok(/StateEngine\.processMoveResult\(user, regionId, optimisticBlock\)/.test(mapScreenJs), 'map should update movement immediately through state engine');
  assert.ok(/PENDING_TRAVEL_TTL_MS/.test(mapScreenJs), 'pending travel state should have a stale guard');
  assert.ok(/!\(pendingTravel && pendingTravel\.account === user\)/.test(mapScreenJs), 'pending travel should suppress repeat travel buttons');
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
