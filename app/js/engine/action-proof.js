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

    function _v3Requirement(action, state, sender, blockNum) {
        var data = action && action.data || {};
        var AT = cfg.ACTION_TYPES;
        if (action.type === AT.BOSS_ATTACK) {
            var boss = state && typeof WorldBoss !== 'undefined' && WorldBoss.getAttackBoss
                ? WorldBoss.getAttackBoss(state, Number(blockNum || state.headBlock || 0)) : state && state.worldBoss;
            return { receiver: boss && boss.author || (typeof WorldBoss !== 'undefined' ? WorldBoss.BOSS_ACCOUNT : ''), energy: 200, memo: 'viz://vm/boss/v3/attack' };
        }
        if (action.type === AT.QUEST_ABANDON) {
            var quests = state && state.quests && state.quests[sender];
            var active = quests && quests.active || [];
            for (var q = 0; q < active.length; q++) {
                if (active[q].id === data.quest_id && QuestSystem.getQuestProgressTotal(active[q]) <= 0) {
                    return { receiver: 'denis-skripnik', energy: 100, memo: 'viz://vm/quest/v3/forfeit/' + data.quest_id };
                }
            }
            return null;
        }
        if (action.type === AT.SIEGE_COMMIT) {
            var territories = state && state.territories || {};
            if (!Number.isInteger(data.energy) || data.energy < 1 || data.energy > 10000) return null;
            for (var region in territories) {
                if (!Object.prototype.hasOwnProperty.call(territories, region)) continue;
                var sieges = territories[region].activeSieges || [];
                for (var i = 0; i < sieges.length; i++) {
                    if (sieges[i].ref === data.siege_ref && sieges[i].state === 'active') {
                        var anchor = TerritorySystem.TERRITORY_ANCHORS[region];
                        return anchor ? { receiver: anchor, energy: data.energy, memo: 'viz://vm/siege/v3/' + data.siege_ref + '/' + data.energy } : null;
                    }
                }
            }
        }
        return null;
    }

    function isPaidAction(action, blockNum, state, sender) {
        var type = action ? action.type : '';
        var data = action && action.data ? action.data : {};
        var AT = cfg.ACTION_TYPES || {};
        if ((cfg.SECURITY_V3 && cfg.SECURITY_V3.isActive(blockNum))) {
            if (type === AT.SIEGE_COMMIT || type === AT.BOSS_ATTACK) return true;
            if (type === AT.QUEST_ABANDON) return !!_v3Requirement(action, state, sender);
        }
        return type === AT.HUNT || type === AT.HUNT_ARMAGEDDON ||
            (type === AT.MOVE && Number(data.energy || 0) > 0);
    }

    function getRequirement(action, state, sender, blockNum) {
        var data = action && action.data ? action.data : {};
        var type = action ? action.type : '';
        var paid = _paidConfig();
        var AT = cfg.ACTION_TYPES || {};
        var receiver = '';
        var energy = 0;
        var memo = '';

        if (type === AT.BOSS_ATTACK || type === AT.SIEGE_COMMIT || type === AT.QUEST_ABANDON) {
            return _v3Requirement(action, state, sender, blockNum);
        }
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

        function verify(sender, txIndex, action, state) {
            var version = Number(action && action.version || 1);
            if (version < 2 && Number(blockNum) < activation && !(cfg.SECURITY_V3 && cfg.SECURITY_V3.isActive(blockNum))) {
                return { valid: true, legacy: true, error: null };
            }
            if (version < 2) {
                return { valid: false, legacy: false, error: 'paid_action_v2_required' };
            }

            var requirement = getRequirement(action, state, sender, blockNum);
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
