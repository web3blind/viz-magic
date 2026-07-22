/**
 * Viz Magic — Crafting & Enchanting Screen
 * Recipe list, craft execution, enchanting sub-section.
 */
var CraftingScreen = (function() {
    'use strict';

    var currentTab = 'recipes';
    var selectedRecipe = null;
    var craftingInProgress = false;
    var craftResult = null;

    /**
     * Render the crafting screen
     */
    function render() {
        var t = Helpers.t;
        var container = Helpers.$('screen-crafting');
        if (!container) return;

        var html = '<div class="crafting-screen">';
        html += '<h1><span class="screen-title-icon vmagic-breathe" aria-hidden="true">🔨</span> ' + t('craft_title') + '</h1>';

        // Tabs
        html += '<div class="craft-tabs" role="tablist" aria-label="' + t('craft_tabs') + '">';
        html += _tab('recipes', t('craft_recipes'));
        html += _tab('enchant', t('craft_enchant'));
        html += '</div>';

        switch (currentTab) {
            case 'recipes': html += _renderRecipes(); break;
            case 'enchant': html += _renderEnchant(); break;
        }

        html += '</div>';
        container.innerHTML = html;
        _bindEvents(container);
    }

    function _tab(id, label) {
        var active = currentTab === id ? ' active' : '';
        return '<button class="btn btn-secondary craft-tab' + active + '" data-tab="' + id + '" ' +
               'role="tab" aria-selected="' + (currentTab === id) + '">' + label + '</button>';
    }

    /**
     * Render recipes list
     */
    function _renderRecipes() {
        var t = Helpers.t;
        var html = '';
        var user = typeof VizAccount !== 'undefined' ? VizAccount.getCurrentUser() : '';

        // Show craft result if just completed
        if (craftResult) {
            html += _renderCraftResult();
            return html;
        }

        // Show crafting animation if in progress
        if (craftingInProgress) {
            html += _renderCraftingAnimation();
            return html;
        }

        if (!user) {
            html += '<div class="empty-state">' + t('craft_login_required') + '</div>';
            return html;
        }

        var character = StateEngine.getCharacter(user);
        var inventory = StateEngine.getInventory(user);
        if (!character) {
            html += '<div class="empty-state">' + t('craft_no_character') + '</div>';
            return html;
        }

        var recipes = CraftingSystem.getAvailableRecipes(character, inventory, character.currentZone || '');

        if (selectedRecipe) {
            html += _renderRecipeDetail(selectedRecipe, character, inventory);
        } else {
            html += '<div class="recipe-list" role="list" aria-label="' + t('craft_recipe_list') + '">';
            for (var i = 0; i < recipes.length; i++) {
                html += _renderRecipeCard(recipes[i]);
            }
            if (recipes.length === 0) {
                html += '<div class="empty-state">' + t('craft_no_recipes') + '</div>';
            }
            html += '</div>';
        }

        return html;
    }

    /**
     * Render a recipe card in list
     */
    function _renderRecipeCard(recipeInfo) {
        var t = Helpers.t;
        var recipe = recipeInfo.recipe;
        var canCraft = recipeInfo.canCraft;
        var name = t(recipe.nameKey) || recipe.id.replace(/_/g, ' ');
        var catIcon = _getRecipeIcon(recipe);

        var html = '<div class="recipe-card' + (canCraft ? ' craftable' : ' locked') + '" ' +
                   'role="listitem" data-recipe="' + recipe.id + '" tabindex="0" ' +
                   'aria-label="' + Helpers.escapeHtml(name) + (canCraft ? '' : ' (' + t('craft_locked') + ')') + '">';
        html += '<span class="recipe-icon" aria-hidden="true">' + catIcon + '</span>';
        html += '<div class="recipe-info">';
        html += '<span class="recipe-name">' + Helpers.escapeHtml(name) + '</span>';
        html += '<span class="recipe-level">' + t('craft_level_req', { level: recipe.levelReq || 1 }) + '</span>';
        html += '</div>';
        html += '<div class="recipe-status">';
        if (canCraft) {
            html += '<span class="recipe-ready">' + t('craft_ready') + '</span>';
        } else {
            var errorKey = 'craft_error_' + (recipeInfo.error || 'unknown');
            var errorText = t(errorKey);
            if (recipeInfo.error === 'not_enough_mana' && recipe.manaCost) {
                errorText += ' ' + t('craft_required_mana', { cost: Helpers.bpToPercent(recipe.manaCost) });
            }
            html += '<span class="recipe-locked-text">' + errorText + '</span>';
        }
        html += '</div>';
        html += '</div>';
        return html;
    }

    /**
     * Render recipe detail view
     */
    function _renderRecipeDetail(recipeId, character, inventory) {
        var t = Helpers.t;
        var recipe = GameRecipes.getRecipe(recipeId);
        if (!recipe) return '<div class="empty-state">' + t('craft_recipe_not_found') + '</div>';

        var name = t(recipe.nameKey) || recipe.id.replace(/_/g, ' ');
        var validation = CraftingSystem.validateRecipe(recipeId, character, inventory, character.currentZone || '');

        var html = '<div class="recipe-detail">';
        html += '<button class="btn btn-secondary btn-sm recipe-back-btn" aria-label="' + t('craft_back') + '">' + t('craft_back') + '</button>';
        html += '<h2>' + Helpers.escapeHtml(name) + '</h2>';

        // Materials
        html += '<div class="recipe-materials">';
        html += '<h3>' + t('craft_materials') + '</h3>';
        for (var m = 0; m < recipe.materials.length; m++) {
            var mat = recipe.materials[m];
            var matName = t('item_' + mat.type) || mat.type.replace(/_/g, ' ');
            var owned = CraftingSystem.countMaterial(inventory, mat.type);
            var enough = owned >= mat.quantity;
            html += '<div class="recipe-material' + (enough ? ' has-material' : ' missing-material') + '">';
            html += '<span class="material-check" aria-hidden="true">' + (enough ? '\u2714' : '\u2716') + '</span>';
            html += '<span class="material-name">' + Helpers.escapeHtml(matName) + '</span>';
            html += '<span class="material-count">' + owned + '/' + mat.quantity + '</span>';
            html += '</div>';
        }
        html += '</div>';

        // Mana cost
        html += '<div class="recipe-cost">';
        html += '<span>' + t('craft_mana_cost') + ': ' + Helpers.manaCost(recipe.manaCost || 0) + '</span>';
        html += '</div>';

        // Possible outcomes
        html += '<div class="recipe-outcomes">';
        html += '<h3>' + t('craft_possible_outcomes') + '</h3>';
        var rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        for (var r = 0; r < rarities.length; r++) {
            var rInfo = ItemSystem.getRarityInfo(r);
            html += '<span class="outcome-rarity rarity-color-' + rarities[r] + '">' +
                    rInfo.symbol + ' ' + t('rarity_' + rarities[r]) + '</span> ';
        }
        html += '</div>';

        // Craft button
        html += '<button class="btn btn-primary btn-large btn-glow craft-execute-btn" ' +
                (validation.valid ? '' : 'disabled') +
                ' aria-label="' + t('craft_create') + ' ' + Helpers.escapeHtml(name) + '">' +
                t('craft_create') + '</button>';

        html += '</div>';
        return html;
    }

    /**
     * Render crafting animation (2-3 sec)
     */
    function _renderCraftingAnimation() {
        var t = Helpers.t;
        var html = '<div class="craft-animation" role="status" aria-live="polite">';
        html += '<div class="craft-cauldron" aria-hidden="true">';
        html += '<span class="craft-icon-anim">\u2728</span>';
        html += '</div>';
        html += '<p class="craft-progress-text">' + t('craft_in_progress') + '</p>';
        html += '<div class="craft-progress-bar"><div class="craft-progress-fill"></div></div>';
        html += '</div>';
        return html;
    }

    /**
     * Render craft result
     */
    function _renderCraftResult() {
        var t = Helpers.t;
        if (!craftResult) return '';

        var item = craftResult.item;
        var quality = craftResult.quality;
        var name = t('item_' + item.type) || item.type.replace(/_/g, ' ');
        var rarityInfo = ItemSystem.getRarityInfo(item.rarity);
        var rarityName = t('rarity_' + quality.rarityName);

        var html = '<div class="craft-result craft-reveal-anim" role="alert">';
        html += '<h2>' + t('craft_success') + '</h2>';
        html += '<div class="craft-result-item ' + Helpers.rarityClass(item.rarity) + '">';
        html += '<div class="result-rarity rarity-color-' + rarityInfo.name + '">' +
                rarityInfo.symbol + ' ' + rarityName + '</div>';
        html += '<div class="result-name">' + Helpers.escapeHtml(name) + '</div>';

        // Stats
        if (item.stats) {
            html += '<div class="result-stats">';
            var statLabels = { pot: t('char_potency'), res: t('char_resilience'), swf: t('char_swiftness'), int: t('char_intellect'), for_: t('char_fortune') };
            for (var s in item.stats) {
                if (item.stats.hasOwnProperty(s) && item.stats[s] !== 0) {
                    var sign = item.stats[s] > 0 ? '+' : '';
                    html += '<div class="result-stat">' + (statLabels[s] || s) + ': ' + sign + item.stats[s] + '</div>';
                }
            }
            html += '</div>';
        }

        html += '</div>';
        html += '<button class="btn btn-primary craft-dismiss-btn">' + t('craft_continue') + '</button>';
        html += '</div>';
        return html;
    }

    /**
     * Render enchanting sub-section
     */
    function _renderEnchant() {
        var t = Helpers.t;
        var html = '';
        var user = typeof VizAccount !== 'undefined' ? VizAccount.getCurrentUser() : '';
        if (!user) {
            html += '<div class="empty-state">' + t('craft_login_required') + '</div>';
            return html;
        }

        var inventory = StateEngine.getInventory(user);
        var character = StateEngine.getCharacter(user);
        if (!character) {
            html += '<div class="empty-state">' + t('craft_no_character') + '</div>';
            return html;
        }

        // Enchantable items (equipped or in bag, with slots available)
        var enchantableItems = [];
        var runeItems = [];

        for (var i = 0; i < inventory.length; i++) {
            var item = inventory[i];
            if (item.consumed) continue;

            var template = ItemSystem.getItemTemplate(item.type);
            if (!template) continue;

            if (template.slot && EnchantingSystem.getEnchantmentSlots(item) > 0) {
                enchantableItems.push(item);
            }

            if (template.enchantType || template.category === 'glyph') {
                if (!item.equipped) {
                    runeItems.push(item);
                }
            }
        }

        // Reforge section
        html += '<div class="enchant-section reforge-section">';
        html += '<h3><span class="section-icon vmagic-breathe" aria-hidden="true">⚒️</span> ' + t('enchant_reforge_title') + '</h3>';
        html += '<p class="enchant-desc">' + t('enchant_reforge_desc') + '</p>';
        html += '<label for="reforge-item-select" class="input-label"><span class="section-icon vmagic-breathe" aria-hidden="true">🧰</span> ' + t('enchant_select_item') + '</label>';
        html += '<select id="reforge-item-select" class="input-field" aria-label="' + t('enchant_reforge_item') + '">';
        html += '<option value="">' + t('enchant_choose_item') + '</option>';
        for (var fi = 0; fi < enchantableItems.length; fi++) {
            var fItem = enchantableItems[fi];
            var fName = t('item_' + fItem.type) || fItem.type.replace(/_/g, ' ');
            html += '<option value="' + fItem.id + '">' + fName + '</option>';
        }
        html += '</select>';
        html += '<button class="btn btn-secondary reforge-btn" id="btn-reforge">' + t('enchant_reforge') + '</button>';
        html += '</div>';

        // Item selection
        html += '<div class="enchant-section">';
        html += '<h3><span class="section-icon vmagic-breathe" aria-hidden="true">🪄</span> ' + t('enchant_title') + '</h3>';
        html += '<p class="enchant-desc">' + t('enchant_desc') + '</p>';
        html += '<label for="enchant-item-select" class="input-label"><span class="section-icon vmagic-breathe" aria-hidden="true">🧰</span> ' + t('enchant_select_item') + '</label>';
        html += '<select id="enchant-item-select" class="input-field" aria-label="' + t('enchant_select_item') + '">';
        html += '<option value="">' + t('enchant_choose_item') + '</option>';
        for (var ei = 0; ei < enchantableItems.length; ei++) {
            var eItem = enchantableItems[ei];
            var eName = t('item_' + eItem.type) || eItem.type.replace(/_/g, ' ');
            var slots = EnchantingSystem.getEnchantmentSlots(eItem);
            html += '<option value="' + eItem.id + '">' + eName + ' (' + slots + ' ' + t('enchant_slots') + ')</option>';
        }
        html += '</select>';

        // Rune selection
        html += '<label for="enchant-rune-select" class="input-label"><span class="section-icon vmagic-breathe" aria-hidden="true">💠</span> ' + t('enchant_select_rune') + '</label>';
        html += '<select id="enchant-rune-select" class="input-field" aria-label="' + t('enchant_select_rune') + '">';
        html += '<option value="">' + t('enchant_choose_rune') + '</option>';
        for (var ri = 0; ri < runeItems.length; ri++) {
            var rItem = runeItems[ri];
            var rName = t('item_' + rItem.type) || rItem.type.replace(/_/g, ' ');
            html += '<option value="' + rItem.id + '">' + rName + '</option>';
        }
        html += '</select>';

        html += '<button class="btn btn-primary enchant-apply-btn" id="btn-enchant-apply">' + t('enchant_apply') + '</button>';
        html += '</div>';

        // Consumables section
        var consumables = [];
        for (var ci = 0; ci < inventory.length; ci++) {
            var cItem = inventory[ci];
            if (cItem.consumed) continue;
            var cTemplate = ItemSystem.getItemTemplate(cItem.type);
            if (cTemplate && (cTemplate.category === 'scroll' || cTemplate.consumeEffect)) {
                consumables.push(cItem);
            }
        }

        if (consumables.length > 0) {
            html += '<div class="enchant-section consume-section">';
            html += '<h3>' + t('enchant_consumables') + '</h3>';
            html += '<div class="consumable-list" role="list">';
            for (var co = 0; co < consumables.length; co++) {
                var conItem = consumables[co];
                var conName = t('item_' + conItem.type) || conItem.type.replace(/_/g, ' ');
                var conRarity = ItemSystem.getRarityInfo(conItem.rarity);
                var conRarityName = t('rarity_' + conRarity.name);
                html += '<div class="consumable-item" role="listitem">';
                html += '<span>' + conRarity.symbol + ' ' + Helpers.escapeHtml(conName) + ' — ' + Helpers.escapeHtml(conRarityName) + ' — #' + Helpers.escapeHtml(conItem.id) + '</span>';
                html += '<button class="btn btn-sm btn-primary consume-btn" data-item="' + conItem.id + '">' +
                        t('inv_use') + '</button>';
                html += '</div>';
            }
            html += '</div></div>';
        }

        return html;
    }


    function _getRecipeIcon(recipe) {
        var recipeIcons = {
            mana_potion: '\uD83E\uDDEA',
            health_scroll: '\uD83D\uDCDC',
            ember_staff: '🪵',
            ash_wand: '\uD83E\uDE84',
            thornwood_staff: '🦯🌱',
            shadow_blade: '\uD83D\uDDE1\uFE0F',
            veilstone_helm: '\uD83E\uDE96',
            windwalker_boots: '\uD83E\uDD7E',
            ironbark_vest: '\uD83E\uDDBA',
            fire_rune: '\uD83D\uDD25',
            shadow_rune: '\uD83C\uDF11\uFE0F',
            lucky_charm: '\uD83C\uDF40',
            armageddon_stone: '\u2604\uFE0F'
        };
        if (recipe && recipeIcons[recipe.id]) return recipeIcons[recipe.id];
        return _getCategoryIcon(recipe ? recipe.category : '');
    }

    /**
     * Get category icon
     */
    function _getCategoryIcon(category) {
        var icons = {
            focus: '\u2694\uFE0F',
            ward: '\uD83D\uDEE1\uFE0F',
            glyph: '\u2728',
            relic: '\uD83D\uDC8E',
            scroll: '\uD83D\uDCDC',
            material: '\uD83E\uDDEA'
        };
        return icons[category] || '\u2699\uFE0F';
    }

    /**
     * Bind events
     */
    function _bindEvents(container) {
        // Tab switching
        var tabs = container.querySelectorAll('.craft-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].addEventListener('click', function() {
                currentTab = this.getAttribute('data-tab');
                selectedRecipe = null;
                craftResult = null;
                craftingInProgress = false;
                SoundManager.play('tap');
                render();
            });
        }

        // Recipe card clicks
        var recipeCards = container.querySelectorAll('.recipe-card');
        for (var r = 0; r < recipeCards.length; r++) {
            recipeCards[r].addEventListener('click', function() {
                selectedRecipe = this.getAttribute('data-recipe');
                SoundManager.play('tap');
                render();
            });
        }

        // Back button
        var backBtn = container.querySelector('.recipe-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                selectedRecipe = null;
                SoundManager.play('tap');
                render();
            });
        }

        // Craft execute button
        var craftBtn = container.querySelector('.craft-execute-btn');
        if (craftBtn) {
            craftBtn.addEventListener('click', function() {
                _executeCraft();
            });
        }

        // Dismiss craft result
        var dismissBtn = container.querySelector('.craft-dismiss-btn');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', function() {
                craftResult = null;
                selectedRecipe = null;
                SoundManager.play('tap');
                render();
            });
        }

        // Enchant apply
        var enchantBtn = container.querySelector('#btn-enchant-apply');
        if (enchantBtn) {
            enchantBtn.addEventListener('click', _executeEnchant);
        }

        // Reforge
        var reforgeBtn = container.querySelector('#btn-reforge');
        if (reforgeBtn) {
            reforgeBtn.addEventListener('click', _executeReforge);
        }

        // Consume buttons
        var consumeBtns = container.querySelectorAll('.consume-btn');
        for (var cb = 0; cb < consumeBtns.length; cb++) {
            consumeBtns[cb].addEventListener('click', function() {
                var itemId = this.getAttribute('data-item');
                _executeConsume(itemId);
            });
        }
    }

    /**
     * Execute crafting
     */
    function _executeCraft() {
        var t = Helpers.t;
        if (!selectedRecipe || craftingInProgress) return;

        var user = VizAccount.getCurrentUser();
        var character = StateEngine.getCharacter(user);
        var inventory = StateEngine.getInventory(user);
        if (!character || !inventory) return;

        // Validate
        var validation = CraftingSystem.validateRecipe(selectedRecipe, character, inventory, character.currentZone || '');
        if (!validation.valid) {
            var validationMessage = t('craft_error_' + validation.error);
            var validationRecipe = GameRecipes.getRecipe(selectedRecipe);
            if (validation.error === 'not_enough_mana' && validationRecipe && validationRecipe.manaCost) {
                validationMessage += ' ' + t('craft_required_mana', { cost: Helpers.bpToPercent(validationRecipe.manaCost) });
            }
            Toast.error(validationMessage);
            SoundManager.play('error');
            return;
        }

        // Start crafting animation
        craftingInProgress = true;
        render();
        SoundManager.play('spell_fire');
        SoundManager.vibrate('seal');

        // Broadcast to chain
        var materialIds = [];
        for (var i = 0; i < validation.matchedMaterials.length; i++) {
            materialIds.push(validation.matchedMaterials[i].id);
        }

        MarketProtocol.broadcastCraft(selectedRecipe, materialIds, character.currentZone || '', function(err, result) {
            craftingInProgress = false;

            if (err) {
                Toast.error(t('craft_broadcast_error'));
                SoundManager.play('error');
                render();
                return;
            }

            // Apply local craft result through StateEngine so live play and replay share one mutation path.
            var worldState = StateEngine.getState();
            var blockNum = (result && result.block_num) || (result && result.action && result.action.block_num) || (worldState.headBlock + 1);
            var blockHash = (result && (result.block_id || result.id || result.transaction_id)) ||
                (result && result.action && (result.action.block_id || result.action.id || result.action.transaction_id)) ||
                ('sim_' + Date.now().toString(16));

            var craftEvent = StateEngine.processCraftResult(user, selectedRecipe, materialIds, character.currentZone || '', blockHash, blockNum);

            if (craftEvent) {
                craftResult = {
                    item: {
                        id: craftEvent.itemId,
                        type: craftEvent.itemType,
                        rarity: craftEvent.rarity,
                        stats: (function() {
                            var inv = StateEngine.getInventory(user);
                            for (var ii = 0; ii < inv.length; ii++) {
                                if (inv[ii].id === craftEvent.itemId) return inv[ii].stats || null;
                            }
                            return null;
                        })()
                    },
                    quality: {
                        rarity: craftEvent.rarity,
                        rarityName: craftEvent.rarityName
                    },
                    consumedIds: craftEvent.consumedIds || []
                };
                StateEngine.saveCheckpoint(function() {});
                SoundManager.play('victory');
                SoundManager.vibrate('loot');
            } else {
                Toast.error(t('craft_error_unknown'));
                SoundManager.play('error');
            }

            // Delay for dramatic reveal (animation covers block confirmation)
            setTimeout(function() {
                render();
            }, 2500);
        });
    }

    /**
     * Execute enchanting
     */
    function _executeEnchant() {
        var t = Helpers.t;
        var itemId = (Helpers.$('enchant-item-select') || {}).value;
        var runeId = (Helpers.$('enchant-rune-select') || {}).value;

        if (!itemId || !runeId) {
            Toast.error(t('enchant_select_both'));
            SoundManager.play('error');
            return;
        }

        var user = VizAccount.getCurrentUser();
        var inventory = StateEngine.getInventory(user);
        var character = StateEngine.getCharacter(user);

        var item = null;
        var rune = null;
        for (var i = 0; i < inventory.length; i++) {
            if (inventory[i].id === itemId) item = inventory[i];
            if (inventory[i].id === runeId) rune = inventory[i];
        }

        if (!item || !rune) {
            Toast.error(t('enchant_items_missing'));
            SoundManager.play('error');
            return;
        }

        SoundManager.play('equip');
        MarketProtocol.broadcastEnchant(itemId, rune.type, runeId, function(err) {
            if (err) {
                Toast.error(t('enchant_error'));
                SoundManager.play('error');
            } else {
                // Apply locally
                var result = EnchantingSystem.enchantItem(item, rune.type, rune, character);
                if (result.success) {
                    Toast.success(t('enchant_success'));
                    SoundManager.play('success');
                    SoundManager.vibrate('seal');
                } else {
                    Toast.error(t('enchant_error_' + result.error));
                    SoundManager.play('error');
                }
                render();
            }
        });
    }

    /**
     * Execute reforge
     */
    function _executeReforge() {
        var t = Helpers.t;
        var itemId = (Helpers.$('reforge-item-select') || {}).value;

        if (!itemId) {
            Toast.error(t('enchant_select_item_first'));
            SoundManager.play('error');
            return;
        }

        var user = VizAccount.getCurrentUser();
        var inventory = StateEngine.getInventory(user);
        var character = StateEngine.getCharacter(user);

        var item = null;
        for (var i = 0; i < inventory.length; i++) {
            if (inventory[i].id === itemId) { item = inventory[i]; break; }
        }

        if (!item) {
            Toast.error(t('enchant_items_missing'));
            SoundManager.play('error');
            return;
        }

        Modal.show({
            title: t('enchant_reforge'),
            text: t('enchant_reforge_confirm', { cost: 500 }),
            buttons: [
                {
                    text: t('confirm'),
                    className: 'btn-primary',
                    action: function() {
                        SoundManager.play('spell_fire');
                        MarketProtocol.broadcastReforge(itemId, function(err) {
                            if (err) {
                                Toast.error(t('enchant_reforge_error'));
                                SoundManager.play('error');
                            } else {
                                var blockHash = 'rf_' + Date.now().toString(16);
                                var blockNum = StateEngine.getState().headBlock + 1;
                                var result = EnchantingSystem.reforgeItem(item, character, blockHash, blockNum, user);
                                if (result.success) {
                                    var msg = result.rarityChanged ? t('enchant_reforge_upgrade') : t('enchant_reforge_success');
                                    Toast.success(msg);
                                    SoundManager.play('levelup');
                                    SoundManager.vibrate('loot');
                                } else {
                                    Toast.error(t('enchant_reforge_error'));
                                    SoundManager.play('error');
                                }
                                render();
                            }
                        });
                    }
                },
                { text: t('cancel'), className: 'btn-secondary', action: function() {} }
            ]
        });
    }

    function _consumeSuccessMessage(t, result, character) {
        var effect = result ? result.effect : null;
        if (effect && effect.type === 'hp_restore') {
            return t('consume_success_hp', {
                amount: effect.amount || 0,
                current: character.hp || 0,
                max: character.maxHp || 0
            });
        }
        if (effect && effect.type === 'mana_restore') {
            return t('consume_success_mana', {
                amount: Helpers.bpToPercent(effect.amount || 0),
                current: Helpers.bpToPercent(character.mana || 0)
            });
        }
        return t('consume_success');
    }

    /**
     * Execute consume
     */
    function _executeConsume(itemId) {
        var t = Helpers.t;
        var user = VizAccount.getCurrentUser();
        var inventory = StateEngine.getInventory(user);
        var character = StateEngine.getCharacter(user);

        var item = null;
        for (var i = 0; i < inventory.length; i++) {
            if (inventory[i].id === itemId) { item = inventory[i]; break; }
        }

        if (!item) return;

        SoundManager.play('tap');
        MarketProtocol.broadcastConsume(itemId, function(err) {
            if (err) {
                Toast.error(t('consume_error'));
                SoundManager.play('error');
            } else {
                var result = EnchantingSystem.consumeItem(item, character);
                if (result.success) {
                    Toast.success(_consumeSuccessMessage(t, result, character));
                    SoundManager.play('success');
                    SoundManager.vibrate('light');
                }
                render();
            }
        });
    }

    return {
        render: render
    };
})();
