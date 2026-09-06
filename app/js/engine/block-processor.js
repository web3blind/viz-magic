/**
 * Viz Magic — Block Processor
 * Process blocks from VIZ chain, filter VM/V/VE operations,
 * extract game actions and social posts.
 */
var BlockProcessor = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /**
     * Process a single block and extract relevant operations
     * @param {Object} block - block data from viz.api.getBlock
     * @param {number} blockNum - block number
     * @returns {Object} {vmActions: [], voicePosts: [], awards: [], blockHash: string, timestamp: string}
     */
    function processBlock(block, blockNum) {
        var result = {
            vmActions: [],
            voicePosts: [],
            veEvents: [],
            awards: [],
            vtActions: [],
            transfers: [],
            fixedAwards: [],
            awardReceipts: [],
            sourceOperationsComplete: block.sourceOperationsComplete === true || block.source_operations_complete === true,
            virtualReceiptsComplete: block.virtualReceiptsComplete === true || block.virtual_receipts_complete === true,
            blockHash: block.block_id || '',
            huntEntropy: block.previous || block.block_id || '',
            blockNum: blockNum,
            timestamp: block.timestamp || ''
        };

        if (!block || !block.transactions) return result;

        for (var i = 0; i < block.transactions.length; i++) {
            var tx = block.transactions[i];
            if (!tx || !tx.operations) continue;

            for (var j = 0; j < tx.operations.length; j++) {
                var op = _normalizeOperation(tx.operations[j]);
                if (!op) continue;
                var opType = op[0];
                var opData = op[1];

                switch (opType) {
                    case 'custom':
                        _processCustomOp(opData, blockNum, result, block.timestamp || '', i, j, tx.transaction_id || tx.id || '');
                        break;
                    case 'award':
                        _processAwardOp(opData, blockNum, result, i, j, tx.transaction_id || tx.id || '');
                        break;
                    case 'transfer':
                        _processTransferOp(opData, blockNum, result, i, j, tx.transaction_id || tx.id || '');
                        break;
                    case 'fixed_award':
                        _processFixedAwardOp(opData, blockNum, result, i, j, tx.transaction_id || tx.id || '');
                        break;
                    // Other operations can be added as needed
                }
            }
        }

        var virtualOperations = block.virtual_operations || block.virtualOperations || [];
        for (var v = 0; v < virtualOperations.length; v++) {
            var virtualRow = virtualOperations[v] || {};
            var virtualOperation = _normalizeOperation(virtualRow.op || virtualRow.operation || virtualRow);
            if (!virtualOperation || virtualOperation[0] !== 'receive_award') continue;
            _processReceiveAwardOp(virtualOperation[1] || {}, blockNum, result, {
                txId: virtualRow.trx_id || virtualRow.txId || '',
                txIndex: Number(typeof virtualRow.trx_in_block !== 'undefined' ? virtualRow.trx_in_block : virtualRow.txIndex),
                opIndex: Number(typeof virtualRow.op_in_trx !== 'undefined' ? virtualRow.op_in_trx : virtualRow.opIndex),
                virtualOp: Number(typeof virtualRow.virtual_op !== 'undefined' ? virtualRow.virtual_op : virtualRow.virtualOp)
            });
        }

        return result;
    }

    function _normalizeOperation(op) {
        if (Array.isArray(op) && op.length >= 2) return op;
        if (!op || typeof op !== 'object') return null;
        if (Array.isArray(op.op)) return op.op;
        var type = op.type || op.op_type || '';
        var data = op.value || op.op_data || op.data || null;
        if (/_operation$/.test(type)) type = type.replace(/_operation$/, '');
        return type && data ? [type, data] : null;
    }

    /**
     * Process a custom operation
     */
    function _processCustomOp(opData, blockNum, result, blockTimestamp, txIndex, opIndex, txId) {
        var sender = '';
        if (opData.required_regular_auths && opData.required_regular_auths.length > 0) {
            sender = opData.required_regular_auths[0];
        } else if (opData.required_active_auths && opData.required_active_auths.length > 0) {
            sender = opData.required_active_auths[0];
        }

        if (cfg.PROTOCOLS.VT && opData.id === cfg.PROTOCOLS.VT && typeof VTProtocol !== 'undefined') {
            var vtAction = VTProtocol.parseAction(opData.json);
            if (vtAction) {
                result.vtActions.push({
                    sender: sender,
                    action: vtAction,
                    blockNum: blockNum,
                    txId: txId || '',
                    txIndex: txIndex,
                    opIndex: opIndex,
                    regularAuths: (opData.required_regular_auths || []).slice(),
                    activeAuths: (opData.required_active_auths || []).slice(),
                    raw: opData
                });
            }
        } else if (opData.id === cfg.PROTOCOLS.VM) {
            var action = VMProtocol.parseAction(opData.json);
            if (action) {
                result.vmActions.push({
                    sender: sender,
                    action: action,
                    blockNum: blockNum,
                    txIndex: txIndex,
                    opIndex: opIndex,
                    raw: opData
                });
            }
        } else if (opData.id === cfg.PROTOCOLS.V) {
            var message = VoiceProtocol.parseMessage(opData.json);
            if (message) {
                result.voicePosts.push({
                    sender: sender,
                    message: message,
                    blockNum: blockNum,
                    blockTime: blockTimestamp || '',
                    txIndex: txIndex,
                    opIndex: opIndex
                });
            }
        } else if (opData.id === cfg.PROTOCOLS.VE) {
            var event = VoiceProtocol.parseEvent(opData.json);
            if (event) {
                result.veEvents.push({
                    sender: sender,
                    event: event,
                    blockNum: blockNum,
                    txIndex: txIndex,
                    opIndex: opIndex
                });
            }
        }
    }

    /**
     * Process an award operation
     */
    function _processAwardOp(opData, blockNum, result, txIndex, opIndex, txId) {
        result.awards.push({
            initiator: opData.initiator,
            receiver: opData.receiver,
            energy: opData.energy,
            customSequence: opData.custom_sequence,
            memo: opData.memo || '',
            beneficiaries: opData.beneficiaries,
            txId: txId || '',
            txIndex: txIndex,
            opIndex: opIndex,
            blockNum: blockNum
        });
    }

    function _assetParts(value) {
        if (typeof value !== 'string') return { amountMilli: null, symbol: '' };
        var match = value.match(/^((?:0|[1-9][0-9]*)\.[0-9]{3}) ([A-Z]{1,8})$/);
        if (!match || typeof VTProtocol === 'undefined') return { amountMilli: null, symbol: match ? match[2] : '' };
        return { amountMilli: VTProtocol.parseAmount(match[1]), symbol: match[2] };
    }

    function _processTransferOp(opData, blockNum, result, txIndex, opIndex, txId) {
        var asset = _assetParts(opData.amount);
        result.transfers.push({
            from: opData.from || '', to: opData.to || '', amount: opData.amount || '',
            amountMilli: asset.amountMilli, symbol: asset.symbol, memo: opData.memo || '',
            blockNum: blockNum, txId: txId || '', txIndex: txIndex, opIndex: opIndex, raw: opData
        });
    }

    function _processFixedAwardOp(opData, blockNum, result, txIndex, opIndex, txId) {
        var asset = _assetParts(opData.reward_amount);
        result.fixedAwards.push({
            initiator: opData.initiator || '', receiver: opData.receiver || '',
            requestedMilli: asset.amountMilli, symbol: asset.symbol,
            maxEnergy: opData.max_energy, customSequence: opData.custom_sequence,
            memo: opData.memo || '', beneficiaries: opData.beneficiaries,
            blockNum: blockNum, txId: txId || '', txIndex: txIndex, opIndex: opIndex, raw: opData
        });
    }

    function _parseShares(value) {
        if (typeof value !== 'string') return null;
        var match = value.match(/^((?:0|[1-9][0-9]*)\.([0-9]{6})) SHARES$/);
        if (!match) return null;
        var parts = match[1].split('.');
        var micro = Number(parts[0]) * 1000000 + Number(parts[1]);
        return Number.isSafeInteger(micro) && micro > 0 ? micro : null;
    }

    function _processReceiveAwardOp(opData, blockNum, result, position) {
        var sharesMicro = _parseShares(opData.shares);
        if (!sharesMicro || !Number.isInteger(position.txIndex) || position.txIndex < 0 ||
                !Number.isInteger(position.opIndex) || position.opIndex < 0 ||
                !Number.isInteger(position.virtualOp) || position.virtualOp <= 0) return;
        result.awardReceipts.push({
            initiator: opData.initiator || '', receiver: opData.receiver || '',
            customSequence: opData.custom_sequence,
            memo: opData.memo || '', shares: opData.shares, sharesMicro: sharesMicro,
            blockNum: blockNum, txId: position.txId || '', txIndex: position.txIndex,
            opIndex: position.opIndex, virtualOp: position.virtualOp, raw: opData
        });
    }


    /**
     * Fetch and process a range of blocks
     * @param {number} startBlock
     * @param {number} endBlock
     * @param {Function} onBlock - callback(processedBlock, blockNum) for each block
     * @param {Function} onComplete - callback(err) when done
     */
    function processBlockRange(startBlock, endBlock, onBlock, onComplete) {
        var current = startBlock;
        var total = endBlock - startBlock + 1;
        // Use shorter delays when catching up on many blocks
        var isCatchUp = total > 100;

        function nextBlock() {
            if (current > endBlock) {
                onComplete(null);
                return;
            }

            var fetchBlock = (typeof HistorySource !== 'undefined' && HistorySource.getBlock)
                ? HistorySource.getBlock
                : ((typeof VizAccount !== 'undefined' && VizAccount.getBlock) ? VizAccount.getBlock : null);
            if (!fetchBlock) {
                onComplete(new Error('block_fetch_unavailable'), current);
                return;
            }
            fetchBlock(current, function(err, block) {
                if (err || !block) {
                    console.log('Block fetch error at', current, err);
                    onComplete(err || new Error('block_missing_' + current), current);
                    return;
                }

                var processed = processBlock(block, current);
                onBlock(processed, current);
                current++;

                // Skip delay for empty blocks during catch-up; short delay otherwise
                var hasContent = processed.vmActions.length > 0 || processed.veEvents.length > 0 || processed.voicePosts.length > 0 || processed.awards.length > 0 || processed.vtActions.length > 0 || processed.transfers.length > 0 || processed.fixedAwards.length > 0 || processed.awardReceipts.length > 0;
                if (isCatchUp && !hasContent) {
                    nextBlock();
                } else {
                    setTimeout(nextBlock, isCatchUp ? 10 : 50);
                }
            });
        }

        nextBlock();
    }

    /**
     * Start streaming new blocks as they arrive
     * @param {Function} onBlock - callback(processedBlock, blockNum)
     * @returns {Function} release function to stop streaming
     */
    function startStreaming(onBlock) {
        return viz.api.streamBlock('head', function(err, block, blockNum) {
            if (err || !block) return;
            var processed = processBlock(block, blockNum);
            onBlock(processed, blockNum);
        });
    }

    return {
        processBlock: processBlock,
        processBlockRange: processBlockRange,
        startStreaming: startStreaming
    };
})();
