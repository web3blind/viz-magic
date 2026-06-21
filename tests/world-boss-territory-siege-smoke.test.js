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

function makeBlock(blockNum, sender, type, data) {
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
      localStorage.setItem('viz_magic_session', JSON.stringify({ currentUser: 'world-alpha', users: { 'world-alpha': { regular_key: 'fixture' } } }));
      VizAccount.init();
      StateEngine.reset();
      var state = StateEngine.getState();
      state.characters['world-alpha'] = { name: 'World Alpha', className: 'embercaster', level: 8, hp: 120, maxHp: 120, pot: 10, res: 6, swf: 5, int: 7, for_: 4, coreBonus: 0, spells: ['firebolt'] };
      state.inventories['world-alpha'] = [];
      var outputs = [];
      for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];
        var processed = BlockProcessor.processBlock(block, block.__blockNum);
        var events = StateEngine.processBlock(processed);
        outputs.push({ blockNum: block.__blockNum, actions: processed.vmActions.length, events: events.map(function(ev) { return ev.type; }) });
      }
      var st = StateEngine.getState();
      App.navigateTo('world-boss');
      var bossText = document.getElementById('screen-world-boss').innerText;
      App.navigateTo('map');
      var mapText = document.getElementById('screen-map').innerText;
      return {
        outputs: outputs,
        boss: st.worldBoss,
        territory: st.territories.commons_first_light,
        guild: st.guilds['world-guild'],
        bossText: bossText,
        mapText: mapText
      };
    }, [
      makeBlock(3001, 'world-alpha', 'guild.create', { id: 'world-guild', name: 'World Guild', tag: 'WRL', school: 'embercaster' }),
      makeBlock(3002, 'world-alpha', 'siege.declare', { territory_id: 'commons_first_light', guild_id: 'world-guild' }),
      makeBlock(3003, 'world-alpha', 'siege.commit', { siege_ref: 'siege_commons_first_light_world-guild_3002', energy: 77 }),
      makeBlock(3004, 'world-alpha', 'boss.attack', { spell: 'firebolt' }),
      makeBlock(205000, 'world-alpha', 'territory.claim', { territory_id: 'commons_first_light', siege_ref: 'siege_commons_first_light_world-guild_3002' })
    ]);

    var allEvents = result.outputs.reduce(function(acc, item) { return acc.concat(item.events); }, []);
    assert.ok(allEvents.indexOf('guild_created') !== -1, 'guild create should replay');
    assert.ok(allEvents.indexOf('siege_declared') !== -1, 'siege declare should replay');
    assert.ok(allEvents.indexOf('siege_contribution') !== -1, 'siege contribution should replay');
    assert.ok(allEvents.indexOf('boss_attacked') !== -1, 'boss attack should replay');
    assert.ok(allEvents.indexOf('territory_claimed') !== -1, 'territory claim should replay after siege expiry: ' + JSON.stringify(result.outputs));
    assert.ok(result.boss && result.boss.totalDamage > 0, 'boss state should accumulate deterministic damage');
    assert.strictEqual(result.territory.controllerGuild, 'world-guild', 'attacker guild should control territory after uncontested claim: ' + JSON.stringify({ outputs: result.outputs, territory: result.territory }));
    assert.ok(result.guild && result.guild.members['world-alpha'], 'guild state should persist founder membership');
    assert.ok(result.bossText.indexOf('World Boss') !== -1, 'world boss screen should render after populated state');
    assert.ok(result.mapText.indexOf('World Map') !== -1, 'map/territory screen should render after populated state');
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
