/**
 * Viz Magic — Main Deterministic Game State Machine
 * Event-sourced state engine that processes blocks and builds WorldState.
 */
var StateEngine = (function() {
    'use strict';

    var cfg = VizMagicConfig;
    var AT = cfg.ACTION_TYPES;

    /** Current world state */
    var worldState = _createEmptyState();

    /**
     * Create empty world state
     */
    function _createEmptyState() {
        return {
            headBlock: 0,
            checkpointBlock: 0,
            characters: {},
            inventories: {},
            guilds: {},
            territories: {},
            marketplace: null,
            recentActions: [],
            social: {
                knownAccounts: []
            },
            guildListings: [],  // [{guild_id, created_block, sender, blockNum}]
            // Phase 5: Living World
            worldBoss: null,
            quests: {},       // account → playerQuestState
            loci: {},         // id → locus
            season: null,
            activeEvents: []
        };
    }

    function _normalizeWorldState(state) {
        var empty = _createEmptyState();
        if (!state || typeof state !== 'object') return empty;
        for (var key in empty) {
            if (empty.hasOwnProperty(key) && typeof state[key] === 'undefined') {
                state[key] = empty[key];
            }
        }
        if (typeof state.headBlock !== 'number' || isNaN(state.headBlock) || state.headBlock < 0) state.headBlock = 0;
        if (typeof state.checkpointBlock !== 'number' || isNaN(state.checkpointBlock) || state.checkpointBlock < 0) state.checkpointBlock = state.headBlock || 0;
        state.characters = state.characters || {};
        state.inventories = state.inventories || {};
        state.guilds = state.guilds || {};
        state.territories = state.territories || {};
        state.recentActions = state.recentActions || [];
        state.social = state.social || { knownAccounts: [] };
        state.social.knownAccounts = state.social.knownAccounts || [];
        state.guildListings = state.guildListings || [];
        state.quests = state.quests || {};
        state.loci = state.loci || {};
        state.activeEvents = state.activeEvents || [];
        return state;
    }

    /**
     * Initialize the state engine.
     * Tries to load from checkpoint, otherwise starts fresh.
     * @param {Function} callback - (err, worldState)
     */
    function init(callback) {
        CheckpointSystem.init(function(err) {
            if (err) {
                console.log('StateEngine: Checkpoint init error, starting fresh');
                callback(null, worldState);
                return;
            }

            CheckpointSystem.loadLatestCheckpoint('global', function(err, checkpoint) {
                if (checkpoint && checkpoint.state) {
                    worldState = _normalizeWorldState(checkpoint.state);
                    console.log('StateEngine: Loaded checkpoint at block', worldState.headBlock);
                } else {
                    console.log('StateEngine: No checkpoint found, starting fresh');
                }
                callback(null, worldState);
            });
        });
    }

    /**
     * Process a single processed block (output from BlockProcessor)
     * @param {Object} processedBlock - from BlockProcessor.processBlock
     * @returns {Array} list of game events generated
     */
    function processBlock(processedBlock) {
        var events = [];
        var blockNum = processedBlock.blockNum;
        var blockHash = processedBlock.blockHash;

        _ensureSocialState();

        // Process VM game actions
        for (var i = 0; i < processedBlock.vmActions.length; i++) {
            var vmAction = processedBlock.vmActions[i];
            var actionEvents = _processGameAction(
                vmAction.sender,
                vmAction.action,
                blockNum,
                blockHash
            );
            events = events.concat(actionEvents);
        }

        // Process Voice / Chronicle posts
        for (var vp = 0; vp < processedBlock.voicePosts.length; vp++) {
            _processVoicePost(processedBlock.voicePosts[vp], blockNum);
        }

        // Process awards (blessings)
        for (var j = 0; j < processedBlock.awards.length; j++) {
            var award = processedBlock.awards[j];
            _processAward(award, blockNum);
        }

        // Check duel timeouts
        if (typeof DuelStateManager !== 'undefined') {
            var timeoutEvents = DuelStateManager.checkTimeouts(blockNum, worldState);
            events = events.concat(timeoutEvents);
        }

        // Passive HP regeneration: +1 HP per HP_REGEN_RATE blocks, up to HP_REGEN_CAP_PCT% of maxHp
        var hpRegenRate = cfg.HP_REGEN.HP_REGEN_RATE;
        var hpRegenCapPct = cfg.HP_REGEN.HP_REGEN_CAP_PCT;
        for (var regenAcct in worldState.characters) {
            if (worldState.characters.hasOwnProperty(regenAcct)) {
                var regenChar = worldState.characters[regenAcct];
                // Skip fallen characters
                if (regenChar.fallenUntilBlock && regenChar.fallenUntilBlock > blockNum) {
                    continue;
                }
                var regenCap = Math.floor(regenChar.maxHp * hpRegenCapPct / 100);
                // Skip characters already at or above regen cap
                if (regenChar.hp >= regenCap) {
                    continue;
                }
                // Initialize lastRegenBlock if missing
                if (!regenChar.lastRegenBlock) {
                    regenChar.lastRegenBlock = blockNum;
                    continue;
                }
                var blocksSinceRegen = blockNum - regenChar.lastRegenBlock;
                var hpToRegen = Math.floor(blocksSinceRegen / hpRegenRate);
                if (hpToRegen > 0) {
                    regenChar.hp = Math.min(regenChar.hp + hpToRegen, regenCap);
                    regenChar.lastRegenBlock = blockNum;
                }
            }
        }

        // Check guild war expiry
        if (typeof GuildSystem !== 'undefined' && worldState.guilds) {
            for (var gid in worldState.guilds) {
                if (worldState.guilds.hasOwnProperty(gid)) {
                    GuildSystem.checkWarExpiry(worldState.guilds[gid], blockNum);
                }
            }
        }

        // Expire marketplace listings
        _ensureMarketplace();
        if (typeof MarketplaceEngine !== 'undefined') {
            MarketplaceEngine.expireListings(blockNum);
            _syncMarketplaceState();
        }

        // Register crafted item templates if needed
        if (typeof GameRecipes !== 'undefined' && GameRecipes.registerCraftedTemplates) {
            GameRecipes.registerCraftedTemplates();
        }

        // Periodic territory recalculation
        if (typeof TerritorySystem !== 'undefined' && worldState.territories) {
            if (TerritorySystem.needsRecalculation(worldState.territories, blockNum)) {
                var territoryEvents = TerritorySystem.recalculateAll(worldState.territories, blockNum);
                events = events.concat(territoryEvents);
            }
        }

        // --- Phase 5: World Events ---
        if (typeof WorldEvents !== 'undefined') {
            var worldEventTriggers = WorldEvents.checkEventTriggers(blockNum, worldState.headBlock);
            events = events.concat(worldEventTriggers);

            // Update season tracking
            worldState.season = WorldEvents.getCurrentSeason(blockNum);
            worldState.activeEvents = WorldEvents.getActiveEvents(blockNum);

            // World Boss spawn check
            for (var we = 0; we < worldEventTriggers.length; we++) {
                if (worldEventTriggers[we].type === 'world_boss_spawn' && typeof WorldBoss !== 'undefined') {
                    var playerCount = Object.keys(worldState.characters).length;
                    worldState.worldBoss = WorldBoss.spawnBoss(blockNum, playerCount, WorldBoss.BOSS_ACCOUNT);
                }
                if (worldEventTriggers[we].type === 'world_boss_window_end' && worldState.worldBoss) {
                    if (!worldState.worldBoss.defeated) {
                        worldState.worldBoss.active = false;
                    }
                }
            }
        }

        // --- Phase 5: Loci tier updates (every day) ---
        if (typeof LociSystem !== 'undefined' && worldState.loci) {
            if (blockNum % 28800 === 0) {
                for (var locId in worldState.loci) {
                    if (worldState.loci.hasOwnProperty(locId)) {
                        var tierChanged = LociSystem.updateLocusTier(worldState.loci[locId]);
                        if (tierChanged) {
                            events.push({
                                type: 'loci_tier_changed',
                                locusId: locId,
                                newTier: worldState.loci[locId].tier,
                                blockNum: blockNum
                            });
                        }
                    }
                }
            }
        }

        // Update head block
        worldState.headBlock = blockNum;

        // Keep recent actions trimmed
        while (worldState.recentActions.length > 200) {
            worldState.recentActions.shift();
        }

        return events;
    }

    /**
     * Process a single game action
     */
    function _processGameAction(sender, action, blockNum, blockHash) {
        var events = [];

        // Validate the action
        var validation = ActionValidator.validate(action, worldState, sender, blockNum);
        if (!validation.valid) {
            console.log('StateEngine: Invalid action from', sender, {
                type: action.type,
                error: validation.error,
                data: action.data || {}
            });
            return events;
        }

        switch (action.type) {
            case AT.CHAR_ATTUNE:
                events = events.concat(_handleCharAttune(sender, action.data, blockNum));
                break;
            case AT.HUNT:
                events = events.concat(_handleHunt(sender, action.data, blockNum, blockHash));
                break;
            case AT.HUNT_ARMAGEDDON:
                events = events.concat(_handleHuntArmageddon(sender, action.data, blockNum));
                break;
            case AT.TEMPLE_OFFERING:
                // Temple rewards are granted only from the real VIZ award memo in _processAward.
                // The VM custom op remains a public audit/link record, but cannot mint blessings alone.
                break;
            case AT.ITEM_EQUIP:
                events = events.concat(_handleEquip(sender, action.data, blockNum));
                break;
            case AT.ITEM_UNEQUIP:
                events = events.concat(_handleUnequip(sender, action.data, blockNum));
                break;
            case AT.REST:
                events = events.concat(_handleRest(sender, blockNum));
                break;
            case AT.MOVE:
                events = events.concat(_handleMove(sender, action.data, blockNum));
                break;
            // Duel actions — delegated to DuelStateManager
            case AT.CHALLENGE:
            case AT.ACCEPT:
            case AT.COMMIT:
            case AT.REVEAL:
            case AT.FORFEIT:
                if (typeof DuelStateManager !== 'undefined') {
                    events = events.concat(
                        DuelStateManager.processDuelAction(sender, action, blockNum, blockHash, worldState)
                    );
                }
                break;

            // --- Guild actions ---
            case AT.GUILD_CREATE:
                events = events.concat(_handleGuildCreate(sender, action.data, blockNum));
                break;
            case AT.GUILD_INVITE:
                events = events.concat(_handleGuildInvite(sender, action.data, blockNum));
                break;
            case AT.GUILD_ACCEPT:
                events = events.concat(_handleGuildAccept(sender, action.data, blockNum));
                break;
            case AT.GUILD_LEAVE:
                events = events.concat(_handleGuildLeave(sender, action.data, blockNum));
                break;
            case AT.GUILD_PROMOTE:
                events = events.concat(_handleGuildPromote(sender, action.data, blockNum));
                break;
            case AT.GUILD_WAR:
                events = events.concat(_handleGuildWar(sender, action.data, blockNum));
                break;
            case AT.GUILD_PEACE:
                events = events.concat(_handleGuildPeace(sender, action.data, blockNum));
                break;
            case AT.GUILD_LISTING:
                events = events.concat(_handleGuildListing(sender, action.data, blockNum));
                break;

            // --- Crafting ---
            case AT.CRAFT:
                events = events.concat(_handleCraft(sender, action.data, blockNum, blockHash));
                break;

            // --- Marketplace ---
            case AT.MARKET_LIST:
                events = events.concat(_handleMarketList(sender, action.data, blockNum));
                break;
            case AT.MARKET_CANCEL:
                events = events.concat(_handleMarketCancel(sender, action.data, blockNum));
                break;
            case AT.MARKET_BUY:
                events = events.concat(_handleMarketBuy(sender, action.data, blockNum));
                break;

            // --- Item Transfer ---
            case AT.ITEM_TRANSFER:
                events = events.concat(_handleItemTransfer(sender, action.data, blockNum));
                break;

            // --- Territory / Siege actions ---
            case AT.SIEGE_DECLARE:
                events = events.concat(_handleSiegeDeclare(sender, action.data, blockNum));
                break;
            case AT.SIEGE_COMMIT:
                events = events.concat(_handleSiegeCommit(sender, action.data, blockNum));
                break;
            case AT.TERRITORY_CLAIM:
                events = events.concat(_handleTerritoryClaim(sender, action.data, blockNum));
                break;

            // --- Phase 5: Quest actions ---
            case 'quest.accept':
                events = events.concat(_handleQuestAccept(sender, action.data, blockNum));
                break;
            case 'quest.complete':
                events = events.concat(_handleQuestComplete(sender, action.data, blockNum));
                break;
            case 'quest.abandon':
                events = events.concat(_handleQuestAbandon(sender, action.data, blockNum));
                break;

            // --- Phase 5: Boss attack ---
            case 'boss.attack':
                events = events.concat(_handleBossAttack(sender, action.data, blockNum, blockHash));
                break;

            // --- Phase 5: Locus creation ---
            case AT.LOC_CREATE:
                events = events.concat(_handleLocCreate(sender, action.data, blockNum));
                break;

            // --- On-chain loot proof ---
            case 'loot.acquire':
                events = events.concat(_handleLootAcquire(sender, action.data, blockNum));
                break;
        }

        // Add to recent actions — remember sender and any target accounts
        _rememberAccount(sender);
        if (action.data) {
            if (typeof action.data.target === 'string') _rememberAccount(action.data.target);
            if (typeof action.data.to === 'string') _rememberAccount(action.data.to);
        }

        worldState.recentActions.push({
            type: action.type,
            sender: sender,
            blockNum: blockNum,
            events: events,
            timestamp: Date.now()
        });

        return events;
    }

    function _processVoicePost(voicePost, blockNum) {
        if (!voicePost || !voicePost.message) return;

        _rememberAccount(voicePost.sender);

        worldState.recentActions.push({
            type: 'chronicle_post',
            sender: voicePost.sender,
            blockNum: voicePost.blockNum || blockNum,
            timestamp: voicePost.blockTime || Date.now(),
            text: voicePost.message.text || '',
            message: voicePost.message,
            events: []
        });
    }

    /**
     * Handle character attunement (creation)
     */
    function _handleCharAttune(sender, data, blockNum) {
        var character = CharacterSystem.createCharacter(sender, data.name, data.class);
        if (!character) return [];

        worldState.characters[sender] = character;
        worldState.inventories[sender] = [];
        worldState.quests[sender] = worldState.quests[sender] || (typeof QuestSystem !== 'undefined'
            ? QuestSystem.createPlayerQuestState()
            : { active: [], completed: [], dailyProphecyDay: 0 });

        // Give starter equipment based on class
        var starterItems = _getStarterItems(data.class, sender, blockNum);
        worldState.inventories[sender] = starterItems;

        return [{
            type: 'character_created',
            account: sender,
            className: data.class,
            name: data.name
        }];
    }

    /**
     * Handle hunt action
     */
    function _handleHunt(sender, data, blockNum, blockHash) {
        var character = worldState.characters[sender];
        if (!character) return [];

        // Skip if already processed by optimistic processHuntResult()
        if (character.lastHuntBlock === blockNum) return [];

        // Get creature and spell definitions
        var creature = GameCreatures.getCreature(data.creature);
        var spell = GameSpells.getSpell(data.spell);
        if (!creature || !spell) return [];

        // Resolve combat
        var result = CombatSystem.resolveHunt(
            character, creature, spell,
            blockHash, blockNum,
            cfg.ENERGY.MAX // Use max energy for now (actual energy tracked by chain)
        );

        // Apply results
        if (result.victory) {
            var xpResult = CharacterSystem.addXp(character, result.xpGained);

            // Add loot to inventory
            for (var i = 0; i < result.loot.length; i++) {
                var lootItem = ItemSystem.createItem(
                    result.loot[i].type,
                    sender,
                    result.loot[i].rarity,
                    blockNum,
                    '',
                    true // volatile
                );
                worldState.inventories[sender].push(lootItem);
            }
        }

        // Apply damage to player
        character.hp = result.hpRemaining;
        if (character.hp <= 0) {
            character.fallenUntilBlock = blockNum + cfg.BLOCK.FALLEN_DURATION;
            character.hp = 0;
        }

        character.lastHuntBlock = blockNum;

        // Phase 5: Quest progress tracking for hunts
        if (result.victory && typeof QuestSystem !== 'undefined') {
            _ensureQuests(sender);
            QuestSystem.updateQuestProgress(worldState.quests[sender], 'hunt', { target: data.creature, count: 1 });
        }

        return [{
            type: result.victory ? 'hunt_victory' : 'hunt_defeat',
            account: sender,
            creature: data.creature,
            result: result
        }];
    }

    /**
     * Handle Armageddon hunt action (replay path).
     * Spends full mana (10000 bp), consumes armageddon_stone, awards 100x XP.
     * Called both during blockchain replay and via processArmageddonResult for live play.
     * @param {string} sender
     * @param {Object} data - {creature, zone, stone (item_id)}
     * @param {number} blockNum
     * @returns {Array} events
     */
    function _handleHuntArmageddon(sender, data, blockNum) {
        var character = worldState.characters[sender];
        var inventory = worldState.inventories[sender];
        if (!character || !inventory) return [];

        var creature = GameCreatures.getCreature(data.creature);
        if (!creature) return [];

        // Verify armageddon_stone exists and is not consumed
        var stoneIndex = -1;
        for (var i = 0; i < inventory.length; i++) {
            if (inventory[i] && inventory[i].type === 'armageddon_stone' && !inventory[i].consumed) {
                // Prefer matching by id if provided
                if (!data.stone || inventory[i].id === data.stone) {
                    stoneIndex = i;
                    break;
                }
            }
        }
        if (stoneIndex === -1) {
            console.log('StateEngine: Armageddon rejected — no valid armageddon_stone for', sender);
            return [];
        }

        // Consume the stone
        inventory[stoneIndex].consumed = true;

        // Calculate XP: 100x normal hunt XP
        var xp = GameFormulas.armageddonXp(character.level, creature.minLevel, creature.baseXp || 25);
        var xpResult = CharacterSystem.addXp(character, xp);

        character.lastHuntBlock = blockNum;

        return [{
            type: 'armageddon_used',
            account: sender,
            creature: data.creature,
            xpGained: xp,
            levelsGained: xpResult ? (xpResult.levelsGained || 0) : 0,
            stoneId: data.stone || ''
        }];
    }


    /**
     * Handle a Temple offering. Rewards are intentionally non-combat cosmetic relics.
     * Cooldown prevents spam and keeps the economy from becoming pay-to-win.
     */
    function _handleTempleOffering(sender, data, blockNum) {
        if (!worldState.characters[sender]) return [];
        var deity = data.deity || '';
        var target = data.target || '';
        var energy = Number(data.energy || 0);
        var cfgByDeity = {
            fire_goddess: { target: 'null', minEnergy: 50, item: 'flame_votive_mark', blessing: { type: 'fire', school: 'ignis', schoolBonus: 20 } },
            labor_god: { target: 'committee', minEnergy: 50, item: 'labor_votive_mark', blessing: { type: 'labor', fortuneBonus: 2 } }
        };
        var def = cfgByDeity[deity];
        if (!def || target !== def.target || energy < def.minEnergy) return [];

        if (!worldState.temple) worldState.temple = {};
        if (!worldState.temple[sender]) worldState.temple[sender] = {};
        var lastBlock = worldState.temple[sender][deity] || 0;
        var cooldown = 28800; // roughly one day
        if (lastBlock && blockNum && blockNum - lastBlock < cooldown) {
            return [{ type: 'temple_offering_rejected', account: sender, deity: deity, reason: 'cooldown' }];
        }

        worldState.temple[sender][deity] = blockNum || 0;
        if (!worldState.temple[sender].blessings) worldState.temple[sender].blessings = {};
        var blessing = {};
        for (var bk in def.blessing) {
            if (def.blessing.hasOwnProperty(bk)) blessing[bk] = def.blessing[bk];
        }
        blessing.deity = deity;
        blessing.expiresBlock = (blockNum || 0) + cooldown;
        blessing.prayer = data.prayer || '';
        worldState.temple[sender].blessings[deity] = blessing;
        if (!worldState.inventories[sender]) worldState.inventories[sender] = [];
        var item = ItemSystem.createItem(def.item, sender, 1, blockNum || 0, sender, false);
        item.templeDeity = deity;
        item.nonCombat = true;
        worldState.inventories[sender].push(item);
        return [{
            type: 'temple_offering',
            account: sender,
            deity: deity,
            target: target,
            energy: energy,
            itemType: def.item,
            itemId: item.id,
            blessing: blessing
        }];
    }

    /**
     * Handle item equip
     */
    function _handleEquip(sender, data, blockNum) {
        var character = worldState.characters[sender];
        var inventory = worldState.inventories[sender];
        if (!character || !inventory) return [];

        // Find item in inventory
        var item = null;
        for (var i = 0; i < inventory.length; i++) {
            if (inventory[i].id === data.item) {
                item = inventory[i];
                break;
            }
        }
        if (!item) return [];

        var previous = ItemSystem.equipItem(character, item);
        return [{
            type: 'item_equipped',
            account: sender,
            item: item.type,
            slot: data.slot
        }];
    }

    /**
     * Handle item unequip
     */
    function _handleUnequip(sender, data, blockNum) {
        var character = worldState.characters[sender];
        if (!character) return [];

        var item = ItemSystem.unequipItem(character, data.slot);
        if (!item) return [];

        return [{
            type: 'item_unequipped',
            account: sender,
            item: item.type,
            slot: data.slot
        }];
    }

    /**
     * Handle rest action
     */
    function _handleRest(sender, blockNum) {
        var character = worldState.characters[sender];
        if (!character) return [];

        // Rest restores HP to max
        character.hp = character.maxHp;
        // Clear fallen status if in safe zone
        if (character.currentZone === 'commons_first_light') {
            character.fallenUntilBlock = 0;
        }

        return [{
            type: 'rest_complete',
            account: sender
        }];
    }

    /**
     * Handle move action
     */
    function _handleMove(sender, data, blockNum) {
        var character = worldState.characters[sender];
        if (!character) return [];

        var previousZone = character.currentZone;
        character.currentZone = data.zone;

        if (typeof QuestSystem !== 'undefined' && data.zone && data.zone !== previousZone) {
            _ensureQuests(sender);
            QuestSystem.updateQuestProgress(worldState.quests[sender], 'explore', { target: data.zone, uniqueKey: data.zone, count: 1 });
        }

        return [{
            type: 'character_moved',
            account: sender,
            zone: data.zone
        }];
    }

    /**
     * Process an award operation
     */
    function _processAward(award, blockNum) {
        _rememberAccount(award.initiator);
        _rememberAccount(award.receiver);

        var memo = award.memo || '';
        var memoText = String(memo);
        var isBless = memoText.indexOf('viz://vm/bless/') === 0;
        var isTemple = memoText.indexOf('viz://vm/temple/') === 0;

        if (isTemple) {
            var prefix = 'viz://vm/temple/';
            var rest = memoText.substring(prefix.length);
            var dashIdx = rest.indexOf(' — ');
            var deity = dashIdx >= 0 ? rest.substring(0, dashIdx) : rest.split(' ')[0];
            var prayer = dashIdx >= 0 ? rest.substring(dashIdx + 3) : '';
            var templeEvents = _handleTempleOffering(award.initiator, {
                deity: deity,
                target: award.receiver,
                energy: award.energy,
                prayer: prayer
            }, blockNum);
            worldState.recentActions.push({
                type: AT.TEMPLE_OFFERING,
                sender: award.initiator,
                blockNum: blockNum,
                energy: award.energy,
                memo: memo,
                events: templeEvents,
                timestamp: Date.now()
            });
            return;
        }

        if (!isBless) return;

        worldState.recentActions.push({
            type: 'blessing_sent',
            sender: award.initiator,
            receiver: award.receiver,
            blockNum: blockNum,
            energy: award.energy,
            memo: memo,
            events: [],
            timestamp: Date.now()
        });

        if (typeof QuestSystem !== 'undefined' && worldState.quests && worldState.quests[award.initiator]) {
            QuestSystem.updateQuestProgress(worldState.quests[award.initiator], 'social', { target: 'blessing', uniqueKey: award.receiver, count: 1 });
        }
    }

    // ==========================================
    // Guild Action Handlers
    // ==========================================

    function _handleGuildCreate(sender, data, blockNum) {
        if (!data.id || worldState.guilds[data.id]) return []; // duplicate ID
        var guild = GuildSystem.createGuild(data.id, sender, data, blockNum);
        if (!guild) return [];
        worldState.guilds[data.id] = guild;

        // Auto-add listing so fresh clients discover this guild
        if (!worldState.guildListings) worldState.guildListings = [];
        var alreadyListed = false;
        for (var gl = 0; gl < worldState.guildListings.length; gl++) {
            if (worldState.guildListings[gl].guild_id === data.id) { alreadyListed = true; break; }
        }
        if (!alreadyListed) {
            worldState.guildListings.push({
                guild_id: data.id,
                created_block: blockNum,
                sender: sender,
                blockNum: blockNum
            });
        }

        return [{ type: 'guild_created', guildId: data.id, founder: sender, blockNum: blockNum, guildName: data.name || data.id }];
    }

    function _handleGuildInvite(sender, data, blockNum) {
        var guild = worldState.guilds[data.guild_id];
        if (!guild && typeof GuildSystem.ensureGuildShell === 'function') {
            guild = GuildSystem.ensureGuildShell(worldState.guilds, data.guild_id, sender, blockNum);
        }
        if (!guild) return [];

        if (guild.isPlaceholder && !guild.members[sender]) {
            guild.members[sender] = {
                account: sender,
                rank: GuildSystem.RANKS.FOUNDER,
                joinedBlock: blockNum,
                delegatedShares: 0,
                pvpWins: 0,
                pvpLosses: 0,
                questContributions: 0
            };
            if (!guild.founder) guild.founder = sender;
        }

        var ok = GuildSystem.addInvite(guild, sender, data.target, blockNum);
        if (!ok) return [];
        return [{ type: 'guild_invite', guildId: data.guild_id, inviter: sender, target: data.target }];
    }

    function _handleGuildAccept(sender, data, blockNum) {
        var guild = worldState.guilds[data.guild_id];
        if (!guild && typeof GuildSystem.ensureGuildShell === 'function') {
            guild = GuildSystem.ensureGuildShell(worldState.guilds, data.guild_id, '', blockNum);
        }
        if (!guild) return [];
        var ok = GuildSystem.joinGuild(guild, sender, blockNum);
        if (!ok) return [];
        return [{ type: 'guild_joined', guildId: data.guild_id, guildName: guild.name || data.guild_id, account: sender }];
    }

    function _handleGuildLeave(sender, data, blockNum) {
        var guild = worldState.guilds[data.guild_id];
        if (!guild && typeof GuildSystem.ensureGuildShell === 'function') {
            guild = GuildSystem.ensureGuildShell(worldState.guilds, data.guild_id, '', blockNum);
        }
        if (!guild) return [];
        var ok = GuildSystem.leaveGuild(guild, sender);
        if (!ok) return [];
        return [{ type: 'guild_left', guildId: data.guild_id, account: sender }];
    }

    function _handleGuildPromote(sender, data, blockNum) {
        var guild = worldState.guilds[data.guild_id];
        if (!guild && typeof GuildSystem.ensureGuildShell === 'function') {
            guild = GuildSystem.ensureGuildShell(worldState.guilds, data.guild_id, sender, blockNum);
        }
        if (!guild) return [];

        if (guild.isPlaceholder && !guild.members[sender]) {
            guild.members[sender] = {
                account: sender,
                rank: GuildSystem.RANKS.FOUNDER,
                joinedBlock: blockNum,
                delegatedShares: 0,
                pvpWins: 0,
                pvpLosses: 0,
                questContributions: 0
            };
            if (!guild.founder) guild.founder = sender;
        }

        if (guild.isPlaceholder && data.target && !guild.members[data.target]) {
            guild.members[data.target] = {
                account: data.target,
                rank: GuildSystem.RANKS.INITIATE,
                joinedBlock: blockNum,
                delegatedShares: 0,
                pvpWins: 0,
                pvpLosses: 0,
                questContributions: 0
            };
        }

        var ok = GuildSystem.promoteRank(guild, sender, data.target, data.rank);
        if (!ok) return [];
        return [{ type: 'guild_promoted', guildId: data.guild_id, promoter: sender, target: data.target, rank: data.rank }];
    }

    function _handleGuildWar(sender, data, blockNum) {
        var attackerGuild = worldState.guilds[data.attacker];
        var defenderGuild = worldState.guilds[data.defender];
        if (!attackerGuild || !defenderGuild) return [];
        var war = GuildSystem.declareWar(attackerGuild, defenderGuild, sender, data.duration_blocks, data.terms, blockNum);
        if (!war) return [];
        return [{ type: 'guild_war_declared', warRef: war.ref, attacker: data.attacker, defender: data.defender }];
    }

    function _handleGuildPeace(sender, data, blockNum) {
        // Find war in any guild sender belongs to
        var myGuild = GuildSystem.findGuildByMember(worldState.guilds, sender);
        if (!myGuild) return [];
        if (!GuildSystem.isOfficer(myGuild, sender)) return [];
        var ok = GuildSystem.declarePeace(myGuild, data.war_ref);
        if (!ok) return [];
        return [{ type: 'guild_peace', warRef: data.war_ref, declarer: sender }];
    }

    function _handleGuildListing(sender, data, blockNum) {
        if (!data.guild_id || !data.created_block) return [];
        // Accept listing even if guild is not yet in local state or is a placeholder.
        // The listing's purpose is discovery — other clients need it to learn
        // about guilds they haven't synced yet. Membership validation is too
        // strict here because the receiving client may not have the guild data.

        if (!worldState.guildListings) worldState.guildListings = [];
        // Deduplicate: keep only the latest listing per guild
        for (var i = worldState.guildListings.length - 1; i >= 0; i--) {
            if (worldState.guildListings[i].guild_id === data.guild_id) {
                worldState.guildListings.splice(i, 1);
            }
        }
        worldState.guildListings.push({
            guild_id: data.guild_id,
            created_block: data.created_block | 0,
            sender: sender,
            blockNum: blockNum
        });
        // Keep max 50 listings
        while (worldState.guildListings.length > 50) {
            worldState.guildListings.shift();
        }
        return [{ type: 'guild_listing', guildId: data.guild_id, sender: sender, createdBlock: data.created_block }];
    }

    // ==========================================
    // Territory / Siege Action Handlers
    // ==========================================

    function _handleSiegeDeclare(sender, data, blockNum) {
        _ensureTerritories(blockNum);
        var territory = worldState.territories[data.territory_id];
        if (!territory) return [];
        var myGuild = GuildSystem.findGuildByMember(worldState.guilds, sender);
        if (!myGuild || !GuildSystem.isOfficer(myGuild, sender)) return [];
        var siege = TerritorySystem.declareSiege(data.territory_id, data.guild_id || myGuild.id, territory, blockNum);
        if (!siege) return [];
        return [{ type: 'siege_declared', siegeRef: siege.ref, regionId: data.territory_id, attacker: myGuild.id }];
    }

    function _handleSiegeCommit(sender, data, blockNum) {
        _ensureTerritories(blockNum);
        // Find which territory has this siege
        for (var regionId in worldState.territories) {
            if (!worldState.territories.hasOwnProperty(regionId)) continue;
            var territory = worldState.territories[regionId];
            for (var i = 0; i < territory.activeSieges.length; i++) {
                var siege = territory.activeSieges[i];
                if (siege.ref === data.siege_ref && siege.state === 'active') {
                    var myGuild = GuildSystem.findGuildByMember(worldState.guilds, sender);
                    if (!myGuild) return [];
                    var isAttacker = myGuild.id === siege.attackerGuild;
                    var isDefender = myGuild.id === siege.defenderGuild;
                    if (!isAttacker && !isDefender) return [];
                    TerritorySystem.contributeSiege(territory, data.siege_ref, sender, data.energy | 0, isAttacker);
                    return [{ type: 'siege_contribution', siegeRef: data.siege_ref, account: sender, energy: data.energy | 0 }];
                }
            }
        }
        return [];
    }

    function _handleTerritoryClaim(sender, data, blockNum) {
        _ensureTerritories(blockNum);
        var territory = worldState.territories[data.territory_id];
        if (!territory) return [];
        var result = TerritorySystem.resolveSiege(territory, data.siege_ref, blockNum);
        if (!result) return [];
        return [{ type: 'territory_claimed', regionId: data.territory_id, winner: result.winner, siegeRef: data.siege_ref }];
    }

    // ==========================================
    // Crafting / Market / Transfer Action Handlers
    // ==========================================

    function _handleCraft(sender, data, blockNum, blockHash) {
        var character = worldState.characters[sender];
        var inventory = worldState.inventories[sender];
        if (!character || !inventory) return [];

        var result;
        if (typeof CraftingSystem.craftWithMaterialIds === 'function') {
            result = CraftingSystem.craftWithMaterialIds(
                data.recipe, character, inventory,
                data.location || '', blockHash, blockNum, sender,
                data.materials || []
            );
        } else {
            result = CraftingSystem.craft(
                data.recipe, character, inventory,
                data.location || '', blockHash, blockNum, sender
            );
        }

        if (!result.success) {
            console.log('StateEngine: Craft failed for', sender, ':', result.error);
            return [];
        }

        return [{
            type: 'item_crafted',
            account: sender,
            itemType: result.item.type,
            rarity: result.quality.rarity,
            rarityName: result.quality.rarityName,
            itemId: result.item.id,
            consumedIds: result.consumedIds
        }];
    }

    function _handleMarketList(sender, data, blockNum) {
        _ensureMarketplace();
        var character = worldState.characters[sender];
        var inventory = worldState.inventories[sender];
        if (!character || !inventory) return [];

        // Find item
        var item = null;
        for (var i = 0; i < inventory.length; i++) {
            if (inventory[i].id === data.item_ref) {
                item = inventory[i];
                break;
            }
        }
        if (!item) return [];

        var result = MarketplaceEngine.createListing(
            sender, item, data.price, blockNum, data.expires_block
        );

        if (!result.success) {
            console.log('StateEngine: Market list failed:', result.error);
            return [];
        }

        _syncMarketplaceState();

        return [{
            type: 'market_listed',
            account: sender,
            listingRef: result.listing.ref,
            itemType: item.type,
            price: data.price
        }];
    }

    function _handleMarketCancel(sender, data, blockNum) {
        _ensureMarketplace();
        var inventory = worldState.inventories[sender] || [];
        var result = MarketplaceEngine.cancelListing(sender, data.listing_ref, inventory);

        if (!result.success) {
            console.log('StateEngine: Market cancel failed:', result.error);
            return [];
        }

        _syncMarketplaceState();

        return [{
            type: 'market_cancelled',
            account: sender,
            listingRef: data.listing_ref
        }];
    }

    function _handleMarketBuy(sender, data, blockNum) {
        _ensureMarketplace();
        var result = MarketplaceEngine.buyItem(sender, data.listing_ref, blockNum, worldState);

        if (!result.success) {
            console.log('StateEngine: Market buy failed:', result.error);
            return [];
        }

        _syncMarketplaceState();

        return [{
            type: 'market_sold',
            buyer: sender,
            seller: result.listing.seller,
            listingRef: data.listing_ref,
            itemType: result.listing.itemType,
            price: result.listing.price
        }];
    }

    function _handleItemTransfer(sender, data, blockNum) {
        var result = MarketplaceEngine.transferItem(sender, data.item_ref, data.to, worldState);

        if (!result.success) {
            console.log('StateEngine: Transfer failed:', result.error);
            return [];
        }

        return [{
            type: 'item_transferred',
            from: sender,
            to: data.to,
            itemType: result.item.type,
            itemId: data.item_ref,
            reason: data.reason || 'transfer'
        }];
    }

    /**
     * Ensure marketplace state is initialized
     */
    function _ensureMarketplace() {
        if (!worldState.marketplace || !worldState.marketplace.listings) {
            worldState.marketplace = {
                listings: {},
                history: [],
                priceHistory: {}
            };
        }
        if (typeof MarketplaceEngine !== 'undefined') {
            // Keep the replay/checkpoint world state and the marketplace module
            // on the same object so listings survive save/load and buy/cancel
            // handlers do not mutate a detached in-memory marketplace.
            MarketplaceEngine.setMarketState(worldState.marketplace);
        }
    }

    function _syncMarketplaceState() {
        if (typeof MarketplaceEngine !== 'undefined') {
            worldState.marketplace = MarketplaceEngine.getMarketState();
        }
    }

    /**
     * Ensure territories are initialized
     */
    function _ensureTerritories(blockNum) {
        if (!worldState.territories || Object.keys(worldState.territories).length === 0) {
            worldState.territories = TerritorySystem.initTerritories(blockNum);
        }
    }

    /**
     * Ensure player quest state exists
     */
    function _ensureQuests(account) {
        if (!worldState.quests) worldState.quests = {};
        if (!worldState.quests[account]) {
            worldState.quests[account] = (typeof QuestSystem !== 'undefined')
                ? QuestSystem.createPlayerQuestState()
                : { active: [], completed: [], dailyProphecyDay: 0 };
        }
    }

    function _ensureSocialState() {
        if (!worldState.social) {
            worldState.social = { knownAccounts: [] };
        }
        if (!worldState.social.knownAccounts) {
            worldState.social.knownAccounts = [];
        }
    }

    function _rememberAccount(account) {
        if (!account) return;
        _ensureSocialState();
        if (worldState.social.knownAccounts.indexOf(account) === -1) {
            worldState.social.knownAccounts.push(account);
        }
    }

    // ==========================================
    // Phase 5: Quest / Boss / Loci Handlers
    // ==========================================

    function _handleQuestAccept(sender, data, blockNum) {
        if (typeof QuestSystem === 'undefined' || typeof GameQuests === 'undefined') return [];
        _ensureQuests(sender);
        var character = worldState.characters[sender];
        if (!character) return [];
        var questData;
        if (data && data.daily) {
            questData = QuestSystem.generateDailyProphecy(data.daily_block || blockNum, character.level);
        } else {
            questData = GameQuests.getQuest(data.quest_id);
        }
        if (!questData) return [];
        var result = QuestSystem.acceptQuest(questData, character, worldState.quests[sender], blockNum);
        if (!result.success) return [];
        return [{ type: 'quest_accepted', account: sender, questId: questData.id, daily: !!(data && data.daily), blockNum: blockNum }];
    }

    function _handleQuestComplete(sender, data, blockNum) {
        if (typeof QuestSystem === 'undefined') return [];
        _ensureQuests(sender);
        var character = worldState.characters[sender];
        var inventory = worldState.inventories[sender];
        if (!character) return [];
        var result = QuestSystem.completeQuest(data.quest_id, worldState.quests[sender], character, inventory, blockNum);
        if (!result.success) return [];
        return [{ type: 'quest_completed', account: sender, questId: data.quest_id, rewards: result.rewards, blockNum: blockNum }];
    }

    function _handleQuestAbandon(sender, data, blockNum) {
        if (typeof QuestSystem === 'undefined') return [];
        _ensureQuests(sender);
        var ok = QuestSystem.abandonQuest(data.quest_id, worldState.quests[sender]);
        if (!ok) return [];
        return [{ type: 'quest_abandoned', account: sender, questId: data.quest_id, blockNum: blockNum }];
    }

    function _handleBossAttack(sender, data, blockNum, blockHash) {
        if (typeof WorldBoss === 'undefined') return [];

        // Auto-spawn boss if attack arrives but no boss state exists
        // (happens when boss spawn block is outside the sync window)
        if (!worldState.worldBoss || !worldState.worldBoss.active) {
            var playerCount = Object.keys(worldState.characters).length;
            var spawnBlock = blockNum;
            if (typeof WorldEvents !== 'undefined' && WorldEvents.checkWorldBossWindow) {
                var bossEvent = WorldEvents.checkWorldBossWindow(blockNum);
                if (bossEvent && bossEvent.spawnBlock) spawnBlock = bossEvent.spawnBlock;
            }
            worldState.worldBoss = WorldBoss.spawnBoss(spawnBlock, playerCount, WorldBoss.BOSS_ACCOUNT);
        }

        var character = worldState.characters[sender];
        if (!character) return [];

        var pot = (typeof CharacterSystem !== 'undefined' && CharacterSystem.getTotalStat)
            ? CharacterSystem.getTotalStat(character, 'pot') : (character.pot || 10);
        var baseDamage = pot * 5 + character.level * 10;
        var result = WorldBoss.attackBoss(worldState.worldBoss, sender, baseDamage, data.spell || '', blockNum, blockHash);
        if (!result.success) return [];

        var events = [{ type: 'boss_attacked', account: sender, damage: result.damage, counterDamage: result.counterDamage, blockNum: blockNum }];
        if (result.bossDefeated) {
            var loot = _applyBossRewards(blockNum);
            events.push({ type: 'boss_defeated', blockNum: blockNum, totalDamage: worldState.worldBoss.totalDamage, loot: loot });
        }
        return events;
    }

    function _applyBossRewards(blockNum) {
        if (typeof WorldBoss === 'undefined' || !worldState.worldBoss || !worldState.worldBoss.defeated) return [];
        var loot = WorldBoss.distributeLoot(worldState.worldBoss);
        for (var i = 0; i < loot.length; i++) {
            var entry = loot[i];
            var character = worldState.characters[entry.account];
            if (character && typeof CharacterSystem !== 'undefined' && CharacterSystem.addXp) {
                if (typeof character.xp !== 'number' || isNaN(character.xp)) character.xp = 0;
                CharacterSystem.addXp(character, entry.xpReward);
            }
            if (!worldState.inventories[entry.account]) worldState.inventories[entry.account] = [];
            if (typeof ItemSystem !== 'undefined' && ItemSystem.createItem) {
                for (var j = 0; j < entry.items.length; j++) {
                    var rewardItem = ItemSystem.createItem(entry.items[j].type, entry.account, entry.items[j].rarity, blockNum, '', true);
                    worldState.inventories[entry.account].push(rewardItem);
                }
            }
        }
        return loot;
    }

    function _handleLocCreate(sender, data, blockNum) {
        if (typeof LociSystem === 'undefined') return [];
        if (!worldState.loci) worldState.loci = {};
        var locus = LociSystem.createLocus(sender, data.voice_ref || '' + blockNum, data.name || '', data.type || 'camp', data.region || 'commons_first_light', blockNum);
        worldState.loci[locus.id] = locus;
        return [{ type: 'locus_created', locusId: locus.id, creator: sender, blockNum: blockNum }];
    }

    /**
     * Get starter items for a class
     */
    function _getStarterItems(className, owner, blockNum) {
        var items = [];
        switch (className) {
            case 'stonewarden':
                items.push(ItemSystem.createItem('iron_shield', owner, 0, blockNum, '', false));
                items.push(ItemSystem.createItem('cloth_robe', owner, 0, blockNum, '', false));
                break;
            case 'embercaster':
                items.push(ItemSystem.createItem('ash_wand', owner, 0, blockNum, '', false));
                items.push(ItemSystem.createItem('cloth_robe', owner, 0, blockNum, '', false));
                break;
            case 'moonrunner':
                items.push(ItemSystem.createItem('oak_wand', owner, 0, blockNum, '', false));
                items.push(ItemSystem.createItem('leather_boots', owner, 0, blockNum, '', false));
                break;
            case 'bloomsage':
                items.push(ItemSystem.createItem('oak_wand', owner, 0, blockNum, '', false));
                items.push(ItemSystem.createItem('cloth_robe', owner, 0, blockNum, '', false));
                break;
        }
        return items;
    }

    /**
     * Save current state as checkpoint
     * @param {Function} callback
     */
    function saveCheckpoint(callback) {
        CheckpointSystem.saveCheckpoint('global', worldState.headBlock, worldState, function(err) {
            if (!err) {
                worldState.checkpointBlock = worldState.headBlock;
            }
            callback(err);
        });
    }

    /**
     * Get current world state
     * @returns {Object}
     */
    function getState() {
        return worldState;
    }

    /**
     * Get character state for an account
     * @param {string} account
     * @returns {Object|null}
     */
    function getCharacter(account) {
        return worldState.characters[account] || null;
    }

    /**
     * Get inventory for an account
     * @param {string} account
     * @returns {Array}
     */
    function getInventory(account) {
        return worldState.inventories[account] || [];
    }

    /**
     * Handle loot.acquire — on-chain proof of item drop.
     * During live play the item is already in inventory (added by processHuntResult).
     * During replay this action is a no-op (item was added by _handleHunt).
     * Its sole purpose: create a verifiable on-chain record of legitimate drops.
     */
    function _handleLootAcquire(sender, data, blockNum) {
        // No-op for replay — item already created by _handleHunt.
        // Just emit the event for chronicle/audit trail.
        return [{
            type: 'loot_acquired',
            account: sender,
            itemType: data.item,
            itemId: data.item_id || '',
            huntBlock: data.hunt_block || blockNum
        }];
    }


    /**
     * Return active Temple blessings for combat/UI. Expired blessings are ignored.
     */
    function getTempleBlessing(account, blockNum) {
        var result = { schoolBonuses: {}, fortuneBonus: 0, active: [] };
        if (!worldState.temple || !worldState.temple[account] || !worldState.temple[account].blessings) return result;
        var blessings = worldState.temple[account].blessings;
        for (var deity in blessings) {
            if (!blessings.hasOwnProperty(deity)) continue;
            var b = blessings[deity];
            if (!b || (b.expiresBlock && blockNum && b.expiresBlock < blockNum)) continue;
            result.active.push(b);
            if (b.school && b.schoolBonus) {
                result.schoolBonuses[b.school] = (result.schoolBonuses[b.school] || 0) + b.schoolBonus;
            }
            if (b.fortuneBonus) result.fortuneBonus += b.fortuneBonus;
        }
        return result;
    }

    /**
     * Process a hunt action directly (for live UI — bypasses block replay).
     * Adds XP, loot, quest progress identically to _handleHunt.
     * @param {string} account - player account
     * @param {string} creatureId
     * @param {string} spellId
     * @param {string} blockHash - witness_signature as fate entropy
     * @param {number} blockNum
     * @param {number} playerEnergy - actual energy from chain (0-10000)
     * @returns {Object|null} result with {victory, xpGained, loot, hpRemaining, creatureLevel, critical, damageDealt, damageTaken, levelsGained}
     */
    function processHuntResult(account, creatureId, spellId, blockHash, blockNum, playerEnergy) {
        var character = worldState.characters[account];
        if (!character) return null;
        var creature = GameCreatures.getCreature(creatureId);
        var spell = GameSpells.getSpell(spellId);
        if (!creature || !spell) return null;

        var result = CombatSystem.resolveHunt(character, creature, spell, blockHash, blockNum, playerEnergy);

        if (result.victory) {
            var xpResult = CharacterSystem.addXp(character, result.xpGained);
            result.levelsGained = xpResult ? (xpResult.levelsGained || 0) : 0;
            if (!worldState.inventories[account]) worldState.inventories[account] = [];
            for (var i = 0; i < result.loot.length; i++) {
                var lootItem = ItemSystem.createItem(
                    result.loot[i].type, account, result.loot[i].rarity, blockNum, '', true
                );
                worldState.inventories[account].push(lootItem);
                result.loot[i].itemId = lootItem.id;
            }
            if (typeof QuestSystem !== 'undefined' && worldState.quests && worldState.quests[account]) {
                QuestSystem.updateQuestProgress(worldState.quests[account], 'hunt', { target: creatureId, count: 1 });
            }
        } else {
            var defeatXp = Math.floor(GameFormulas.huntXp(character.level, result.creatureLevel, creature.baseXp || 50) / 4);
            if (defeatXp > 0) {
                var defeatXpResult = CharacterSystem.addXp(character, defeatXp);
                result.xpGained = defeatXp;
                result.levelsGained = defeatXpResult ? (defeatXpResult.levelsGained || 0) : 0;
            }
        }

        character.hp = result.hpRemaining;
        if (character.hp <= 0) {
            character.hp = 0;
            character.fallenUntilBlock = blockNum + (cfg.BLOCK ? cfg.BLOCK.FALLEN_DURATION : 14400);
        }
        character.lastHuntBlock = blockNum;

        return result;
    }


    /**
     * Process Temple offering for live UI — same logic as replay.
     */
    function processTempleOfferingResult(account, deityId, targetAccount, energy, blockNum) {
        var prayerText = arguments.length > 5 ? arguments[5] : '';
        var events = _handleTempleOffering(account, {
            deity: deityId,
            target: targetAccount,
            energy: energy,
            prayer: prayerText || ''
        }, blockNum || 0);
        if (!events.length) return null;
        return events[0];
    }

    /**
     * Process movement for live UI — same authoritative mutation path as replay.
     * @param {string} account
     * @param {string} zoneId
     * @param {number} blockNum
     * @returns {Object|null}
     */
    function processMoveResult(account, zoneId, blockNum) {
        if (!zoneId) return null;
        var events = _handleMove(account, { zone: zoneId }, blockNum || 0);
        if (!events.length) return null;
        return events[0];
    }

    /**
     * Process rest for live UI — same authoritative mutation path as replay.
     * @param {string} account
     * @param {number} blockNum
     * @returns {Object|null}
     */
    function processRestResult(account, blockNum) {
        var events = _handleRest(account, blockNum || 0);
        if (!events.length) return null;
        return events[0];
    }

    /**
     * Process crafting for live UI — same authoritative mutation path as replay.
     * @param {string} account
     * @param {string} recipeId
     * @param {Array} materialIds
     * @param {string} location
     * @param {string} blockHash
     * @param {number} blockNum
     * @returns {Object|null}
     */
    function processCraftResult(account, recipeId, materialIds, location, blockHash, blockNum) {
        var data = {
            recipe: recipeId,
            materials: materialIds || [],
            location: location || ''
        };
        var events = _handleCraft(account, data, blockNum || 0, blockHash || '');
        if (!events.length) return null;
        return events[0];
    }

    function processMarketListResult(account, itemRef, price, expiresBlock, blockNum) {
        var data = {
            item_ref: itemRef,
            price: price | 0,
            expires_block: expiresBlock | 0
        };
        var events = _handleMarketList(account, data, blockNum || 0);
        if (!events.length) return null;
        return events[0];
    }

    function processMarketCancelResult(account, listingRef, blockNum) {
        var events = _handleMarketCancel(account, { listing_ref: listingRef }, blockNum || 0);
        if (!events.length) return null;
        return events[0];
    }

    function processMarketBuyResult(account, listingRef, blockNum) {
        var events = _handleMarketBuy(account, { listing_ref: listingRef }, blockNum || 0);
        if (!events.length) return null;
        return events[0];
    }

    function processQuestAcceptResult(account, questId, daily, dailyBlock, blockNum) {
        var data = { quest_id: questId || '', daily: !!daily, daily_block: dailyBlock || 0 };
        var events = _handleQuestAccept(account, data, blockNum || 0);
        if (!events.length) return null;
        return events[0];
    }

    function processQuestCompleteResult(account, questId, blockNum) {
        var events = _handleQuestComplete(account, { quest_id: questId }, blockNum || 0);
        if (!events.length) return null;
        return events[0];
    }

    function processQuestAbandonResult(account, questId, blockNum) {
        var events = _handleQuestAbandon(account, { quest_id: questId }, blockNum || 0);
        if (!events.length) return null;
        return events[0];
    }

    /**
     * Process Armageddon for live UI — same logic as _handleHuntArmageddon.
     * @param {string} account
     * @param {string} creatureId
     * @param {string} stoneId - item id of the armageddon_stone
     * @param {number} blockNum
     * @returns {Object|null} {xpGained, levelsGained, stoneConsumed} or null on failure
     */
    function processArmageddonResult(account, creatureId, stoneId, blockNum) {
        var data = { creature: creatureId, stone: stoneId };
        var events = _handleHuntArmageddon(account, data, blockNum);
        if (!events.length) return null;
        var ev = events[0];
        return {
            xpGained: ev.xpGained,
            levelsGained: ev.levelsGained,
            stoneConsumed: true
        };
    }

    /**
     * Reset state (for testing)
     */
    function reset() {
        worldState = _createEmptyState();
    }

    return {
        init: init,
        processBlock: processBlock,
        saveCheckpoint: saveCheckpoint,
        getState: getState,
        getCharacter: getCharacter,
        getInventory: getInventory,
        getTempleBlessing: getTempleBlessing,
        processHuntResult: processHuntResult,
        processMoveResult: processMoveResult,
        processRestResult: processRestResult,
        processCraftResult: processCraftResult,
        processMarketListResult: processMarketListResult,
        processMarketCancelResult: processMarketCancelResult,
        processMarketBuyResult: processMarketBuyResult,
        processQuestAcceptResult: processQuestAcceptResult,
        processQuestCompleteResult: processQuestCompleteResult,
        processQuestAbandonResult: processQuestAbandonResult,
        processArmageddonResult: processArmageddonResult,
        processTempleOfferingResult: processTempleOfferingResult,
        reset: reset
    };
})();
