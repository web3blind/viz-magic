'use strict';

var assert = require('assert');
var http = require('http');
var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

var APP_DIR = path.join(__dirname, '..', 'app');
var APP_PORT = 8214;
var MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function startAppServer() {
  return new Promise(function(resolve) {
    var srv = http.createServer(function(req, res) {
      var url = req.url.split('?')[0];
      if (url === '/') url = '/index.html';
      var filePath = path.join(APP_DIR, url);
      fs.readFile(filePath, function(err, data) {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(APP_PORT, '127.0.0.1', function() { resolve(srv); });
  });
}

function makeFixtureBlock(blockNum, sender, type, data) {
  var blockId = String(blockNum).padStart(8, '0') + 'abcdefabcdefabcdefabcdefabcdefab';
  return {
    __blockNum: blockNum,
    previous: '0000000000000000000000000000000000000000',
    block_id: blockId,
    witness_signature: blockId,
    timestamp: '2026-06-21T00:00:00',
    transactions: [{ operations: [[ 'custom', { required_regular_auths: [sender], required_active_auths: [], id: 'VM', json: JSON.stringify({ p: 'VM', v: 1, b: blockNum - 1, t: type, d: data }) } ]] }]
  };
}

async function run() {
  var server = await startAppServer();
  var browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
    var page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + APP_PORT + '/?world-systems=smoke', { waitUntil: 'networkidle0', timeout: 15000 });

    var result = await page.evaluate(function(blocks) {
      function makeFixtureBlock(blockNum, sender, type, data) {
        var blockId = String(blockNum).padStart(8, '0') + 'abcdefabcdefabcdefabcdefabcdefab';
        return {
          __blockNum: blockNum,
          previous: '0000000000000000000000000000000000000000',
          block_id: blockId,
          witness_signature: blockId,
          timestamp: '2026-06-21T00:00:00',
          transactions: [{ operations: [[ 'custom', { required_regular_auths: [sender], required_active_auths: [], id: 'VM', json: JSON.stringify({ p: 'VM', v: 1, b: blockNum - 1, t: type, d: data }) } ]] }]
        };
      }

      function process(block) {
        var processed = BlockProcessor.processBlock(block, block.__blockNum);
        var events = StateEngine.processBlock(processed);
        return { blockNum: block.__blockNum, actions: processed.vmActions.length, events: events.map(function(ev) { return ev.type; }), rawEvents: events };
      }

      function hasEvent(outputs, type) {
        for (var i = 0; i < outputs.length; i++) {
          if (outputs[i].events.indexOf(type) !== -1) return true;
        }
        return false;
      }

      function initCharacter(account, level, pot) {
        var state = StateEngine.getState();
        state.characters[account] = { name: account, className: 'embercaster', level: level, hp: 500, maxHp: 500, pot: pot, res: 6, swf: 5, int: 7, for_: 4, coreBonus: 0, spells: ['firebolt'] };
        state.inventories[account] = [];
      }

      localStorage.setItem('viz_magic_session', JSON.stringify({ currentUser: 'world-alpha', users: { 'world-alpha': { regular_key: 'fixture' } } }));
      VizAccount.init();

      // Scenario 1: replay-only happy path for boss attack + attacker siege claim.
      StateEngine.reset();
      initCharacter('world-alpha', 8, 10);
      var outputs = [];
      for (var i = 0; i < blocks.length; i++) outputs.push(process(blocks[i]));
      var st = StateEngine.getState();
      App.navigateTo('world-boss');
      var bossText = document.getElementById('screen-world-boss').innerText;
      App.navigateTo('map');
      var mapText = document.getElementById('screen-map').innerText;
      var happy = {
        outputs: outputs,
        hasGuild: hasEvent(outputs, 'guild_created'),
        hasSiegeDeclared: hasEvent(outputs, 'siege_declared'),
        hasSiegeContribution: hasEvent(outputs, 'siege_contribution'),
        hasBossAttack: hasEvent(outputs, 'boss_attacked'),
        hasTerritoryClaim: hasEvent(outputs, 'territory_claimed'),
        boss: st.worldBoss,
        territory: st.territories.commons_first_light,
        guild: st.guilds['world-guild'],
        bossText: bossText,
        mapText: mapText
      };

      // Scenario 2: expired active boss must not accept attacks or mutate damage.
      StateEngine.reset();
      initCharacter('expired-alpha', 10, 20);
      var expiredState = StateEngine.getState();
      expiredState.worldBoss = WorldBoss.spawnBoss(1000, 1, WorldBoss.BOSS_ACCOUNT);
      expiredState.worldBoss.endBlock = 1100;
      var expiredBefore = expiredState.worldBoss.totalDamage;
      var expiredOutput = process(makeFixtureBlock(1200, 'expired-alpha', 'boss.attack', { spell: 'firebolt' }));
      var expiredAfter = StateEngine.getState().worldBoss.totalDamage;

      // Scenario 3: high-power local fixture can defeat the boss and expose loot UI without chain mutation.
      StateEngine.reset();
      initCharacter('slayer-alpha', 5000, 20000);
      var defeatOutput = process(makeFixtureBlock(5000, 'slayer-alpha', 'boss.attack', { spell: 'firebolt' }));
      var defeatState = StateEngine.getState();
      var loot = WorldBoss.calculateLootDistribution(defeatState.worldBoss);
      var slayerXp = defeatState.characters['slayer-alpha'].xp;
      var slayerInventoryCount = defeatState.inventories['slayer-alpha'].length;
      App.navigateTo('world-boss');
      var defeatedText = document.getElementById('screen-world-boss').innerText;
      App.navigateTo('home');
      App.navigateTo('world-boss');
      var rerenderedDefeatedText = document.getElementById('screen-world-boss').innerText;

      // Scenario 4: defender wins an expired siege; territory must remain with defender guild.
      StateEngine.reset();
      initCharacter('attacker-alpha', 20, 20);
      initCharacter('defender-alpha', 20, 20);
      var defenderOutputs = [];
      defenderOutputs.push(process(makeFixtureBlock(6001, 'defender-alpha', 'guild.create', { id: 'def-guild', name: 'Defenders', tag: 'DEF', school: 'stonewarden' })));
      defenderOutputs.push(process(makeFixtureBlock(6002, 'attacker-alpha', 'guild.create', { id: 'atk-guild', name: 'Attackers', tag: 'ATK', school: 'embercaster' })));
      var defenderState = StateEngine.getState();
      defenderState.territories = TerritorySystem.initTerritories(6002);
      defenderState.territories.commons_first_light.controllerGuild = 'def-guild';
      defenderState.territories.commons_first_light.controllerSince = 6002;
      defenderOutputs.push(process(makeFixtureBlock(6003, 'attacker-alpha', 'siege.declare', { territory_id: 'commons_first_light', guild_id: 'atk-guild' })));
      defenderOutputs.push(process(makeFixtureBlock(6004, 'attacker-alpha', 'siege.commit', { siege_ref: 'siege_commons_first_light_atk-guild_6003', energy: 10 })));
      defenderOutputs.push(process(makeFixtureBlock(6005, 'defender-alpha', 'siege.commit', { siege_ref: 'siege_commons_first_light_atk-guild_6003', energy: 50 })));
      defenderOutputs.push(process(makeFixtureBlock(210000, 'attacker-alpha', 'territory.claim', { territory_id: 'commons_first_light', siege_ref: 'siege_commons_first_light_atk-guild_6003' })));
      var defenderTerritory = StateEngine.getState().territories.commons_first_light;

      return {
        happy: happy,
        expired: { output: expiredOutput, before: expiredBefore, after: expiredAfter },
        defeated: { output: defeatOutput, boss: defeatState.worldBoss, loot: loot, text: defeatedText, rerenderedText: rerenderedDefeatedText, xp: slayerXp, inventoryCount: slayerInventoryCount },
        defender: { outputs: defenderOutputs, territory: defenderTerritory }
      };
    }, [
      makeFixtureBlock(3001, 'world-alpha', 'guild.create', { id: 'world-guild', name: 'World Guild', tag: 'WRL', school: 'embercaster' }),
      makeFixtureBlock(3002, 'world-alpha', 'siege.declare', { territory_id: 'commons_first_light', guild_id: 'world-guild' }),
      makeFixtureBlock(3003, 'world-alpha', 'siege.commit', { siege_ref: 'siege_commons_first_light_world-guild_3002', energy: 77 }),
      makeFixtureBlock(3004, 'world-alpha', 'boss.attack', { spell: 'firebolt' }),
      makeFixtureBlock(205000, 'world-alpha', 'territory.claim', { territory_id: 'commons_first_light', siege_ref: 'siege_commons_first_light_world-guild_3002' })
    ]);

    assert.ok(result.happy.hasGuild, 'guild create should replay');
    assert.ok(result.happy.hasSiegeDeclared, 'siege declare should replay');
    assert.ok(result.happy.hasSiegeContribution, 'siege contribution should replay');
    assert.ok(result.happy.hasBossAttack, 'boss attack should replay');
    assert.ok(result.happy.hasTerritoryClaim, 'territory claim should replay after siege expiry: ' + JSON.stringify(result.happy.outputs));
    assert.ok(result.happy.boss && result.happy.boss.totalDamage > 0, 'boss state should accumulate deterministic damage');
    assert.strictEqual(result.happy.territory.controllerGuild, 'world-guild', 'attacker guild should control territory after uncontested claim: ' + JSON.stringify({ outputs: result.happy.outputs, territory: result.happy.territory }));
    assert.ok(result.happy.guild && result.happy.guild.members['world-alpha'], 'guild state should persist founder membership');
    assert.ok(result.happy.bossText.indexOf('World Boss') !== -1, 'world boss screen should render after populated state');
    assert.ok(result.happy.mapText.indexOf('World Map') !== -1, 'map/territory screen should render after populated state');

    assert.deepStrictEqual(result.expired.output.events, [], 'expired active boss should not accept attack: ' + JSON.stringify(result.expired));
    assert.strictEqual(result.expired.after, result.expired.before, 'expired boss damage must not mutate');

    assert.ok(result.defeated.output.events.indexOf('boss_attacked') !== -1, 'defeat attack should emit boss_attacked');
    assert.ok(result.defeated.output.events.indexOf('boss_defeated') !== -1, 'high-power fixture should defeat boss');
    assert.strictEqual(result.defeated.boss.currentHp, 0, 'defeated boss HP should clamp to zero');
    assert.strictEqual(result.defeated.boss.defeated, true, 'defeated flag should be true');
    assert.ok(result.defeated.loot.length === 1 && result.defeated.loot[0].account === 'slayer-alpha', 'loot distribution should include contributor: ' + JSON.stringify(result.defeated.loot));
    assert.ok(result.defeated.xp >= 50000, 'defeated boss should grant proportional XP to contributor: ' + JSON.stringify(result.defeated));
    assert.ok(result.defeated.inventoryCount >= 3, 'defeated boss should grant tiered items to contributor: ' + JSON.stringify(result.defeated));
    assert.ok(result.defeated.text.indexOf('Defeated') !== -1 || result.defeated.text.indexOf('Повержен') !== -1, 'defeated UI should render loot/defeated state');
    assert.ok(/slayer-alpha/.test(result.defeated.rerenderedText) && /50000 XP/.test(result.defeated.rerenderedText), 'defeated loot UI should survive rerender without mutating distribution: ' + result.defeated.rerenderedText);

    var defenderEvents = result.defender.outputs.reduce(function(acc, item) { return acc.concat(item.events); }, []);
    assert.ok(defenderEvents.indexOf('territory_claimed') !== -1, 'defender siege claim should resolve');
    assert.strictEqual(result.defender.territory.controllerGuild, 'def-guild', 'defender guild should retain territory after stronger defense: ' + JSON.stringify(result.defender));
    assert.strictEqual(result.defender.territory.activeSieges[0].state, 'failed', 'defended siege should be marked failed');

    console.log('PASS world boss territory siege replay smoke');
  } finally {
    if (browser) await browser.close();
    await new Promise(function(resolve) { server.close(resolve); });
  }
}

run().catch(function(err) {
  console.error('FAIL world boss territory siege smoke: ' + (err && err.stack || err));
  process.exit(1);
});
