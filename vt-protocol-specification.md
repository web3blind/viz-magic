# VT Protocol — VIZ Tokens for Viz Magic

Status: version 1 local implementation specification. VT is the protocol name. MAGIC is the sole game currency.

## 1. Scope and invariants

VT is not a token factory. It defines exactly one deterministic currency, MAGIC, for Viz Magic. It has no issuer, administrator mint, redemption right, exchange, liquidity pool, fee, staking reward, or second asset.

All MAGIC and VIZ amounts are safe integer milliunits. `1 MAGIC = 1000 milliMAGIC`; VIZ has the same three-decimal precision. Liquid transfer and fixed-award use `1.000 confirmed nominal VIZ directed to null = 1.000 MAGIC`. Ordinary award uses the explicit game conversion policy `1.000000 canonical received SHARES = 1.000 MAGIC`; this does not assert that native SHARES and VIZ are economically or technically equal. It is deliberately independent of current or historical DGP conversion. Supply is the sum of eligible proven mints minus explicit VT burns. VT v1 defines no MAGIC burn operation. Transfers and Bazaar trades conserve supply.

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

The required memo is `viz://vt/mint/v1/<intent>`. The mint action and allocation operation must be in the same canonical transaction and bind the same authenticated signer/initiator, receiver `null`, memo, amount or energy, beneficiaries, transaction identity/position, operation position, and unique intent. An ordinary-award source and receipt additionally require the same non-empty transaction id, the same source operation position, and a positive unique `virtual_op`. One canonical source proof can satisfy one mint across all methods. A memo is never independently interpreted as mint, so memo plus custom action cannot double mint.

### Liquid transfer proof

A VIZ `transfer` from the VT signer to `null` provides an exact nominal VIZ amount in the signed operation. It is eligible only after the block is irreversible.

### Fixed-award proof

Core `fixed_award` is enabled from HF11 and requires the initiator's regular authority. A canonical successful operation with receiver `null`, empty beneficiaries, exact memo, VIZ denomination, exact `reward_amount`, and exact `max_energy` issues the same number of MAGIC milliunits as its nominal `reward_amount`. Inclusion in an irreversible canonical block proves that Core accepted the operation, including the energy constraint. Vesting conversion and later null cleanup rounding do not alter this protocol allocation rule.

### Ordinary-award receipt and game conversion

Ordinary percentage `award` is an allowed VT method and uses regular authority. Its source operation binds initiator, `null`, exact integer energy, custom sequence, memo and empty beneficiaries. Successful Core execution emits `receive_award` at the same canonical transaction/operation position with the same initiator, receiver, custom sequence and memo. The archive indexes that virtual receipt and its exact positive six-decimal `shares` field with transaction id, transaction/operation/virtual-operation positions and receipt-range completeness. Missing, malformed, mismatched, duplicate, or ambiguous source/receipt evidence is not mint proof.

The exact output is derived only after irreversibility from canonical `receive_award.shares`: `milliMAGIC = floor(microSHARES / 1000)`. The remainder `microSHARES % 1000` is recorded and discarded because MAGIC has three decimals while SHARES has six. A positive receipt below `0.001000 SHARES` therefore resolves the intent and consumes the proof but issues `0.000 MAGIC`; it is never rounded up. A missing receipt in incomplete history remains pending for hydration without another award. Complete history proving no valid positive receipt finalizes as no mint and cannot freeze later ledger processing. No authored energy-to-output estimate, current DGP, historical DGP inversion, or fabricated receipt is used.

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

The Wallet labels balances and prices MAGIC and mentions VT only as a technical protocol. Fixed-award confirmation names the exact nominal VIZ amount, equal future MAGIC output, `null`, irreversible nature, regular authority and energy cap. Liquid transfer remains an explicit optional active-key route. Ordinary award accepts only integer energy and states that output is unknown until canonical `receive_award`; it explains the game-only SHARES conversion, three-decimal floor, discarded remainder and possible `0.000 MAGIC` result without inventing an estimate. Unknown broadcast status persists locally and warns against retry until irreversible history resolves the same intent. History is derived from verified canonical operations/trades, never profile metadata. Inputs and rendered chain fields are validated/escaped. Keys follow existing opt-in persistence only.
Every VIZ-consuming mint route runs a fresh fail-closed preflight before broadcast. It requires an authoritative positive `last_irreversible_block_num` at or above TOKEN genesis and a healthy, fresh, read-only SQLite archive whose cursor and observed irreversible head match and whose complete source/virtual ranges cover every block from genesis through that LIB. Before genesis, or while LIB/archive health/completeness is unavailable, controls remain visibly disabled and no VIZ operation is sent. A preflight rejection is distinguished from an unknown broadcast result: the former clears the locally staged pending intent because no transaction was attempted; the latter remains pending and blocks retry.
