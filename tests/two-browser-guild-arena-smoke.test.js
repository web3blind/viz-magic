'use strict';

var assert = require('assert');
var http = require('http');
var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

var APP_DIR = path.join(__dirname, '..', 'app');
var APP_PORT = 8211;
var MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function startAppServer() {
  return new Promise(function(resolve) {
    var srv = http.createServer(function(req, res) {
      var url = req.url.split('?')[0];
      if (url === '/') url = '/index.html';
      var filePath = path.join(APP_DIR, url);
      var ext = path.extname(filePath);
      fs.readFile(filePath, function(err, data) {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(APP_PORT, '127.0.0.1', function() { resolve(srv); });
  });
}

function makeBlock(blockNum, sender, type, data) {
  return {
    previous: '0000000000000000000000000000000000000000',
    block_id: String(blockNum).padStart(8, '0') + '00000000000000000000000000000000',
    timestamp: '2026-06-21T00:00:00',
    transactions: [{
      operations: [[
        'custom',
        {
          required_regular_auths: [sender],
          required_active_auths: [],
          id: 'VM',
          json: JSON.stringify({ p: 'VM', v: 1, b: blockNum - 1, t: type, d: data })
        }
      ]]
    }]
  };
}

async function setupPage(browser, account) {
  var page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + APP_PORT + '/?smoke=' + account, { waitUntil: 'networkidle0', timeout: 15000 });
  await page.evaluate(function(acct) {
    localStorage.clear();
    localStorage.setItem('viz_magic_session', JSON.stringify({ currentUser: acct, users: {} }));
    var parsed = JSON.parse(localStorage.getItem('viz_magic_session'));
    parsed.users[acct] = { regular_key: 'fixture' };
    localStorage.setItem('viz_magic_session', JSON.stringify(parsed));
    VizAccount.init();
    StateEngine.reset();
    var state = StateEngine.getState();
    state.characters[acct] = { name: acct, className: 'embercaster', level: 5, hp: 100, maxHp: 100, pot: 8, res: 5, swf: 5, int: 7, for_: 4, coreBonus: 0, spells: ['firebolt'] };
    state.inventories[acct] = [];
  }, account);
  return page;
}

async function applyBlocks(page, blocks) {
  return page.evaluate(function(serialized) {
    var results = [];
    for (var i = 0; i < serialized.length; i++) {
      var item = serialized[i];
      var processed = BlockProcessor.processBlock(item.block, item.blockNum);
      var events = StateEngine.processBlock(processed);
      results.push({ blockNum: item.blockNum, actions: processed.vmActions.length, events: events.map(function(ev) { return ev.type; }) });
    }
    return { results: results, state: StateEngine.getState() };
  }, blocks.map(function(block, idx) { return { block: block, blockNum: block.__blockNum || (9000 + idx) }; }));
}

async function run() {
  var server = await startAppServer();
  var browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
    var pageA = await setupPage(browser, 'guild-alpha');
    var pageB = await setupPage(browser, 'guild-beta');

    var guildCreate = makeBlock(9101, 'guild-alpha', 'guild.create', { id: 'two-browser-guild', name: 'Two Browser Guild', tag: 'TBG', school: 'embercaster', motto: 'Archive visible' });
    guildCreate.__blockNum = 9101;
    var guildInvite = makeBlock(9102, 'guild-alpha', 'guild.invite', { guild_id: 'two-browser-guild', target: 'guild-beta' });
    guildInvite.__blockNum = 9102;
    var guildAccept = makeBlock(9103, 'guild-beta', 'guild.accept', { guild_id: 'two-browser-guild' });
    guildAccept.__blockNum = 9103;

    await applyBlocks(pageA, [guildCreate, guildInvite]);
    var bAfterInvite = await applyBlocks(pageB, [guildCreate, guildInvite]);
    assert.ok(bAfterInvite.state.guilds['two-browser-guild'], 'browser B should recover guild shell from replay');
    assert.ok(bAfterInvite.state.guilds['two-browser-guild'].invites['guild-beta'], 'browser B should see invite from replay');

    await applyBlocks(pageA, [guildAccept]);
    var bAfterAccept = await applyBlocks(pageB, [guildAccept]);
    assert.ok(bAfterAccept.state.guilds['two-browser-guild'].members['guild-beta'], 'browser B should see accepted membership from replay');
    assert.strictEqual(Object.keys(bAfterAccept.state.guilds['two-browser-guild'].members).length, 2, 'guild should have founder + accepted member');

    var guildUi = await pageB.evaluate(function() {
      App.navigateTo('guild');
      return new Promise(function(resolve) {
        setTimeout(function() {
          var el = document.getElementById('screen-guild');
          resolve({ text: el ? el.innerText : '', hidden: el && el.getAttribute('aria-hidden'), buttonsWithoutNames: Array.from(el.querySelectorAll('button')).filter(function(btn) { return !(btn.innerText || btn.getAttribute('aria-label') || btn.getAttribute('title')); }).length });
        }, 100);
      });
    });
    assert.strictEqual(guildUi.hidden, 'false');
    assert.ok(guildUi.text.indexOf('Two Browser Guild') !== -1, 'browser B guild screen should render replayed guild');
    assert.strictEqual(guildUi.buttonsWithoutNames, 0, 'guild screen should not have blank buttons');

    var challenge = makeBlock(9201, 'guild-alpha', 'challenge', { target: 'guild-beta', mode: 'best_of_3', rounds: 3, energy_pledge: 100, strategy_hash: 'hash-alpha', deadline_block: 9300 });
    challenge.__blockNum = 9201;
    var accept = makeBlock(9202, 'guild-beta', 'accept', { challenge_ref: '9201', strategy_hash: 'hash-beta', energy_pledge: 100 });
    accept.__blockNum = 9202;

    var betaAfterChallenge = await applyBlocks(pageB, [challenge]);
    assert.ok(betaAfterChallenge.state.duels.pending['9201'], 'browser B should see incoming arena challenge from replay');
    assert.strictEqual(betaAfterChallenge.state.duels.pending['9201'].target, 'guild-beta');

    await applyBlocks(pageA, [challenge, accept]);
    var betaAfterAccept = await applyBlocks(pageB, [accept]);
    assert.ok(betaAfterAccept.state.duels.active['9201'], 'accepted duel should move to active state');
    assert.strictEqual(betaAfterAccept.state.duels.active['9201'].status, 'active');

    var arenaUi = await pageB.evaluate(function() {
      App.navigateTo('arena');
      return new Promise(function(resolve) {
        setTimeout(function() {
          var el = document.getElementById('screen-arena');
          resolve({ text: el ? el.innerText : '', hidden: el && el.getAttribute('aria-hidden'), buttonsWithoutNames: Array.from(el.querySelectorAll('button')).filter(function(btn) { return !(btn.innerText || btn.getAttribute('aria-label') || btn.getAttribute('title')); }).length });
        }, 100);
      });
    });
    assert.strictEqual(arenaUi.hidden, 'false');
    assert.ok(arenaUi.text.indexOf('Arena') !== -1 || arenaUi.text.indexOf('Арена') !== -1, 'arena screen should render');
    assert.strictEqual(arenaUi.buttonsWithoutNames, 0, 'arena screen should not have blank buttons');

    console.log('PASS two-browser guild and arena replay smoke');
  } finally {
    if (browser) await browser.close();
    await new Promise(function(resolve) { server.close(resolve); });
  }
}

run().catch(function(err) {
  console.error('FAIL two-browser guild/arena smoke: ' + (err && err.stack || err));
  process.exit(1);
});
