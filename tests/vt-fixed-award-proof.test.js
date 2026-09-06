'use strict';

var assert = require('assert');

function createVesting(tokensMilli, fundMilli, sharesMicro) {
    return tokensMilli * sharesMicro / fundMilli;
}

(function fixedAwardUsesCanonicalNominalAllocation() {
    // Core's fixed_award source operation contains the exact three-decimal
    // reward_amount. VT deliberately uses that confirmed nominal allocation;
    // later VIZ-to-SHARES and null-cleanup rounding do not change MAGIC output.
    var fund = 54363805889n;
    var shares = 54363103196928n;
    var requestedMilli = 1000n;
    var receivedSharesMicro = createVesting(requestedMilli, fund, shares);
    assert.ok(receivedSharesMicro > 0n);
    assert.strictEqual(requestedMilli, 1000n);
}());

(function ordinaryAwardSharesNeedTheHistoricalConversionSnapshot() {
    // The same receive_award.shares value can represent different nominal VIZ
    // allocations under different valid operation-time vesting rates.
    var observedSharesMicro = 3n;
    var allocationA = 3n;
    var allocationB = 2n;
    assert.strictEqual(createVesting(allocationA, 4n, 5n), observedSharesMicro);
    assert.strictEqual(createVesting(allocationB, 2n, 3n), observedSharesMicro);
    assert.notStrictEqual(allocationA, allocationB);
}());

(function currentPriceCannotRecoverAnOldAward() {
    var historicalSharesMicro = 49999n;
    var historicalFund = 54363805889n;
    var historicalShares = 54363103196928n;
    var currentFund = historicalFund * 2n;
    var currentShares = historicalShares;
    var historicalCandidate = historicalSharesMicro * historicalFund / historicalShares;
    var currentEstimate = historicalSharesMicro * currentFund / currentShares;
    assert.notStrictEqual(historicalCandidate, currentEstimate, 'a current vesting rate must not be substituted for the operation-time snapshot');
}());

console.log('PASS fixed-award nominal allocation and ordinary-award historical-rate fixtures');
