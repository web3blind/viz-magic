'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
function load(c, file, exports) {
  let code = fs.readFileSync(path.join(root, 'app/js', file), 'utf8');
  // Expose existing closure functions only in the disposable test context.
  if (exports) {
    const pos = code.lastIndexOf('    return {');
    code = code.slice(0, pos) + '    globalThis.fixture = {' + exports + '};\n' + code.slice(pos);
  }
  vm.runInContext(code, c, { filename: file });
}
function context() {
  const c = vm.createContext({ console: { log() {}, warn() {} }, window: {}, setTimeout() {}, clearTimeout() {} });
  load(c, 'config.js');
  return c;
}
let failures = 0;
function test(name, fn) {
  try { fn(); console.log('PASS ' + name); }
  catch (e) { failures++; console.error('FAIL ' + name + ': ' + e.message); }
}
function helpers(c) {
  c.document = {
    createTextNode: s => String(s),
    createElement: () => ({ innerHTML: '', appendChild(s) { this.innerHTML = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } })
  };
  load(c, 'utils/helpers.js');
  c.Helpers.t = (key, vars) => vars ? String(vars.name || key) : key;
  c.Helpers.classIcon = () => '';
  c.Helpers.icon = () => '';
}
function noInjectedAttributes(html) {
  for (const tag of html.match(/<[^>]*>/g) || []) {
    const attributes = tag.replace(/"[^"]*"/g, '""');
    assert(!/\s(?:onerror|onfocus|autofocus|onmouseover)=/i.test(attributes));
  }
  assert(!html.includes('<img src=x'));
}
const poison = '\" autofocus=\"x\" onfocus=\"boom()\"><img src=x onerror=boom()>';
test('malformed attunement cannot interrupt real StateEngine block replay', () => {
  const c = context();
  c.CheckpointSystem = { init: cb => cb(null), loadLatestCheckpoint: (s, cb) => cb(null, null) };
  c.CharacterSystem = { createCharacter: (account, name, cls) => ({ account, name, className: cls, level: 1 }) };
  c.ItemSystem = { createItem: type => ({ type }) };
  load(c, 'engine/validator.js');
  load(c, 'protocols/vm-protocol.js');
  load(c, 'engine/state-engine.js');
  c.StateEngine.init(() => {});
  const parse = d => c.VMProtocol.parseAction(JSON.stringify({ p: c.VizMagicConfig.PROTOCOLS.VM, t: c.VizMagicConfig.ACTION_TYPES.CHAR_ATTUNE, d }));
  const good = parse({ class: 'embercaster', name: 'Alice' });
  const bad = parse({ class: 7, name: 'Bad' });
  assert.doesNotThrow(() => c.StateEngine.processBlock({ blockNum: 100, blockHash: 'fixture', vmActions: [
    { sender: 'mallory', action: bad, txIndex: 0, opIndex: 0 },
    { sender: 'alice', action: good, txIndex: 1, opIndex: 0 }
  ], awards: [] }, { runMaintenance: false }));
  assert(!c.StateEngine.getCharacter('mallory'));
  assert(c.StateEngine.getCharacter('alice'));
  assert.strictEqual(c.ActionValidator.validate({ type: good.type, data: { class: 'embercaster', name: {} } }, c.StateEngine.getState(), 'other', 100).valid, false);
});
test('daily leaderboard requires matching one-use paid proof, preserves preactivation v1', () => {
  const c = context();
  load(c, 'engine/action-proof.js');
  c.GameCreatures = { getCreature: () => ({ author: 'creator', minLevel: 1, baseXp: 25 }) };
  c.GameSpells = { getSpell: () => ({}) };
  c.CharacterSystem = { addXp: (ch, xp) => { ch.xp += xp; } };
  c.CombatSystem = { resolveHunt: () => ({ victory: true, xpGained: 25 }) };
  c.GameFormulas = { armageddonXp: () => 2500 };
  let saved;
  c.DailyLeaderboardStorage = { putBlockContribution: (row, cb) => { saved = row; cb(); } };
  load(c, 'engine/daily-leaderboard.js', 'process: _processProcessedBlock');
  const height = c.VizMagicConfig.PAID_ACTIONS.V2_ACTIVATION_BLOCK;
  function run(version, awards, blockNum, count, type) {
    const ctx = { characters: { alice: { name: 'Alice', xp: 0, level: 1 } }, players: {} };
    const action = { version, type: type || c.VizMagicConfig.ACTION_TYPES.HUNT, data: { creature: 'wisp', spell: 'firebolt', energy: 100, stone: 'stone-1' } };
    c.fixture.process(ctx, { blockNum, blockHash: 'fixture', awards, vmActions: Array.from({ length: count || 1 }, (_, i) => ({ sender: 'alice', action, txIndex: 0, opIndex: i })) }, err => assert.ifError(err));
    return Object.keys(saved.players).length ? saved.players.alice.xp : 0;
  }
  const award = { initiator: 'alice', receiver: 'creator', energy: 100, memo: 'viz://vm/hunt/v2/wisp/100', txIndex: 0 };
  assert.strictEqual(run(2, [], height), 0);
  assert.strictEqual(run(2, [Object.assign({}, award, { initiator: 'mallory' })], height), 0);
  assert.strictEqual(run(2, [Object.assign({}, award, { txIndex: 1 })], height), 0);
  assert.strictEqual(run(2, [award], height, 2), 25);
  assert.strictEqual(run(1, [], height - 1), 25);
  assert.strictEqual(run(1, [], height), 0);
  const arma = c.VizMagicConfig.ACTION_TYPES.HUNT_ARMAGEDDON;
  assert.strictEqual(run(2, [], height, 1, arma), 0);
  assert.strictEqual(run(2, [{ initiator: 'alice', receiver: 'creator', energy: 10000, memo: 'viz://vm/armageddon/v2/wisp/stone-1', txIndex: 0 }], height, 1, arma), 2500);
});
test('arena player names remain text inside challenge attributes', () => {
  const c = context(); helpers(c);
  load(c, 'ui/screens/arena.js', 'players: _renderKnownPlayers');
  const html = c.fixture.players({ characters: { alice: { name: poison, level: 2 } } }, 'bob', []);
  noInjectedAttributes(html);
  const normal = c.fixture.players({ characters: { alice: { name: 'Alice', level: 2 } } }, 'bob', []);
  assert(normal.includes('data-account="alice"'));
  assert(normal.includes('aria-label="Alice"'));
});
test('guild directory names and guild IDs cannot create active markup', () => {
  const c = context(); helpers(c);
  c.StateEngine = { getCharacter: () => ({ level: 50 }) };
  c.GuildSystem = { getMemberCount: () => 1 };
  c.VizAccount = { hasActiveKey: () => false, isActiveKeyPersistenceEnabled: () => false, getCurrentUser: () => 'alice' };
  load(c, 'ui/screens/guild.js', 'guilds: _renderNoGuild');
  const container = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
  c.fixture.guilds(container, { guilds: { fixture: { id: poison, name: poison, tag: 'SAFE', level: 1, members: {} } } }, 'alice');
  noInjectedAttributes(container.innerHTML);
});
test('incoming duel hash and challenger cannot escape HTML attributes', () => {
  const c = context(); helpers(c);
  c.StateEngine = { getState: () => ({}) };
  load(c, 'ui/screens/arena.js', 'incoming: _showIncomingChallenges');
  const container = { html: '', insertAdjacentHTML(where, html) { this.html += html; }, querySelectorAll: () => [] };
  const el = { querySelector: () => container };
  c.fixture.incoming([{ challenger: 'alice', blockNum: 100, strategyHash: poison }], el, 'bob');
  noInjectedAttributes(container.html);
  assert(container.html.includes('data-combat-ref="100"'));
  container.html = '';
  c.fixture.incoming([{ challenger: poison, blockNum: 100, strategyHash: 'normal' }], el, 'bob');
  noInjectedAttributes(container.html);
});
test('duel UI never reveals before both participants commit', () => {
  const c = context(); helpers(c);
  c.Helpers.EventBus = { on() {} };
  c.VizAccount = { getCurrentUser: () => 'alice' };
  c.DuelProtocol = { revealStrategy: () => { c.broadcasts++; } };
  c.broadcasts = 0;
  load(c, 'ui/screens/duel.js', 'can: _canRevealCurrentRound, auto: _maybeAutoRevealCurrentRound, state: duelState');
  Object.assign(c.fixture.state, { strategySecret: { hash: 'hash', salt: 'salt', intent: 'attack' }, strategyRound: 2, currentRound: 2 });
  const duel = { id: '1', status: 'active', challenger: 'alice', target: 'bob', currentRound: 2, commits: { 2: { A: 'hash' } }, reveals: {} };
  assert.strictEqual(c.fixture.can(duel), false);
  c.fixture.auto(duel); assert.strictEqual(c.broadcasts, 0);
  duel.commits[2].B = 'opponent';
  assert.strictEqual(c.fixture.can(duel), true);
  c.fixture.auto(duel); assert.strictEqual(c.broadcasts, 1);
});
test('legacy leaderboard cache is not displayed as verified contributions', () => {
  const c = context();
  c.DailyLeaderboardStorage = { init: cb => cb(null), getMeta: cb => cb(null, { ready: true, players: { mallory: { xp: 99999 } }, characters: {}, rows: [] }) };
  load(c, 'engine/daily-leaderboard.js');
  c.DailyLeaderboard.init(err => assert.ifError(err));
  assert.strictEqual(c.DailyLeaderboard.getSnapshot().ready, false);
  assert.strictEqual(Object.keys(c.DailyLeaderboard.getSnapshot().players).length, 0);
});
// These observations preserve current history; they are NOT claims of remediation.
test('policy observation: approval guilds and siege power still need a versioned rule', () => {
  const c = context();
  load(c, 'engine/guild.js');
  const guild = { charter: { membership: 'approval' }, members: {}, invites: {} };
  assert.strictEqual(c.GuildSystem.joinGuild(guild, 'mallory', 100), true);
  load(c, 'engine/territory.js');
  const territory = { activeSieges: [{ ref: 'siege', state: 'active', attackPower: 0, defensePower: 0, contributions: {} }] };
  assert.strictEqual(c.TerritorySystem.contributeSiege(territory, 'siege', 'mallory', 1000000, true), true);
  assert.strictEqual(territory.activeSieges[0].attackPower, 1000000);
});
test('policy observation: duel replay currently overwrites commitments and accepts unbound reveals', () => {
  const c = context();
  load(c, 'engine/duel-state.js');
  const duel = { challenger: 'alice', target: 'bob', rounds: 3, currentRound: 2, status: 'active', commits: { 2: { A: 'first', B: 'opponent' } }, reveals: { 2: { B: { intent: 'attack' } } } };
  const world = { duels: { active: { duel }, pending: {}, history: [], leaderboard: {} }, characters: {} };
  c.DuelStateManager.processDuelAction('alice', { type: c.VizMagicConfig.ACTION_TYPES.COMMIT, data: { combat_ref: 'duel', round: 2, strategy_hash: 'replacement' } }, 100, 'fixture', world);
  assert.strictEqual(duel.commits[2].A, 'replacement');
  duel.reveals = {};
  c.DuelStateManager.processDuelAction('alice', { type: c.VizMagicConfig.ACTION_TYPES.REVEAL, data: { combat_ref: 'duel', round: 2, strategy: { intent: 'defend', salt: 'not-bound-to-hash' } } }, 101, 'fixture', world);
  assert.strictEqual(duel.reveals[2].A.salt, 'not-bound-to-hash');
});
test('policy observation: identical block weather changes with wall-clock day', () => {
  const c = context();
  load(c, 'engine/world-events.js');
  function weatherAt(ms) {
    c.Date = class extends Date { static now() { return ms; } };
    return JSON.stringify({ weather: c.WorldEvents.getCurrentWeather(100), season: c.WorldEvents.getSeasonalBonuses(100) });
  }
  const jan1 = Date.UTC(2026, 0, 1);
  assert.notStrictEqual(weatherAt(jan1), weatherAt(Date.UTC(2026, 0, 2)));
  assert.strictEqual(weatherAt(jan1), weatherAt(jan1));
});
process.exitCode = failures ? 1 : 0;
