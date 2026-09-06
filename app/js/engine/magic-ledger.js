/**
 * Deterministic MAGIC ledger for VT operations.
 * MAGIC is the only game currency; all values are integer milliMAGIC.
 */
var MagicLedger = (function() {
    'use strict';

    var VERSION = 2;
    var HISTORY_LIMIT = 500;
    var PENDING_LIMIT = 200;

    function createState(source) {
        source = source || {};
        var balanceCopy = _copyBalances(source.balances);
        var balances = balanceCopy.balances;
        var balanceSupply = _balanceSupply(balances);
        var validSourceSupply = Number.isSafeInteger(source.supplyMilli) && source.supplyMilli >= 0;
        var sourceSupply = validSourceSupply ? source.supplyMilli : 0;
        var emptyLegacy = !source.balances && typeof source.supplyMilli === 'undefined';
        var finalizedBlock = _inferFinalizedBlock(source);
        var invalidSupply = !emptyLegacy && (balanceCopy.invalid || balanceSupply === null || !validSourceSupply || sourceSupply !== balanceSupply);
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
            finalizedBlock: finalizedBlock,
            observedThrough: Number.isSafeInteger(source.observedThrough) && source.observedThrough >= finalizedBlock
                ? source.observedThrough : finalizedBlock,
            replayRequired: !!source.replayRequired || invalidSupply
        };
        if (emptyLegacy) state.replayRequired = false;
        _normalizeDedupValues(state.mintIntents, finalizedBlock);
        _normalizeDedupValues(state.transferNonces, finalizedBlock);
        _normalizeDedupValues(state.usedProofs, finalizedBlock);
        _normalizeDedupValues(state.processed, finalizedBlock);
        return state;
    }


    function _copyBalances(source) {
        var result = {};
        var invalid = false;
        if (typeof source === 'undefined' || source === null) return { balances: result, invalid: false };
        if (typeof source !== 'object' || Array.isArray(source)) return { balances: result, invalid: true };
        Object.keys(source).forEach(function(account) {
            var value = source[account];
            if (VTProtocol.validAccount(account) && Number.isSafeInteger(value) && value > 0) result[account] = value;
            else invalid = true;
        });
        return { balances: result, invalid: invalid };
    }

    function _inferFinalizedBlock(source) {
        if (Number.isSafeInteger(source.finalizedBlock) && source.finalizedBlock >= 0) return source.finalizedBlock;
        var pending = Object.keys(source.pendingBlocks || {}).map(Number).filter(Number.isSafeInteger);
        if (pending.length) return Math.max(0, Math.min.apply(Math, pending) - 1);
        var canonical = Object.keys(source.canonicalBlocks || {}).map(Number).filter(Number.isSafeInteger);
        if (canonical.length) return Math.max.apply(Math, canonical);
        var activation = typeof VizMagicConfig !== 'undefined' && VizMagicConfig.TOKEN
            ? Number(VizMagicConfig.TOKEN.ACTIVATION_BLOCK || 0) : 0;
        return Number.isSafeInteger(activation) && activation > 0 ? activation - 1 : 0;
    }

    function _normalizeDedupValues(map, fallbackBlock) {
        Object.keys(map || {}).forEach(function(key) {
            if (!Number.isSafeInteger(map[key]) || map[key] < 0) map[key] = fallbackBlock;
        });
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
        if (!Number.isSafeInteger(number) || number <= state.finalizedBlock) return false;
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
        if (Object.keys(state.pendingBlocks).length > PENDING_LIMIT) {
            state.replayRequired = true;
            return false;
        }
        return true;
    }

    function finalizeThrough(state, irreversibleBlock, context) {
        if (!state || state.replayRequired) return 0;
        irreversibleBlock = Number(irreversibleBlock);
        var completeThrough = context && Number(context.completeThrough);
        var completeFrom = context && Number(context.completeFrom);
        if (!Number.isSafeInteger(irreversibleBlock) || !Number.isSafeInteger(completeThrough) || !Number.isSafeInteger(completeFrom) ||
                completeFrom > completeThrough || completeThrough < irreversibleBlock || irreversibleBlock < state.finalizedBlock) return 0;
        if (completeFrom > state.observedThrough + 1) {
            state.replayRequired = true;
            return 0;
        }
        state.observedThrough = Math.max(state.observedThrough, completeThrough);
        if (irreversibleBlock > state.observedThrough) return 0;
        var keys = Object.keys(state.pendingBlocks).map(Number).filter(function(n) { return n > state.finalizedBlock && n <= irreversibleBlock; });
        keys.sort(function(a, b) { return a - b; });
        var count = 0;
        var reached = irreversibleBlock;
        for (var i = 0; i < keys.length; i++) {
            var result = _applyBlock(state, state.pendingBlocks[keys[i]], context || {});
            count += result.applied;
            if (!result.complete) {
                reached = keys[i] - 1;
                break;
            }
            delete state.pendingBlocks[keys[i]];
        }
        state.finalizedBlock = Math.max(state.finalizedBlock, reached);
        var floor = state.finalizedBlock - 2000;
        if (floor > 0) {
            Object.keys(state.canonicalBlocks).forEach(function(key) { if (Number(key) < floor) delete state.canonicalBlocks[key]; });
            Object.keys(state.processed).forEach(function(key) { if (Number(state.processed[key]) < floor) delete state.processed[key]; });
            Object.keys(state.usedProofs).forEach(function(key) { if (Number(state.usedProofs[key]) < floor) delete state.usedProofs[key]; });
            Object.keys(state.mintIntents).forEach(function(key) { if (Number(state.mintIntents[key]) < floor) delete state.mintIntents[key]; });
            Object.keys(state.transferNonces).forEach(function(key) { if (Number(state.transferNonces[key]) < floor) delete state.transferNonces[key]; });
        }
        return count;
    }

    function _applyBlock(state, block, context) {
        var activation = context.activationBlock || (typeof VizMagicConfig !== 'undefined' && VizMagicConfig.TOKEN && VizMagicConfig.TOKEN.ACTIVATION_BLOCK) || 0;
        if (Number(block.blockNum) < activation) return { applied: 0, complete: true };
        var entries = (block.vtActions || []).slice().sort(function(a, b) {
            if (a.txIndex !== b.txIndex) return a.txIndex - b.txIndex;
            return a.opIndex - b.opIndex;
        });
        if (!_preflightBlock(state, block)) return { applied: 0, complete: false };
        var applied = 0;
        var complete = true;
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
            } else {
                complete = false;
                break;
            }
        }
        return { applied: applied, complete: complete };
    }

    function _sameSignedSender(entry, account) {
        return VTProtocol.validAccount(account) && entry.sender === account && entry.regularAuths && entry.regularAuths.length === 1 &&
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

    function _findMintProof(block, entry) {
        var d = entry.action.data;
        var sender = entry.sender;
        if (d.method === 'transfer') return _findProof(block.transfers, entry, sender, d.intent, d.amount_milli);
        if (d.method !== 'fixed_award' || block.proofSource !== 'trusted_archive_v1') return null;
        var fixed = null;
        for (var fa = 0; fa < (block.fixedAwards || []).length; fa++) {
            var candidate = block.fixedAwards[fa];
            if (candidate.txIndex === entry.txIndex && candidate.initiator === sender && candidate.receiver === 'null' &&
                candidate.requestedMilli === d.requested_milli && candidate.symbol === 'VIZ' &&
                Number(candidate.maxEnergy) === d.max_energy && candidate.memo === VTProtocol.mintMemo(d.intent) &&
                (!candidate.beneficiaries || candidate.beneficiaries.length === 0)) fixed = candidate;
        }
        for (var i = 0; i < (block.burnProofs || []).length; i++) {
            var evidence = block.burnProofs[i];
            if (fixed && evidence.txIndex === entry.txIndex && evidence.initiator === sender && evidence.receiver === 'null' &&
                evidence.intent === d.intent && Number.isSafeInteger(evidence.actualBurnMilli) && evidence.actualBurnMilli > 0 &&
                evidence.actualBurnMilli <= d.requested_milli &&
                (typeof evidence.sourceOpIndex === 'undefined' || evidence.sourceOpIndex === fixed.opIndex)) return evidence;
        }
        return null;
    }

    function _fixedAwardEnabled() {
        return typeof VizMagicConfig !== 'undefined' && VizMagicConfig.TOKEN &&
            VizMagicConfig.TOKEN.FIXED_AWARD_EVIDENCE === true;
    }

    function _rememberPendingMint(state, block, entry) {
        var d = entry.action.data;
        var key = entry.sender + ':' + d.intent;
        state.pendingMints[key] = {
            account: entry.sender,
            method: d.method,
            requestedMilli: d.method === 'fixed_award' ? d.requested_milli : d.amount_milli,
            blockNum: block.blockNum,
            blockHash: block.blockHash,
            reason: d.method === 'fixed_award' ? 'actual_burn_evidence_missing' : 'matching_burn_transfer_missing'
        };
        var pendingKeys = Object.keys(state.pendingMints);
        if (pendingKeys.length > PENDING_LIMIT) delete state.pendingMints[pendingKeys[0]];
    }

    function _preflightBlock(state, block) {
        var entries = block.vtActions || [];
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (state.processed[_identity(block, entry)]) continue;
            if (!entry.action || entry.action.type !== 'mint' || !_sameSignedSender(entry, entry.sender)) continue;
            if (entry.action.data.method === 'fixed_award' && !_fixedAwardEnabled()) continue;
            var intentKey = entry.sender + ':' + entry.action.data.intent;
            if (state.mintIntents[intentKey]) continue;
            if (!_findMintProof(block, entry)) {
                _rememberPendingMint(state, block, entry);
                return false;
            }
        }
        return true;
    }

    function _mint(state, block, entry) {
        var d = entry.action.data;
        var sender = entry.sender;
        if (!_sameSignedSender(entry, sender)) return { applied: false, final: true };
        if (d.method === 'fixed_award' && !_fixedAwardEnabled()) return { applied: false, final: true };
        var intentKey = sender + ':' + d.intent;
        if (state.mintIntents[intentKey]) return { applied: false, final: true };
        var proof = _findMintProof(block, entry);
        var mintMilli = d.method === 'fixed_award' && proof ? proof.actualBurnMilli : d.amount_milli;
        if (!proof) {
            _rememberPendingMint(state, block, entry);
            return { applied: false, final: false };
        }
        var proofId = [block.blockHash, proof.txIndex, proof.opIndex].join(':');
        if (state.usedProofs[proofId]) return { applied: false, final: true };
        var nextSupply = state.supplyMilli + mintMilli;
        if (!Number.isSafeInteger(nextSupply)) return { applied: false, final: true };
        if (!_credit(state, sender, mintMilli)) return { applied: false, final: true };
        state.supplyMilli = nextSupply;
        state.mintIntents[intentKey] = Number(block.blockNum);
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
        state.transferNonces[nonceKey] = Number(block.blockNum);
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
                !_sameSignedSender(entry, entry.sender) || !context || !context.marketplace || !context.worldState ||
                getBalance(state, entry.sender) < entry.action.data.price_milli) return false;
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

    function getReplayStart(state, recentStart, chainHead, activationBlock) {
        recentStart = Number(recentStart);
        chainHead = Number(chainHead);
        activationBlock = Number(activationBlock);
        if (!Number.isSafeInteger(recentStart) || !Number.isSafeInteger(chainHead) ||
                !Number.isSafeInteger(activationBlock) || chainHead < activationBlock ||
                !state || state.replayRequired || !Number.isSafeInteger(Number(state.finalizedBlock))) return recentStart;
        return Math.min(recentStart, Math.max(activationBlock - 1, Number(state.finalizedBlock)));
    }

    return {
        VERSION: VERSION,
        HISTORY_LIMIT: HISTORY_LIMIT,
        createState: createState,
        ingestBlock: ingestBlock,
        reserveEntry: reserveEntry,
        finalizeThrough: finalizeThrough,
        getBalance: getBalance,
        getHistory: getHistory,
        getReplayStart: getReplayStart
    };
})();
