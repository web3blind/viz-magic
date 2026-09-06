/**
 * Deterministic outcomes derived only from immutable chain evidence.
 */
var DeterministicActions = (function() {
    'use strict';

    var TRAVEL_FIND_TYPES = ['shadow_shard', 'thorn_essence', 'ancient_shard', 'altar_spark', 'data_core'];

    function _hash(text) {
        var hash = 2166136261;
        var value = String(text || '');
        for (var i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function _fraction(seed, label) {
        return _hash(String(seed) + '|' + String(label)) / 4294967296;
    }

    function travelFind(entropy, blockNum, account, zone, energy) {
        energy = Number(energy || 0);
        if (energy < 100) return null;
        // Preserve the shipped travel economy while replacing browser RNG:
        // 100 energy = 35%; 300 energy = 30%, with 30% doubled burst finds.
        var chance = energy >= 300 ? 0.30 : 0.35;
        var seed = [entropy || '', blockNum || 0, account || '', zone || '', energy].join('|');
        if (_fraction(seed, 'travel-hit') >= chance) return null;
        var typeIndex = Math.floor(_fraction(seed, 'travel-type') * TRAVEL_FIND_TYPES.length);
        var doubled = energy >= 300 && _fraction(seed, 'travel-double') < 0.3;
        return {
            type: TRAVEL_FIND_TYPES[typeIndex],
            rarity: doubled ? 2 : 1,
            quantity: doubled ? 2 : 1
        };
    }

    function reforgeStats(baseStats, entropy, account, itemRef) {
        var source = baseStats || {};
        var result = {};
        var stats = ['pot', 'res', 'swf', 'int', 'for_'];
        var seed = [entropy || '', account || '', itemRef || ''].join('|');
        for (var i = 0; i < stats.length; i++) {
            var stat = stats[i];
            var base = Number(source[stat] || 0);
            var delta = Math.floor(_fraction(seed, stat) * 3) - 1;
            result[stat] = Math.max(0, base + delta);
        }
        return result;
    }

    return {
        travelFind: travelFind,
        reforgeStats: reforgeStats
    };
})();
