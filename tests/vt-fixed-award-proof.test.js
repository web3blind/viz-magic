'use strict';

var assert = require('assert');

function createVesting(tokens, fund, shares) {
    var created = tokens * shares / fund;
    return { created: created, fund: fund + tokens, shares: shares + created };
}

function clearNull(nullShares, fund, shares) {
    return nullShares * fund / shares;
}

(function currentChainIntegerFixture() {
    // Read-only DGP snapshot from api.viz.world at block 83,178,667.
    var fund = 54363805889n;       // milliVIZ
    var shares = 54363103196928n;  // microSHARES
    [1n, 2n, 3n, 999n, 1000n, 1001n, 10000n].forEach(function(requested) {
        var vesting = createVesting(requested, fund, shares);
        var realized = clearNull(vesting.created, vesting.fund, vesting.shares);
        assert.strictEqual(realized, requested - 1n, 'current ratio round trip burns one milliVIZ less for fixture ' + requested);
    });
}());

(function sameBlockAggregationHasNoPerOperationAttribution() {
    var fund = 54363805889n;
    var shares = 54363103196928n;
    var first = createVesting(1000n, fund, shares);
    var second = createVesting(1000n, first.fund, first.shares);
    var aggregateBurn = clearNull(first.created + second.created, second.fund, second.shares);
    assert.strictEqual(aggregateBurn, 1999n);
    assert.strictEqual(clearNull(first.created, first.fund, first.shares), 999n);
    assert.strictEqual(clearNull(second.created, second.fund, second.shares), 999n);
    assert.notStrictEqual(aggregateBurn, 999n + 999n, 'aggregate null cleanup remainder cannot be attributed by independently rounding each award');
}());

(function requestAndReceiveSharesDoNotDetermineRealizedBurn() {
    // Both valid states create exactly 3 shares from a 3-token receiver allocation,
    // while block-end conversion realizes a different burn.
    var a = createVesting(3n, 4n, 5n);
    var b = createVesting(3n, 1n, 1n);
    assert.strictEqual(a.created, 3n);
    assert.strictEqual(b.created, 3n);
    assert.strictEqual(clearNull(a.created, a.fund, a.shares), 2n);
    assert.strictEqual(clearNull(b.created, b.fund, b.shares), 3n);
}());

console.log('PASS fixed_award integer conversion and attribution fixtures');
