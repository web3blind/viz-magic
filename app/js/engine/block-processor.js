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
            blockHash: block.block_id || '',
            blockNum: blockNum,
            timestamp: block.timestamp || ''
        };

        if (!block || !block.transactions) return result;

        for (var i = 0; i < block.transactions.length; i++) {
            var tx = block.transactions[i];
            if (!tx.operations) continue;

            for (var j = 0; j < tx.operations.length; j++) {
                var op = tx.operations[j];
                var opType = op[0];
                var opData = op[1];

                switch (opType) {
                    case 'custom':
                        _processCustomOp(opData, blockNum, result);
                        break;
                    case 'award':
                        _processAwardOp(opData, blockNum, result);
                        break;
                    // Other operations can be added as needed
                }
            }
        }

        return result;
    }

    /**
     * Process a custom operation
     */
    function _processCustomOp(opData, blockNum, result) {
        var sender = '';
        if (opData.required_regular_auths && opData.required_regular_auths.length > 0) {
            sender = opData.required_regular_auths[0];
        } else if (opData.required_active_auths && opData.required_active_auths.length > 0) {
            sender = opData.required_active_auths[0];
        }

        if (opData.id === cfg.PROTOCOLS.VM) {
            var action = VMProtocol.parseAction(opData.json);
            if (action) {
                result.vmActions.push({
                    sender: sender,
                    action: action,
                    blockNum: blockNum,
                    raw: opData
                });
            }
        } else if (opData.id === cfg.PROTOCOLS.V) {
            var message = VoiceProtocol.parseMessage(opData.json);
            if (message) {
                result.voicePosts.push({
                    sender: sender,
                    message: message,
                    blockNum: blockNum
                });
            }
        } else if (opData.id === cfg.PROTOCOLS.VE) {
            var event = VoiceProtocol.parseEvent(opData.json);
            if (event) {
                result.veEvents.push({
                    sender: sender,
                    event: event,
                    blockNum: blockNum
                });
            }
        }
    }

    /**
     * Process an award operation
     */
    function _processAwardOp(opData, blockNum, result) {
        result.awards.push({
            initiator: opData.initiator,
            receiver: opData.receiver,
            energy: opData.energy,
            customSequence: opData.custom_sequence,
            memo: opData.memo || '',
            beneficiaries: opData.beneficiaries || [],
            blockNum: blockNum
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

        function nextBlock() {
            if (current > endBlock) {
                onComplete(null);
                return;
            }

            viz.api.getBlock(current, function(err, block) {
                if (err || !block) {
                    console.log('Block fetch error at', current, err);
                    current++;
                    setTimeout(nextBlock, 100);
                    return;
                }

                var processed = processBlock(block, current);
                onBlock(processed, current);
                current++;

                // Small delay to avoid overwhelming the node
                setTimeout(nextBlock, 50);
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
