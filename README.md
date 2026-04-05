# Viz Magic

Browser RPG built on the [VIZ blockchain](https://viz.world). Every action — hunt, craft, duel, trade — is a permanent on-chain record. Outcomes are derived from block hashes: no server, no cheating.

## Play

Open `app/index.html` in any modern browser, or serve the `app/` folder locally:

```bash
cd app && npx serve -p 8765
```

## Core Mechanics

### Mana
Mana is your energy (0–100%). Every spell costs mana. Regenerates automatically — full recovery takes ~5 days. Displayed as a percentage (1.00% = 100 basis points on-chain).

### HP & Recovery
HP does not regenerate to full automatically. Passive regen slowly restores up to **30% of max HP** (+1 HP every 500 blocks, ~4 min). Full recovery:
- Visit the **Hunt screen** (camp rest)
- Use a **Health Scroll** (craftable or dropped by creatures)

### Hunting
Choose a creature and a spell, then attack. Victory earns XP and loot. Defeat gives 25% XP. Loot is volatile — save it in a safe zone.

### Armageddon
Spend 100% mana for 100× normal XP. Requires an **Armageddon Stone** artifact.
- Drop: Thornvine Lv5+ (0.5% chance)
- Craft: Echo Shards ×3 + Shadow Shard ×3 + Fire Dust ×5 at level 10 (costs 5% mana)

### Crafting
Open the **Crafting tab** (🔨), pick a recipe, tap Craft. Materials are consumed. Quality depends on your INT stat and block entropy.

### Marketplace
Browse → buy listed items. Sell → list your items for Seals of the World. Trade → direct item transfer.

### Leaderboard
The **Rankings tab** (🏆) shows the top 100 mages by XP. Updates automatically as you hunt.

### Classes
| Class | Element | Role |
|---|---|---|
| Stonewarden | Terra | Tank |
| Embercaster | Ignis | Burst DPS |
| Moonrunner | Umbra | Evasion |
| Bloomsage | Aqua | Healer |

### SHARES & Magic Core
Your VIZ stake (SHARES) adds a bonus to all stats: `floor(shares^0.3) / 5`. SHARES are never lost in battle.

## Accessibility

Viz Magic is built with blind and low-vision players in mind.

### Battle Narrator
Announces all combat events via screen reader (aria-live). Enable in **Settings → Battle Narrator**. Also plays short spatial audio tones to indicate positions (enemy / player). Compatible with TalkBack on Android.

### Screen Reader Support
- All interactive elements have aria-labels
- Navigation uses `role="tablist"` / `role="tab"`
- Leaderboard table uses `role="grid"` with `aria-current` on the current player row
- Modals and toasts use live regions

## Architecture

```
VIZ Blockchain (custom_sequence ops)
        ↓
BlockProcessor → StateEngine._processGameAction()
        ↓
worldState  (characters / inventories / guilds / leaderboard / …)
        ↓
IndexedDB checkpoint (CheckpointSystem)
        ↓
UI screens (hunt.js / leaderboard.js / crafting.js / …)
```

**Key rule:** all state mutations go through `state-engine.js`. Never mutate `worldState` directly from UI.

## File Map

| What | Where |
|---|---|
| Action types | `app/js/config.js` → `ACTION_TYPES` |
| State engine | `app/js/engine/state-engine.js` |
| Formulas | `app/js/engine/formulas.js` |
| Item templates | `app/js/engine/items.js` |
| Creature loot tables | `app/js/data/creatures.js` |
| Recipes | `app/js/data/recipes.js` |
| Battle Narrator | `app/js/ui/components/battle-narrator.js` |
| Leaderboard screen | `app/js/ui/screens/leaderboard.js` |
| Hunt screen | `app/js/ui/screens/hunt.js` |
| Crafting screen | `app/js/ui/screens/crafting.js` |
| i18n EN | `app/js/i18n/en.js` |
| i18n RU | `app/js/i18n/ru.js` |

## Development

ES5 only (`var`, `function(){}`, no `let`/`const`/arrow functions). No build step — plain JS files loaded via `<script>` tags.

Test account: `dream-world`

## License

MIT
