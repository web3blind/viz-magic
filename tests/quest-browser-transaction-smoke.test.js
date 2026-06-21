'use strict';

var assert = require('assert');
var http = require('http');
var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

var APP_DIR = path.join(__dirname, '..', 'app');
var APP_PORT = 8215;
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

async function run() {
  var server = await startAppServer();
  var browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    var page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + APP_PORT + '/?cachebust=quest-browser-transaction-smoke', { waitUntil: 'networkidle0', timeout: 15000 });

    var result = await page.evaluate(async function() {
      localStorage.setItem('viz_magic_session', JSON.stringify({ currentUser: 'quest-smoke', users: { 'quest-smoke': { regular_key: 'fixture-key' } } }));
      VizAccount.init();
      StateEngine.reset();
      var state = StateEngine.getState();
      state.headBlock = 12000;
      state.characters['quest-smoke'] = {
        name: 'Quest Smoke', className: 'embercaster', level: 12, xp: 1000,
        hp: 100, maxHp: 100, mana: 10000, currentZone: 'commons_first_light',
        pot: 8, res: 5, swf: 4, int: 10, for_: 4, spells: ['firebolt']
      };
      state.inventories['quest-smoke'] = [];
      state.quests['quest-smoke'] = QuestSystem.createPlayerQuestState();

      var calls = [];
      VizBroadcast.questAction = function(type, data, callback) {
        calls.push({ type: type, data: JSON.parse(JSON.stringify(data || {})) });
        callback(null, { block_num: 12010 });
      };

      App.navigateTo('quests');
      await new Promise(function(resolve) { setTimeout(resolve, 80); });
      document.querySelector('[data-tab="available"]').click();
      await new Promise(function(resolve) { setTimeout(resolve, 80); });
      var acceptBtn = document.querySelector('.quest-accept-btn');
      if (!acceptBtn) return { error: 'accept button missing', calls: calls };
      var questId = acceptBtn.getAttribute('data-quest-id');
      acceptBtn.click();
      await new Promise(function(resolve) { setTimeout(resolve, 120); });
      var activeAfterAccept = StateEngine.getState().quests['quest-smoke'].active.map(function(q) { return q.id; });
      document.querySelector('[data-tab="active"]').click();
      await new Promise(function(resolve) { setTimeout(resolve, 80); });

      var abandonBtn = document.querySelector('.quest-abandon-btn');
      if (!abandonBtn) return { error: 'abandon button missing after accept', calls: calls, activeAfterAccept: activeAfterAccept };
      abandonBtn.click();
      await new Promise(function(resolve) { setTimeout(resolve, 120); });
      var activeAfterAbandon = StateEngine.getState().quests['quest-smoke'].active.map(function(q) { return q.id; });

      document.querySelector('[data-tab="daily"]').click();
      await new Promise(function(resolve) { setTimeout(resolve, 80); });
      var dailyBtn = document.querySelector('.quest-accept-btn[data-daily="true"]');
      if (!dailyBtn) return { error: 'daily accept button missing', calls: calls, activeAfterAccept: activeAfterAccept, activeAfterAbandon: activeAfterAbandon };
      dailyBtn.click();
      await new Promise(function(resolve) { setTimeout(resolve, 120); });
      var activeAfterDaily = StateEngine.getState().quests['quest-smoke'].active.map(function(q) { return q.id; });

      return {
        calls: calls,
        questId: questId,
        activeAfterAccept: activeAfterAccept,
        activeAfterAbandon: activeAfterAbandon,
        activeAfterDaily: activeAfterDaily,
        headBlock: StateEngine.getState().headBlock
      };
    });

    assert.ifError(result.error);
    assert.strictEqual(result.calls[0].type, 'quest.accept', 'available quest accept should broadcast VM action');
    assert.strictEqual(result.calls[0].data.quest_id, result.questId, 'quest id should be sent on chain');
    assert.ok(result.activeAfterAccept.indexOf(result.questId) !== -1, 'accepted quest should update StateEngine after broadcast');
    assert.strictEqual(result.calls[1].type, 'quest.abandon', 'abandon should broadcast VM action');
    assert.deepStrictEqual(result.activeAfterAbandon, [], 'abandoned quest should update StateEngine after broadcast');
    assert.strictEqual(result.calls[2].type, 'quest.accept', 'daily quest accept should broadcast VM action');
    assert.strictEqual(result.calls[2].data.daily, true, 'daily quest should include deterministic daily marker');
    assert.ok(result.activeAfterDaily.length === 1 && /^daily_/.test(result.activeAfterDaily[0]), 'daily quest should be accepted through StateEngine');
    assert.strictEqual(result.headBlock, 12010, 'local checkpoint head should advance to broadcast block');
    console.log('PASS quest browser transaction smoke');
  } finally {
    if (browser) await browser.close();
    await new Promise(function(resolve) { server.close(resolve); });
  }
}

run().catch(function(err) {
  console.error('FAIL quest browser transaction smoke: ' + (err && err.stack || err));
  process.exit(1);
});
