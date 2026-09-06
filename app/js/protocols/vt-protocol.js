/**
 * VT — VIZ Tokens protocol helpers for the Viz Magic MAGIC currency.
 * Monetary values are integer milliunits. No floating-point accounting.
 */
var VTProtocol = (function() {
    'use strict';

    var PROTOCOL = 'VT';
    var VERSION = 1;
    var MAX_SAFE_MILLI = Number.MAX_SAFE_INTEGER;
    var ACCOUNT_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;
    var INTENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
    var LISTING_RE = /^[0-9]+_[a-zA-Z0-9_-]{1,120}$/;

    function parseAmount(value) {
        if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/.test(value)) return null;
        var parts = value.split('.');
        var whole = Number(parts[0]);
        var fraction = (parts[1] || '') + '000';
        var milli = whole * 1000 + Number(fraction.slice(0, 3));
        if (!Number.isSafeInteger(milli) || milli <= 0 || milli > MAX_SAFE_MILLI) return null;
        return milli;
    }

    function parseAsset(value, symbol) {
        if (typeof value !== 'string') return null;
        var match = value.match(/^((?:0|[1-9][0-9]*)(?:\.[0-9]{3})) ([A-Z]{1,8})$/);
        if (!match || match[2] !== (symbol || 'VIZ')) return null;
        return parseAmount(match[1]);
    }

    function formatAmount(milli) {
        if (!Number.isSafeInteger(milli) || milli < 0) return '';
        var whole = Math.floor(milli / 1000);
        var fraction = String(milli % 1000);
        while (fraction.length < 3) fraction = '0' + fraction;
        return String(whole) + '.' + fraction;
    }

    function validAccount(account) {
        return typeof account === 'string' && account.length >= 2 && account.length <= 25 && ACCOUNT_RE.test(account) && account.indexOf('--') === -1;
    }

    function validIntent(intent) {
        return typeof intent === 'string' && INTENT_RE.test(intent);
    }

    function mintMemo(intent) {
        if (!validIntent(intent)) return '';
        return 'viz://vt/mint/v1/' + intent;
    }

    function _base(type, data) {
        return { p: PROTOCOL, v: VERSION, t: type, d: data };
    }

    function createMintAction(intent, method, amount, options) {
        if (method === 'award') return createAwardMintAction(intent, options && options.energy);
        var amountMilli = parseAmount(amount);
        if (!validIntent(intent) || (method !== 'transfer' && method !== 'fixed_award') || amountMilli === null) return null;
        if (method === 'fixed_award') {
            options = options || {};
            if (!Number.isInteger(options.maxEnergy) || options.maxEnergy <= 0 || options.maxEnergy > 10000) return null;
            return _base('mint', { intent: intent, method: method, requested_milli: amountMilli, max_energy: options.maxEnergy });
        }
        return _base('mint', { intent: intent, method: method, amount_milli: amountMilli });
    }

    function createAwardMintAction(intent, energy) {
        if (!validIntent(intent) || !Number.isInteger(energy) || energy <= 0 || energy > 10000) return null;
        return _base('mint', { intent: intent, method: 'award', energy: energy });
    }

    function createTransferAction(to, amount, nonce) {
        var amountMilli = parseAmount(amount);
        if (!validAccount(to) || !validIntent(nonce) || amountMilli === null) return null;
        return _base('transfer', { to: to, amount_milli: amountMilli, nonce: nonce });
    }

    function createBazaarBuyAction(listingRef, revision, priceMilli) {
        if (typeof listingRef !== 'string' || !LISTING_RE.test(listingRef) ||
            !Number.isSafeInteger(revision) || revision <= 0 ||
            !Number.isSafeInteger(priceMilli) || priceMilli <= 0) return null;
        return _base('bazaar.buy', { listing_ref: listingRef, revision: revision, price_milli: priceMilli });
    }

    function parseAction(raw) {
        var value = raw;
        if (typeof raw === 'string') {
            try { value = JSON.parse(raw); } catch (err) { return null; }
        }
        if (!value || value.p !== PROTOCOL || Number(value.v) !== VERSION || typeof value.t !== 'string' || !value.d) return null;
        var d = value.d;
        if (value.t === 'mint') {
            if (!validIntent(d.intent) || ['transfer', 'fixed_award', 'award'].indexOf(d.method) === -1) return null;
            if (d.method === 'transfer' && (!Number.isSafeInteger(d.amount_milli) || d.amount_milli <= 0)) return null;
            if (d.method === 'fixed_award' && (!Number.isSafeInteger(d.requested_milli) || d.requested_milli <= 0 ||
                !Number.isInteger(d.max_energy) || d.max_energy <= 0 || d.max_energy > 10000)) return null;
            if (d.method === 'award' && (!Number.isInteger(d.energy) || d.energy <= 0 || d.energy > 10000)) return null;
        } else if (value.t === 'transfer') {
            if (!validAccount(d.to) || !validIntent(d.nonce) || !Number.isSafeInteger(d.amount_milli) || d.amount_milli <= 0) return null;
        } else if (value.t === 'bazaar.buy') {
            if (typeof d.listing_ref !== 'string' || !LISTING_RE.test(d.listing_ref) ||
                !Number.isSafeInteger(d.revision) || d.revision <= 0 ||
                !Number.isSafeInteger(d.price_milli) || d.price_milli <= 0) return null;
        } else {
            return null;
        }
        return { protocol: PROTOCOL, version: VERSION, type: value.t, data: d, raw: value };
    }

    return {
        PROTOCOL: PROTOCOL,
        VERSION: VERSION,
        parseAmount: parseAmount,
        parseAsset: parseAsset,
        formatAmount: formatAmount,
        validAccount: validAccount,
        validIntent: validIntent,
        mintMemo: mintMemo,
        createMintAction: createMintAction,
        createAwardMintAction: createAwardMintAction,
        createTransferAction: createTransferAction,
        createBazaarBuyAction: createBazaarBuyAction,
        parseAction: parseAction
    };
})();
