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
  assert.ok(/js\/ui\/app\.js\?v=20260716a/.test(indexHtml), 'main app controller must be cache-busted when catch-up code changes');
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
  assert.ok(/viz-magic-v70/.test(swJs), 'service worker cache version should be bumped');
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
  assert.ok(/viz-magic-v70/.test(read('app/sw.js')), 'service worker cache should be bumped for UI changes');
});


test('home dashboard uses Denis-approved visual scales and keeps real mana percent', function () {
  assert.ok(/HOME_HP_DISPLAY_MAX = 5000/.test(homeJs), 'home HP visual scale should top at 5000');
  assert.ok(/HOME_XP_DISPLAY_MAX = 3000/.test(homeJs), 'home XP visual scale should top at 3000');
  assert.ok(/displayMax:HOME_HP_DISPLAY_MAX/.test(homeJs), 'HP bar should show the visual HP scale');
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
  assert.ok(/forecast-card-effect/.test(homeJs + mainCss), 'forecast effect column needs its own thematic icon/card');
  assert.ok(/function getCurrentFestival/.test(worldEventsJs), 'magical holidays should appear only from the authored calendar');
  assert.ok(/festival_today_prefix/.test(homeJs + ruJs + enJs), 'forecast holidays should have localized copy');
  assert.ok(/i18n\/ru.js\?v=20260717c/.test(indexHtml), 'Russian weather copy must be cache-busted');
  assert.ok(/i18n\/en.js\?v=20260717c/.test(indexHtml), 'English weather copy must be cache-busted');
  assert.ok(/home.js\?v=20260717c/.test(indexHtml), 'home forecast layout must be cache-busted');
  assert.ok(/js\/ui\/screens\/quests.js\?v=20260717c/.test(indexHtml), 'quest-limit UX must be cache-busted');
  assert.ok(/nav.js\?v=20260716a/.test(indexHtml), 'bottom tray nav must be cache-busted');
  assert.ok(/leaderboard.js\?v=20260717c/.test(indexHtml), 'leaderboard narrator fix must be cache-busted');
  assert.ok(/world-events.js\?v=20260717c/.test(indexHtml), 'world events forecast pool must be cache-busted');
  assert.ok(/main.css\?v=20260717c/.test(indexHtml), 'forecast grid CSS must be cache-busted');
  assert.ok(/prefers-reduced-motion: no-preference/.test(mainCss) && /vmagic-rune-pulse/.test(mainCss), 'ambient animation must be lightweight and respect reduced-motion');
  assert.ok(/season_effect_prefix/.test(homeJs + ruJs + enJs), 'home forecast should explain gameplay effect');
  assert.ok(/seasonBonuses\[spell\.school\]/.test(combatJs), 'season school bonus should affect spell attack');
  assert.ok(/creatureAttackMod/.test(combatJs), 'weather should affect creature danger in hunt combat');
  assert.ok(/playerDefenseMod/.test(combatJs), 'weather should affect player defense in hunt combat');
  assert.ok(!/\uD83E\uDE9E/.test(worldEventsJs), 'mirror emoji should not be used for magical weather icon');
});

test('music volume, narrator speech, and PWA icons are durable', function () {
  const settingsJs = read('app/js/ui/screens/settings.js');
  const narratorJs = read('app/js/ui/components/battle-narrator.js');
  const swJs = read('app/sw.js');
  assert.ok(/musicVolume = Math\.round\(_getStoredNumber\('music_volume', 0\.5\) \* 100\)/.test(settingsJs), 'music slider should restore stored value');
  assert.ok(/_setStoredNumber\('music_volume', this\.value \/ 100\)/.test(settingsJs), 'music slider should persist changes');
  assert.ok(/SpeechSynthesisUtterance/.test(narratorJs), 'battle narrator should speak audibly through Web Speech when available');
  assert.ok(/textContent = ''[\s\S]*textContent = message/.test(narratorJs), 'battle narrator should force live-region text replacement');
  assert.ok(/manifest\.json\?v=20260717c/.test(indexHtml), 'manifest should be cache-busted for updated icon');
  assert.ok(/favicon\.ico\?v=20260712c/.test(indexHtml), 'favicon should be explicit for browser shortcut fallback');
  assert.ok(/viz-magic-v70-192\.png\?v=20260717c/.test(indexHtml), 'launcher icon link should be cache-busted');
  assert.ok(/assets\/icons\/viz-magic-v70-512\.png/.test(swJs), 'service worker should cache PWA launcher icons');
  assert.ok(/viz-magic-v70-512\.png/.test(read('app/manifest.json')), 'manifest should reference new icon URLs to bypass OS icon cache');
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
  assert.ok(/screen-temple/.test(indexHtml) && /temple\.js\?v=20260717c/.test(indexHtml), 'temple screen should be loaded and cache-busted');
  assert.ok(/id: 'temple'/.test(navJs + homeJs) && /nav_temple/.test(ruJs + enJs), 'temple should be reachable from navigation/home');
});


test('reported mobile UX issues have explicit fixes', function () {
  assert.ok(/quest_limit_reached_toast/.test(questsJs + ruJs + enJs), 'quest limit should be explained before/after accept attempts');
  assert.ok(/MAX_ACTIVE_QUESTS/.test(questScreenJs), 'quest screen should use the five-quest limit');
  assert.ok(!/BattleNarrator\.announce/.test(leaderboardScreenJs), 'leaderboard should not wake Battle Narrator speech synthesis');
  assert.ok(!/id: 'help'/.test(navJs), 'Help should be removed from bottom tray');
  assert.ok(/label:'❤️ HP'/.test(homeJs) && /label:'⭐ XP'/.test(homeJs), 'home HP and XP should have their own icons');
});


test('PWA icon and HP heart use expressive color accents', function () {
  assert.ok(/viz-magic-v70-192\.png\?v=20260717c/.test(indexHtml), 'PWA icon link should be cache-busted after plus placement/color update');
  assert.ok(/viz-magic-v70/.test(read('app/manifest.json')), 'manifest start URL should change so launchers can refresh icons');
  assert.ok(/label:'❤️ HP'/.test(homeJs), 'HP label should use a red heart emoji variant');
});


test('character screen uses current home-scale vitals and growth explainers', function () {
  assert.ok(/character.js\?v=20260716c/.test(indexHtml), 'character screen should be cache-busted');
  assert.ok(/CHARACTER_HP_DISPLAY_MAX = 5000/.test(characterScreenJs), 'character HP should use the same 5000 display scale as Home');
  assert.ok(/label:'❤️ HP'/.test(characterScreenJs), 'character HP should have the red heart icon');
  assert.ok(/label:'⭐ XP'/.test(characterScreenJs), 'character XP should have an icon and visible bar');
  assert.ok(/char-mana-bar/.test(characterScreenJs), 'character screen should show current mana');
  assert.ok(/char_xp_explainer/.test(characterScreenJs + ruJs + enJs), 'character screen should explain XP growth');
  assert.ok(/char_mana_explainer/.test(characterScreenJs + ruJs + enJs), 'character screen should explain mana growth');
});


test('hunt screen exposes explicit camp rest promised by Help', function () {
  assert.ok(/hunt.js\?v=20260717c/.test(indexHtml), 'hunt screen should be cache-busted');
  assert.ok(/broadcast.js\?v=20260713a/.test(indexHtml), 'broadcast helper should be cache-busted for restAction');
  assert.ok(/state-engine.js\?v=20260716a/.test(indexHtml), 'state-engine should be cache-busted for processRestResult');
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
  assert.ok(/settings.js\?v=20260713b/.test(indexHtml), 'settings should be cache-busted');
  assert.ok(/narrator-voice-gender/.test(settingsJs), 'settings should expose narrator gender select');
  assert.ok(/narrator-voice-timbre/.test(settingsJs), 'settings should expose narrator timbre select');
  assert.ok(/setVoiceOptions/.test(narratorJs), 'narrator should persist selectable voice options');
  assert.ok(/voiceGender = 'male'/.test(narratorJs) && /voiceTimbre = 'rough'/.test(narratorJs), 'default narrator voice should be low/male-if-available');
  assert.ok(/matchedVoice/.test(narratorJs) && /utterance\.pitch = matchedVoice/.test(narratorJs), 'low narrator voice should avoid harsh pseudo-male pitch distortion when browser lacks a male voice');
  assert.ok(/speechSynthesis\.getVoices/.test(narratorJs), 'narrator should try to select a matching system voice');
  assert.ok(/narrator_voice_hint/.test(settingsJs + ruJs + enJs), 'settings should explain browser voice limitations');
});


test('home action tiles reflect Denis priority order', function () {
  assert.ok(/home.js\?v=20260717c/.test(indexHtml), 'home screen should be cache-busted for action order');
  assert.ok(/PRIMARY_HOME_SCREENS = \['home', 'inventory', 'guild', 'crafting', 'map', 'hunt', 'quests', 'arena', 'marketplace', 'temple', 'world-boss'\]/.test(homeJs), 'primary row should put Home, Bag, Guild and Workshop first');
  assert.ok(/SECONDARY_HOME_SCREENS = \['character', 'leaderboard', 'chronicle', 'settings', 'help', 'developers'\]/.test(homeJs), 'secondary row should start Character, Rating, Chronicle and exclude World Boss');
  assert.ok(/home_secondary_actions: 'Дополнительная строка'/.test(ruJs), 'More sections should be renamed to Additional bar in Russian');
});


test('character vital explainers are placed immediately after their bars', function () {
  assert.ok(/character.js\?v=20260716c/.test(indexHtml), 'character screen should be cache-busted for vital layout');
  assert.ok(/char-hp-bar[\s\S]*char_hp_explainer[\s\S]*char-xp-bar[\s\S]*char_xp_explainer[\s\S]*char-mana-bar[\s\S]*char_mana_explainer/.test(characterScreenJs), 'character vital explanations should follow HP, XP and Mana bars respectively');
  assert.ok(!/character-growth-notes/.test(characterScreenJs), 'vital explanations should not be grouped away from their bars');
});




test('weave surge banner explains mana multiplier', function () {
  assert.ok(/Плетение усиливает восстановление/.test(ruJs), 'Russian weave surge copy should explain why mana is doubled');
  assert.ok(/2× faster/.test(enJs), 'English weave surge copy should explain the 2x mana recovery');
  assert.ok(/event-effect-badge/.test(homeJs + mainCss), 'weave surge should render a visible mana multiplier badge');
  assert.ok(/manaRegenMultiplier/.test(homeJs), 'weave surge badge should use the event multiplier value');
});

test('minor rift banner explains itself and is actionable', function () {
  assert.ok(/home.js\?v=20260717c/.test(indexHtml), 'home screen should be cache-busted for rift explanation');
  assert.ok(/event_minor_rift_desc/.test(homeJs + ruJs + enJs), 'minor rift should have visible explanatory copy');
  assert.ok(/evt\.type === 'minor_rift' \? 'hunt'/.test(homeJs), 'minor rift banner should navigate to Hunt');
  assert.ok(/event-banner-button/.test(homeJs + mainCss), 'actionable event banners should be styled and bound as buttons');
  assert.ok(/event_time_left/.test(homeJs + ruJs + enJs), 'event banner aria-label should explain remaining time');
});


test('temple offering gives immediate heard-prayer feedback', function () {
  assert.ok(/temple\.js\?v=20260717c/.test(indexHtml), 'temple screen should be cache-busted for offering feedback');
  assert.ok(/temple-status-region/.test(templeJs), 'temple should include an inline status region');
  assert.ok(/_setTempleStatus\(Helpers\.t\('temple_offering_success'\), true\)/.test(templeJs), 'temple success should update inline status immediately');
  assert.ok(/Твоя молитва услышана/.test(ruJs), 'Russian temple success should explicitly say the prayer was heard');
  assert.ok(/Your prayer was heard/.test(enJs), 'English temple success should explicitly say the prayer was heard');
});


test('hunt rest uses home-scale HP values', function () {
  assert.ok(/hunt.js\?v=20260717c/.test(indexHtml), 'hunt screen should be cache-busted for HP display scale');
  assert.ok(/HUNT_HP_DISPLAY_MAX = 5000/.test(huntJs), 'hunt rest should use the same 5000 HP display scale');
  assert.ok(/hpShown[\s\S]*HUNT_HP_DISPLAY_MAX/.test(huntJs), 'hunt rest description should render scaled HP instead of raw max HP');
});


test('marketplace groups identical sellable items and supports quantity listing', function () {
  assert.ok(/marketplace.js\?v=20260717c/.test(indexHtml), 'marketplace screen should be cache-busted');
  assert.ok(/function _groupSellableItems/.test(marketplaceJs), 'sell tab should group identical items');
  assert.ok(/sell-item-count/.test(marketplaceJs), 'sell tab should display grouped item count');
  assert.ok(/sell-qty-input/.test(marketplaceJs), 'sell tab should expose quantity input');
  assert.ok(/data-items=/.test(marketplaceJs), 'sell action should know all item ids in the group');
  assert.ok(/listNext\(0\)/.test(marketplaceJs), 'quantity listing should list selected items sequentially');
  assert.ok(/market_set_quantity/.test(marketplaceJs + ruJs + enJs), 'quantity copy should exist');
});


test('hunt and arena icons are distinct', function () {
  assert.ok(/nav.js\?v=20260716a/.test(indexHtml), 'nav should be cache-busted for hunt icon');
  assert.ok(/hunt:\s*'\\uD83C\\uDFF9'/.test(homeJs), 'home Hunt tile should use bow icon');
  assert.ok(/arena:\s*'\\u2694\\uFE0F'/.test(homeJs), 'home Arena tile should keep crossed swords icon');
  assert.ok(/id: 'hunt'[\s\S]*icon: '\\uD83C\\uDFF9'/.test(navJs), 'bottom Hunt tab should use bow icon');
});


test('hunt headings and help use updated thematic icons', function () {
  assert.ok(/hunt.js\?v=20260717c/.test(indexHtml), 'hunt screen should be cache-busted for heading icons');
  assert.ok(/vmagic-breathe[\s\S]*🐾[\s\S]*hunt_choose_creature/.test(huntJs), 'hunt creature heading should have a thematic tracking icon');
  assert.ok(/vmagic-breathe[\s\S]*🪄[\s\S]*hunt_choose_spell/.test(huntJs), 'hunt spell heading should use a magic wand icon');
  assert.ok(/help.js\?v=20260717c/.test(indexHtml), 'help screen should be cache-busted for hunt icon');
  assert.ok(/key: 'hunt'[\s\S]*\\uD83C\\uDFF9/.test(helpJs), 'help Hunt section should use bow icon, not arena swords');
});


test('crafting enchant tab does not show misleading local back button', function () {
  assert.ok(/crafting.js\?v=20260717c/.test(indexHtml), 'crafting screen should be cache-busted for enchant tab cleanup');
  assert.ok(!/craft-tab-back-btn/.test(craftingJs), 'enchant tab should not expose a non-working local back button');
});


test('marketplace sell items have semantic item icons', function () {
  assert.ok(/marketplace.js\?v=20260717c/.test(indexHtml), 'marketplace screen should be cache-busted for sell icons');
  assert.ok(/function _marketItemIcon/.test(marketplaceJs), 'sell rows should compute semantic item icons');
  assert.ok(/chronicle_ink:\s*'🖋️'/.test(marketplaceJs), 'Chronicle Ink should show the pen icon before the name');
  assert.ok(/_marketItemIcon\(sItem\)[\s\S]*_marketItemAfterIcon\(sItem\)/.test(marketplaceJs), 'sell row should render the item icon before the name and optional after-icon after the name');
  assert.ok(/ink-drop-icon/.test(marketplaceJs + mainCss), 'Chronicle Ink should keep a darker ink-drop after the name');
});


test('world boss UI can enter active window from schedule even without spawn checkpoint', function () {
  assert.ok(/world-boss.js\?v=20260716c/.test(indexHtml), 'world boss screen should be cache-busted for active-window fallback');
  assert.ok(/js\/engine\/world-boss\.js\?v=20260716a/.test(indexHtml), 'world boss engine should be cache-busted for reward distribution');
  assert.ok(/WorldEvents\.checkWorldBossWindow\(blockNum\)/.test(worldBossJs), 'world boss screen should check the deterministic active window directly');
  assert.ok(/WorldBoss\.spawnBoss\(bossEvent\.spawnBlock \|\| blockNum/.test(worldBossJs), 'screen should render active boss from scheduled spawn block when state has no boss');
  assert.ok(/_ensureArchiveBackfill/.test(worldBossJs) && /HistorySource\.getEventsRange/.test(worldBossJs) && /boss\.attack/.test(worldBossJs), 'world boss screen should backfill public boss attacks from archive for other browsers');
  assert.ok(/state\.worldBoss = scheduledBoss/.test(worldBossJs) && /bossState\.maxHp !== scheduledBoss\.maxHp/.test(worldBossJs), 'screen should discard wrong local boss HP/checkpoint before archive backfill');
  assert.ok(/DEFAULT_ENCOUNTER_PLAYERS/.test(worldBossEngineJs), 'world boss HP should not depend on local browser character cache');
  assert.ok(/state-engine.js\?v=20260716a/.test(indexHtml), 'state engine should be cache-busted for boss attack spawn-block parity');
  assert.ok(/worldState\.worldBoss\.maxHp !== scheduledBoss\.maxHp/.test(stateEngineJs), 'boss attack replay should reset wrong local boss HP to scheduled public boss');
  assert.ok(/worldState\.characters\[sender\] \|\| null/.test(stateEngineJs) && /character && character\.pot \? character\.pot : 14/.test(stateEngineJs), 'boss attacks from other accounts should still contribute when their local character is absent');
  assert.ok(/_schedulePostAttackRefresh/.test(worldBossJs) && /_backfillKey = ''/.test(worldBossJs), 'boss screen should force archive refresh after each successful attack');
  assert.ok(/'world-boss': true/.test(appJs), 'world boss screen should rerender after sync events');
  assert.ok(/leaderboard = leaderboard\.slice\(\)\.sort/.test(worldBossJs) && /b\.damage/.test(worldBossJs), 'world boss leaderboard should render largest damage first');
});

test('reported visual icon polish is explicit and cache-busted', function () {
  assert.ok(/function _getRecipeIcon/.test(craftingJs), 'crafting recipes should have per-recipe icons instead of only category icons');
  ['mana_potion', 'health_scroll', 'ash_wand', 'thornwood_staff', 'shadow_blade', 'veilstone_helm', 'windwalker_boots', 'ironbark_vest', 'fire_rune', 'shadow_rune', 'lucky_charm', 'armageddon_stone'].forEach(function(id) {
    assert.ok(new RegExp(id + ":").test(craftingJs), 'recipe icon map should include ' + id);
  });
  assert.ok(/the_veil:\s*'\\uD83C\\uDF19'/.test(mapJs), 'The Veil should use a brighter crescent moon icon');
  assert.ok(/region-card-/.test(mapJs) && /region-card-the_veil/.test(mainCss), 'The Veil moon should have a dedicated bright style hook');
  assert.ok(/forecast-weather-icon/.test(homeJs) && /forecast-sky-icon/.test(homeJs), 'home weather and sky icons should be separately styled/identifiable');
  assert.ok(/vmagic-tile-shimmer/.test(mainCss) && /scale\(1\.12\)/.test(mainCss), 'ambient motion should be visible, not only barely perceptible');
});

test('developers screen offers optional non-advantage award', function () {
  assert.ok(/screen-developers/.test(indexHtml), 'index should include developers screen container');
  assert.ok(/developers.js\?v=20260716a/.test(indexHtml), 'developers screen should be loaded and cache-busted');
  assert.ok(/developers-custom-energy/.test(developersJs) && /developers_custom_reward_label/.test(ruJs + enJs), 'developers screen should allow a custom 0.01-100 reward amount');
  assert.ok(/REWARD_OPTIONS = \[100\]/.test(developersJs), 'developers screen should keep only one fixed 1% quick reward');
  assert.ok(/app.js\?v=20260716a/.test(indexHtml), 'app controller should be cache-busted for developers route');
  assert.ok(/'developers'/.test(appJs), 'app should register developers as a navigable screen');
  assert.ok(/DevelopersScreen\.render/.test(appJs), 'app should render developers screen');
  assert.ok(/SECONDARY_HOME_SCREENS = \['character', 'leaderboard', 'chronicle', 'settings', 'help', 'developers'\]/.test(homeJs), 'home secondary actions should include Developers without World Boss');
  assert.ok(/DEVELOPER_ACCOUNT = 'denis-skripnik'/.test(developersJs), 'developer reward should target the project developer account');
  assert.ok(/VizBroadcast\.award\(DEVELOPER_ACCOUNT, energy, 0, memo, \[\]/.test(developersJs), 'developer reward should use an explicit VIZ award');
  assert.ok(/developers_reward_note/.test(developersJs + ruJs + enJs), 'copy should explain reward is optional and non-advantageous');
});


test('reported ux polish issues have explicit fixes', function () {
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
  assert.ok(/magic_news_dead_wasteland/.test(worldEventsJs + ruJs + enJs), 'dead wasteland news should be available');
  assert.ok(/festival\.prefixKey/.test(homeJs) && /festival\.icon/.test(homeJs), 'festival card should use calendar type and event icon');
  assert.ok(!/boss-alert-icon/.test(homeJs), 'home boss alert should not show an extra small dragon icon');
  assert.ok(/boss-title-centered/.test(worldBossJs + mainCss), 'world boss title should be centered');
  assert.ok(/💰/.test(worldBossJs) && /⚡/.test(worldBossJs), 'world boss contribution and counterattack sections should have thematic icons');
});

test('Denis feedback item and motion icons are semantic', function () {
  assert.ok(/viz-magic-v70-192\.png\?v=20260717c/.test(indexHtml), 'launcher icon should use the thinner v70 titlo-style plus asset');
  assert.ok(/assets\/icons\/viz-magic-v70-512\.png/.test(read('app/sw.js')), 'service worker should cache v70 icon');
  assert.ok(/ember_staff:\s*'🪵'/.test(craftingJs) && /fire_rune:\s*'\\uD83D\\uDD25'/.test(craftingJs), 'ash staff and fire rune recipes should not share the same flame icon');
  assert.ok(/market_sell_title/.test(marketplaceJs) && /💵/.test(marketplaceJs), 'sell tab should use a brighter money icon');
  assert.ok(!/sell-item-name::after/.test(mainCss), 'bazaar rows should not append a pen icon to every item');
  assert.ok(/chronicle_ink:\s*'🖋️'/.test(marketplaceJs) && /function _marketItemAfterIcon/.test(marketplaceJs) && /ink-drop-icon/.test(marketplaceJs + mainCss), 'chronicle ink should show pen before the name and a darker ink drop after the name');
  assert.ok(/region-icon vmagic-breathe/.test(mapJs), 'world map region icons should breathe');
  assert.ok(/char-icon vmagic-breathe/.test(characterJs), 'character class icon should breathe');
  assert.ok(/prophecy\.type === 'duel' \? '⚔️' : \(prophecy\.type === 'craft' \? '🔨' : '🧭'\)/.test(questScreenJs), 'daily craft prophecy should use hammer and duel prophecy should use crossed swords');
  assert.ok(/guild_recommended/.test(guildJs) && /🤺/.test(guildJs), 'recommended guilds should avoid repeated shield icon');
  assert.ok(/arena_filter_level/.test(arenaJs) && /🔍/.test(arenaJs), 'arena level filter should use a clearer filter/search icon');
  assert.ok(/arena_known_players/.test(arenaJs) && /🧙/.test(arenaJs), 'known mages should have a character-style icon');
  assert.ok(!/🔮 Сначала выбери ежедневное пророчество/.test(questScreenJs), 'daily prophecy helper text should not repeat the prophecy icon');
  assert.ok(/landing_card_hunt/.test(read('app/js/ui/screens/landing.js')) && /🏹/.test(read('app/js/ui/screens/landing.js')) && /⚔️/.test(read('app/js/ui/screens/landing.js')), 'landing hunt and duel cards should use bow and crossed swords');
  assert.ok(/boss-alert-mark/.test(homeJs + mainCss) && !/\\uD83D\\uDC32 Эфирный Дракон/.test(ruJs), 'home boss alert should use one enlarged dragon mark, not duplicate the emoji in text');
  assert.ok(/chronicle_narrative_boss_attack/.test(chronicleJs + ruJs) && /'boss\.attack': '⚡'/.test(chronicleJs), 'chronicle boss attacks should use lightning and avoid repeating the player name in text');
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
  assert.ok(/if \(!festival\) return null;/.test(worldEventsJs), 'ordinary days should have no festival card');
  assert.ok(!/day % FESTIVALS\.length/.test(worldEventsJs), 'festival selection should not rotate every day by modulo');
  assert.ok(/festival_great_prefix/.test(homeJs + ruJs + enJs), 'great holidays should have a distinct label');
});

test('Denis v70 polish keeps motion icons, honest low-mana hunt, and chronicle names clean', function () {
  assert.ok(/festival\.icon \|\| '🎆'/.test(homeJs), 'world festival card should use the mapped festival icon with fireworks fallback');
  assert.ok(!/html \+= '<h2>' \+ t\('enchant_title'\)/.test(craftingJs), 'enchant tab should not repeat a standalone Enchanting title above blocks');
  assert.ok(/<h3><span[\s\S]*enchant_title[\s\S]*enchant-desc[\s\S]*enchant-item-select/.test(craftingJs), 'enchant description should live inside the Enchanting block');
  assert.ok(/reforge-item-select[\s\S]*🧰/.test(craftingJs) && /enchant-item-select[\s\S]*🧰/.test(craftingJs), 'reforge and enchant item labels should use the same item icon');
  assert.ok(/hunt-rest-section[\s\S]*vmagic-breathe[\s\S]*⛺/.test(huntJs), 'camp rest icon should breathe');
  assert.ok(/vmagic-breathe[\s\S]*🐾[\s\S]*hunt_choose_creature/.test(huntJs), 'hunt prey icon should breathe');
  assert.ok(/vmagic-breathe[\s\S]*🪄[\s\S]*hunt_choose_spell/.test(huntJs), 'hunt spell icon should breathe');
  assert.ok(/temple-deity-copy[\s\S]*vmagic-breathe/.test(templeJs), 'temple deity icons should breathe');
  assert.ok(/screen-title-icon section-icon vmagic-breathe/.test(leaderboardJs), 'leaderboard title icon should breathe');
  assert.ok(/leaderboard_hunts:\s*'Охота'/.test(ruJs), 'leaderboard Hunts header should keep the final Russian letter');
  assert.ok(/help_title/.test(helpJs) && /❓/.test(helpJs), 'Help title should include the help button icon');
  assert.ok(/spellTooWeak/.test(huntJs) && /MIN_HUNT_COST/.test(huntJs) && /hunt_spell_too_weak/.test(huntJs + ruJs + enJs), 'hunt should guard against any combat spell below the 1% minimum');
  ['stone_wall', 'firebolt', 'shadow_step', 'binding_vine'].forEach(function(id) {
    assert.ok(new RegExp(id + '[\\s\\S]*manaCost: 100').test(spellsJs), id + ' should be a usable 1% starter combat spell, not a 0.1% trap');
  });
  assert.ok(/function _stripLeadingAuthor/.test(chronicleJs), 'chronicle should strip repeated leading author from entry text');
  assert.ok(/'hunt': '🏹'/.test(chronicleJs), 'chronicle hunt-start entries should use bow icon');
});

test('chronicle draft survives rerenders while feed loads', function () {
  assert.ok(/chronicle.js\?v=20260717c/.test(indexHtml), 'chronicle screen should be cache-busted for draft preservation');
  assert.ok(/DRAFT_KEY/.test(chronicleJs), 'chronicle should keep a draft key');
  assert.ok(/FEED_CACHE_PREFIX/.test(chronicleJs), 'chronicle should cache rendered old feed entries per tab for instant return');
  assert.ok(/_renderFeedEntries\(_filterByTab\(_dedupeEntries\(entries\), state\)\)/.test(chronicleJs), 'chronicle should render local entries before slow VoiceProtocol refresh');
  assert.ok(/function _renderLocalFeedNow/.test(chronicleJs) && /optimistic: true/.test(chronicleJs), 'new chronicle posts should appear optimistically without waiting for chain reload');
  assert.ok(/_getDraft\(\)/.test(chronicleJs) && /_setDraft\(this\.value\)/.test(chronicleJs), 'typed chronicle text should be restored and saved during rerenders');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
