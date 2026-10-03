'use strict';
var assert = require('node:assert/strict');
var test = require('node:test');
var fs = require('fs');
var vm = require('vm');
var file = 'app/js/utils/map-favorites.js';
function load(data, failure) {
    var store = data || {};
    var context = { localStorage: {
        getItem: function(k) { if (failure === 'read') throw Error('blocked'); return store[k] || null; },
        setItem: function(k, v) { if (failure === 'write') throw Error('quota'); store[k] = v; }
    } };
    assert.ok(fs.existsSync(file), 'browser-local favorites module exists');
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
    context.MapFavorites.configure(['day1:commons_first_light', 'world:commons_first_light']);
    return { api: context.MapFavorites, store: store };
}
test('save persists one unique map across reload, isolates guest and accounts', function() {
    var x = load();
    assert.equal(x.api.add('alice', 'day1:commons_first_light').status, 'added');
    assert.equal(x.api.add('alice', 'day1:commons_first_light').status, 'duplicate');
    assert.deepEqual(Array.from(load(x.store).api.read('alice').ids), ['day1:commons_first_light']);
    assert.deepEqual(Array.from(x.api.read('bob').ids), []);
    assert.deepEqual(Array.from(x.api.read(null).ids), []);
    assert.equal(x.api.add(null, 'world:commons_first_light').status, 'added');
    assert.deepEqual(Array.from(x.api.read('alice').ids), ['day1:commons_first_light']);
});
test('15 unique IDs maximum; duplicate at limit does not replace; removal frees a slot', function() {
    var x = load();
    var ids = Array.from({ length: 16 }, function(_, i) { return 'chapter2:' + String(i + 1).padStart(2, '0'); });
    x.api.configure(ids);
    ids.slice(0, 15).forEach(function(id) { assert.equal(x.api.add('alice', id).status, 'added'); });
    assert.equal(x.api.add('alice', ids[0]).status, 'duplicate');
    assert.equal(x.api.add('alice', ids[15]).status, 'full');
    assert.equal(x.api.read('alice').ids.length, 15);
    assert.equal(x.api.remove('alice', ids[2]).status, 'removed');
    assert.equal(x.api.add('alice', ids[15]).status, 'added');
    assert.equal(x.api.read('alice').ids.length, 15);
});
test('corrupt records recover safely; sanitize unknown, non-string, duplicate and overflow IDs', function() {
    ['{', '{}', 'null', '"text"'].forEach(function(raw) {
        var x = load({ 'viz_magic_map_favorites_account:alice': raw });
        assert.deepEqual(Array.from(x.api.read('alice').ids), []);
        assert.equal(x.api.add('alice', 'day1:commons_first_light').status, 'added');
    });
    var x = load({ 'viz_magic_map_favorites_account:alice': JSON.stringify(['bad', 1, 'day1:commons_first_light', 'day1:commons_first_light']) });
    assert.deepEqual(Array.from(x.api.read('alice').ids), ['day1:commons_first_light']);
    assert.equal(x.api.add('alice', 'bad').status, 'invalid');
    var ids = Array.from({ length: 20 }, function(_, i) { return 'chapter2:' + i; });
    x.api.configure(ids);
    x.store['viz_magic_map_favorites_account:alice'] = JSON.stringify(ids);
    assert.equal(x.api.read('alice').ids.length, 15);
});
test('storage read/write failures report error and do not pretend to persist or remove', function() {
    var x = load({}, 'read');
    assert.equal(x.api.read('alice').error, true);
    assert.equal(x.api.add('alice', 'day1:commons_first_light').status, 'error');
    assert.equal(x.api.remove('alice', 'day1:commons_first_light').status, 'error');
    var store = { 'viz_magic_map_favorites_account:alice': '["day1:commons_first_light"]' };
    x = load(store, 'write');
    assert.equal(x.api.add('alice', 'world:commons_first_light').status, 'error');
    assert.equal(x.api.remove('alice', 'day1:commons_first_light').status, 'error');
    assert.deepEqual(Array.from(x.api.read('alice').ids), ['day1:commons_first_light']);
});
