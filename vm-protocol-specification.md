# VM Protocol on VIZ Blockchain

## Protocol specification

* Protocol type: Custom
* Protocol name: **Viz Magic**
* Protocol shortname: **VM**
* Authority type: Regular
* Extensions: VE (Viz Events) for mutable state; [V (Voice)](https://github.com/VIZ-Blockchain/Free-Speech-Project/blob/master/specification.md) for social layer
* Protocol description: Open protocol for back-linked JSON objects in VIZ blockchain, created for deterministic RPG game actions recorded as on-chain inscriptions.

Account creates a custom protocol operation and writes a JSON object with a back-link to the previous object in history. Each inscription references the previous block containing a VM operation from the same account, forming a backward-linked chain of all game actions. This chain can be traversed using the `custom_protocol_api` plugin.

> Example: Account A performed VM operations in blocks: 1000, 1500, 2000. The blockchain stores that account A's last custom operation is in block 2000. We extract operations from block 2000, find the VM inscription, which references block 1500 as the previous link. Block 1500 in turn references block 1000. This allows full reconstruction of any account's game history.

## URL Scheme

Using the VIZ URL scheme:

`viz://@account/block-number/*VM/`

Provides direct access to a specific game inscription from an account at a given block number.

## Object structure

Custom protocol operations contain JSON data. Short attribute names minimize operation size. Version is incremented when backward compatibility is broken. Attributes marked with `*` are optional.

Attribute short | Attribute long | Description
------------ | ------------ | -------------
p | protocol | Protocol identifier. Value: `VM`
v* | version | Protocol version. Default: 1. Increase if backward compatibility is broken.
b | back-link | Block number of the previous VM operation from this account.
t | type | Action type (see Action Types table below).
d | data | Action-specific data object.

### Message format

```json
{
  "p": "VM",
  "v": 1,
  "b": 12340000,
  "t": "hunt",
  "d": { "creature": "ember_wisp", "zone": "commons_first_light", "spell": "firebolt" }
}
```

## Action Types

### Character

Action type | Description | Data fields
------------ | ------------ | -------------
char.attune | Create/attune character | `class` — character class (stonewarden, embercaster, moonrunner, bloomsage)
rest | Rest to regenerate mana | (none)

### PvE — Hunting

Action type | Description | Data fields
------------ | ------------ | -------------
hunt | Hunt a creature | `creature` — creature ID, `zone` — zone ID, `spell` — spell used

### PvP — Duels

Action type | Description | Data fields
------------ | ------------ | -------------
challenge | Challenge another player | `target` — opponent account, `wager` — optional VIZ wager amount
accept | Accept a duel challenge | `challenger` — challenger account
commit | Submit sealed round intent | `hash` — SHA-256 of `intent + salt`
reveal | Reveal round intent | `intent` — action chosen (strike/guard/weave/mend), `salt` — random salt
forfeit | Forfeit an active duel | (none)

### Crafting

Action type | Description | Data fields
------------ | ------------ | -------------
craft | Craft an item | `recipe` — recipe ID, `materials` — array of item IDs consumed

### Items

Action type | Description | Data fields
------------ | ------------ | -------------
item.transfer | Transfer item to another account | `item` — item ID, `to` — recipient account
item.equip | Equip an item | `item` — item ID, `slot` — equipment slot
item.unequip | Unequip an item | `item` — item ID

### Marketplace

Action type | Description | Data fields
------------ | ------------ | -------------
market.list | List item for sale | `item` — item ID, `price` — price in VIZ Essence
market.cancel | Cancel a listing | `item` — item ID
market.buy | Buy a listed item | `item` — item ID, `seller` — seller account

### Guilds

Action type | Description | Data fields
------------ | ------------ | -------------
guild.create | Create a guild | `name` — guild name, `tag` — short tag (2–5 chars)
guild.invite | Invite a player | `target` — account to invite
guild.accept | Accept a guild invitation | `guild` — guild tag
guild.leave | Leave current guild | (none)
guild.promote | Promote a member | `target` — account, `role` — new role
guild.war | Declare war on another guild | `target` — enemy guild tag
guild.peace | Propose peace | `target` — enemy guild tag

### Sieges & Territory

Action type | Description | Data fields
------------ | ------------ | -------------
siege.declare | Declare a siege on a territory | `territory` — territory ID
siege.commit | Commit siege action | `hash` — sealed intent hash
territory.claim | Claim unclaimed territory | `territory` — territory ID

### Locations

Action type | Description | Data fields
------------ | ------------ | -------------
loc.create | Create a player-owned location | `name` — location name, `zone` — zone ID, `type` — location type

### Quests

Action type | Description | Data fields
------------ | ------------ | -------------
quest.accept | Accept a quest | `quest` — quest ID
quest.complete | Complete a quest | `quest` — quest ID, `proof` — completion proof data

### World bosses

Action type | Description | Data fields
------------ | ------------ | -------------
boss.attack | Attack a world boss | `boss` — boss ID, `spell` — spell used

## Grimoire (Character Data)

Character data is stored in the account's `json_metadata` under the key `vm`. This is the public character sheet (Grimoire), readable by any client. It is updated client-side and written to the blockchain via the `account_metadata` operation.

```json
{
  "vm": {
    "class": "embercaster",
    "level": 12,
    "xp": 34500,
    "stats": {
      "potency": 15,
      "resilience": 10,
      "swiftness": 12,
      "intellect": 18,
      "fortune": 8
    },
    "equipment": {
      "weapon": "flame_staff_02",
      "armor": "ember_robe_01",
      "accessory": "ruby_pendant_01"
    },
    "guild": "phoenix",
    "spells": ["firebolt", "inferno", "flame_shield"],
    "title": "Keeper of Embers"
  }
}
```

## Blockchain Mapping

| VIZ Mechanic | Game Mechanic | Usage |
|---|---|---|
| SHARES (stake) | Magic Core | Soul-bound power; determines base stats and spellcasting strength |
| Liquid VIZ | Viz Essence | Tradeable currency for marketplace and wagers |
| Energy (0–10000 bp) | Mana | Channeling capacity; consumed by actions; 5-day full regeneration |
| Award operation | Spellcasting | Attacks, heals, buffs — transfers energy-based rewards |
| custom_sequence (VM) | Inscriptions | All game actions recorded on-chain |
| Account json_metadata | Grimoire | Public character sheet |
| Block hash | Fate Entropy | Deterministic randomness for hunt outcomes, craft quality, loot |
| Block number | Aetheric Tick | Game time unit (1 tick ≈ 3 seconds) |
| Delegation | Patron Bond | Lending power to another player |
| Beneficiaries | Ritual Circles | Splitting rewards among group members |

## Outcome Determination

All random-seeming outcomes (hunt success, loot drops, crafting quality) are derived deterministically from the **block hash** of the block containing the action. This ensures:

1. No server-side randomness is needed.
2. All clients independently compute the same result.
3. Results are verifiable by anyone with access to the blockchain.

The formula combines the block hash with action-specific parameters (creature type, spell used, character stats) to produce outcome values.

## Examples

### Character attunement

```json
{
  "p": "VM",
  "v": 1,
  "b": 0,
  "t": "char.attune",
  "d": { "class": "embercaster" }
}
```

### Hunt

```json
{
  "p": "VM",
  "v": 1,
  "b": 12340000,
  "t": "hunt",
  "d": { "creature": "ember_wisp", "zone": "commons_first_light", "spell": "firebolt" }
}
```

### Duel commit (sealed intent)

```json
{
  "p": "VM",
  "v": 1,
  "b": 12340500,
  "t": "commit",
  "d": { "hash": "a3f2b7c9d1e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4" }
}
```

### Duel reveal

```json
{
  "p": "VM",
  "v": 1,
  "b": 12340600,
  "t": "reveal",
  "d": { "intent": "strike", "salt": "xK9mP2qR" }
}
```

### Craft an item

```json
{
  "p": "VM",
  "v": 1,
  "b": 12341000,
  "t": "craft",
  "d": { "recipe": "flame_staff", "materials": ["wood_01", "ember_crystal_03", "fire_essence_01"] }
}
```

### List item on marketplace

```json
{
  "p": "VM",
  "v": 1,
  "b": 12341500,
  "t": "market.list",
  "d": { "item": "flame_staff_02", "price": 150 }
}
```

### Create a guild

```json
{
  "p": "VM",
  "v": 1,
  "b": 12342000,
  "t": "guild.create",
  "d": { "name": "Order of the Phoenix", "tag": "PHX" }
}
```

### Attack world boss

```json
{
  "p": "VM",
  "v": 1,
  "b": 12343000,
  "t": "boss.attack",
  "d": { "boss": "ancient_drake", "spell": "inferno" }
}
```
