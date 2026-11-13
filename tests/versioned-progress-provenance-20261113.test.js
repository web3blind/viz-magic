'use strict';
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
function load(c, file, expose) {
    var source = fs.readFileSync(path.join(__dirname, '../app/js', file), 'utf8');
    if (expose) {
        var at = source.lastIndexOf('    return {');
        source = source.slice(0, at) + 'globalThis.provenanceFixture = {' + expose + '};\n' + source.slice(at);
    }
    vm.runInContext(source, c, { filename: file });
}
function setup(kind, head) {
    var saves = 0;
    var c = vm.createContext({ console: { log: function() {}, warn: function() {} }, window: {}, setTimeout: function() {}, clearTimeout: function() {} });
    load(c, 'config.js'); c.VizMagicConfig.SECURITY_V3.ACTIVATION_BLOCK = 100;
    c.CheckpointSystem = { init: function(cb) { cb(null); }, loadLatestCheckpoint: function(_who, cb) { cb(null, null); }, saveCheckpoint: function(_who, _n, _state, cb) { saves++; cb(null); } };
    load(c, 'engine/quest-system.js'); load(c, 'engine/validator.js'); load(c, 'engine/action-proof.js'); load(c, 'engine/state-engine.js');
    c.StateEngine.init(function(err) { assert.ifError(err); });
    var s = c.StateEngine.getState(); s.headBlock = head;
    s.characters.alice = { account: 'alice', level: 1, xp: 0, hp: 100 };
    s.quests.alice = { active: [{ id: 'q', objectives: [{ type: kind, target: kind === 'hunt' ? 'fixture-creature' : 'blessing', required: 1, current: 0 }] }], completed: [] };
    // Deterministic combat boundary: these fixtures are not canonical operation/payment evidence.
    c.GameCreatures = { getCreature: function() { return { baseXp: 50 }; } };
    c.GameSpells = { getSpell: function() { return { manaCost: 100 }; } };
    c.CharacterSystem = { addXp: function(ch, n) { ch.xp += n; return { levelsGained: 0 }; } };
    c.CombatSystem = { resolveHunt: function() { return { victory: true, xpGained: 1, loot: [], hpRemaining: 100 }; } };
    return { c: c, state: s, saves: function() { return saves; } };
}
function progress(x) { return x.c.QuestSystem.getQuestProgressTotal(x.state.quests.alice.active[0]); }
var old = setup('hunt', 99);
assert.ok(old.c.StateEngine.processHuntResult('alice', 'fixture-creature', 'fixture-spell', '0'.repeat(64), 99, 100));
assert.equal(progress(old), 1);
for (var n of [100, 101]) {
    var x = setup('hunt', n), before = JSON.stringify(x.state);
    assert.equal(x.c.StateEngine.processHuntResult('alice', 'fixture-creature', 'fixture-spell', '0'.repeat(64), n, 100), null);
    assert.equal(JSON.stringify(x.state), before);
    assert.equal(x.c.StateEngine.processHuntResult('alice', 'fixture-creature', 'fixture-spell', '0'.repeat(64), 99, 100), null);
    assert.equal(x.c.StateEngine.processMoveResult('alice', 'fixture-zone', n), null);
    assert.equal(JSON.stringify(x.state), before);
    assert.equal(x.c.StateEngine.processQuestAbandonResult('alice', 'q', n, 0), null);
    assert.equal(x.state.quests.alice.active.length, 1);
}
for (var height of [98, 99, 100, 101]) {
    var social = setup('social', height);
    social.c.VizAccount = { getCurrentUser: function() { return 'alice'; } };
    load(social.c, 'ui/screens/chronicle.js', 'blessing:_updateLocalBlessingQuestProgress');
    social.c.provenanceFixture.blessing('bob');
    assert.equal(progress(social), height + 1 < 100 ? 1 : 0);
    assert.equal(social.saves(), height + 1 < 100 ? 1 : 0);
}
var canonical = setup('social', 99);
var events = canonical.c.StateEngine.processBlock({ blockNum: 100, blockHash: '0'.repeat(64), timestamp: '2026-11-13T00:00:00', vmActions: [], awards: [{ initiator: 'alice', receiver: 'bob', energy: 100, memo: 'viz://vm/bless/bob' }] }, { runMaintenance: false });
assert.equal(progress(canonical), 1);
assert.equal(canonical.c.ActionProof.getRequirement({ type: 'quest.abandon', data: { quest_id: 'q' } }, canonical.state, 'alice', 101), null);
assert.equal(canonical.c.StateEngine.processQuestAbandonResult('alice', 'q', 101, 0), null);
assert.equal(canonical.state.quests.alice.active.length, 1);
events = canonical.c.StateEngine.processBlock({ blockNum: 101, blockHash: '1'.repeat(64), timestamp: '2026-11-13T00:00:01', vmActions: [{ sender: 'alice', txIndex: 0, opIndex: 0, action: { type: 'quest.abandon', version: 2, data: { quest_id: 'q' } } }], awards: [] }, { runMaintenance: false });
assert.ok(events.some(function(e) { return e.type === 'quest_abandoned'; }));
assert.equal(canonical.state.quests.alice.active.length, 0);
console.log('PASS legacy direct progress preserved; v3 synthetic hunt/move/blessing cannot waive paid abandonment; canonical blessing/free abandonment still works');
