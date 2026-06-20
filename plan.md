# Viz Magic History Source Resilience Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Keep changes scoped, ES5-only in browser files, and preserve the single front-end/blockchain game model unless Denis explicitly approves a hosted service deployment.

**Goal:** Make Viz Magic keep working when public VIZ nodes expose only a short recent block-history window, without turning gameplay authority into a centralized Web2 server.

**Architecture:** Introduce a read-only history source layer in the browser client. The client keeps using VIZ nodes for live head blocks and broadcasts, but can fetch older VM/V/VE/archive data from user-selected community archive mirrors. Mirrors are not authoritative game servers: they index public blockchain data, return proof-carrying blocks/actions/snapshots, and the browser still rebuilds state through `BlockProcessor -> StateEngine`.

**Tech Stack:** Static ES5 browser app, VIZ RPC via `viz.min.js`, IndexedDB checkpoints, optional read-only archive HTTP API/mininode scripts, Node-based regression tests.

---

## Current evidence from code

- `app/js/ui/app.js` already has a fresh-device recovery path:
  - `_recoverChainHistory(headBlock)` calls `VMProtocol.traverseChain(user, 5000)`.
  - It collects historical block numbers older than the recent window.
  - It then calls `viz.api.getBlock(blockNum)` for each old block.
- `app/js/protocols/vm-protocol.js` chain traversal also depends on `viz.api.getBlock(blockNum)` for every linked historical block.
- `app/js/engine/block-processor.js` processes full blocks from RPC and extracts `VM`, `V`, `VE`, and `award` operations.
- `app/js/engine/checkpoint.js` stores only local IndexedDB checkpoints, cleaned to last 5 per account. This protects returning users on the same device, but not fresh devices or cleared storage.
- `app/js/config.js` currently has only VIZ node endpoints: `https://api.viz.world/`, `https://node.viz.cx/`.

## Problem statement

If VIZ public nodes keep only about 2 days of block history, then these flows become unreliable:

1. Fresh device / cleared browser storage cannot rebuild an old character completely.
2. `VMProtocol.traverseChain()` can discover the latest custom sequence pointer, but fails when `getBlock(oldBlock)` returns unavailable/pruned data.
3. Guilds, marketplace, duel history, world boss, leaderboard, chronicle context, and old inventory provenance can be incomplete.
4. The game starts depending on accidental local IndexedDB survival, which conflicts with the original “local + blockchain” promise.

## Product decision

Use a hybrid model:

- **Authoritative writes:** still only VIZ blockchain operations.
- **Authoritative state rules:** still only client-side deterministic `StateEngine`.
- **Live recent data:** still public VIZ nodes.
- **Old historical data:** optional archive mirrors/mininodes that store public blocks/actions and can be switched like Web2 game servers.
- **Player control:** expose clear source selection and degraded-mode status in Settings / startup sync.

Do **not** make the archive service accept private keys, sign actions, calculate secret outcomes, or mutate player state.

## Non-goals

- No mandatory centralized backend for normal gameplay.
- No private keys or regular/active keys sent to archive mirrors.
- No rewrite to a framework or build step.
- No change to existing VM/V/VE protocol semantics unless a later migration is explicitly planned.
- No fake “server mode” where a mirror becomes trusted authority.

## Implementation phases

### Phase 0 — Protect current unrelated work

**Objective:** Do not overwrite the active accessibility remediation work already present in the repo.

**Files:**
- Keep existing root `plan.md` unchanged unless continuing the accessibility task.
- Use this plan at `.hermes/plans/history-source-resilience/plan.md`.

**Steps:**
1. Before implementation, run `git status --short --branch`.
2. If unrelated uncommitted files remain, do not mix history-source changes into that diff.
3. Create a new branch/worktree only if Denis asks for actual implementation after the current accessibility work is resolved.

**Verification:**
- `git diff --stat` shows no accidental changes outside the intended task.

---

### Phase 1 — Add history capability detection

**Objective:** The client should know when a selected VIZ node cannot serve old blocks and should tell the user clearly.

**Files:**
- Modify: `app/js/blockchain/connection.js`
- Modify: `app/js/ui/app.js`
- Test: `tests/history-source-regressions.test.js`

**Design:**
Add a small probe that checks:
- current `head_block_number` from DGP;
- `getBlock(head - 100)` as a recent sanity check;
- `getBlock(head - 60000)` or another conservative old probe as historical capability check.

Do not hard-fail the app if old history is unavailable. Store a capability object:

```js
{
    live: true,
    recentBlocks: true,
    historicalBlocks: false,
    checkedAt: Date.now(),
    node: currentNode
}
```

**Steps:**
1. Write a failing Node/vm test for a node capability helper: old block missing => `historicalBlocks: false`.
2. Add `VizConnection.checkHistoryCapability(callback)` or equivalent ES5 function.
3. Make startup sync use this capability to decide whether old recovery needs an archive source.
4. Add i18n strings for degraded mode: “This node only provides recent history; old character/world recovery may need an archive mirror.”

**Verification:**
- `node --check app/js/blockchain/connection.js`
- `node --check app/js/ui/app.js`
- `node tests/history-source-regressions.test.js`

---

### Phase 2 — Introduce a browser-side HistorySource abstraction

**Objective:** Remove direct hard dependency on `viz.api.getBlock()` from old-history recovery.

**Files:**
- Create: `app/js/blockchain/history-source.js`
- Modify: `app/index.html` to include the new script before `app.js`
- Modify: `app/js/ui/app.js`
- Modify: `app/js/protocols/vm-protocol.js`
- Test: `tests/history-source-regressions.test.js`

**Design:**
Create a module with a simple callback API:

```js
var HistorySource = (function() {
    function getBlock(blockNum, callback) {}
    function getAccountProtocol(account, protocol, callback) {}
    function getAccountActions(account, protocol, options, callback) {}
    function getCapabilities(callback) {}
    return { ... };
})();
```

Priority order:
1. public VIZ RPC for recent/live blocks;
2. selected archive mirror for older blocks/actions;
3. local IndexedDB checkpoint if available;
4. explicit degraded mode if neither source can prove the data.

**Steps:**
1. Write a failing test proving `_recoverChainHistory` can fetch a historical block through `HistorySource.getBlock()` rather than `viz.api.getBlock()`.
2. Implement `HistorySource` as a thin wrapper around current `viz.api` first.
3. Replace old-history `viz.api.getBlock()` calls in `app.js` recovery paths with `HistorySource.getBlock()`.
4. Update `VMProtocol.traverseChain()` to accept an optional source dependency or use `HistorySource` when present.
5. Keep live polling in `_processBlockBatch()` on normal VIZ RPC for now.

**Verification:**
- Existing `node tests/guild-invite-shell.test.js` still passes.
- New tests prove fallback injection works.

---

### Phase 3 — Add read-only archive mirror API support

**Objective:** Let players choose archive mirrors that return old public VM/V/VE blocks/actions.

**Files:**
- Modify: `app/js/config.js`
- Modify: `app/js/blockchain/history-source.js`
- Modify: `app/js/ui/screens/settings.js`
- Modify: `app/js/i18n/ru.js`
- Modify: `app/js/i18n/en.js`
- Test: `tests/history-source-regressions.test.js`

**Minimal API v1:**

```text
GET /health
GET /v1/block/:blockNum
GET /v1/account/:account/protocol/:protocol/latest
GET /v1/account/:account/protocol/:protocol/actions?limit=5000
GET /v1/range?start=123&end=456&protocol=VM,V,VE
GET /v1/checkpoint/global/latest
```

Response rules:
- Include block number, `block_id`/block hash, `previous`/previous block id when available, timestamp, raw transactions/operations, and normalized parsed actions.
- Include enough provenance for client-side verification: archive height, indexed range, source node, API version, response generation time.
- For action-list endpoints, include the containing block metadata for every action, not only the parsed action payload.
- Never require player secrets.
- Use CORS for static web clients.
- Do not return server-computed “final game state” as authoritative unless it is explicitly marked as an optional snapshot/cache.

**Client behavior:**
- Keep `https://api.viz.world/` as the first/primary VIZ RPC endpoint and keep `https://node.viz.cx/` as an ordered fallback; do not eagerly probe every fallback HTTP node on startup because broken CORS/preflight on a fallback must not break the main app shell.
- Add `HISTORY_ARCHIVE_MIRRORS` config with a placeholder/default empty list until a public mirror has been verified for CORS and block-shape parity.
- `HistorySource.getBlock()` keeps VIZ RPC as the first source and falls back to the configured mirror list through browser-safe `XMLHttpRequest` when RPC cannot provide the block.
- Settings screen: “History source / Archive mirror” selector + custom URL field.
- Startup: if VIZ node lacks historical blocks, suggest archive mirror instead of silently failing.
- Store selected mirror in `localStorage` under `viz_magic_archive_source`.

**Verification:**
- Regression test asserts explicit mirror config, default-empty safety, and browser-safe XHR fallback hook.
- `tests/archive-mirror-game-flow.test.js` runs a local CORS-enabled archive mirror, forces a VIZ RPC miss, fetches a VM block through `HistorySource`, parses it with `BlockProcessor`, and applies it through `StateEngine`.
- UI copy does not imply the mirror is authoritative.

---

### Phase 4 — Build optional mininode / archive mirror scripts inside the project

**Objective:** Provide small self-hosted read-only Node.js scripts in the Viz Magic repository/site so any interested player/operator can download the project, run an archive mirror, and share its public URL with other players.

**Files:**
- Create: `tools/archive-node/package.json`
- Create: `tools/archive-node/server.js` — HTTP archive mirror API
- Create: `tools/archive-node/indexer.js` — incremental VIZ block parser/indexer
- Create: `tools/archive-node/config.example.json` — source node, bind host/port, DB path, scan start block
- Create: `tools/archive-node/README.md` — copy-paste runbook for community operators
- Create: `tools/archive-node/sqlite-schema.sql`
- Create: `tools/archive-node/public-mirror.example.json` — optional metadata players can import/select
- Modify: `README-ru.md` and `README.md` — short “Run an archive mirror” section with link to `tools/archive-node/README.md`
- Optional later: add downloadable mirror bundle link on the static site/help/settings screen
- Test: `tools/archive-node/*.test.js`

**Design:**
A mininode/archive mirror should:
1. Connect to a VIZ RPC node that still has the needed history, or continue from the current head if deployed early.
2. Incrementally scan blocks in ascending order and remember the last indexed block.
3. Parse every block with the same protocol expectations as the browser: VM custom ops, V custom ops, VE custom ops, awards, block id, timestamp, sender.
4. Store only game-relevant public data in SQLite: block metadata, raw/parsed operations, sender, protocol id, action type, account/protocol latest pointer.
5. Expose the read-only HTTP endpoints from Phase 3 with CORS enabled for static web clients.
6. Keep no private keys and provide no signing/broadcast endpoint.
7. Be easy to run by a non-core contributor:

```bash
cd tools/archive-node
npm install
cp config.example.json config.json
node indexer.js --from 1
node server.js
```

**Parser behavior:**
- The indexer fetches blocks by number from the configured VIZ node.
- For each operation in each transaction:
  - if `custom.id === 'VM'`, store it as a Viz Magic game action;
  - if `custom.id === 'V'`, store it as a Chronicle/social post;
  - if `custom.id === 'VE'`, store it as a game/social event;
  - if operation type is `award`, store it for blessing/reward reconstruction.
- The server returns either full raw blocks or normalized action lists; the browser still feeds data through `BlockProcessor -> StateEngine` instead of trusting server-computed game state.

**Storage options:**
- MVP: SQLite file, easiest to host, copy, and backup.
- Later: static JSON chunk export for GitHub Pages/IPFS mirrors.
- Later: deterministic snapshots generated from the same indexed data for fast client recovery.

**Important:** This is optional community infrastructure shipped with the project. The static app must still run without it, just with reduced recovery if old history is unavailable.

**Verification:**
- Run local mininode against a small known block range.
- Query `/health`, `/v1/block/:blockNum`, `/v1/range`, and account actions.
- Verify restart resumes from the saved last indexed block without duplicating rows.
- Feed returned blocks/actions into browser-side `BlockProcessor -> StateEngine` tests.
- Confirm the mirror runbook never asks for regular/active/private keys.

---

### Phase 4.5 — Client-side integrity checks for archive mirror data

**Objective:** Reduce the risk of a malicious or broken archive mirror forging, omitting, or reordering historical data.

**Files:**
- Create: `app/js/blockchain/history-verifier.js`
- Modify: `app/js/blockchain/history-source.js`
- Modify: `app/js/ui/app.js`
- Modify: `app/js/i18n/ru.js`
- Modify: `app/js/i18n/en.js`
- Test: `tests/history-source-regressions.test.js`

**Threat model:**
- A mirror can lie by returning fake actions, hiding actions, mixing blocks from different forks, or returning server-computed state.
- The mirror cannot forge VIZ signatures/block hashes if the client can compare returned block metadata against trusted recent chain anchors or multiple independent sources.
- Full cryptographic block validation in a static browser client may be expensive or limited by available VIZ header/signature data, so implement layered verification and clear trust status.

**Required data from mirror:**
- raw block payload when practical;
- block number;
- `block_id` / block hash;
- previous block id/hash field when available from VIZ RPC block data;
- timestamp;
- raw transaction operations for VM/V/VE/award;
- parsed action as convenience only;
- source metadata: mirror id, source node, indexed height, indexed range.

**Client verification layers:**
1. **Shape validation:** block number, block id/hash, timestamp, operations array, sender extraction, protocol ids, and action JSON must be well-formed.
2. **Protocol validation:** parsed VM/V/VE payloads must match existing `VMProtocol`, `VoiceProtocol`, and `BlockProcessor` expectations; invalid payloads are ignored or marked untrusted.
3. **Hash-chain continuity:** for contiguous ranges, verify each returned block links to the previous block using `previous`/previous block id metadata when the VIZ block payload exposes it. If a block format lacks previous hash, mark continuity as `not_provable` rather than silently trusted.
4. **Anchor checks:** compare any overlapping recent blocks returned by the mirror against the currently selected live VIZ node (`getBlock(blockNum)` for blocks still inside the node retention window). Matching `block_id` anchors raise trust; mismatch marks the mirror unsafe.
5. **Multiple mirror comparison:** if two or more mirrors are configured, compare block ids/action counts for sampled ranges. Mismatches warn the player and avoid importing snapshots automatically.
6. **No authoritative parsed state:** never trust mirror-calculated character/guild/inventory state directly. Feed raw/normalized actions back through `BlockProcessor -> StateEngine`.
7. **Verification status in state/UI:** track recovery as `verified`, `anchored`, `partial`, `unverified`, or `failed`, and show this in Settings/startup sync.

**Acceptance checks:**
- Test rejects a mirror response where the same block number has a different `block_id` than the live node anchor.
- Test rejects or flags a contiguous range with a broken previous-hash chain.
- Test accepts parsed actions only after raw operation/protocol validation.
- Test proves server-computed state is not imported as authoritative game state.
- UI copy says “archive mirror data could not be verified” instead of silently continuing as if recovery was complete.

**Important limitation to document:**
If all full-history public nodes disappear and only one archive mirror has old data, a browser client cannot fully prove that ancient data was not omitted without either trusted checkpoints, multiple independent mirrors, or signed/reproducible snapshots. The plan must therefore combine block metadata verification, recent anchors, mirror comparison, and transparent trust status.

---

### Phase 5 — Add signed/deterministic snapshots for fast recovery

**Objective:** Avoid replaying huge histories for every fresh client while preserving verifiability.

**Files:**
- Create/modify: `app/js/blockchain/history-source.js`
- Modify: `app/js/engine/state-engine.js` only if snapshot import validation needs a public helper
- Create: `tools/archive-node/snapshot.js`
- Test: `tests/history-source-regressions.test.js`

**Snapshot model:**
Archive mirrors may publish snapshots:

```js
{
    protocol: 'VM-snapshot',
    version: 1,
    fromBlock: 1,
    toBlock: 12345678,
    blockId: '...',
    previousAnchor: '...',
    stateHash: '...',
    inputRangeHash: '...',
    state: { ...worldStateSubset },
    source: 'mirror-name',
    signature: 'optional-mirror-signature'
}
```

Client rules:
- Prefer snapshots only from selected/trusted mirrors.
- Show snapshot provenance in settings/debug info.
- After importing a snapshot, continue replaying blocks/actions from `toBlock + 1` through normal source layer.
- Keep a “rebuild without snapshot” option for debugging.

**Security note:** A snapshot is a convenience cache, not blockchain truth. The long-term stronger version should use reproducible state hashes and multiple mirrors for comparison.

---

### Phase 6 — UI/UX for server-like source selection

**Objective:** Make the model understandable to players: they are choosing a history mirror, not moving characters to a private server.

**Files:**
- Modify: `app/js/ui/screens/settings.js`
- Modify: `app/js/ui/app.js`
- Modify: `app/js/i18n/ru.js`
- Modify: `app/js/i18n/en.js`
- Modify: `README-ru.md`
- Modify: `README.md`

**UX copy principles:**
- “VIZ node” = live blockchain connection for current blocks and broadcasts.
- “Archive mirror” = old public history for fresh-device recovery.
- “Local checkpoint” = your browser’s cached state.
- Avoid scary internal phrasing; use actionable status.

**Example player-facing wording:**
- “Live VIZ node connected.”
- “This node has only recent history. For older character and guild recovery, choose an archive mirror.”
- “Archive mirrors never need your private key; they only serve public blockchain history.”

**Accessibility:**
- Source selector must be keyboard/TalkBack friendly.
- Custom URL field must have label, description, and test-connection button.
- Status updates go through `aria-live` / existing `A11y.announce`.

---

### Phase 7 — Degraded-mode safety and backup/export

**Objective:** Give players a safe path even before community archive mirrors exist.

**Files:**
- Modify: `app/js/engine/checkpoint.js`
- Modify: `app/js/ui/screens/settings.js`
- Modify: `README-ru.md`
- Modify: `README.md`
- Test: `tests/history-source-regressions.test.js`

**Features:**
1. Export local checkpoint as a JSON backup file.
2. Import local checkpoint on a new device.
3. Warn when the current state was recovered from partial history.
4. Add “last fully verified block” metadata.

**Why:** This does not solve global world history, but it protects players immediately while archive infrastructure is being built.

---

## Validation strategy

Run after each implementation phase:

```bash
node --check app/js/blockchain/history-source.js
node --check app/js/ui/app.js
node --check app/js/protocols/vm-protocol.js
node --check app/js/blockchain/connection.js
node tests/history-source-regressions.test.js
node tests/guild-invite-shell.test.js
```

When archive-node exists:

```bash
node tools/archive-node/*.test.js
```

Browser/manual checks:
1. Existing local checkpoint: app starts without archive mirror.
2. Fresh storage + recent-only node + no mirror: clear degraded warning, no fake full recovery.
3. Fresh storage + recent-only node + mirror: old character/guild/inventory reconstruct through StateEngine.
4. Bad mirror URL: app falls back safely and never blocks signing/broadcasting current actions.
5. TalkBack/keyboard: Settings source selector and degraded notice are usable.

## Risks and mitigations

- **Mirror trust:** Mitigate by keeping mirrors read-only, showing provenance, and later comparing multiple mirrors/state hashes.
- **CORS/hosting friction:** Document minimal headers and provide a simple self-hosted example.
- **Replay performance:** Add snapshots after basic archive fetching works.
- **Protocol drift:** Keep `BlockProcessor -> StateEngine` as the only state mutation path.
- **Existing player bugs:** Collect player reports separately and map each one to either history-source failure or normal gameplay/UI bug.

## Definition of done

- Fresh clients can detect whether public VIZ node history is sufficient.
- Old recovery no longer assumes `viz.api.getBlock(oldBlock)` always works.
- Players can choose/test an archive mirror in an accessible UI.
- A minimal read-only archive-node prototype can index and serve VM/V/VE history.
- The browser still performs deterministic state rebuilding locally.
- No private keys ever leave the browser.
- Documentation clearly explains VIZ node vs archive mirror vs local checkpoint.


## Player Bug Batch — 2026-06-20

**Source:** aggregated player feedback from Denis.

### Scope

Fix or classify as already fixed the current gameplay/UX issues reported by players. Keep changes scoped, old-JS/AMD compatible, and preserve the single frontend/blockchain app architecture.

### Bug list and acceptance checks

1. Blessing quests feel delayed.
   - Check: after a confirmed blessing block is processed, quest progress is visible without extra manual refresh beyond chain/history processing.
2. Blessing quest counts repeated blessings of the same mage despite copy saying different mages.
   - Check: repeated blessing of the same receiver does not increment a `uniqueTarget` blessing objective twice; blessing different receivers does.
3. Blessings may not visibly reach recipients.
   - Check: chronicle/blessing path keeps clear sent/pending/error feedback and processed award events remain visible.
4. Travel quest progress feels delayed and unclear.
   - Check: after travel broadcast, user sees an explicit pending confirmation message; processed move updates quest progress through `StateEngine`.
5. Chronicle tabs reload slowly and become empty again when returning.
   - Check: add/verify cache or retained tab state so returning to a loaded tab does not flash empty unnecessarily.
6. Consumable item use says only “item used”.
   - Check: health scroll/mana potion success toast includes concrete effect amount and current/max value.
7. Crafting recipe cards say only “not enough mana”.
   - Check: recipe list/detail shows required mana percentage when mana is the blocker.
8. Blockchain degradation toast duplicates endlessly.
   - Check: duplicate keyed toast is collapsed/reused while the previous warning is active.
9. Guild entry should require preparation/level and guild list should not be empty just because guilds have not acted recently.
   - Check: join quest/guild UI explains requirements; guild shell/listing remains discoverable after guild creation/invite/listing actions.
10. Duel target level mismatch reported.
    - Check: inspect level source for duel opponent cards/result and ensure it reads current character/grimoire consistently.
11. Character stats lack upgrade guidance.
    - Check: help/profile copy explains how stats grow and what equipment/enchanting affects.
12. Variable energy strike for duels/bosses is a future balancing feature.
    - Check: document as future feature, not part of this bug-fix batch unless needed by existing broken UI.
13. Quick hunt “home” button does not work during pending state.
    - Check: home button remains bound while hunt is pending.
14. Armageddon copy repeats stone requirement.
    - Check: remove duplicated sentence and explain where the stone comes from and what it does.
15. Bag rarity display is unclear.
    - Check: inventory rows include textual rarity, not only symbols/colors.
16. Ingredient descriptions are too thin.
    - Check: add a non-invasive info/description affordance or classify as larger content pass.
17. Mage rating does not load.
    - Check: inspect leaderboard data path and fix empty/error rendering or classify backend/history dependency.
18. Travel list order is inconvenient.
    - Check: low-level regions appear first in map/travel lists.
19. Level 6 can quick-hunt level 1–5 players/creatures.
    - Check: hunt targets should not allow farming below the intended level window unless explicitly designed.
20. Returning from travel to quick hunt can loop between empty region and map.
    - Check: “return to commons” updates local current zone and exits the loop after broadcast/pending handling.

### First implementation batch

Prioritize low-risk fixes with clear local tests: unique blessing targets, toast dedupe, consumable effect messages, mana requirement copy, Armageddon copy, bag rarity text, pending hunt home binding, map order/return loop. Then handle slower data-path bugs (chronicle caching, rating, duel level source) with focused inspection/tests.


### Implemented in player bug batch 1

- Unique-target quest progress now preserves `uniqueTarget` metadata on accepted quests and counts blessing receivers / visited regions once each.
- Chronicle keeps cached tab HTML while refreshing, avoiding the empty/loading flash when returning to an already loaded tab.
- Successful blessing broadcast now injects a local blessing entry immediately so the sender sees feedback before later chain catch-up.
- Connection degradation/history-limited toasts are keyed, so repeated disconnect/probe events do not flood the screen with duplicate warnings.
- Consumable success toasts now include concrete HP/Mana effect details.
- Recipe locked/error copy now shows the required mana percentage.
- Inventory item rows now show textual rarity beside the item name, not only symbols/colors.
- Map travel list is sorted by region minimum level, so early regions appear first.
- Quick hunt filters out creatures below/above the character's level window and the return-to-commons button locally exits the empty-region loop.
- Guild joining now explains the preparation rule and requires level 4 for open joining; personal invites remain the trust-based exception.
- Leaderboard screen has a local character fallback when the 24h scan has not produced rows yet.
- Character screen includes guidance on how stats grow and how to target a specific stat via equipment/crafting/enchanting.
- Armageddon copy no longer repeats the stone requirement and says where the stone can be obtained.

### Deferred / future design items

- Variable-energy duel/boss strikes are a balancing/product feature, not a small bug fix; keep for a separate design pass.
- Rich ingredient encyclopedia/details in the bag should be a separate content/UI pass.
- Guild council is a future progression/social-system idea after the base guild flow stabilizes.
