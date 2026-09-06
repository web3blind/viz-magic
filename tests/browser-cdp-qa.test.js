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
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Network.setBlockedURLs', {
      urls: ['*://api.viz.world/*', '*://node.viz.cx/*', '*://viz-node.dpos.space/*', '*://fonts.googleapis.com/*', '*://fonts.gstatic.com/*']
    });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: "if ('serviceWorker' in navigator) { Object.defineProperty(Object.getPrototypeOf(navigator.serviceWorker), 'register', { configurable: true, value: function() { return Promise.resolve({}); } }); }"
    });
    await cdp.send('Page.navigate', { url: APP_URL });
    let modulesReady = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        modulesReady = await evaluate(cdp, `typeof VizMagicConfig !== 'undefined' && typeof App !== 'undefined' && typeof StateEngine !== 'undefined'`);
      } catch (_) {
        modulesReady = false;
      }
      if (modulesReady) break;
    }
    assert.strictEqual(modulesReady, true, 'application modules must finish loading before CDP assertions');
    await evaluate(cdp, `(async function() {
      if ('serviceWorker' in navigator) {
        var registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(function(registration) { return registration.unregister(); }));
      }
      if (typeof caches !== 'undefined') {
        var names = await caches.keys();
        await Promise.all(names.map(function(name) { return caches.delete(name); }));
      }
      return true;
    })()`);
    await cdp.send('Page.navigate', { url: APP_URL + (APP_URL.indexOf('?') === -1 ? '?' : '&') + 'cdp-fresh=1' });
    modulesReady = false;
    for (let freshAttempt = 0; freshAttempt < 20; freshAttempt++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      try {
        modulesReady = await evaluate(cdp, `typeof VizMagicConfig !== 'undefined' && typeof App !== 'undefined' && typeof StateEngine !== 'undefined'`);
      } catch (_) {
        modulesReady = false;
      }
      if (modulesReady) break;
    }
    assert.strictEqual(modulesReady, true, 'application modules must reload without stale service-worker code');

    const result = await evaluate(cdp, `(function() {
      var cfg = VizMagicConfig;
      var activation = cfg.PAID_ACTIONS.V2_ACTIVATION_BLOCK;
      function initCharacter() {
        StateEngine.reset();
        var state = StateEngine.getState();
        var character = CharacterSystem.createCharacter('alice', 'Alice', 'embercaster', activation);
        character.currentZone = 'commons_first_light';
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
      var huntAction = { p: cfg.PROTOCOLS.VM, v: 2, t: cfg.ACTION_TYPES.HUNT, d: { creature: creature.id, zone: creature.zone, spell: spell.id, energy: spell.manaCost } };
      var huntReq = ActionProof.getRequirement({ version: 2, type: huntAction.t, data: huntAction.d });
      initCharacter();
      var rejectedEvents = StateEngine.processBlock(blockWith([custom(cfg.PROTOCOLS.VM, huntAction)], activation + 1, 'hunt-rejected'));
      var rejectedXp = StateEngine.getCharacter('alice').xp;
      initCharacter();
      var acceptedEvents = StateEngine.processBlock(blockWith([award(huntReq), custom(cfg.PROTOCOLS.VM, huntAction)], activation + 2, 'hunt-accepted'));
      var acceptedHunt = acceptedEvents.some(function(e) { return e.type === 'hunt_victory' || e.type === 'hunt_defeat'; });

      initCharacter();
      var legacyAction = { p: cfg.PROTOCOLS.VM, v: 1, t: cfg.ACTION_TYPES.HUNT, d: { creature: creature.id, spell: spell.id } };
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
      initCharacter();
      var legacyMove = { p: cfg.PROTOCOLS.VM, v: 1, t: cfg.ACTION_TYPES.MOVE, d: { zone: 'ember_wastes', energy: 300 } };
      var legacyMoveEvents = StateEngine.processBlock(blockWith([custom(cfg.PROTOCOLS.VM, legacyMove)], activation - 2, 'legacy-travel'));
      var legacyTravel = { moved: legacyMoveEvents.some(function(e) { return e.type === 'character_moved'; }), finds: legacyMoveEvents.filter(function(e) { return e.type === 'travel_find'; }).length, inventory: StateEngine.getInventory('alice').length };

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
        legacyTravel: legacyTravel,
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
    assert.deepStrictEqual(result.legacyTravel, { moved: true, finds: 0, inventory: 0 }, 'legacy travel must remain valid without fabricating retroactive drops');
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

    const parentReplay = await evaluate(cdp, `(new Promise(function(resolve, reject) {
      var cfg = VizMagicConfig;
      var activation = cfg.PAID_ACTIONS.V2_ACTIVATION_BLOCK;
      function rawCustom(protocol, payload) {
        return ['custom', { id: protocol, required_regular_auths: ['alice'], required_active_auths: [], json: JSON.stringify(payload) }];
      }
      function rawAward(requirement) {
        return ['award', { initiator: 'alice', receiver: requirement.receiver, energy: requirement.energy, memo: requirement.memo, beneficiaries: [] }];
      }
      function rawBlock(blockNum, operations, label) {
        return { block_id: 'block-' + label, previous: '000000000000000000000000' + label, timestamp: '2026-09-05T12:00:00', transactions: [{ operations: operations }] };
      }
      function resetCharacter() {
        StateEngine.reset();
        var state = StateEngine.getState();
        var ch = CharacterSystem.createCharacter('alice', 'Alice', 'embercaster', activation);
        ch.currentZone = 'commons_first_light';
        ch.pot = 1000; ch.res = 1000; ch.swf = 1000; ch.hp = ch.maxHp = 10000;
        state.characters.alice = ch;
        state.inventories.alice = [];
        return state;
      }
      var creature = GameCreatures.getCreature('ember_wisp');
      var huntPayload = { p: cfg.PROTOCOLS.VM, v: 2, t: cfg.ACTION_TYPES.HUNT, d: { creature: creature.id, zone: creature.zone, spell: 'firebolt', energy: 100 } };
      var huntRequirement = ActionProof.getRequirement({ version: 2, type: huntPayload.t, data: huntPayload.d });
      function huntProcessed(blockNum, label, includeAward) {
        var ops = includeAward ? [rawAward(huntRequirement), rawCustom(cfg.PROTOCOLS.VM, huntPayload)] : [null, rawCustom(cfg.PROTOCOLS.VM, huntPayload)];
        return BlockProcessor.processBlock(rawBlock(blockNum, ops, label), blockNum);
      }

      var state = resetCharacter();
      var a = huntProcessed(activation + 1, 'a', true);
      var b = huntProcessed(activation + 2, 'b', true);
      var aAgain = huntProcessed(activation + 3, 'a-again', true);
      StateEngine.processBlock(a);
      var xpA = state.characters.alice.xp;
      StateEngine.processBlock(b);
      var xpB = state.characters.alice.xp;
      CheckpointSystem.init(function(checkpointInitError) {
        if (checkpointInitError) { reject(checkpointInitError); return; }
        var openRequest = indexedDB.open(cfg.STORAGE_PREFIX + 'game_state', 1);
        openRequest.onerror = function(event) { reject(event.target.error); };
        openRequest.onsuccess = function(event) {
          var clearTx = event.target.result.transaction(['checkpoints'], 'readwrite');
          clearTx.objectStore('checkpoints').clear();
          clearTx.onerror = function(clearEvent) { reject(clearEvent.target.error); };
          clearTx.oncomplete = function() {
            CheckpointSystem.saveCheckpoint('global', state.headBlock, state, function(saveErr) {
          if (saveErr) { reject(saveErr); return; }
          StateEngine.reset();
          StateEngine.init(function(initErr) {
            if (initErr) { reject(initErr); return; }
          var reloaded = StateEngine.getState();
          StateEngine.processBlock(aAgain);
          var xpAAgain = reloaded.characters.alice.xp;
          var duplicateEvents = StateEngine.processBlock(aAgain);
          var xpDuplicate = reloaded.characters.alice.xp;

          var missing = huntProcessed(activation + 10, 'retry', false);
          var beforeRetry = reloaded.characters.alice.xp;
          var missingEvents = StateEngine.processBlock(missing, { advanceHead: false });
          var fullRetry = huntProcessed(activation + 10, 'retry', true);
          var retryEvents = StateEngine.processBlock(fullRetry, { advanceHead: false });
          var afterRetry = reloaded.characters.alice.xp;

          var oneUse = BlockProcessor.processBlock(rawBlock(activation + 11, [
            rawAward(huntRequirement), rawCustom(cfg.PROTOCOLS.VM, huntPayload), rawCustom(cfg.PROTOCOLS.VM, huntPayload)
          ], 'one-use'), activation + 11);
          var beforeOneUse = reloaded.characters.alice.xp;
          var oneUseEvents = StateEngine.processBlock(oneUse, { advanceHead: false });
          var afterOneUse = reloaded.characters.alice.xp;

          var badPayload = { p: cfg.PROTOCOLS.VM, v: 2, t: cfg.ACTION_TYPES.HUNT, d: { creature: creature.id, zone: 'nonexistent-zone', spell: 'firebolt', energy: 100 } };
          var badReq = ActionProof.getRequirement({ version: 2, type: badPayload.t, data: badPayload.d });
          var badBlock = BlockProcessor.processBlock(rawBlock(activation + 12, [rawAward(badReq), rawCustom(cfg.PROTOCOLS.VM, badPayload)], 'bad-zone'), activation + 12);
          var beforeBad = reloaded.characters.alice.xp;
          var badEvents = StateEngine.processBlock(badBlock, { advanceHead: false });

          var wand = ItemSystem.createItem('oak_wand', 'alice', 1, activation, '', false); wand.id = 'ordered-wand';
          var rune = ItemSystem.createItem('fire_rune', 'alice', 0, activation, '', false); rune.id = 'ordered-rune';
          reloaded.inventories.alice.push(wand, rune);
          reloaded.characters.alice.hp = 1;
          var vePayload = { v: 1, e: 'enchant', d: { item_ref: wand.id, rune_type: 'fire_rune', rune_ref: rune.id } };
          var restPayload = { p: cfg.PROTOCOLS.VM, v: 2, t: cfg.ACTION_TYPES.REST, d: {} };
          var orderedBlock = BlockProcessor.processBlock(rawBlock(activation + 13, [rawCustom(cfg.PROTOCOLS.VE, vePayload), rawCustom(cfg.PROTOCOLS.VM, restPayload)], 'ordered'), activation + 13);
          var orderedEvents = StateEngine.processBlock(orderedBlock, { advanceHead: false });

          resolve({
            xp: [xpA, xpB, xpAAgain, xpDuplicate],
            duplicateEvents: duplicateEvents.length,
            retry: { missingEvents: missingEvents.length, before: beforeRetry, after: afterRetry, retryEvents: retryEvents.length },
            oneUse: { before: beforeOneUse, after: afterOneUse, events: oneUseEvents.filter(function(e) { return e.type === 'hunt_victory' || e.type === 'hunt_defeat'; }).length },
            badZone: { events: badEvents.length, before: beforeBad, after: reloaded.characters.alice.xp },
            orderedTypes: orderedEvents.map(function(event) { return event.type; }),
            storedOutcome: StateEngine.getProcessedBlockOutcomes(aAgain).length,
            head: reloaded.headBlock
          });
          });
        });
          };
        };
      });
    }))`);
    assert.deepStrictEqual(parentReplay.xp, [25, 50, 75, 75], 'A-B-A must remain distinct by operation identity across checkpoint reload while exact duplicates stay idempotent');
    assert.strictEqual(parentReplay.duplicateEvents, 0);
    assert.strictEqual(parentReplay.retry.missingEvents, 0, 'missing proof must not mutate state');
    assert.strictEqual(parentReplay.retry.after - parentReplay.retry.before, 25, 'same operation must remain retryable when its exact award later becomes available');
    assert.strictEqual(parentReplay.oneUse.events, 1, 'one exact award must authorize only one paid action');
    assert.strictEqual(parentReplay.oneUse.after - parentReplay.oneUse.before, 25);
    assert.strictEqual(parentReplay.badZone.events, 0, 'an exact award must not bypass action conditions');
    assert.strictEqual(parentReplay.badZone.after, parentReplay.badZone.before);
    assert.deepStrictEqual(parentReplay.orderedTypes.slice(0, 2), ['ve_enchant', 'rest_complete'], 'VM and VE operations in one block must follow tx/op chronology');
    assert.ok(parentReplay.storedOutcome > 0, 'confirmed outcomes must survive checkpoint reload for UI/polling races');

    const archiveRetry = await evaluate(cdp, `(new Promise(function(resolve) {
      var cfg = VizMagicConfig;
      var blockNum = cfg.PAID_ACTIONS.V2_ACTIVATION_BLOCK + 50;
      StateEngine.reset();
      var state = StateEngine.getState();
      var ch = CharacterSystem.createCharacter('alice', 'Alice', 'embercaster', blockNum); ch.currentZone = 'commons_first_light'; ch.pot = 1000; ch.res = 1000; ch.hp = ch.maxHp = 10000;
      var archiveWand = ItemSystem.createItem('oak_wand', 'alice', 1, blockNum, '', false); archiveWand.id = 'archive-wand';
      var archiveRune = ItemSystem.createItem('fire_rune', 'alice', 0, blockNum, '', false); archiveRune.id = 'archive-rune';
      state.characters.alice = ch; state.inventories.alice = [archiveWand, archiveRune];
      var payload = { p: cfg.PROTOCOLS.VM, v: 2, t: cfg.ACTION_TYPES.HUNT, d: { creature: 'ember_wisp', zone: 'commons_first_light', spell: 'firebolt', energy: 100 } };
      var req = ActionProof.getRequirement({ version: 2, type: payload.t, data: payload.d });
      var customRaw = { id: cfg.PROTOCOLS.VM, required_regular_auths: ['alice'], required_active_auths: [], json: JSON.stringify(payload) };
      var awardRaw = { initiator: 'alice', receiver: req.receiver, energy: req.energy, memo: req.memo, beneficiaries: [] };
      var customEvent = { id: 'vm-1', blockNum: blockNum, txIndex: 0, opIndex: 1, opType: 'custom', protocol: cfg.PROTOCOLS.VM, raw: customRaw, block_id: 'archive-block', previous: 'archive-entropy' };
      var awardEvent = { id: 'award-1', blockNum: blockNum, txIndex: 0, opIndex: 0, opType: 'award', protocol: 'award', raw: awardRaw, block_id: 'archive-block', previous: 'archive-entropy' };
      var veRaw = { id: cfg.PROTOCOLS.VE, required_regular_auths: ['alice'], required_active_auths: [], json: JSON.stringify({ v: 1, e: 'enchant', d: { item_ref: archiveWand.id, rune_type: 'fire_rune', rune_ref: archiveRune.id } }) };
      var veEvent = { id: 've-1', blockNum: blockNum, txIndex: 1, opIndex: 0, opType: 'custom', protocol: cfg.PROTOCOLS.VE, raw: veRaw, block_id: 'archive-block', previous: 'archive-entropy' };
      var originalRange = HistorySource.getAllEventsRange;
      var originalGetBlock = HistorySource.getBlock;
      var originalGetProofBlock = HistorySource.getProofBlock;
      var originalGetArchiveHead = HistorySource.getArchiveHead;
      var protocolRequested = '';
      var rangeCalls = 0;
      var archiveHead = blockNum - 1;
      HistorySource.getAllEventsRange = function(_options, callback) { rangeCalls++; callback(null, [customEvent]); };
      HistorySource.getBlock = function(_number, callback) { callback(new Error('fixture proof unavailable')); };
      HistorySource.getProofBlock = function(_number, callback) { callback(new Error('fixture proof unavailable')); };
      HistorySource.getArchiveHead = function(callback) { callback(null, archiveHead); };
      App.processArchiveEventBatch(blockNum, blockNum, blockNum, function(staleUsed) {
        var stale = { used: staleUsed, rangeCalls: rangeCalls, head: StateEngine.getState().headBlock };
        archiveHead = blockNum;
        App.processArchiveEventBatch(blockNum, blockNum, blockNum, function(firstUsed) {
          var afterMissing = { used: firstUsed, head: StateEngine.getState().headBlock, xp: StateEngine.getCharacter('alice').xp };
          HistorySource.getAllEventsRange = function(options, callback) { protocolRequested = options.protocol; callback(null, [veEvent, customEvent, awardEvent]); };
          App.processArchiveEventBatch(blockNum, blockNum, blockNum, function(secondUsed) {
            var afterRetry = { used: secondUsed, head: StateEngine.getState().headBlock, xp: StateEngine.getCharacter('alice').xp, enchanted: archiveWand.enchantments && archiveWand.enchantments.length === 1 };
            HistorySource.getAllEventsRange = originalRange;
            HistorySource.getBlock = originalGetBlock;
            HistorySource.getProofBlock = originalGetProofBlock;
            HistorySource.getArchiveHead = originalGetArchiveHead;
            resolve({ protocol: protocolRequested, stale: stale, missing: afterMissing, retry: afterRetry });
          });
        });
      });
    }))`);
    assert.ok(/VM/.test(archiveRetry.protocol) && /V/.test(archiveRetry.protocol) && /VE/.test(archiveRetry.protocol) && /award/.test(archiveRetry.protocol), 'archive catch-up must request VM, V, VE and award records');
    assert.deepStrictEqual(archiveRetry.stale, { used: false, rangeCalls: 0, head: 0 }, 'an archive behind the requested range must fall back without reading or advancing it');
    assert.deepStrictEqual(archiveRetry.missing, { used: false, head: 0, xp: 0 }, 'incomplete archive/RPC proof must not advance the contiguous head');
    assert.strictEqual(archiveRetry.retry.used, true);
    assert.strictEqual(archiveRetry.retry.head, 83500050);
    assert.strictEqual(archiveRetry.retry.xp, 25, 'later complete archive retry must process the previously unconsumed operation');
    assert.strictEqual(archiveRetry.retry.enchanted, true, 'archive catch-up must preserve VE operations alongside VM and awards');

    const uiRace = await evaluate(cdp, `(function() {
      var cfg = VizMagicConfig;
      var blockNum = cfg.PAID_ACTIONS.V2_ACTIVATION_BLOCK + 70;
      StateEngine.reset();
      var state = StateEngine.getState();
      var ch = CharacterSystem.createCharacter('alice', 'Alice', 'embercaster', blockNum); ch.currentZone = 'commons_first_light'; ch.pot = 1000; ch.res = 1000; ch.hp = ch.maxHp = 10000;
      state.characters.alice = ch; state.inventories.alice = [];
      var payload = { p: cfg.PROTOCOLS.VM, v: 2, t: cfg.ACTION_TYPES.HUNT, d: { creature: 'ember_wisp', zone: 'commons_first_light', spell: 'firebolt', energy: 100 } };
      var req = ActionProof.getRequirement({ version: 2, type: payload.t, data: payload.d });
      var raw = { block_id: 'ui-race', previous: 'ui-race-entropy', timestamp: '2026-09-05T12:00:00', transactions: [{ operations: [
        ['award', { initiator: 'alice', receiver: req.receiver, energy: req.energy, memo: req.memo }],
        ['custom', { id: cfg.PROTOCOLS.VM, required_regular_auths: ['alice'], json: JSON.stringify(payload) }]
      ] }] };
      var processed = BlockProcessor.processBlock(raw, blockNum);
      StateEngine.processBlock(processed); // polling wins the race
      var xpBeforeClick = StateEngine.getCharacter('alice').xp;
      var originalAccount = VizAccount;
      var originalBroadcast = VizBroadcast;
      var originalHistory = HistorySource;
      VizAccount = Object.assign({}, originalAccount, {
        getCurrentUser: function() { return 'alice'; },
        getAccount: function(_user, callback) { callback(null, {}); },
        calculateCurrentEnergy: function() { return 10000; },
        updateGrimoire: function(_data, callback) { if (callback) callback(null, {}); }
      });
      VizBroadcast = Object.assign({}, originalBroadcast, {
        huntAction: function(_creature, _zone, _spell, _energy, _author, callback) { callback(null, { block_num: blockNum }); }
      });
      HistorySource = Object.assign({}, originalHistory, { getBlock: function(_number, callback) { callback(null, raw); } });
      Helpers.setLang('en');
      HuntScreen.render();
      document.querySelector('.creature-card[data-id="ember_wisp"]').click();
      document.querySelector('.hunt-power-btn[data-energy="100"]').click();
      document.getElementById('btn-attack').click();
      var resultText = document.getElementById('hunt-result').textContent;
      var xpAfterClick = StateEngine.getCharacter('alice').xp;
      var pollingFirst = { before: xpBeforeClick, after: xpAfterClick, text: resultText, head: StateEngine.getState().headBlock };

      StateEngine.reset();
      state = StateEngine.getState();
      ch = CharacterSystem.createCharacter('alice', 'Alice', 'embercaster', blockNum + 1); ch.currentZone = 'commons_first_light'; ch.pot = 1000; ch.res = 1000; ch.hp = ch.maxHp = 10000;
      state.characters.alice = ch; state.inventories.alice = [];
      blockNum += 1;
      raw = { block_id: 'ui-first-race', previous: '000000000000000000000000ui-first', timestamp: '2026-09-05T12:00:00', transactions: [{ operations: [
        ['award', { initiator: 'alice', receiver: req.receiver, energy: req.energy, memo: req.memo }],
        ['custom', { id: cfg.PROTOCOLS.VM, required_regular_auths: ['alice'], json: JSON.stringify(payload) }]
      ] }] };
      var uiFirstProcessed = BlockProcessor.processBlock(raw, blockNum);
      HuntScreen.render();
      document.querySelector('.creature-card[data-id="ember_wisp"]').click();
      document.querySelector('.hunt-power-btn[data-energy="100"]').click();
      document.getElementById('btn-attack').click();
      var uiFirst = {
        xpAfterClick: StateEngine.getCharacter('alice').xp,
        headAfterClick: StateEngine.getState().headBlock,
        text: document.getElementById('hunt-result').textContent
      };
      StateEngine.processBlock(uiFirstProcessed);
      uiFirst.xpAfterPoll = StateEngine.getCharacter('alice').xp;
      uiFirst.headAfterPoll = StateEngine.getState().headBlock;

      VizAccount = originalAccount; VizBroadcast = originalBroadcast; HistorySource = originalHistory;
      return { pollingFirst: pollingFirst, uiFirst: uiFirst };
    })()`);
    assert.strictEqual(uiRace.pollingFirst.before, 25);
    assert.strictEqual(uiRace.pollingFirst.after, 25, 'actual Hunt click handler must retrieve the stored outcome without double-applying it');
    assert.ok(uiRace.pollingFirst.text && !/blocked|pending/i.test(uiRace.pollingFirst.text), 'actual Hunt click flow must render the already-confirmed outcome');
    assert.strictEqual(uiRace.pollingFirst.head, 83500070);
    assert.strictEqual(uiRace.uiFirst.xpAfterClick, 25);
    assert.strictEqual(uiRace.uiFirst.headAfterClick, 0, 'UI-first confirmation must not advance the contiguous polling cursor over unseen blocks');
    assert.strictEqual(uiRace.uiFirst.xpAfterPoll, 25, 'later polling must not double-apply an operation first seen by the UI');
    assert.strictEqual(uiRace.uiFirst.headAfterPoll, 83500071);
    assert.ok(uiRace.uiFirst.text && !/blocked|pending/i.test(uiRace.uiFirst.text));

    const keyUi = await evaluate(cdp, `(function() {
      var sessionKey = VizMagicConfig.STORAGE_PREFIX + 'session';
      var safeKey = VizMagicConfig.STORAGE_PREFIX + 'session_safe';
      localStorage.removeItem(sessionKey); sessionStorage.removeItem(safeKey);
      localStorage.setItem(sessionKey, JSON.stringify({ currentUser: 'alice', users: { alice: { regular_key: '5K-regular-fixture', active_key: '5K-active-fixture' } } }));
      VizAccount.init();
      var migrated = JSON.parse(localStorage.getItem(sessionKey));
      var migration = { loggedIn: !!VizAccount.isLoggedIn(), activeInMemory: VizAccount.getActiveKey() === '5K-active-fixture', persistedActive: !!migrated.users.alice.active_key, persistence: VizAccount.isActiveKeyPersistenceEnabled() };
      var originalGetAccounts = viz.api.getAccounts;
      var originalValid = viz.auth.wifIsValid;
      viz.api.getAccounts = function(_accounts, callback) { callback(null, [{ active_authority: { weight_threshold: 1, key_auths: [['PUB', 1]] } }]); };
      viz.auth.wifIsValid = function() { return true; };
      Helpers.setLang('ru');
      GuildScreen.render();
      var initialCheckbox = document.getElementById('guild-active-key-persist');
      var initial = { exists: !!initialCheckbox, checked: initialCheckbox.checked, hasInput: !!document.getElementById('input-active-key') };
      initialCheckbox.click();
      document.getElementById('btn-save-active-key').click();
      var persisted = JSON.parse(localStorage.getItem(sessionKey));
      var optedIn = !!persisted.users.alice.active_key && VizAccount.isActiveKeyPersistenceEnabled();

      var originalSetItem = Storage.prototype.setItem;
      var failureToast = '';
      var originalToastError = Toast.error;
      Toast.error = function(message) { failureToast = String(message || ''); };
      Storage.prototype.setItem = function(key, value) {
        if (this === localStorage && key === sessionKey) throw new Error('quota fixture');
        return originalSetItem.call(this, key, value);
      };
      var persistenceBox = document.getElementById('guild-active-key-persist');
      if (persistenceBox.checked) persistenceBox.click();
      document.getElementById('btn-save-active-key').click();
      Storage.prototype.setItem = originalSetItem;
      Toast.error = originalToastError;
      var safe = JSON.parse(sessionStorage.getItem(safeKey));
      var failed = { loggedIn: !!VizAccount.isLoggedIn(), localRemoved: localStorage.getItem(sessionKey) === null, safeRegular: safe.users.alice.regular_key === '5K-regular-fixture', safeActive: !!safe.users.alice.active_key, toast: failureToast, checked: document.getElementById('guild-active-key-persist').checked };
      VizAccount.init();
      var reload = { loggedIn: !!VizAccount.isLoggedIn(), active: !!VizAccount.getActiveKey() };
      viz.api.getAccounts = originalGetAccounts;
      viz.auth.wifIsValid = originalValid;
      return { migration: migration, initial: initial, optedIn: optedIn, failed: failed, reload: reload };
    })()`);
    assert.deepStrictEqual(keyUi.migration, { loggedIn: true, activeInMemory: true, persistedActive: false, persistence: false });
    assert.deepStrictEqual(keyUi.initial, { exists: true, checked: false, hasInput: true }, 'actual Guild UI must expose unchecked consent even when a migrated key remains in memory');
    assert.strictEqual(keyUi.optedIn, true, 'actual checkbox/save click must be the only path that persists the active key');
    assert.strictEqual(keyUi.failed.loggedIn, true, 'storage failure must preserve the regular login in memory');
    assert.strictEqual(keyUi.failed.localRemoved, true, 'storage failure must fail closed for the active key');
    assert.strictEqual(keyUi.failed.safeRegular, true);
    assert.strictEqual(keyUi.failed.safeActive, false);
    assert.ok(keyUi.failed.toast.length > 0, 'actual UI must report storage failure honestly');
    assert.strictEqual(keyUi.failed.checked, false);
    assert.deepStrictEqual(keyUi.reload, { loggedIn: true, active: false }, 'safe session fallback must survive reload without forcing regular relogin or retaining active key');

    const metadataStartup = await evaluate(cdp, `(new Promise(function(resolve) {
      var originalAccount = VizAccount;
      var metadata = JSON.stringify({ v: 3, character: { className: 'embercaster', level: 99, xp: 999999, inventory: [{ id: 'forged-item' }] } });
      var accountData = { custom_sequence_block_num: 10, custom_sequence: 1, viz_magic_grimoire: metadata, vesting_shares: '0.000000 SHARES', delegated_vesting_shares: '0.000000 SHARES', received_vesting_shares: '0.000000 SHARES' };
      StateEngine.reset();
      VizAccount = Object.assign({}, originalAccount, {
        getCurrentUser: function() { return 'metadata-only'; },
        login: function(_user, _key, callback) { callback(null, accountData); },
        getAccount: function(_user, callback) { callback(null, accountData); }
      });
      LoginScreen.render();
      document.getElementById('login-account').value = 'metadata-only';
      document.getElementById('login-key').value = 'fixture-regular-key';
      document.getElementById('login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      var state = StateEngine.getState();
      originalAccount.setProgressionRecoveryPending('alice', true);
      originalAccount.updateGrimoire.call(originalAccount, { level: 2 }, function(writeErr) {
        var hint = state.accountHints && state.accountHints['metadata-only'];
        var recovery = StateEngine.getRecoveryStatus('metadata-only');
        VizAccount = originalAccount;
        resolve({
          hasCharacter: !!state.characters['metadata-only'],
          hasForgedInventory: !!(state.inventories['metadata-only'] && state.inventories['metadata-only'].length),
          hintSource: hint && hint.provenance,
          recovery: recovery.status,
          writeError: writeErr && writeErr.message,
          screen: App.getCurrentScreen()
        });
      });
    }))`);
    assert.strictEqual(metadataStartup.hasCharacter, false, 'metadata must not create a character');
    assert.strictEqual(metadataStartup.hasForgedInventory, false, 'metadata must not create inventory');
    assert.strictEqual(metadataStartup.hintSource, 'metadata-unverified');
    assert.strictEqual(metadataStartup.recovery, 'pending');
    assert.strictEqual(metadataStartup.writeError, 'progression_recovery_pending');
    assert.strictEqual(metadataStartup.screen, 'home', 'real login handler should enter recovery-pending Home without trusting metadata');

    const veUi = await evaluate(cdp, `(function() {
      var blockNum = VizMagicConfig.PAID_ACTIONS.V2_ACTIVATION_BLOCK + 90;
      StateEngine.reset();
      var state = StateEngine.getState();
      var ch = CharacterSystem.createCharacter('alice', 'Alice', 'embercaster', blockNum); ch.mana = 0;
      var wand = ItemSystem.createItem('oak_wand', 'alice', 1, blockNum, '', false); wand.id = 'ui-wand';
      var rune = ItemSystem.createItem('fire_rune', 'alice', 0, blockNum, '', false); rune.id = 'ui-rune';
      var potion = { id: 'ui-mana-potion', type: 'mana_potion', name: 'Mana Potion', rarity: 0, consumed: false };
      state.characters.alice = ch; state.inventories.alice = [wand, rune, potion];
      var vePayload = { v: 1, e: 'enchant', d: { item_ref: wand.id, rune_type: rune.type, rune_ref: rune.id } };
      var raw = { block_id: 've-ui', previous: 've-ui-entropy', timestamp: '2026-09-05T12:00:00', transactions: [{ operations: [
        ['custom', { id: VizMagicConfig.PROTOCOLS.VE, required_regular_auths: ['alice'], json: JSON.stringify(vePayload) }]
      ] }] };
      var originalAccount = VizAccount;
      var originalMarket = MarketProtocol;
      var originalHistory = HistorySource;
      VizAccount = Object.assign({}, originalAccount, { getCurrentUser: function() { return 'alice'; } });
      MarketProtocol = Object.assign({}, originalMarket, { broadcastEnchant: function(_item, _type, _rune, callback) { callback(null, { block_num: blockNum }); } });
      HistorySource = Object.assign({}, originalHistory, { getBlock: function(_block, callback) { callback(null, raw); } });
      Helpers.setLang('en');
      CraftingScreen.render();
      document.querySelector('.craft-tab[data-tab="enchant"]').click();
      var reforgeDisabled = document.getElementById('btn-reforge').disabled;
      var potionButton = document.getElementById('screen-crafting').querySelector('.consumable-list .btn[disabled]');
      var potionDisabled = !!potionButton && potionButton.disabled && potionButton.getAttribute('aria-disabled') === 'true';
      document.getElementById('enchant-item-select').value = wand.id;
      document.getElementById('enchant-rune-select').value = rune.id;
      document.getElementById('btn-enchant-apply').click();
      var output = { reforgeDisabled: reforgeDisabled, potionDisabled: potionDisabled, potionText: potionButton ? potionButton.textContent : '', enchanted: wand.enchantments.length === 1, runeConsumed: rune.consumed === true, mana: ch.mana };
      VizAccount = originalAccount; MarketProtocol = originalMarket; HistorySource = originalHistory;
      return output;
    })()`);
    assert.deepStrictEqual({ reforgeDisabled: veUi.reforgeDisabled, potionDisabled: veUi.potionDisabled, enchanted: veUi.enchanted, runeConsumed: veUi.runeConsumed, mana: veUi.mana }, { reforgeDisabled: true, potionDisabled: true, enchanted: true, runeConsumed: true, mana: 0 }, 'actual Workshop clicks must apply rune-backed VE without fake mana and contain unsupported reforge/potion controls');
    assert.ok(/VIZ energy|chain energy|unavailable|cannot be verified|энерги|недоступ/i.test(veUi.potionText), 'disabled mana potion control must not promise VIZ energy restoration');

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
    const exceptionDetails = exceptions.map(event => {
      const details = event.params && event.params.exceptionDetails || {};
      return (details.exception && details.exception.description) || details.text || 'unknown exception';
    });
    assert.strictEqual(exceptions.length, 0, 'browser page must not report uncaught JavaScript exceptions: ' + JSON.stringify(exceptionDetails));
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
