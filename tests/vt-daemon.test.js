'use strict';

var assert = require('assert');
var daemon = require('../tools/archive-node/daemon');

(async function() {
    var originalFetch = global.fetch;
    try {
        global.fetch = async function() {
            return { ok: true, json: async function() { return { result: { head_block_number: 200, last_irreversible_block_num: 193 } }; } };
        };
        var exact = await daemon.getChainHeads({ sourceNodes: ['fixture'], timeoutMs: 100, irreversibleDepth: 20 });
        assert.deepStrictEqual(exact, { head: 200, irreversible: 193 });
        global.fetch = async function() {
            return { ok: true, json: async function() { return { result: { head_block_number: 200 } }; } };
        };
        await assert.rejects(
            daemon.getChainHeads({ sourceNodes: ['fixture'], timeoutMs: 100, irreversibleDepth: 20 }),
            /authoritative last_irreversible_block_num unavailable/
        );
        console.log('PASS archive daemon requires the authoritative irreversible head');
    } finally {
        global.fetch = originalFetch;
    }
}()).catch(function(err) { console.error(err && err.stack || err); process.exit(1); });
