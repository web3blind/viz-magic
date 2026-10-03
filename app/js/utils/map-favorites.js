/** Browser-local preferences only; never a library entitlement. */
var MapFavorites = (function() {
    'use strict';
    var supported = [];
    function configure(ids) { supported = ids.slice(); }
    function key(account) { return 'viz_magic_map_favorites_' + (account ? 'account:' + account : 'guest'); }
    function read(account) {
        var raw;
        try { raw = localStorage.getItem(key(account)); }
        catch (e) { return { ids: [], error: true }; }
        var parsed;
        try { parsed = raw ? JSON.parse(raw) : []; }
        catch (e) { parsed = []; }
        var ids = [];
        if (Array.isArray(parsed)) {
            for (var i = 0; i < parsed.length && ids.length < 15; i++) {
                if (typeof parsed[i] === 'string' && supported.indexOf(parsed[i]) !== -1 && ids.indexOf(parsed[i]) === -1) ids.push(parsed[i]);
            }
        }
        return { ids: ids, error: false };
    }
    function save(account, ids, status) {
        try { localStorage.setItem(key(account), JSON.stringify(ids)); }
        catch (e) { return { status: 'error' }; }
        return { status: status };
    }
    function add(account, id) {
        if (supported.indexOf(id) === -1) return { status: 'invalid' };
        var state = read(account);
        if (state.error) return { status: 'error' };
        var ids = state.ids;
        if (ids.indexOf(id) !== -1) return { status: 'duplicate' };
        if (ids.length >= 15) return { status: 'full' };
        ids.push(id);
        return save(account, ids, 'added');
    }
    function remove(account, id) {
        var state = read(account);
        if (state.error) return { status: 'error' };
        var ids = state.ids;
        var index = ids.indexOf(id);
        if (index !== -1) ids.splice(index, 1);
        return save(account, ids, 'removed');
    }
    return { configure: configure, read: read, add: add, remove: remove };
})();
