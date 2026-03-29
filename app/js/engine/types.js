/**
 * Viz Magic — Type Definitions (JSDoc)
 * TypeScript-style type definitions for game objects.
 * These are documentation-only — no runtime code.
 */

/**
 * @typedef {Object} CharacterState
 * @property {string} account - VIZ account name
 * @property {string} name - Display name (Mage Name)
 * @property {string} className - Class ID (stonewarden|embercaster|moonrunner|bloomsage)
 * @property {number} level - Current level (1-50+)
 * @property {number} xp - Current XP
 * @property {number} hp - Current HP
 * @property {number} maxHp - Maximum HP
 * @property {number} pot - Potency stat
 * @property {number} res - Resilience stat
 * @property {number} swf - Swiftness stat
 * @property {number} int - Intellect stat
 * @property {number} for_ - Fortune stat (for is reserved)
 * @property {number} coreBonus - Bonus from SHARES (floor(shares^0.3))
 * @property {string} title - Earned title
 * @property {string} guild - Guild ID or empty
 * @property {Object} equipment - {slot: itemId}
 * @property {Array<string>} spells - Learned spell IDs
 * @property {number} lastHuntBlock - Block of last hunt
 * @property {number} fallenUntilBlock - Block when fallen status expires (0 = active)
 * @property {string} currentZone - Current zone ID
 */

/**
 * @typedef {Object} ItemState
 * @property {string} id - Unique ID (block number where created)
 * @property {string} type - Item type ID
 * @property {string} owner - Current owner account
 * @property {number} rarity - 0=Common, 1=Uncommon, 2=Rare, 3=Epic, 4=Legendary
 * @property {boolean} volatile_ - Whether item is volatile (can be lost in PvP)
 * @property {boolean} equipped - Whether currently equipped
 * @property {Object} stats - {pot, res, swf, int, for_} bonus stats
 * @property {string} createdBy - Creator account
 * @property {number} createdBlock - Block where item was created
 * @property {Array<string>} enchantments - Applied enchantment IDs
 */

/**
 * @typedef {Object} WorldState
 * @property {number} headBlock - Latest processed block number
 * @property {number} checkpointBlock - Block of last checkpoint
 * @property {Object<string, CharacterState>} characters - account → CharacterState
 * @property {Object<string, Array<ItemState>>} inventories - account → items
 * @property {Object<string, Object>} guilds - guildId → guild data
 * @property {Object<string, Object>} territories - zoneId → territory data
 * @property {Array<Object>} recentActions - Recent game actions for feed
 */

/**
 * @typedef {Object} CombatResult
 * @property {boolean} victory - Whether player won
 * @property {number} damageDealt - Damage dealt to creature
 * @property {number} damageTaken - Damage taken by player
 * @property {number} xpGained - XP earned
 * @property {Array<Object>} loot - Items dropped
 * @property {boolean} critical - Whether a critical hit occurred
 * @property {number} hpRemaining - Player HP after combat
 */

/**
 * @typedef {Object} CreatureDefinition
 * @property {string} id - Creature ID
 * @property {string} name - Display name
 * @property {string} school - Magic school element
 * @property {number} minLevel - Minimum encounter level
 * @property {number} maxLevel - Maximum encounter level
 * @property {number} baseHp - Base HP at minLevel
 * @property {number} basePot - Base potency
 * @property {number} baseRes - Base resilience
 * @property {number} baseSwf - Base swiftness
 * @property {string} zone - Home zone ID
 * @property {Array<Object>} lootTable - Possible drops
 */

/**
 * @typedef {Object} SpellDefinition
 * @property {string} id - Spell ID
 * @property {string} name - Display name
 * @property {string} school - Magic school
 * @property {string} className - Required class (or 'any')
 * @property {number} manaCost - Energy cost in basis points
 * @property {number} levelReq - Required level
 * @property {number} multiplier - Damage multiplier x1000 (integer math)
 * @property {string} intent - Default combat intent
 * @property {string} effect - Effect type (damage|heal|buff|debuff)
 */

/**
 * @typedef {Object} Checkpoint
 * @property {number} blockNum - Block number of checkpoint
 * @property {string} stateHash - Hash of serialized state
 * @property {Object} state - Full WorldState object
 * @property {number} timestamp - Checkpoint creation time
 */
