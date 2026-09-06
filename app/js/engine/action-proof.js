/**
 * Viz Magic — authoritative paid-action proof verification.
 * A VM payload describes intent; only a matching VIZ award in the same
 * transaction authorizes a paid state transition.
 */
var ActionProof = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    function _paidConfig() {
        return cfg.PAID_ACTIONS || {};
    }

    function isPaidAction(action) {
        var type = action ? action.type : '';
        var data = action && action.data ? action.data : {};
        var AT = cfg.ACTION_TYPES || {};
        return type === AT.HUNT || type === AT.HUNT_ARMAGEDDON ||
            (type === AT.MOVE && Number(data.energy || 0) > 0);
    }

    function getRequirement(action) {
        var data = action && action.data ? action.data : {};
        var type = action ? action.type : '';
        var paid = _paidConfig();
        var AT = cfg.ACTION_TYPES || {};
        var receiver = '';
        var energy = 0;
        var memo = '';

        if (type === AT.HUNT) {
            var creature = typeof GameCreatures !== 'undefined' && GameCreatures.getCreature
                ? GameCreatures.getCreature(data.creature)
                : null;
            receiver = creature && creature.author ? creature.author : '';
            energy = Number(data.energy || 0);
            memo = 'viz://vm/hunt/v2/' + String(data.creature || '') + '/' + String(energy);
        } else if (type === AT.HUNT_ARMAGEDDON) {
            if (!data.creature || !data.stone) return null;
            var armageddonCreature = typeof GameCreatures !== 'undefined' && GameCreatures.getCreature
                ? GameCreatures.getCreature(data.creature)
                : null;
            receiver = armageddonCreature && armageddonCreature.author ? armageddonCreature.author : '';
            energy = 10000;
            memo = 'viz://vm/armageddon/v2/' + String(data.creature || '') + '/' + String(data.stone || '');
        } else if (type === AT.MOVE && Number(data.energy || 0) > 0) {
            if (!data.zone || [10, 100, 300].indexOf(Number(data.energy)) === -1) return null;
            receiver = paid.TRAVEL_RECEIVER || paid.TRAVEL_TREASURY || '';
            energy = Number(data.energy || 0);
            memo = 'viz://vm/travel/v2/' + String(data.zone || '') + '/' + String(energy);
        } else {
            return null;
        }

        if (!receiver || !Number.isInteger(energy) || energy < 1 || energy > 10000) return null;
        return { receiver: receiver, energy: energy, memo: memo };
    }

    function createVerifier(awards, blockNum) {
        var used = {};
        var source = Array.isArray(awards) ? awards : [];
        var activation = Number(_paidConfig().V2_ACTIVATION_BLOCK || 0);

        function verify(sender, txIndex, action) {
            var version = Number(action && action.version || 1);
            if (version < 2 && Number(blockNum) < activation) {
                return { valid: true, legacy: true, error: null };
            }
            if (version < 2) {
                return { valid: false, legacy: false, error: 'paid_action_v2_required' };
            }

            var requirement = getRequirement(action);
            if (!requirement) {
                return { valid: false, legacy: false, error: 'paid_action_requirement_invalid' };
            }

            for (var i = 0; i < source.length; i++) {
                if (used[i]) continue;
                var award = source[i] || {};
                if (String(award.initiator || '') !== String(sender || '')) continue;
                if (Number(award.txIndex) !== Number(txIndex)) continue;
                if (String(award.receiver || '') !== requirement.receiver) continue;
                if (Number(award.energy) !== requirement.energy) continue;
                if (String(award.memo || '') !== requirement.memo) continue;
                used[i] = true;
                return { valid: true, legacy: false, awardIndex: i, requirement: requirement, error: null };
            }
            return { valid: false, legacy: false, error: 'paid_action_proof_missing', requirement: requirement };
        }

        return { verify: verify };
    }

    return {
        isPaidAction: isPaidAction,
        getRequirement: getRequirement,
        createVerifier: createVerifier
    };
})();
