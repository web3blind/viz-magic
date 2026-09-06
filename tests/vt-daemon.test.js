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
        var fallback = await daemon.getChainHeads({ sourceNodes: ['fixture'], timeoutMs: 100, irreversibleDepth: 20 });
        assert.deepStrictEqual(fallback, { head: 200, irreversible: 180 });
        console.log('PASS archive daemon prefers authoritative irreversible head with conservative fallback');
    } finally {
        global.fetch = originalFetch;
    }
}()).catch(function(err) { console.error(err && err.stack || err); process.exit(1); });
