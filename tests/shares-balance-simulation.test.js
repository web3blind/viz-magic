'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const context = { console };
vm.createContext(context);
[
  'app/js/config.js',
  'app/js/engine/formulas.js',
  'app/js/engine/items.js',
  'app/js/engine/character.js',
  'app/js/data/creatures.js',
  'app/js/data/spells.js',
  'app/js/engine/combat.js',
  'app/js/engine/duel.js'
].forEach(file => vm.runInContext(read(file), context, { filename: file }));

const sharesCases = [
  { label: 'zero', whole: 0 },
  { label: 'small', whole: 10 },
  { label: 'medium', whole: 1000 },
  { label: 'large', whole: 1000000 },
  { label: 'whale', whole: 1000000000 }
];
const hash = '0123456789abcdef'.repeat(5);
const creature = context.GameCreatures.getCreature('ember_wisp');
const spell = context.GameSpells.getSpell('firebolt');

const rows = sharesCases.map(entry => {
  const character = context.CharacterSystem.createCharacter(entry.label, entry.label, 'embercaster', 84000000);
  context.CharacterSystem.updateCoreBonus(character, entry.whole * 1000000);
  const pve = context.CombatSystem.resolveHunt(character, creature, spell, hash, 84000001, 100);
  return {
    label: entry.label,
    shares: entry.whole,
    bonus: character.coreBonus,
    potency: context.CharacterSystem.getTotalStat(character, 'pot'),
    resilience: context.CharacterSystem.getTotalStat(character, 'res'),
    pveVictory: pve.victory,
    pveDamage: pve.damageDealt
  };
});

for (let i = 1; i < rows.length; i++) {
  assert.ok(rows[i].bonus >= rows[i - 1].bonus, 'bonus must be monotonic');
  assert.ok(rows[i].bonus <= 5, 'bonus must stay at strict saturation cap');
}
assert.strictEqual(rows[0].bonus, 0);
assert.strictEqual(rows[rows.length - 1].bonus, 5);
assert.ok(rows[rows.length - 1].potency - rows[0].potency <= 1, 'whale PvE potency edge must stay small');
assert.strictEqual(rows[0].pveVictory, true, 'zero-stake player must remain able to win a level-appropriate hunt');

const low = { account: 'low', potency: rows[0].potency, resilience: rows[0].resilience, level: 1, school: 'ignis', energyPledge: 100, strategy: { intent: 'strike', spell: 'firebolt' } };
const whale = { account: 'whale', potency: rows[rows.length - 1].potency, resilience: rows[rows.length - 1].resilience, level: 1, school: 'ignis', energyPledge: 100, strategy: { intent: 'strike', spell: 'firebolt' } };
const round = context.DuelSystem.resolveRound(whale, low, hash);
assert.ok(round.damageA > 0 && round.damageB > 0, 'both sides must remain effective in PvP');
assert.ok(round.damageA / round.damageB <= 1.5, 'saturated SHARES must not create a large PvP multiplier');

console.log('PASS SHARES balance simulation');
console.log(JSON.stringify({ rows, pvp: { whaleDamage: round.damageA, zeroStakeDamage: round.damageB, winner: round.winner } }));
