'use strict';

var assert = require('assert');
var http = require('http');
var WebSocket = require('ws');
var CDP = 'http://127.0.0.1:18800';
var URL = process.env.VIZ_MAGIC_QA_URL || 'http://127.0.0.1:8218/?vt-magic-qa=1';

function request(method, url) {
    return new Promise(function(resolve, reject) {
        var req = http.request(url, { method: method }, function(res) {
            var body = '';
            res.on('data', function(chunk) { body += chunk; });
            res.on('end', function() {
                if (res.statusCode >= 400) return reject(new Error(res.statusCode + ' ' + body));
                try { resolve(JSON.parse(body)); } catch (_) { resolve(body); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function openTarget() {
    var target = await request('PUT', CDP + '/json/new?about:blank');
    var ws = new WebSocket(target.webSocketDebuggerUrl, { suppressOrigin: true });
    await new Promise(function(resolve, reject) { ws.once('open', resolve); ws.once('error', reject); });
    var seq = 0;
    var waiting = {};
    var events = [];
    ws.on('message', function(raw) {
        var msg = JSON.parse(String(raw));
        if (!msg.id) { events.push(msg); return; }
        if (!waiting[msg.id]) return;
        var waiter = waiting[msg.id]; delete waiting[msg.id];
        if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
        else waiter.resolve(msg.result || {});
    });
    function send(method, params) {
        return new Promise(function(resolve, reject) {
            var id = ++seq; waiting[id] = { resolve: resolve, reject: reject };
            ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
        });
    }
    return { target: target, ws: ws, send: send, events: events };
}

async function evalValue(cdp, expression) {
    var result = await cdp.send('Runtime.evaluate', { expression: expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ' ' + JSON.stringify(result.exceptionDetails.exception || {}));
    return result.result && result.result.value;
}

async function click(cdp, selector) {
    var point = await evalValue(cdp, `(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;if(e.classList.contains('nav-tab')&&e.parentElement){e.parentElement.scrollIntoView({block:'end'});e.parentElement.scrollLeft=e.offsetLeft-e.parentElement.clientWidth/2+e.clientWidth/2;}else e.scrollIntoView({block:'center',inline:'center'});var r=e.getBoundingClientRect(),x=Math.max(1,Math.min(innerWidth-2,r.left+r.width/2)),y=Math.max(1,Math.min(innerHeight-2,r.top+r.height/2)),top=document.elementFromPoint(x,y);return{x:x,y:y,disabled:!!e.disabled,target:e.getAttribute('data-screen')||e.id||e.className,top:top&&(top.getAttribute('data-screen')||top.id||top.className)};})()`);
    assert.ok(point, 'missing click target ' + selector);
    assert.strictEqual(point.disabled, false, 'click target disabled ' + selector);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    return point;
}

(async function() {
    var cdp = await openTarget();
    try {
        await cdp.send('Runtime.enable');
        await cdp.send('Log.enable');
        await cdp.send('Page.enable');
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await cdp.send('Network.setBlockedURLs', { urls: ['*://api.viz.world/*', '*://node.viz.cx/*', '*://viz-node.dpos.space/*', '*://vizmagic.web3blind.xyz/archive-mirror/*'] });
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "if('serviceWorker'in navigator){Object.defineProperty(Object.getPrototypeOf(navigator.serviceWorker),'register',{configurable:true,value:function(){return Promise.resolve({});}});}" });
        await cdp.send('Page.navigate', { url: URL });
        var ready = false;
        for (var i = 0; i < 30; i++) {
            await new Promise(function(resolve) { setTimeout(resolve, 250); });
            try { ready = await evalValue(cdp, "typeof WalletScreen!=='undefined'&&typeof MagicLedger!=='undefined'&&typeof App!=='undefined'"); } catch (_) { ready = false; }
            if (ready) break;
        }
        assert.strictEqual(ready, true, 'VT/MAGIC UI modules must load');
        await evalValue(cdp, `(function(){
            StateEngine.reset();
            var s=StateEngine.getState();
            s.magic.balances.alice=2000;s.magic.supplyMilli=2000;s.magic.finalizedBlock=83500001;
            s.inventories.alice=[];s.inventories.seller=[{id:'qa-item',type:'oak_wand',rarity:0,stats:{},owner:'seller',listed:true,equipped:false,consumed:false}];
            s.marketplace={listings:{qa_listing:{ref:'qa_listing',itemRef:'qa-item',itemType:'oak_wand',itemRarity:0,itemStats:{},seller:'seller',price:1250,priceMilli:1250,revision:1,payment:'magic',listedBlock:83500001,expiresBlock:0,state:'active',buyer:null,soldBlock:0}},history:[],priceHistory:{}};
            MarketplaceEngine.setMarketState(s.marketplace);
            VizAccount.getCurrentUser=function(){return 'alice';};
            VizAccount.isLoggedIn=function(){return true;};
            VizAccount.hasActiveKey=function(){return false;};
            VizAccount.getAccount=function(name,cb){name==='bob'?cb(null,{name:'bob'}):cb(new Error('fixture-not-found'));};
            VizBroadcast.tokenAction=function(action,cb){window.__vtSend=action;cb(null,{});};
            App.navigateTo('home');NavComponent.render();return true;
        })()`);

        await click(cdp, '.nav-tab[data-screen="wallet"]');
        var wallet = await evalValue(cdp, `(function(){var burn=document.querySelector('#magic-mint-transfer-form button[type=submit]');return{screen:App.getCurrentScreen(),heading:document.querySelector('#screen-wallet h1').textContent,balance:document.querySelector('#magic-balance').textContent,burnDisabled:burn.disabled,hasConsent:!!document.querySelector('#magic-burn-consent'),regularCopy:document.querySelector('#screen-wallet').textContent.indexOf('regular authority')>=0};})()`);
        assert.deepStrictEqual(wallet, { screen: 'wallet', heading: 'Кошелёк', balance: '2.000 MAGIC', burnDisabled: true, hasConsent: true, regularCopy: true });

        await evalValue(cdp, `(function(){document.querySelector('#magic-send-to').value='<script>';document.querySelector('#magic-send-amount').value='1.000';return true;})()`);
        await click(cdp, '#magic-send-form button[type="submit"]');
        var invalidShown = await evalValue(cdp, "document.body.textContent.indexOf('Проверьте аккаунт, точную сумму и баланс MAGIC.')>=0");
        assert.strictEqual(invalidShown, true, 'invalid account must fail visibly without broadcast');

        await evalValue(cdp, `(function(){document.querySelector('#magic-send-to').value='bob';document.querySelector('#magic-send-amount').value='0.500';return true;})()`);
        await click(cdp, '#magic-send-form button[type="submit"]');
        await click(cdp, '#modal-container [data-action="0"]');
        var sent = await evalValue(cdp, `(function(){var before={alice:StateEngine.getMagicBalance('alice'),bob:StateEngine.getMagicBalance('bob')};var parsed=VTProtocol.parseAction(window.__vtSend);var processed={blockNum:83500002,blockHash:'qa-transfer-block',irreversible:true,awards:[],veEvents:[],voicePosts:[],vmActions:[],transfers:[],fixedAwards:[],burnProofs:[],vtActions:[{sender:'alice',txId:'qa-transfer-tx',txIndex:0,opIndex:0,regularAuths:['alice'],activeAuths:[],action:parsed}]};StateEngine.processBlock(processed);return{before:before,action:{to:parsed.data.to,amount:parsed.data.amount_milli},after:{alice:StateEngine.getMagicBalance('alice'),bob:StateEngine.getMagicBalance('bob')},history:StateEngine.getMagicHistory('alice',0,10).map(function(x){return x.type;})};})()`);
        assert.deepStrictEqual(sent, { before: { alice: 2000, bob: 0 }, action: { to: 'bob', amount: 500 }, after: { alice: 1500, bob: 500 }, history: ['transfer'] });

        await evalValue(cdp, `(function(){
            var toast=document.getElementById('toast-container');if(toast)toast.remove();
            var s=StateEngine.getState();
            s.inventories.seller[0].listed=false;
            MarketplaceEngine.setMarketState({listings:{},history:[],priceHistory:{}});
            var made=MarketplaceEngine.createListing('seller',s.inventories.seller[0],1250,83500001,0,1);
            s.marketplace=MarketplaceEngine.getMarketState();window.__listingRef=made.listing.ref;
            MarketProtocol.broadcastBuy=function(ref,rev,price,cb){window.__vtBuy={ref:ref,rev:rev,price:price};cb(null,{});};return made.success;
        })()`);
        var marketNavPoint = await click(cdp, '.nav-tab[data-screen="marketplace"]');
        var marketDebug = await evalValue(cdp, `(function(){return{screen:App.getCurrentScreen(),user:VizAccount.getCurrentUser(),listings:MarketplaceEngine.getListings({}).map(function(x){return{ref:x.ref,payment:x.payment,state:x.state,seller:x.seller};}),text:document.querySelector('#screen-marketplace').textContent.slice(0,300)};})()`);
        if (!marketDebug.listings.length) throw new Error('Bazaar fixture missing after navigation: ' + JSON.stringify(marketDebug));
        if (!await evalValue(cdp, "!!document.querySelector('.market-buy-btn')")) throw new Error('Bazaar buy control missing: ' + JSON.stringify({ market: marketDebug, click: marketNavPoint }));
        await click(cdp, '.market-buy-btn');
        await click(cdp, '#modal-container [data-action="0"]');
        var purchase = await evalValue(cdp, `(function(){var s=StateEngine.getState();return{call:window.__vtBuy,buyer:s.magic.balances.alice,seller:s.magic.balances.seller||0,owner:s.inventories.seller[0].owner,screen:App.getCurrentScreen()};})()`);
        assert.deepStrictEqual(purchase, { call: { ref: '83500001_qa-item', rev: 1, price: 1250 }, buyer: 1500, seller: 0, owner: 'seller', screen: 'marketplace' });
        var settled = await evalValue(cdp, `(function(){var parsed=VTProtocol.parseAction(VTProtocol.createBazaarBuyAction(window.__listingRef,1,1250));StateEngine.processBlock({blockNum:83500003,blockHash:'qa-buy-block',irreversible:true,awards:[],veEvents:[],voicePosts:[],vmActions:[],transfers:[],fixedAwards:[],burnProofs:[],vtActions:[{sender:'alice',txId:'qa-buy-tx',txIndex:0,opIndex:0,regularAuths:['alice'],activeAuths:[],action:parsed}]});var s=StateEngine.getState();var bought=(s.inventories.alice||[]).filter(function(x){return x.id==='qa-item';})[0];return{alice:StateEngine.getMagicBalance('alice'),bob:StateEngine.getMagicBalance('bob'),seller:StateEngine.getMagicBalance('seller'),owner:bought&&bought.owner,supply:s.magic.supplyMilli,listing:MarketplaceEngine.getMarketState().listings[window.__listingRef].state,history:StateEngine.getMagicHistory('alice',0,10).map(function(x){return x.type;})};})()`);
        assert.deepStrictEqual(settled, { alice: 250, bob: 500, seller: 1250, owner: 'alice', supply: 2000, listing: 'sold', history: ['trade', 'transfer'] });
        var serious = cdp.events.filter(function(event) {
            return event.method === 'Runtime.exceptionThrown' ||
                (event.method === 'Runtime.consoleAPICalled' && event.params && event.params.type === 'error') ||
                (event.method === 'Log.entryAdded' && event.params && event.params.entry && event.params.entry.level === 'error');
        });
        assert.deepStrictEqual(serious, [], 'wallet/Bazaar click flow must not emit uncaught or console errors');
        console.log('PASS Chromium CDP two-account MAGIC transfer and atomic Bazaar handler flow');
    } finally {
        try { cdp.ws.close(); } catch (_) {}
        try { await request('GET', CDP + '/json/close/' + encodeURIComponent(cdp.target.id)); } catch (_) {}
    }
}()).catch(function(err) { console.error(err && err.stack || err); process.exit(1); });
