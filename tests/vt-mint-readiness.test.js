'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
function source(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

function loadBroadcast(options) {
    options = options || {};
    var sent = [];
    var context = {
        console: { log: function() {} },
        JSON: JSON,
        Number: Number,
        Math: Math,
        Date: Date,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        VizAccount: {
            getCurrentUser: function() { return 'alice'; },
            getRegularKey: function() { return 'regular-fixture'; },
            getActiveKey: function() { return 'active-fixture'; }
        },
        HistorySource: {
            checkMagicMintReadiness: function(activation, lib, callback) {
                if (options.archiveError) return callback(new Error(options.archiveError));
                callback(null, options.archiveState || { ready: true, activationBlock: activation, irreversibleBlock: lib });
            }
        },
        viz: {
            api: {
                getDynamicGlobalProperties: function(callback) {
                    if (options.dgpError) return callback(new Error(options.dgpError));
                    callback(null, options.dgp || { head_block_number: 120, last_irreversible_block_num: 110 });
                }
            },
            broadcast: {
                send: function(tx, keys, callback) { sent.push({ tx: tx, keys: keys }); callback(null, { fixture: true }); },
                custom: function() { throw new Error('unexpected custom broadcast'); }
            }
        }
    };
    vm.createContext(context);
    vm.runInContext(source('app/js/config.js'), context, { filename: 'config.js' });
    context.VizMagicConfig.TOKEN.ACTIVATION_BLOCK = 100;
    vm.runInContext(source('app/js/protocols/vt-protocol.js'), context, { filename: 'vt-protocol.js' });
    vm.runInContext(source('app/js/blockchain/broadcast.js'), context, { filename: 'broadcast.js' });
    return { context: context, sent: sent };
}

function invoke(ctx, method) {
    return new Promise(function(resolve) {
        var args = method === 'mintMagicAward' ? ['intent', 100] :
            method === 'mintMagicFixedAward' ? ['intent', '1.000', 500] : ['intent', '1.000'];
        args.push(function(err, result) { resolve({ err: err, result: result }); });
        ctx.VizBroadcast[method].apply(ctx.VizBroadcast, args);
    });
}

(async function() {
    var methods = ['mintMagicAward', 'mintMagicFixedAward', 'mintMagicTransfer'];
    for (var i = 0; i < methods.length; i += 1) {
        var before = loadBroadcast({ dgp: { head_block_number: 99, last_irreversible_block_num: 99 } });
        var blockedBefore = await invoke(before.context, methods[i]);
        assert.strictEqual(blockedBefore.err && blockedBefore.err.code, 'magic_activation_pending');
        assert.strictEqual(blockedBefore.err && blockedBefore.err.broadcastAttempted, false);
        assert.strictEqual(before.sent.length, 0, methods[i] + ' must not broadcast before token genesis');

        var missingLib = loadBroadcast({ dgp: { head_block_number: 120 } });
        var blockedLib = await invoke(missingLib.context, methods[i]);
        assert.strictEqual(blockedLib.err && blockedLib.err.code, 'authoritative_lib_unavailable');
        assert.strictEqual(missingLib.sent.length, 0, methods[i] + ' must not broadcast without authoritative LIB');

        var unhealthy = loadBroadcast({ archiveState: { ready: false, reason: 'archive_unhealthy' } });
        var blockedArchive = await invoke(unhealthy.context, methods[i]);
        assert.strictEqual(blockedArchive.err && blockedArchive.err.code, 'archive_unhealthy');
        assert.strictEqual(unhealthy.sent.length, 0, methods[i] + ' must not broadcast while archive is unhealthy');

        var ready = loadBroadcast({});
        var allowed = await invoke(ready.context, methods[i]);
        assert.ifError(allowed.err);
        assert.strictEqual(ready.sent.length, 1, methods[i] + ' must broadcast exactly once after complete preflight');
    }

    console.log('PASS MAGIC mint broadcast requires genesis, authoritative LIB and complete healthy archive');
}()).catch(function(err) {
    console.error(err && err.stack || err);
    process.exit(1);
});
