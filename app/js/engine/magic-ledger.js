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

    function _sameTransaction(entry, proof) {
        return Number(proof.txIndex) === Number(entry.txIndex) &&
            (!entry.txId || !proof.txId || String(entry.txId) === String(proof.txId));
    }

    function _sameCanonicalTransaction(entry, proof) {
        return Number.isInteger(entry.txIndex) && entry.txIndex >= 0 &&
            Number.isInteger(proof.txIndex) && proof.txIndex === entry.txIndex &&
            typeof entry.txId === 'string' && entry.txId.length > 0 &&
            typeof proof.txId === 'string' && proof.txId === entry.txId;
    }

    function _emptyBeneficiaries(value) {
        return Array.isArray(value) && value.length === 0;
    }

    function _findTransferProof(block, entry, sender, data) {
        var list = block.transfers || [];
        for (var i = 0; i < list.length; i++) {
            var proof = list[i];
            if (_sameTransaction(entry, proof) && proof.from === sender && proof.to === 'null' &&
                    proof.amountMilli === data.amount_milli && proof.memo === VTProtocol.mintMemo(data.intent) &&
                    proof.symbol === 'VIZ') {
                return { source: proof, mintMilli: data.amount_milli };
            }
        }
        return null;
    }

    function _findFixedAwardCandidate(block, entry, sender, data, exact) {
        var list = block.fixedAwards || [];
        for (var i = 0; i < list.length; i++) {
            var candidate = list[i];
            if (!_sameTransaction(entry, candidate) || candidate.initiator !== sender ||
                    candidate.receiver !== 'null' || candidate.memo !== VTProtocol.mintMemo(data.intent)) continue;
            if (!exact || (candidate.requestedMilli === data.requested_milli && candidate.symbol === 'VIZ' &&
                    Number(candidate.maxEnergy) === data.max_energy && _emptyBeneficiaries(candidate.beneficiaries))) return candidate;
        }
        return null;
    }

    function _findAwardEvidence(block, entry, sender, data) {
        var matchingSources = [];
        var awards = block.awards || [];
        for (var i = 0; i < awards.length; i++) {
            var candidate = awards[i];
            if (Number(candidate.blockNum) === Number(block.blockNum) && _sameCanonicalTransaction(entry, candidate) && Number.isInteger(entry.opIndex) &&
                    Number.isInteger(candidate.opIndex) && candidate.opIndex >= 0 &&
                    candidate.opIndex < entry.opIndex && candidate.initiator === sender && candidate.receiver === 'null' &&
                    Number.isInteger(candidate.energy) && candidate.energy === data.energy &&
                    Number.isInteger(candidate.customSequence) && candidate.memo === VTProtocol.mintMemo(data.intent) &&
                    _emptyBeneficiaries(candidate.beneficiaries)) {
                matchingSources.push(candidate);
            }
        }
        if (matchingSources.length !== 1) return { source: null, receipt: null, ambiguous: matchingSources.length > 1 };
        var source = matchingSources[0];
        var matchingReceipts = [];
        var receipts = block.awardReceipts || [];
        for (var r = 0; r < receipts.length; r++) {
            var receipt = receipts[r];
            var parsedSharesMicro = _parseSharesMicro(receipt.shares);
            if (Number(receipt.blockNum) === Number(block.blockNum) && _sameCanonicalTransaction(entry, receipt) && Number.isInteger(receipt.opIndex) && receipt.opIndex === source.opIndex &&
                    Number.isInteger(receipt.virtualOp) && receipt.virtualOp > 0 &&
                    receipt.initiator === sender && receipt.receiver === 'null' &&
                    Number.isInteger(receipt.customSequence) && receipt.customSequence === source.customSequence &&
                    receipt.memo === source.memo && parsedSharesMicro !== null && receipt.sharesMicro === parsedSharesMicro) {
                matchingReceipts.push(receipt);
            }
        }
        if (matchingReceipts.length !== 1) return { source: source, receipt: null, ambiguous: matchingReceipts.length > 1 };
        var matchedReceipt = matchingReceipts[0];
        return {
            source: source,
            receipt: matchedReceipt,
            mintMilli: Math.floor(matchedReceipt.sharesMicro / 1000),
            discardedMicroShares: matchedReceipt.sharesMicro % 1000
        };
    }

    function _parseSharesMicro(value) {
        if (typeof value !== 'string') return null;
        var match = value.match(/^((?:0|[1-9][0-9]*)\.([0-9]{6})) SHARES$/);
        if (!match) return null;
        var parts = match[1].split('.');
        var micro = Number(parts[0]) * 1000000 + Number(parts[1]);
        return Number.isSafeInteger(micro) && micro > 0 ? micro : null;
    }

    function _findMintProof(block, entry) {
        var data = entry.action.data;
        var sender = entry.sender;
        if (data.method === 'transfer') return _findTransferProof(block, entry, sender, data);
        if (data.method === 'fixed_award') {
            var fixed = _findFixedAwardCandidate(block, entry, sender, data, true);
            return fixed ? { source: fixed, mintMilli: data.requested_milli } : null;
        }
        return null;
    }

    function _rememberPendingMint(state, block, entry, reason) {
        var data = entry.action.data;
        var key = entry.sender + ':' + data.intent;
        state.pendingMints[key] = {
            account: entry.sender,
            method: data.method,
            requestedMilli: data.method === 'fixed_award' ? data.requested_milli : (data.method === 'transfer' ? data.amount_milli : null),
            blockNum: block.blockNum,
            blockHash: block.blockHash,
            reason: reason || (data.method === 'transfer' ? 'matching_burn_transfer_missing' : 'matching_reward_evidence_missing')
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
            var data = entry.action.data;
            var intentKey = entry.sender + ':' + data.intent;
            if (state.mintIntents[intentKey]) continue;
            if (data.method === 'award') {
                var awardEvidence = _findAwardEvidence(block, entry, entry.sender, data);
                if (!awardEvidence.source && block.sourceOperationsComplete !== true) {
                    _rememberPendingMint(state, block, entry, 'matching_award_source_missing');
                    return false;
                }
                if (awardEvidence.source && !awardEvidence.receipt && block.virtualReceiptsComplete !== true) {
                    _rememberPendingMint(state, block, entry, 'receive_award_receipt_missing');
                    return false;
                }
                continue;
            }
            if (!_findMintProof(block, entry)) {
                if (data.method === 'fixed_award' && _findFixedAwardCandidate(block, entry, entry.sender, data, false)) continue;
                if (block.sourceOperationsComplete === true) continue;
                _rememberPendingMint(state, block, entry);
                return false;
            }
        }
        return true;
    }

    function _mint(state, block, entry) {
        var data = entry.action.data;
        var sender = entry.sender;
        if (!_sameSignedSender(entry, sender)) return { applied: false, final: true };
        var intentKey = sender + ':' + data.intent;
        if (state.mintIntents[intentKey]) return { applied: false, final: true };
        if (data.method === 'award') {
            var awardEvidence = _findAwardEvidence(block, entry, sender, data);
            if (!awardEvidence.source && block.sourceOperationsComplete !== true) {
                _rememberPendingMint(state, block, entry, 'matching_award_source_missing');
                return { applied: false, final: false };
            }
            if (awardEvidence.source && !awardEvidence.receipt && block.virtualReceiptsComplete !== true) {
                _rememberPendingMint(state, block, entry, 'receive_award_receipt_missing');
                return { applied: false, final: false };
            }
            if (!awardEvidence.source || !awardEvidence.receipt) {
                delete state.pendingMints[intentKey];
                return { applied: false, final: true };
            }
            var awardProofId = [block.blockHash, awardEvidence.source.txIndex, awardEvidence.source.opIndex].join(':');
            if (state.usedProofs[awardProofId]) return { applied: false, final: true };
            var awardSupply = state.supplyMilli + awardEvidence.mintMilli;
            if (!Number.isSafeInteger(awardSupply) ||
                    (awardEvidence.mintMilli > 0 && !_credit(state, sender, awardEvidence.mintMilli))) {
                delete state.pendingMints[intentKey];
                return { applied: false, final: true };
            }
            state.supplyMilli = awardSupply;
            state.mintIntents[intentKey] = Number(block.blockNum);
            state.usedProofs[awardProofId] = Number(block.blockNum);
            delete state.pendingMints[intentKey];
            _history(state, {
                type: 'mint', account: sender, amountMilli: awardEvidence.mintMilli,
                intent: data.intent, method: data.method, blockNum: block.blockNum,
                sharesMicro: awardEvidence.receipt.sharesMicro,
                discardedMicroShares: awardEvidence.discardedMicroShares
            });
            return { applied: true, final: true };
        }
        var proof = _findMintProof(block, entry);
        if (!proof) {
            if (data.method === 'fixed_award' && _findFixedAwardCandidate(block, entry, sender, data, false)) {
                delete state.pendingMints[intentKey];
                return { applied: false, final: true };
            }
            if (block.sourceOperationsComplete === true) {
                delete state.pendingMints[intentKey];
                return { applied: false, final: true };
            }
            _rememberPendingMint(state, block, entry);
            return { applied: false, final: false };
        }
        var proofId = [block.blockHash, proof.source.txIndex, proof.source.opIndex].join(':');
        if (state.usedProofs[proofId]) return { applied: false, final: true };
        var nextSupply = state.supplyMilli + proof.mintMilli;
        if (!Number.isSafeInteger(nextSupply)) return { applied: false, final: true };
        if (!_credit(state, sender, proof.mintMilli)) return { applied: false, final: true };
        state.supplyMilli = nextSupply;
        state.mintIntents[intentKey] = Number(block.blockNum);
        state.usedProofs[proofId] = Number(block.blockNum);
        delete state.pendingMints[intentKey];
        _history(state, { type: 'mint', account: sender, amountMilli: proof.mintMilli, intent: data.intent, method: data.method, blockNum: block.blockNum });
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
