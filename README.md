# Viz Magic

<p align="center">
🔮⚔️🛡️🌿
<br>
<a href="README-ru.md">Русская версия</a> - <b>English version</b>
</p>

Viz Magic is a decentralized browser-based RPG (dApp) running entirely on the [VIZ blockchain](https://github.com/VIZ-Blockchain/viz-cpp-node/). It is built on three open protocols — [VM (Viz Magic)](vm-protocol-specification.md), VE (Viz Events), and [V (Voice)](https://github.com/VIZ-Blockchain/Free-Speech-Project/blob/master/specification.md) — using VIZ custom operations to record all game actions on-chain.

No server is required. All game logic is deterministic and client-side. The app is a static web page (HTML/JS/CSS) that can be opened directly from files or hosted on any web server. It works offline via Service Worker and is installable as a PWA.

## How it works

Every game action — hunting creatures, dueling other players, crafting items, trading on the marketplace — is an **Inscription**: a JSON object written to the VIZ blockchain as a custom operation. Character data is stored in the account's `json_metadata` under the key `vm`, forming a public **Grimoire** (character sheet) readable by any client.

The blockchain itself provides game mechanics:

| VIZ Mechanic | Game Mechanic |
|---|---|
| SHARES (stake) | **Magic Core** — soul-bound power |
| Liquid VIZ | **Viz Essence** — tradeable currency |
| Energy (0–10000 bp) | **Mana** — channeling capacity |
| Award operation | **Spellcasting** — attacks, heals, buffs |
| custom_sequence (VM) | **Inscriptions** — all game actions |
| Account json_metadata | **Grimoire** — public character sheet |
| Block hash | **Fate Entropy** — unpredictable outcomes |
| Block number | **Aetheric Tick** — time (1 tick ≈ 3 sec) |
| Delegation | **Patron Bond** — power lending |
| Beneficiaries | **Ritual Circles** — reward splits |

Outcomes (hunt loot, duel resolution, crafting quality) are derived deterministically from block hashes, ensuring fairness without any server-side randomness.

## Protocols

The game uses three protocols on VIZ custom operations:

- **VM** (Viz Magic) — all game actions: character attunement, hunting, duels, crafting, marketplace, guilds, sieges, quests, world bosses. See the [VM Protocol Specification](vm-protocol-specification.md).
- **VE** (Viz Events) — mutable game state: enchanting, item consumption, edits. Based on the [Voice Events](https://github.com/VIZ-Blockchain/Free-Speech-Project/blob/master/events-specification.md) extension.
- **V** (Voice) — social layer for the Realm Chronicle: posts, replies, shares. Uses the [Voice protocol](https://github.com/VIZ-Blockchain/Free-Speech-Project/blob/master/specification.md).

## Game features

- **4 character classes**: Stonewarden (terra/tank), Embercaster (ignis/DPS), Moonrunner (evasion), Bloomsage (healer)
- **5 magic schools**: Ignis, Aqua, Terra, Ventus, Umbra with a dominance wheel
- **PvE**: Hunt creatures across zones, earn XP and loot
- **PvP**: Commit-reveal duels (strike/guard/weave/mend), best of 3, with auto-mode
- **Crafting**: Combine materials into equipment
- **Marketplace**: List, buy, and trade items on-chain
- **Guilds**: Create guilds, declare wars, siege territories
- **Quests**: Daily prophecies and storyline quests
- **World events**: Seasons, world bosses, Weave Surges
- **Items**: 5 rarity tiers (Common → Legendary)
- **Realm Chronicle**: Social posts via the Voice protocol
- **Leveling**: XP system with soft cap at level 50
- **i18n**: Full Russian and English support
- **Accessibility**: WCAG 2.1, screen reader support, keyboard navigation
- **PWA**: Installable, works offline

## How to use

1. Open `app/index.html` in a browser — directly from files or via any web server.
2. Sign in with your VIZ account using a regular private key.
3. Attune your character (choose a class) and begin your journey.

### VIZ nodes

The app connects to the VIZ blockchain through one of the available nodes:

- `wss://solox.world/ws`
- `https://viz.lexa.host/`
- `https://api.viz.world/`
- `https://node.viz.cx/`

## Tech stack

- Pure HTML / CSS / JavaScript — no frameworks, no build step
- [viz-js-lib](https://github.com/nicholasgasior/viz-js-lib) — VIZ blockchain interaction
- Service Worker — offline support and caching
- Web App Manifest — PWA installability

## License

MIT
