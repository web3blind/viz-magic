/**
 * Smoke test — opens the app in headless Chromium via Puppeteer,
 * checks for JS errors, verifies key screens render.
 *
 * Usage: node tests/smoke.js
 * Starts its own HTTP server on port 8199, tears it down when done.
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var puppeteer = require('puppeteer');

// ---------- tiny static server ----------
var APP_DIR = path.join(__dirname, '..', 'app');
var PORT = 8199;
var MIME = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.png':  'image/png',
    '.svg':  'image/svg+xml'
};

function startServer() {
    return new Promise(function (resolve) {
        var srv = http.createServer(function (req, res) {
            var url = req.url.split('?')[0];
            if (url === '/') url = '/index.html';
            var filePath = path.join(APP_DIR, url);
            var ext = path.extname(filePath);
            fs.readFile(filePath, function (err, data) {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
                res.end(data);
            });
        });
        srv.listen(PORT, function () {
            console.log('Server listening on port ' + PORT);
            resolve(srv);
        });
    });
}

// ---------- test runner ----------
var errors = [];
var warnings = [];
var passed = 0;
var failed = 0;

function assert(label, ok, detail) {
    if (ok) {
        passed++;
        console.log('  PASS: ' + label);
    } else {
        failed++;
        console.log('  FAIL: ' + label + (detail ? ' — ' + detail : ''));
    }
}

async function runTests() {
    var srv = await startServer();
    var browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        });
        var page = await browser.newPage();

        // Collect console errors
        page.on('console', function (msg) {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            } else if (msg.type() === 'warning') {
                warnings.push(msg.text());
            }
        });

        // Collect uncaught exceptions
        page.on('pageerror', function (err) {
            errors.push('PAGE ERROR: ' + err.message);
        });

        // ---------- 1. Page loads without crash ----------
        console.log('\n--- Test: page load ---');
        await page.goto('http://localhost:' + PORT + '/', {
            waitUntil: 'networkidle0',
            timeout: 15000
        });
        assert('Page loaded', true);

        // ---------- 2. Key globals exist ----------
        console.log('\n--- Test: global modules ---');
        var globals = [
            'VizMagicConfig', 'Helpers', 'StateEngine', 'BlockProcessor',
            'CombatSystem', 'ItemSystem', 'CharacterSystem', 'CraftingSystem',
            'GuildSystem', 'DuelStateManager', 'VMProtocol', 'GameCreatures',
            'GameSpells', 'GameRecipes', 'GameRegions', 'WorldBoss'
        ];
        for (var i = 0; i < globals.length; i++) {
            var exists = await page.evaluate('typeof ' + globals[i] + ' !== "undefined"');
            assert(globals[i] + ' defined', exists);
        }

        // ---------- 3. Screen sections exist in DOM ----------
        console.log('\n--- Test: screen sections ---');
        var screens = [
            'screen-landing', 'screen-login', 'screen-home',
            'screen-hunt', 'screen-character', 'screen-inventory',
            'screen-crafting', 'screen-arena', 'screen-guild',
            'screen-chronicle', 'screen-map', 'screen-world-boss'
        ];
        for (var si = 0; si < screens.length; si++) {
            var found = await page.evaluate(
                '!!document.getElementById("' + screens[si] + '")'
            );
            assert('Section #' + screens[si], found);
        }

        // ---------- 4. StateEngine initializes ----------
        console.log('\n--- Test: StateEngine ---');
        var seState = await page.evaluate(function () {
            if (typeof StateEngine === 'undefined') return null;
            var s = StateEngine.getState();
            return {
                hasCharacters: typeof s.characters === 'object',
                hasInventories: typeof s.inventories === 'object',
                hasGuilds: typeof s.guilds === 'object',
                hasGuildListings: Array.isArray(s.guildListings),
                hasSocial: typeof s.social === 'object'
            };
        });
        if (seState) {
            assert('state.characters is object', seState.hasCharacters);
            assert('state.inventories is object', seState.hasInventories);
            assert('state.guilds is object', seState.hasGuilds);
            assert('state.guildListings is array', seState.hasGuildListings);
            assert('state.social is object', seState.hasSocial);
        } else {
            assert('StateEngine.getState() returned', false, 'null');
        }

        // ---------- 5. ItemSystem idempotency (the fix we made) ----------
        console.log('\n--- Test: hunt idempotency ---');
        var idempotencyOk = await page.evaluate(function () {
            // Create a fake character and run two hunts on same block
            var state = StateEngine.getState();
            var testAcct = '__smoke_test_account__';
            state.characters[testAcct] = CharacterSystem.createCharacter(testAcct, 'TestMage', 'embercaster');
            state.inventories[testAcct] = [];

            // Simulate processHuntResult (optimistic path)
            var allCreatures = GameCreatures.getAll();
            var creatureId = Object.keys(allCreatures)[0];
            var creature = allCreatures[creatureId];
            var spells = GameSpells.getSpellsForClass('embercaster');
            var spell = spells[0];
            if (!creature || !spell) return { error: 'no creature/spell data' };

            var result = StateEngine.processHuntResult(
                testAcct, creature.id, spell.id,
                'aabbccdd', 99999, 10000
            );

            var countAfterOptimistic = state.inventories[testAcct].length;

            // Now simulate block replay — _handleHunt via processBlock
            var fakeBlock = {
                blockNum: 99999,
                blockHash: 'aabbccdd',
                vmActions: [{
                    sender: testAcct,
                    action: { type: 'hunt', data: { creature: creature.id, spell: spell.id } }
                }],
                voicePosts: [],
                awards: []
            };
            StateEngine.processBlock(fakeBlock);

            var countAfterReplay = state.inventories[testAcct].length;

            // Cleanup
            delete state.characters[testAcct];
            delete state.inventories[testAcct];

            return {
                countAfterOptimistic: countAfterOptimistic,
                countAfterReplay: countAfterReplay,
                noDuplication: countAfterOptimistic === countAfterReplay
            };
        });
        if (idempotencyOk && !idempotencyOk.error) {
            assert('Hunt loot not duplicated on replay',
                idempotencyOk.noDuplication,
                'after optimistic: ' + idempotencyOk.countAfterOptimistic +
                ', after replay: ' + idempotencyOk.countAfterReplay);
        } else {
            assert('Hunt idempotency test ran', false, idempotencyOk ? idempotencyOk.error : 'null');
        }

        // ---------- 6. Guild listing accepted without membership ----------
        console.log('\n--- Test: guild listing acceptance ---');
        var guildListingOk = await page.evaluate(function () {
            var state = StateEngine.getState();
            var before = (state.guildListings || []).length;

            // Broadcast a guild.listing from an unknown sender for an unknown guild
            var fakeBlock = {
                blockNum: 88888,
                blockHash: 'deadbeef',
                vmActions: [{
                    sender: '__unknown_sender__',
                    action: {
                        type: 'guild.listing',
                        data: { guild_id: '__test_guild__', created_block: 10000 }
                    }
                }],
                voicePosts: [],
                awards: []
            };
            StateEngine.processBlock(fakeBlock);

            var after = (state.guildListings || []).length;

            // Cleanup: remove test listing
            for (var i = state.guildListings.length - 1; i >= 0; i--) {
                if (state.guildListings[i].guild_id === '__test_guild__') {
                    state.guildListings.splice(i, 1);
                }
            }

            return { before: before, after: after, accepted: after === before + 1 };
        });
        assert('Guild listing accepted without membership check',
            guildListingOk && guildListingOk.accepted,
            guildListingOk ? 'before: ' + guildListingOk.before + ', after: ' + guildListingOk.after : 'null');

        // ---------- 7. No JS errors ----------
        console.log('\n--- Test: console errors ---');
        // Filter out expected errors (blockchain connection fails in test env)
        var criticalErrors = errors.filter(function (e) {
            return e.indexOf('WebSocket') === -1 &&
                   e.indexOf('ERR_CONNECTION_REFUSED') === -1 &&
                   e.indexOf('net::') === -1 &&
                   e.indexOf('Failed to fetch') === -1;
        });
        assert('No critical JS errors', criticalErrors.length === 0,
            criticalErrors.length + ' errors: ' + criticalErrors.slice(0, 3).join('; '));

        if (warnings.length > 0) {
            console.log('  (Warnings: ' + warnings.length + ')');
        }

    } catch (e) {
        console.log('FATAL: ' + e.message);
        failed++;
    } finally {
        if (browser) await browser.close();
        srv.close();
    }

    // ---------- Summary ----------
    console.log('\n========================================');
    console.log('  Passed: ' + passed + '  Failed: ' + failed);
    console.log('========================================\n');
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
