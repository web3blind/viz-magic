'use strict';

// Rollover is permitted only by explicit, node-local pruning bounds. A transport
// failure or a null block inside any advertised serviceable window is not proof
// of lost history, and must leave both cursor and gap ledger unchanged.
async function findRollover(cfg, start, end, rpcFetch, fetchBundle) {
    var bounds = [];
    for (var node of cfg.sourceNodes) {
        var dgp = await rpcFetch(node, 'database_api', 'get_dynamic_global_properties', [], cfg.timeoutMs, 'pruning bound unavailable');
        var earliest = Number(dgp.earliest_available_block_num);
        var lib = Number(dgp.last_irreversible_block_num);
        var head = Number(dgp.head_block_number);
        if (!Number.isSafeInteger(earliest) || earliest <= start || !Number.isSafeInteger(lib) || earliest > lib || !Number.isSafeInteger(head) || lib > head) throw new Error('historical pruning not proven for all sources');
        bounds.push({ node: node, earliestAvailableBlock: earliest, lastIrreversibleBlock: lib });
    }
    if (!bounds.length) throw new Error('no pruning evidence');
    var boundary = Math.min.apply(Math, bounds.map(function(b) { return b.earliestAvailableBlock; }));
    if (end && boundary > end) throw new Error('pruning boundary beyond requested irreversible target');
    var nodes = bounds.filter(function(b) { return b.earliestAvailableBlock === boundary; }).map(function(b) { return b.node; });
    // Never jump to a later node's convenient boundary if this earliest one fails.
    var bundle = await fetchBundle(nodes, boundary, cfg.timeoutMs, true);
    return { start: boundary, bundle: bundle, missingRange: { start: start, end: boundary - 1, reason: 'source_pruned', recordedAt: new Date().toISOString(), sources: bounds } };
}
module.exports = { findRollover: findRollover };
