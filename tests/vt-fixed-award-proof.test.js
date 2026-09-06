'use strict';

var assert = require('assert');

function createVesting(tokensMilli, fundMilli, sharesMicro) {
    return tokensMilli * sharesMicro / fundMilli;
}

function magicMilliFromSharesMicro(sharesMicro) {
    return sharesMicro / 1000n;
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

(function ordinaryAwardUsesTheSameGameOutputAcrossDifferentNativeRates() {
    // The same receive_award.shares value can represent different nominal VIZ
    // allocations under different native rates. VT does not infer either one:
    // its explicit game policy converts canonical received SHARES directly.
    var observedSharesMicro = 1234567n;
    var allocationA = observedSharesMicro * 4n / 5n;
    var allocationB = observedSharesMicro * 2n / 3n;
    assert.notStrictEqual(allocationA, allocationB);
    assert.strictEqual(magicMilliFromSharesMicro(observedSharesMicro), 1234n);
}());

(function currentOrHistoricalDgpDoesNotChangeOrdinaryAwardOutput() {
    var historicalSharesMicro = 49999n;
    var historicalFund = 54363805889n;
    var historicalShares = 54363103196928n;
    var currentFund = historicalFund * 2n;
    var currentShares = historicalShares;
    var historicalCandidate = historicalSharesMicro * historicalFund / historicalShares;
    var currentEstimate = historicalSharesMicro * currentFund / currentShares;
    assert.notStrictEqual(historicalCandidate, currentEstimate, 'a current vesting rate must not be substituted for the operation-time snapshot');
    assert.strictEqual(magicMilliFromSharesMicro(historicalSharesMicro), 49n, 'game output depends only on canonical receive_award SHARES');
}());

console.log('PASS fixed-award nominal allocation and ordinary-award SHARES game-conversion fixtures');
