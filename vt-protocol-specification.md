# VT Protocol — VIZ Tokens for Viz Magic

Status: version 1 local implementation specification. VT is the protocol name. MAGIC is the sole game currency.

## 1. Scope and invariants

VT is not a token factory. It defines exactly one deterministic currency, MAGIC, for Viz Magic. It has no issuer, administrator mint, redemption right, exchange, liquidity pool, fee, staking reward, or second asset.

All amounts are safe integer milliunits. `1 MAGIC = 1000 milliMAGIC`; VIZ has the same three-decimal precision. The conversion rule is `1.000 confirmed nominal VIZ directed to null = 1.000 MAGIC`. It is deliberately based on the canonical operation allocation, not on an individually attributed final `current_supply` decrement after Core vesting rounding. Supply is the sum of eligible proven mints minus explicit VT burns. VT v1 defines no MAGIC burn operation. Transfers and Bazaar trades conserve supply.

Genesis/activation is configured as `TOKEN.ACTIVATION_BLOCK` (`83,500,000` in this implementation). A release must verify this remains a future irreversible boundary; if not, it must choose and publish a new future block before deployment. Operations below it never create MAGIC or charge legacy trades. Economic replay commits only canonical irreversible blocks. Canonical identity is `(block_id, transaction index or transaction id, operation index)` and repeating the same identity is a no-op. Equal payloads at different positions remain distinct chain operations, except that mint intents and transfer nonces add deliberate retry idempotency.

## 2. Authority and container

VT actions are VIZ `custom` operations with id `VT`, exactly one `required_regular_auths` signer and no `required_active_auths`. The signer is the monetary owner for MAGIC transfer, mint intent, and Bazaar purchase. Regular authority is intentionally used because MAGIC is game state, not liquid VIZ.

A liquid VIZ transfer to `null` is an optional separate chain operation and requires VIZ active authority. The Wallet must request separate, explicit active-key consent and must not infer consent from an existing login. Fixed and ordinary awards use regular authority and must never force active-key login.

Envelope:

`{"p":"VT","v":1,"t":"<type>","d":{...}}`

## 3. Amount grammar

Canonical human input is `0.001` through the largest value whose milliunit representation is a JavaScript safe integer. No sign, whitespace, exponent, leading zero, more than three decimals, NaN, Infinity, zero, or negative value is accepted. Chain VIZ evidence must be exactly `<canonical three decimals> VIZ`.

## 4. Mint intent and proof binding

Liquid-transfer mint action data:

`{"intent":"<1..64 ASCII id>","method":"transfer","amount_milli":<integer>}`

Fixed-award mint action data:

`{"intent":"<1..64 ASCII id>","method":"fixed_award","requested_milli":<integer>,"max_energy":<1..10000>}`

Ordinary-award mint action data:

`{"intent":"<1..64 ASCII id>","method":"award","energy":<1..10000>}`

The required memo is `viz://vt/mint/v1/<intent>`. The mint action and allocation operation must be in the same canonical transaction and bind the same authenticated signer/initiator, receiver `null`, memo, amount or energy, beneficiaries, transaction id/index, operation index, and unique intent. One source operation can satisfy one mint only. A memo is never independently interpreted as mint, so memo plus custom action cannot double mint.

### Liquid transfer proof

A VIZ `transfer` from the VT signer to `null` provides an exact nominal VIZ amount in the signed operation. It is eligible only after the block is irreversible.

### Fixed-award proof

Core `fixed_award` is enabled from HF11 and requires the initiator's regular authority. A canonical successful operation with receiver `null`, empty beneficiaries, exact memo, VIZ denomination, exact `reward_amount`, and exact `max_energy` issues the same number of MAGIC milliunits as its nominal `reward_amount`. Inclusion in an irreversible canonical block proves that Core accepted the operation, including the energy constraint. Vesting conversion and later null cleanup rounding do not alter this protocol allocation rule.

### Ordinary-award receipt (approved, exact amount currently unavailable)

Ordinary percentage `award` is an allowed VT method and also uses regular authority. Its source operation binds initiator, `null`, energy, custom sequence, memo and empty beneficiaries. Successful Core execution emits `receive_award` at the same canonical transaction/operation position with the same initiator, receiver, custom sequence and memo. The archive indexes that virtual receipt and its exact positive `shares` field with `virtual_op` position and receipt-range completeness.

The checked Core and live `operation_history.get_ops_in_block` response expose the received value only as six-decimal `SHARES`; the signed source operation contains energy but no VIZ amount. Public historical block and operation APIs do not expose the operation-time vesting-fund/share snapshot needed to invert `create_vesting` reproducibly. A current vesting price, client estimate or `SHARES = VIZ` shortcut is forbidden. Therefore the archive can prove success and binding now, but cannot yet issue an exact number of MAGIC units for ordinary award. The Wallet does not broadcast this route or promise an estimate. The smallest remaining decision/evidence is an authoritative historical nominal-VIZ allocation field/snapshot, or an explicit new protocol conversion convention; neither is invented in v1.

## 5. Transfers

`transfer` data is `{"to":"account","amount_milli":<integer>,"nonce":"<id>"}`. The chain-authenticated VT signer is the sender. Consensus treats a syntactically valid VIZ account name as the MAGIC ledger namespace and does not make a non-replayable current-RPC existence lookup; an amount sent to a not-yet-created syntactically valid name remains assigned to that name. The UI additionally requires the recipient to exist at authoring time to prevent accidental sends, but that check is explicitly a safety policy rather than hidden consensus evidence. Debit and credit occur together or not at all. Insufficient balance, self-transfer, malformed amount/auth, or duplicate canonical identity changes nothing.

## 6. Bazaar

Post-activation listings reserve one exact item and carry `price_milli` plus positive `revision`. Reserved items cannot be consumed, reforged, directly transferred, or listed again.

Purchase is VT action `bazaar.buy` with `listing_ref`, exact `revision`, and exact `price_milli`. Reversible/head observations never reserve an item or mutate monetary state. Blocks enter the MAGIC/Bazaar replay only when the source node reports them irreversible. Inside one irreversible block a valid buyer with already available balance receives a short-lived synchronous reservation in exact transaction/operation order, so a later cancel, consume, or competing buy cannot overtake it; settlement and reservation release complete before the block call returns. Replay validates active listing, buyer != seller, exact price/revision, item ownership/reservation, and sufficient MAGIC before mutation. It then debits buyer, credits seller, moves the exact item, marks the listing sold, and records trade history in one deterministic transition. Any failed precondition leaves every balance, item and listing unchanged.

Pre-activation completed market history stays visible as `legacy_unpaid`; it creates no MAGIC and no retroactive payment. Active/pending legacy listings require relisting after activation and cannot be purchased as MAGIC listings.

## 7. Archive, pagination, reorg and recovery

The archive indexes VM/V/VE and marked award rows unchanged, plus VT custom, VT-marked VIZ transfer, fixed_award, ordinary award and bound `receive_award` virtual receipts. From the VT activation boundary, every indexed block requires both canonical block identity and `operation_history` coverage; source rows must match raw source operations before a virtual receipt is accepted. Event identity includes `virtual_op`, and block/range APIs expose virtual-receipt completeness. Block metadata and all events are committed in one SQLite transaction before cursor advance. The additive SQLite migration preserves legacy rows and game data. API pages preserve block/transaction/operation/virtual-operation order and expose completeness/cursor metadata. Missing blocks/evidence fail closed.

The daemon and browser consume economic operations only through the node-reported `last_irreversible_block_num`. Missing, malformed, or impossible LIB data fails closed; `head - depth` is never promoted to authoritative currency finality. A different block id at an indexed height invalidates that height and descendants before replay; a parent-id discontinuity fails closed. The ledger persists a monotonic finalized floor, refuses replay at or below it even after old identity records are pruned, bounds intent/nonce/proof caches, and stops later economic finalization behind an earlier unresolved proof. A finalized browser-ledger conflict or malformed conservation checkpoint sets `replayRequired`; a full canonical archive replay from the last valid checkpoint is required. Checkpoints add a versioned MAGIC state without deleting old game data. Browser history is bounded; the archive is complete history.

## 8. Wallet safety

The Wallet labels balances and prices MAGIC and mentions VT only as a technical protocol. Fixed-award confirmation names the exact nominal VIZ amount, equal future MAGIC output, `null`, irreversible nature, regular authority and energy cap. Liquid transfer remains an explicit optional active-key route. Ordinary award is labelled approved but unavailable until its exact historical VIZ allocation is reproducible; no estimate is displayed as output. Unknown broadcast status persists locally and warns against retry until irreversible history resolves the same intent. History is derived from verified canonical operations/trades, never profile metadata. Inputs and rendered chain fields are validated/escaped. Keys follow existing opt-in persistence only.
