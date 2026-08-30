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

function loadProgression() {
  const context = {
    console,
    VizMagicConfig: {
      APP_VERSION: 1,
      PROGRESSION: {
        LEGACY_VERSION: 1,
        CURRENT_VERSION: 2,
        V2_ACTIVATION_BLOCK: 1000
      },
      LEVELING: { SOFT_CAP: 50 },
      DOMINANCE: {}
    }
  };
  vm.createContext(context);
  vm.runInContext(read('app/js/engine/formulas.js'), context, { filename: 'formulas.js' });
  vm.runInContext(read('app/js/engine/character.js'), context, { filename: 'character.js' });
  return context;
}

function legacyTotalForLevel(level) {
  let total = 0;
  for (let target = 2; target <= level; target += 1) {
    total += 800 + target * 100 + (target > 2 ? (target - 2) * 50 : 0);
  }
  return total;
}

function v2TotalForLevel(level) {
  let total = 0;
  for (let target = 2; target <= level; target += 1) {
    total += 1000 + 125 * (target - 2) * (target - 1);
  }
  return total;
}

test('v2 uses approved quadratic thresholds through level 9', function () {
  const context = loadProgression();
  const thresholds = [];
  for (let level = 2; level <= 9; level += 1) {
    thresholds.push(context.GameFormulas.xpForLevel(level, 2));
  }
  assert.deepStrictEqual(thresholds, [1000, 1250, 1750, 2500, 3500, 4750, 6250, 8000]);
  assert.strictEqual(context.GameFormulas.totalXpForLevel(9, 2), 29000);
});

test('legacy thresholds remain available for deterministic pre-activation replay', function () {
  const context = loadProgression();
  assert.strictEqual(context.GameFormulas.xpForLevel(9, 1), 2050);
  assert.strictEqual(context.GameFormulas.totalXpForLevel(9, 1), legacyTotalForLevel(9));
  assert.strictEqual(context.GameFormulas.levelFromXp(legacyTotalForLevel(9), 1), 9);
});

test('characters created before activation replay with legacy progression', function () {
  const context = loadProgression();
  const character = context.CharacterSystem.createCharacter('old', 'Old Mage', 'embercaster', 999);
  assert.strictEqual(character.progressionVersion, 1);
  context.CharacterSystem.addXp(character, legacyTotalForLevel(9), 999);
  assert.strictEqual(character.level, 9, 'historical replay must retain the legacy level result');
});

test('new characters use v2 and need 8000 XP for level 8 to 9', function () {
  const context = loadProgression();
  const character = context.CharacterSystem.createCharacter('new', 'New Mage', 'embercaster', 1000);
  character.level = 8;
  character.xp = v2TotalForLevel(8);

  context.CharacterSystem.addXp(character, 7999, 1000);
  assert.strictEqual(character.level, 8);
  context.CharacterSystem.addXp(character, 1, 1001);
  assert.strictEqual(character.level, 9);
  assert.strictEqual(character.progressionVersion, 2);
});

test('first post-activation XP preserves an existing level and within-level progress without debt', function () {
  const context = loadProgression();
  const withinLevelProgress = 1234;
  const character = context.CharacterSystem.createCharacter('migrating', 'Migrating Mage', 'embercaster', 999);
  character.level = 8;
  character.xp = legacyTotalForLevel(8) + withinLevelProgress;

  context.CharacterSystem.addXp(character, 1, 1000);

  assert.strictEqual(character.level, 8, 'migration must never remove an earned level');
  assert.strictEqual(character.progressionVersion, 2);
  assert.strictEqual(character.xp, v2TotalForLevel(8) + withinLevelProgress + 1);
  assert.strictEqual(character.progressionMigratedAtBlock, 1000);
  assert.strictEqual(context.CharacterSystem.getLevelProgress(character), withinLevelProgress + 1);
});

test('first post-activation XP migrates an unversioned legacy checkpoint without debt', function () {
  const context = loadProgression();
  const withinLevelProgress = 321;
  const character = context.CharacterSystem.createCharacter('checkpoint', 'Checkpoint Mage', 'embercaster', 999);
  character.level = 8;
  character.xp = legacyTotalForLevel(8) + withinLevelProgress;
  delete character.progressionVersion;
  delete character.progressionMigratedAtBlock;

  context.CharacterSystem.addXp(character, 1, 1000);

  assert.strictEqual(character.level, 8);
  assert.strictEqual(character.progressionVersion, 2);
  assert.strictEqual(character.xp, v2TotalForLevel(8) + withinLevelProgress + 1);
  assert.strictEqual(context.CharacterSystem.getLevelProgress(character), withinLevelProgress + 1);
});

test('migration clamps malformed XP below the current level floor instead of creating XP debt', function () {
  const context = loadProgression();
  const character = context.CharacterSystem.createCharacter('nodebt', 'No Debt', 'embercaster', 999);
  character.level = 8;
  character.xp = 10;

  context.CharacterSystem.addXp(character, 1, 1000);

  assert.strictEqual(character.level, 8);
  assert.strictEqual(character.xp, v2TotalForLevel(8) + 1);
  assert.strictEqual(context.CharacterSystem.getLevelProgress(character), 1);
});

test('grimoire round-trip carries progression migration fields', function () {
  const context = loadProgression();
  const source = context.CharacterSystem.createCharacter('saved', 'Saved Mage', 'embercaster', 999);
  source.level = 8;
  source.xp = legacyTotalForLevel(8) + 77;
  context.CharacterSystem.addXp(source, 1, 1000);

  const grimoire = context.CharacterSystem.toGrimoire(source);
  const restored = context.CharacterSystem.createCharacter('saved', 'Saved Mage', 'embercaster', 1001);
  context.CharacterSystem.restoreProgression(restored, grimoire);

  assert.strictEqual(grimoire.xp, source.xp);
  assert.strictEqual(grimoire.progression_version, 2);
  assert.strictEqual(grimoire.progression_migrated_at_block, 1000);
  assert.strictEqual(restored.level, source.level);
  assert.strictEqual(restored.xp, source.xp);
  assert.strictEqual(restored.progressionVersion, 2);
  assert.strictEqual(restored.progressionMigratedAtBlock, 1000);
});

test('all deterministic XP sources provide their event block to progression', function () {
  const stateEngine = read('app/js/engine/state-engine.js');
  const duelState = read('app/js/engine/duel-state.js');
  const questSystem = read('app/js/engine/quest-system.js');
  const dailyLeaderboard = read('app/js/engine/daily-leaderboard.js');

  const stateCalls = stateEngine.match(/CharacterSystem\.addXp\([^;]+\);/g) || [];
  assert.ok(stateCalls.length >= 6, 'expected replay/live hunt, defeat, Armageddon, and boss XP calls');
  stateCalls.forEach(function (call) {
    assert.ok(/,\s*blockNum\s*\)$/.test(call.replace(/;/g, '')), 'state XP call lacks blockNum: ' + call);
  });
  assert.ok(/CharacterSystem\.addXp\(worldState\.characters\[winner\], xpWinner, blockNum\)/.test(duelState));
  assert.ok(/CharacterSystem\.addXp\(worldState\.characters\[loser\], xpLoser, blockNum\)/.test(duelState));
  assert.ok(/CharacterSystem\.addXp\(character, rewards\.xp, blockNum\)/.test(questSystem));
  assert.ok(/CharacterSystem\.addXp\(character, result\.xpGained, processed\.blockNum\)/.test(dailyLeaderboard));
  assert.ok(/CharacterSystem\.addXp\(character, xp, processed\.blockNum\)/.test(dailyLeaderboard));
});

test('UI restores and displays versioned progression rather than legacy totals', function () {
  const restoreFiles = [
    'app/js/ui/app.js',
    'app/js/ui/screens/login.js',
    'app/js/ui/screens/duel.js',
    'app/js/engine/daily-leaderboard.js'
  ];
  restoreFiles.forEach(function (file) {
    assert.ok(/CharacterSystem\.restoreProgression\(character, grimoire\)/.test(read(file)), file + ' must restore progression fields');
  });
  assert.ok(/CharacterSystem\.getLevelProgress\(character\)/.test(read('app/js/ui/screens/home.js')));
  assert.ok(/CharacterSystem\.getXpForNextLevel\(character\)/.test(read('app/js/ui/screens/home.js')));
  assert.ok(/CharacterSystem\.getLevelProgress\(ch\)/.test(read('app/js/ui/screens/character.js')));
  assert.ok(/CharacterSystem\.getXpForNextLevel\(ch\)/.test(read('app/js/ui/screens/character.js')));
});

test('character creation paths preserve the activation block boundary', function () {
  const stateEngine = read('app/js/engine/state-engine.js');
  const leaderboard = read('app/js/engine/daily-leaderboard.js');
  const onboarding = read('app/js/ui/screens/onboarding.js');

  assert.ok(/CharacterSystem\.createCharacter\(sender, data\.name, data\.class, blockNum\)/.test(stateEngine));
  assert.ok(/_primeCharactersForActions\(ctx, vmActions, processed\.blockNum, function\(\)/.test(leaderboard));
  assert.ok(/_handleCharAttune\(ctx, sender, action\.data \|\| \{\}, processed\.blockNum\)/.test(leaderboard));
  assert.ok(/CharacterSystem\.createCharacter\(user, displayName, selectedClass, state\.headBlock\)/.test(onboarding));
});

test('all changed progression bundles carry the v2 cache suffix', function () {
  const index = read('app/index.html');
  [
    'config.js', 'i18n/ru.js', 'i18n/en.js', 'engine/formulas.js',
    'engine/character.js', 'engine/duel-state.js', 'engine/quest-system.js',
    'engine/state-engine.js', 'engine/daily-leaderboard.js', 'screens/login.js',
    'screens/onboarding.js', 'screens/home.js', 'screens/character.js',
    'screens/hunt.js', 'screens/duel.js', 'ui/app.js'
  ].forEach(function (asset) {
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.ok(new RegExp(escaped + '\\?v=[^" ]*20260827p').test(index), asset + ' must carry the v2 cache suffix');
  });
  assert.ok(/viz-magic-v195/.test(read('app/sw.js')));
});
