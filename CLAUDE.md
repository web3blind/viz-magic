# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Viz Magic is a decentralized browser-based RPG (dApp) running entirely on the VIZ blockchain. It is a static web application (HTML/CSS/ES5 JavaScript) with no build step, no server, no npm, and no framework dependencies. All game logic is deterministic and client-side. The blockchain is the source of truth.

## Running the App

```bash
# Serve locally (any HTTP server works)
cd app && python3 -m http.server 8123

# Or open app/index.html directly in a browser
```

There is no build, lint, or test command. Testing is manual via browser DevTools. The app auto-connects to VIZ blockchain nodes listed in `app/js/config.js`.

## Architecture

### Module System

All code uses ES5 IIFE module pattern — no ES modules, no bundler. Each file exposes a single global variable:

```javascript
var ModuleName = (function() {
    'use strict';
    // private state
    function publicMethod() { /* ... */ }
    return { publicMethod: publicMethod };
})();
```

Modules communicate via `Helpers.EventBus` (pub/sub):
```javascript
Helpers.EventBus.emit('navigate', 'home');
Helpers.EventBus.on('character:levelup', function(data) { /* ... */ });
```

### Directory Layout

- `app/js/engine/` — Deterministic game logic (state engine, combat, crafting, duels, guilds, quests, world events). This is the core of the game. `state-engine.js` is the central event-sourced state machine that processes blockchain blocks into world state.
- `app/js/ui/screens/` — 18 game screens, each an IIFE module with a `render()` function. Screens are `<section id="screen-{name}">` elements shown/hidden via `.active` CSS class.
- `app/js/ui/components/` — Reusable UI pieces (modal, toast, nav, progress bar, battle narrator).
- `app/js/protocols/` — Serialization for VM (game actions), VE (mutable state), V (social/Voice) protocol messages sent as VIZ custom operations.
- `app/js/blockchain/` — VIZ node connection, account auth, transaction broadcast, invite system.
- `app/js/data/` — Game content definitions: creatures, spells, recipes, regions, quests.
- `app/js/i18n/` — Localization strings (`ru.js`, `en.js`). Use `Helpers.t(key, vars)` for lookups.
- `app/js/utils/` — Helpers (DOM utilities, EventBus, i18n), crypto, accessibility (WCAG 2.1).
- `app/css/` — `main.css` (core), `themes.css` (light/dark via CSS variables), `accessibility.css`.
- `app/lib/viz.min.js` — VIZ blockchain library (only external dependency).

### Data Flow

```
User Action → Validation (engine/validator.js) → VM Protocol message
→ Sign & Broadcast to VIZ chain → Block poll (every 3s)
→ block-processor.js extracts VM/VE/V ops → state-engine.js processes game logic
→ Checkpoint saved to IndexedDB → EventBus emits events → UI re-renders
```

### Key Concepts

- **Grimoire**: Character data stored on-chain in account `json_metadata` under key `vm`.
- **Inscriptions**: Game actions are JSON objects written as VIZ custom operations.
- **Fate Entropy**: Block hashes provide deterministic randomness for loot, duel outcomes, crafting quality.
- **Checkpoint System** (`engine/checkpoint.js`): IndexedDB snapshots of world state for fast recovery.
- **Optimistic Updates**: UI updates immediately, blockchain confirms within ~3 seconds.

### Game Systems

- **4 classes**: Stonewarden (tank), Embercaster (DPS), Moonrunner (evasion), Bloomsage (healer)
- **5 magic schools**: Ignis, Aqua, Terra, Ventus, Umbra — with an elemental dominance wheel (1.5x/1.0x/0.7x)
- **Mana**: 0-10000 basis points internally, displayed as 0.00%-100.00% in UI. Full regen in 5 days.
- **Duels**: Commit-reveal protocol (SHA-256 sealed intent → reveal after N blocks). 4 intents: Strike/Guard/Weave/Mend.
- **Leveling**: XP formula `1000 * level^1.5`, soft cap at level 50.

## Key Configuration

All game constants are in `app/js/config.js` (the `VizMagicConfig` module). This includes VIZ node endpoints, protocol IDs, energy/mana constants, block timing, class/school definitions, action types, and storage keys (prefix: `viz_magic_`).

## Design Documents

- `vm-protocol-specification.md` — Full VM protocol spec
- `GAME_DESIGN.md` — Game design document
- `UX_DESIGN.md` — UX design document
- `tests.md` — Test report

## Conventions

- ES5 strict mode everywhere — no `let`/`const`, no arrow functions, no template literals.
- DOM access via `Helpers.$(id)`, `Helpers.$q(selector)`, `Helpers.$$q(selector)`.
- All strings must be localized via `Helpers.t('key')` with entries in both `i18n/ru.js` and `i18n/en.js`.
- Screen modules export `{ render: render }` and render into `<section id="screen-{name}">`.
- Accessibility: interactive elements need `role`, `aria-label`, `aria-live` attributes. Touch targets min 48x48px.
