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
