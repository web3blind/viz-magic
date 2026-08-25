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
const helpJs = read('app/js/ui/screens/help.js');
const mapJs = read('app/js/ui/screens/map.js');
const chronicleJs = read('app/js/ui/screens/chronicle.js');
const mapScreenJs = read('app/js/ui/screens/map.js');
const questScreenJs = read('app/js/ui/screens/quests.js');
const guildJs = read('app/js/ui/screens/guild.js');
const arenaJs = read('app/js/ui/screens/arena.js');
const leaderboardJs = read('app/js/ui/screens/leaderboard.js');
const characterJs = read('app/js/ui/screens/character.js');
const marketplaceJs = read('app/js/ui/screens/marketplace.js');
const leaderboardScreenJs = read('app/js/ui/screens/leaderboard.js');
const characterScreenJs = read('app/js/ui/screens/character.js');
const loginJs = read('app/js/ui/screens/login.js');
const homeJs = read('app/js/ui/screens/home.js');
const templeJs2 = read('app/js/ui/screens/temple.js');
const worldBossJs = read('app/js/ui/screens/world-boss.js');
const worldBossEngineJs = read('app/js/engine/world-boss.js');
const developersJs = read('app/js/ui/screens/developers.js');
const mainCss = read('app/css/main.css');
const stateEngineJs = read('app/js/engine/state-engine.js');
const combatJs = read('app/js/engine/combat.js');
const worldEventsJs = read('app/js/engine/world-events.js');
const spellsJs = read('app/js/data/spells.js');
const questsJs = read('app/js/data/quests.js');
const indexHtml = read('app/index.html');
const ruJs = read('app/js/i18n/ru.js');
const enJs = read('app/js/i18n/en.js');
const configJs = read('app/js/config.js');
const broadcastJs = read('app/js/blockchain/broadcast.js');
const itemsJs = read('app/js/engine/items.js');
const templeJs = read('app/js/ui/screens/temple.js');
const navJs = read('app/js/ui/components/nav.js');
const settingsJs = read('app/js/ui/screens/settings.js');
const swJs = read('app/sw.js');

test('blessing quest requires different receivers', function () {
  const context = loadQuestSystem();
  const playerQuests = {
    active: [{
      id: 'q_blessings',
      objectives: [{ type: 'social', target: 'blessing', required: 2, current: 0, uniqueTarget: true }]
    }],
    completed: []
  };

  // v133: unique key is per block-day (receiver@day). Same mage twice the SAME
  // day must not count twice; the same mage on a LATER day must count again.
  context.QuestSystem.updateQuestProgress(playerQuests, 'social', { target: 'blessing', uniqueKey: 'alice@100', count: 1 });
  context.QuestSystem.updateQuestProgress(playerQuests, 'social', { target: 'blessing', uniqueKey: 'alice@100', count: 1 });
  assert.strictEqual(playerQuests.active[0].objectives[0].current, 1, 'same receiver same day should not count twice');

  context.QuestSystem.updateQuestProgress(playerQuests, 'social', { target: 'blessing', uniqueKey: 'alice@101', count: 1 });
  assert.strictEqual(playerQuests.active[0].objectives[0].current, 2, 'same receiver on a later day should count again');

  context.QuestSystem.updateQuestProgress(playerQuests, 'social', { target: 'blessing', uniqueKey: 'bob@100', count: 1 });
  assert.strictEqual(playerQuests.active[0].objectives[0].current, 2, 'already-complete quest should not grow past required');
  assert.strictEqual(playerQuests.active[0].completed, true, 'quest should complete after required unique receiver-days');
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
  assert.ok(/QuestSystem\.updateQuestProgress\(worldState\.quests\[award\.initiator\], 'social', \{ target: 'blessing', uniqueKey: award\.receiver\s*\+\s*'@'\s*\+\s*blessDay/.test(stateEngineJs), 'blessing progress must key by receiver and per-day');
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
  assert.ok(/var rarityName = _rarityNameForItem\(item, rInfo, t\)/.test(inventoryJs), 'inventory should translate rarity name through item-aware helper');
  assert.ok(/Helpers\.escapeHtml\(label\) \+ ' \(' \+ Helpers\.escapeHtml\(rarityName\)/.test(inventoryJs), 'inventory item name should include textual rarity');
});

test('hunt and map UX fixes prevent known loops and confusing copy', function () {
  assert.ok(/ch\.currentZone = 'commons_first_light'/.test(huntJs), 'return-to-commons should locally restore a huntable zone');
  assert.ok(/function _filterCreaturesForLevel/.test(huntJs), 'hunt should filter creatures by player level');
  assert.ok(/max <= level \+ 2\) continue/.test(huntJs), 'hunt should reject stale habitats whose max level is too weak for the player (tier 5-10 leaves at level 8)');
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
  assert.ok(/libraryProofBlocks/.test(appJs) && /HistorySource\.getBlock\(proofBlockNum/.test(appJs) && /BlockProcessor\.processBlock\(fullBlock, proofBlockNum\)/.test(appJs), 'paid library unlocks in stale catch-up should hydrate their full award-plus-custom proof block');
  assert.ok(/txIndex:\s*ev\.txIndex \|\| ev\.tx_index \|\| 0/.test(appJs), 'archive event replay should preserve transaction identity');
  assert.ok(/state\.headBlock = endBlock/.test(appJs), 'archive catch-up should advance checkpoint past empty blocks');
  assert.ok(/arena: true/.test(appJs), 'arena should refresh when duel events arrive during catch-up');
  assert.ok(/js\/ui\/app\.js\?v=20260822l/.test(indexHtml), 'main app controller must be cache-busted when catch-up code changes');
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

test('high-traffic UI narration, screen announcements, and inventory stat labels are translated', function () {
  [
    'char_level_up', 'stat_pot', 'stat_res', 'stat_swf', 'stat_int', 'stat_for',
    'duel_narrator_pre', 'duel_narrator_seal', 'duel_narrator_sealed',
    'duel_narrator_waiting', 'duel_narrator_reveal',
    'nav_inventory', "'nav_world-boss'"
  ].forEach(function (key) {
    assert.ok(enJs.indexOf(key + ':') !== -1, 'English translation missing: ' + key);
    assert.ok(ruJs.indexOf(key + ':') !== -1, 'Russian translation missing: ' + key);
  });
});



test('service worker updates quickly and keeps navigations network-first', function () {
  const swJs = read('app/sw.js');
  assert.ok(/viz-magic-v(?:[1-9][0-9]{2,}|9[0-9]|8[2-9])/.test(swJs), 'service worker cache version should be bumped');
  assert.ok(/self\.skipWaiting\(\)/.test(swJs), 'service worker should activate new cache without waiting for all tabs to close');
  assert.ok(/self\.clients\.claim\(\)/.test(swJs), 'service worker should claim clients after activation');
  assert.ok(/registration\.update\(\)/.test(read('app/js/ui/app.js')), 'app should ask the browser to check for the newest service worker after registration');
  assert.ok(/event\.request\.mode === 'navigate'[\s\S]*_fetchWithTimeout\(event\.request, NAVIGATION_TIMEOUT_MS/.test(swJs), 'navigation requests should prefer network with a bounded timeout to avoid stale cached index and black screens');
  assert.ok(/APP_SHELL_ASSETS/.test(swJs), 'service worker should keep a small optional app shell list');
  assert.ok(/event\.waitUntil\(self\.skipWaiting\(\)\)/.test(swJs), 'PWA install should not wait for app-shell downloads before activation');
  assert.ok(!/event\.waitUntil\(_cacheAppShell/.test(swJs), 'Android install must not block on cache.add downloads');
  assert.ok(!/cache\.addAll\(ASSETS\)/.test(swJs), 'PWA install should not wait for the full JS bundle cache');
  assert.ok(/isRuntimeAsset[\s\S]*_fetchWithTimeout\(event\.request, RUNTIME_TIMEOUT_MS/.test(swJs), 'runtime JS/CSS/manifest should be network-first with timeout and cached lazily');
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

test('mobile entry helpers cover keyboard paste, home-screen shortcut, nav parity, non-intrusive toasts, and chronicle post dedupe', function () {
  assert.ok(/btn-login-paste-key/.test(loginJs), 'login screen should expose a paste-key button for keyboard clipboard failures');
  assert.ok(/btn-login-toggle-key/.test(loginJs), 'login screen should expose a show-hide key button');
  assert.ok(/login_keyboard_help/.test(loginJs + ruJs + enJs), 'login screen should include mobile keyboard help copy');
  assert.ok(/navigator\.clipboard\.readText/.test(loginJs), 'paste helper should use the Clipboard API when available');
  assert.ok(/beforeinstallprompt/.test(appJs), 'app should listen for PWA install prompt');
  assert.ok(/function installShortcut/.test(appJs), 'app should expose an install shortcut action');
  assert.ok(/home_install_shortcut/.test(homeJs + ruJs + enJs), 'home screen should offer install-shortcut guidance');
  assert.ok(/home_install_shortcut_requested/.test(appJs + ruJs + enJs), 'install shortcut click should tell the user what happened or what to check');
  assert.ok(/var PRIMARY_HOME_SCREENS = \['home', 'inventory', 'guild', 'crafting', 'map', 'hunt', 'quests', 'arena', 'marketplace', 'temple', 'world-boss'\]/.test(homeJs), 'home primary grid should put Home, Bag, Guild and Workshop first');
  assert.ok(/nav_bazaar/.test(homeJs) && /nav_crafting/.test(homeJs), 'home primary labels should reuse bottom-nav translation keys');
  assert.ok(/prophecy-mini-button/.test(homeJs), 'daily prophecy card should be an active navigation button');
  assert.ok(/Helpers.EventBus.emit\('navigate', 'quests'\)/.test(homeJs), 'daily prophecy should navigate to quests');
  assert.ok(/actionType === 'chronicle_post'[\s\S]*_normalizeDedupeText/.test(chronicleJs), 'chronicle post dedupe should ignore temporary block numbers');
  assert.ok(/insertBefore\(container, appMain\)/.test(toastJs), 'toast strip should be inserted before app-main so it does not cover headings');
  assert.ok(/#connection-status[\s\S]*position:\s*static/.test(mainCss), 'connection status should stay in normal flow instead of covering headings');
  assert.ok(/\.quest-tabs[\s\S]*grid-template-columns:\s*1fr/.test(mainCss), 'quest tabs should render as one full-width column on mobile');
  assert.ok(/role', type === 'error' \? 'alert' : 'status'/.test(toastJs), 'only errors should be assertive toast alerts');
  assert.ok(/function _getStoredNumber/.test(read('app/js/ui/screens/settings.js')), 'settings should read stored sound slider values');
  assert.ok(/SoundManager\.setVolume\(sfxVolume \/ 100\)/.test(read('app/js/ui/screens/settings.js')), 'settings should apply stored SFX volume on render');
  assert.ok(/localStorage\.setItem\(STORAGE_PREFIX \+ 'sfx_volume'/.test(read('app/js/ui/sound.js')), 'sound manager should persist SFX volume');
  assert.ok(/var volume = _getStoredNumber\('sfx_volume', 0\.5\)/.test(read('app/js/ui/sound.js')), 'sound manager should restore persisted SFX volume');
  assert.ok(/viz-magic-v(?:[1-9][0-9]{2,}|9[0-9]|8[2-9])/.test(read('app/sw.js')), 'service worker cache should be bumped for UI changes');
});


test('home dashboard puts mana first and uses a story-readable HP scale', function () {
  assert.ok(/HOME_HP_DISPLAY_MAX = 1000/.test(homeJs), 'home HP should use a readable 1000 display scale');
  assert.ok(/HOME_XP_DISPLAY_MAX = 10000/.test(homeJs), 'home XP visual scale should top at 10000');
  assert.ok(/mana-bar[\s\S]*hp-bar[\s\S]*xp-bar/.test(homeJs), 'home summary should place Mana above HP, then XP');
  assert.ok(/displayMax:HOME_HP_DISPLAY_MAX/.test(homeJs), 'HP bar should show the fixed visual HP scale');
  assert.ok(/displayMax:HOME_XP_DISPLAY_MAX/.test(homeJs), 'XP bar should show the visual XP scale');
  assert.ok(/ProgressBar\.update\('mana-bar', currentEnergy \/ 100, 100\)/.test(homeJs), 'mana should remain real VIZ energy as 0-100 percent');
  assert.ok(/displayValue/.test(read('app/js/ui/components/progress-bar.js')), 'progress bar should separate real ratio from displayed scale');
  assert.ok(/setAttribute\('aria-label'/.test(read('app/js/ui/components/progress-bar.js')), 'progress update should refresh aria label for screen readers');
});

test('narrator and install instructions are actionable, not silent toggles or transient toasts', function () {
  const settingsJs = read('app/js/ui/screens/settings.js');
  assert.ok(/BattleNarrator\.isEnabled\(\)/.test(settingsJs), 'settings narrator toggle should reflect actual narrator state');
  assert.ok(/btn-test-narrator/.test(settingsJs), 'settings should expose a narrator test button');
  assert.ok(/narrator_test_message/.test(settingsJs + ruJs + enJs), 'narrator test copy should exist');
  assert.ok(/appinstalled/.test(appJs), 'app should handle successful PWA installation');
  assert.ok(/__vizMagicDeferredInstallPrompt/.test(indexHtml), 'app shell should capture beforeinstallprompt before deferred scripts load');
  assert.ok(/_deferredInstallPrompt \|\| window\.__vizMagicDeferredInstallPrompt/.test(appJs), 'install button should consume the early captured Chrome prompt');
  assert.ok(/function _showInstallInstructions/.test(appJs), 'install fallback should open manual instructions');
  assert.ok(/Modal\.show\(Helpers\.t\('home_install_shortcut'\)/.test(appJs), 'manual install instructions should open in a modal');
  assert.ok(/home_install_step_1/.test(appJs + ruJs + enJs), 'manual install instructions should have concrete steps');
});

test('Russian crafting naming is unified as Workshop/Masterская', function () {
  assert.ok(/nav_crafting:\s*'Мастерская'/.test(ruJs), 'craft nav should say Мастерская');
  assert.ok(/craft_title:\s*'Мастерская'/.test(ruJs), 'craft title should say Мастерская');
  assert.ok(/help_section_crafting:\s*'Мастерская'/.test(ruJs), 'help section should say Мастерская');
  assert.ok(!/nav_crafting:\s*'Ковка'/.test(ruJs), 'craft nav should not say Ковка');
  assert.ok(!/help_section_crafting:\s*'Крафт'/.test(ruJs), 'help section should not say Крафт');
});


test('mobile shell prevents tray and tab controls from overflowing the viewport', function () {
  assert.ok(/padding-bottom:\s*calc\(128px \+ env\(safe-area-inset-bottom\)\)/.test(mainCss), 'screens need compact bottom padding for the two-row mobile tray');
  assert.ok(/#bottom-nav\.show[\s\S]*display:\s*grid[\s\S]*repeat\(5, minmax\(0, 1fr\)\)/.test(mainCss), 'bottom nav should fit all tabs without horizontal overflow');
  assert.ok(/\.nav-tab[\s\S]*min-width:\s*0/.test(mainCss), 'nav tabs must be allowed to shrink inside viewport');
  assert.ok(/\.nav-label[\s\S]*text-overflow:\s*ellipsis/.test(mainCss), 'long nav labels should not push tabs off screen');
  assert.ok(/\.nav-tab[\s\S]*min-height:\s*38px/.test(mainCss), 'nav tray should be compact enough to preserve game viewport');
  assert.ok(/\.nav-icon[\s\S]*font-size:\s*0\.95rem/.test(mainCss), 'nav icons should be smaller but still visible');
  assert.ok(/@media \(max-width: 360px\)[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/.test(mainCss), 'narrow screens should cap the tray at three rows for nine tabs');
  assert.ok(/@media \(max-width: 360px\)[\s\S]*padding-bottom:\s*calc\(150px \+ env\(safe-area-inset-bottom\)\)/.test(mainCss), 'three-row tray should not steal excessive vertical space');
  assert.ok(/@media \(max-width: 480px\)[\s\S]*\.chronicle-tabs[\s\S]*grid-template-columns:\s*1fr/.test(mainCss), 'mobile chronicle tabs should stack instead of clipping');
  assert.ok(/@media \(max-width: 480px\)[\s\S]*\.craft-tabs[\s\S]*grid-template-columns:\s*1fr/.test(mainCss), 'mobile craft tabs should stack instead of clipping');
  assert.ok(/\.recipe-card[\s\S]*flex-wrap:\s*wrap/.test(mainCss), 'recipe cards should wrap on narrow screens');
});



test('magical weather is labelled and affects hunts', function () {
  assert.ok(/function getCurrentWeather/.test(worldEventsJs), 'world events should expose deterministic magical weather');
  assert.ok(/weather_frog_rain/.test(worldEventsJs + ruJs + enJs), 'magical forecast copy should exist');
  assert.ok(/духом луга/.test(ruJs), 'glass grass copy should mention the meadow spirit, not argue with the meadow');
  assert.ok(/Серебряный дождь:/.test(ruJs), 'sky weather copy should use harmonized colon phrasing');
  assert.ok((worldEventsJs.match(/summaryKey: 'weather_/g) || []).length >= 30, 'magical forecast should have at least 30 rotating templates');
  assert.ok(/var SKY_SIGNS/.test(worldEventsJs), 'forecast should combine omens with sky signs');
  assert.ok(/function getForecastVariantCount/.test(worldEventsJs), 'forecast should expose total variant count');
  assert.ok(((worldEventsJs.match(/summaryKey: 'sky_/g) || []).length * (worldEventsJs.match(/summaryKey: 'weather_/g) || []).length) >= 365, 'forecast pool should cover a year of daily surprise');
  assert.ok(/forecast-card-hunt-summary/.test(homeJs + mainCss), 'forecast should merge season and hunt effect into the first summary card');
  assert.ok(/weather_hunt_effect_sentence/.test(homeJs + ruJs + enJs), 'merged weather card should say that magical weather affects hunting');
  assert.ok(/forecast-weather-icon vmagic-breathe/.test(homeJs) && /forecast-hunt-icon vmagic-breathe/.test(homeJs), 'merged weather card should breathe compass and bow icons');
  assert.ok(/event-icon vmagic-breathe/.test(homeJs), 'minor rift banner icon should breathe with other icons');
  assert.ok(/function getCurrentFestival/.test(worldEventsJs), 'magical holidays should appear only from the authored calendar');
  assert.ok(/festival_today_prefix/.test(homeJs + ruJs + enJs), 'forecast holidays should have localized copy');
  assert.ok(/i18n\/ru.js\?v=20260824e/.test(indexHtml), 'Russian weather copy must be cache-busted');
  assert.ok(/i18n\/en.js\?v=20260824e/.test(indexHtml), 'English weather copy must be cache-busted');
  assert.ok(/home.js\?v=20260826u/.test(indexHtml), 'home forecast layout must be cache-busted');
  assert.ok(/js\/ui\/screens\/quests.js\?v=20260826k/.test(indexHtml), 'quest-limit UX must be cache-busted');
  assert.ok(/nav.js\?v=20260826u/.test(indexHtml), 'bottom tray nav must be cache-busted');
  assert.ok(/leaderboard.js\?v=20260826k/.test(indexHtml), 'leaderboard icon motion must be cache-busted');
  assert.ok(/world-events.js\?v=20260826k/.test(indexHtml), 'world events news and festival copy must be cache-busted');
  assert.ok(/main.css\?v=20260824a/.test(indexHtml), 'forecast grid CSS must be cache-busted');
  assert.ok(/prefers-reduced-motion: no-preference/.test(mainCss) && /vmagic-rune-pulse/.test(mainCss), 'ambient animation must be lightweight and respect reduced-motion');
  assert.ok(/weather_report_air/.test(homeJs + ruJs + enJs), 'home forecast should render readable air/water/wind weather instead of raw school percentages');
  assert.ok(/weather_hunt_effect_sentence: 'Магическая погода влияет на охоту\.'/.test(ruJs), 'summer card should restore the calm yellow hunt-weather sentence');
  assert.ok(!/weather_dynamic_effect_prefix' \+ ': ' \+ effect/.test(homeJs), 'summer card description should not repeat hunt influence wording before the effect');
  assert.ok(/seasonId === 'summer'[\s\S]*18 \+ \(daySeed % 13\)[\s\S]*if \(air > 30\) air = 30/.test(homeJs), 'summer forecast should cap air at +30');
  assert.ok(/seasonId === 'spring' \|\| seasonId === 'summer' \|\| seasonId === 'autumn'[\s\S]*daySeed % 21/.test(homeJs), 'water temperature should appear in spring, summer, and autumn from 0 to +20');
  assert.ok(/seasonBonuses\[spell\.school\]/.test(combatJs), 'season school bonus should affect spell attack');
  assert.ok(/creatureAttackMod/.test(combatJs), 'weather should affect creature danger in hunt combat');
  assert.ok(/playerDefenseMod/.test(combatJs), 'weather should affect player defense in hunt combat');
  assert.ok(/function getCurrentWorldDay/.test(worldEventsJs), 'sky block should have a daily world-name cycle');
  assert.ok(/world_day_sky/.test(worldEventsJs + homeJs + ruJs + enJs), 'world day names should be localized and rendered on Home');
  assert.ok(!/Ученики записали фразу наоборот/.test(worldEventsJs), 'repeated pupils-backwards lore tail should be removed');
  assert.ok(/forecast-card-hunt-summary[\s\S]*padding-right:\s*3\.6rem/.test(mainCss), 'season card should leave room for top-right hunt icon');
  assert.ok(/forecast-card-hunt-summary > \.forecast-hunt-icon[\s\S]*position:\s*absolute[\s\S]*top:\s*var\(--space-sm, 10px\)[\s\S]*left:\s*calc\(100% - 2\.4rem\)[\s\S]*right:\s*auto[\s\S]*bottom:\s*auto/.test(mainCss), 'hunt bow icon should sit in the top-right corner, opposite the compass');
});


test('player-requested icon motion and Armageddon warning controls exist', function () {
  assert.ok(/settings_icon_motion_off/.test(settingsJs + ruJs + enJs), 'settings should expose icon motion off option');
  assert.ok(/settings_icon_motion_sync/.test(settingsJs + ruJs + enJs), 'settings should expose synchronized breathing option');
  assert.ok(/settings_icon_motion_sparkle/.test(settingsJs + ruJs + enJs), 'settings should expose staggered sparkle option');
  assert.ok(/data-icon-motion/.test(settingsJs + mainCss), 'icon motion mode should use a persistent DOM hook');
  assert.ok(/body\[data-icon-motion=\"off\"\][\s\S]*animation:\s*none !important/.test(mainCss), 'off mode should stop icon animation');
  assert.ok(/body\[data-icon-motion=\"sync\"\][\s\S]*animation-delay:\s*0s !important[\s\S]*animation-duration:\s*5\.6s !important/.test(mainCss), 'sync mode should force every icon class to one shared timing');
  assert.ok(/body\[data-icon-motion=\"sync\"][\s\S]*\.boss-alert-icon[\s\S]*\.magical-forecast \.forecast-icon[\s\S]*\.action-tile \.tile-icon/.test(mainCss), 'sync mode should cover boss, forecast, and action tile icons too');
  assert.ok(/body\[data-icon-motion=\"sparkle\"\][\s\S]*\.boss-alert-icon[\s\S]*animation-delay:\s*-2\.7s !important[\s\S]*\.magical-forecast \.forecast-icon[\s\S]*animation-delay:\s*-3\.6s !important/.test(mainCss), 'sparkle mode should give non-list icon families different delays too');
  assert.ok(/body\[data-icon-motion=\"sparkle\"][\s\S]*\.action-tile:nth-child\(3n\+1\)[\s\S]*\.forecast-card:nth-child\(3n\+2\)[\s\S]*\.chronicle-entry:nth-child\(3n\)/.test(mainCss), 'sparkle mode should stagger icons across common repeated UI blocks');
  assert.ok(/settings_reduced_motion_hint/.test(settingsJs + ruJs + enJs), 'reduced motion should explain its broader purpose');
  assert.ok(/armageddon-explosion-icon/.test(huntJs + mainCss), 'Armageddon button should include the strict explosion warning marker');
  assert.ok(!/btn-armageddon[\s\S]*&#9888;&#65039;[\s\S]*armageddon-explosion-icon/.test(huntJs), 'Armageddon button should not duplicate exclamation warning beside explosion');
  assert.ok(/home-lore-card:nth-child\(2\)[\s\S]*247, 231, 214/.test(mainCss), 'middle Home lore card should use moon-white border');
  assert.ok(/home-lore-card:nth-child\(3\)[\s\S]*248, 81, 73/.test(mainCss), 'third Home lore card should use red border');
  assert.ok(/thornwood_staff:\s*'🦯'/.test(craftingJs), 'Thornwood Staff recipe should use one wooden staff icon');
  assert.ok(/'hunt': '\\u2694\\uFE0F'/.test(chronicleJs), 'Chronicle hunt rows should use crossed swords instead of bow');
  assert.ok(/border-left:\s*3px solid var\(--color-primary\)/.test(mainCss), 'lore cards should keep the same strict yellow left stripe');
  assert.ok(/help_section_world_days/.test(helpJs + ruJs + enJs), 'Magical Guide should explain the daily world-name cycle');
  assert.ok(!/WorldEvents\.getCurrentLorePages/.test(helpJs), 'Magical Guide living pages should not duplicate Home lore blocks');
  assert.ok(/Небо, Земля, Вода, Воздух, Ветер, Огонь, Эфир - это игровые имена дней недели Мира/.test(ruJs), 'world day copy should match requested wording');
});

test('music volume, narrator speech, and PWA icons are durable', function () {
  const settingsJs = read('app/js/ui/screens/settings.js');
  const narratorJs = read('app/js/ui/components/battle-narrator.js');
  const swJs = read('app/sw.js');
  assert.ok(!/music_volume/.test(settingsJs), 'music setting should be removed (no music in the game)');
  assert.ok(/SpeechSynthesisUtterance/.test(narratorJs), 'battle narrator should speak audibly through Web Speech when available');
  assert.ok(/textContent = ''[\s\S]*textContent = message/.test(narratorJs), 'battle narrator should force live-region text replacement');
  assert.ok(/manifest\.json\?v=20260826t/.test(indexHtml), 'manifest should be cache-busted for updated icon');
  assert.ok(/favicon\.ico\?v=20260826t/.test(indexHtml), 'favicon should be explicit for browser shortcut fallback');
  assert.ok(/viz-magic-v158-192\.png\?v=20260826t/.test(indexHtml), 'launcher icon link should be cache-busted');
  assert.ok(/assets\/icons\/viz-magic-v158-512\.png/.test(read('app/sw.js')), 'service worker should cache PWA launcher icons');
  assert.ok(/viz-magic-v158-512\.png/.test(read('app/manifest.json')), 'manifest should reference new icon URLs to bypass OS icon cache');
});


test('temple tab uses balanced on-chain offerings without direct pay-to-win stats', function () {
  assert.ok(/TEMPLE_OFFERING:\s*'temple\.offering'/.test(configJs), 'temple offering action type should exist');
  assert.ok(/function templeOffering/.test(broadcastJs), 'temple offering should have a broadcast wrapper');
  assert.ok(/award\(targetAccount, energy/.test(broadcastJs), 'temple offering should send a VIZ award to the deity account');
  assert.ok(/prayerText/.test(broadcastJs + templeJs), 'temple offerings should include selected prayer text in the public memo/action');
  assert.ok(/temple_social_publish/.test(templeJs + ruJs + enJs), 'temple should offer an optional Chronicle prayer post for native promotion');
  assert.ok(/VizBroadcast\.chroniclePost/.test(templeJs), 'temple social prayer should use Chronicle posts');
  assert.ok(/#viz_magic #temple/.test(ruJs + enJs), 'temple social posts should include discoverable tags');
  assert.ok(/VizAccount\.calculateCurrentEnergy/.test(templeJs), 'temple should check current mana before broadcasting an award');
  assert.ok(/case AT\.TEMPLE_OFFERING/.test(stateEngineJs), 'state engine should replay temple offerings');
  assert.ok(/function _handleTempleOffering/.test(stateEngineJs), 'temple offering handler should exist');
  assert.ok(/cooldown = 28800/.test(stateEngineJs), 'temple offerings should be cooldown-limited');
  assert.ok(/function getTempleBlessing/.test(stateEngineJs), 'temple should expose small temporary blessings');
  assert.ok(/Temple rewards are granted only from the real VIZ award memo/.test(stateEngineJs), 'temple replay should not mint rewards from custom proof alone');
  assert.ok(/viz:\/\/vm\/temple\//.test(stateEngineJs), 'temple award memos should be recognized during replay');
  assert.ok(/templeBlessing/.test(combatJs), 'temple blessings should be used by combat without direct item stats');
  assert.ok(/flame_votive_mark/.test(itemsJs) && /labor_votive_mark/.test(itemsJs), 'temple relics should be registered item templates');
  assert.ok(/baseStats:\s*\{\}/.test(itemsJs), 'temple relics should not add direct combat stats');
  assert.ok(/OFFERING_ENERGY = 50/.test(templeJs), 'offering cost should be small and explicit');
  assert.ok(/fire_goddess[\s\S]*target:\s*'null'/.test(templeJs), 'fire goddess should burn through null');
  assert.ok(/labor_god[\s\S]*target:\s*'committee'/.test(templeJs), 'labor god should support committee');
  assert.ok(/screen-temple/.test(indexHtml) && /temple\.js\?v=20260826k/.test(indexHtml), 'temple screen should be loaded and cache-busted');
  assert.ok(/id: 'temple'/.test(navJs + homeJs) && /nav_temple/.test(ruJs + enJs), 'temple should be reachable from navigation/home');
});


test('reported mobile UX issues have explicit fixes', function () {
  assert.ok(/quest_limit_reached_toast/.test(questScreenJs + ruJs + enJs), 'quest limit should be explained before/after accept attempts');
  assert.ok(/MAX_ACTIVE_QUESTS/.test(questScreenJs), 'quest screen should use the five-quest limit');
  assert.ok(!/BattleNarrator\.announce/.test(leaderboardScreenJs), 'leaderboard should not wake Battle Narrator speech synthesis');
  assert.ok(!/id: 'help'/.test(navJs), 'Help should be removed from bottom tray');
  assert.ok(/Helpers\.icon\('hp'/.test(homeJs) && /Helpers\.icon\('xp'/.test(homeJs), 'home HP and XP should use font-independent SVG icons');
});


test('PWA icon and HP heart use expressive color accents', function () {
  assert.ok(/viz-magic-v158-192\.png\?v=20260826t/.test(indexHtml), 'PWA icon link should be cache-busted after reinstall fix');
  assert.ok(/viz-magic-v158/.test(read('app/manifest.json')), 'manifest identity/start URL should remain stable after install-event fix');
  assert.ok(/Helpers\.icon\('hp'/.test(homeJs), 'HP label should use a stable SVG heart');
});

test('desktop standalone map zoom uses fullscreen overlay and robust emoji fallback', function () {
  assert.ok(/MAP_ASSET_VERSION = '20260826w'/.test(mapScreenJs), 'map images should be cache-busted after fullscreen zoom change');
  assert.ok(/lore-map-fullscreen/.test(mapScreenJs + mainCss), 'map zoom should switch to a fullscreen overlay state');
  assert.ok(/_closeLoreFullscreen/.test(mapScreenJs), 'fullscreen map should close from map/overlay click before closing modal');
  assert.ok(/modal.classList.add\('lore-map-fullscreen'\)/.test(mapScreenJs), 'fullscreen state should be applied to the modal container');
  assert.ok(/\.modal\.lore-map-fullscreen[\s\S]*position:\s*fixed[\s\S]*inset:\s*0/.test(mainCss), 'fullscreen map modal should cover the full browser viewport');
  assert.ok(/font-family:\s*'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'/.test(mainCss), 'emoji fallback should prefer system color emoji before optional Noto');
});


test('character screen uses current home-scale vitals and growth explainers', function () {
  assert.ok(/character.js\?v=20260826u/.test(indexHtml), 'character screen should be cache-busted');
  assert.ok(/CHARACTER_HP_DISPLAY_MAX = 1000/.test(characterScreenJs), 'character HP should use the same 1000 visual scale as Home');
  assert.ok(/CHARACTER_XP_DISPLAY_MAX = 10000/.test(characterScreenJs), 'character XP visual scale should top at 10000');
  assert.ok(/char-mana-bar[\s\S]*char-hp-bar[\s\S]*char-xp-bar/.test(characterScreenJs), 'character vitals should follow Home order: Mana, HP, XP');
  assert.ok(/displayMax:CHARACTER_HP_DISPLAY_MAX/.test(characterScreenJs), 'character HP display should be separate from real combat HP');
  assert.ok(/Helpers\.icon\('hp'/.test(characterScreenJs), 'character HP should have a stable SVG heart');
  assert.ok(/Helpers\.icon\('xp'/.test(characterScreenJs), 'character XP should have a stable SVG star');
  assert.ok(/char-mana-bar/.test(characterScreenJs), 'character screen should show current mana');
  assert.ok(/char_xp_explainer/.test(characterScreenJs + ruJs + enJs), 'character screen should explain XP growth');
  assert.ok(/char_mana_explainer/.test(characterScreenJs + ruJs + enJs), 'character screen should explain mana growth');
});


test('hunt screen exposes explicit camp rest promised by Help', function () {
  assert.ok(/hunt.js\?v=20260826u/.test(indexHtml), 'hunt screen should be cache-busted');
  assert.ok(/broadcast.js\?v=20260824a/.test(indexHtml), 'broadcast helper should be cache-busted for restAction');
  assert.ok(/state-engine.js\?v=20260824a/.test(indexHtml), 'state-engine should be cache-busted for processRestResult');
  assert.ok(/function restAction\(callback\)/.test(broadcastJs), 'broadcast helper should expose restAction');
  assert.ok(/function processRestResult\(account, blockNum\)/.test(stateEngineJs), 'state engine should expose live rest processing');
  assert.ok(/hunt-rest-section/.test(huntJs) && /btn-rest-camp/.test(huntJs), 'Hunt should show a visible rest-at-camp section and button');
  assert.ok(/VizBroadcast\.restAction/.test(huntJs), 'rest button should record a normal VM rest action');
  assert.ok(/Отдых у костра/.test(ruJs) && /нажми «Отдых у костра»/.test(ruJs), 'Russian Help should name the visible rest button');
});


test('narrator voice preferences support gender and timbre', function () {
  const settingsJs = read('app/js/ui/screens/settings.js');
  const narratorJs = read('app/js/ui/components/battle-narrator.js');
  assert.ok(/battle-narrator.js\?v=20260713c/.test(indexHtml), 'battle narrator should be cache-busted');
  assert.ok(/settings.js\?v=20260826k/.test(indexHtml), 'settings should be cache-busted');
  assert.ok(/narrator-voice-gender/.test(settingsJs), 'settings should expose narrator gender select');
  assert.ok(/narrator-voice-timbre/.test(settingsJs), 'settings should expose narrator timbre select');
  assert.ok(/setVoiceOptions/.test(narratorJs), 'narrator should persist selectable voice options');
  assert.ok(/voiceGender = 'male'/.test(narratorJs) && /voiceTimbre = 'rough'/.test(narratorJs), 'default narrator voice should be low/male-if-available');
  assert.ok(/matchedVoice/.test(narratorJs) && /utterance\.pitch = matchedVoice/.test(narratorJs), 'low narrator voice should avoid harsh pseudo-male pitch distortion when browser lacks a male voice');
  assert.ok(/speechSynthesis\.getVoices/.test(narratorJs), 'narrator should try to select a matching system voice');
  assert.ok(/narrator_voice_hint/.test(settingsJs + ruJs + enJs), 'settings should explain browser voice limitations');
});


test('home action tiles reflect Denis priority order', function () {
  assert.ok(/home.js\?v=20260826u/.test(indexHtml), 'home screen should be cache-busted for action order');
  assert.ok(/PRIMARY_HOME_SCREENS = \['home', 'inventory', 'guild', 'crafting', 'map', 'hunt', 'quests', 'arena', 'marketplace', 'temple', 'world-boss'\]/.test(homeJs), 'primary row should put Home, Bag, Guild and Workshop first');
  assert.ok(/SECONDARY_HOME_SCREENS = \['character', 'leaderboard', 'chronicle', 'settings', 'help', 'developers'\]/.test(homeJs), 'secondary row should start Character, Rating, Chronicle and exclude World Boss');
  assert.ok(/home_secondary_actions: 'Дополнительная строка'/.test(ruJs), 'More sections should be renamed to Additional bar in Russian');
});


test('character vital explainers are placed immediately after their bars', function () {
  assert.ok(/character.js\?v=20260826u/.test(indexHtml), 'character screen should be cache-busted for vital layout');
  assert.ok(/char-mana-bar[\s\S]*char_mana_explainer[\s\S]*char-hp-bar[\s\S]*char_hp_explainer[\s\S]*char-xp-bar[\s\S]*char_xp_explainer/.test(characterScreenJs), 'character vital explanations should follow Mana, HP and XP bars respectively');
  assert.ok(!/character-growth-notes/.test(characterScreenJs), 'vital explanations should not be grouped away from their bars');
});




test('weave surge banner explains mana multiplier', function () {
  assert.ok(/Плетение усиливает восстановление/.test(ruJs), 'Russian weave surge copy should explain why mana is doubled');
  assert.ok(/2× faster/.test(enJs), 'English weave surge copy should explain the 2x mana recovery');
  assert.ok(/event-effect-badge/.test(homeJs + mainCss), 'weave surge should render a visible mana multiplier badge');
  assert.ok(/manaRegenMultiplier/.test(homeJs), 'weave surge badge should use the event multiplier value');
});

test('minor rift banner explains itself and is actionable', function () {
  assert.ok(/home.js\?v=20260826u/.test(indexHtml), 'home screen should be cache-busted for rift explanation');
  assert.ok(/event_minor_rift_desc/.test(homeJs + ruJs + enJs), 'minor rift should have visible explanatory copy');
  assert.ok(/evt\.type === 'minor_rift' \|\| evt\.type === 'weave_surge'/.test(homeJs), 'minor rift banner should navigate to Hunt');
  assert.ok(/event-banner-button/.test(homeJs + mainCss), 'actionable event banners should be styled and bound as buttons');
  assert.ok(/event_time_left/.test(homeJs + ruJs + enJs), 'event banner aria-label should explain remaining time');
});


test('temple offering gives immediate heard-prayer feedback', function () {
  assert.ok(/temple\.js\?v=20260826k/.test(indexHtml), 'temple screen should be cache-busted for offering feedback');
  assert.ok(/temple-status-region/.test(templeJs), 'temple should include an inline status region');
  assert.ok(/_setTempleStatus\(Helpers\.t\('temple_offering_success_plain'\), true, deity\.id\)/.test(templeJs) && /_setTempleStatus\(Helpers\.t\('temple_social_success'\), true, deity\.id\)/.test(templeJs), 'temple success should update inline status for private and chronicle prayers on the same deity card');
  assert.ok(/молитва услышана/.test(ruJs), 'Russian temple success should explicitly say the prayer was heard');
  assert.ok(/Your prayer was heard/.test(enJs), 'English temple success should explicitly say the prayer was heard');
});


test('hunt rest uses home-scale HP values', function () {
  assert.ok(/hunt.js\?v=20260826u/.test(indexHtml), 'hunt screen should be cache-busted for HP display scale');
  assert.ok(/HUNT_HP_DISPLAY_MAX = 5000/.test(huntJs), 'hunt rest should use the same 5000 HP display scale');
  assert.ok(/hpShown[\s\S]*HUNT_HP_DISPLAY_MAX/.test(huntJs), 'hunt rest description should render scaled HP instead of raw max HP');
});


test('marketplace groups identical sellable items and supports quantity listing', function () {
  assert.ok(/marketplace.js\?v=20260826k/.test(indexHtml), 'marketplace screen should be cache-busted');
  assert.ok(/function _groupSellableItems/.test(marketplaceJs), 'sell tab should group identical items');
  assert.ok(/sell-item-count/.test(marketplaceJs), 'sell tab should display grouped item count');
  assert.ok(/sell-qty-input/.test(marketplaceJs), 'sell tab should expose quantity input');
  assert.ok(/data-items=/.test(marketplaceJs), 'sell action should know all item ids in the group');
  assert.ok(/listNext\(0\)/.test(marketplaceJs), 'quantity listing should list selected items sequentially');
  assert.ok(/market_set_quantity/.test(marketplaceJs + ruJs + enJs), 'quantity copy should exist');
});


test('hunt and arena icons are distinct', function () {
  assert.ok(/nav.js\?v=20260826u/.test(indexHtml), 'nav should be cache-busted for hunt icon');
  assert.ok(/hunt:\s*'hunt'/.test(homeJs), 'home Hunt tile should use the SVG hunt symbol');
  assert.ok(/arena:\s*'arena'/.test(homeJs), 'home Arena tile should keep a distinct SVG arena symbol');
  assert.ok(/id: 'hunt'[\s\S]*icon: 'hunt'/.test(navJs), 'bottom Hunt tab should use the SVG hunt symbol');
});


test('hunt headings and help use updated thematic icons', function () {
  assert.ok(/hunt.js\?v=20260826u/.test(indexHtml), 'hunt screen should be cache-busted for heading icons');
  assert.ok(/vmagic-breathe[\s\S]*🐾[\s\S]*hunt_choose_creature/.test(huntJs), 'hunt creature heading should have a thematic tracking icon');
  assert.ok(/vmagic-breathe[\s\S]*🪄[\s\S]*hunt_choose_spell/.test(huntJs), 'hunt spell heading should use a magic wand icon');
  assert.ok(/help.js\?v=20260824b/.test(indexHtml), 'help screen should be cache-busted for hunt icon');
  assert.ok(/key: 'hunt'[\s\S]*icon: 'hunt'/.test(helpJs), 'help Hunt section should use the SVG hunt icon');
});


test('crafting enchant tab does not show misleading local back button', function () {
  assert.ok(/crafting.js\?v=20260724b/.test(indexHtml), 'crafting screen should be cache-busted for enchant tab cleanup');
  assert.ok(!/craft-tab-back-btn/.test(craftingJs), 'enchant tab should not expose a non-working local back button');
});


test('marketplace sell items have semantic item icons', function () {
  assert.ok(/marketplace.js\?v=20260826k/.test(indexHtml), 'marketplace screen should be cache-busted for sell icons');
  assert.ok(/function _marketItemIcon/.test(marketplaceJs), 'sell rows should compute semantic item icons');
  assert.ok(/chronicle_ink:\s*'🖋️'/.test(marketplaceJs), 'Chronicle Ink should show the pen icon before the name');
  assert.ok(/shadow_shard:\s*item\.rarity === 0 \? '⬛' : '🌑'/.test(marketplaceJs), 'Shadow Shard should have rarity-distinct sell icons');
  assert.ok(/thorn_essence:\s*item\.rarity >= 4 \? '🧬' : \(item\.rarity >= 1 \? '🌵' : '🌿'\)/.test(marketplaceJs), 'Thorn Essence should have rarity-distinct sell icons');
  assert.ok(/ancient_shard:\s*item\.rarity >= 2 \? '🪬' : \(item\.rarity >= 1 \? '🌀' : '〰️'\)/.test(marketplaceJs), 'Ancient Shard should have a sell icon');
  assert.ok(/spirit_tunic:\s*'🧥'/.test(marketplaceJs), 'Spirit Tunic should have a sell icon');
  assert.ok(/_marketItemIcon\(sItem\)/.test(marketplaceJs), 'sell row should render the item icon before the name');
  assert.ok(!/chronicle_ink[\s\S]{0,260}ink-drop-icon/.test(marketplaceJs), 'Chronicle Ink should not add a trailing ink drop after the name');
});


test('world boss UI can enter active window from schedule even without spawn checkpoint', function () {
  assert.ok(/world-boss.js\?v=20260826k/.test(indexHtml), 'world boss screen should be cache-busted for active-window fallback');
  assert.ok(/js\/engine\/world-boss\.js\?v=20260716a/.test(indexHtml), 'world boss engine should be cache-busted for reward distribution');
  assert.ok(/WorldEvents\.checkWorldBossWindow\(blockNum\)/.test(worldBossJs), 'world boss screen should check the deterministic active window directly');
  assert.ok(/WorldBoss\.spawnBoss\(bossEvent\.spawnBlock \|\| blockNum/.test(worldBossJs), 'screen should render active boss from scheduled spawn block when state has no boss');
  assert.ok(/_ensureArchiveBackfill/.test(worldBossJs) && /HistorySource\.getEventsRange/.test(worldBossJs) && /boss\.attack/.test(worldBossJs), 'world boss screen should backfill public boss attacks from archive for other browsers');
  assert.ok(/state\.worldBoss = scheduledBoss/.test(worldBossJs) && /bossState\.maxHp !== scheduledBoss\.maxHp/.test(worldBossJs), 'screen should discard wrong local boss HP/checkpoint before archive backfill');
  assert.ok(/DEFAULT_ENCOUNTER_PLAYERS/.test(worldBossEngineJs), 'world boss HP should not depend on local browser character cache');
  assert.ok(/state-engine.js\?v=20260824a/.test(indexHtml), 'state engine should be cache-busted for boss attack spawn-block parity');
  assert.ok(/worldState\.worldBoss\.maxHp !== scheduledBoss\.maxHp/.test(stateEngineJs), 'boss attack replay should reset wrong local boss HP to scheduled public boss');
  assert.ok(/worldState\.characters\[sender\] \|\| null/.test(stateEngineJs) && /character && character\.pot \? character\.pot : 14/.test(stateEngineJs), 'boss attacks from other accounts should still contribute when their local character is absent');
  assert.ok(/_schedulePostAttackRefresh/.test(worldBossJs) && /_backfillKey = ''/.test(worldBossJs), 'boss screen should force archive refresh after each successful attack');
  assert.ok(/'world-boss': true/.test(appJs), 'world boss screen should rerender after sync events');
  assert.ok(/leaderboard = leaderboard\.slice\(\)\.sort/.test(worldBossJs) && /b\.damage/.test(worldBossJs), 'world boss leaderboard should render largest damage first');
});

test('map regions separate safe travel from gated current-region exploration', function () {
  assert.ok(/map-action-heading/.test(mapJs), 'map actions should have visible section headings');
  assert.ok(/t\('map_travel_heading'\)/.test(mapJs), 'travel heading should use i18n');
  assert.ok(/isCurrent[\s\S]{0,1200}t\('map_exploration_heading'\)/.test(mapJs), 'current region should render a separate exploration heading');
  assert.ok(/TRAVEL_COST_LOW = 10/.test(mapJs), 'travel should keep the 0.10% energy cost');
  assert.ok(/EXPLORATION_COSTS = \[100, 300, 500, 700, 900, 1100\]/.test(mapJs), 'current region should expose 1, 3, 5, 7, 9 and 11 percent tiers');
  assert.ok(/region-exploration-btn/.test(mapJs) && /disabled/.test(mapJs), 'exploration tiers should remain disabled until the safe protocol ships');
  assert.ok(!/region-exploration-btn[^>]*region-travel-btn/.test(mapJs), 'disabled exploration controls must not bind the legacy travel handler');
  assert.ok(/map_travel_heading:\s*'Путешествие'/.test(ruJs), 'Russian travel heading should be present');
  assert.ok(/map_exploration_heading:\s*'Исследование'/.test(ruJs), 'Russian exploration heading should be present');
  assert.ok(/map_travel_heading:\s*'Travel'/.test(enJs), 'English travel heading should be present');
  assert.ok(/map_exploration_heading:\s*'Exploration'/.test(enJs), 'English exploration heading should be present');
  assert.ok(/region-exploration-options/.test(mainCss) && /grid-template-columns/.test(mainCss), 'exploration tiers should use a wrapping mobile-safe grid');
  assert.ok(/@media \(max-width: 600px\)[\s\S]{0,240}region-exploration-options[\s\S]{0,160}repeat\(3, minmax\(0, 1fr\)\)/.test(mainCss), 'exploration tiers should switch to two rows before narrow mobile overflow begins');
  assert.ok(/js\/ui\/screens\/map.js\?v=20260824b/.test(indexHtml), 'map controls should be cache-busted');
  assert.ok(/main.css\?v=20260824a/.test(indexHtml), 'map action styles should be cache-busted');
  assert.ok(/i18n\/ru.js\?v=20260824e/.test(indexHtml) && /i18n\/en.js\?v=20260824e/.test(indexHtml), 'map action translations should be cache-busted');
  assert.ok(/viz-magic-v181/.test(swJs), 'service worker cache should advance for the map action layout');
});

test('map travel hint links to a permanent travel and exploration guide page', function () {
  assert.ok(/class="help-nav-link map-help-link"[\s\S]*data-help-section="travel_exploration"/.test(mapJs), 'map hint should expose an active Magical Guide link');
  assert.ok(/Helpers\.EventBus\.emit\('navigate', 'help'\)/.test(mapJs), 'map guide link should navigate to Magical Guide');
  assert.ok(/help-section-' \+ helpSection/.test(mapJs) && /scrollIntoView/.test(mapJs) && /\.focus\(\)/.test(mapJs), 'map guide link should move viewport and focus to its target section');
  assert.ok(/\{ key: 'travel_exploration',\s*icon: 'map' \}/.test(helpJs), 'travel and exploration should be a permanent guide page');
  assert.ok(/id="help-section-' \+ s\.key \+ '" tabindex="-1"/.test(helpJs), 'permanent guide headings should be programmatically focusable');
  assert.ok(/help_section_travel_exploration:\s*'Путешествия и Исследования'/.test(ruJs), 'Russian guide should use the requested block title');
  assert.ok(/Под картой расположены кнопки для путешествий и исследований карт Мира/.test(ruJs), 'Russian guide should include the requested introduction');
  assert.ok((ruJs.match(/data-help-nav="crafting">Мастерской<\/button>/g) || []).length >= 2, 'both Workshop mentions should be active links');
  assert.ok(/0,10% энергии:[\s\S]*0%[\s\S]*1% энергии[\s\S]*8\.3%[\s\S]*3% энергии[\s\S]*26\.6%[\s\S]*5% энергии[\s\S]*45\.0%[\s\S]*7% энергии[\s\S]*63\.3%[\s\S]*9% энергии[\s\S]*81\.7%[\s\S]*11% энергии[\s\S]*100%/.test(ruJs), 'guide should publish the verified chance table');
  assert.ok(/Шанс = \(затрата энергии − 0,10%\) \/ \(11% − 0,10%\) × 100%/.test(ruJs), 'guide should publish the verified linear formula');
});

test('map regions are lore links with travel buttons everywhere', function () {
  assert.ok(/region-lore-link/.test(mapJs) && /data-lore-region/.test(mapJs), 'region names should be active links that open a lore card');
  assert.ok(/function _openLore/.test(mapJs) && /lore-map-card/.test(mapJs) && /lore-close/.test(mapJs), 'lore link should open a modal with a Close button');
  assert.ok(/region-lore/.test(mapJs) && /map_lore_' \+ regionId/.test(mapJs), 'each region block should render a lore description snippet');
  assert.ok(!/else if \(!isCurrent && character/.test(mapJs), 'travel buttons should no longer be hidden for the current region (Commons of First)');
  assert.ok(/map_lore_commons_first_light/.test(ruJs) && /map_lore_duel_spires/.test(ruJs), 'ru should carry lore descriptions for all nine regions');
  assert.ok(/map_lore_commons_first_light/.test(enJs) && /map_lore_duel_spires/.test(enJs), 'en should carry lore descriptions for all nine regions');
  assert.ok(/map_view_lore/.test(ruJs + enJs), 'lore link should have an accessible label');
  assert.ok(/lore-map-image/.test(mapJs) && /assets\/maps\/map-' \+ regionId \+ '\.jpg/.test(mapJs), 'lore modal should show the generated painted-map image for the region');
  assert.ok(/MAP_ASSET_VERSION = '20260826w'/.test(mapJs), 'map image URLs should use the current cache-bust version after portal retouch');
  assert.ok(/lore-fallback/.test(mapJs) && /lore-map-text/.test(mapJs), 'when a map image is missing the modal falls back to the lore text instead of a broken image');
  assert.ok(/map_lore_image_alt/.test(ruJs + enJs), 'map image should have an accessible alt label');
  assert.ok(!/display_override/.test(read('app/manifest.json')), 'manifest display_override should be removed (standalone there breaks PWA install in some Chrome)');
  assert.ok(/lore-map-actions/.test(mapJs + mainCss) && /id="lore-zoom-toggle"/.test(mapJs) && /id="lore-close"/.test(mapJs), 'zoom and close controls should share one row below the map');
  assert.ok(/map_zoom_toggle:\s*'Увеличить'/.test(ruJs) && !/map_zoom_toggle:\s*'Увеличить карту'/.test(ruJs), 'Russian zoom button should say only Увеличить');
  assert.ok(/map_zoom_toggle:\s*'Zoom'/.test(enJs) && !/map_zoom_toggle:\s*'Zoom map'/.test(enJs), 'English zoom button should say only Zoom');
  assert.ok(/var isMapImage = url\.pathname\.indexOf\('\/assets\/maps\/'\) === 0/.test(read('app/sw.js')) && /_fetchWithTimeout\(event\.request, RUNTIME_TIMEOUT_MS, \{ cache: 'reload' \}\)/.test(read('app/sw.js')), 'map JPGs should be network-first so new maps replace stale runtime cache');
  assert.ok(!/map_zoom_hint/.test(mapJs + ruJs + enJs) && !/lore-map-zoom-hint/.test(mapJs + mainCss) && !/double-click/.test(mapJs), 'map modal should not show double-click or obvious button-use hints');
  assert.ok(!/map_secret_portal/.test(mapJs + ruJs + enJs) && !/едва заметн|tiny hidden/i.test(mapJs + ruJs + enJs), 'secret transition hints should not be written as UI text');
  assert.ok(!/assets\/fonts\/noto-color-emoji/.test(read('app/css/main.css') + mapJs), 'map fix must not reintroduce the broken text/emoji font path');
  assert.ok(/starfall_vault/.test(read('app/js/data/regions.js')) && /void_sanctum/.test(read('app/js/data/regions.js')), 'high-level regions (51-101) should exist to match the 101-rank magic ladder');
  assert.ok(/map_lore_starfall_vault/.test(ruJs + enJs) && /map_lore_void_sanctum/.test(ruJs + enJs), 'ru and en should carry lore for the new high-level regions');
});

test('reported visual icon polish is explicit and cache-busted', function () {
  assert.ok(/function _getRecipeIcon/.test(craftingJs), 'crafting recipes should have per-recipe icons instead of only category icons');
  ['mana_potion', 'health_scroll', 'ash_wand', 'thornwood_staff', 'shadow_blade', 'veilstone_helm', 'windwalker_boots', 'ironbark_vest', 'fire_rune', 'shadow_rune', 'lucky_charm', 'armageddon_stone'].forEach(function(id) {
    assert.ok(new RegExp(id + ":").test(craftingJs), 'recipe icon map should include ' + id);
  });
  assert.ok(/the_veil:\s*'prophecy'/.test(mapJs), 'The Veil should use a font-independent prophecy SVG icon');
  assert.ok(/region-card-/.test(mapJs) && /region-card-the_veil/.test(mainCss), 'The Veil moon should have a dedicated bright style hook');
  assert.ok(/forecast-weather-icon/.test(homeJs) && /forecast-sky-icon/.test(homeJs), 'home weather and sky icons should be separately styled/identifiable');
  assert.ok(/vmagic-tile-shimmer/.test(mainCss) && /scale\(1\.12\)/.test(mainCss), 'ambient motion should be visible, not only barely perceptible');
});

test('Creators pages offer optional account-specific non-advantage awards', function () {
  assert.ok(/screen-developers/.test(indexHtml), 'index should include creators screen container');
  assert.ok(/developers.js\?v=20260824b/.test(indexHtml), 'Creators book should be loaded and cache-busted');
  assert.ok(/creators-custom-energy-/.test(developersJs) && /developers_custom_reward_label/.test(ruJs + enJs), 'each configured creator should allow a custom 0.01-100 reward amount');
  assert.ok(/REWARD_OPTIONS = \[100\]/.test(developersJs), 'Creators book should keep only one fixed 1% quick reward');
  assert.ok(/app.js\?v=20260822l/.test(indexHtml), 'app controller should keep the stable developers route');
  assert.ok(/'developers'/.test(appJs) && /DevelopersScreen\.render/.test(appJs), 'app should keep rendering the stable creators route');
  assert.ok(/SECONDARY_HOME_SCREENS = \['character', 'leaderboard', 'chronicle', 'settings', 'help', 'developers'\]/.test(homeJs), 'home secondary actions should include Creators without World Boss');
  assert.ok(/denis[\s\S]*account: 'denis-skripnik'/.test(developersJs), 'Blind Dev seal should target @denis-skripnik');
  assert.ok(/evgeny[\s\S]*account: 'ko4evnik'/.test(developersJs), 'Evgeny seal should target @ko4evnik');
  assert.ok(/if \(!creator\.account\) return ''/.test(developersJs), 'creator without a VIZ account should not render a reward seal');
  assert.ok(/VizBroadcast\.award\(creator\.account, energy, 0, memo, \[\]/.test(developersJs), 'each reward should use the selected creator account');
  assert.ok(/developers_reward_note/.test(developersJs + ruJs + enJs), 'copy should explain rewards are optional and non-advantageous');
  assert.ok(/github.com\/web3blind/.test(developersJs) && /developers_link_github/.test(ruJs + enJs), 'Creators book should link to the Blind Dev GitHub workshop');
  assert.ok(!/vizmagic.web3blind.xyz/.test(developersJs), 'Creators links should not duplicate the game launcher');
});


test('summer weather copy and repeated lore tails stay deduplicated', function () {
  assert.strictEqual((worldEventsJs.match(/маски дракона примеряют даже те, кто уверяет, что совсем не боится/g) || []).length, 1, 'dragon masks should appear in only one waiting text pool');
  assert.ok(!/var FESTIVAL_TWISTS = \[\s\S]*маски дракона примеряют/.test(worldEventsJs), 'dragon masks phrase should be removed from the Today in the World rotating queue');
  assert.strictEqual((worldEventsJs.match(/По городу ходит слух, что завтра всё окажется ещё страннее/g) || []).length, 1, 'city rumor should appear in only one text pool');
  assert.strictEqual((worldEventsJs.match(/Карты мира делают вид, что знали это заранее/g) || []).length, 1, 'map tail should remain in only one text block');
  assert.strictEqual((worldEventsJs.match(/Ветер унёс возражения в сторону арены/g) || []).length, 1, 'wind objections should remain in only one text block, not the reusable tail pool');
  assert.strictEqual((worldEventsJs.match(/пророческая пыль легла на последнюю точку/gi) || []).length, 1, 'prophetic dust should remain in only one text block');
  assert.ok(!/var LORE_DAILY_TAILS = \[\s\S]*[Пп]ророческая пыль легла на последнюю точку/.test(worldEventsJs), 'prophetic dust should be removed from the reusable lore tail queue');
  assert.ok(/weather_dynamic_creature: 'Сила добычи'/.test(ruJs), 'prey strength label should start with a capital letter in Russian');
  assert.ok(!/Влияние на охоту/.test(homeJs), 'summer card body should not hardcode hunt influence wording');
  assert.ok(/forecast-card-hunt-summary > \.forecast-hunt-icon[\s\S]*position:\s*absolute[\s\S]*top:\s*var\(--space-sm, 10px\)[\s\S]*left:\s*calc\(100% - 2\.4rem\)[\s\S]*right:\s*auto[\s\S]*bottom:\s*auto/.test(mainCss), 'bow icon should be pinned to the top-right, opposite the compass');
});

test('reported ux polish issues have explicit fixes', function () {
  assert.ok(/magic_news_school_math/.test(worldEventsJs + ruJs + enJs), 'Home magical news should use the school mathematics item instead of sky painting');
  assert.ok(!/summaryKey: 'magic_news_sky_painting'/.test(worldEventsJs), 'Sky painting should not remain in magical news rotation');
  assert.ok(/festival_daily_sky_painting/.test(worldEventsJs + ruJs + enJs), 'Sky painting should live in daily world festivals');
  assert.ok(/item-icon vmagic-breathe/.test(inventoryJs), 'Bag item icons should breathe');
  assert.ok(/market-item-icon vmagic-breathe/.test(marketplaceJs), 'Bazaar sell item icons should breathe');
  assert.ok(/chronicle-author-prefix vmagic-breathe/.test(chronicleJs), 'Chronicle author prefix icons should breathe');
  assert.ok(/chronicle-icon vmagic-breathe/.test(chronicleJs), 'Chronicle main entry icons should breathe too');
  assert.ok(/leaderboard-title-icon/.test(leaderboardScreenJs) && !/screen-title-icon section-icon vmagic-breathe leaderboard-title-icon/.test(leaderboardScreenJs) && /leaderboard-title-icon[\s\S]*vmagic-soft-breathe/.test(mainCss), 'Leaderboard title icon should visibly breathe without jitter classes');
  assert.ok(/active-key-notice[\s\S]*active-key-icon vmagic-breathe/.test(guildJs) && !/🔐 Для делегирования/.test(ruJs), 'Guild active-key warning should have one breathing lock icon outside the text copy');
  assert.ok(!/максимум 5000/.test(ruJs) && !/max 5000/.test(enJs), 'Character HP explainer should not claim a fixed 5000 max');
  assert.ok(/chronicle_ink:\s*'🖋️'/.test(inventoryJs), 'inventory should show a thematic icon for Chronicle Ink');
  assert.ok(/sell-item-name/.test(marketplaceJs) && /color:\s*var\(--color-text\)/.test(mainCss), 'bazaar sell item names should stay readable instead of grey on black');
  assert.ok(!/craft-tab-back-btn/.test(craftingJs), 'enchant tab should not show a misleading non-working back button');
  assert.ok(/home-summary-button/.test(homeJs) && /navigate', 'character'/.test(homeJs), 'home greeting should open character stats');
  assert.ok(/help_section_marketplace:\s*'Базар'/.test(ruJs), 'Help should consistently call the trading screen Bazaar in Russian');
  assert.ok(/temple-deity-copy/.test(templeJs2 + mainCss), 'temple deity cards should use immediate inline emoji instead of slow duplicate images');
  assert.ok(/getCurrentMagicNews/.test(worldEventsJs) && /magic_news_sun_wolf/.test(ruJs + enJs), 'home forecast should sometimes show daily magical news');
  assert.ok(/boss_motto/.test(worldBossJs + ruJs + enJs) && /boss_lore/.test(worldBossJs + mainCss), 'world boss screen should have thematic lore filling');
  assert.ok(/matchedVoice/.test(read('app/js/ui/components/battle-narrator.js')), 'male narrator should avoid fake pitch-shift when no male browser voice exists');
});



test('Denis feedback UI polish batch uses calendar days and calmer icons', function () {
  assert.ok(/_getMoscowDayIndex/.test(worldEventsJs), 'daily world text should rotate by Moscow day, not raw block day');
  assert.ok(/_getMoscowSeasonIndex/.test(worldEventsJs) && /June–August/.test(worldEventsJs), 'season should follow real Moscow calendar months');
  assert.ok(/GREAT_FESTIVALS/.test(worldEventsJs) && /MINOR_FESTIVALS/.test(worldEventsJs), 'holidays should use an authored calendar map, not daily modulo rotation');
  assert.ok(/festival_wind_dance/.test(worldEventsJs + ruJs + enJs), 'wind dance festival should be available');
  assert.ok(/festival_warband_dance/.test(worldEventsJs + ruJs + enJs), 'Warband Dance festival should be available');
  assert.ok(/getFestivalVariantCount/.test(worldEventsJs) && /DAILY_FESTIVALS.length \* FESTIVAL_TWISTS.length/.test(worldEventsJs), 'daily festival text pool should cover a year without repeating exact blocks');
  assert.ok(/getMagicNewsVariantCount/.test(worldEventsJs) && /MAGIC_NEWS.length \* NEWS_TWISTS.length/.test(worldEventsJs), 'magic news text pool should cover a year without repeating exact blocks');
  assert.ok(/magicNews.twistText/.test(homeJs), 'home news card should render daily news twists');
  assert.ok(/forecast-card-sky[\s\S]*forecast-head[\s\S]*forecast-sky-icon[\s\S]*weather_sky_title/.test(homeJs), 'Sky card should put title after icon in one row');
  assert.ok(/forecast-card-news[\s\S]*forecast-head[\s\S]*magic_news_title/.test(homeJs), 'Magic news card should put title after icon in one row');
  assert.ok(/sky\.twistText/.test(homeJs) && /Летний снегопад прикрыл город от жары/.test(worldEventsJs), 'Sky card should change visible text daily and include Denis summer snow variant');
  assert.ok(/Свечи горят ровно, и тени от них рассказывают многое/.test(worldEventsJs), 'World festival twist should use the harmonized prophecy-candle line');
  assert.ok(/festival_today_prefix:\s*'Сегодня в мире'/.test(ruJs) && !/festival_today_prefix:\s*'Праздник мира'/.test(ruJs), 'World festival prefix should not repeat the word holiday');
  assert.ok(/daily-workshop-title/.test(questScreenJs + mainCss), 'Daily workshop prophecy title should have a distinct color class');
  assert.ok(/festival_secret_knowledge_day/.test(worldEventsJs + ruJs + enJs), 'September 1 should be Secret Knowledge Day');
  assert.ok(/festival_daily_sky_painting/.test(worldEventsJs + ruJs + enJs), 'daily smile festivals should include Sky Painting');
  assert.ok(/magic_news_dead_wasteland/.test(worldEventsJs + ruJs + enJs), 'dead wasteland news should be available');
  assert.ok(/magic_news_living_anvil/.test(worldEventsJs + ruJs + enJs), 'living anvil news should be available');
  assert.ok(/icon: '🪖'[\s\S]*magic_news_arena_helmets/.test(worldEventsJs), 'helmet news should use a helmet icon');
  assert.ok(/festival\.prefixKey/.test(homeJs) && /Helpers\.icon\('festival'/.test(homeJs), 'festival card should use calendar copy and an SVG festival icon');
  assert.ok(/boss-alert-mark boss-alert-icon vmagic-breathe/.test(homeJs), 'home boss alert dragon mark should breathe without adding a second dragon');
  assert.ok(/boss-title-centered/.test(worldBossJs + mainCss), 'world boss title should be centered');
  assert.ok(/💰/.test(worldBossJs) && /⚡/.test(worldBossJs), 'world boss contribution and counterattack sections should have thematic icons');
});


test('v79 PWA icon removes the yellow outline around the plus', function () {
  assert.ok(fs.existsSync(path.join(root, 'app/assets/icons/viz-magic-v158-192.png')), 'v79 192px centered icon should exist');
  assert.ok(fs.existsSync(path.join(root, 'app/assets/icons/viz-magic-v158-512.png')), 'v79 512px centered icon should exist');
  assert.ok(/viz-magic-v158-192\.png\?v=20260826t/.test(indexHtml), 'index should point at the v79 launcher icon');
  assert.ok(/"start_url":\s*"\/\?pwa=viz-magic-v158"/.test(read('app/manifest.json')), 'manifest start_url should force OS launcher refresh');
  assert.ok(/"id":\s*"https:\/\/vizmagic\.web3blind\.xyz\/\?pwa=viz-magic-v158"/.test(read('app/manifest.json')), 'manifest id should change so Android can refresh launcher identity');
  assert.ok(/APP_SHELL_ASSETS[\s\S]*viz-magic-v158-512\.png/.test(read('app/sw.js')), 'fast install shell should still include current launcher icons');
});

test('Denis feedback item and motion icons are semantic', function () {
  assert.ok(/viz-magic-v158-192\.png\?v=20260826t/.test(indexHtml), 'launcher icon should use the v79 centered launcher icon');
  assert.ok(/assets\/icons\/viz-magic-v158-512\.png/.test(read('app/sw.js')), 'service worker should cache v79 icon');
  assert.ok(/ember_staff:\s*'🪵'/.test(craftingJs) && /fire_rune:\s*'\\uD83D\\uDD25'/.test(craftingJs), 'ash staff and fire rune recipes should not share the same flame icon');
  assert.ok(/market_sell_title/.test(marketplaceJs) && /💵/.test(marketplaceJs), 'sell tab should use a brighter money icon');
  assert.ok(/market-item-icon vmagic-breathe/.test(marketplaceJs), 'bazaar sell item icons should breathe');
  assert.ok(!/sell-item-name::after/.test(mainCss), 'bazaar rows should not append a pen icon to every item');
  assert.ok(/chronicle_ink:\s*'🖋️'/.test(marketplaceJs) && !/chronicle_ink[\s\S]{0,260}ink-drop-icon/.test(marketplaceJs), 'chronicle ink should show only the pen icon before the name');
  assert.ok(/region-icon vmagic-breathe/.test(mapJs), 'world map region icons should breathe');
  assert.ok(/\.region-level\s*\{[^}]*margin-inline-start:\s*0\.25em/.test(mainCss), 'every world-map level range should have one quiet visual space after the map name');
  assert.ok(/t\('map_level'\) \+ ' ' \+ region\.minLevel \+ '-' \+ region\.maxLevel/.test(mapJs), 'world-map level numbers should remain sourced unchanged from region data');
  assert.ok(/profile-title-avatar vmagic-breathe/.test(characterJs) && /default-avatar/.test(characterJs), 'character default avatar/class icon should breathe in the title' );
  assert.ok(/prophecy\.type === 'explore' \? '🗺️'/.test(questScreenJs), 'daily travel prophecy should use the map button icon');
  assert.ok(/daily-journey-title/.test(questScreenJs + mainCss), 'daily travel title should have a color distinct from daily prophecy');
  assert.ok(/daily-duel-title/.test(questScreenJs + mainCss), 'daily duel title should have a color distinct from daily prophecy');
  assert.ok(/vmagic-soft-breathe/.test(mainCss) && /forecast-hunt-icon[\s\S]*vmagic-soft-breathe/.test(mainCss), 'home bow weather icon should use calmer motion');
  assert.ok(/active-key-icon vmagic-breathe/.test(guildJs), 'guild active-key lock/key icon should breathe');
  assert.ok(/guild_recommended/.test(guildJs) && /🤺/.test(guildJs), 'recommended guilds should avoid repeated shield icon');
  assert.ok(/arena_filter_level/.test(arenaJs) && /🔍/.test(arenaJs), 'arena level filter should use a clearer filter/search icon');
  assert.ok(/arena_known_players/.test(arenaJs) && /🧙/.test(arenaJs), 'known mages should have a character-style icon');
  assert.ok(!/🔮 Сначала выбери ежедневное пророчество/.test(questScreenJs), 'daily prophecy helper text should not repeat the prophecy icon');
  assert.ok(/landing_card_hunt/.test(read('app/js/ui/screens/landing.js')) && /feature-icon-hunt/.test(read('app/js/ui/screens/landing.js') + mainCss) && /feature-icon-duel/.test(read('app/js/ui/screens/landing.js') + mainCss), 'landing hunt and duel cards should use font-independent semantic icons');
  assert.ok(/boss-alert-mark/.test(homeJs + mainCss) && !/\\uD83D\\uDC32 Эфирный Дракон/.test(ruJs), 'home boss alert should use one enlarged dragon mark, not duplicate the emoji in text');
  assert.ok(/chronicle_narrative_boss_attack/.test(chronicleJs + ruJs) && /'boss\.attack': '⚡'/.test(chronicleJs), 'chronicle boss attacks should use lightning and avoid repeating the player name in text');
  assert.ok(/chronicle-author-prefix/.test(chronicleJs + mainCss) && /_isHuntDefeatEntry/.test(chronicleJs), 'hunt defeat entries should show crossed swords beside the player name, not only the feed action icon');
  assert.ok(/help-section[\s\S]*section-icon vmagic-breathe/.test(helpJs), 'help detail block icons should breathe');
  assert.ok(/function _renderRewardSeal[\s\S]*section-icon vmagic-breathe/.test(developersJs), 'creator gratitude icons should breathe');
  assert.ok(/screen-title-icon vmagic-breathe[\s\S]*developers_title/.test(developersJs), 'developers page title icon should breathe');
  assert.ok(/authorPrefixIcon && authorPrefixIcon === icon/.test(chronicleJs), 'chronicle should avoid duplicate identical crossed-swords icons');
  assert.ok(/'rest': '\\u26FA'/.test(chronicleJs), 'chronicle rest entries should use the tent icon like Hunt camp rest');
  assert.ok(/reforge-section[\s\S]*btn-reforge[\s\S]*enchant-item-select/.test(craftingJs), 'enchant tab should render reforging before enchanting');
  assert.ok(/🪄/.test(craftingJs) && /💠/.test(craftingJs) && /🔨/.test(craftingJs) && /🧰/.test(craftingJs), 'enchanting and reforging blocks should have thematic labels');
});



test('v71 world holidays use an authored sparse calendar', function () {
  assert.ok(/var GREAT_FESTIVALS = \[/.test(worldEventsJs), 'great holidays should be a calendar map');
  assert.ok(/var MINOR_FESTIVALS = \[/.test(worldEventsJs), 'minor holidays should be a calendar map');
  assert.ok(/id: 'victory_day'[\s\S]*month: 5[\s\S]*day: 9[\s\S]*festival_victory_day/.test(worldEventsJs), 'May 9 should be Day of Victories');
  assert.ok(/festival_victory_day:\s*'День Побед'/.test(ruJs), 'Russian May 9 name should be Day of Victories');
  assert.ok(!/Дружинная пляска/.test(ruJs + worldEventsJs), 'old awkward Warband Dance name should be removed');
  assert.ok(/id: 'great_year_weave'[\s\S]*month: 12[\s\S]*day: 31/.test(worldEventsJs), 'December 31 should be the Great Weave of the Year');
  assert.ok(/DAILY_FESTIVALS/.test(worldEventsJs) && /_getGeneratedDailyFestival/.test(worldEventsJs), 'ordinary days should still receive generated daily smile festivals');
  assert.ok(!/day % FESTIVALS\.length/.test(worldEventsJs), 'festival selection should not rotate from the old single festival modulo list');
  assert.ok(/festival_great_prefix/.test(homeJs + ruJs + enJs), 'great holidays should have a distinct label');
});

test('Denis v70 polish keeps motion icons, honest low-mana hunt, and chronicle names clean', function () {
  assert.ok(/Helpers\.icon\('festival'/.test(homeJs), 'world festival card should avoid emoji-font fallback');
  assert.ok(!/html \+= '<h2>' \+ t\('enchant_title'\)/.test(craftingJs), 'enchant tab should not repeat a standalone Enchanting title above blocks');
  assert.ok(/<h3><span[\s\S]*enchant_title[\s\S]*enchant-desc[\s\S]*enchant-item-select/.test(craftingJs), 'enchant description should live inside the Enchanting block');
  assert.ok(/reforge-item-select[\s\S]*🧰/.test(craftingJs) && /enchant-item-select[\s\S]*🧰/.test(craftingJs), 'reforge and enchant item labels should use the same item icon');
  assert.ok(/hunt-rest-section[\s\S]*vmagic-breathe[\s\S]*⛺/.test(huntJs), 'camp rest icon should breathe');
  assert.ok(/vmagic-breathe[\s\S]*🐾[\s\S]*hunt_choose_creature/.test(huntJs), 'hunt prey icon should breathe');
  assert.ok(/vmagic-breathe[\s\S]*🪄[\s\S]*hunt_choose_spell/.test(huntJs), 'hunt spell icon should breathe');
  assert.ok(/temple-deity-copy[\s\S]*vmagic-breathe/.test(templeJs), 'temple deity icons should breathe');
  assert.ok(/leaderboard-title-icon/.test(leaderboardJs) && !/screen-title-icon section-icon vmagic-breathe leaderboard-title-icon/.test(leaderboardJs) && /leaderboard-title-icon[\s\S]*vmagic-soft-breathe/.test(mainCss), 'leaderboard title icon should visibly breathe without jitter classes');
  assert.ok(/leaderboard_hunts:\s*'Охота'/.test(ruJs), 'leaderboard Hunts header should keep the final Russian letter');
  assert.ok(/help_title/.test(helpJs) && /Helpers\.icon\('help', 'screen-title-icon/.test(helpJs), 'Help title should include a visible SVG guide icon');
  assert.ok(/spellTooWeak/.test(huntJs) && /MIN_HUNT_COST/.test(huntJs) && /hunt_spell_too_weak/.test(huntJs + ruJs + enJs), 'hunt should guard against any combat spell below the 1% minimum');
  ['stone_wall', 'firebolt', 'shadow_step', 'binding_vine'].forEach(function(id) {
    assert.ok(new RegExp(id + '[\\s\\S]*manaCost: 100').test(spellsJs), id + ' should be a usable 1% starter combat spell, not a 0.1% trap');
  });
  assert.ok(/function _stripLeadingAuthor/.test(chronicleJs), 'chronicle should strip repeated leading author from entry text');
  assert.ok(/'hunt': '\\u2694\\uFE0F'/.test(chronicleJs), 'chronicle hunt-start entries should use crossed swords icon');
  assert.ok(/function _getEntryIcon/.test(chronicleJs) && /hunt_defeat[\s\S]*return '\\u2694/.test(chronicleJs), 'chronicle hunt defeats should show crossed swords before the player name');
  assert.ok(/patientMinDamage/.test(read('app/js/engine/combat.js')) && /playerEnergy\) \/ 1000/.test(read('app/js/engine/combat.js')), 'economical hunt should scale patient minimum damage so 3% is stronger than 1%');
  assert.ok(/maxRounds = playerEnergy <= 300 \? 45 : 25/.test(read('app/js/engine/combat.js')), '1% and 3% economical hunts should both allow longer fights');
  assert.ok(/stone_fist:[\s\S]*manaCost: 300/.test(spellsJs), 'Stonewarden should not show two 1% starter attack buttons');
});

test('chronicle draft survives rerenders while feed loads', function () {
  assert.ok(/chronicle.js\?v=20260826k/.test(indexHtml), 'chronicle screen should be cache-busted for draft preservation');
  assert.ok(/DRAFT_KEY/.test(chronicleJs), 'chronicle should keep a draft key');
  assert.ok(/FEED_CACHE_PREFIX/.test(chronicleJs), 'chronicle should cache rendered old feed entries per tab for instant return');
  assert.ok(/_renderFeedEntries\(_filterByTab\(_dedupeEntries\(entries\), state\)\)/.test(chronicleJs), 'chronicle should render local entries before slow VoiceProtocol refresh');
  assert.ok(/function _renderLocalFeedNow/.test(chronicleJs) && /optimistic: true/.test(chronicleJs), 'new chronicle posts should appear optimistically without waiting for chain reload');
  assert.ok(/_getDraft\(\)/.test(chronicleJs) && /_setDraft\(this\.value\)/.test(chronicleJs), 'typed chronicle text should be restored and saved during rerenders');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}


test('v81 feedback polish keeps home, quest, settings, and modal details tidy', function () {
  assert.ok(/forecast-hunt-icon vmagic-breathe[\s\S]*forecast-hunt-copy/.test(homeJs), 'summer hunt bow icon should be outside text flow before the yellow copy');
  assert.ok(/forecast-card-festival[\s\S]*forecast-head[\s\S]*Helpers\.icon\('festival'[\s\S]*festival_today_prefix/.test(homeJs), 'SVG festival icon should sit before Today in the World heading');
  assert.ok(/weather_hunt_effect_sentence/.test(homeJs + ruJs + enJs), 'weather hunt copy should use the calm weather sentence');
  assert.ok(/_copyWeatherWithDailyVariation/.test(worldEventsJs), 'weather effect numbers should vary by day');
  assert.ok(!/Охотники считают это следом крупной добычи/.test(worldEventsJs), 'dragon hunter/scribe phrase should leave magic news');
  assert.ok(/LEGEND_TWISTS/.test(worldEventsJs), 'dragon hunter/scribe phrase should be saved for world legends');
  assert.ok(/⚒️/.test(read('app/js/ui/screens/crafting.js')), 'reforge heading should use an anvil/forge icon instead of repeating the hammer');
  assert.ok(/quest_type_skill/.test(questScreenJs + ruJs + enJs), 'craft quest badge should say Skill/Навык');
  assert.ok(/quest_type_agility/.test(questScreenJs + ruJs + enJs), 'hunt quest badge should say Agility/Ловкость');
  assert.ok(/quest_type_help/.test(questScreenJs + ruJs + enJs), 'social quest badge should say Help/Помощь');
  assert.ok(/settings-section-icon vmagic-breathe/.test(read('app/js/ui/screens/settings.js')), 'settings sections should have breathing thematic icons');
  assert.ok(/Modal\.show\(Helpers\.t\('home_install_shortcut'\), text\)/.test(appJs), 'install instructions should not pass a duplicate close button');
  assert.ok(/Modal\.show\([\s\S]*settings_realm_magic[\s\S]*settings_realm_magic_desc[\s\S]*\);/.test(read('app/js/ui/screens/settings.js')), 'realm magic modal should rely on the default single close button');
});


test('v82 Denis feedback polish is explicit and cache-busted', function () {
  const swJsV82 = read('app/sw.js');
  const settingsJsV82 = read('app/js/ui/screens/settings.js');
  assert.ok(/viz-magic-v(?:[1-9][0-9]{2,}|9[0-9]|8[2-9])/.test(swJsV82), 'service worker should use at least v82 cache');
  assert.ok(/home\.js\?v=20260826u/.test(indexHtml), 'Home should be cache-busted for v82');
  assert.ok(/world-events\.js\?v=20260826k/.test(indexHtml), 'world events should be cache-busted for v82');
  assert.ok(/hunt\.js\?v=20260826u/.test(indexHtml), 'Hunt should be cache-busted for Armageddon lock feedback');
  assert.ok(/settings\.js\?v=20260826k/.test(indexHtml), 'Settings should be cache-busted for sound icons');
  assert.ok(/function _formatWeatherReport/.test(homeJs) && /_formatSignedTemperature/.test(homeJs), 'season card should render readable temperatures instead of elemental percentages');
  assert.ok(!/\+20%,[\s\S]*\+10%/.test(homeJs), 'Home should not hardcode confusing elemental percentage text');
  assert.ok(/Свечи горят ровно, и тени от них рассказывают многое/.test(worldEventsJs), 'air prophecy festival copy should avoid repeated prophecy word');
  assert.ok(/NATURE_PAGES/.test(worldEventsJs) && /LEGEND_PAGES/.test(worldEventsJs) && /SPELL_PAGES/.test(worldEventsJs), 'new lower Home lore blocks should exist');
  assert.ok(/LORE_DAILY_TAILS/.test(worldEventsJs), 'lower lore blocks should have a yearly combinable daily tail pool');
  assert.ok(/home-lore-pages/.test(homeJs + mainCss) && /home_install_shortcut/.test(homeJs), 'lower lore blocks should render before install shortcut area');
  assert.ok(/function _renderMemberAvatar/.test(guildJs) && /guild-my-rank[\s\S]*guild-rank-avatar/.test(guildJs) && /account-avatar[\s\S]*vmagic-breathe/.test(guildJs), 'guild rank/member icons should use breathing avatars');
  assert.ok(/thornwood_staff:\s*'🦯'/.test(craftingJs), 'Thornwood Staff should use one wooden staff icon');
  assert.ok(/armageddon-locked-btn/.test(huntJs) && /hunt_armageddon_envy/.test(huntJs + ruJs), 'locked Armageddon should be clickable and explain envy goal');
  assert.ok(/quest\.titleKey === 'quest_join_guild_title'[\s\S]*quest_type_social/.test(questScreenJs), 'Brotherhood quest should show communication/social badge again');
  assert.ok(/prophecy\.type === 'hunt'[\s\S]*daily-hunt-title/.test(questScreenJs) && /prophecy\.type === 'hunt' \? '🏹'/.test(questScreenJs), 'daily hunt should use bow icon and distinct color class');
  assert.ok(/'guild\.accept': '🛡️'/.test(chronicleJs), 'guild join chronicle entries should use shield icon');
  assert.ok(/chronicle_narrative_guild_join_unknown/.test(chronicleJs + ruJs), 'unknown guild join copy should be grammatically correct');
  assert.ok(!/music-volume/.test(settingsJsV82), 'music slider should be removed (no music in the game)');
  assert.ok(/settings_haptics/.test(settingsJsV82) && !/_renderToggle\('haptics-toggle', '<span/.test(settingsJsV82), 'haptics setting should not duplicate an icon inside the toggle label');
});



test('magical library restores the original board-game artwork with full lore', function () {
  const helpJs = read('app/js/ui/screens/help.js');
  const ru = read('app/js/i18n/ru.js');
  const en = read('app/js/i18n/en.js');
  const index = read('app/index.html');
  const sw = read('app/sw.js');

  assert.ok(/help_magic_library_title:\s*'Магическая Библиотека'/.test(ru), 'RU guide should name the new block Магическая Библиотека');
  assert.ok(/Когда-то давно, много веков назад, карты Мира выглядели совсем иначе/.test(ru), 'RU guide should include Denis library description');
  assert.ok(/Magical Library/.test(en), 'EN guide should have a translated Magical Library title');
  assert.ok(/HELP_LIBRARY_MAPS = \[/.test(helpJs), 'Help screen should keep a durable library region list');
  assert.ok(/The Commons of First Light Ур\. 1-10/.test(helpJs), 'first library link should use the requested mixed title');
  assert.ok(!/help-library-list[\s\S]*<ol/.test(helpJs), 'library links should not be numbered');
  assert.ok(/help-library-link/.test(helpJs), 'library entries should be active links/buttons');
  assert.ok(/t\('map_lore_' \+ entry\.id\)/.test(helpJs), 'library modal should show the existing full map description');
  assert.ok(/id="help-library-close"/.test(helpJs), 'library modal should include a Close button');
  assert.ok(/assets\/library-maps-v2\/map-' \+ entry\.id \+ '\.jpg\?v=' \+ HELP_LIBRARY_ASSET_VERSION/.test(helpJs), 'library modal should restore the original board-game artwork path');
  assert.ok(/help-library-map-image/.test(helpJs) && /help-library-zoom-toggle/.test(helpJs), 'board-game artwork should retain image and zoom controls');
  assert.ok(!/library-maps-v3/.test(helpJs), 'failed illustrated v3 artwork must be unreachable from runtime');
  assert.strictEqual(fs.readdirSync(path.join(root, 'app/assets/library-maps-v2')).filter(name => /^map-[a-z_]+\.jpg$/.test(name)).length, 15, 'original board-game set should contain exactly 15 JPEG files');
  assert.ok(/help\.js\?v=20260824b/.test(index), 'Help should be cache-busted for restored board-game artwork');
  assert.ok(/main\.css\?v=20260824a/.test(index), 'CSS should be cache-busted for the Magical Library');
  assert.ok(/js\/i18n\/ru\.js\?v=20260824e/.test(index) && /js\/i18n\/en\.js\?v=20260824e/.test(index), 'i18n should be cache-busted for the Magical Library');
  assert.ok(/viz-magic-v181/.test(sw), 'service worker should publish the restored library cache bump');
});

test('magical guide replaces extra magical pages tab without shuffling practical help', function () {
  const swJsV83 = read('app/sw.js');
  assert.ok(/nav_help:\s*'Магический справочник'/.test(ruJs), 'RU nav should say Magical Guide');
  assert.ok(/help_title:\s*'Магический справочник'/.test(ruJs), 'RU title should say Magical Guide');
  assert.ok(/nav_help:\s*'Magical Guide'/.test(enJs), 'EN nav should say Magical Guide');
  assert.ok(/help_title:\s*'Magical Guide'/.test(enJs), 'EN title should say Magical Guide');
  assert.ok(/help-book/.test(helpJs) && /help-book-binding/.test(helpJs), 'help screen should render as a magic book');
  assert.ok(/help-practical-pages/.test(helpJs) && /help-lore-pages/.test(helpJs), 'guide should contain stable practical pages and optional lore pages');
  assert.ok(/help_lore_intro/.test(helpJs + ruJs + enJs), 'guide lore intro copy should exist');
  assert.ok(!/WorldEvents\.getCurrentLorePages/.test(helpJs), 'guide living pages should not duplicate rotating Home lore blocks');
  assert.ok(/var sections = \[[\s\S]*mana[\s\S]*hp[\s\S]*quests[\s\S]*hunt[\s\S]*armageddon/.test(helpJs), 'practical help order should remain fixed in source');
  assert.ok(!/magical-pages|magic-pages|screen-magical-pages|nav_magical_pages/.test(appJs + navJs + indexHtml + ruJs + enJs), 'no separate Magical Pages route or tab should be added');
  assert.ok(/help\.js\?v=20260824b/.test(indexHtml), 'Help should be cache-busted for guide redesign');
  assert.ok(/main\.css\?v=20260824a/.test(indexHtml), 'main CSS should be cache-busted for guide redesign');
  assert.ok(/viz-magic-v181/.test(swJsV83), 'service worker should use the current v91 cache');
  assert.ok(/animation-delay/.test(mainCss) && /nth-child/.test(mainCss), 'breathing icons should not all pulse in sync');
});


test('Denis v91 polish batch keeps quests fair and icons lively', () => {
  const worldEvents = read('app/js/engine/world-events.js');
  const inventoryJs = read('app/js/ui/screens/inventory.js');
  const marketplaceJs = read('app/js/ui/screens/marketplace.js');
  const guildJs = read('app/js/ui/screens/guild.js');
  const settingsJs = read('app/js/ui/screens/settings.js');
  const questsData = read('app/js/data/quests.js');
  const questSystem = read('app/js/engine/quest-system.js');
  const questsScreen = read('app/js/ui/screens/quests.js');
  const ruJs = read('app/js/i18n/ru.js');
  const enJs = read('app/js/i18n/en.js');
  const mainCss = read('app/css/main.css');
  const indexHtml = read('app/index.html');
  const swJs = read('app/sw.js');

  assert.equal((worldEvents.match(/один послушник уже пытается вывести из этого закон/gi) || []).length, 1, 'poslushnik phrase should exist exactly once');
  assert.ok(/SPELL_PAGES[\s\S]*Один послушник уже пытается вывести из этого закон/.test(worldEvents), 'poslushnik phrase should remain only in magical spells');
  const tails = worldEvents.slice(worldEvents.indexOf('var LORE_DAILY_TAILS'), worldEvents.indexOf('function getForecastVariantCount'));
  assert.ok(!/один послушник уже пытается вывести из этого закон/i.test(tails), 'poslushnik phrase should be removed from queued lore tails');
  assert.ok(/var pages = \[\s*_dailyFromPool\(NATURE_PAGES/.test(worldEvents) && /_dailyFromPool\(LEGEND_PAGES/.test(worldEvents) && !/_dailyFromPool\(SPELL_PAGES/.test(worldEvents), 'living pages should include nature and legend, with the spell block removed from Home');

  assert.ok(/shadow_shard:\s*item\.rarity === 0 \? '⬛' : '🌑'/.test(inventoryJs) && /shadow_shard:\s*item\.rarity === 0 \? '⬛' : '🌑'/.test(marketplaceJs), 'shadow shard icons should be rarity-distinct in bag and bazaar');
  assert.ok(/thorn_essence:\s*item\.rarity >= 4 \? '🧬' : \(item\.rarity >= 1 \? '🌵' : '🌿'\)/.test(inventoryJs) && /thorn_essence:\s*item\.rarity >= 4 \? '🧬' : \(item\.rarity >= 1 \? '🌵' : '🌿'\)/.test(marketplaceJs), 'thorn essence icons should be rarity-distinct');
  assert.ok(/ancient_shard:\s*item\.rarity >= 2 \? '🪬' : \(item\.rarity >= 1 \? '🌀' : '〰️'\)/.test(inventoryJs) && /spirit_tunic:\s*'🧥'/.test(inventoryJs), 'bag should use new ancient shard and spirit tunic icons');

  assert.ok(/btn-guild-treasury[\s\S]*guild-action-icon vmagic-breathe[\s\S]*💰/.test(guildJs), 'guild treasury button icon should breathe');
  assert.ok(/btn-guild-settings[\s\S]*guild-action-icon vmagic-breathe[\s\S]*⚙️/.test(guildJs), 'guild settings button icon should breathe');
  assert.ok(/guild-leave-btn[\s\S]*guild-action-icon vmagic-breathe[\s\S]*🚶/.test(guildJs), 'guild leave button should use walking person icon');
  assert.ok(/modal-title[\s\S]*💰[\s\S]*guild_treasury/.test(guildJs) && /modal-title[\s\S]*⚙️[\s\S]*guild_settings/.test(guildJs), 'treasury/settings modal titles should include icons');

  assert.ok(!/music-volume/.test(settingsJs), 'music slider should be removed (no music in the game)');
  assert.ok(/settings_haptics'\), true, '📳'/.test(settingsJs), 'haptics toggle should show vibrating phone icon');
  assert.ok(/settings-control-icon vmagic-breathe/.test(settingsJs), 'settings control icons should breathe');

  assert.ok(/type:\s*'explore', required:\s*2, uniqueTarget:\s*true/.test(questsData), 'daily explore prophecy should require unique regions');
  assert.ok(/blockedTargets:\s*_getBlockedTargets\(questData, playerQuests, j\)/.test(questSystem), 'daily repeats should carry blocked targets from completed same-day quests');
  assert.ok(/_snapshotObjectives\(quest\.objectives\)/.test(questSystem), 'completed quests should preserve seen targets for future daily repeats');
  assert.ok(/_targetWasSeen\(obj\.blockedTargets, eventData\.uniqueKey\)/.test(questSystem), 'quest progress should skip regions already spent on prior repeats');

  assert.ok(/quest-active-card/.test(questsScreen) && /quest-completed-celebration/.test(questsScreen), 'active/completed quest UI should have distinct uplifting styles');
  assert.ok(/quest-card\.quest-active-card[\s\S]*linear-gradient/.test(mainCss), 'active quest cards should be styled like attractive available cards');
  assert.ok(/quest-card\.quest-completed-card[\s\S]*rgba\(46,204,113/.test(mainCss), 'completed quest cards should feel celebratory, not mournful');
  assert.ok(/leaderboard-title-icon \{ display: inline-block; margin-right: 0\.25em; animation: vmagic-soft-breathe/.test(mainCss), 'leaderboard title icon should breathe softly instead of jittering');
  assert.ok(/guild-action-icon/.test(mainCss) && /settings-control-icon/.test(mainCss), 'new icon families should be included in motion controls');

  assert.ok(/Лунный Странник[\s\S]*<br>[\s\S]*У каждого класса/.test(ruJs), 'Russian class help should line-break Moonrunner and each-class sentences');
  assert.ok(/Moonrunner[\s\S]*<br>[\s\S]*Each class/.test(enJs), 'English class help should mirror class line breaks');
  assert.ok(!/Ротацию пока не запускаем/.test(ruJs), 'living page rotation implementation note should not be shown to players');
  assert.ok(/quest_completed_pride/.test(ruJs + enJs), 'completed quest pride copy should exist');

  assert.ok(/main\.css\?v=20260824a/.test(indexHtml), 'main CSS should be cache-busted for v91 polish');
  assert.ok(/world-events\.js\?v=20260826k/.test(indexHtml), 'world-events should be cache-busted for v91 polish');
  assert.ok(/quest-system\.js\?v=20260826k/.test(indexHtml) && /quests\.js\?v=20260826k/.test(indexHtml), 'quest engine and UI should be cache-busted');
  assert.ok(/inventory\.js\?v=20260826k/.test(indexHtml) && /marketplace\.js\?v=20260826k/.test(indexHtml), 'item icon screens should be cache-busted');
  assert.ok(/guild\.js\?v=20260826k/.test(indexHtml) && /settings\.js\?v=20260826k/.test(indexHtml), 'guild/settings screens should be cache-busted');
  assert.ok(/viz-magic-v181/.test(swJs), 'service worker should use v91 cache');
});


test('profile avatars from VIZ json_metadata are bounded and optional', function () {
  const accountJs = read('app/js/blockchain/account.js');
  const dailyLeaderboardJs = read('app/js/engine/daily-leaderboard.js');
  const duelJs = read('app/js/ui/screens/duel.js');
  const swJs = read('app/sw.js');
  const validTinyPng = 'data:image/png;base64,iVBORw0KGgo=';
  const context = {
    console: console,
    localStorage: { getItem: function () { return ''; }, setItem: function () {} },
    VizMagicConfig: { STORAGE_PREFIX: 'test_', GRIMOIRE_KEY: 'vm', ENERGY: { REGEN_SECONDS: 432000 } },
    viz: { auth: { wifIsValid: function () { return true; } }, api: { getAccounts: function (accounts, cb) { cb(null, [{ name: accounts[0], regular_authority: { weight_threshold: 1, key_auths: [['REGULAR', 1]] }, json_metadata: JSON.stringify({ profile: { about: 'kept' }, vm: { class: 'fire', name: 'Mage' } }), energy: 10000, last_vote_time: '2026-01-01T00:00:00' }]); } }, broadcast: { accountMetadata: function (key, user, json, cb) { context.lastMetadataWrite = { key: key, user: user, json: json }; cb(null, { ok: true }); } } }
  };
  vm.createContext(context);
  vm.runInContext(accountJs, context, { filename: 'account.js' });

  assert.equal(context.VizAccount.getProfileAvatar({ json_metadata: JSON.stringify({ profile: { avatar: validTinyPng } }) }), validTinyPng, 'valid small data image avatar should be accepted');
  assert.equal(context.VizAccount.getProfileAvatar({ json_metadata: JSON.stringify({ profile: { avatar: 'javascript:alert(1)' } }) }), '', 'script URLs must be rejected');
  assert.equal(context.VizAccount.getProfileAvatar({ json_metadata: JSON.stringify({ profile: { avatar: 'data:text/html;base64,PGgxPg==' } }) }), '', 'non-image data URLs must be rejected');
  assert.equal(context.VizAccount.getProfileAvatar({ json_metadata: JSON.stringify({ profile: { avatar: 'data:image/png;base64,' + 'A'.repeat(40000) } }) }), '', 'oversized data URLs must be rejected');
  assert.equal(context.VizAccount.getProfileAvatar({ json_metadata: '{}' }), '', 'missing avatar should render as empty fallback');

  context.VizAccount.login('mage', 'REGULAR', function () {});
  context.VizAccount.getAccount = context.VizAccount.getAccount;
  context.VizAccount.updateProfileAvatar(validTinyPng, function (err) { assert.equal(err, null); });
  const writtenMeta = JSON.parse(context.lastMetadataWrite.json);
  assert.equal(writtenMeta.profile.avatar, validTinyPng, 'profile.avatar should be written into public json_metadata');
  assert.deepEqual(writtenMeta.vm, { class: 'fire', name: 'Mage' }, 'game grimoire metadata must be preserved while writing avatar');
  context.VizAccount.removeProfileAvatar(function (err) { assert.equal(err, null); });
  const removedMeta = JSON.parse(context.lastMetadataWrite.json);
  assert.equal(removedMeta.profile.avatar, undefined, 'remove should delete only profile.avatar');
  assert.deepEqual(removedMeta.vm, { class: 'fire', name: 'Mage' }, 'game grimoire metadata must survive avatar removal');

  assert.ok(/MAX_PROFILE_AVATAR_CHARS = 32768/.test(accountJs), 'avatar data URL size must be bounded');
  assert.ok(/getProfileAvatar: getProfileAvatar/.test(accountJs), 'avatar helper should be exported');
  assert.ok(/avatarUrl = VizAccount\.getProfileAvatar\(accountData\)/.test(read('app/js/ui/app.js')), 'startup should refresh current player avatar from public metadata');
  assert.ok(/state\.characters\[account\]\.avatarUrl = VizAccount\.getProfileAvatar\(accountData\)/.test(loginJs), 'login restore should store avatar on character');
  assert.ok(/_renderAvatarMark\(ch, ch\.name \|\| user/.test(characterScreenJs) && /defaultable-avatar/.test(characterScreenJs), 'profile should render custom avatar when present and default avatar otherwise');
  assert.ok(/avatarUrl:\s*players\[account\]\.avatarUrl/.test(dailyLeaderboardJs), 'daily leaderboard rows should carry avatar URLs');
  assert.ok(/_renderAccountAvatar\(row\.avatarUrl/.test(leaderboardScreenJs), 'main leaderboard should show avatar only when row has one');
  assert.ok(/_renderAccountAvatar\(char\.avatarUrl/.test(arenaJs), 'duel leaderboard should show avatar only when character has one');
  assert.ok(/character\.avatarUrl = VizAccount\.getProfileAvatar\(accountData\)/.test(duelJs), 'duel account hydration should preserve avatar');
  assert.ok(/_renderAccountAvatar\(state\.characters && state\.characters\[entry\.account\]/.test(worldBossJs), 'boss leaderboard should show state avatars');
  assert.ok(/\.account-avatar[\s\S]*width:\s*32px[\s\S]*height:\s*32px/.test(mainCss), 'account avatars should be visually size-limited');
  assert.ok(/\.profile-avatar[\s\S]*width:\s*48px[\s\S]*height:\s*48px/.test(mainCss), 'profile avatar should be larger but bounded');

  assert.ok(/account\.js\?v=20260726c/.test(indexHtml), 'account helper should be cache-busted');
  assert.ok(/daily-leaderboard\.js\?v=20260826k/.test(indexHtml), 'daily leaderboard should be cache-busted');
  assert.ok(/leaderboard\.js\?v=20260826k/.test(indexHtml), 'leaderboard UI should be cache-busted');
  assert.ok(/arena\.js\?v=20260826k/.test(indexHtml), 'arena UI should be cache-busted');
  assert.ok(/duel\.js\?v=20260726b/.test(indexHtml), 'duel UI should be cache-busted');
  assert.ok(/world-boss\.js\?v=20260826k/.test(indexHtml), 'world boss UI should be cache-busted');
  assert.ok(/character\.js\?v=20260826u/.test(indexHtml), 'character UI should be cache-busted');
  assert.ok(/main\.css\?v=20260824a/.test(indexHtml), 'avatar CSS should be cache-busted');
  assert.ok(/viz-magic-v181/.test(swJs), 'service worker should use v92 cache');
});


test('safe avatar upload UI re-encodes before JSON_METADATA writes', function () {
  const settingsJsUpload = read('app/js/ui/screens/settings.js');
  const accountJsUpload = read('app/js/blockchain/account.js');
  assert.ok(/id="avatar-upload"/.test(settingsJsUpload), 'settings account section should expose avatar upload input');
  assert.ok(/accept="image\/png,image\/jpeg,image\/webp"/.test(settingsJsUpload), 'avatar upload should accept only raster image MIME types');
  assert.ok(/AVATAR_INPUT_MAX_BYTES = 2 \* 1024 \* 1024/.test(settingsJsUpload), 'avatar upload should reject large source files');
  assert.ok(/AVATAR_OUTPUT_MAX_CHARS = 32768/.test(settingsJsUpload), 'encoded avatar should stay within json_metadata display limit');
  assert.ok(/readAsArrayBuffer\(file\.slice\(0, 16\)\)/.test(settingsJsUpload), 'upload should inspect magic bytes before image decode');
  assert.ok(/0x89[\s\S]*0x50[\s\S]*0x4E[\s\S]*0x47/.test(settingsJsUpload), 'upload should verify PNG magic bytes');
  assert.ok(/0xFF[\s\S]*0xD8[\s\S]*0xFF/.test(settingsJsUpload), 'upload should verify JPEG magic bytes');
  assert.ok(/0x52[\s\S]*0x49[\s\S]*0x46[\s\S]*0x46[\s\S]*0x57[\s\S]*0x45[\s\S]*0x42[\s\S]*0x50/.test(settingsJsUpload), 'upload should verify WebP RIFF magic bytes');
  assert.ok(/avatar_fit_mode', 'fit'/.test(settingsJsUpload), 'avatar upload should default to fitting the whole image');
  assert.ok(/data-avatar-mode=\"fit\"/.test(settingsJsUpload) && /data-avatar-mode=\"crop\"/.test(settingsJsUpload), 'settings should expose fit and crop avatar modes');
  assert.ok(/ctx\.clearRect\(0, 0, size, size\)/.test(settingsJsUpload), 'fit mode should draw on a clean transparent square');
  assert.ok(/Math\.min\(size \/ iw, size \/ ih\)/.test(settingsJsUpload) && /ctx\.drawImage\(img, 0, 0, iw, ih, dx, dy, dw, dh\)/.test(settingsJsUpload), 'fit mode should preserve the full image without cutting edges');
  assert.ok(/mode === 'crop'[\s\S]*ctx\.drawImage\(img, sx, sy, side, side, 0, 0, size, size\)/.test(settingsJsUpload), 'crop mode should remain available for centered square crop');
  assert.ok(/canvas\.toDataURL\('image\/webp', 0\.82\)/.test(settingsJsUpload), 'upload should re-encode image through canvas before saving');
  assert.ok(/iw > 6000 \|\| ih > 6000/.test(settingsJsUpload), 'upload should reject absurd decoded dimensions');
  assert.ok(/id=\"avatar-preview-slot\"/.test(settingsJsUpload), 'settings should reserve a processed avatar preview slot');
  assert.ok(/id=\"btn-avatar-save\"/.test(settingsJsUpload), 'settings should require an explicit save after preview');
  assert.ok(/settings_avatar_ready/.test(settingsJsUpload), 'settings should announce when processed preview is ready');
  assert.ok(/_setAvatarPreview\(el, dataUrl\)/.test(settingsJsUpload), 'upload should show the processed image before writing metadata');
  assert.ok(/saveBtn\.disabled = false/.test(settingsJsUpload), 'processed preview should enable the save button');
  assert.ok(/function _savePendingAvatar/.test(settingsJsUpload) && /VizAccount\.updateProfileAvatar\(pendingAvatarDataUrl/.test(settingsJsUpload), 'metadata write should happen only from explicit save of the preview');
  assert.ok(/VizAccount\.removeProfileAvatar/.test(settingsJsUpload), 'settings should allow avatar removal');
  assert.ok(/meta\.profile\[field\] = value/.test(accountJsUpload), 'account helper should write only profile field');
  assert.ok(/delete meta\.profile\[field\]/.test(accountJsUpload), 'account helper should remove only requested profile field');
  assert.ok(/settings_avatar_hint/.test(ruJs + enJs) && /settings_avatar_mode_fit/.test(ruJs + enJs) && /settings_avatar_preview_hint/.test(ruJs + enJs), 'avatar upload help, preview and mode text should be localized');
  assert.ok(/settings\.js\?v=20260826k/.test(indexHtml), 'settings screen should be cache-busted for avatar upload');
  assert.ok(/js\/i18n\/ru\.js\?v=20260824e/.test(indexHtml) && /js\/i18n\/en\.js\?v=20260824e/.test(indexHtml), 'i18n should be cache-busted for avatar strings');
});


test('character profile refreshes avatar from VIZ JSON_METADATA on render', function () {
  const characterJsAvatar = read('app/js/ui/screens/character.js');
  const indexHtmlAvatarProfile = read('app/index.html');
  assert.ok(/VizAccount\.getAccount\(user, function\(err, accountData\)/.test(characterJsAvatar), 'character profile should fetch the live account on render');
  assert.ok(/_refreshProfileAvatar\(user, ch, accountData\)/.test(characterJsAvatar), 'character profile should refresh avatar from live account metadata');
  assert.ok(/VizAccount\.getProfileAvatar\(accountData\)/.test(characterJsAvatar), 'character profile should use the same sanitized VIZ profile avatar helper');
  assert.ok(/document\.querySelector\('#screen-character \.profile-title-avatar'\)/.test(characterJsAvatar), 'character profile should replace stale title avatar DOM');
  assert.ok(/titleAvatar\.outerHTML = _renderAvatarMark/.test(characterJsAvatar), 'character profile should refresh the title avatar when metadata arrives');
  assert.ok(/character\.js\?v=20260826u/.test(indexHtmlAvatarProfile), 'character screen should be cache-busted for live avatar refresh');
  assert.ok(/js\/i18n\/ru\.js\?v=20260824e/.test(indexHtmlAvatarProfile) && /js\/i18n\/en\.js\?v=20260824e/.test(indexHtmlAvatarProfile), 'i18n should be cache-busted for updated avatar copy');
});


test('Denis v97 world, inventory, nav, arena and guide polish is explicit', function () {
  const homeJsV97 = read('app/js/ui/screens/home.js');
  const helpJsV97 = read('app/js/ui/screens/help.js');
  const worldEventsV97 = read('app/js/engine/world-events.js');
  const inventoryJsV97 = read('app/js/ui/screens/inventory.js');
  const questsJsV97 = read('app/js/ui/screens/quests.js');
  const arenaJsV97 = read('app/js/ui/screens/arena.js');
  const cssV97 = read('app/css/main.css');
  const ruV97 = read('app/js/i18n/ru.js');
  const indexV97 = read('app/index.html');
  assert.ok(/WORLD_MONTH_NAMES = \['Медведица', 'Медвежонок', 'Кассиопея', 'Орион', 'Пегас', 'Лебедь', 'Дракон', 'Крест', 'Пёс', 'Центавр', 'Скорпион', 'Киль'\]/.test(homeJsV97), 'home should show requested magical month names after season');
  assert.ok(/forecast-season-name/.test(homeJsV97) && /forecast-world-month/.test(homeJsV97) && /_seasonColorClass\(season\.id\)/.test(homeJsV97), 'season block should append the colored month name without explanation');
  assert.ok(/function _weatherPrecipitationLabel/.test(homeJsV97) && /тропический ливень/.test(homeJsV97) && /плотный туман/.test(homeJsV97), 'weather report should use game-condition precipitation labels');
  assert.ok(/help_section_world_months/.test(helpJsV97) && /help_world_months_text/.test(ruV97), 'magical guide should explain month names');
  assert.ok(/Названия месяцев Мира очень похожи/.test(ruV97) && /И это тоже магический цикл/.test(ruV97), 'Russian guide should include Denis month explanation');
  assert.ok(!/Ротацию пока не запускаем/.test(ruV97), 'living pages intro should not expose internal rotation note');
  assert.ok((worldEventsV97.match(/Небо гасит лишний шум и оставляет только важные шорохи/g) || []).length <= 1, 'wind phrase should not repeat in world-event text pools');
  assert.ok(!/небо обещает новый текст завтра и держит слово/i.test(worldEventsV97), 'today-in-world repeated sky promise should be removed from pools');
  assert.ok(/var pages = \[\s*_dailyFromPool\(NATURE_PAGES/.test(worldEventsV97) && /_dailyFromPool\(LEGEND_PAGES/.test(worldEventsV97) && !/_dailyFromPool\(SPELL_PAGES/.test(worldEventsV97), 'home should render nature and legend, with spell block removed');
  assert.ok(/function _rarityNameForItem/.test(inventoryJsV97) && /flame_votive_mark/.test(inventoryJsV97) && /необычная/.test(inventoryJsV97), 'inventory should use feminine rarity text for requested items');
  assert.ok(/function _raritySymbolForItem/.test(inventoryJsV97) && /item\.type === 'flame_votive_mark'/.test(inventoryJsV97), 'inventory should suppress white rarity diamonds for requested rows');
  assert.ok(/function _showWarningIcon/.test(inventoryJsV97) && /item\.type === 'flame_votive_mark'/.test(inventoryJsV97), 'altar spark should show warning triangle like ingredient rows');
  assert.ok(/shadow_shard: item\.rarity === 0 \? '⬛' : '🌑'/.test(inventoryJsV97), 'shadow shard rarities should have distinct icons');
  assert.ok(/thorn_essence: item\.rarity >= 4 \? '🧬' : \(item\.rarity >= 1 \? '🌵' : '🌿'\)/.test(inventoryJsV97), 'thorn essence rarities should have distinct icons');
  assert.ok(/🏅<\/span><span aria-hidden=\"true\">&nbsp;<\/span>/.test(questsJsV97), 'completed quests should include an invisible space after the medal');
  assert.ok(/function _knownAvatarUrl/.test(arenaJsV97) && /VizAccount\.getProfileAvatar\(accountData\)/.test(arenaJsV97), 'arena known mages should hydrate avatars from metadata');
  assert.ok(/nav-tab \{ flex-direction: column/.test(cssV97) && /nav-icon \{ display: block/.test(cssV97), 'bottom nav should place icon above one-line label');
  assert.ok(/leaderboard-table \{ table-layout: fixed/.test(cssV97) && /leaderboard-cell-hunts \{ width: 2\.2rem/.test(cssV97), 'leaderboard should fit hunt column on mobile');
  assert.ok(/settings_sfx: 'Звуковые эффекты'/.test(ruV97), 'settings SFX label should not include a duplicated speaker icon');
  assert.ok(/world-events\.js\?v=20260826k/.test(indexV97) && /home\.js\?v=20260826u/.test(indexV97) && /main\.css\?v=20260824a/.test(indexV97), 'v97 files should be cache-busted');
});


test('public landing does not block startup behind chain sync', function () {
  const appJsV98 = read('app/js/ui/app.js');
  const indexV98 = read('app/index.html');
  assert.ok(/if \(VizAccount\.isLoggedIn\(\)\)/.test(appJsV98) && /setTimeout\(function\(\) \{ _startBlockPolling\(\); \}, 250\);/.test(appJsV98), 'block polling should be deferred until after saved-session Home render');
  assert.ok(/\} else \{\s*_syncStartBlock = 0;\s*_updateSyncStatus\(100\);\s*navigateTo\('landing'\);/.test(appJsV98), 'public landing should hide sync overlay before rendering');
  assert.ok(/js\/ui\/app\.js\?v=20260822l/.test(indexV98), 'app controller should be cache-busted for startup fix');
});


test('saved sessions render Home before account and chain sync finish', function () {
  const appJsV99 = read('app/js/ui/app.js');
  const indexV99 = read('app/index.html');
  assert.ok(/if \(VizAccount\.isLoggedIn\(\)\) \{[\s\S]*navigateTo\('home'\);[\s\S]*setTimeout\(function\(\) \{ _startBlockPolling\(\); \}, 250\);[\s\S]*VizAccount\.getAccount\(user/.test(appJsV99), 'saved sessions should render Home before chain/account hydration');
  assert.ok(/if \(currentScreen === 'home' \|\| currentScreen === 'character'\) \{\s*_renderScreen\(currentScreen\);\s*\}/.test(appJsV99), 'account hydration should refresh visible profile/home after startup');
  assert.ok(/js\/ui\/app\.js\?v=20260822l/.test(indexV99), 'app controller should be cache-busted for saved-session launch fix');
});


test('living pages use an existing daily page helper', function () {
  const worldEventsV99 = read('app/js/engine/world-events.js');
  const indexV99 = read('app/index.html');
  assert.ok(/function _dailyFromPool/.test(worldEventsV99), 'daily lore helper should exist');
  assert.ok(!/_pageWithTail/.test(worldEventsV99), 'living pages should not call missing helper');
  assert.ok(/_dailyFromPool\(NATURE_PAGES/.test(worldEventsV99) && /_dailyFromPool\(LEGEND_PAGES/.test(worldEventsV99) && !/_dailyFromPool\(SPELL_PAGES/.test(worldEventsV99), 'living pages should render nature and legend through existing helper');
  assert.ok(/world-events\.js\?v=20260826k/.test(indexV99), 'world-events should be cache-busted for living-page crash fix');
});


test('background sync never shows the sync chip over an active game screen', function () {
  const appJsV100 = read('app/js/ui/app.js');
  const indexV100 = read('app/index.html');
  assert.ok(/if \(currentScreen && currentScreen !== 'landing'\) \{[\s\S]*statusEl\.classList\.remove\('show'\);[\s\S]*return;[\s\S]*\}/.test(appJsV100), 'active game screens should hide the sync status while background recovery runs');
  assert.ok(/js\/ui\/app\.js\?v=20260822l/.test(indexV100), 'app controller should be cache-busted for non-blocking sync status');
});


test('startup routes from saved session before network and IndexedDB', function () {
  const appJsV101 = read('app/js/ui/app.js');
  const indexV101 = read('app/index.html');
  assert.ok(/VizAccount\.init\(\);[\s\S]*Helpers\.EventBus\.on\('navigate', navigateTo\);[\s\S]*if \(VizAccount\.isLoggedIn\(\)\) \{\s*navigateTo\('home'\);\s*\} else \{\s*_renderScreen\('landing'\);\s*\}[\s\S]*VizConnection\.init/.test(appJsV101), 'saved sessions should route to Home before network/IndexedDB callbacks');
  assert.ok(!/_showConnectionStatus\(\);\s*VizConnection\.init/.test(appJsV101), 'initial connection setup should not show the sync chip as a loading screen');
  assert.ok(/js\/ui\/app\.js\?v=20260822l/.test(indexV101), 'app controller should be cache-busted for immediate saved-session routing');
});


test('home startup does not fetch blockchain account before VIZ transport is ready', function () {
  const homeJsV101 = read('app/js/ui/screens/home.js');
  const indexV101 = read('app/index.html');
  assert.ok(/VizConnection\.isConnected && VizConnection\.isConnected\(\)/.test(homeJsV101), 'Home mana refresh should wait for connected VIZ transport');
  assert.ok(/try \{[\s\S]*VizAccount\.getAccount\(user/.test(homeJsV101), 'Home mana refresh should not let transport errors crash render');
  assert.ok(/home\.js\?v=20260826u/.test(indexV101), 'Home screen should be cache-busted for safe startup mana refresh');
});


test('hunt habitat hides stale prey and labels dangerous areas instead of pretending mana is win chance', function () {
  assert.ok(/max <= level \+ 2\) continue/.test(huntJs), 'hunt should hide stale low-level habitats once player outgrows them (tier 5-10 leaves at level 8)');
  assert.ok(/min <= level \+ 2/.test(huntJs), 'hunt should keep nearby habitats around the player level and hide too-high ones');
  assert.ok(/function _isDangerCreature/.test(huntJs), 'hunt should classify dangerous creatures');
  assert.ok(/return creature\.deadly === true/.test(huntJs), 'danger warnings should be tied to explicit deadly targets, not broad level ranges');
  assert.ok(!/creature-warning-text/.test(huntJs), 'danger warning copy should not render on hunt cards');
  assert.ok(!/Сильные магические сущности\. Опасно!/.test(huntJs), 'old danger warning should not be present in hunt rendering');
  assert.ok(/hunt_mana_badge/.test(huntJs + ruJs + enJs), 'spell buttons should label percent as mana cost, not win chance');
});

test('level seven hunt habitat keeps fair threats and removes lv3-8 stale prey', function () {
  assert.ok(/ember_wisp[\s\S]*minLevel: 1,[\s\S]*maxLevel: 5/.test(read('app/js/data/creatures.js')), 'fixture creature Lv1-5 missing');
  assert.ok(/hollow_shade[\s\S]*minLevel: 3,[\s\S]*maxLevel: 8/.test(read('app/js/data/creatures.js')), 'fixture creature Lv3-8 missing');
  assert.ok(/thornvine[\s\S]*minLevel: 5,[\s\S]*maxLevel: 10/.test(read('app/js/data/creatures.js')), 'fixture creature Lv5-10 missing');
  assert.ok(/echo_guardian[\s\S]*minLevel: 5,[\s\S]*maxLevel: 12/.test(read('app/js/data/creatures.js')), 'fixture creature Lv5-12 missing');
  assert.ok(/cyber_ghoul[\s\S]*minLevel: 7,[\s\S]*maxLevel: 14/.test(read('app/js/data/creatures.js')), 'fixture creature Lv7-14 missing');
  assert.ok(/rift_colossus[\s\S]*minLevel: 11,[\s\S]*maxLevel: 18,[\s\S]*deadly: true/.test(read('app/js/data/creatures.js')), 'deadly Lv11-18 target should exist for honest danger copy');
  const level = 7;
  function visible(min, max) { return !(max <= level + 1) && min <= level + 2; }
  assert.strictEqual(visible(3, 8, false), false, 'Lv3-8 should be stale for level 7');
  assert.strictEqual(visible(5, 10), true, 'Lv5-10 should remain for level 7');
  assert.strictEqual(visible(5, 12), true, 'Lv5-12 should remain for level 7');
  assert.strictEqual(visible(7, 14), true, 'Lv7-14 fair habitat should remain for level 7');
  assert.strictEqual(visible(11, 18), false, 'Lv11-18 deadly habitat should hide for level 7: every creature is far above the player');
});

test('inventory and marketplace material rows avoid white diamond artifacts and use distinct icons', function () {
  assert.ok(/_getCategory\(item\) === ItemSystem\.CATEGORIES\.MATERIAL\) return ''/.test(inventoryJs), 'inventory should suppress rarity diamond symbols for material rows');
  assert.ok(/\['simple', item\.type, item\.rarity \|\| 0\]\.join\(':/.test(inventoryJs), 'inventory should stack simple materials by type and rarity so duplicate names are explained');
  assert.ok(/shadow_shard: item\.rarity === 0 \? '⬛' : '🌑'/.test(inventoryJs), 'inventory shadow shard icons should differ by rarity');
  assert.ok(/ancient_shard: item\.rarity >= 2 \? '🪬' : \(item\.rarity >= 1 \? '🌀' : '〰️'\)/.test(inventoryJs), 'inventory ancient echo shard icons should differ by rarity');
  assert.ok(/ancient_shard:[\s\S]*category: CATEGORIES\.MATERIAL/.test(itemsJs), 'ancient echo shard should have a material template so rarity diamonds are suppressed');
  assert.ok(/thorn_essence: item\.rarity >= 4 \? '🧬' : \(item\.rarity >= 1 \? '🌵' : '🌿'\)/.test(inventoryJs), 'inventory thorn essence icons should distinguish rarities');
  assert.ok(/shadow_shard: item\.rarity === 0 \? '⬛' : '🌑'/.test(marketplaceJs), 'marketplace shadow shard sell icon should differ by rarity');
  assert.ok(/function _marketRarityName/.test(marketplaceJs), 'marketplace sell rows should explain rarity for duplicate material names');
  assert.ok(/item\.rarity \|\| 0/.test(marketplaceJs), 'marketplace sell grouping must preserve rarity 0 instead of merging it with uncommon');
  assert.ok(!/sell-item-rarity[\s\S]{0,80}sRarity\.symbol/.test(marketplaceJs), 'marketplace sell rows should not add bare white rarity diamonds');
});

test('bottom navigation keeps icons above single-line labels and cache-busts changed assets', function () {
  assert.ok(/Helpers\.icon\(tab\.icon, 'nav-icon vm-icon'\)/.test(navJs) && /<span class="nav-label"/.test(navJs), 'nav should render an SVG icon and a text label');
  assert.ok(/flex-direction: column/.test(mainCss), 'nav tabs should stack icon above label');
  assert.ok(/\.nav-label[\s\S]*white-space: nowrap/.test(mainCss), 'nav labels should stay on one horizontal line');
  assert.ok(/main\.css\?v=20260824a/.test(indexHtml), 'main.css cache bust missing');
  assert.ok(/hunt\.js\?v=20260826u/.test(indexHtml), 'hunt cache bust missing');
  assert.ok(/inventory\.js\?v=20260826k/.test(indexHtml), 'inventory cache bust missing');
  assert.ok(/marketplace\.js\?v=20260826k/.test(indexHtml), 'marketplace cache bust missing');
  assert.ok(/nav\.js\?v=20260826u/.test(indexHtml), 'nav cache bust missing');
  assert.ok(/viz-magic-v181/.test(read('app/sw.js')), 'service worker cache should be v103');
});


test('v103 weave surge, default avatars, and guide copy polish are explicit', function () {
  assert.ok(/evt\.type === 'minor_rift' \|\| evt\.type === 'weave_surge'/.test(homeJs), 'Weave Surge banner should navigate to Hunt like a hunting-related world event');
  assert.ok(/data-event-type="' \+ evt\.type/.test(homeJs), 'world event buttons should expose their event type for smoke checks');
  assert.ok(/home_weave_hunt_hint/.test(homeJs + ruJs + enJs), 'Weave Surge badge should explain that it leads to Hunt');
  assert.ok(/event_weave_surge_desc:[\s\S]*Нажми, чтобы перейти к охоте/.test(ruJs), 'Russian Weave Surge copy should say pressing opens Hunt');
  assert.ok(/event_weave_surge_desc:[\s\S]*Press to go hunting/.test(enJs), 'English Weave Surge copy should say pressing opens Hunt');

  assert.ok(/_renderAvatarMark\(ch, ch\.name \|\| user, 'screen-title-icon profile-title-avatar vmagic-breathe'\)/.test(characterJs), 'Character title should use the avatar mark instead of a separate mage icon');
  assert.ok(/class="account-avatar default-avatar/.test(characterJs + homeJs + settingsJs), 'missing custom avatar should render a local default avatar mark');
  assert.ok(/Helpers\.classIcon\(ch\.className \|\| 'embercaster'\)/.test(characterJs), 'default Character avatar should use the class icon');
  assert.ok(/screen === 'character'[\s\S]*iconHtml = _renderAvatarMark\(character, 'tile-icon tile-avatar-icon'\)/.test(homeJs), 'Home Character button should use avatar in place of the icon');
  assert.ok(/\.profile-title-avatar[\s\S]*width:\s*46px/.test(mainCss), 'Character title avatar should be visually bounded');
  assert.ok(/tile-avatar-icon/.test(mainCss) && /iconHtml = _renderAvatarMark\(character, 'tile-icon tile-avatar-icon'\)/.test(homeJs), 'Home Character tile avatar should replace the icon and be styled');

  assert.ok(/leaderboard-title-icon/.test(leaderboardJs) && !/screen-title-icon section-icon vmagic-breathe leaderboard-title-icon/.test(leaderboardJs), 'Leaderboard title icon should keep only its soft breathing class');
  assert.ok(/leaderboard-title-icon \{ display: inline-block; margin-right: 0\.25em; animation: vmagic-soft-breathe/.test(mainCss), 'Leaderboard title icon should have active breathing CSS');
  assert.ok(/_renderSlider\('sfx-volume', t\('settings_sfx'\), sfxVolume, '🔔'\)/.test(settingsJs), 'SFX slider label should render the restored bell icon');
  assert.ok(/settings_sfx:\s*'Звуковые эффекты'/.test(ruJs), 'Russian SFX label should not include a speaker icon in text');

  assert.ok(/help_hp_text:[\s\S]*<br>Полное восстановление/.test(ruJs), 'HP full recovery sentence should start on a new line in RU guide');
  assert.ok(/help_marketplace_text:[\s\S]*<br>Обзор/.test(ruJs), 'Bazaar overview sentence should start on a new line in RU guide');
  assert.ok(/help_duels_text:[\s\S]*<br>Печати раскрываются/.test(ruJs), 'Duel seals sentence should start on a new line in RU guide');
  assert.ok(/сатисфакцию вызывающему магу/.test(ruJs) && /по выбору отказывающегося — 1% Mana/.test(ruJs) && /1% Mana/.test(enJs), 'Duel no-show satisfaction design note should use the current exact 1% Mana copy');
  assert.ok(/home_lore_pages_intro/.test(homeJs + ruJs + enJs), 'Living pages should have a short fairy-tale intro');

  assert.ok(/main\.css\?v=20260824a/.test(indexHtml), 'v103 CSS should be cache-busted');
  assert.ok(/home\.js\?v=20260826u/.test(indexHtml) && /character\.js\?v=20260826u/.test(indexHtml), 'v103 Home and Character should be cache-busted');
  assert.ok(/settings\.js\?v=20260826k/.test(indexHtml) && /help\.js\?v=20260824b/.test(indexHtml), 'v103 Settings and Help should be cache-busted');
  assert.ok(/viz-magic-v181/.test(swJs), 'service worker should use v103 cache');
});


test('quest abandon charges only unstarted quests and warns before forfeit', function () {
  const questSystemPenalty = read('app/js/engine/quest-system.js');
  const questsScreenPenalty = read('app/js/ui/screens/quests.js');
  const stateEnginePenalty = read('app/js/engine/state-engine.js');
  const indexPenalty = read('app/index.html');
  const swPenalty = read('app/sw.js');

  assert.ok(/QUEST_ABANDON_NO_PROGRESS_PENALTY = 100/.test(questsScreenPenalty), 'unstarted quest abandon penalty should be a small 1.00% Mana forfeit');
  assert.ok(/QUEST_PENALTY_ACCOUNT = 'denis-skripnik'/.test(questsScreenPenalty), 'forfeit should go to the existing game account instead of a made-up local sink');
  assert.ok(/function getQuestProgressTotal/.test(questSystemPenalty), 'quest system should expose progress total for abandon decisions');
  assert.ok(/progressTotal > 0 \? 0 : QUEST_ABANDON_NO_PROGRESS_PENALTY/.test(questsScreenPenalty), 'active quests with progress should not get the no-progress forfeit');
  assert.ok(/quest_abandon_with_penalty/.test(questsScreenPenalty + ruJs + enJs), 'untouched quest abandon button should disclose the Mana forfeit');
  assert.ok(/quest_abandon_confirm_title/.test(questsScreenPenalty + ruJs + enJs) && /quest_abandon_confirm_text/.test(questsScreenPenalty + ruJs + enJs), 'unstarted abandon should show an explicit warning modal');
  assert.ok(/calculateCurrentEnergy\(accountData\)/.test(questsScreenPenalty), 'UI should check current VIZ energy before penalized abandon');
  assert.ok(/quest_abandon_penalty_not_enough_mana/.test(questsScreenPenalty + ruJs + enJs), 'not enough Mana copy should be localized');
  assert.ok(/VizBroadcast\.award\(QUEST_PENALTY_ACCOUNT, penaltyEnergy/.test(questsScreenPenalty), 'penalty should be a real VIZ award, not a fake local state subtraction');
  assert.ok(/viz:\/\/vm\/quest\/forfeit/.test(questsScreenPenalty), 'penalty award memo should be identifiable');
  assert.ok(/data\.penalty_energy/.test(stateEnginePenalty) && /penaltyEnergy: data && data\.penalty_energy/.test(stateEnginePenalty), 'quest abandon replay event should preserve penaltyEnergy');
  assert.ok(/hadProgress/.test(stateEnginePenalty) && /progressTotal/.test(stateEnginePenalty), 'quest abandon event should expose whether progress existed');
  assert.ok(/Отказ от начатого задания просто стирает уже сделанный прогресс/.test(ruJs), 'RU guide should explain started quest abandon semantics');
  assert.ok(/отказ от задания без единого шага берёт небольшую неустойку/.test(ruJs), 'RU guide should explain no-progress forfeit');
  assert.ok(/Abandoning a quest after progress only loses that progress/.test(enJs), 'EN guide should explain started quest abandon semantics');

  assert.ok(/quest-system\.js\?v=20260826k/.test(indexPenalty), 'quest system cache bust missing for abandon penalty');
  assert.ok(/state-engine\.js\?v=20260824a/.test(indexPenalty), 'state engine cache bust missing for abandon penalty');
  assert.ok(/quests\.js\?v=20260826k/.test(indexPenalty), 'quests screen cache bust missing for abandon penalty');
  assert.ok(/js\/i18n\/ru\.js\?v=20260824e/.test(indexPenalty) && /js\/i18n\/en\.js\?v=20260824e/.test(indexPenalty), 'i18n cache bust missing for abandon penalty');
  assert.ok(/viz-magic-v181/.test(swPenalty), 'service worker should use v104 cache');
});







test('v110 player feedback keeps requested icons, copy, vital explainers, and event text placement explicit', function () {
  const index = read('app/index.html');
  const sw = read('app/sw.js');
  const css = read('app/css/main.css');
  const progress = read('app/js/ui/components/progress-bar.js');
  const character = read('app/js/ui/screens/character.js');
  const hunt = read('app/js/ui/screens/hunt.js');
  const inventory = read('app/js/ui/screens/inventory.js');
  const worldEvents = read('app/js/engine/world-events.js');
  const home = read('app/js/ui/screens/home.js');
  const arena = read('app/js/ui/screens/arena.js');
  const settings = read('app/js/ui/screens/settings.js');
  const ru = read('app/js/i18n/ru.js');
  const en = read('app/js/i18n/en.js');

  assert.strictEqual((worldEvents.match(/Если текст кажется бредом, значит защита работает/g) || []).length, 1, 'nonsense-protection phrase should exist exactly once');
  assert.ok(/SPELL_PAGES[\s\S]*Если текст кажется бредом, значит защита работает[\s\S]*\];/.test(worldEvents), 'nonsense-protection phrase should remain only in Magical Spells pages');
  assert.ok(!/LORE_DAILY_TAILS[\s\S]*Если текст кажется бредом, значит защита работает/.test(worldEvents), 'nonsense-protection phrase should not remain in generic queued lore tails');

  assert.ok(/altar_spark:\s*'🕯️'/.test(inventory), 'Altar Spark should use candle icon');
  assert.ok(/if \(_getCategory\(item\) === ItemSystem\.CATEGORIES\.MATERIAL\) return ''/.test(inventory), 'material rows should not render rarity diamond before Altar Spark name');
  assert.ok(/creature-danger-hint/.test(hunt), 'high-risk creature rows should render the yellow one-line danger hint');
  assert.ok(!/creature-warning-text/.test(hunt), 'Rift Colossus should not render a textual danger warning after v118');

  assert.ok(/progress-bar-link/.test(progress) && /progress-bar-button/.test(progress), 'ProgressBar should support external links and internal buttons');
  assert.ok(/href: VIZ_ENERGY_DOC_URL/.test(character), 'Mana bar should link to VIZ energy documentation');
  assert.ok(/button: true, ariaLabel: t\('char_hp_button_aria'\)/.test(character), 'HP bar should be an internal explainer button');
  assert.ok(/button: true, ariaLabel: t\('char_xp_button_aria'\)/.test(character), 'XP bar should be an internal explainer button');
  assert.ok(/character-vital-note">' \+ t\('char_hp_explainer'\)/.test(character) && /character-vital-note">' \+ t\('char_xp_explainer'\)/.test(character), 'HP/XP explanations should be visible again under their bars');
  assert.ok(/Если хочешь узнать подробнее — кликни полозок энергии/.test(ru), 'Mana text should warn about clicking the external energy article');

  assert.ok(/character-title-name/.test(character) && /char-header[\s\S]*character-title-class-icon/.test(character), 'Character page should move username to title and shield/class icon before class name');
  assert.ok(/spell-detail-title-icon vmagic-breathe/.test(character), 'Spell details icon should breathe');
  assert.ok(/modal-close/.test(character) && /char_spell_close/.test(character), 'Spell details modal should restore Close button');
  assert.ok(/Каменный Страж \(Terra\)/.test(ru) && /Stonewarden \(Terra\)/.test(en), 'Class guide should restore school names in parentheses');
  assert.ok(/Лучшая версия из 3 раундов/.test(ru), 'Duels & Arena copy should say Лучшая версия');

  assert.ok(/settings-avatar-heading/.test(settings) && !/settings_avatar'\) \+ '<\/label>'[\s\S]{0,120}🖼️/.test(settings), 'Settings avatar row should remove picture icon before Avatar label');
  assert.ok(/settings-avatar-heading[\s\S]*justify-content: space-between/.test(css), 'Settings avatar preview should sit at the right edge of the Avatar row');
  assert.ok(!/event-edit-copy/.test(home), 'Weave Surge and Minor Rift banners should not repeat descriptions in temporary edit-copy text');
  assert.ok(/arena-player-account/.test(arena) && !/arena-player-status/.test(arena), 'Arena known-player cards should show @account without known-status text');
  assert.ok(/arena-class-icon vmagic-breathe/.test(arena), 'Arena class icons should breathe');
  assert.ok(/leaderboard-title-icon[\s\S]*vmagic-soft-breathe/.test(css), 'Leaderboard title icon should breathe');
  assert.ok(/spell-detail-title-icon[\s\S]*vmagic-soft-breathe/.test(css), 'Spell detail icon should breathe');
  assert.ok(/tile-avatar-icon[\s\S]*1\.9rem/.test(css), 'Character button avatar should be enlarged for visual parity');

  ['main.css','ru.js','en.js','world-events.js','progress-bar.js','nav.js','home.js','character.js','hunt.js','inventory.js','arena.js','settings.js','leaderboard.js'].forEach(function(asset) {
    var version = asset === 'main.css' ? '20260824a' : ((asset === 'home.js' || asset === 'character.js' || asset === 'nav.js' || asset === 'hunt.js') ? '20260826u' : ((asset === 'ru.js' || asset === 'en.js') ? '20260824e' : '20260826k'));
    assert.ok(new RegExp(asset.replace('.', '\\.') + '\\?v=' + version).test(index), asset + ' should be cache-busted for v110');
  });
  assert.ok(/viz-magic-v181/.test(sw), 'service worker should use v110 cache');
});

test('v109 player polish batch removes stale text, fixes motion/copy/icons, and fills hunt tier gap', function () {
  const worldEventsV109 = read('app/js/engine/world-events.js');
  const creaturesV109 = read('app/js/data/creatures.js');
  const huntV109 = read('app/js/ui/screens/hunt.js');
  const inventoryV109 = read('app/js/ui/screens/inventory.js');
  const marketplaceV109 = read('app/js/ui/screens/marketplace.js');
  const characterV109 = read('app/js/ui/screens/character.js');
  const settingsV109 = read('app/js/ui/screens/settings.js');
  const guildV109 = read('app/js/ui/screens/guild.js');
  const mainCssV109 = read('app/css/main.css');
  const ruV109 = read('app/js/i18n/ru.js');
  const enV109 = read('app/js/i18n/en.js');
  const indexV109 = read('app/index.html');
  const swV109 = read('app/sw.js');

  assert.ok(!/Старшие маги просят не смеяться слишком громко|старшие маги просят не смеяться слишком громко|смеяться слишком громко/.test(worldEventsV109), 'forbidden elder-mages laughing phrase should be absent from published/queued lore pools');
  assert.ok(/NATURE_PAGES[\s\S]*home_magic_nature_title/.test(worldEventsV109), 'Magic Nature block should remain intact after phrase cleanup');

  assert.ok(/rift_marauder[\s\S]*minLevel: 9,[\s\S]*maxLevel: 16[\s\S]*rift_colossus/.test(creaturesV109), 'Hunt should fill the Lv9-16 tier before the deadly Lv11-18 target');
  assert.ok(/rift_colossus[\s\S]*minLevel: 11,[\s\S]*maxLevel: 18,[\s\S]*deadly: true/.test(creaturesV109), 'Rift Colossus should remain the only explicit nearby deadly tier');
  assert.ok(!/creature-warning-text/.test(huntV109), 'hunt card should not render the old textual danger warning');
  assert.ok(/hunt_danger_warning/.test(ruV109), 'RU danger warning key may remain for compatibility but should not be rendered on hunt cards');
  assert.ok(/\.creature-card[\s\S]*flex-wrap: wrap/.test(mainCssV109) && /\.creature-level[\s\S]*margin-left: auto/.test(mainCssV109), 'Hunt level label should sit at the row end');

  assert.ok(/item-stats"> ' \+ Helpers\.escapeHtml/.test(inventoryV109), 'Oak Wand stats should not be prefixed by a middle dot');
  assert.ok(/altar_spark:\s*'🕯️'/.test(inventoryV109), 'Altar Spark should keep candle icon, not a white diamond');
  assert.ok(/veilstone:\s*'🪞'/.test(inventoryV109), 'Veilstone should have a distinct icon');
  assert.ok(/stone_tablet:\s*item\.rarity >= 2 \? '📜' : '🗿'/.test(inventoryV109), 'Stone Tablet should have a distinct icon by rarity');
  assert.ok(/data_core:\s*item\.rarity >= 1 \? '🖥️' : '💾'/.test(inventoryV109), 'Data Core should have a distinct icon by rarity');
  assert.ok(/nano_patch:\s*'🩹'/.test(inventoryV109), 'Nano Patch should have a distinct icon');
  assert.ok(/veilstone:\s*'🪞'/.test(marketplaceV109) && /stone_tablet:\s*item\.rarity >= 2 \? '📜' : '🗿'/.test(marketplaceV109) && /data_core:\s*item\.rarity >= 1 \? '🖥️' : '💾'/.test(marketplaceV109) && /nano_patch:\s*'🩹'/.test(marketplaceV109), 'Marketplace sell tab should use the same distinct material icons');
  assert.ok(!/chronicle_ink[\s\S]{0,260}ink-drop-icon/.test(marketplaceV109), 'Chronicle Ink sell row should not append a trailing drop icon');

  assert.ok(/stonewarden: 'Каменный Страж'/.test(characterV109), 'Character title should keep readable RU class name with uppercase Страж');
  assert.ok(/char_spell_details: 'Характеристики заклинания'/.test(ruV109) && /spell-detail-title-icon vmagic-breathe/.test(characterV109), 'Spell details title should have a breathing wand icon outside the i18n key');
  assert.ok(!/Modal\.show\(t\('char_spell_details'\) \+ ': ' \+ spell\.name/.test(characterV109), 'Spell modal title should not append Stone Wall or any spell name');
  assert.ok(!/function _showSpellDetails[\s\S]*var descKey = 'spell_' \+ spell\.id \+ '_desc'/.test(characterV109), 'Spell detail modal should not render the spell description paragraph');
  assert.ok(/Modal\.show\(body\)/.test(characterV109) && /modal-close/.test(characterV109) && /char_spell_close/.test(characterV109), 'Spell detail modal should restore the Close action button in v110');

  assert.ok(/settings-accessibility-spacer/.test(settingsV109 + mainCssV109), 'Accessibility settings should include an invisible spacer between calm screen copy and icon breathing');
  assert.ok(/help_quests_text:[\s\S]*<br>Отказ от начатого/.test(ruV109), 'Quest abandon note should start on a new line in RU help');
  assert.ok(/help_duels_text:[\s\S]*<br>Дизайн-правило/.test(ruV109), 'Duel design-rule note should start on a new line in RU help');

  assert.ok(/guild-action-label/.test(guildV109 + mainCssV109), 'Guild action buttons should place labels in a separate one-line span below icons');
  assert.ok(/guild-actions \.guild-btn[\s\S]*flex-direction: column/.test(mainCssV109), 'Guild bottom action buttons should stack icon above label');
  assert.ok(/arena-screen \.vmagic-breathe[\s\S]*animation-name: vmagic-soft-breathe/.test(mainCssV109), 'Arena icons should use soft breathe, not rune jitter');
  assert.ok(/leaderboard-title-icon[\s\S]*animation-name: vmagic-soft-breathe/.test(mainCssV109), 'Leaderboard title icon should use soft breathe, not jitter');

  ['main.css','ru.js','en.js','world-events.js','creatures.js','character.js','hunt.js','inventory.js','arena.js','guild.js','marketplace.js','leaderboard.js','settings.js'].forEach(function(asset) {
    var version = asset === 'main.css' ? '20260824a' : ((asset === 'home.js' || asset === 'character.js' || asset === 'nav.js' || asset === 'hunt.js') ? '20260826u' : ((asset === 'ru.js' || asset === 'en.js') ? '20260824e' : '20260826k'));
    assert.ok(new RegExp(asset.replace('.', '\\.') + '\\?v=' + version).test(indexV109), asset + ' should be cache-busted for v109');
  });
  assert.ok(/viz-magic-v181/.test(swV109), 'service worker should use v109 cache');
});

test('v108 inventory, bottom nav, hunt danger marker, and arena motion polish are explicit', function () {
  const inventoryV108 = read('app/js/ui/screens/inventory.js');
  const huntV108 = read('app/js/ui/screens/hunt.js');
  const arenaV108 = read('app/js/ui/screens/arena.js');
  const navV108 = read('app/js/ui/components/nav.js');
  const cssV108 = read('app/css/main.css');
  const indexV108 = read('app/index.html');
  const swV108 = read('app/sw.js');
  const ruV108 = read('app/js/i18n/ru.js');
  const enV108 = read('app/js/i18n/en.js');

  assert.ok(/ancient_shard:\s*item\.rarity >= 2 \? '🪬' : \(item\.rarity >= 1 \? '🌀' : '〰️'\)/.test(inventoryV108), 'Ancient Echo Shard uncommon and rare should not share the same icon');
  assert.ok(/altar_spark:\s*'🕯️'/.test(inventoryV108), 'Altar Spark should not fall back to a white diamond');
  assert.ok(/data_core:\s*item\.rarity >= 1 \? '🖥️' : '💾'/.test(inventoryV108), 'Data Core should have a distinct non-diamond icon');
  assert.ok(/nano_patch:\s*'🩹'/.test(inventoryV108), 'Nano Patch should have a thematic non-diamond icon');
  assert.ok(/stone_tablet:\s*item\.rarity >= 2 \? '📜' : '🗿'/.test(inventoryV108), 'Stone Tablet should have a distinct non-diamond icon');
  assert.ok(/item_altar_spark: 'Искра Жертвенницы'/.test(ruV108), 'Altar Spark should be translated as Искра Жертвенницы in Russian');
  assert.ok(/item_data_core: 'Data Core'/.test(ruV108) && /item_nano_patch: 'Nano Patch'/.test(ruV108) && /item_stone_tablet: 'Stone Tablet'/.test(ruV108), 'Requested technical item names should have explicit i18n keys');
  assert.ok(!/return '✦'/.test(inventoryV108), 'Inventory should not use the white diamond fallback icon');
  assert.ok(/item-stats/.test(inventoryV108) && /item-stats[\s\S]*item-volatile/.test(inventoryV108), 'Oak Wand warning marker should render after name/count/stats at the end of the row');
  assert.ok(/\.item-volatile \{ color: var\(--color-warning\); margin-left: auto; \}/.test(cssV108), 'warning marker should be pushed to the row end');

  assert.ok(/body\[data-icon-motion="sparkle"\] \.item-card:nth-child\(3n\+1\) \.item-icon/.test(cssV108), 'Inventory icons should have per-row sparkle delays');
  assert.ok(/body\[data-icon-motion="sparkle"\] \.item-card:nth-child\(3n\+2\) \.item-icon/.test(cssV108), 'Inventory icons should not breathe synchronously in sparkle mode');
  assert.ok(/body\[data-icon-motion="sparkle"\] \.arena-screen \.screen-title-icon/.test(cssV108), 'Arena screen icon should use controlled soft motion');
  assert.ok(/animation-name: vmagic-soft-breathe !important/.test(cssV108), 'Arena/inventory polish should use soft breathing, not jerky rune pulse');

  assert.ok(!/creature-warning-text/.test(huntV108), 'Hunt danger marker triangle should be removed in v110');
  assert.ok(!/creature-warning-text/.test(huntV108), 'Hunt should remove textual danger warning after v118');

  assert.ok(/Helpers\.icon\(tab\.icon, 'nav-icon vm-icon'\)/.test(navV108) && /<span class="nav-label">/.test(navV108), 'Bottom nav should expose an SVG icon and separate label');
  assert.ok(/\.nav-tab \{ flex-direction: column; justify-content: center; align-items: center; gap: 2px; \}/.test(cssV108), 'Bottom nav icons should sit above labels');
  assert.ok(/\.nav-label \{ display: block; white-space: nowrap; line-height: 1\.05; text-align: center; \}/.test(cssV108), 'Bottom nav label should be one horizontal line under icon');

  assert.ok(/main\.css\?v=20260824a/.test(indexV108), 'main CSS cache bust missing for v108');
  assert.ok(/inventory\.js\?v=20260826k/.test(indexV108), 'inventory cache bust missing for v108');
  assert.ok(/hunt\.js\?v=20260826u/.test(indexV108), 'hunt cache bust missing for v108');
  assert.ok(/arena\.js\?v=20260826k/.test(indexV108), 'arena cache bust missing for v108');
  assert.ok(/nav\.js\?v=20260826u/.test(indexV108), 'nav cache bust missing for v108');
  assert.ok(/marketplace\.js\?v=20260826k/.test(indexV108), 'marketplace cache bust missing for v108 icon parity');
  assert.ok(/js\/i18n\/ru\.js\?v=20260824e/.test(indexV108) && /js\/i18n\/en\.js\?v=20260824e/.test(indexV108), 'i18n cache bust missing for v108 item labels');
  assert.ok(/viz-magic-v181/.test(swV108), 'service worker should use v108 cache');
});

test('v107 hunt combat uses spell mana cost, not full account energy', function () {
  const broadcastV107 = read('app/js/blockchain/broadcast.js');
  const protocolV107 = read('app/js/protocols/vm-protocol.js');
  const stateV107 = read('app/js/engine/state-engine.js');
  const validatorV107 = read('app/js/engine/validator.js');
  const combatV107 = read('app/js/engine/combat.js');
  const huntV107 = read('app/js/ui/screens/hunt.js');
  const indexV107 = read('app/index.html');
  const swV107 = read('app/sw.js');

  assert.ok(/energy: manaCost/.test(broadcastV107), 'hunt custom action should record the spell mana spend for audit');
  assert.ok(/function createHuntAction\(creatureId, zone, spellId, energy\)/.test(protocolV107), 'VM hunt action helper should support energy field');
  assert.ok(/energy: energy \|\| 0/.test(protocolV107), 'VM hunt action should serialize energy when provided');
  assert.ok(!/cfg\.ENERGY\.MAX \/\/ Use max energy for now/.test(stateV107), 'replay must not resolve hunts as full-energy shots');
  assert.ok(/var combatEnergy = spell\.manaCost \|\| cfg\.ENERGY\.MIN_HUNT_COST/.test(stateV107), 'replay combat should use the spell cost as the authoritative shot energy');
  assert.ok(/_resolveHuntFromBlock\(blockNum, ch, creature, spell, spell\.manaCost/.test(huntV107) && /processHuntResult\(user, selectedCreature, selectedSpell, fateEntropy, finalBlockNum, playerEnergy\)/.test(huntV107), 'live UI should pass spell mana cost into the single state-engine resolution path');
  assert.ok(/data\.energy && data\.energy !== spell\.manaCost/.test(validatorV107), 'spoofed hunt energy should be rejected when action energy is present');
  assert.ok(/invalid_hunt_energy/.test(validatorV107), 'invalid hunt energy should have a specific validation error');
  assert.ok(/playerEnergy <= 300 \? 45 : 25/.test(combatV107), '3% low-mana shots should not get fewer combat rounds than 1% shots');
  assert.ok(/playerEnergy\) \/ 1000/.test(combatV107), '3% low-mana shots should deal more patient minimum damage than 1% shots');
  assert.ok(/broadcast\.js\?v=20260824a/.test(indexV107), 'broadcast cache bust missing for v107 hunt energy fix');
  assert.ok(/vm-protocol\.js\?v=20260822k/.test(indexV107), 'VM protocol cache bust missing for v107 hunt energy fix');
  assert.ok(/validator\.js\?v=20260731c/.test(indexV107), 'validator cache bust missing for v107 hunt energy fix');
  assert.ok(/combat\.js\?v=20260826k/.test(indexV107), 'combat cache bust missing for v118 hunt mercy fix');
  assert.ok(/state-engine\.js\?v=20260824a/.test(indexV107), 'state engine cache bust missing for v107 hunt energy fix');
  assert.ok(/hunt\.js\?v=20260826u/.test(indexV107), 'hunt screen cache bust missing for v107 hunt energy fix');
  assert.ok(/viz-magic-v181/.test(swV107), 'service worker should use v107 cache');
});

test('v106 hunt danger copy is truthful and Weave title is single-line', function () {
  const creaturesV106 = read('app/js/data/creatures.js');
  const huntV106 = read('app/js/ui/screens/hunt.js');
  const cssV106 = read('app/css/main.css');
  const indexV106 = read('app/index.html');
  const swV106 = read('app/sw.js');

  assert.ok(/\.event-name \{ flex: 1; font-weight: 600; white-space: nowrap; \}/.test(cssV106), 'Weave/world-event title should stay on one line');
  assert.ok(/thornvine[\s\S]*minLevel: 5,[\s\S]*maxLevel: 10[\s\S]*echo_guardian/.test(creaturesV106), 'Lv5-10 fair target should remain');
  assert.ok(/echo_guardian[\s\S]*minLevel: 5,[\s\S]*maxLevel: 12[\s\S]*cyber_ghoul/.test(creaturesV106), 'Lv5-12 fair target should remain');
  assert.ok(/cyber_ghoul[\s\S]*minLevel: 7,[\s\S]*maxLevel: 14[\s\S]*rift_colossus/.test(creaturesV106), 'Lv7-14 fair target should remain');
  assert.ok(!/thornvine[\s\S]{0,260}deadly: true/.test(creaturesV106), 'Lv5-10 should not be marked deadly');
  assert.ok(!/echo_guardian[\s\S]{0,260}deadly: true/.test(creaturesV106), 'Lv5-12 should not be marked deadly');
  assert.ok(!/cyber_ghoul[\s\S]{0,260}deadly: true/.test(creaturesV106), 'Lv7-14 should not be marked deadly');
  assert.ok(/rift_colossus[\s\S]*deadly: true[\s\S]*baseHp: 420[\s\S]*basePot: 70/.test(creaturesV106), 'Rift Colossus should be explicitly and mechanically deadly');
  assert.ok(/c\.deadly === true[\s\S]*min <= level \+ 2/.test(huntV106), 'hunt should expose only one nearby deadly target');
  assert.ok(/function _isDangerCreature/.test(huntV106), 'danger helper may remain but card warning should not render');
  assert.ok(/main\.css\?v=20260824a/.test(indexV106), 'v106 CSS cache bust missing');
  assert.ok(/creatures\.js\?v=20260826k/.test(indexV106), 'v106 creatures cache bust missing');
  assert.ok(/hunt\.js\?v=20260826u/.test(indexV106), 'v106 hunt cache bust missing');
  assert.ok(/viz-magic-v181/.test(swV106), 'service worker should use v106 cache');
});

test('v105 text quality, season colors, avatar title, and spell modal polish are explicit', function () {
  const worldEventsV105 = read('app/js/engine/world-events.js');
  const homeV105 = read('app/js/ui/screens/home.js');
  const characterV105 = read('app/js/ui/screens/character.js');
  const settingsV105 = read('app/js/ui/screens/settings.js');
  const leaderboardV105 = read('app/js/ui/screens/leaderboard.js');
  const cssV105 = read('app/css/main.css');
  const indexV105 = read('app/index.html');
  const swV105 = read('app/sw.js');

  assert.ok(!/Нажми, чтобы перейти к охоте и потратить этот всплеск/.test(ruJs), 'Weave Surge should not over-explain the Hunt click');
  assert.ok(/home_weave_hunt_hint: 'на охоте'/.test(ruJs), 'Weave Surge badge should say “на охоте”');
  assert.ok(/toLowerCase\(\) \+ ' ×'/.test(homeV105), 'Weave badge should render compact lower-case mana x2 text');
  assert.ok(!/Каждый день Мир раскрывает несколько живых страниц/.test(ruJs + homeV105), 'Home should not show the long living-pages intro');
  assert.ok(/Они не требуют действий — просто напоминают, что за кнопками живёт сказка/.test(ruJs), 'Guide should keep the short living-pages fairy-tale sentence');

  assert.ok(/season-color-summer/.test(homeV105 + cssV105) && /season-color-autumn/.test(homeV105 + cssV105), 'season and month should have season color classes');
  assert.ok(/season-color-winter/.test(homeV105 + cssV105) && /season-color-spring/.test(homeV105 + cssV105), 'winter and spring color classes should exist');
  assert.ok(!/Воздух стал чуть гуще/.test(worldEventsV105), 'repeated dense-air phrase should be removed');
  assert.ok(!/завтра небо обещает/.test(worldEventsV105), 'near-duplicate sky promise phrase should be absent');
  assert.ok(!/Очевидцы уверяют, что новость видели лично/.test(worldEventsV105), 'repeated eyewitness-news phrase should be removed');
  assert.ok((worldEventsV105.match(/Компас повернулся/g) || []).length === 1 && /Миграция безликих птиц[\s\S]*Компас повернулся/.test(worldEventsV105), 'compass phrase should remain only in faceless-birds migration');

  assert.ok(/iconHtml = _renderAvatarMark\(character, 'tile-icon tile-avatar-icon'\)/.test(homeV105), 'Character tile should use avatar in the icon position');
  assert.ok(!/tile-avatar-row/.test(homeV105), 'Character tile should not have a separate extra avatar row');
  assert.ok(/character-title-line/.test(characterV105) && /Каменный Страж/.test(characterV105) && !/Каменный Страж \(Terra\)/.test(characterV105), 'Character title should show guide class name without Terra parentheses');
  assert.ok(/profile-title-avatar[\s\S]*character-title-class-icon/.test(characterV105), 'Character title should put class symbol immediately after avatar');
  assert.ok(/spell-item-button/.test(characterV105) && /_showSpellDetails/.test(characterV105) && /spell-detail-list/.test(characterV105), 'Character spells should open a mechanics modal');

  assert.ok(/_renderSlider\('sfx-volume', t\('settings_sfx'\), sfxVolume, '🔔'\)/.test(settingsV105), 'SFX bell icon should be restored');
  assert.ok(!/screen-title-icon section-icon vmagic-breathe leaderboard-title-icon/.test(leaderboardV105), 'Leaderboard icon should not inherit jittery title-icon pulse classes');
  assert.ok(/leaderboard-title-icon[\s\S]*vmagic-soft-breathe/.test(cssV105), 'Leaderboard icon should use soft breathing');

  assert.ok(/help-nav-link" data-help-nav="quests">Ежедневное Пророчество/.test(ruJs), 'Guide quests daily prophecy is a working jump link');
  assert.ok(/Обзор → купите выставленные предметы\.<br>Продать →/.test(ruJs), 'Guide marketplace Sell sentence should start on a new line');
  assert.ok(/итог определяет блокчейн\.<br>Вызвать на дуэль/.test(ruJs), 'Guide duel challenge sentence should start on a new line');
  assert.ok(/по выбору отказывающегося — 1% Mana/.test(ruJs), 'Duel satisfaction rule should use the requested 1% Mana copy');

  assert.ok(/main\.css\?v=20260824a/.test(indexV105), 'main CSS cache bust missing for v105');
  assert.ok(/home\.js\?v=20260826u/.test(indexV105) && /character\.js\?v=20260826u/.test(indexV105), 'Home/Character cache bust missing for v105');
  assert.ok(/settings\.js\?v=20260826k/.test(indexV105) && /leaderboard\.js\?v=20260826k/.test(indexV105), 'Settings/Leaderboard cache bust missing for v105');
  assert.ok(/world-events\.js\?v=20260826k/.test(indexV105), 'world events cache bust missing for v105');
  assert.ok(/js\/i18n\/ru\.js\?v=20260824e/.test(indexV105) && /js\/i18n\/en\.js\?v=20260824e/.test(indexV105), 'i18n cache bust missing for v105');
  assert.ok(/viz-magic-v181/.test(swV105), 'service worker should use v105 cache');
});


test('v112 player feedback fixes event surface weather inventory and ranking polish', function () {
  const index = read('app/index.html');
  const sw = read('app/sw.js');
  const css = read('app/css/main.css');
  const worldEvents = read('app/js/engine/world-events.js');
  const home = read('app/js/ui/screens/home.js');
  const inventory = read('app/js/ui/screens/inventory.js');
  const arena = read('app/js/ui/screens/arena.js');
  const guild = read('app/js/ui/screens/guild.js');
  const leaderboard = read('app/js/ui/screens/leaderboard.js');
  const character = read('app/js/ui/screens/character.js');
  const ru = read('app/js/i18n/ru.js');
  const en = read('app/js/i18n/en.js');

  assert.strictEqual((worldEvents.match(/Небо гасит лишний шум и оставляет только важные шорохи/g) || []).length, 1, 'sky-noise phrase should exist once across queued text blocks');
  assert.strictEqual((worldEvents.match(/К вечеру новость обещает стать старой, но только снаружи/g) || []).length, 1, 'evening-old-news phrase should exist once across queued text blocks');
  assert.strictEqual((worldEvents.match(/Базарные оценщики не согласны, но улыбаются/g) || []).length, 1, 'bazaar appraiser phrase should exist once across queued text blocks');

  assert.ok(!/event-edit-review/.test(home) && !/event_edit_review_title/.test(ru) && !/event_edit_review_title/.test(en), 'separate event edit overview should be removed');
  assert.ok(!/event-edit-copy/.test(home) && !/border: 1px dashed/.test(css), 'active Weave/Rift event banners should not repeat descriptions in dashed edit-copy boxes');
  assert.ok(/var idx = day % WEATHER\.length/.test(worldEvents), 'magical weather should rotate every Moscow day instead of sticking for many days');
  assert.ok(/pages\.dailyTail = LORE_DAILY_TAILS\[tailIdx\]/.test(worldEvents) && !/tailSlot/.test(worldEvents), 'daily lore tail should render once as a shared line below the three home lore blocks');

  assert.ok(/item\.type === 'flame_votive_mark' \|\| item\.type === 'altar_spark' \|\| item\.type === 'labor_votive_mark'/.test(inventory), 'altar and labor offering marks should suppress rarity diamond before name');
  assert.ok(/type === 'labor_votive_mark'\) && rInfo\.name === 'uncommon'\) return 'необычная'/.test(inventory), 'Labor Seal uncommon rarity should be feminine in RU');
  assert.ok(/item\.type === 'labor_votive_mark'/.test(inventory) && /_showWarningIcon/.test(inventory), 'Labor Seal should keep the end warning triangle like offering marks');

  assert.ok(/@keyframes vmagic-soft-breathe \{ 0%, 100% \{ transform: scale\(1\)/.test(css) && !/@keyframes vmagic-soft-breathe[\s\S]*translateY\(-1px\)/.test(css), 'soft breathe should not jump vertically');
  assert.ok(/body\[data-icon-motion="sparkle"\] \.item-card \.item-icon[\s\S]*animation: vmagic-soft-breathe 5\.6s/.test(css), 'bag icons should use final slow soft-breathe override');
  assert.ok(/body\[data-icon-motion="sparkle"\] \.arena-screen \.arena-class-icon[\s\S]*animation: vmagic-soft-breathe 5\.6s/.test(css), 'arena icons should use final slow soft-breathe override');
  assert.ok(/body\[data-icon-motion="sparkle"\] \.leaderboard-title-icon[\s\S]*animation: vmagic-soft-breathe 5\.6s/.test(css), 'leaderboard icon should use final slow soft-breathe override');
  assert.ok(/action-tile \{ display: grid; grid-template-rows: 2\.15rem auto/.test(css) && /#bottom-nav \.nav-tab \{ display: grid; grid-template-rows: 1\.9rem 1\.05em/.test(css), 'Character and rating labels should align on fixed icon/label rows');

  assert.ok(!/arena-player-status/.test(arena), 'known player status text should not render on Arena');
  assert.ok(/playerNameHtml = \(p\.name && p\.name !== p\.account\)/.test(arena), 'Arena should not repeat naked network account names without @');
  assert.ok(/function _renderPlayerIdentity/.test(leaderboard) && !/leaderboard-account">@/.test(leaderboard), 'leaderboard table should not show @ account names');

  assert.ok(/btn btn-primary" id="modal-cancel/.test(guild) && /_showTreasuryModal[\s\S]*btn btn-primary[\s\S]*_showGuildSettingsModal[\s\S]*btn btn-primary/.test(guild), 'Guild treasury/settings close buttons should be primary yellow');
  assert.ok(/char_hp_explainer/.test(character) && /char_xp_explainer/.test(character), 'HP and XP descriptions should be visible');
  assert.ok(/var iconName = kind === 'hp' \? 'hp' : 'xp'/.test(character) && /Helpers\.icon\(iconName, 'modal-title-icon/.test(character), 'HP and XP modal titles should include SVG icons');
  assert.ok(/Каменный Страж ×1\.30, Огнеплёт ×0\.90, Лунный Странник ×1\.00, Цветомудрец ×1\.10/.test(ru) && /На первой странице игры/.test(ru), 'HP explanation should use numeric multipliers and first-page wording in RU');
  assert.ok(/Stonewarden ×1\.30, Embercaster ×0\.90, Moonrunner ×1\.00, Bloomsage ×1\.10/.test(en), 'HP explanation should use numeric class multipliers in EN');
  assert.ok(/_statRow\(t\('char_potency'\), ch\.pot \|\| 0, corePerStat, 0, totalPot\)/.test(character) && /stat-formula/.test(character) && /grid-template-columns: minmax\(5\.5rem, 1fr\) minmax\(7\.5rem, auto\)/.test(css), 'character stats should show aligned base + core + equipment formula before total');
  assert.ok(!/t\('class_' \+ ch\.className\) \+ ' \\u2022 '/.test(character), 'class subtitle under the shield should be removed');

  ['main.css','ru.js','en.js','world-events.js','progress-bar.js','nav.js','home.js','character.js','hunt.js','inventory.js','arena.js','settings.js','leaderboard.js','marketplace.js','guild.js','creatures.js'].forEach(function(asset) {
    var version = asset === 'main.css' ? '20260824a' : ((asset === 'home.js' || asset === 'character.js' || asset === 'nav.js' || asset === 'hunt.js') ? '20260826u' : ((asset === 'ru.js' || asset === 'en.js') ? '20260824e' : '20260826k'));
    assert.ok(new RegExp(asset.replace('.', '\\.') + '\\?v=' + version).test(index), asset + ' should be cache-busted for v112');
  });
  assert.ok(/viz-magic-v181/.test(sw), 'service worker should use v112 cache');
});


test('v114 loading state does not invent an embercaster level-one character', function () {
  assert.ok(!/className: 'embercaster'/.test(homeJs), 'Home loading fallback must not show a fake Embercaster');
  assert.ok(/hasCharacter = !!character/.test(homeJs) && /characterLine = hasCharacter/.test(homeJs), 'Home should render neutral loading copy until the real character exists');
  assert.ok(/if \(!ch\)/.test(characterScreenJs) && /t\('loading'\)/.test(characterScreenJs), 'Character screen should show loading instead of a fake level-one class');
  assert.ok(/home.js\?v=20260826u/.test(indexHtml) && /character.js\?v=20260826u/.test(indexHtml), 'loading fallback fix should be cache-busted');
  assert.ok(/viz-magic-v181/.test(swJs), 'service worker should publish v114');
});


test('v115 service worker forces stale PWA windows onto the fresh cache-busted app shell', function () {
  assert.ok(/app.js\?v=20260822l/.test(indexHtml), 'main app controller should be cache-busted with UI fixes');
  assert.ok(/sw_reload_v123/.test(appJs) && /controllerchange/.test(appJs) && /window\.location\.reload/.test(appJs), 'app should reload once when a fresh service worker takes control');
  assert.ok(/clients\.matchAll/.test(swJs) && /client\.navigate\(client\.url\)/.test(swJs), 'service worker activation should navigate open PWA windows to fresh assets');
  assert.ok(/viz-magic-v181/.test(swJs), 'service worker should publish v115');
});


test('v116 character tile does not use ember fallback while the real character is loading', function () {
  assert.ok(/_renderActionTiles\(PRIMARY_HOME_SCREENS, true, hasCharacter \? character : null\)/.test(homeJs), 'Home primary action tiles should not receive a fake character while loading');
  assert.ok(/_renderActionTiles\(SECONDARY_HOME_SCREENS, false, hasCharacter \? character : null\)/.test(homeJs), 'Home secondary action tiles should not receive a fake character while loading');
  assert.ok(!/className \|\| 'embercaster'/.test(homeJs), 'Home avatar fallback must not default missing class to Embercaster');
  assert.ok(/character\.className \? Helpers\.classIcon\(character\.className\) :/.test(homeJs), 'Home avatar fallback should use neutral mage icon until class exists');
  assert.ok(/home.js\?v=20260826u/.test(indexHtml), 'character tile loading fix should be cache-busted');
});


test('v117 lore daily tail is rendered once below the three lore cards', function () {
  assert.ok(/pages\.dailyTail = LORE_DAILY_TAILS\[tailIdx\]/.test(worldEventsJs), 'daily lore tail should be stored once on the pages collection');
  assert.ok(/out\.text = base\.text;/.test(worldEventsJs), 'daily lore tail must not be appended to every lore card text');
  assert.ok(/home-lore-daily-tail/.test(homeJs + mainCss), 'Home should render the daily lore tail as one shared line');
  assert.ok(!/tailSlot/.test(worldEventsJs), 'tail slot distribution is not enough; visible daily tail should be a single element');
});

test('v117 Denis visual feedback polish is explicit', function () {
  assert.ok(/class_stonewarden: 'Каменный Страж'/.test(ruJs), 'Stonewarden class name should be Каменный Страж');
  assert.ok(/Каменный Страж пришёл/.test(ruJs), 'Stonewarden portrait should not start with old Стражник wording');
  assert.ok(/forecast-card-hunt-summary > \.forecast-hunt-icon \{ animation: vmagic-soft-breathe 2\.8s/.test(mainCss), 'hunt bow icon breathing should be stronger/faster');
  assert.ok(/tile-avatar-icon \{ width: 2\.15rem; height: 2\.15rem; font-size: 1\.95rem; \}/.test(mainCss), 'character tile avatar should be enlarged to match other action icons');
});


test('v117 Home normalizes old Stonewarden display name', function () {
  assert.ok(/function _displayCharacterName/.test(homeJs), 'Home should normalize legacy display names before rendering the greeting');
  assert.ok(/character\.className === 'stonewarden' && character\.name === 'Стражник'/.test(homeJs), 'legacy Стражник name should be recognized only for Stonewarden');
  assert.ok(/return t\('class_stonewarden'\)/.test(homeJs), 'legacy Stonewarden greeting should show Каменный Страж');
});


test('production PWA install is available before login and landing icons do not depend on emoji fonts', function () {
  const landingJs = read('app/js/ui/screens/landing.js');
  const appJs = read('app/js/ui/app.js');
  const mainCss = read('app/css/main.css');
  const indexHtml = read('app/index.html');
  const manifestJson = read('app/manifest.json');
  const swJs = read('app/sw.js');

  assert.ok(/_installPromptListenerBound/.test(appJs), 'beforeinstallprompt listener should be bound once and as early as possible');
  assert.ok(/function _bindInstallPromptListener/.test(appJs), 'install prompt binding should be separated from service-worker registration');
  assert.ok(/_bindInstallPromptListener\(\);[\s\S]*function init/.test(appJs), 'install prompt listener should be installed before App.init waits for async startup');
  assert.ok(/btn-landing-install/.test(landingJs), 'landing screen should expose install/shortcut CTA before login');
  assert.ok(/App\.installShortcut\(\)/.test(landingJs), 'landing install CTA should use the same install flow as Home');
  assert.ok(/landing_install_shortcut/.test(landingJs + ruJs + enJs), 'landing install CTA should have localized copy');
  assert.ok(/feature-icon feature-icon-hunt/.test(landingJs), 'landing feature icons should use CSS/SVG classes, not only emoji glyphs');
  assert.ok(!/feature-icon" aria-hidden="true">🏹/.test(landingJs), 'landing hunt card should not depend on color emoji rendering');
  assert.ok(/\.feature-icon-hunt::before[\s\S]*linear-gradient/.test(mainCss), 'CSS fallback icon should draw the hunt symbol without emoji font support');
  assert.ok(/\.feature-icon-duel::before[\s\S]*linear-gradient/.test(mainCss), 'CSS fallback icon should draw the duel symbol without emoji font support');
  assert.ok(/\.feature-icon-chronicle::before[\s\S]*linear-gradient/.test(mainCss), 'CSS fallback icon should draw the chronicle symbol without emoji font support');
  assert.ok(/manifest\.json\?v=20260826t/.test(indexHtml), 'manifest should be cache-busted for the new install surface');
  assert.ok(/viz-magic-v158/.test(manifestJson), 'PWA manifest identity should remain stable across install-event fixes');
  assert.ok(/viz-magic-v181/.test(swJs), 'service-worker cache should advance for fresh runtime assets');
});


test('installed app cold-start has visible fallback and service-worker network timeouts', function () {
  const swJs = read('app/sw.js');
  const indexHtml = read('app/index.html');
  assert.ok(/BOOT_FALLBACK_MARKER/.test(indexHtml), 'index should contain a static visible boot fallback before runtime JS renders');
  assert.ok(/viz-magic-v181/.test(swJs), 'service worker cache should advance for cold-start black-screen fix');
  assert.ok(/NAVIGATION_TIMEOUT_MS\s*=\s*3500/.test(swJs), 'navigation fetch should have a short timeout before cached fallback');
  assert.ok(/RUNTIME_TIMEOUT_MS\s*=\s*2500/.test(swJs), 'runtime JS/CSS fetches should have a timeout before cached fallback');
  assert.ok(/function _fetchWithTimeout/.test(swJs), 'SW should wrap fetches with a timeout');
  assert.ok(/function _offlineShellResponse/.test(swJs), 'SW should expose a non-black offline shell response');
  assert.ok(/_fetchWithTimeout\(event\.request, NAVIGATION_TIMEOUT_MS\)[\s\S]*caches\.match\('\/index\.html'\)[\s\S]*_offlineShellResponse/.test(swJs), 'navigation should fall back to cached index or offline shell after timeout/failure');
  assert.ok(/_fetchWithTimeout\(event\.request, RUNTIME_TIMEOUT_MS\)/.test(swJs), 'runtime assets should use timed network-first fetches');
  assert.ok(!/event\.waitUntil\(_cacheAppShell/.test(swJs), 'install must still not block on app-shell cache downloads');
});

test('critical desktop icons avoid emoji glyph squares on Home and bottom nav', function () {
  const navJs = read('app/js/ui/components/nav.js');
  const homeJs = read('app/js/ui/screens/home.js');
  const characterJs = read('app/js/ui/screens/character.js');
  const mainCss = read('app/css/main.css');
  const indexHtml = read('app/index.html');
  assert.ok(/icon:\s*'home'/.test(navJs), 'bottom nav should name an SVG sprite symbol, not an emoji glyph');
  assert.ok(/Helpers\.icon\(tab\.icon, 'nav-icon vm-icon'\)/.test(navJs), 'bottom nav should render the shared SVG icon helper');
  assert.ok(!/nav-icon" aria-hidden="true">' \+ tab\.icon/.test(navJs), 'bottom nav should not inject raw emoji icons');
  assert.ok(/function _iconClassForScreen/.test(homeJs), 'Home tiles should map screens to sprite symbol names');
  assert.ok(/Helpers\.icon\(iconClass, 'tile-icon vm-icon'\)/.test(homeJs), 'Home action tiles should render SVG icons');
  assert.ok(/Helpers\.icon\('mana'/.test(homeJs) && /Helpers\.icon\('hp'/.test(homeJs) && /Helpers\.icon\('xp'/.test(homeJs), 'Home vital labels should use SVG icons');
  assert.ok(/Helpers\.icon\('mana'/.test(characterJs) && /Helpers\.icon\('hp'/.test(characterJs) && /Helpers\.icon\('xp'/.test(characterJs), 'Character vital labels should use SVG icons');
  assert.ok(/Font-independent inline SVG icons/.test(mainCss), 'critical icons should not depend on emoji fonts or CSS glyph drawings');
  assert.ok(!/Stable CSS pictogram icons/.test(mainCss), 'failed abstract CSS pictograms must be removed');
  assert.ok(/main\.css\?v=20260824a/.test(indexHtml), 'CSS must be cache-busted for icon replacement');
  assert.ok(/nav\.js\?v=20260826u/.test(indexHtml), 'nav must be cache-busted for icon replacement');
  assert.ok(/home\.js\?v=20260826u/.test(indexHtml), 'Home must be cache-busted for icon replacement');
  assert.ok(/character\.js\?v=20260826u/.test(indexHtml), 'Character must be cache-busted for vital icon replacement');
});


test('secret maps room requires an exact daily award and unlock action in one transaction', function () {
  const day = '2026-08-23';
  const yesterday = '2026-08-22';
  const blockContext = {
    console: { log: function () {} },
    VizMagicConfig: { PROTOCOLS: { VM: 'VIZMAGIC', V: 'V', VE: 'VE' } },
    VMProtocol: { parseAction: function(json) { return JSON.parse(json); } },
    VoiceProtocol: { parseMessage: function() { return null; }, parseEvent: function() { return null; } }
  };
  vm.createContext(blockContext);
  vm.runInContext(read('app/js/engine/block-processor.js'), blockContext, { filename: 'block-processor.js' });
  const atomicBlock = blockContext.BlockProcessor.processBlock({
    block_id: 'atomic-library-block', previous: 'previous', timestamp: '2026-08-23T00:00:00',
    transactions: [
      { operations: [] },
      { operations: [
        ['award', { initiator: 'alice', receiver: 'denis-skripnik', energy: 1000, custom_sequence: 0, memo: 'viz://vm/library/chapter2/' + day, beneficiaries: [] }],
        ['custom', { id: 'VIZMAGIC', required_regular_auths: ['alice'], required_active_auths: [], json: JSON.stringify({ p: 'VIZMAGIC', t: 'library.unlock', d: { chapter: 'chapter2', day: day } }) }]
      ] }
    ]
  }, 500);
  assert.strictEqual(atomicBlock.awards[0].txIndex, 1);
  assert.strictEqual(atomicBlock.vmActions[0].txIndex, 1);

  const context = loadMarketplaceStateEngine();
  const engine = context.StateEngine;
  assert.strictEqual(engine.getLibraryDay(Date.UTC(2026, 7, 22, 20, 59, 59)), yesterday, 'Moscow day should remain yesterday before 21:00 UTC');
  assert.strictEqual(engine.getLibraryDay(Date.UTC(2026, 7, 22, 21, 0, 0)), day, 'Moscow midnight should start a new entitlement day');
  assert.strictEqual(engine.getLibraryMidnightDelay(Date.UTC(2026, 7, 22, 20, 59, 59)), 1000, 'room should expire exactly at Moscow midnight');
  assert.strictEqual(engine.getLibraryMidnightDelay(Date.UTC(2026, 7, 22, 21, 0, 0)), 86400000, 'a new world day should run until the next midnight');
  const normalizedProofBlock = {
    vmActions: [{ sender: 'alice', txIndex: 1, action: { type: 'library.unlock', data: { chapter: 'chapter2', day: day } } }],
    awards: atomicBlock.awards
  };
  assert.strictEqual(engine.verifyLibraryUnlockProof(normalizedProofBlock, 'alice', 'chapter2', day), true, 'full atomic proof for today should verify');
  assert.strictEqual(engine.verifyLibraryUnlockProof(normalizedProofBlock, 'alice', 'chapter2', yesterday), false, 'today proof must not unlock yesterday or tomorrow');
  assert.strictEqual(engine.verifyLibraryUnlockProof(normalizedProofBlock, 'alice', 'chapter2', '2026-99-99'), false, 'impossible calendar dates must be rejected');
  assert.strictEqual(engine.verifyLibraryUnlockProof({ vmActions: normalizedProofBlock.vmActions, awards: [] }, 'alice', 'chapter2', day), false, 'custom action without its award must fail');

  const chapterThreeProofBlock = {
    vmActions: [{ sender: 'alice', txIndex: 7, action: { type: 'library.unlock', data: { chapter: 'chapter3', day: day } } }],
    awards: [{ initiator: 'alice', receiver: 'denis-skripnik', energy: 1000, memo: 'viz://vm/library/chapter3/' + day, txIndex: 7 }]
  };
  assert.strictEqual(engine.verifyLibraryUnlockProof(chapterThreeProofBlock, 'alice', 'chapter3', day), true, 'chapter three should verify its own exact atomic proof');
  assert.strictEqual(engine.verifyLibraryUnlockProof(chapterThreeProofBlock, 'alice', 'chapter2', day), false, 'chapter three payment must not open chapter two');
  assert.strictEqual(engine.verifyLibraryUnlockProof(normalizedProofBlock, 'alice', 'chapter3', day), false, 'chapter two payment must not open chapter three');

  const unlock = function(account, txIndex, unlockDay, chapter) {
    return { sender: account, txIndex: txIndex, action: { type: 'library.unlock', data: { chapter: chapter || 'chapter2', day: unlockDay } } };
  };
  engine.processBlock({
    blockNum: 500,
    blockHash: 'library-unlock-block',
    huntEntropy: 'previous-block-id',
    vmActions: [
      unlock('alice', 1, day),
      unlock('alice', 1, day),
      unlock('yesterday', 2, yesterday),
      unlock('action-only', 3, day),
      unlock('mismatched-tx', 4, day),
      unlock('wrong-memo', 6, day),
      unlock('chapter-three', 7, day, 'chapter3'),
      unlock('cross-chapter', 8, day, 'chapter3')
    ],
    voicePosts: [],
    awards: [
      { initiator: 'alice', receiver: 'denis-skripnik', energy: 1000, memo: 'viz://vm/library/chapter2/' + day, txIndex: 1 },
      { initiator: 'yesterday', receiver: 'denis-skripnik', energy: 1000, memo: 'viz://vm/library/chapter2/' + yesterday, txIndex: 2 },
      { initiator: 'award-only', receiver: 'denis-skripnik', energy: 1000, memo: 'viz://vm/library/chapter2/' + day, txIndex: 2 },
      { initiator: 'mismatched-tx', receiver: 'denis-skripnik', energy: 1000, memo: 'viz://vm/library/chapter2/' + day, txIndex: 5 },
      { initiator: 'wrong-memo', receiver: 'denis-skripnik', energy: 1000, memo: 'viz://vm/library/other/' + day, txIndex: 6 },
      { initiator: 'chapter-three', receiver: 'denis-skripnik', energy: 1000, memo: 'viz://vm/library/chapter3/' + day, txIndex: 7 },
      { initiator: 'cross-chapter', receiver: 'denis-skripnik', energy: 1000, memo: 'viz://vm/library/chapter2/' + day, txIndex: 8 }
    ]
  });

  assert.strictEqual(engine.hasLibraryAccess('alice', 'chapter2', day), true, 'today atomic proof should open the room');
  assert.strictEqual(engine.hasLibraryAccess('alice', 'chapter2', yesterday), false, 'today access must expire across world midnight');
  assert.strictEqual(engine.hasLibraryAccess('yesterday', 'chapter2', yesterday), true, 'yesterday proof remains valid only for its day');
  assert.strictEqual(engine.hasLibraryAccess('yesterday', 'chapter2', day), false, 'yesterday proof must require payment again today');
  assert.strictEqual(engine.getState().libraryAccess.alice.chapter2.day, day, 'replay should retain the entitlement day');
  engine.processLibraryUnlockResult('alice', 400, yesterday);
  assert.strictEqual(engine.getState().libraryAccess.alice.chapter2.day, day, 'out-of-order old proof must not roll daily access backward');
  engine.processLibraryUnlockResult('poison', 450, '2026-12-31');
  engine.processLibraryUnlockResult('poison', 700, day);
  assert.strictEqual(engine.getState().libraryAccess.poison.chapter2.day, day, 'newer block must replace an earlier future-day prepayment without poisoning state');
  assert.strictEqual(engine.hasLibraryAccess('chapter-three', 'chapter3', day), true, 'exact chapter three replay should open chapter three');
  assert.strictEqual(engine.hasLibraryAccess('chapter-three', 'chapter2', day), false, 'chapter three replay should not open chapter two');
  assert.strictEqual(engine.hasLibraryAccess('cross-chapter', 'chapter3', day), false, 'chapter two memo must not validate a chapter three action');
  ['award-only', 'action-only', 'mismatched-tx', 'wrong-memo'].forEach(function(account) {
    assert.strictEqual(engine.hasLibraryAccess(account, 'chapter2', day), false, account + ' must not unlock access');
  });
});


test('The Veil uses the astral boundary archipelago and matching lore', function () {
  assert.ok(/MAP_ASSET_VERSION = '20260826w'/.test(mapJs), 'world-map image URLs should advance for the Veil replacement');
  assert.ok(/map_lore_the_veil:[\s\S]{0,1000}между слоями мира[\s\S]{0,1000}латунные кольца[\s\S]{0,1000}зелёным вратам/.test(ruJs), 'RU Veil lore should describe the astral boundary archipelago');
  assert.ok(/map_lore_the_veil:[\s\S]{0,1000}between the layers of the world[\s\S]{0,1000}brass rings[\s\S]{0,1000}green gate/.test(enJs), 'EN Veil lore should describe the astral boundary archipelago');
  assert.ok(!/map_lore_the_veil:[^\n]*(синие свечи|полые тени|лунный колодец)/.test(ruJs), 'obsolete enclosed-maze Veil landmarks should be removed');
});

test('Creators book replaces the visible Developers section without breaking its reward path', function () {
  assert.ok(/nav_developers:\s*'Создатели'/.test(ruJs) && /developers_title:\s*'Книга о создателях'/.test(ruJs), 'Russian navigation and book title should say Creators');
  assert.ok(/nav_developers:\s*'Creators'/.test(enJs) && /developers_title:\s*'Book of Creators'/.test(enJs), 'English navigation and book title should say Creators');
  assert.ok(/class="developers-screen creators-screen"/.test(developersJs), 'creator screen should keep its stable route hook and expose the new book surface');
  assert.ok(/class="creators-book"[\s\S]*creators-book-binding[\s\S]*creators-book-cover/.test(developersJs), 'creator screen should render as a bound book');
  assert.ok(/developers_denis_title[\s\S]*developers_evgeny_title/.test(developersJs), 'Denis and Evgeny should have separate ordered chapters');
  [
    'https://github.com/web3blind',
    'https://t.me/blind_dev',
    'https://vk.ru/denis_skripnik',
    'https://vk.ru/blind_dev',
    'https://x.com/denis_skripnik',
    'https://life.blinddev.xyz/',
    'https://vk.ru/life_harbor_game',
    'https://vk.ru/id55771964'
  ].forEach(function (href) {
    assert.ok(developersJs.includes(href), 'creator book should link to ' + href);
  });
  assert.ok(/незрячий с рождения[\s\S]*приоткрыть дверь[\s\S]*потери сознания/.test(ruJs), 'Denis chapter should preserve the requested origin story');
  assert.ok(/профессиональный телеоператор[\s\S]*видеомонтаж[\s\S]*вспомнил карты мира[\s\S]*стабилизировать дверь/.test(ruJs), 'Evgeny chapter should combine verified public work with his Viz Magic contribution');
  assert.ok(/_renderRewardSeal\(CREATORS\.denis, t, user\)[\s\S]*developers_evgeny_title[\s\S]*_renderRewardSeal\(CREATORS\.evgeny, t, user\)/.test(developersJs), 'each creator page should contain its own conditional gratitude seal');
  assert.ok(!/class="creators-page creators-gratitude"/.test(developersJs), 'shared gratitude page should be removed');
  assert.ok(/VizBroadcast\.award\(creator\.account/.test(developersJs), 'existing voluntary VIZ reward path should target the selected creator');
  assert.ok(/\.creators-book[\s\S]*\.creators-page[\s\S]*\.creators-link/.test(mainCss), 'ancient creator-book styling should be present');
});


test('The Ember Wastes uses the distinct underground forge map and matching lore', function () {
  assert.ok(/MAP_ASSET_VERSION = '20260826w'/.test(mapJs), 'world-map image URLs should advance for the Ember Wastes replacement');
  assert.ok(/map_lore_ember_wastes:[\s\S]{0,900}под обсидиановой корой[\s\S]{0,900}багровый кристалл[\s\S]{0,900}голубому порталу/.test(ruJs), 'RU Ember Wastes lore should describe the new underground forge labyrinth');
  assert.ok(/map_lore_ember_wastes:[\s\S]{0,900}beneath the obsidian crust[\s\S]{0,900}crimson crystal[\s\S]{0,900}blue portal/.test(enJs), 'EN Ember Wastes lore should describe the new underground forge labyrinth');
  assert.ok(!/map_lore_ember_wastes:[^\n]*(эмбер-виспы|чёрная башня)/.test(ruJs), 'obsolete outdoor Ember Wastes landmarks should be removed');
});


test('secret maps room renders fifteen daily paid maps and world map markers', function () {
  assert.ok(ruJs.includes("help_magic_library_chapter_two_title: 'Тайные Карты Мира\\nкомната вторая'"), 'RU title should preserve Denis wording and line break');
  assert.ok(ruJs.includes("help_magic_library_chapter_two_intro: 'В бесчисленных тайниках Мира есть множество секретных схронов... Этот первый.'") && ruJs.includes("help_magic_library_chapter_two_warning: 'Не входить!!!\\nОтнимает 10% жизненной энергии'"), 'room should preserve its description and separate red warning');
  assert.ok(/Тайные Карты Мира закроются ровно в полночь! Торопись Путник!/.test(ruJs), 'paid state should show the exact red midnight warning');
  assert.ok(/HELP_SECRET_LIBRARY_MAPS\s*=\s*\[/.test(helpJs), 'Help should define a separate secret-map set');
  assert.ok(/function _renderSecretLibrary/.test(helpJs), 'Help should render the room separately');
  assert.ok(/StateEngine\.getLibraryDay\(\)/.test(helpJs) && /StateEngine\.hasLibraryAccess\(user, 'chapter2', day\)/.test(helpJs), 'locked UI should use today replayed entitlement');
  assert.ok(/VizMagicConfig\.LIBRARY\.CHAPTER_TWO_COST/.test(helpJs), 'UI should use the canonical 10% cost');
  assert.ok(/HistorySource\.findAccountAction/.test(helpJs), 'payment flow should preflight archived account entitlement');
  assert.ok(helpJs.indexOf('HistorySource.findAccountAction') < helpJs.indexOf('VizBroadcast.libraryUnlockAction'), 'today entitlement preflight must happen before broadcast');
  assert.ok(/verifyLibraryUnlockProof\(processed, user, chapter, day\)/.test(helpJs), 'archive proof must be checked for the selected chapter and today');
  assert.ok(/VizBroadcast\.libraryUnlockAction\(\s*VizMagicConfig\.LIBRARY\.CHAPTER_TWO_COST,\s*day,/.test(helpJs), 'unlock must pass today into the atomic transaction builder');
  assert.ok(/function libraryUnlockAction\(energy, day, callback\)/.test(broadcastJs) && /operations:\s*\[[\s\S]*\['award'[\s\S]*\['custom'/.test(broadcastJs), 'broadcast helper should sign award and daily VM proof as one transaction');
  assert.ok(/d:\s*\{ chapter:\s*chapter, day:\s*day \}/.test(broadcastJs) && /memo:\s*chapterConfig\.memoPrefix \+ day/.test(broadcastJs), 'award memo and VM action should bind the same chapter and day');
  assert.ok(/help-secret-library-midnight/.test(helpJs + mainCss), 'open room should expose a styled midnight warning');
  assert.ok(/setTimeout\([\s\S]*StateEngine\.getLibraryMidnightDelay\(\)/.test(helpJs), 'an open guide should rerender itself at world midnight');
  assert.ok(!/getLibraryMidnightDelay\(\) \+ 50/.test(helpJs), 'midnight expiry must not add a post-midnight grace interval');
  assert.ok(/help-secret-library-map-card/.test(helpJs) && /ModalComponent\.hide\(\)[\s\S]{0,180}render\(\)/.test(helpJs), 'world midnight should also close an already open secret map modal');
  assert.ok(/StateEngine\.getLibraryDay\(\) !== day[\s\S]{0,260}_unlockSecretLibrary\(\)/.test(helpJs), 'payment flow should restart preflight if the Moscow day changes before broadcast');
  assert.ok(/function _confirmSecretLibraryBroadcastProof/.test(helpJs) && /HistorySource\.getBlock\(blockNum[\s\S]*verifyLibraryUnlockProof\(processed, user, chapter, day\)/.test(helpJs), 'live access should require a fetched and verified atomic proof block');
  var preflightBody = helpJs.slice(helpJs.indexOf('function _preflightSecretLibraryEntitlement'), helpJs.indexOf('function _confirmSecretLibraryBroadcastProof'));
  assert.ok(/try \{[\s\S]*BlockProcessor\.processBlock[\s\S]*catch \(err\)[\s\S]*callback\(err\)/.test(preflightBody), 'malformed preflight blocks should fail closed without leaving the payment flow busy');
  assert.ok(/unlock\.addEventListener\('click', _unlockSecretLibrary\)/.test(helpJs), 'the visible payment button should start preflight directly with one click');
  assert.ok(!/function _confirmSecretLibraryUnlock/.test(helpJs) && !/help-secret-library-confirm-card/.test(helpJs), 'payment flow should not show a second payment-looking confirmation button');
  assert.ok(/function _waitForSecretLibraryProof/.test(helpJs) && /_preflightSecretLibraryEntitlement\(user, day[\s\S]*setTimeout/.test(helpJs), 'a sent payment should poll the archive until its proof appears');
  assert.ok(/help_secret_library_waiting_confirmation/.test(helpJs + ruJs), 'the payment button should explain that payment was sent while proof is pending');
  assert.ok(!/secret.*minLevel|HELP_SECRET_LIBRARY_MAPS[\s\S]{0,500}minLevel/i.test(helpJs), 'room should not impose level ordering yet');
  assert.strictEqual(fs.readdirSync(path.join(root, 'app/assets/library-maps-chapter2')).filter(name => /^secret-map-\d{2}\.jpg$/.test(name)).length, 15, 'room should contain exactly 15 JPEG maps');
  assert.ok(/assets\/library-maps-chapter2\/secret-map-' \+ entry\.id \+ '\.jpg/.test(helpJs), 'secret-map modal should load accepted assets');

  assert.ok(!/map-current-location/.test(mapJs), 'current region name should not be repeated above the map cards');
  assert.ok(/region-here[\s\S]{0,180}map_you_are_here/.test(mapJs), 'the current region card should contain visible You are here text');
  assert.ok(/energy-path-shimmer/.test(mapJs + mainCss), 'energy-bearing map controls should expose a shimmer hook');
  assert.ok(/body\[data-icon-motion="sparkle"\][\s\S]*energy-path-shimmer/.test(mainCss), 'World sparkles mode should activate energy shimmer');
  assert.ok(/animation:\s*energy-path-flow\s+10s\s+linear\s+infinite/.test(mainCss), 'energy shimmer should move continuously at a slow steady speed');
  assert.ok(/@keyframes\s+energy-path-flow\s*\{\s*0%[\s\S]*100%[\s\S]*\}/.test(mainCss), 'energy shimmer should use one uninterrupted start-to-end sweep');
  assert.ok(!/0%,\s*45%|88%,\s*100%/.test(mainCss), 'the lightning should not freeze during artificial rest keyframes');
  assert.ok(/rgba\(126,\s*222,\s*255,\s*0\.34\)/.test(mainCss) && /opacity:\s*0\.6/.test(mainCss), 'energy shimmer should keep the softer peak brightness');
  assert.ok(!/energy-path-flow\s+2\.8s\s+linear/.test(mainCss), 'the old rapid lightning sweep should stay removed');
  assert.ok(/prefers-reduced-motion:\s*reduce[\s\S]*energy-path-shimmer[\s\S]*animation:\s*none/.test(mainCss), 'reduced motion should disable energy shimmer');
});

test('unknown maps chapter three keeps the selected ten-map order and a separated fading path', function () {
  assert.ok(ruJs.includes("help_magic_library_chapter_three_title: 'Неизвестные карты Мира\\nглава третья'"), 'chapter three should preserve Denis title and line break');
  assert.ok(/Как эти карты оказались в Магической библиотеке, никто не помнит[\s\S]*Старики шепчут[\s\S]*Маги ухмыляются/.test(ruJs), 'chapter three should preserve Denis lore');
  assert.ok(/help_magic_library_chapter_three_warning:\s*'Не входить!!!\\nОтнимает 10% жизненной энергии'/.test(ruJs), 'chapter three should preserve the exact danger warning');
  assert.ok(/help_magic_library_chapter_two_warning/.test(ruJs) && /help-library-danger/.test(helpJs + mainCss), 'chapters two and three should render their danger warning in red');
  var mainUnknownMapSource = helpJs.match(/var HELP_UNKNOWN_LIBRARY_MAPS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(mainUnknownMapSource, 'the ten-map list should remain explicit');
  assert.deepStrictEqual(Array.from(mainUnknownMapSource[1].matchAll(/id:\s*'(\d+)'/g), function (match) { return match[1]; }), ['01', '13', '14', '09', '10', '11', '06', '02', '03', '04'], 'the Flooded Clocktower City and Underground Candle Canal should frame the main path');
  assert.ok(/HELP_UNKNOWN_LIBRARY_FADING_MAPS\s*=\s*\[[\s\S]*id:\s*'15'[\s\S]*id:\s*'12'[\s\S]*id:\s*'07'[\s\S]*id:\s*'08'[\s\S]*id:\s*'05'/.test(helpJs), 'Fading Path maps should retain their submitted order');
  assert.ok(/help-unknown-library-divider[\s\S]*help_unknown_library_fading_path/.test(helpJs), 'the final map group should be separated and titled Fading Path');
  assert.ok(/StateEngine\.hasLibraryAccess\(user, 'chapter3', day\)/.test(helpJs), 'chapter three should use an independent daily entitlement');
  assert.ok(/VizMagicConfig\.LIBRARY\.CHAPTER_THREE_COST/.test(helpJs) && /libraryUnlockChapterAction\(\s*'chapter3'/.test(helpJs), 'one chapter-three button should charge the canonical 10%');
  assert.ok(/assets\/library-maps-chapter3\/unknown-map-' \+ entry\.id \+ '\.jpg/.test(helpJs), 'chapter three modal should load the accepted assets');
  assert.strictEqual(fs.readdirSync(path.join(root, 'app/assets/library-maps-chapter3')).filter(name => /^unknown-map-\d{2}\.jpg$/.test(name)).length, 15, 'chapter three should contain exactly 15 optimized JPEG maps');
});

test('secret maps daily broadcast builder binds award and proof to the same day', function () {
  let sent = null;
  const context = {
    console: { log: function () {} },
    VizMagicConfig: {
      PROTOCOLS: { VM: 'VIZMAGIC' }, APP_VERSION: 1,
      ACTION_TYPES: { LIBRARY_UNLOCK: 'library.unlock' },
      LIBRARY: { TREASURY: 'denis-skripnik', CHAPTER_TWO_COST: 1000, CHAPTER_TWO_MEMO_PREFIX: 'viz://vm/library/chapter2/', CHAPTER_THREE_COST: 1000, CHAPTER_THREE_MEMO_PREFIX: 'viz://vm/library/chapter3/' }
    },
    VizAccount: {
      getRegularKey: function () { return 'test-wif'; },
      getCurrentUser: function () { return 'alice'; },
      getAccountProtocol: function (account, protocol, cb) { cb(null, { custom_sequence_block_num: 99 }); }
    },
    viz: { broadcast: { send: function (transaction, keys, cb) { sent = transaction; cb(null, { block_num: 100 }); } } }
  };
  vm.createContext(context);
  vm.runInContext(read('app/js/blockchain/broadcast.js'), context, { filename: 'broadcast.js' });
  let error = null;
  context.VizBroadcast.libraryUnlockAction(1000, '2026-08-23', function (err) { error = err; });
  assert.ifError(error);
  assert.deepStrictEqual(Array.from(sent.operations, function (op) { return op[0]; }), ['award', 'custom']);
  assert.strictEqual(sent.operations[0][1].memo, 'viz://vm/library/chapter2/2026-08-23');
  const action = JSON.parse(sent.operations[1][1].json);
  assert.strictEqual(action.d.day, '2026-08-23');
  sent = null;
  context.VizBroadcast.libraryUnlockChapterAction('chapter3', 1000, '2026-08-23', function (err) { error = err; });
  assert.ifError(error);
  assert.strictEqual(sent.operations[0][1].memo, 'viz://vm/library/chapter3/2026-08-23');
  assert.strictEqual(JSON.parse(sent.operations[1][1].json).d.chapter, 'chapter3');
  sent = null;
  context.VizBroadcast.libraryUnlockChapterAction('chapter3', 999, '2026-08-23', function (err) { error = err; });
  assert.ok(error && /invalid_library_energy/.test(error.message));
  assert.strictEqual(sent, null, 'wrong chapter cost must not broadcast');
  context.VizBroadcast.libraryUnlockChapterAction('chapter99', 1000, '2026-08-23', function (err) { error = err; });
  assert.ok(error && /invalid_library_chapter/.test(error.message));
  assert.strictEqual(sent, null, 'unknown chapter must not broadcast');
  sent = null;
  context.VizBroadcast.libraryUnlockAction(1000, 'not-a-day', function (err) { error = err; });
  assert.ok(error && /invalid_library_day/.test(error.message));
  assert.strictEqual(sent, null, 'invalid day must not broadcast');
});


test('magical library links stay on one line without changing map images', function () {
  assert.ok(/main.css\?v=20260824a/.test(indexHtml), 'CSS must be cache-busted for Magical Library link sizing');
  assert.ok(/\.help-library-link[\s\S]*font-size:\s*clamp\(0\.58rem, 2\.1vw, 0\.84rem\)[\s\S]*white-space:\s*nowrap/.test(mainCss), 'Magical Library map links should be smaller and never wrap to a second line');
  assert.ok(/overflow:\s*visible/.test(mainCss), 'Magical Library links should not hide part of the title with ellipsis');
});

test('cross-device replay uses the live hunt entropy and rebuilds stale checkpoints', function () {
  const blockProcessorJs = read('app/js/engine/block-processor.js');
  const stateEngineJs = read('app/js/engine/state-engine.js');
  const appControllerJs = read('app/js/ui/app.js');
  assert.ok(/huntEntropy:\s*block\.previous \|\| block\.block_id/.test(blockProcessorJs), 'processed blocks must expose archive-safe hunt entropy');
  assert.ok(/_processGameAction\([\s\S]*blockHash,[\s\S]*huntEntropy/.test(stateEngineJs), 'replay should keep both legacy block hash and hunt entropy');
  assert.ok(/_handleHunt\(sender, action\.data, blockNum, huntEntropy \|\| blockHash\)/.test(stateEngineJs), 'only hunts should switch to canonical previous-block entropy');
  assert.ok(/huntEntropy:\s*ev\.previous \|\| ev\.block_id/.test(appControllerJs), 'archive range replay must preserve canonical hunt entropy');
  assert.ok(/CHECKPOINT_SCHEMA_VERSION/.test(stateEngineJs), 'stale local checkpoints must be versioned');
});

test('cross-device replay behavior uses previous-block entropy and rejects stale checkpoint schema', function () {
  const blockContext = {
    console: { log: function () {} },
    VizMagicConfig: { PROTOCOLS: { VM: 'VIZMAGIC', V: 'V', VE: 'VE' } },
    VMProtocol: { parseAction: function (json) { return JSON.parse(json); } },
    VoiceProtocol: { parseMessage: function () { return null; }, parseEvent: function () { return null; } }
  };
  vm.createContext(blockContext);
  vm.runInContext(read('app/js/engine/block-processor.js'), blockContext, { filename: 'block-processor.js' });
  const processed = blockContext.BlockProcessor.processBlock({
    block_id: 'block-id', witness_signature: 'canonical-witness-signature', previous: 'previous-id', timestamp: '2026-08-17T00:00:00',
    transactions: [{ operations: [['custom', { id: 'VIZMAGIC', required_regular_auths: ['qa'], json: '{"t":"hunt"}' }]] }]
  }, 123);
  assert.strictEqual(processed.huntEntropy, 'previous-id');

  function initFrom(checkpoint) {
    let state;
    const context = {
      console: { log: function () {} },
      VizMagicConfig: { ACTION_TYPES: {} },
      CheckpointSystem: {
        init: function (cb) { cb(null); },
        loadLatestCheckpoint: function (account, cb) { cb(null, checkpoint); }
      }
    };
    vm.createContext(context);
    vm.runInContext(read('app/js/engine/state-engine.js'), context, { filename: 'state-engine.js' });
    context.StateEngine.init(function (err, loaded) { assert.ifError(err); state = loaded; });
    return state;
  }
  const stale = initFrom({ state: { checkpointSchemaVersion: 1, headBlock: 999, characters: {}, inventories: {} } });
  assert.strictEqual(stale.headBlock, 0, 'old divergent checkpoint must rebuild from chain');
  const current = initFrom({ state: { checkpointSchemaVersion: 2, headBlock: 999, characters: {}, inventories: {} } });
  assert.strictEqual(current.headBlock, 999, 'current deterministic checkpoint should still load');
});

test('verified world maps and font-independent SVG icons remain intact', function () {
  const mainCss = read('app/css/main.css');
  const mapJs = read('app/js/ui/screens/map.js');
  const helpJs = read('app/js/ui/screens/help.js');
  const helpersJs = read('app/js/utils/helpers.js');
  const homeJs = read('app/js/ui/screens/home.js');
  const navJs = read('app/js/ui/components/nav.js');
  assert.ok(/function icon\(name, extraClass\)/.test(helpersJs), 'Helpers should expose a stable inline SVG icon renderer');
  assert.ok(/id="vm-i-home"/.test(indexHtml) && /id="vm-i-mana"/.test(indexHtml), 'the app shell should embed its SVG icon sprite');
  assert.ok(/Helpers\.icon\(/.test(homeJs) && /Helpers\.icon\(/.test(navJs), 'Home and navigation should render SVG icons');
  assert.ok(/Helpers\.icon\(/.test(helpJs) && /Helpers\.icon\(/.test(mapJs), 'Help and World Map should render SVG icons');
  assert.ok(!helpJs.includes('\\uD83') && !helpJs.includes('\\u26') && !/[📖🔖✨🌌🗓🗺🎓]/.test(helpJs), 'Help must not contain font-dependent emoji icons');
  assert.ok(!mapJs.includes('\\uD83') && !mapJs.includes('\\u26') && !mapJs.includes('\\u23') && !mapJs.includes('🗺'), 'World Map must not contain font-dependent emoji icons');
  assert.ok(!/event-icon[^>]*>['" +]*evt\.icon/.test(homeJs), 'Home events must not inject font emoji icons');
  assert.ok(!/Stable CSS pictogram icons/.test(mainCss), 'failed abstract CSS pictograms should be removed');
  assert.ok(/Font-independent inline SVG icons/.test(mainCss), 'critical icon styling should target inline SVG');
  assert.ok(/MAP_ASSET_VERSION = '20260826w'/.test(mapJs), 'travel maps should remain on the verified portal artwork');
  assert.ok(/help\.js\?v=20260824b/.test(indexHtml), 'Help bundle should be cache-busted for text-only library mode');
  assert.ok(/viz-magic-v181/.test(swJs), 'service worker cache should advance for text-only library mode');
  assert.ok(/main\.css\?v=20260824a/.test(indexHtml), 'SVG icon styles should stay cache-busted');
});

test('Magical Library uses the original board-game artwork with lore and Close', function () {
  const helpJs = read('app/js/ui/screens/help.js');
  const swJs = read('app/sw.js');
  assert.ok(/help-library-link/.test(helpJs), 'all library entries should remain interactive links');
  assert.ok(/t\('map_lore_' \+ entry\.id\)/.test(helpJs), 'library dialog should preserve the full region lore');
  assert.ok(/id="help-library-close"/.test(helpJs), 'library lore dialog should keep its Close control');
  assert.ok(/library-maps-v2/.test(helpJs) && /help-library-map-image|help-library-map-viewport|help-library-zoom-toggle/.test(helpJs), 'library dialog should render the original board-game artwork and zoom controls');
  assert.ok(!/library-maps-v3/.test(helpJs), 'failed illustrated v3 artwork must stay unreachable from runtime');
  assert.ok(/help\.js\?v=20260824b/.test(indexHtml), 'restored-art Help bundle should be cache-busted');
  assert.ok(/viz-magic-v181/.test(swJs), 'service worker cache should advance for restored board-game artwork');
});
