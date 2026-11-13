'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
function load(c, f, expose) {
  let text=fs.readFileSync(path.join(root,'app/js',f),'utf8');
  if(expose){const p=text.lastIndexOf('    return {');text=text.slice(0,p)+'globalThis.fixture={'+expose+'};\n'+text.slice(p);}
  vm.runInContext(text,c,{filename:f});
}
function context(h=100) { const c=vm.createContext({console:{log(){},warn(){}},window:{},TextEncoder,Uint8Array,crypto:crypto.webcrypto,setTimeout(){},clearTimeout(){}});load(c,'config.js');c.VizMagicConfig.SECURITY_V3.ACTIVATION_BLOCK=h;return c; }
function engine(h=100,checkpoint) {
  const c=context(h);let saved;
  c.CheckpointSystem={init:cb=>cb(null),loadLatestCheckpoint:(s,cb)=>cb(null,checkpoint?{state:checkpoint}:null),saveCheckpoint:(s,b,state,cb)=>{saved=JSON.parse(JSON.stringify(state));cb(null);}};
  for(const f of ['formulas','magic-ledger','quest-system','guild','territory','world-boss','world-events','duel','duel-state','validator','action-proof','state-engine'])load(c,'engine/'+f+'.js');
  let error;c.StateEngine.init(e=>error=e);c.initError=error;c.saved=()=>saved;return c;
}
function block(n,actions=[],awards=[],timestamp='2026-01-01T00:00:00') {return {blockNum:n,blockHash:'0123456789abcdef'.repeat(4),timestamp,vmActions:actions.map((a,i)=>({sender:a.sender||'alice',action:{type:a.type,version:a.version===undefined?2:a.version,data:a.data||{}},txIndex:a.txIndex===undefined?0:a.txIndex,opIndex:i+1})),awards};}
function process(c,b){return c.StateEngine.processBlock(b,{runMaintenance:false});}
// Explicit drain: the production no-maintenance replay intentionally leaves head ownership to its caller.
function drain(c,b){const events=process(c,b);c.StateEngine.advanceHead(b.blockNum);return events;}
function seed(c){const s=c.StateEngine.getState();s.characters.alice={account:'alice',level:1,pot:10,res:5,school:'ignis'};s.characters.bob={account:'bob',level:1,pot:10,res:5,school:'aqua'};return s;}
function award(c,a,state,sender='alice',txIndex=0){return Object.assign({initiator:sender,txIndex},c.ActionProof.getRequirement({type:a.type,data:a.data||{}},state,sender));}
const json=x=>JSON.stringify(x);
let failed=0, passed=0;
function test(n,f){try{f();passed++;console.log('PASS '+n);}catch(e){failed++;console.error('FAIL '+n+': '+e.stack);}}
const pending=[];
function asyncTest(n,f){pending.push(Promise.resolve().then(f).then(()=>{passed++;console.log('PASS '+n);},e=>{failed++;console.error('FAIL '+n+': '+e.stack);}));}
test('activation disabled by default and exact H-1/H/H+1',()=>{const c=context(0);assert(!c.VizMagicConfig.SECURITY_V3.isActive(999999999));c.VizMagicConfig.SECURITY_V3.ACTIVATION_BLOCK=100;assert(!c.VizMagicConfig.SECURITY_V3.isActive(99));assert(c.VizMagicConfig.SECURITY_V3.isActive(100));assert(c.VizMagicConfig.SECURITY_V3.isActive(101));});
test('approval: historical open joins; signed officer invites consumed; revoked authority rejected',()=>{
 const c=engine();function guild(){return {id:'g',charter:{membership:'approval'},members:{owner:{rank:'founder'},low:{rank:'initiate'}},invites:{}};}
 assert(c.GuildSystem.joinGuild(guild(),'alice',99));
 for(const n of [100,101]){let g=guild();assert(!c.GuildSystem.joinGuild(g,'alice',n));assert(!c.GuildSystem.addInvite(g,'low','alice',n));assert(c.GuildSystem.addInvite(g,'owner','alice',n));g.members.owner.rank='initiate';assert(!c.GuildSystem.joinGuild(g,'alice',n));g.members.owner.rank='founder';assert(c.GuildSystem.joinGuild(g,'alice',n));assert(!g.invites.alice);assert(!c.GuildSystem.joinGuild(g,'alice',n));}
 const s=seed(c),g=guild();s.guilds.g=g;
 process(c,block(100,[{sender:'owner',type:'guild.invite',data:{guild_id:'g',target:'alice'}},{type:'guild.accept',data:{guild_id:'g'}}]));assert(g.members.alice);assert(!g.invites.alice);
});
test('boss: current author, 200bp, same-TX one-use, all mismatches and v1 rejected at H/H+1',()=>{
 for(const n of [99,100,101]){const c=engine(),s=seed(c);s.worldBoss=c.WorldBoss.spawnBoss(n,2,'custom-author');const a={type:'boss.attack',data:{spell:'attack'}};const req=award(c,a,s);assert.equal(req.receiver,'custom-author');assert.equal(req.energy,200);
 assert.equal(c.ActionProof.isPaidAction(a,n,s,'alice'),n>=100);
 if(n<100){assert(process(c,block(n,[a])).some(e=>e.type==='boss_attacked'));continue;}
 for(const change of [{receiver:'wrong'},{initiator:'bob'},{txIndex:1},{energy:199},{memo:'wrong'}])assert(!c.ActionProof.createVerifier([Object.assign({},req,change)],n).verify('alice',0,Object.assign({version:2},a),s).valid);
 assert(!c.ActionProof.createVerifier([req],n).verify('alice',0,Object.assign({version:1},a),s).valid);
 const ev=process(c,block(n,[a,a],[req]));assert.equal(ev.filter(e=>e.type==='boss_attacked').length,1);
 }
});
test('siege: historical arbitrary power retained; post-H exact anchored integer mana only',()=>{
 for(const n of [99,100,101]){const c=engine(),s=seed(c);s.guilds.g={id:'g',members:{alice:{rank:'founder'}}};s.territories=c.TerritorySystem.initTerritories(n);const t=s.territories.commons_first_light;const siege=c.TerritorySystem.declareSiege('commons_first_light','g',t,n);assert(siege);const a={type:'siege.commit',data:{siege_ref:siege.ref,energy:n<100?1000000:120}};
 if(n<100){assert(process(c,block(n,[a])).some(e=>e.type==='siege_contribution'));continue;}
 for(const energy of [0,-1,1.5,10001,1000000,'120'])assert.equal(c.ActionProof.getRequirement({type:a.type,data:{siege_ref:siege.ref,energy}},s,'alice'),null);
 const req=award(c,a,s);assert.equal(req.receiver,c.TerritorySystem.TERRITORY_ANCHORS.commons_first_light);assert.equal(req.energy,120);
 assert(!c.ActionProof.createVerifier([Object.assign({},req,{receiver:'wrong'})],n).verify('alice',0,Object.assign({version:2},a),s).valid);
 assert.equal(process(c,block(n,[a],[])).length,0);
 const ev=process(c,block(n,[a,a],[req]));assert.equal(ev.filter(e=>e.type==='siege_contribution').length,1);
 }
});
test('quests: real progress controls free versus existing 100bp penalty, not client flag',()=>{
 for(const n of [99,100,101])for(const progress of [0,1]){const c=engine(),s=seed(c);s.quests.alice={active:[{id:'q',objectives:[{current:progress}]}],completed:[]};const a={type:'quest.abandon',data:{quest_id:'q',penalty_energy:0}};
 if(n>=100&&!progress){assert.equal(c.StateEngine.processQuestAbandonResult('alice','q',n,0),null);assert.equal(process(c,block(n,[a])).length,0);assert.equal(s.quests.alice.active.length,1);const req=award(c,a,s);assert.equal(req.energy,100);assert.equal(req.receiver,'denis-skripnik');assert(!c.ActionProof.createVerifier([Object.assign({},req,{energy:99})],n).verify('alice',0,Object.assign({version:2},a),s).valid);assert(process(c,block(n,[a],[req])).some(e=>e.type==='quest_abandoned'));}
 else assert(process(c,block(n,[a])).some(e=>e.type==='quest_abandoned'));
 assert.equal(s.quests.alice.active.length,0);
 }
});
function duelFixture(created=100){const c=engine(),s=seed(c),hash=str=>c.DuelSystem.generateCommitHashSync(str);const strategy={intent:'strike',spell:'firebolt',energy:100,salt:'ab'.repeat(16)};let n=created;
 function act(sender,type,data){const b=block(n++,[{sender,type,data}]);b.blockHash='0'.repeat(64);return process(c,b);}
 act('alice','challenge',{target:'bob',strategy_hash:hash(strategy),rounds:3});act('bob','accept',{challenge_ref:String(created),strategy_hash:hash(strategy)});
 return {c,s,strategy,hash,act,ref:String(created)};
}
test('duel: immutable valid commits and canonical sender/round-bound reveals at H/H+1',()=>{
 for(const h of [100,101]){const {c,s,strategy,hash,act,ref}=duelFixture(h);const d=s.duels.active[ref];assert(d);
 const bad=Object.assign({},strategy,{energy:101});assert.equal(act('alice','reveal',{combat_ref:ref,round:1,strategy:bad}).length,0);assert.equal(act('mallory','reveal',{combat_ref:ref,round:1,strategy}).length,0);assert.equal(act('alice','reveal',{combat_ref:ref,round:2,strategy}).length,0);
 assert(act('alice','reveal',{combat_ref:ref,round:1,strategy}).length);assert.equal(act('alice','reveal',{combat_ref:ref,round:1,strategy}).length,0);act('bob','reveal',{combat_ref:ref,round:1,strategy});assert.equal(d.currentRound,2);
 assert.equal(act('alice','commit',{combat_ref:ref,round:3,strategy_hash:hash(strategy)}).length,0);assert.equal(act('alice','commit',{combat_ref:ref,round:2,strategy_hash:'bad'}).length,0);
 act('alice','commit',{combat_ref:ref,round:2,strategy_hash:hash(strategy)});assert.equal(act('alice','commit',{combat_ref:ref,round:2,strategy_hash:'f'.repeat(64)}).length,0);assert.equal(act('alice','reveal',{combat_ref:ref,round:2,strategy}).length,0);act('bob','commit',{combat_ref:ref,round:2,strategy_hash:hash(strategy)});
 act('alice','reveal',{combat_ref:ref,round:2,strategy});act('bob','reveal',{combat_ref:ref,round:2,strategy});
 if(s.duels.active[ref]){assert.equal(d.currentRound,3);for(const sender of ['alice','bob'])act(sender,'commit',{combat_ref:ref,round:3,strategy_hash:hash(strategy)});for(const sender of ['alice','bob'])act(sender,'reveal',{combat_ref:ref,round:3,strategy});}
 assert(!s.duels.active[ref]);assert.equal(s.duels.history.length,1);assert.equal(s.duels.history[0].rounds.length,3);
 }
});
test('duel: legacy pre-H duel completes across H; strict timeout and forfeit remain live',()=>{
 const {c,s,strategy,act,ref}=duelFixture(99);for(let round=1;round<=3&&s.duels.active[ref];round++){if(round>1)for(const sender of ['alice','bob'])act(sender,'commit',{combat_ref:ref,round,strategy_hash:'historical-unbound'});for(const sender of ['alice','bob'])act(sender,'reveal',{combat_ref:ref,round,strategy});}assert(!s.duels.active[ref]);assert.equal(s.duels.history.length,1);
 for(const mode of ['timeout','forfeit']){const f=duelFixture();if(mode==='timeout')assert(f.c.DuelStateManager.checkTimeouts(100000,f.s).length);else assert(f.act('alice','forfeit',{combat_ref:f.ref}).length);assert(!f.s.duels.active[f.ref]);}
});
asyncTest('SHA256 sync matches Node crypto and existing WebCrypto UI hash, Unicode and multi-block UTF8',async()=>{const c=context();load(c,'engine/duel.js');for(const spell of ['firebolt','🔥 русский 日本語','x'.repeat(200),'\ud800']){const s={spell,intent:'strike',energy:100,salt:'ab'.repeat(16)};const canonical=JSON.stringify({energy:100,intent:'strike',salt:'ab'.repeat(16),spell});const expected=crypto.createHash('sha256').update(canonical).digest('hex');assert.equal(c.DuelSystem.generateCommitHashSync(s),expected);assert.equal(await c.DuelSystem.generateCommitHash(s),expected);}});
test('weather and seasons: canonical UTC timestamp; historical wall clock remains separate',()=>{
 const c=context();load(c,'engine/world-events.js');const w=c.WorldEvents;const time='2026-01-01T00:00:00';for(const n of [100,101]){assert.equal(json(w.getCombatWeather(n,time)),json(w.getCurrentWeather(n,Date.parse(time+'Z'))));assert.equal(json(w.getSeasonalBonuses(n,time)),json(w.getSeasonalBonuses(n,time+'Z')));assert.throws(()=>w.getCombatWeather(n,''));assert.throws(()=>w.getSeasonalBonuses(n,''));}assert.doesNotThrow(()=>w.getCombatWeather(99,''));assert.doesNotThrow(()=>w.getSeasonalBonuses(99));
});
test('StateEngine timestamp failure is atomic; checkpoint gate preserves old progress and rejects unverified post-H',()=>{
 const c=engine(),s=seed(c);s.characters.alice.xp=123;const before=json(s);assert.throws(()=>process(c,block(100,[{type:'quest.abandon',data:{quest_id:'q'}}],[],'')),/timestamp_required/);assert.equal(json(s),before);
 drain(c,block(99));c.StateEngine.saveCheckpoint(()=>{});const old=c.saved();const resumed=engine(100,JSON.parse(json(old)));assert(!resumed.initError);assert.equal(resumed.StateEngine.getCharacter('alice').xp,123);drain(resumed,block(100));resumed.StateEngine.saveCheckpoint(()=>{});const modern=resumed.saved();assert.equal(modern.securityRulesVersion,3);assert(!engine(100,JSON.parse(json(modern))).initError);delete modern.securityRulesVersion;assert(engine(100,modern).initError);assert.equal(old.characters.alice.xp,123);
 const fresh=engine();seed(fresh).characters.alice.xp=123;drain(fresh,block(99));fresh.StateEngine.saveCheckpoint(()=>{});drain(fresh,block(100));fresh.StateEngine.saveCheckpoint(()=>{});for(const ch of Object.values(fresh.StateEngine.getState().characters))ch.progressionSource='legacy-checkpoint';assert.equal(json(fresh.StateEngine.getState()),json(resumed.StateEngine.getState()));
});
test('broadcast: boss, guild siege, paid quest atomic award + v2 VM; free quest and pre-H do not charge',()=>{
 const c=engine(),s=seed(c);s.headBlock=99;s.worldBoss=c.WorldBoss.spawnBoss(99,2,'custom-author');s.quests.alice={active:[{id:'q',objectives:[{current:0}]},{id:'free',objectives:[{current:1}]}]};s.territories=c.TerritorySystem.initTerritories(99);const siege=c.TerritorySystem.declareSiege('commons_first_light','g',s.territories.commons_first_light,99);
 let sent=[];c.VizAccount={getCurrentUser:()=> 'alice',getRegularKey:()=> 'synthetic-test-only',getAccountProtocol:(u,p,cb)=>cb(null,{custom_sequence_block_num:42})};c.viz={broadcast:{send:(tx,keys,cb)=>{sent.push(tx);cb(null,{block_num:100});},custom:(...args)=>{sent.push(args);args[args.length-1](null,{});}}};load(c,'blockchain/broadcast.js');load(c,'protocols/guild-protocol.js');load(c,'protocols/vm-protocol.js');
 for(const a of [{t:'boss.attack',d:{spell:'attack'}},{t:'quest.abandon',d:{quest_id:'q'}}])c.VizBroadcast.gameAction(a,e=>assert.ifError(e));c.GuildProtocol.broadcastSiegeCommit(siege.ref,70,e=>assert.ifError(e));
 assert.equal(sent.length,3);for(const tx of sent){assert.equal(tx.operations.length,2);assert.equal(tx.operations[0][0],'award');const op=tx.operations[1];assert.equal(op[0],'custom');const a=JSON.parse(op[1].json);assert.equal(a.v,2);assert.equal(a.b,42);assert.equal(op[1].required_regular_auths[0],'alice');assert.equal(tx.operations[0][1].initiator,'alice');}assert.equal(sent[0].operations[0][1].receiver,'custom-author');assert.equal(sent[1].operations[0][1].energy,100);assert.equal(sent[2].operations[0][1].receiver,'vm-commons');assert.equal(sent[2].operations[0][1].energy,70);
 sent=[];c.VizBroadcast.gameAction({t:'quest.abandon',d:{quest_id:'free'}},e=>assert.ifError(e));assert.equal(sent.length,1);assert(!sent[0].operations||sent[0].operations.every(op=>op[0]!=='award'));
 s.headBlock=98;sent=[];c.VizBroadcast.gameAction({t:'boss.attack',d:{}},e=>assert.ifError(e));assert.equal(sent.length,1);assert(!sent[0].operations||sent[0].operations.every(op=>op[0]!=='award'));
});
test('all new paid requirements reject missing/wrong sender, receiver, memo, energy, TX and reuse',()=>{
 const c=engine(),s=seed(c);s.worldBoss=c.WorldBoss.spawnBoss(100,2,'author');s.quests.alice={active:[{id:'q',objectives:[{current:0}]}]};s.territories=c.TerritorySystem.initTerritories(100);const siege=c.TerritorySystem.declareSiege('commons_first_light','g',s.territories.commons_first_light,100);
 for(const a of [{type:'boss.attack',version:2,data:{}},{type:'quest.abandon',version:2,data:{quest_id:'q'}},{type:'siege.commit',version:2,data:{siege_ref:siege.ref,energy:100}}])for(const n of [100,101]){const req=award(c,a,s);assert(!c.ActionProof.createVerifier([],n).verify('alice',0,a,s).valid);for(const change of [{receiver:'wrong'},{initiator:'wrong'},{txIndex:1},{energy:99},{memo:'wrong'}])assert(!c.ActionProof.createVerifier([Object.assign({},req,change)],n).verify('alice',0,a,s).valid);const verifier=c.ActionProof.createVerifier([req],n);assert(verifier.verify('alice',0,a,s).valid);assert(!verifier.verify('alice',0,a,s).valid);}
});
test('real CombatSystem and canonical StateEngine hunt ignore client wallclock at H/H+1',()=>{
 function run(now,height=100){const c=engine();vm.runInContext('Date.now = function(){return '+now+';}',c);for(const f of ['creatures','spells','regions'])load(c,'data/'+f+'.js');load(c,'engine/character.js');load(c,'engine/items.js');load(c,'engine/combat.js');const s=seed(c);s.inventories.alice=[];s.characters.alice=c.CharacterSystem.createCharacter('alice','Alice','embercaster',1);const spell=s.characters.alice.spells[0];const a={type:'hunt',data:{creature:'ember_wisp',zone:'commons_first_light',spell,energy:c.GameSpells.getSpell(spell).manaCost}};const req=award(c,a,s);const events=process(c,block(height,[a],[req]));assert(events.some(e=>e.type==='hunt_victory'||e.type==='hunt_defeat'));return json({character:s.characters.alice,events,inventory:s.inventories.alice});}
 for(const n of [100,101])assert.equal(run(Date.parse('2026-01-01Z'),n),run(Date.parse('2026-07-17Z'),n));
});
// Real Broadcast/BlockProcessor/StateEngine; transport callbacks contain no assertions.
function questUI(head=99) {
 const c=engine();vm.runInContext('Date.now = function(){return 1767225600000;}',c);const s=seed(c),x={transactions:[],callbacks:[],blocks:{},saves:0,extraCharges:0,fail:false,target:head+1};
 if(head>=100)drain(c,block(100));s.headBlock=head;s.quests.alice={active:[{id:'q',objectives:[{type:'social',target:'guild_join',current:0,required:1}]}],completed:[]};
 s.guilds.g={id:'g',charter:{membership:'approval'},members:{owner:{rank:'founder'},warden:{rank:'warden'}},invites:{}};
 c.CheckpointSystem.saveCheckpoint=(p,b,state,cb)=>{x.saves++;x.saved=json(state);x.savedHead=b;cb(null);};
 c.Helpers={t:k=>k,$:()=>null,bpToPercent:n=>String(n/100)};c.Toast={info(){},error(){}};c.SoundManager={play(){}};
 c.VizAccount={getCurrentUser:()=> 'alice',getRegularKey:()=> 'synthetic-test-only',getAccountProtocol:(u,p,cb)=>cb(null,{custom_sequence_block_num:0})};
 const transport=(tx,cb)=>{x.transactions.push(tx);x.callbacks.push(()=>cb(x.fail?new Error('synthetic failure'):null,(x.omitHeight?{}:{block_num:x.target})));};
 c.viz={broadcast:{send:(tx,keys,cb)=>transport(tx,cb),custom:(...args)=>transport({operations:[['custom',{required_regular_auths:args[1],id:args[2],json:args[3]}]]},args[args.length-1])}};
 load(c,'blockchain/broadcast.js');c.VizBroadcast.award=(...args)=>{x.extraCharges++;args[args.length-1](null,{});};load(c,'protocols/vm-protocol.js');load(c,'engine/block-processor.js');
 c.HistorySource={getProofBlock:(n,cb)=>cb(null,x.blocks[n]),getBlock:(n,cb)=>cb(null,x.blocks[n]),findAccountAction:(user,protocol,type,cb,matcher)=>cb(null,(x.candidates||[]).find(candidate=>!matcher||matcher(candidate))||null)};
 load(c,'ui/screens/quests.js','broadcast:_broadcastQuestAction,confirm:_confirmAbandonBlock,pending:function(){return Object.keys(pendingAbandons).length;}');
 x.c=c;x.s=s;x.send=()=>c.fixture.broadcast('abandon','q',false,0,100);x.reply=()=>x.callbacks.shift()();
 x.raw=(operations)=>({timestamp:'2026-01-01T00:00:00',witness_signature:'0123456789abcdef'.repeat(4),transactions:[{operations}]});
 x.custom=(sender,type,data)=>['custom',{required_regular_auths:[sender],id:c.VizMagicConfig.PROTOCOLS.VM,json:JSON.stringify({p:c.VizMagicConfig.PROTOCOLS.VM,v:2,b:0,t:type,d:data})}];
 x.poll=(start,end)=>{let error,done=false;c.setTimeout=f=>f();c.BlockProcessor.processBlockRange(start,end,p=>c.StateEngine.processBlock(p,{advanceHead:false,runMaintenance:false}),e=>{error=e;done=true;});assert(done);assert.ifError(error);c.StateEngine.advanceHead(end);c.StateEngine.saveCheckpoint(()=>{});c.QuestsScreen.render();};
 return x;
}
test('quest UI delayed callback cannot reorder demotion/invite/paid abandon or consume canonical operations',()=>{
 const x=questUI(100),control=questUI(100);x.target=102;x.send();
 x.blocks[101]=x.raw([x.custom('owner','guild.promote',{guild_id:'g',target:'warden',rank:'initiate'})]);
 x.blocks[102]=x.raw([x.custom('warden','guild.invite',{guild_id:'g',target:'alice'}),x.custom('alice','guild.accept',{guild_id:'g'}),...x.transactions[0].operations]);
 control.blocks=x.blocks; // HistorySource closes over each fixture's current block map.
 const before=json(x.s);x.reply();const callbackState=json(x.s),callbackSaves=x.saves;
 x.poll(101,102);control.poll(101,102);
 assert.deepStrictEqual(JSON.parse(json(x.s)),JSON.parse(json(control.s)),'entire canonical state must equal ordered replay control');
 assert.equal(callbackState,before,'callback alone must not mutate ANY world state or consume operations');assert.equal(callbackSaves,0);
 assert.equal(x.s.guilds.g.members.warden.rank,'initiate');assert(!x.s.guilds.g.members.alice);assert.equal(x.s.quests.alice.active.length,0);assert.equal(x.saves,1);assert.equal(x.savedHead,102);assert.equal(x.extraCharges,0);
});
test('quest UI confirms real atomic block only; missing proof/failure cannot optimistically remove/save/charge',()=>{
 const x=questUI();const before=json(x.s);x.send();assert.equal(x.transactions.length,1);x.reply();assert.equal(json(x.s),before);assert.equal(x.saves,0);assert.equal(x.extraCharges,0);
 // Missing proof in the canonical block cannot remove the quest.
 x.blocks[100]=x.raw(x.transactions[0].operations.filter(op=>op[0]!=='award'));x.poll(100,100);assert.equal(x.s.quests.alice.active.length,1);
 x.target=101;x.send();assert.equal(x.transactions.length,2);x.blocks[101]=x.raw(x.transactions[1].operations);x.reply();assert.equal(x.s.quests.alice.active.length,1);assert.equal(x.saves,1);
 x.poll(101,101);assert.equal(x.s.quests.alice.active.length,0);assert.equal(x.saves,2);assert.equal(x.extraCharges,0);
});
test('quest UI pending blocks duplicate broadcasts/awards; failed broadcast clears pending for retry',()=>{
 const x=questUI();x.send();x.send();assert.equal(x.transactions.length,1);x.reply();x.c.QuestsScreen.render();x.send();assert.equal(x.transactions.length,1);assert.equal(x.transactions.flatMap(t=>t.operations).filter(op=>op[0]==='award').length,1);assert.equal(x.extraCharges,0);
 const y=questUI();y.fail=true;y.send();y.reply();y.fail=false;y.send();assert.equal(y.transactions.length,2);assert.equal(y.s.quests.alice.active.length,1);assert.equal(y.saves,0);
});
test('quest UI canonical rejected abandonment stays active and can retry',()=>{
 const x=questUI(100);x.target=101;x.send();
 const operations=JSON.parse(json(x.transactions[0].operations));operations[0][1].receiver='wrong';
 x.blocks[101]=x.raw(operations);x.reply();x.poll(101,101);
 assert.equal(x.s.quests.alice.active.length,1);assert.equal(x.s.quests.alice.active[0].objectives[0].current,0);
 x.target=102;x.send();assert.equal(x.transactions.length,2);
 x.blocks[102]=x.raw(x.transactions[1].operations);x.reply();x.poll(102,102);assert.equal(x.s.quests.alice.active.length,0);assert.equal(x.extraCharges,0);
});
test('quest UI pre-H legacy callback removal/checkpoint/penalty stays unchanged',()=>{
 const x=questUI(97);x.send();x.reply();assert.equal(x.s.quests.alice.active.length,0);assert.equal(x.saves,1);assert.equal(x.extraCharges,1);
});
test('quest UI missing-height discovery accepts both real payload shapes, skips another quest, and permits rejected-action retry',()=>{
 for(const normalized of [false,true]){
  const x=questUI(100);x.omitHeight=true;x.target=101;x.send();
  const payload=normalized?{type:'quest.abandon',data:{quest_id:'q'}}:{t:'quest.abandon',d:{quest_id:'q'}};
  x.candidates=[{blockNum:102,payload:{t:'quest.abandon',d:{quest_id:'other'}}},{blockNum:101,payload}];
  const before=json(x.s);x.reply();assert.equal(json(x.s),before);assert.equal(x.saves,0);x.send();assert.equal(x.transactions.length,1);
  const ops=JSON.parse(json(x.transactions[0].operations));ops[0][1].receiver='wrong';x.blocks[101]=x.raw(ops);x.poll(101,101);
  assert.equal(x.s.quests.alice.active.length,1);x.send();assert.equal(x.transactions.length,2);assert.equal(x.extraCharges,0);
 }
});
test('quest UI clears missing-height pending after canonical removal even if history discovery is unavailable',()=>{
 const x=questUI(100);x.omitHeight=true;x.send();x.reply();assert.equal(x.c.fixture.pending(),1);
 x.blocks[101]=x.raw(x.transactions[0].operations);x.poll(101,101);assert.equal(x.s.quests.alice.active.length,0);assert.equal(x.c.fixture.pending(),0);
});
Promise.all(pending).then(()=>{console.log('RESULT '+passed+' passed, '+failed+' failed');if(failed)globalThis.process.exitCode=1;});
