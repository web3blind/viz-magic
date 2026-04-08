/**
 * Viz Magic — Action Validation Rules
 * Validates game actions before they're accepted into state.
 */
var ActionValidator = (function() {
    'use strict';

    var cfg = VizMagicConfig;
    var AT = cfg.ACTION_TYPES;

    /**
     * Validate a game action
     * @param {Object} action - parsed VM protocol action
     * @param {Object} worldState - current WorldState
     * @param {string} sender - account that sent the action
     * @param {number} blockNum - block number
     * @returns {Object} {valid: boolean, error: string|null}
     */
    function validate(action, worldState, sender, blockNum) {
        if (!action || !action.type) {
            return { valid: false, error: 'missing_action_type' };
        }
        if (!sender) {
            return { valid: false, error: 'missing_sender' };
        }

        switch (action.type) {
            case AT.CHAR_ATTUNE:
                return _validateCharAttune(action, worldState, sender);
            case AT.HUNT:
                return _validateHunt(action, worldState, sender, blockNum);
            case AT.CHALLENGE:
                return _validateDuelChallenge(action, worldState, sender, blockNum);
            case AT.ACCEPT:
                return _validateDuelAccept(action, worldState, sender, blockNum);
            case AT.COMMIT:
                return _validateDuelCommit(action, worldState, sender);
            case AT.REVEAL:
                return _validateDuelReveal(action, worldState, sender);
            case AT.FORFEIT:
                return _validateDuelForfeit(action, worldState, sender);
            case AT.ITEM_EQUIP:
                return _validateEquip(action, worldState, sender);
            case AT.ITEM_UNEQUIP:
                return _validateUnequip(action, worldState, sender);
            case AT.REST:
                return _validateRest(action, worldState, sender);
            case AT.CRAFT:
                return _validateCraft(action, worldState, sender);
            case AT.MOVE:
                return _validateMove(action, worldState, sender);
            default:
                // Unknown actions are ignored, not rejected
                return { valid: true, error: null };
        }
    }

    function _validateCharAttune(action, worldState, sender) {
        // Can only attune once
        if (worldState.characters[sender]) {
            return { valid: false, error: 'character_already_exists' };
        }

        var data = action.data || {};
        if (!data.class || !cfg.CLASSES[data.class.toUpperCase()]) {
            // Check if valid class name
            var validClasses = Object.values(cfg.CLASSES);
            if (validClasses.indexOf(data.class) === -1) {
                return { valid: false, error: 'invalid_class' };
            }
        }
        if (!data.name || data.name.length < 1 || data.name.length > 50) {
            return { valid: false, error: 'invalid_name' };
        }

        return { valid: true, error: null };
    }

    function _validateHunt(action, worldState, sender, blockNum) {
        var character = worldState.characters[sender];
        if (!character) {
            return { valid: false, error: 'no_character' };
        }

        // Check if fallen
        if (CharacterSystem.isFallen(character, blockNum)) {
            return { valid: false, error: 'character_fallen' };
        }

        var data = action.data || {};
        if (!data.creature) {
            return { valid: false, error: 'missing_creature' };
        }
        if (!data.spell) {
            return { valid: false, error: 'missing_spell' };
        }

        // Verify spell is learned
        if (character.spells.indexOf(data.spell) === -1) {
            return { valid: false, error: 'spell_not_learned' };
        }

        return { valid: true, error: null };
    }

    function _validateDuelChallenge(action, worldState, sender, blockNum) {
        var data = action.data || {};
        var duels = worldState.duels || { pending: {}, active: {} };

        // Duel actions are ingested from chain history and must not depend on
        // whether local character hydration has already happened on this client.
        // The duel state manager creates deterministic character stubs when the
        // action is accepted into state.
        if (!data.target || data.target === sender) {
            return { valid: false, error: 'invalid_duel_target' };
        }
        if (!data.strategy_hash) {
            return { valid: false, error: 'missing_strategy_hash' };
        }
        if (data.rounds && data.rounds !== 3) {
            return { valid: false, error: 'invalid_duel_rounds' };
        }
        if (data.deadline_block && data.deadline_block <= blockNum) {
            return { valid: false, error: 'invalid_duel_deadline' };
        }
        if (_findOpenDuelBetween(duels, sender, data.target)) {
            return { valid: false, error: 'duel_already_open' };
        }
        return { valid: true, error: null };
    }

    function _validateDuelAccept(action, worldState, sender, blockNum) {
        var data = action.data || {};
        var duels = worldState.duels || { pending: {} };
        var duel = duels.pending && duels.pending[String(data.challenge_ref)];
        if (!duel) {
            return { valid: false, error: 'duel_not_found' };
        }
        if (duel.target !== sender) {
            return { valid: false, error: 'not_duel_target' };
        }
        if (!data.strategy_hash) {
            return { valid: false, error: 'missing_strategy_hash' };
        }
        if (duel.deadlineBlock && blockNum > duel.deadlineBlock) {
            return { valid: false, error: 'duel_accept_expired' };
        }
        return { valid: true, error: null };
    }

    function _validateDuelCommit(action, worldState, sender) {
        var data = action.data || {};
        var duel = _getActiveDuel(worldState, data.combat_ref);
        if (!duel) {
            return { valid: false, error: 'duel_not_found' };
        }
        if (!_isDuelParticipant(duel, sender)) {
            return { valid: false, error: 'not_duel_participant' };
        }
        if (!data.strategy_hash) {
            return { valid: false, error: 'missing_strategy_hash' };
        }
        if (!data.round || data.round < 2 || data.round > (duel.rounds || 3)) {
            return { valid: false, error: 'invalid_duel_round' };
        }
        return { valid: true, error: null };
    }

    function _validateDuelReveal(action, worldState, sender) {
        var data = action.data || {};
        var duel = _getActiveDuel(worldState, data.combat_ref);
        if (!duel) {
            return { valid: false, error: 'duel_not_found' };
        }
        if (!_isDuelParticipant(duel, sender)) {
            return { valid: false, error: 'not_duel_participant' };
        }
        if (!data.round || data.round < 1 || data.round > (duel.rounds || 3)) {
            return { valid: false, error: 'invalid_duel_round' };
        }
        if (!data.strategy || !data.strategy.intent || !data.strategy.salt) {
            return { valid: false, error: 'invalid_duel_reveal' };
        }
        return { valid: true, error: null };
    }

    function _validateDuelForfeit(action, worldState, sender) {
        var data = action.data || {};
        var duel = _getAnyDuel(worldState, data.combat_ref);
        if (!duel) {
            return { valid: false, error: 'duel_not_found' };
        }
        if (!_isDuelParticipant(duel, sender)) {
            return { valid: false, error: 'not_duel_participant' };
        }
        return { valid: true, error: null };
    }

    function _getActiveDuel(worldState, combatRef) {
        var duels = worldState.duels || { active: {} };
        return duels.active && duels.active[String(combatRef)];
    }

    function _getAnyDuel(worldState, combatRef) {
        var duels = worldState.duels || { pending: {}, active: {} };
        var ref = String(combatRef);
        return (duels.active && duels.active[ref]) || (duels.pending && duels.pending[ref]) || null;
    }

    function _isDuelParticipant(duel, sender) {
        return !!duel && (duel.challenger === sender || duel.target === sender);
    }

    function _findOpenDuelBetween(duels, accountA, accountB) {
        var groups = [duels.pending || {}, duels.active || {}];
        for (var g = 0; g < groups.length; g++) {
            var keys = Object.keys(groups[g]);
            for (var i = 0; i < keys.length; i++) {
                var duel = groups[g][keys[i]];
                if (!duel) continue;
                if ((duel.challenger === accountA && duel.target === accountB) ||
                    (duel.challenger === accountB && duel.target === accountA)) {
                    return duel;
                }
            }
        }
        return null;
    }

    function _validateEquip(action, worldState, sender) {
        var character = worldState.characters[sender];
        if (!character) {
            return { valid: false, error: 'no_character' };
        }

        var data = action.data || {};
        if (!data.item) {
            return { valid: false, error: 'missing_item' };
        }

        return { valid: true, error: null };
    }

    function _validateUnequip(action, worldState, sender) {
        var character = worldState.characters[sender];
        if (!character) {
            return { valid: false, error: 'no_character' };
        }

        var data = action.data || {};
        if (!data.slot) {
            return { valid: false, error: 'missing_slot' };
        }

        return { valid: true, error: null };
    }

    function _validateRest(action, worldState, sender) {
        var character = worldState.characters[sender];
        if (!character) {
            return { valid: false, error: 'no_character' };
        }
        return { valid: true, error: null };
    }

    function _validateCraft(action, worldState, sender) {
        var character = worldState.characters[sender];
        if (!character) {
            return { valid: false, error: 'no_character' };
        }

        var data = action.data || {};
        if (!data.recipe) {
            return { valid: false, error: 'missing_recipe' };
        }
        if (!data.materials || !Array.isArray(data.materials)) {
            return { valid: false, error: 'missing_materials' };
        }

        return { valid: true, error: null };
    }

    function _validateMove(action, worldState, sender) {
        var character = worldState.characters[sender];
        if (!character) {
            return { valid: false, error: 'no_character' };
        }

        var data = action.data || {};
        if (!data.zone) {
            return { valid: false, error: 'missing_zone' };
        }

        return { valid: true, error: null };
    }

    return {
        validate: validate
    };
})();
