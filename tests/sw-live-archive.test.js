'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
function probe(source) {
  const handlers = {};
  let cacheReads = 0;
  const context = {
    URL, console, setTimeout, clearTimeout,
    self: {location: {origin: 'https://vizmagic.web3blind.xyz'}, addEventListener: (name, fn) => handlers[name] = fn},
    caches: {match: () => { cacheReads++; return Promise.resolve({lastIndexedBlock: 83187545}); }},
    fetch: () => Promise.reject(new Error('must use browser network directly'))
  };
  vm.runInNewContext(source, context);
  for (const pathname of ['/archive-mirror/health', '/archive-mirror/v1/status', '/archive-mirror/v1/range?start=83187546&end=83187578', '/archive-mirror/v1/block/83187546.json']) {
    let intercepted = false;
    handlers.fetch({request: {url: context.self.location.origin + pathname, method: 'GET', mode: 'cors'}, respondWith: () => {intercepted = true;}});
    assert.strictEqual(intercepted, false, pathname + ' must not use stale SW responses');
  }
  assert.strictEqual(cacheReads, 0);
}
const source = fs.readFileSync(path.join(__dirname, '../app/sw.js'), 'utf8');
probe(source);
console.log('PASS live mirror requests bypass stale service-worker caches');
