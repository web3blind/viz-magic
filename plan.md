# Viz Magic — remaining QA and hardening plan

Updated: 2026-06-21 07:50 UTC

This file is the canonical handoff plan for the next Hermes session. It intentionally replaces the old `plan.md` contents.

## Current task — Magical Guide redesign

## Current task — Home sky/season polish and icon motion controls

Scope:
- Home forecast: move the hunt bow icon in the Summer/season card to the top-right corner opposite the compass.
- Home sky block: rotate authored in-world names daily across seven names: Sky, Earth, Water, Air, Wind, Fire, Aether. Do not call them weekdays in the Home block; explain the daily world-name cycle in the Magical Guide.
- Home lore cards under game buttons: make their background, left yellow stripe, font sizing, and text colors match the upper forecast-style text blocks; set card border colors top-to-bottom as green, moon-white, red.
- Remove the repeated lore tail about pupils writing the phrase backwards so it cannot repeat across Magic Nature and World Legends.
- Settings/accessibility: add three user options for icon breathing: Мир спит, Мир дышит, Мир мерцает. Keep reduced-motion as the broader global animation reducer.
- Armageddon: add a second strict yellow danger marker with schematic explosion inside the Armageddon button.

Validation:
- Update focused regression tests for sky-name rotation, lore-card styling, icon-motion settings, Armageddon warning marker, cache-busting, and no repeated pupil tail.
- Run node syntax checks and focused regression/accessibility tests.
- Browser-smoke the Home, Settings, Help, and Hunt/Armageddon relevant render states when possible.

Definition of Done:
- Local tests pass, changed static assets are cache-busted, commit is pushed to main, and production is redeployed unless Денис explicitly says “не деплой”.

Started: 2026-07-22.

Outcome: replace the plain Help screen with a stable **Magical Guide / Магический справочник** presented as a magic book. Do not add a separate “Magical Pages” tab.

Scope:

- Rename the Help nav/title/copy to Magical Guide / Магический справочник.
- Keep practical help sections in a fixed order; no daily page shuffling for gameplay help.
- Add an optional lore-pages area inside the same guide/book, where lore pages may rotate or vary without affecting the practical help order.
- Style the screen as a readable magical book: cover/binding impression, page cards, accessible headings and labels.
- Make icon breathing feel less synchronized while respecting reduced-motion preferences.
- Cache-bust changed frontend assets.

Non-goals:

- No new bottom-nav tab or new screen named “Magical Pages”.
- No gameplay state changes and no blockchain/live transaction changes.
- No production deploy unless explicitly requested after local verification.

Verification:

- Add/update structural regression tests for fixed help order, no separate magical-pages route, lore inside guide, cache-bust, and desynchronized animation CSS.
- Run `node tests/player-bug-regressions.test.js` and `node --check` for changed JS.
- Run affected accessibility/static tests where relevant.

Stop when:

- Browser/live production deployment, private keys, or external mutation would be required.


## Current task — Hunt habitat balance and item UI polish

Started: 2026-07-30.

Scope:
- Hunt: make visible creature habitat depend on player level so stale low-level prey disappears; for a level 7 player, Lv3-8 is removed while Lv5-10, Lv5-12, and Lv7-14 remain.
- Hunt: add an explicit dangerous-habitat warning for very risky creatures, with copy close to: “Здесь очень сильные магические сущности. Опасно!”
- Hunt: clarify that 1%/3% spell buttons show mana cost, not win probability.
- Inventory: remove white rarity diamonds from requested material rows, give Ancient Echo Shard and Shadow Shard distinct icons by rarity, and avoid ambiguous Thorn Essence duplicate rows by showing rarity in the row meaning.
- Bazaar sell tab: mirror the distinct Shadow Shard icon and clear rarity labeling.
- Dream Archive Test / bottom navigation: keep icons above labels and labels in one horizontal text line.

Verification:
- Add focused regression coverage for level-7 hunt habitat, danger warning copy, mana-cost wording, item icon/separator rules, marketplace sell grouping labels, and bottom nav icon-over-label layout.
- Run node syntax checks for changed JS, focused player/a11y/history tests, browser matrix 360/414/768/1280, git diff check.
- Deploy and live-verify production unless blocked by deploy helper; direct HTTPS/browser checks are required before claiming production.

Definition of Done:
- For Lv7, Hunt render does not expose Hollow Shade Lv3-8; it exposes Thornvine Lv5-10, Echo Guardian Lv5-12, Cyber Ghoul Lv7-14; Cyber Ghoul has the danger warning.
- Inventory and Bazaar no longer show the reported white diamond artifacts in requested material rows.
- Dream/nav buttons are icon-over-label across viewport matrix.

## Current baseline

Repo: `/home/assistent/ai-projects/viz-magic`

Production: `https://vizmagic.web3blind.xyz/`

Latest pushed commits at handoff:

- `32d9093 Reduce quest and travel UI delays`
- `b3a1671 Dedupe chronicle blessing replays`
- `620e386 Fix quest and chronicle display regressions`
- `485b4a9 Cache-bust app controller`
- `7eb90d6 Use archive events for stale catch-up`

Known green checks before this plan was written:

- `node tests/player-bug-regressions.test.js` passed: 19 tests.
- Production served current cache-busted files for the last deployed batch.
- Puppeteer smoke opened prod without JS errors and confirmed fresh scripts loaded.
- Git was clean before writing this `plan.md`.

Important: `plan.md` itself may now be the only local modified file after this handoff. Decide in the next session whether to commit it.

## Hard constraints and project rules

- Keep Viz Magic a single frontend/blockchain app unless Denis explicitly approves a separate service.
- All gameplay state mutations must go through `app/js/engine/state-engine.js`.
- UI screens must not directly mutate `worldState` except through exported state-engine live methods or already-approved local optimistic display helpers.
- Client code is ES5-compatible: use `var`, `function () {}`, no arrow functions, no template literals, no `let`/`const` in app JS.
- Never print or commit private keys, tokens, passwords, active keys, or wallet secrets. Replace secrets with `[REDACTED]` in logs/summaries.
- For production UI fixes: bump relevant script query params in `app/index.html`, bump `app/sw.js` cache version, verify over HTTPS, and verify service worker behavior if browser cache is involved.
- Do not claim “entire game fully tested” unless crafting, marketplace, two-browser guild/arena, checkpoint recovery, archive mirror, and accessibility checks are explicitly verified.

## What is already considered done

These areas were recently fixed and smoke/regression-checked:

1. Quest completed title rendering
   - `q_hunt_wisps` raw key no longer appears in Completed.
   - Completed quest records preserve title metadata / resolve via quest catalog.

2. Chronicle guild names
   - Joined guild narrative uses a real guild name when available.
   - Create narrative has fallback instead of blank guild name.

3. Chronicle blessing duplicate replay
   - Optimistic blessing and blockchain replay are deduped across block mismatch.

4. Blessing quest progress delay
   - Successful local blessing updates social quest progress immediately.

5. Travel delay / repeat-click loop
   - Map travel now uses `StateEngine.processMoveResult` for live update.
   - Pending travel has TTL and suppresses repeat travel buttons.

6. PWA service worker stale index fix
   - `skipWaiting()` and `clients.claim()` are present.
   - Navigations are network-first.
   - Cache versions were bumped through the last production deploy.

## Next-session working order

Work in small verified batches. For each batch:

1. Read files before editing.
2. Add or update regression tests where possible.
3. Run targeted tests and `node --check` on changed JS.
4. Deploy only the changed production files with backup.
5. Verify HTTPS content and browser-loaded script URLs.
6. Commit and push scoped changes.
7. Update this plan with completed/remaining notes.

Suggested command baseline:

```bash
cd /home/assistent/ai-projects/viz-magic
git status --short
git log --oneline -5
node tests/player-bug-regressions.test.js
```

For changed files, also run:

```bash
node --check app/js/path/to/changed.js
```

For production verification, always check at least:

```bash
python3 - <<'PY'
import urllib.request
for url, marker in [
    ('https://vizmagic.web3blind.xyz/', 'EXPECTED_VERSION_MARKER'),
    ('https://vizmagic.web3blind.xyz/sw.js', 'EXPECTED_SW_CACHE'),
]:
    data = urllib.request.urlopen(url, timeout=20).read().decode('utf-8', 'replace')
    print(url, marker, marker in data, len(data))
PY
```

## Remaining work item 1 — Crafting E2E

Status: locally covered with regression tests and browser fixture smoke; live VIZ broadcast not executed.

2026-06-21 update:

- Live crafting no longer mutates inventory directly in `CraftingScreen`; after successful `MarketProtocol.broadcastCraft(...)` it routes through `StateEngine.processCraftResult(...)` and saves a checkpoint.
- Replay crafting now consumes the exact material item IDs from action data via `CraftingSystem.craftWithMaterialIds(...)`, preventing different matching materials from being consumed during later replay.
- Recipe output templates and recipe material obtainability are covered by `tests/player-bug-regressions.test.js`.
- Browser fixture smoke crafted one `mana_potion`, marked the three selected material IDs consumed, added exactly one crafted item, and confirmed checkpoint save was called. This was a local stubbed broadcast smoke, not a live-chain spend.

Goal: verify crafting from UI through state-engine, inventory, material consumption, messages, and checkpoint persistence.

Files likely involved:

- `app/js/ui/screens/crafting.js`
- `app/js/engine/state-engine.js`
- `app/js/engine/items.js`
- `app/js/data/recipes.js`
- `app/js/data/creatures.js`
- `app/js/i18n/ru.js`
- `app/js/i18n/en.js`
- `tests/player-bug-regressions.test.js`

Procedure:

1. Inventory current craft action path.
   - Find whether crafting broadcasts an on-chain action or is local-only.
   - Confirm state mutation path is through state-engine.
   - Confirm materials are consumed once and output item is added once.

2. Check recipe feasibility.
   - Every recipe output must have an item template in `items.js`.
   - Every required material should be obtainable from some creature loot table or other documented path.
   - If a recipe uses a missing material, either add a drop source or mark recipe unavailable with clear UI copy.

3. Browser/UI checks.
   - Open Crafting.
   - Verify empty-state copy if no materials.
   - Inject test materials only in browser context if needed for QA; do not commit temp scripts.
   - Craft one low-level item.
   - Confirm inventory contains the crafted item.
   - Confirm materials decrement correctly.
   - Confirm no duplicated crafted item after refresh/checkpoint reload.

4. Regression tests.
   - Add structural tests for recipe/template/material consistency.
   - Add tests that crafting UI mentions concrete requirements and effects.
   - If a direct state-engine craft live method exists, test that UI references it rather than mutating inventory directly.

Acceptance criteria:

- Craft action creates exactly one item.
- Required materials are consumed exactly once.
- UI errors are readable in RU and EN; no raw i18n keys.
- Refresh/reload does not duplicate crafted items.
- Tests pass and changed JS passes `node --check`.

## Remaining work item 2 — Marketplace E2E

Status: locally covered with state-engine regression and browser fixture smoke; live VIZ broadcast/two-account buy not executed.

2026-06-21 update:

- Marketplace state is now anchored to `worldState.marketplace`: `_ensureMarketplace()` passes the checkpoint/replay object into `MarketplaceEngine`, and list/cancel/buy sync back via `_syncMarketplaceState()`.
- Live marketplace success paths now use exported `StateEngine.processMarketListResult(...)`, `processMarketCancelResult(...)`, and `processMarketBuyResult(...)` instead of only optimistic UI refresh/pending state.
- Successful live marketplace mutations call `StateEngine.saveCheckpoint(function() {})`.
- `app/index.html` cache-busts `state-engine.js` and `marketplace.js`; `app/sw.js` was bumped to `viz-magic-v24`.
- Regression coverage: `marketplace state is mirrored into world state for checkpoints`, `marketplace live UI routes successful actions through state-engine and checkpoints`, and `marketplace sell and buy replay transfers item without duplication`.
- Browser fixture smoke (`/tmp/vizmagic_marketplace_smoke.js`) verified list → checkpoint-like marketplace reload → buy: seller inventory becomes empty, buyer receives exactly one `browser_oak_wand`, listing becomes `sold`, history length is 1, checkpoint hook was called.

Goal: verify sell, listing display, buy, item transfer, listing sold state, and accessibility copy.

Files likely involved:

- `app/js/ui/screens/marketplace.js`
- `app/js/engine/marketplace.js`
- `app/js/engine/state-engine.js`
- `app/js/ui/screens/inventory.js`
- `app/js/i18n/ru.js`
- `app/js/i18n/en.js`

Procedure:

1. Static inventory.
   - Check how item ownership and listing IDs are represented.
   - Confirm Marketplace engine does not duplicate item references.

2. Seller path.
   - Use one authorized account or injected fixture item if live mutation is not appropriate.
   - Bazaar → Sell tab → select item → set price → list.
   - Confirm listing appears in Browse.
   - Confirm seller inventory no longer shows item as freely usable if listing should lock/remove it.

3. Buyer path.
   - Prefer two-browser/two-account if authorized.
   - Buy listing.
   - Confirm buyer inventory receives item.
   - Confirm seller no longer owns item.
   - Confirm sold listing is hidden or marked sold according to design.

4. Edge cases.
   - Buying own listing should be blocked or clearly handled.
   - Insufficient mana/balance copy should be clear.
   - Refresh after listing/buy should not resurrect sold item.

5. Regression tests.
   - Add tests for buy/sell method names and inventory transfer invariants if direct runtime unit test is hard.
   - Add copy/i18n checks for key marketplace states.

Acceptance criteria:

- Sell → Browse → Buy works in browser or explicitly documented fixture path.
- No duplicate item after buy.
- Listing state survives checkpoint/replay path.
- No raw i18n keys or blank buttons.

## Remaining work item 3 — Two-browser Guild and Arena verification

Status: partial prior verification existed; needs fresh structured smoke after recent cache/catch-up changes.

References to load in next session:

- `viz-blockchain-game-debug`
- `references/viz-archive-arena-guild-two-browser.md`
- `references/viz-archive-guild-directory.md`
- `references/viz-pwa-cache-and-ui-regression-qa.md`

Goal: verify multiplayer flow with isolated browser profiles and archive-backed catch-up, not just optimistic local UI.

Procedure:

1. Prepare isolated browsers/profiles.
   - Account A: `dream-world` if authorized.
   - Account B: only if credentials are available in approved local secret store.
   - Never print private keys.

2. Guild smoke.
   - Browser A creates or uses existing guild.
   - Browser A invites/promotes if enough permissions.
   - Browser B catches up via Archive Mirror and sees invite/member state.
   - Verify `/archive-mirror/v1/guilds` and any frontend `HistorySource` usage.

3. Arena smoke.
   - Browser A issues challenge.
   - Browser B sees incoming challenge after archive catch-up.
   - Drive accept → commit/reveal or minimum safe lifecycle if full duel is too disruptive.
   - Verify history appears for both browsers.

4. If live mutation is not allowed.
   - Do read-only navigation/API checks only.
   - Mark “mutation blocked by test-account constraints” instead of claiming full coverage.

Acceptance criteria:

- Second browser sees relevant state from archive/replay, not only sender's optimistic state.
- No old checkpoint catch-up stalls.
- No blank guild names, raw keys, or endless Loading.
- Any blocker is documented with exact screen/API observed.

## Remaining work item 4 — Checkpoint recovery matrix

Status: stale checkpoint catch-up was optimized, but matrix should be rechecked after newer UI fixes.

Goal: verify fresh, recent, and old IndexedDB states recover predictably.

Scenarios:

1. Fresh user / cleared IndexedDB.
   - No checkpoint.
   - App should load from archive/history without hanging.
   - Landing/login/onboarding should remain usable.

2. Recent checkpoint.
   - Normal incremental catch-up.
   - No duplicate recent actions.

3. Very old checkpoint.
   - Large gap should use Archive Mirror range/event path.
   - Empty blocks should not be replayed one-by-one via RPC.
   - UI should show progress and finish.

4. Corrupt or incompatible checkpoint.
   - App should recover or offer reset path rather than silently hanging.

Files likely involved:

- `app/js/ui/app.js`
- `app/js/blockchain/history-source.js`
- `app/js/engine/state-engine.js`
- `app/js/engine/block-processor.js`
- `app/js/storage/checkpoint.js` or equivalent checkpoint file

Acceptance criteria:

- Fresh/old/recent checkpoint paths do not hang.
- No unbounded memory growth in browser during catch-up.
- `StateEngine.headBlock` advances correctly.
- Checkpoint save happens after catch-up.

## Remaining work item 5 — Archive Mirror / PM2 health

Status: completed in the 2026-06-21 08:03 UTC pass. aaPanel one-shot health check resolved the Node/PM2 path, showed `vizmagic-game-archive` online at ~37 MB RSS and `vizmagic-game-archive-indexer` online at ~70 MB RSS, and archive data size around 10 MB. Public `/archive-mirror/health`, `/archive-mirror/v1/guilds`, and `/archive-mirror/v1/range?...` were responsive. `/archive-mirror/v1/health` returns 404 on this Nginx mapping, while `/archive-mirror/health` is the live health path.

Goal: confirm Archive Mirror process RAM stays below the target ~200 MB and endpoints remain responsive.

Procedure:

1. Find correct runtime path.
   - Use aaPanel process manager or locate Node/PM2 binary on server.
   - Do not assume `/usr/bin/node` or `pm2` is in cron PATH.

2. Check process status.
   - Process name expected around `vizmagic-game-archive`.
   - Capture RSS/memory MB, CPU, uptime, restart count.
   - Do not print secrets/environment.

3. Check endpoints.
   - `https://vizmagic.web3blind.xyz/archive-mirror/v1/health` if present.
   - `https://vizmagic.web3blind.xyz/archive-mirror/v1/range?...`
   - `https://vizmagic.web3blind.xyz/archive-mirror/v1/guilds` if present.

4. Check SQLite size.
   - Keep storage focused on VM/V/VE and game-marked awards, not full raw blocks.

Acceptance criteria:

- PM2 process is online.
- RSS remains under ~200 MB for the archive mirror process.
- Range endpoint returns quickly and does not include unrelated full raw block bloat.
- Nginx proxy path is healthy.

## Remaining work item 6 — Mobile accessibility / TalkBack QA

Status: completed in the 2026-06-21 08:03 UTC pass with `tests/core-screen-accessibility-smoke.test.js` and `node /tmp/vizmagic_screen_smoke.js`. All core screens rendered with visible text, no blank controls, no raw internal keys, and latest cache-busted scripts. High-impact fixes added: missing numeric fallback in `Helpers.formatNumber`, character fallback defaults for `coreBonus`/`spells`, accessible names for Inventory compact switch and Guild active-key input.

Goal: ensure core screens are practical for Denis with TalkBack.

Screens:

- Landing / login / onboarding
- Hunt
- Quests
- Chronicle
- Map
- Inventory
- Crafting
- Marketplace
- Guild
- Arena/Duel
- Leaderboard

Checklist:

- Buttons have meaningful accessible names.
- Dynamic result areas use sensible `aria-live` / status text without spam.
- Focus order is logical after tab changes and screen navigation.
- No tiny essential buttons below practical mobile touch size where easily avoidable.
- No icon-only action without text/aria-label.
- Toasts are not duplicated in storms.
- Russian copy is clear; no raw internal keys.

Acceptance criteria:

- At least one pass through each core screen with browser accessibility tree/snapshot.
- Fix high-impact blockers immediately.
- Document remaining cosmetic/accessibility improvements separately.

## Remaining work item 7 — World Boss / Territory / Siege

Status: local fixture/replay smoke completed in the 2026-06-21 08:03 UTC pass. No disruptive live-chain war/siege/boss broadcast was made. `tests/world-boss-territory-siege-smoke.test.js` verifies replay of guild create, siege declare/commit, boss attack, and territory claim; it also caught and fixed same-block territory recalculation overwriting a siege winner.

Goal: verify these screens do not break, and distinguish smoke from full gameplay coverage.

Procedure:

1. Static smoke.
   - Open screens/sections that display boss/territory/siege state.
   - Verify no JS errors, blank headings, raw keys, or infinite Loading.

2. Engine path audit.
   - Read handlers in `state-engine.js` and related modules.
   - Confirm worldState structures initialize safely when empty.
   - Confirm archive replay doesn't create duplicate events.

3. Mutation tests only if safe.
   - Do not broadcast disruptive war/siege/boss actions unless explicitly approved.
   - Use local fixture/injected state for UI rendering tests where possible.

Acceptance criteria:

- Screens render in empty and populated fixture states.
- No state-engine crash on replay of relevant action types.
- Any untested live mutation is clearly marked as untested.

## Remaining work item 8 — Economy / item consistency audit

Status: useful after Crafting/Marketplace.

Goal: ensure item economy is internally coherent.

Checks:

- Every item type used in loot tables exists in `ITEM_TEMPLATES`.
- Every recipe output exists in `ITEM_TEMPLATES`.
- Every recipe material is obtainable or intentionally special.
- Rarity labels/styles are consistent and accessible.
- Consumables have explicit effect descriptions.
- Equipment bonuses display concrete values.

Acceptance criteria:

- Add regression tests for catalog consistency.
- Fix missing templates/drops/copy.
- No raw item IDs shown where a display name should be available.

## Suggested next first task

Start with Crafting, because it is the biggest unverified single-player system and does not require two live accounts.

Suggested prompt for a new Hermes session:

```text
Открой /home/assistent/ai-projects/viz-magic/plan.md, загрузи skill viz-blockchain-game-debug, начни с Remaining work item 1 — Crafting E2E. Делай read-only inventory, потом минимальные фиксы, тесты, деплой с cache-bust и проверкой продакшена. Не печатай секреты.
```

## Completion ledger

Last updated: 2026-06-21 08:03 UTC.

Mark items here as the next session completes them:

- [x] Crafting E2E — local fixture + regression coverage; live-chain broadcast intentionally not spent
- [x] Marketplace E2E — state-engine authoritative list/cancel/buy, checkpoint on live action, replay transfer without duplication
- [x] Two-browser Guild smoke — isolated-browser replay fixture confirms invite/member state on Browser B
- [x] Two-browser Arena smoke — isolated-browser replay fixture confirms challenge visibility and accepted active duel state on Browser B
- [x] Checkpoint recovery matrix — fresh/recent/old partial IndexedDB checkpoints normalize to the current schema without hanging
- [x] Archive Mirror / PM2 RAM health — production archive endpoints responsive; PM2 archive API/indexer online under ~200 MB RSS
- [x] Mobile accessibility / TalkBack QA — core screen smoke covers names/raw keys/blank controls; high-impact blockers fixed
- [x] World Boss / Territory / Siege smoke — local replay fixture covers boss attack, siege lifecycle, and territory claim without live-chain mutation
- [x] Economy / item consistency audit — catalog/loot/recipe/material coverage regression remains passing in `tests/player-bug-regressions.test.js`

## Current task — Weave Surge, default avatars, guide/copy polish

Started: 2026-07-30.

Scope:
- Home event banner: Weave Surge click routes to Hunt like a hunting-related active event.
- Character page: page title icon and character avatar are unified; no empty avatar slot when no custom avatar exists.
- Default avatar: render a local class-icon avatar when public metadata avatar is absent; custom uploaded avatar still wins.
- Home Character action: show the current/default avatar on an extra row in the Character button.
- Leaderboard title icon must visibly breathe.
- Settings Sound block: remove speaker icon before Sound Effects slider label.
- Magical Guide: requested explanatory sentences start on new lines for HP, Bazaar, Duels/Arena.
- Duel no-show idea: add player-facing design copy about a small satisfaction penalty for decline/no-show; do not silently add a punitive chain mechanic without broader economic review.
- Living Pages: add a short fairy-tale description.

Acceptance:
- Browser smoke on Home→Weave Surge click navigates to Hunt.
- Character renders one avatar/header mark by default, using class icon when no custom image exists; no broken img for missing avatar.
- Home Character tile contains an extra avatar row.
- Settings SFX label has no speaker icon.
- Help copy contains <br> before the requested sentences.
- Home living pages contain an intro/fairy-tale description.
- Regression tests cover the above and cache-bust changed assets.


## Current task — Quest abandon no-progress penalty

Started: 2026-07-30.

Scope:
- If a player abandons an accepted quest after making progress, no extra Mana penalty is charged; the player loses only the progress already made in that quest.
- If a player accepts a quest and abandons it before any objective progress, the UI warns about a small forfeit: 1.00% Mana.
- The no-progress forfeit is a real VIZ award to the existing game/developer account, not a fake local character-state subtraction.
- Quest abandon replay event records `penaltyEnergy` for transparent history/state consumers.
- Guide copy explains the rule in RU/EN.

Acceptance:
- Active quest card for untouched quests shows the 1.00% Mana forfeit on the abandon button.
- Active quest card with any objective progress uses ordinary Abandon text and no penalty.
- Abandon click for untouched quests checks current VIZ energy before broadcast and shows a confirm modal.
- Successful untouched abandon broadcasts `quest.abandon` and then `VizBroadcast.award(...)` with 100 bp and a forfeit memo.
- Regression tests cover untouched/progress distinction, state event `penaltyEnergy`, i18n copy, and cache-busting.

## Current task — Text quality and avatar/spell UI polish

Started: 2026-07-31.

Scope:
- Remove over-explaining Weave Surge hint text and change badge wording to “на охоте мана ×2”.
- Color season name and world month by current season: summer green, autumn yellow, winter white, spring blue.
- De-duplicate named lore/news phrases across live and queued text arrays.
- Remove Home living-pages intro and move short “buttons live a fairy tale” sentence into the Magical Guide lore intro.
- Replace Character Home tile icon with the avatar itself; no separate mage icon in that tile.
- Character screen title: avatar first, class symbol immediately after it, class-guide name instead of generic “Персонаж”.
- Character spell rows open a modal with readable spell mechanics.
- Make Leaderboard title icon breathe softly, not pulse/jitter.
- Restore SFX bell icon in Settings.
- Add requested Help line breaks and exact duel satisfaction design rule.

Acceptance:
- Static search finds no removed Weave Surge sentence or deleted Home living-pages intro.
- Search finds the repeated phrases only where intentionally kept; “Компас повернулся...” appears only in the faceless-birds page.
- Browser smoke verifies Home character tile has avatar in icon position, Character title has avatar + class symbol + class-guide name, spell modal opens, Settings SFX label has bell, Help line breaks/rule render, and season/month spans have season color classes.


## Current task — Hunt danger label truth + weave title one-line (2026-07-31)

Outcome:
- Weave Surge block title stays on one line.
- Current Lv5-10, Lv5-12, and Lv7-14 hunt targets are not labelled dangerous.
- Hunt exposes one extra clearly deadly target near Lv7 progression and only that target gets danger copy.
- The deadly target is verified against the real combat formula for low-mana shots, not just by label.

Verification:
- Static regression: fair targets have no danger flag/copy, deadly target has it.
- Combat simulation: Lv7 Stonewarden 1% and 3% attacks lose against the deadly target across sampled block hashes.
- Browser smoke: Hunt shows Lv5-10/Lv5-12/Lv7-14 without danger text and one deadly card with the warning.
- Standard syntax/tests, diff check, deploy markers and live browser after push.

Boundaries:
- Do not rebalance the existing fair creatures downward just to justify old warnings.
- Do not weaken avatar/security/quest changes from v104/v105.


## Current task — Hunt mana spend root-cause audit (2026-07-31)

Outcome:
- Hunt combat power uses the spell mana actually spent (1%/3%), not the player's current/full account energy.
- VM hunt actions record `energy` so replay and live UI resolve the same combat.
- Low-mana 3% shots are not penalized with fewer combat rounds than 1% shots.
- Danger labels are re-evaluated against corrected combat math.

Verification:
- Regression asserts huntAction writes energy, processHuntResult receives spell.manaCost, replay falls back to action energy/spell cost, and maxRounds does not make 3% worse than 1%.
- Browser/formula simulation compares fair and deadly targets after the fix.


## Current task — v108 inventory/nav/hunt/arena polish (2026-07-31)

Scope from Denis:
- Inventory all tab: item icons must not breathe in sync when “world sparkles” is enabled.
- Inventory all tab: Ancient Echo Shard uncommon/rare must not share the same icon.
- Inventory all tab: Oak Wand common warning icon moves to the end of the row.
- Inventory all tab: remove white diamond/fallback glyphs for altar_spark, data_core, nano_patch, stone_tablet; use thematic unique icons.
- Bottom navigation used by Dream Archive Test: icon above one-line label.
- Hunt Lv11-18 danger marker: keep only warning triangle, remove yellow oval and the word “Опасно”.
- Arena: icons should breathe smoothly, not jerk.

Verification:
- Static regressions for icons, warning order, nav layout, danger marker, and arena soft motion.
- Browser matrix checks inventory item rows, hunt danger marker, bottom nav layout, arena animations, and no page errors.


## Current task — v109 player polish batch (2026-07-31)

Scope from Denis:
- Remove phrase "Старшие маги просят не смеяться слишком громко" from all lower text blocks/queued tails except Magic Nature if present. Audit exact phrase and stems.
- Future content generation quality: maximum filter, 5-8 strong blocks.
- Inventory: remove middle dot before stats on Oak Wand; remove white diamond artifacts for Altar Spark and material fallbacks.
- Guild/Dream Archive Test: bottom action buttons should have icon over one-line label.
- Hunt: add missing intermediate 9-16 tier; move Lv 11-18 to row end; change danger warning copy to "Сильные..."; keep only triangle marker.
- Arena/leaderboard: use soft breathe, not rune jitter.
- Marketplace sell: remove Chronicle Ink trailing drop; make Veilstone/Stone Tablet/Data Core/Nano Patch icons distinct.
- Character: remove element names in parentheses; spell details title with wand, no Stone Wall/name/description, no extra close action button.
- Settings/help: add invisible spacer in accessibility block; line-break quest abandon and duel design-rule notes.

Verification: node --check changed files, player/accessibility/history regressions, git diff --check, browser matrix and live prod smoke.
