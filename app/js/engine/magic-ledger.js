/**
 * Deterministic MAGIC ledger for VT operations.
 * MAGIC is the only game currency; all values are integer milliMAGIC.
 */
var MagicLedger = (function() {
    'use strict';

    var VERSION = 1;
    var HISTORY_LIMIT = 500;
    var PENDING_LIMIT = 200;

    function createState(source) {
        source = source || {};
        var balances = _copyBalances(source.balances);
        var balanceSupply = _balanceSupply(balances);
        var sourceSupply = _safeNonNegative(source.supplyMilli);
        var invalidSupply = balanceSupply === null || sourceSupply !== balanceSupply;
        var state = {
            version: VERSION,
            supplyMilli: invalidSupply ? 0 : sourceSupply,
            balances: invalidSupply ? {} : balances,
            history: Array.isArray(source.history) ? source.history.slice(-HISTORY_LIMIT) : [],
            processed: source.processed && typeof source.processed === 'object' ? source.processed : {},
            pendingMints: source.pendingMints && typeof source.pendingMints === 'object' ? source.pendingMints : {},
            mintIntents: source.mintIntents && typeof source.mintIntents === 'object' ? source.mintIntents : {},
            usedProofs: source.usedProofs && typeof source.usedProofs === 'object' ? source.usedProofs : {},
            transferNonces: source.transferNonces && typeof source.transferNonces === 'object' ? source.transferNonces : {},
            pendingBlocks: source.pendingBlocks && typeof source.pendingBlocks === 'object' ? source.pendingBlocks : {},
            canonicalBlocks: source.canonicalBlocks && typeof source.canonicalBlocks === 'object' ? source.canonicalBlocks : {},
            replayRequired: !!source.replayRequired || invalidSupply
        };
        if (!source.balances && typeof source.supplyMilli === 'undefined') state.replayRequired = false;
        return state;
    }

    function _safeNonNegative(value) {
        return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    }

    function _copyBalances(source) {
        var result = {};
        source = source || {};
        Object.keys(source).forEach(function(account) {
            var value = source[account];
            if (Number.isSafeInteger(value) && value > 0) result[account] = value;
        });
        return result;
    }

    function _balanceSupply(balances) {
        var total = 0;
        var keys = Object.keys(balances);
        for (var i = 0; i < keys.length; i++) {
            total += balances[keys[i]];
            if (!Number.isSafeInteger(total)) return null;
        }
        return total;
    }

    function _identity(block, entry) {
        return [block.blockHash, entry.txId || entry.txIndex, entry.txIndex, entry.opIndex, entry.action ? entry.action.type : entry.type].join(':');
    }

    function ingestBlock(state, processed, context) {
        if (!state || state.replayRequired || !processed || !processed.blockNum || !processed.blockHash) return false;
        var number = Number(processed.blockNum);
        var previous = state.canonicalBlocks[number];
        if (previous && previous !== processed.blockHash) {
            if (!state.pendingBlocks[number]) {
                state.replayRequired = true;
                return false;
            }
            Object.keys(state.pendingBlocks).forEach(function(key) {
                if (Number(key) >= number) {
                    var dropped = state.pendingBlocks[key];
                    if (context && context.marketplace && context.marketplace.releaseReservationsForBlock) context.marketplace.releaseReservationsForBlock(dropped.blockHash);
                    delete state.pendingBlocks[key];
                }
            });
        }
        state.canonicalBlocks[number] = processed.blockHash;
        state.pendingBlocks[number] = processed;
        return true;
    }

    function finalizeThrough(state, irreversibleBlock, context) {
        if (!state || state.replayRequired) return 0;
        var keys = Object.keys(state.pendingBlocks).map(Number).filter(function(n) { return n <= irreversibleBlock; });
        keys.sort(function(a, b) { return a - b; });
        var count = 0;
        for (var i = 0; i < keys.length; i++) {
            count += _applyBlock(state, state.pendingBlocks[keys[i]], context || {});
            delete state.pendingBlocks[keys[i]];
        }
        var floor = Number(irreversibleBlock) - 2000;
        if (floor > 0) {
            Object.keys(state.canonicalBlocks).forEach(function(key) { if (Number(key) < floor) delete state.canonicalBlocks[key]; });
            Object.keys(state.processed).forEach(function(key) { if (Number(state.processed[key]) < floor) delete state.processed[key]; });
            Object.keys(state.usedProofs).forEach(function(key) { if (Number(state.usedProofs[key]) < floor) delete state.usedProofs[key]; });
        }
        return count;
    }

    function _applyBlock(state, block, context) {
        var activation = context.activationBlock || (typeof VizMagicConfig !== 'undefined' && VizMagicConfig.TOKEN && VizMagicConfig.TOKEN.ACTIVATION_BLOCK) || 0;
        if (Number(block.blockNum) < activation) return 0;
        var entries = (block.vtActions || []).slice().sort(function(a, b) {
            if (a.txIndex !== b.txIndex) return a.txIndex - b.txIndex;
            return a.opIndex - b.opIndex;
        });
        var applied = 0;
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var id = _identity(block, entry);
            if (state.processed[id]) continue;
            var result = _applyAction(state, block, entry, context);
            if (result.applied) {
                state.processed[id] = Number(block.blockNum);
                applied += 1;
            } else if (result.final) {
                state.processed[id] = Number(block.blockNum);
            }
        }
        return applied;
    }

    function _sameSignedSender(entry, account) {
        return entry.sender === account && entry.regularAuths && entry.regularAuths.length === 1 &&
            entry.regularAuths[0] === account && (!entry.activeAuths || entry.activeAuths.length === 0);
    }

    function _findProof(list, entry, sender, intent, amountMilli) {
        list = list || [];
        for (var i = 0; i < list.length; i++) {
            var proof = list[i];
            if (proof.txIndex === entry.txIndex && proof.from === sender && proof.to === 'null' &&
                proof.amountMilli === amountMilli && proof.memo === VTProtocol.mintMemo(intent) && proof.symbol === 'VIZ') return proof;
        }
        return null;
    }

    function _mint(state, block, entry) {
        var d = entry.action.data;
        var sender = entry.sender;
        if (!_sameSignedSender(entry, sender)) return { applied: false, final: true };
        var intentKey = sender + ':' + d.intent;
        if (state.mintIntents[intentKey]) return { applied: false, final: true };
        var proof = null;
        if (d.method === 'transfer') proof = _findProof(block.transfers, entry, sender, d.intent, d.amount_milli);
        if (d.method === 'fixed_award') {
            var fixed = null;
            for (var fa = 0; fa < (block.fixedAwards || []).length; fa++) {
                var candidate = block.fixedAwards[fa];
                if (candidate.txIndex === entry.txIndex && candidate.initiator === sender && candidate.receiver === 'null' &&
                    candidate.requestedMilli === d.requested_milli && candidate.symbol === 'VIZ' &&
                    Number(candidate.maxEnergy) === d.max_energy && candidate.memo === VTProtocol.mintMemo(d.intent) &&
                    (!candidate.beneficiaries || candidate.beneficiaries.length === 0)) fixed = candidate;
            }
            var evidence = block.burnProofs || [];
            for (var i = 0; i < evidence.length; i++) {
                var ev = evidence[i];
                if (fixed && ev.txIndex === entry.txIndex && ev.initiator === sender && ev.receiver === 'null' &&
                    ev.intent === d.intent && Number.isSafeInteger(ev.actualBurnMilli) && ev.actualBurnMilli > 0 &&
                    ev.actualBurnMilli <= d.requested_milli && ev.canonical === true &&
                    (typeof ev.sourceOpIndex === 'undefined' || ev.sourceOpIndex === fixed.opIndex)) proof = ev;
            }
        }
        var mintMilli = d.method === 'fixed_award' && proof ? proof.actualBurnMilli : d.amount_milli;
        if (!proof) {
            state.pendingMints[intentKey] = {
                account: sender,
                method: d.method,
                requestedMilli: d.method === 'fixed_award' ? d.requested_milli : d.amount_milli,
                blockNum: block.blockNum,
                blockHash: block.blockHash,
                reason: d.method === 'fixed_award' ? 'actual_burn_evidence_missing' : 'matching_burn_transfer_missing'
            };
            var pendingKeys = Object.keys(state.pendingMints);
            if (pendingKeys.length > PENDING_LIMIT) delete state.pendingMints[pendingKeys[0]];
            return { applied: false, final: false };
        }
        var proofId = [block.blockHash, proof.txIndex, proof.opIndex].join(':');
        if (state.usedProofs[proofId]) return { applied: false, final: true };
        var nextSupply = state.supplyMilli + mintMilli;
        if (!Number.isSafeInteger(nextSupply)) return { applied: false, final: true };
        if (!_credit(state, sender, mintMilli)) return { applied: false, final: true };
        state.supplyMilli = nextSupply;
        state.mintIntents[intentKey] = true;
        state.usedProofs[proofId] = Number(block.blockNum);
        delete state.pendingMints[intentKey];
        _history(state, { type: 'mint', account: sender, amountMilli: mintMilli, intent: d.intent, method: d.method, blockNum: block.blockNum });
        return { applied: true, final: true };
    }

    function _transfer(state, block, entry) {
        var d = entry.action.data;
        var sender = entry.sender;
        if (!_sameSignedSender(entry, sender) || d.to === sender) return { applied: false, final: true };
        var nonceKey = sender + ':' + d.nonce;
        if (state.transferNonces[nonceKey]) return { applied: false, final: true };
        if (!_debit(state, sender, d.amount_milli)) return { applied: false, final: true };
        if (!_credit(state, d.to, d.amount_milli)) {
            _credit(state, sender, d.amount_milli);
            return { applied: false, final: true };
        }
        state.transferNonces[nonceKey] = true;
        _history(state, { type: 'transfer', from: sender, to: d.to, amountMilli: d.amount_milli, nonce: d.nonce, blockNum: block.blockNum });
        return { applied: true, final: true };
    }

    function _buy(state, block, entry, context) {
        var d = entry.action.data;
        var sender = entry.sender;
        if (!_sameSignedSender(entry, sender) || !context.worldState || !context.marketplace) return { applied: false, final: false };
        var operationId = _identity(block, entry);
        if (entry.reservationRejected) return { applied: false, final: true };
        var result = context.marketplace.buyItem(sender, d.listing_ref, block.blockNum, context.worldState, state, d.revision, d.price_milli);
        if (!result.success) {
            if (context.marketplace.releasePurchase) context.marketplace.releasePurchase(d.listing_ref, operationId);
            return { applied: false, final: result.error !== 'listing_not_found' };
        }
        _history(state, { type: 'trade', buyer: sender, seller: result.listing.seller, amountMilli: d.price_milli, listingRef: d.listing_ref, itemRef: result.listing.itemRef, blockNum: block.blockNum });
        return { applied: true, final: true };
    }

    function reserveEntry(state, block, entry, context) {
        if (!state || state.replayRequired || !entry || !entry.action || entry.action.type !== 'bazaar.buy' ||
                !_sameSignedSender(entry, entry.sender) || !context || !context.marketplace || !context.worldState) return false;
        var d = entry.action.data;
        var result = context.marketplace.reservePurchase(
            entry.sender, d.listing_ref, d.revision, d.price_milli,
            block.blockHash, _identity(block, entry), context.worldState
        );
        entry.reservationRejected = !result.success;
        return result.success;
    }

    function _applyAction(state, block, entry, context) {
        if (!entry.action) return { applied: false, final: true };
        if (entry.action.type === 'mint') return _mint(state, block, entry);
        if (entry.action.type === 'transfer') return _transfer(state, block, entry);
        if (entry.action.type === 'bazaar.buy') return _buy(state, block, entry, context);
        return { applied: false, final: true };
    }

    function _credit(state, account, amount) {
        var current = getBalance(state, account);
        var next = current + amount;
        if (!Number.isSafeInteger(next) || next < 0) return false;
        state.balances[account] = next;
        return true;
    }

    function _debit(state, account, amount) {
        var current = getBalance(state, account);
        if (!Number.isSafeInteger(amount) || amount <= 0 || current < amount) return false;
        var next = current - amount;
        if (next) state.balances[account] = next;
        else delete state.balances[account];
        return true;
    }

    function _history(state, entry) {
        state.history.push(entry);
        if (state.history.length > HISTORY_LIMIT) state.history.shift();
    }

    function getBalance(state, account) {
        var value = state && state.balances && state.balances[account];
        return Number.isSafeInteger(value) && value > 0 ? value : 0;
    }

    function getHistory(state, account, offset, limit) {
        offset = Math.max(0, Number(offset) || 0);
        limit = Math.max(1, Math.min(Number(limit) || 50, 100));
        return (state.history || []).filter(function(entry) {
            return entry.account === account || entry.from === account || entry.to === account || entry.buyer === account || entry.seller === account;
        }).reverse().slice(offset, offset + limit);
    }

    return {
        VERSION: VERSION,
        HISTORY_LIMIT: HISTORY_LIMIT,
        createState: createState,
        ingestBlock: ingestBlock,
        reserveEntry: reserveEntry,
        finalizeThrough: finalizeThrough,
        getBalance: getBalance,
        getHistory: getHistory
    };
})();
