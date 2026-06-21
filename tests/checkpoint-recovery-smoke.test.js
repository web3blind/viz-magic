'use strict';

var assert = require('assert');
var http = require('http');
var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

var APP_DIR = path.join(__dirname, '..', 'app');
var APP_PORT = 8212;
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

async function saveIncompleteCheckpoint(page, blockNum) {
  return page.evaluate(function(block) {
    return new Promise(function(resolve, reject) {
      var partialState = {
        headBlock: block,
        checkpointBlock: block,
        characters: {
          'checkpoint-mage': { name: 'Checkpoint Mage', className: 'embercaster', level: 3, hp: 80, maxHp: 100 }
        }
      };
      CheckpointSystem.saveCheckpoint('global', block, partialState, function(err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }, blockNum);
}

async function run() {
  var server = await startAppServer();
  var browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
    var page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + APP_PORT + '/?checkpoint=fresh', { waitUntil: 'networkidle0', timeout: 15000 });
    var fresh = await page.evaluate(function() {
      return { headBlock: StateEngine.getState().headBlock, hasGuilds: !!StateEngine.getState().guilds, hasSocial: !!StateEngine.getState().social };
    });
    assert.strictEqual(fresh.headBlock, 0, 'fresh profile should start at block 0 before catch-up stubs');
    assert.strictEqual(fresh.hasGuilds, true, 'fresh state should initialize guilds');
    assert.strictEqual(fresh.hasSocial, true, 'fresh state should initialize social state');

    await saveIncompleteCheckpoint(page, 7000);
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    var recent = await page.evaluate(function() {
      var state = StateEngine.getState();
      return {
        headBlock: state.headBlock,
        hasInventories: !!state.inventories,
        hasGuilds: !!state.guilds,
        hasTerritories: !!state.territories,
        hasRecentActions: Array.isArray(state.recentActions),
        hasSocialKnown: !!(state.social && Array.isArray(state.social.knownAccounts)),
        hasQuests: !!state.quests,
        hasActiveEvents: Array.isArray(state.activeEvents),
        characterName: state.characters['checkpoint-mage'] && state.characters['checkpoint-mage'].name
      };
    });
    assert.strictEqual(recent.headBlock, 7000, 'recent checkpoint should load its headBlock');
    assert.strictEqual(recent.characterName, 'Checkpoint Mage', 'checkpoint character should survive reload');
    assert.strictEqual(recent.hasInventories, true, 'incomplete checkpoint should normalize inventories');
    assert.strictEqual(recent.hasGuilds, true, 'incomplete checkpoint should normalize guilds');
    assert.strictEqual(recent.hasTerritories, true, 'incomplete checkpoint should normalize territories');
    assert.strictEqual(recent.hasRecentActions, true, 'incomplete checkpoint should normalize recentActions');
    assert.strictEqual(recent.hasSocialKnown, true, 'incomplete checkpoint should normalize social.knownAccounts');
    assert.strictEqual(recent.hasQuests, true, 'incomplete checkpoint should normalize quests');
    assert.strictEqual(recent.hasActiveEvents, true, 'incomplete checkpoint should normalize activeEvents');

    await page.evaluate(function() {
      return new Promise(function(resolve, reject) {
        CheckpointSystem.clearAll(function(err) { if (err) reject(err); else resolve(true); });
      });
    });
    await saveIncompleteCheckpoint(page, 1);
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    var old = await page.evaluate(function() {
      var state = StateEngine.getState();
      return { headBlock: state.headBlock, usable: !!(state.guilds && state.inventories && state.social && state.activeEvents) };
    });
    assert.strictEqual(old.headBlock, 1, 'old checkpoint should load without hanging');
    assert.strictEqual(old.usable, true, 'old checkpoint should still be normalized to current schema');

    console.log('PASS checkpoint recovery matrix smoke');
  } finally {
    if (browser) await browser.close();
    await new Promise(function(resolve) { server.close(resolve); });
  }
}

run().catch(function(err) {
  console.error('FAIL checkpoint recovery smoke: ' + (err && err.stack || err));
  process.exit(1);
});
