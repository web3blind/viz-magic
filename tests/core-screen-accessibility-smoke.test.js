'use strict';

var assert = require('assert');
var http = require('http');
var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

var APP_DIR = path.join(__dirname, '..', 'app');
var APP_PORT = 8213;
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
  var logs = [];
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    var page = await browser.newPage();
    page.on('console', function(msg) { logs.push({ type: msg.type(), text: msg.text() }); });
    page.on('pageerror', function(err) { logs.push({ type: 'pageerror', text: err.message }); });
    await page.goto('http://127.0.0.1:' + APP_PORT + '/?cachebust=core-screen-accessibility-smoke', { waitUntil: 'networkidle0', timeout: 15000 });

    var result = await page.evaluate(async function() {
      localStorage.setItem('viz_magic_session', JSON.stringify({ currentUser: 'smoke-player', users: { 'smoke-player': { regular_key: 'fixture-key' } } }));
      VizAccount.init();
      StateEngine.reset();
      var st = StateEngine.getState();
      st.headBlock = 1000;
      st.characters['smoke-player'] = {
        name: 'Smoke Mage', className: 'embercaster', level: 12, xp: 12345,
        hp: 100, maxHp: 120, mana: 10000, currentZone: 'commons_first_light',
        pot: 5, res: 4, swf: 3, int: 8, for_: 2, coreBonus: 0, spells: ['firebolt']
      };
      st.inventories['smoke-player'] = [
        { id: 'smoke-sword', type: 'iron_sword', rarity: 1, owner: 'smoke-player', equipped: false, consumed: false, listed: false, stats: { swf: 2 } },
        { id: 'smoke-herb', type: 'moon_herb', rarity: 0, owner: 'smoke-player', equipped: false, consumed: false, listed: false },
        { id: 'smoke-dust', type: 'fire_dust', rarity: 0, owner: 'smoke-player', equipped: false, consumed: false, listed: false },
        { id: 'smoke-echo', type: 'echo_shards', rarity: 1, owner: 'smoke-player', equipped: false, consumed: false, listed: false }
      ];
      st.quests['smoke-player'] = { active: [], completed: [] };
      st.guilds['smoke-guild'] = { id: 'smoke-guild', name: 'Smoke Guild', founder: 'smoke-player', members: { 'smoke-player': { account: 'smoke-player', rank: 'founder', joinedBlock: 900 } }, invites: {}, wars: [], quests: [], announcements: [], charter: '', totalDelegated: 0 };
      st.marketplace = { listings: { '999_smoke-sword': { ref: '999_smoke-sword', itemRef: 'smoke-sword', itemType: 'iron_sword', itemRarity: 1, itemStats: { swf: 2 }, seller: 'smoke-player', price: 5, listedBlock: 999, expiresBlock: 99999, state: 'active' } }, history: [], priceHistory: {} };
      MarketplaceEngine.setMarketState(st.marketplace);
      st.duels = st.duels || { pending: {}, active: {}, history: [], leaderboard: {} };
      st.duels.pending['smoke-challenge'] = { challengeRef: 'smoke-challenge', challenger: 'other-player', target: 'smoke-player', stake: 0, state: 'pending', createdBlock: 990 };
      st.worldBoss = WorldBoss.spawnBoss(1000, 1, WorldBoss.BOSS_ACCOUNT);
      st.territories = TerritorySystem.initTerritories(1000);

      var screens = ['home', 'character', 'hunt', 'inventory', 'chronicle', 'duel', 'arena', 'guild', 'map', 'marketplace', 'crafting', 'quests', 'world-boss', 'settings', 'help', 'leaderboard'];
      var out = [];
      for (var i = 0; i < screens.length; i++) {
        var screen = screens[i];
        try {
          App.navigateTo(screen);
          await new Promise(function(resolve) { setTimeout(resolve, 80); });
          var el = document.getElementById('screen-' + screen);
          var text = el ? (el.innerText || '').trim() : '';
          var controls = el ? Array.from(el.querySelectorAll('button,a,input,select,textarea,[role="button"]')).map(function(e) {
            return { tag: e.tagName, text: (e.innerText || e.value || e.getAttribute('aria-label') || e.getAttribute('title') || '').trim(), aria: e.getAttribute('aria-label') || '', disabled: !!e.disabled };
          }) : [];
          var rawKeys = text.match(/\b[a-z]+_[a-z0-9_]+\b/g) || [];
          out.push({ screen: screen, ok: !!el && text.length > 0, textLength: text.length, hidden: el ? el.getAttribute('aria-hidden') : 'missing', heading: (el && el.querySelector('h1,h2,h3')) ? el.querySelector('h1,h2,h3').innerText.trim() : '', rawKeys: rawKeys.slice(0, 10), emptyControls: controls.filter(function(b) { return !b.text && !b.aria; }).length });
        } catch (e) {
          out.push({ screen: screen, ok: false, error: e.message });
        }
      }
      var cachesKeys = (typeof caches !== 'undefined') ? await caches.keys() : [];
      var scripts = Array.from(document.scripts).map(function(s) { return s.src; }).filter(Boolean);
      return { screens: out, cachesKeys: cachesKeys, scripts: scripts };
    });

    var failed = result.screens.filter(function(s) { return !s.ok || s.hidden === 'true' || s.emptyControls > 0 || (s.rawKeys && s.rawKeys.length > 0); });
    var badLogs = logs.filter(function(l) { return l.type === 'error' || l.type === 'pageerror'; });
    assert.deepStrictEqual(failed, [], 'all core screens should render with named controls and no raw keys');
    assert.deepStrictEqual(badLogs, [], 'core screen smoke should not emit console errors/page errors');
    assert.ok(result.cachesKeys.indexOf('viz-magic-v25') !== -1, 'service worker cache should use latest cache name');
    assert.ok(result.scripts.some(function(src) { return src.indexOf('helpers.js?v=20260621l') !== -1; }), 'helpers script should be cache-busted');
    assert.ok(result.scripts.some(function(src) { return src.indexOf('territory.js?v=20260621l') !== -1; }), 'territory script should be cache-busted');
    assert.ok(result.scripts.some(function(src) { return src.indexOf('state-engine.js?v=20260621l') !== -1; }), 'state engine script should be cache-busted');
    console.log('PASS core screen accessibility smoke');
  } finally {
    if (browser) await browser.close();
    await new Promise(function(resolve) { server.close(resolve); });
  }
}

run().catch(function(err) {
  console.error('FAIL core screen accessibility smoke: ' + (err && err.stack || err));
  process.exit(1);
});
