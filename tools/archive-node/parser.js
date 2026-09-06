'use strict';

var GAME_PROTOCOLS = { VM: true, V: true, VE: true, VT: true };

function parseJsonMaybe(value) {
    if (typeof value !== 'string') return value || null;
    try {
        return JSON.parse(value);
    } catch (err) {
        return null;
    }
}

function getSender(opData) {
    if (!opData) return '';
    if (opData.required_regular_auths && opData.required_regular_auths.length) return opData.required_regular_auths[0];
    if (opData.required_active_auths && opData.required_active_auths.length) return opData.required_active_auths[0];
    return '';
}

function uniquePush(list, value) {
    if (value && list.indexOf(value) === -1) list.push(value);
}

function collectAccountsFromPayload(payload, accounts) {
    if (!payload || typeof payload !== 'object') return;
    var keys = ['account', 'user', 'target', 'target_user', 'from', 'to', 'author', 'guild_id', 'receiver', 'initiator'];
    for (var i = 0; i < keys.length; i += 1) {
        var value = payload[keys[i]];
        if (typeof value === 'string') uniquePush(accounts, value);
    }
}

function normalizeCustom(block, blockNum, txIndex, opIndex, opData) {
    var protocol = opData && opData.id;
    if (!GAME_PROTOCOLS[protocol]) return null;
    var sender = getSender(opData);
    var parsed = parseJsonMaybe(opData.json);
    var actionType = parsed && (parsed.t || parsed.type || parsed.action || parsed.event || parsed.p) || 'custom';
    var accounts = [];
    uniquePush(accounts, sender);
    collectAccountsFromPayload(parsed, accounts);
    if (parsed && parsed.d) collectAccountsFromPayload(parsed.d, accounts);
    return {
        blockNum: Number(blockNum),
        block_id: block && (block.block_id || block.id || ''),
        previous: block && (block.previous || block.previous_block_id || ''),
        timestamp: block && block.timestamp || '',
        txIndex: txIndex,
        opIndex: opIndex,
        txId: block && block.transactions && block.transactions[txIndex] && (block.transactions[txIndex].transaction_id || block.transactions[txIndex].id || '') || '',
        opType: 'custom',
        protocol: protocol,
        type: actionType,
        sender: sender,
        regularAuths: opData.required_regular_auths || [],
        activeAuths: opData.required_active_auths || [],
        accounts: accounts,
        payload: parsed,
        raw: opData
    };
}

function isGameAward(opData) {
    var memo = opData && opData.memo || '';
    // VIZ award is global blockchain traffic. Index only awards that Viz Magic
    // explicitly marks as in-game social blessings. Economic author rewards
    // attached to hunts are already represented by the VM hunt action, so a
    // bare award with empty/random memo is intentionally ignored here.
    return String(memo).indexOf('viz://vm/') === 0;
}

function normalizeAward(block, blockNum, txIndex, opIndex, opData) {
    var vtAward = isVtMemo(opData) && opData && opData.receiver === 'null';
    if (!isGameAward(opData) && !vtAward) return null;
    var accounts = [];
    uniquePush(accounts, opData && opData.initiator);
    uniquePush(accounts, opData && opData.receiver);
    return {
        blockNum: Number(blockNum),
        block_id: block && (block.block_id || block.id || ''),
        previous: block && (block.previous || block.previous_block_id || ''),
        timestamp: block && block.timestamp || '',
        txIndex: txIndex,
        opIndex: opIndex,
        txId: block.transactions[txIndex] && (block.transactions[txIndex].transaction_id || block.transactions[txIndex].id || '') || '',
        opType: 'award',
        protocol: vtAward ? 'VT' : 'award',
        type: vtAward ? 'mint.award' : 'award',
        sender: opData && opData.initiator || '',
        account: opData && opData.receiver || '',
        accounts: accounts,
        payload: {
            initiator: opData && opData.initiator,
            receiver: opData && opData.receiver,
            energy: opData && opData.energy,
            custom_sequence: opData && opData.custom_sequence,
            memo: opData && opData.memo || '',
            beneficiaries: opData && opData.beneficiaries
        },
        raw: opData
    };
}

function isVtMemo(opData) {
    return String(opData && opData.memo || '').indexOf('viz://vt/mint/v1/') === 0;
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    var result = {};
    Object.keys(value).sort().forEach(function(key) { result[key] = stableValue(value[key]); });
    return result;
}

function sameOperation(left, right) {
    return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function isVtSourceOperation(op) {
    var type = op && op[0];
    var data = op && op[1] || {};
    return (type === 'custom' && data.id === 'VT') ||
        ((type === 'award' || type === 'transfer' || type === 'fixed_award') && isVtMemo(data));
}

function bindOperationHistory(block, blockNum, rows) {
    if (!block || !Array.isArray(block.transactions) || !Array.isArray(rows)) throw new Error('operation history unavailable');
    var sourceByPosition = {};
    for (var i = 0; i < rows.length; i += 1) {
        var row = rows[i] || {};
        if (Number(row.block) !== Number(blockNum)) throw new Error('operation history block mismatch');
        if (Number(row.virtual_op || 0) !== 0) continue;
        var txIndex = Number(row.trx_in_block);
        var opIndex = Number(row.op_in_trx);
        if (!Number.isInteger(txIndex) || txIndex < 0 || !Number.isInteger(opIndex) || opIndex < 0) continue;
        if (sourceByPosition[txIndex + ':' + opIndex]) throw new Error('duplicate operation history source');
        sourceByPosition[txIndex + ':' + opIndex] = row;
        if (block.transactions[txIndex]) {
            var existingId = block.transactions[txIndex].transaction_id || block.transactions[txIndex].id || '';
            if (existingId && row.trx_id && existingId !== row.trx_id) throw new Error('operation history transaction mismatch');
            if (row.trx_id) block.transactions[txIndex].transaction_id = row.trx_id;
        }
    }
    for (var tx = 0; tx < block.transactions.length; tx += 1) {
        var operations = block.transactions[tx] && block.transactions[tx].operations || [];
        for (var operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
            var operation = operations[operationIndex];
            if (!isVtSourceOperation(operation)) continue;
            var source = sourceByPosition[tx + ':' + operationIndex];
            if (!source || !sameOperation(source.op, operation)) throw new Error('operation history source mismatch');
        }
    }
    return block;
}

function parseSharesMicro(value) {
    var match = typeof value === 'string' && value.match(/^((?:0|[1-9][0-9]*)\.([0-9]{6})) SHARES$/);
    if (!match) return null;
    var parts = match[1].split('.');
    var micro = Number(parts[0]) * 1000000 + Number(parts[1]);
    return Number.isSafeInteger(micro) && micro > 0 ? micro : null;
}

function extractVirtualEvents(block, blockNum, rows) {
    var events = [];
    if (!Array.isArray(rows)) return events;
    var sources = {};
    var ambiguousSources = {};
    for (var i = 0; i < rows.length; i += 1) {
        var sourceRow = rows[i] || {};
        if (Number(sourceRow.block) === Number(blockNum) && Number(sourceRow.virtual_op || 0) === 0 &&
                sourceRow.op && sourceRow.op[0] === 'award') {
            var sourceKey = Number(sourceRow.trx_in_block) + ':' + Number(sourceRow.op_in_trx);
            if (sources[sourceKey]) ambiguousSources[sourceKey] = true;
            else sources[sourceKey] = sourceRow;
        }
    }
    for (var r = 0; r < rows.length; r += 1) {
        var row = rows[r] || {};
        var data = row.op && row.op[1] || {};
        var txIndex = Number(row.trx_in_block);
        var opIndex = Number(row.op_in_trx);
        var virtualOp = Number(row.virtual_op || 0);
        var sharesMicro = row.op && row.op[0] === 'receive_award' ? parseSharesMicro(data.shares) : null;
        var receiptSourceKey = txIndex + ':' + opIndex;
        var source = ambiguousSources[receiptSourceKey] ? null : sources[receiptSourceKey];
        var sourceData = source && source.op && source.op[1] || {};
        if (Number(row.block) !== Number(blockNum) || !Number.isInteger(txIndex) || txIndex < 0 ||
                !Number.isInteger(opIndex) || opIndex < 0 || !Number.isInteger(virtualOp) || virtualOp <= 0 ||
                !sharesMicro || !source ||
                !row.trx_id || row.trx_id !== source.trx_id ||
                sourceData.receiver !== 'null' || !isVtMemo(sourceData) || !isVtMemo(data) ||
                sourceData.initiator !== data.initiator || sourceData.receiver !== data.receiver ||
                Number(sourceData.custom_sequence || 0) !== Number(data.custom_sequence || 0) ||
                sourceData.memo !== data.memo || (sourceData.beneficiaries || []).length !== 0) continue;
        events.push({
            blockNum: Number(blockNum), block_id: block.block_id || '', previous: block.previous || '', timestamp: row.timestamp || block.timestamp || '',
            txIndex: txIndex, opIndex: opIndex, virtualOp: virtualOp, txId: row.trx_id || '',
            opType: 'receive_award', protocol: 'VT', type: 'mint.award.receipt',
            sender: data.initiator || '', account: data.initiator || '', accounts: [data.initiator || '', 'null'].filter(Boolean),
            payload: { initiator: data.initiator || '', receiver: data.receiver || '', custom_sequence: data.custom_sequence, memo: data.memo || '', shares: data.shares, shares_micro: sharesMicro },
            raw: data
        });
    }
    return events;
}

function normalizeTransfer(block, blockNum, txIndex, opIndex, opData) {
    if (!opData || opData.to !== 'null' || !isVtMemo(opData) || !/^[0-9]+\.[0-9]{3} VIZ$/.test(opData.amount || '')) return null;
    return {
        blockNum: Number(blockNum), block_id: block.block_id || '', previous: block.previous || '', timestamp: block.timestamp || '',
        txIndex: txIndex, opIndex: opIndex,
        txId: block.transactions[txIndex] && (block.transactions[txIndex].transaction_id || block.transactions[txIndex].id || '') || '',
        opType: 'transfer', protocol: 'VT', type: 'mint.transfer', sender: opData.from || '', account: opData.from || '',
        accounts: [opData.from || '', 'null'].filter(Boolean), payload: opData, raw: opData
    };
}

function normalizeFixedAward(block, blockNum, txIndex, opIndex, opData) {
    if (!opData || opData.receiver !== 'null' || !isVtMemo(opData) || !/^[0-9]+\.[0-9]{3} VIZ$/.test(opData.reward_amount || '')) return null;
    return {
        blockNum: Number(blockNum), block_id: block.block_id || '', previous: block.previous || '', timestamp: block.timestamp || '',
        txIndex: txIndex, opIndex: opIndex,
        txId: block.transactions[txIndex] && (block.transactions[txIndex].transaction_id || block.transactions[txIndex].id || '') || '',
        opType: 'fixed_award', protocol: 'VT', type: 'mint.fixed_award', sender: opData.initiator || '', account: opData.initiator || '',
        accounts: [opData.initiator || '', 'null'].filter(Boolean), payload: opData, raw: opData
    };
}

function extractGameEvents(block, blockNum) {
    var events = [];
    if (!block || !block.transactions) return events;
    for (var i = 0; i < block.transactions.length; i += 1) {
        var tx = block.transactions[i] || {};
        var ops = tx.operations || [];
        for (var j = 0; j < ops.length; j += 1) {
            var op = ops[j] || [];
            var opType = op[0];
            var opData = op[1] || {};
            var event = null;
            if (opType === 'custom') event = normalizeCustom(block, blockNum, i, j, opData);
            else if (opType === 'award') event = normalizeAward(block, blockNum, i, j, opData);
            else if (opType === 'transfer') event = normalizeTransfer(block, blockNum, i, j, opData);
            else if (opType === 'fixed_award') event = normalizeFixedAward(block, blockNum, i, j, opData);
            if (event) events.push(event);
        }
    }
    return events;
}

module.exports = {
    extractGameEvents: extractGameEvents,
    parseJsonMaybe: parseJsonMaybe,
    getSender: getSender,
    isGameAward: isGameAward,
    isVtMemo: isVtMemo,
    bindOperationHistory: bindOperationHistory,
    extractVirtualEvents: extractVirtualEvents,
    parseSharesMicro: parseSharesMicro
};
