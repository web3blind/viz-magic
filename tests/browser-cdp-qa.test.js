'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const CDP_HTTP = 'http://127.0.0.1:18800';
const APP_URL = process.env.VIZ_MAGIC_QA_URL || 'http://127.0.0.1:8218/?audit-remediation=1';

function request(method, url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(method + ' ' + url + ': ' + res.statusCode + ' ' + body));
        try { resolve(JSON.parse(body)); } catch (_) { resolve(body); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function connectTarget() {
  const target = await request('PUT', CDP_HTTP + '/json/new?about:blank');
  const ws = new WebSocket(target.webSocketDebuggerUrl, { suppressOrigin: true });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let sequence = 0;
  const waiting = new Map();
  const events = [];
  ws.on('message', raw => {
    const message = JSON.parse(String(raw));
    if (message.id && waiting.has(message.id)) {
      const waiter = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result || {});
    } else if (message.method) {
      events.push(message);
    }
  });
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  return { target, ws, send, events };
}

async function evaluate(cdp, expression) {
  const reply = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: false
  });
  if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.text + ': ' + JSON.stringify(reply.exceptionDetails.exception || {}));
  return reply.result && reply.result.value;
}

(async function main() {
  const cdp = await connectTarget();
  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Network.setBlockedURLs', {
      urls: ['*://api.viz.world/*', '*://node.viz.cx/*', '*://viz-node.dpos.space/*', '*://fonts.googleapis.com/*', '*://fonts.gstatic.com/*']
    });
    await cdp.send('Page.navigate', { url: APP_URL });
    await new Promise(resolve => setTimeout(resolve, 3500));

    const result = await evaluate(cdp, `(function() {
      var cfg = VizMagicConfig;
      var activation = cfg.PAID_ACTIONS.V2_ACTIVATION_BLOCK;
      function initCharacter() {
        StateEngine.reset();
        var state = StateEngine.getState();
        var character = CharacterSystem.createCharacter('alice', 'Alice', 'embercaster', activation);
        character.currentZone = 'crystal_meadows';
        state.characters.alice = character;
        state.inventories.alice = [];
        return state;
      }
      function blockWith(operations, blockNum, suffix) {
        return BlockProcessor.processBlock({
          block_id: 'block-' + suffix,
          previous: 'previous-' + suffix,
          timestamp: '2026-09-05T12:00:00',
          transactions: [{ operations: operations }]
        }, blockNum);
      }
      function custom(protocol, json) {
        return ['custom', { id: protocol, required_regular_auths: ['alice'], json: JSON.stringify(json) }];
      }
      function award(requirement) {
        return ['award', { initiator: 'alice', receiver: requirement.receiver, energy: requirement.energy, memo: requirement.memo }];
      }
      function firstOwn(o) { for (var key in o) if (Object.prototype.hasOwnProperty.call(o, key)) return o[key]; return null; }

      var creature = firstOwn(GameCreatures.getAll());
      var spell = GameSpells.getSpellsForClass('embercaster')[0];
      var huntAction = { p: cfg.PROTOCOLS.VM, v: 2, t: cfg.ACTION_TYPES.HUNT, d: { creature: creature.id, spell: spell.id, energy: spell.manaCost } };
      var huntReq = ActionProof.getRequirement({ version: 2, type: huntAction.t, data: huntAction.d });
      initCharacter();
      var rejectedEvents = StateEngine.processBlock(blockWith([custom(cfg.PROTOCOLS.VM, huntAction)], activation + 1, 'hunt-rejected'));
      var rejectedXp = StateEngine.getCharacter('alice').xp;
      initCharacter();
      var acceptedEvents = StateEngine.processBlock(blockWith([award(huntReq), custom(cfg.PROTOCOLS.VM, huntAction)], activation + 2, 'hunt-accepted'));
      var acceptedHunt = acceptedEvents.some(function(e) { return e.type === 'hunt_victory' || e.type === 'hunt_defeat'; });

      initCharacter();
      var legacyAction = { p: cfg.PROTOCOLS.VM, v: 1, t: cfg.ACTION_TYPES.HUNT, d: huntAction.d };
      var legacyEvents = StateEngine.processBlock(blockWith([custom(cfg.PROTOCOLS.VM, legacyAction)], activation - 1, 'hunt-legacy'));

      var travelAction = { p: cfg.PROTOCOLS.VM, v: 2, t: cfg.ACTION_TYPES.MOVE, d: { zone: 'ember_wastes', energy: 100 } };
      var travelReq = ActionProof.getRequirement({ version: 2, type: travelAction.t, data: travelAction.d });
      initCharacter();
      var travelBlock = blockWith([award(travelReq), custom(cfg.PROTOCOLS.VM, travelAction)], activation + 2, 'travel');
      var travelEvents = StateEngine.processBlock(travelBlock);
      var travelSnapshot = JSON.stringify({ zone: StateEngine.getCharacter('alice').currentZone, inventory: StateEngine.getInventory('alice') });
      var travelDuplicateEvents = StateEngine.processBlock(travelBlock);
      var travelDuplicateSnapshot = JSON.stringify({ zone: StateEngine.getCharacter('alice').currentZone, inventory: StateEngine.getInventory('alice') });
      initCharacter();
      StateEngine.processBlock(travelBlock);
      var travelReplaySnapshot = JSON.stringify({ zone: StateEngine.getCharacter('alice').currentZone, inventory: StateEngine.getInventory('alice') });

      var state = initCharacter();
      var item = ItemSystem.createItem('oak_wand', 'alice', 1, activation - 10, '', false);
      item.id = 'wand-1';
      var rune = ItemSystem.createItem('fire_rune', 'alice', 0, activation - 9, '', false);
      rune.id = 'rune-1';
      state.inventories.alice.push(item, rune);
      var ve = { v: 1, e: 'enchant', d: { item_ref: item.id, rune_type: 'fire_rune', rune_ref: rune.id } };
      var veBlock = blockWith([custom(cfg.PROTOCOLS.VE, ve)], activation + 3, 've');
      var veEvents1 = StateEngine.processBlock(veBlock);
      var veApplied = veEvents1.some(function(e) { return e.type === 've_enchant'; });
      var reforge = { v: 1, action: 'edit', d: { item_ref: item.id, op: 'reforge' } };
      var reforgeBlock = blockWith([custom(cfg.PROTOCOLS.VE, reforge)], activation + 4, 'reforge');
      var reforgeEvents = StateEngine.processBlock(reforgeBlock);
      var reforgeApplied = reforgeEvents.some(function(e) { return e.type === 've_reforge'; });
      var veSnapshot1 = JSON.stringify(StateEngine.getInventory('alice'));
      var veEvents2 = StateEngine.processBlock(veBlock);
      var reforgeEvents2 = StateEngine.processBlock(reforgeBlock);
      var veSnapshot2 = JSON.stringify(StateEngine.getInventory('alice'));
      var checkpointSnapshot = JSON.stringify({ character: StateEngine.getCharacter('alice'), inventory: StateEngine.getInventory('alice') });
      state = initCharacter();
      var itemReplay = ItemSystem.createItem('oak_wand', 'alice', 1, activation - 10, '', false);
      itemReplay.id = 'wand-1';
      var runeReplay = ItemSystem.createItem('fire_rune', 'alice', 0, activation - 9, '', false);
      runeReplay.id = 'rune-1';
      state.inventories.alice.push(itemReplay, runeReplay);
      StateEngine.processBlock(veBlock);
      StateEngine.processBlock(reforgeBlock);
      var replaySnapshot = JSON.stringify({ character: StateEngine.getCharacter('alice'), inventory: StateEngine.getInventory('alice') });

      StateEngine.reset();
      var metadataAction = { p: cfg.PROTOCOLS.VM, v: 2, t: cfg.ACTION_TYPES.CHAR_ATTUNE, d: { name: 'Alice', class: 'embercaster', level: 100, xp: 999999999 } };
      StateEngine.processBlock(blockWith([custom(cfg.PROTOCOLS.VM, metadataAction)], activation + 4, 'metadata'));
      var metadataCharacter = StateEngine.getCharacter('alice');
      CharacterSystem.restoreProgression(metadataCharacter, { level: 100, xp: 999999999 });

      var guildRoot = document.getElementById('screen-guild');
      var guildHtmlBefore = guildRoot.innerHTML;
      var originalAccount = VizAccount;
      VizAccount = Object.assign({}, originalAccount, {
        getCurrentUser: function() { return 'alice'; },
        getActiveKey: function() { return ''; },
        getAccountData: function() { return { effective_shares: '0.000000 SHARES', received_shares: '0.000000 SHARES', delegated_shares: '0.000000 SHARES' }; }
      });
      Helpers.setLang('ru');
      GuildScreen.render();
      var consent = document.getElementById('guild-active-key-persist');
      var label = consent && document.querySelector('label[for="guild-active-key-persist"]');
      var consentCheck = { exists: !!consent, unchecked: !!consent && !consent.checked, label: label ? label.textContent.trim() : '' };
      Helpers.setLang('en');
      VizAccount = originalAccount;
      guildRoot.innerHTML = guildHtmlBefore;

      return {
        modules: !!(ActionProof && DeterministicActions && StateEngine && BlockProcessor),
        payment: { rejectedHunt: rejectedEvents.some(function(e) { return e.type === 'hunt_victory' || e.type === 'hunt_defeat'; }), rejectedXp: rejectedXp, acceptedHunt: acceptedHunt },
        legacy: legacyEvents.some(function(e) { return e.type === 'hunt_victory' || e.type === 'hunt_defeat'; }),
        travel: { applied: travelEvents.some(function(e) { return e.type === 'character_moved'; }), duplicate: travelDuplicateEvents.some(function(e) { return e.type === 'character_moved'; }), stable: travelSnapshot === travelDuplicateSnapshot, zone: JSON.parse(travelSnapshot).zone, replayEquivalent: travelSnapshot === travelReplaySnapshot },
        ve: { applied: veApplied, reforgeApplied: reforgeApplied, duplicate: veEvents2.some(function(e) { return e.type === 've_enchant'; }) || reforgeEvents2.some(function(e) { return e.type === 've_reforge'; }), stable: veSnapshot1 === veSnapshot2, replayEquivalent: checkpointSnapshot === replaySnapshot },
        metadata: { level: metadataCharacter.level, xp: metadataCharacter.xp, source: metadataCharacter.progressionSource },
        consent: consentCheck,
        supportCopy: LangRU.help_magic_library_chapter_two_warning,
        bazaarSourceUntouched: typeof MarketplaceEngine !== 'undefined'
      };
    })()`);

    console.log('CDP_RESULT ' + JSON.stringify(result));
    assert.ok(result.modules, 'new proof and deterministic modules must be loaded by the real app shell');
    assert.strictEqual(result.payment.rejectedHunt, false, 'post-activation paid action without same-tx award must be rejected');
    assert.strictEqual(result.payment.rejectedXp, 0, 'rejected paid action must not mutate progression');
    assert.ok(result.payment.acceptedHunt, 'matching same-tx award must authorize the hunt');
    assert.ok(result.legacy, 'pre-activation historical action must remain replayable');
    assert.ok(result.travel.applied, 'paid travel must apply through the confirmed replay path');
    assert.strictEqual(result.travel.duplicate, false, 'same travel action must not apply twice');
    assert.ok(result.travel.stable, 'duplicate travel must not duplicate deterministic finds');
    assert.strictEqual(result.travel.zone, 'ember_wastes');
    assert.ok(result.travel.replayEquivalent, 'deterministic travel and any find must replay identically');
    assert.ok(result.ve.applied, 'current VE payload must produce an engine event');
    assert.ok(result.ve.reforgeApplied, 'VE reforge must apply through state engine');
    assert.strictEqual(result.ve.duplicate, false, 'duplicate VE block must be idempotent');
    assert.ok(result.ve.stable, 'duplicate VE block must not mutate inventory twice');
    assert.ok(result.ve.replayEquivalent, 'fresh replay must equal checkpoint-era state for VE');
    assert.strictEqual(result.metadata.level, 1, 'metadata must not self-assert level');
    assert.strictEqual(result.metadata.xp, 0, 'metadata must not self-assert XP');
    assert.strictEqual(result.metadata.source, 'metadata-unverified');
    assert.deepStrictEqual(result.consent, { exists: true, unchecked: true, label: 'Сохранить - небезопасно' });
    assert.ok(/Добровольная поддержка Мира/.test(result.supportCopy));
    assert.ok(result.bazaarSourceUntouched, 'existing Bazaar implementation must remain present');

    const checkpointRoundTrip = await evaluate(cdp, `(new Promise(function(resolve, reject) {
      var before = JSON.stringify(StateEngine.getState());
      var blockNum = StateEngine.getState().headBlock;
      CheckpointSystem.init(function(initErr) {
        if (initErr) { reject(initErr); return; }
        CheckpointSystem.saveCheckpoint('audit-remediation', blockNum, StateEngine.getState(), function(saveErr) {
          if (saveErr) { reject(saveErr); return; }
          CheckpointSystem.loadLatestCheckpoint('audit-remediation', function(loadErr, checkpoint) {
            if (loadErr) { reject(loadErr); return; }
            resolve({ blockNum: checkpoint && checkpoint.blockNum, equal: !!checkpoint && JSON.stringify(checkpoint.state) === before });
          });
        });
      });
    }))`);
    assert.ok(checkpointRoundTrip.equal, 'IndexedDB checkpoint round-trip must preserve the replayed state byte-for-byte');

    await evaluate(cdp, `(function() {
      Helpers.setLang('ru');
      VizAccount = Object.assign({}, VizAccount, {
        getCurrentUser: function() { return 'alice'; },
        getActiveKey: function() { return ''; },
        getAccountData: function() { return { effective_shares: '0.000000 SHARES', received_shares: '0.000000 SHARES', delegated_shares: '0.000000 SHARES' }; }
      });
      GuildScreen.render();
      var screens = document.querySelectorAll('.screen');
      for (var i = 0; i < screens.length; i++) { screens[i].classList.remove('active'); screens[i].setAttribute('aria-hidden', 'true'); }
      var guild = document.getElementById('screen-guild');
      guild.classList.add('active');
      guild.setAttribute('aria-hidden', 'false');
      return true;
    })()`);

    const viewports = [
      { width: 360, height: 740 },
      { width: 414, height: 896 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 }
    ];
    const layouts = [];
    for (const viewport of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.width < 768
      });
      const layout = await evaluate(cdp, `(function() {
        function rect(id) {
          var el = document.getElementById(id);
          if (!el) return null;
          var r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        }
        return {
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          key: rect('input-active-key'),
          consent: rect('guild-active-key-persist'),
          save: rect('btn-save-active-key')
        };
      })()`);
      layouts.push({ viewport, layout });
      assert.ok(layout.scrollWidth <= layout.innerWidth + 1, `horizontal overflow at ${viewport.width}px`);
      for (const id of ['key', 'consent', 'save']) {
        const rect = layout[id];
        assert.ok(rect && rect.width > 0 && rect.height > 0, `${id} hidden at ${viewport.width}px`);
        assert.ok(rect.left >= -1 && rect.right <= layout.innerWidth + 1, `${id} clipped at ${viewport.width}px`);
      }
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync('/tmp/viz-magic-audit-guild.png', Buffer.from(shot.data, 'base64'));

    const exceptions = cdp.events.filter(event => event.method === 'Runtime.exceptionThrown');
    assert.strictEqual(exceptions.length, 0, 'browser page must not report uncaught JavaScript exceptions');
    console.log('PASS browser CDP audit remediation QA');
    console.log(JSON.stringify(result));
    console.log('LAYOUTS ' + JSON.stringify(layouts));
    console.log('SCREENSHOT /tmp/viz-magic-audit-guild.png');
  } finally {
    try { await request('GET', CDP_HTTP + '/json/close/' + cdp.target.id); } catch (_) {}
    cdp.ws.close();
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
