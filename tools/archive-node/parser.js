'use strict';

var GAME_PROTOCOLS = { VM: true, V: true, VE: true };

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
        opType: 'custom',
        protocol: protocol,
        type: actionType,
        sender: sender,
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
    if (!isGameAward(opData)) return null;
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
        opType: 'award',
        protocol: 'award',
        type: 'award',
        sender: opData && opData.initiator || '',
        account: opData && opData.receiver || '',
        accounts: accounts,
        payload: {
            initiator: opData && opData.initiator,
            receiver: opData && opData.receiver,
            energy: opData && opData.energy,
            custom_sequence: opData && opData.custom_sequence,
            memo: opData && opData.memo || '',
            beneficiaries: opData && opData.beneficiaries || []
        },
        raw: opData
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
            if (event) events.push(event);
        }
    }
    return events;
}

module.exports = {
    extractGameEvents: extractGameEvents,
    parseJsonMaybe: parseJsonMaybe,
    getSender: getSender,
    isGameAward: isGameAward
};
