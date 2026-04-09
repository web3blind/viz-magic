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
- **Armageddon**: Spend 100% mana for 100× XP — requires a rare Armageddon Stone artifact (drops from Thornvine Lv5+, or craft from Echo Shards × 3 + Shadow Shard × 3 + Fire Dust × 5 at level 10). Full confirmation flow protects against accidental use. Each use is recorded on-chain for verifiable authenticity.
- **Crafting**: Combine materials into equipment — accessible via the 🔨 tab in the bottom navigation
- **Marketplace**: List, buy, and trade items on-chain
- **Guilds**: Create guilds, invite members, promote your guild for discovery, declare wars, siege territories
- **Quests**: Daily prophecies and storyline quests
- **World events**: Seasons, world bosses, Weave Surges
- **Items**: 5 rarity tiers (Common → Legendary)
- **Realm Chronicle**: Social posts via the Voice protocol
- **Leveling**: XP system with soft cap at level 50
- **Leaderboard**: Top 100 mages by XP — accessible via the 🏆 tab
- **Mana display**: Shown as a percentage (0.00%–100.00%) across all UI screens; internal blockchain values remain in basis points (0–10000)
- **i18n**: Full Russian and English support
- **Accessibility**: WCAG 2.1, screen reader support, keyboard navigation, Battle Narrator
- **PWA**: Installable, works offline

## HP & Recovery

HP does not regenerate automatically to full. Passive regen slowly restores up to **30% of max HP** (+1 HP every 100 blocks, ~5 min). Full recovery requires visiting the Hunt screen (camp rest) or using a **Health Scroll** (craftable or dropped by creatures).

## Accessibility — Battle Narrator

The Battle Narrator announces all combat events via the screen reader (`aria-live`). Enable it in **Settings**. It also plays short spatial audio tones to indicate positions (enemy / player). Designed for blind and low-vision players. Compatible with TalkBack on Android.

## How to use

1. Open `app/index.html` in a browser — directly from files or via any web server.
2. Sign in with your VIZ account using a regular private key.
3. Attune your character (choose a class) and begin your journey.

### VIZ nodes

The app connects to the VIZ blockchain through one of the available nodes:

- `https://api.viz.world/`
- `https://node.viz.cx/`

## For developers — add content and earn

Viz Magic is built so any developer can extend the game world and earn rewards for their contributions via the VIZ blockchain.

### How contributor economics work

Every creature, world boss, and game object has an `author` field — the VIZ account name of the developer who created it. When a player hunts a creature or attacks a world boss, the game automatically sends an `award` operation to the author's account. The author receives a share of VIZ emission proportional to the number of awards received, which converts into SHARES (network influence).

Flow:
1. Player spends mana (energy) — an `award` is sent to the content author
2. The author accumulates rewards in their VIZ account
3. SHARES grow → network influence grows → passive income via delegation

### How to add your own creature

Open `app/js/data/creatures.js` and add an object to `CREATURES`:

```js
my_creature: {
    id: 'my_creature',
    name: 'My Creature',
    school: 'aqua',          // ignis / aqua / terra / ventus / umbra
    author: 'your-viz-account',  // ← your VIZ account here
    minLevel: 2,
    maxLevel: 6,
    baseHp: 20,
    basePot: 10,
    baseRes: 5,
    baseSwf: 8,
    baseXp: 40,
    zone: 'commons_first_light',
    lootTable: [
        { itemType: 'water_crystal', name: 'Water Crystal', dropRate: 300 }
    ]
}
```

The `author` field is your VIZ account name. Every time a player hunts your creature, the award goes to that account.

### What else you can contribute

- **Creatures** (`app/js/data/creatures.js`) — new enemies with unique stats
- **World bosses** (`app/js/engine/world-boss.js`) — raid bosses with `author` field; every player attack sends an award to the author
- **Spells** (`app/js/data/spells.js`) — new magic schools and effects
- **Zones** (`app/js/data/regions.js`) — new game regions
- **Quests** (`app/js/data/quests.js`) — quest chains and storylines
- **Items and recipes** (`app/js/data/recipes.js`) — crafting and loot

Submit a Pull Request — add your content with your `author` VIZ account and start earning from the first player who interacts with it.

## Tech stack

- Pure HTML / CSS / JavaScript — no frameworks, no build step
- [viz-js-lib](https://github.com/nicholasgasior/viz-js-lib) — VIZ blockchain interaction
- Service Worker — offline support and caching
- Web App Manifest — PWA installability

## License

MIT
