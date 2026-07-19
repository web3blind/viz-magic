/**
 * Viz Magic — Combat Resolution (PvE)
 * Deterministic combat based on player stats + spell + creature + block hash.
 * Single-transaction, instant resolution.
 */
var CombatSystem = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /**
     * Resolve a PvE hunt encounter.
     * Deterministic: same inputs always produce same output.
     *
     * @param {Object} player - CharacterState
     * @param {Object} creature - CreatureDefinition (from creatures.js)
     * @param {Object} spell - SpellDefinition (from spells.js)
     * @param {string} blockHash - hex string from the block containing the hunt action
     * @param {number} blockNum - block number
     * @param {number} playerEnergy - current energy 0-10000
     * @returns {Object} CombatResult
     */
    function resolveHunt(player, creature, spell, blockHash, blockNum, playerEnergy) {
        // Determine creature level from block hash
        var creatureLevel = _creatureLevelFromHash(blockHash, creature.minLevel, creature.maxLevel);

        // Scale creature stats by level
        var creatureStats = _scaleCreatureStats(creature, creatureLevel);

        // Calculate element modifier, including the current in-world season.
        var elemMod = GameFormulas.elementModifier(spell.school, creature.school);
        if (typeof WorldEvents !== 'undefined' && WorldEvents.getSeasonalBonuses) {
            var seasonBonuses = WorldEvents.getSeasonalBonuses(blockNum || 0);
            elemMod += seasonBonuses[spell.school] || 0;
        }
        var templeBlessing = (typeof StateEngine !== 'undefined' && StateEngine.getTempleBlessing) ?
            StateEngine.getTempleBlessing(player.account, blockNum || 0) : null;
        if (templeBlessing && templeBlessing.schoolBonuses) {
            elemMod += templeBlessing.schoolBonuses[spell.school] || 0;
        }

        // Calculate class modifier
        var classMod = _classModifier(player.className, spell);

        // Calculate player attack
        var playerPot = CharacterSystem.getTotalStat(player, 'pot');
        var playerInt = CharacterSystem.getTotalStat(player, 'int');
        var patientPower = Math.max(playerPot, playerInt);
        var playerAttack = GameFormulas.calculateAttack(
            playerPot,
            spell.multiplier,
            playerEnergy,
            elemMod,
            classMod,
            0 // equipment bonus already in getTotalStat
        );

        // Check for critical hit
        var isCrit = GameFormulas.isCriticalHit(
            blockHash,
            CharacterSystem.getTotalStat(player, 'for_')
        );
        if (isCrit) {
            playerAttack = Math.floor(playerAttack * 1500 / 1000); // 1.5x crit
        }

        // Moonrunner passive: +15% crit damage
        if (player.className === 'moonrunner' && isCrit) {
            playerAttack = Math.floor(playerAttack * 1150 / 1000);
        }

        // Calculate creature defense
        var creatureDefense = GameFormulas.calculateDefense(creatureStats.res, creatureLevel);

        // Magical weather affects hunt danger. This keeps the home forecast meaningful.
        var weather = (typeof WorldEvents !== 'undefined' && WorldEvents.getCurrentWeather) ? WorldEvents.getCurrentWeather(blockNum || 0) : null;
        if (weather && weather.creatureAttackMod) {
            creatureStats.attack = Math.max(1, Math.floor(creatureStats.attack * weather.creatureAttackMod / 1000));
        }

        // Multi-round combat: exchange blows until someone falls
        var playerRes = CharacterSystem.getTotalStat(player, 'res');
        var playerDefense = GameFormulas.calculateDefense(playerRes, player.level);
        if (weather && weather.playerDefenseMod) {
            playerDefense = Math.max(0, Math.floor(playerDefense * weather.playerDefenseMod / 1000));
        }

        var creatureHpLeft = creatureStats.hp;
        var playerHpLeft = player.hp;
        var totalDamageToCreature = 0;
        var totalDamageToPlayer = 0;
        var rounds = 0;
        // Economical hunts are slower, not hopeless: low-mana players can win by endurance.
        var maxRounds = playerEnergy <= 100 ? 45 : (playerEnergy <= 300 ? 35 : 25); // safety cap

        while (creatureHpLeft > 0 && playerHpLeft > 0 && rounds < maxRounds) {
            // Player hits creature
            var roundDmgToCreature = GameFormulas.calculateDamage(playerAttack, creatureDefense);
            var patientMinDamage = Math.max(1, Math.floor((player.level + patientPower) * Math.max(100, playerEnergy) / 3000));
            if (roundDmgToCreature < patientMinDamage) roundDmgToCreature = patientMinDamage; // patient hunt minimum damage
            creatureHpLeft -= roundDmgToCreature;
            totalDamageToCreature += roundDmgToCreature;

            if (creatureHpLeft <= 0) break; // creature dies first

            // Creature hits player (vary attack per round using hash + round offset)
            var creatureAttack = _creatureAttackFromHash(blockHash, creatureStats, creatureLevel + rounds);
            if (player.className === 'stonewarden') {
                creatureAttack = Math.floor(creatureAttack * 800 / 1000);
            }
            var roundDmgToPlayer = GameFormulas.calculateDamage(creatureAttack, playerDefense);
            if (roundDmgToPlayer < 1) roundDmgToPlayer = 1;
            playerHpLeft -= roundDmgToPlayer;
            totalDamageToPlayer += roundDmgToPlayer;

            rounds++;
        }

        var damageToCreature = totalDamageToCreature;
        var damageToPlayer = totalDamageToPlayer;

        // Determine outcome
        var victory = creatureHpLeft <= 0;
        var hpRemaining = Math.max(0, playerHpLeft);

        // Calculate XP
        var xpGained = 0;
        if (victory) {
            xpGained = GameFormulas.huntXp(player.level, creatureLevel, creature.baseXp || 50);
        } else {
            xpGained = Math.floor(GameFormulas.huntXp(player.level, creatureLevel, creature.baseXp || 50) / 4);
        }

        // Determine loot (only on victory)
        var loot = [];
        if (victory && creature.lootTable) {
            loot = _rollLoot(creature.lootTable, blockHash, CharacterSystem.getTotalStat(player, 'for_') + (templeBlessing ? (templeBlessing.fortuneBonus || 0) : 0));
        }

        return {
            victory: victory,
            damageDealt: damageToCreature,
            damageTaken: damageToPlayer,
            xpGained: xpGained,
            loot: loot,
            critical: isCrit,
            hpRemaining: hpRemaining,
            creatureLevel: creatureLevel,
            creatureHp: creatureStats.hp,
            playerAttack: playerAttack,
            creatureAttack: creatureAttack
        };
    }

    /**
     * Determine creature level from block hash (deterministic)
     */
    function _creatureLevelFromHash(blockHash, minLevel, maxLevel) {
        if (!blockHash || blockHash.length < 4) return minLevel;
        var hashByte = parseInt(blockHash.substring(0, 2), 16);
        var range = maxLevel - minLevel + 1;
        return minLevel + (hashByte % range);
    }

    /**
     * Scale creature stats by level
     */
    function _scaleCreatureStats(creature, level) {
        var levelScale = Math.floor(1000 + (level - creature.minLevel) * 150); // x1000
        return {
            hp: Math.floor(creature.baseHp * levelScale / 1000),
            pot: Math.floor(creature.basePot * levelScale / 1000),
            res: Math.floor(creature.baseRes * levelScale / 1000),
            swf: Math.floor(creature.baseSwf * levelScale / 1000)
        };
    }

    /**
     * Calculate creature attack from block hash (deterministic randomness)
     */
    function _creatureAttackFromHash(blockHash, creatureStats, creatureLevel) {
        if (!blockHash || blockHash.length < 12) return creatureStats.pot;
        // Use middle bytes for variation
        var hashInt = parseInt(blockHash.substring(4, 12), 16);
        // Attack varies 80%-120% of base
        var variation = 800 + (hashInt % 400); // 800-1200 (x1000)
        return Math.floor(creatureStats.pot * variation / 1000);
    }

    /**
     * Get class-specific combat modifier
     */
    function _classModifier(className, spell) {
        // Embercaster: +12% damage per 500 MP over base (simplified)
        if (className === 'embercaster' && spell.school === 'ignis') {
            return 1120; // 1.12x
        }
        // Bloomsage casting offensive: slight penalty
        if (className === 'bloomsage' && spell.effect === 'damage') {
            return 900; // 0.9x
        }
        return 1000; // 1.0x
    }

    /**
     * Roll loot from creature's loot table (deterministic via block hash)
     */
    function _rollLoot(lootTable, blockHash, fortuneStat) {
        var loot = [];
        if (!blockHash || blockHash.length < 16) return loot;

        for (var i = 0; i < lootTable.length; i++) {
            var entry = lootTable[i];
            // Use different hash segments for each loot slot
            var offset = (i * 4) % (blockHash.length - 4);
            var hashInt = parseInt(blockHash.substring(offset, offset + 4), 16);

            // Drop chance boosted by fortune
            var dropChance = entry.dropRate + fortuneStat * 5; // dropRate is per-mille (0-1000)
            if ((hashInt % 1000) < dropChance) {
                loot.push({
                    type: entry.itemType,
                    name: entry.name,
                    rarity: _rollRarity(blockHash, i, fortuneStat),
                    volatile_: true
                });
            }
        }

        return loot;
    }

    /**
     * Roll item rarity (deterministic)
     */
    function _rollRarity(blockHash, index, fortuneStat) {
        var offset = ((index + 3) * 3) % (blockHash.length - 4);
        var hashInt = parseInt(blockHash.substring(offset, offset + 4), 16);
        var roll = hashInt % 1000;
        var fortuneBoost = fortuneStat * 2;

        if (roll < 5 + fortuneBoost)   return cfg.RARITY.LEGENDARY;    // ~0.5%
        if (roll < 25 + fortuneBoost)  return cfg.RARITY.EPIC;         // ~2%
        if (roll < 100 + fortuneBoost) return cfg.RARITY.RARE;         // ~7.5%
        if (roll < 300 + fortuneBoost) return cfg.RARITY.UNCOMMON;     // ~20%
        return cfg.RARITY.COMMON;                                       // ~70%
    }

    return {
        resolveHunt: resolveHunt
    };
})();
