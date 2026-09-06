# VT Protocol — VIZ Tokens for Viz Magic

Status: version 1 local implementation specification. VT is the protocol name. MAGIC is the sole game currency.

## 1. Scope and invariants

VT is not a token factory. It defines exactly one deterministic currency, MAGIC, for Viz Magic. It has no issuer, administrator mint, redemption right, exchange, liquidity pool, fee, staking reward, or second asset.

All amounts are safe integer milliunits. `1 MAGIC = 1000 milliMAGIC`; VIZ has the same three-decimal precision. The conversion rule is `1.000 VIZ actually burned = 1.000 MAGIC`. Supply is the sum of eligible proven mints minus explicit VT burns. VT v1 defines no MAGIC burn operation. Transfers and Bazaar trades conserve supply.

Genesis/activation is configured as `TOKEN.ACTIVATION_BLOCK` (`83,500,000` in this implementation). A release must verify this remains a future irreversible boundary; if not, it must choose and publish a new future block before deployment. Operations below it never create MAGIC or charge legacy trades. Economic replay commits only canonical irreversible blocks. Canonical identity is `(block_id, transaction index or transaction id, operation index)` and repeating the same identity is a no-op. Equal payloads at different positions remain distinct chain operations, except that mint intents and transfer nonces add deliberate retry idempotency.

## 2. Authority and container

VT actions are VIZ `custom` operations with id `VT`, exactly one `required_regular_auths` signer and no `required_active_auths`. The signer is the monetary owner for MAGIC transfer, mint intent, and Bazaar purchase. Regular authority is intentionally used because MAGIC is game state, not liquid VIZ.

A liquid VIZ transfer to `null` is a separate chain operation and requires VIZ active authority. The Wallet must request separate, explicit active-key consent and must not infer consent from an existing login. A fixed award uses regular authority and must never force active-key login.

Envelope:

`{"p":"VT","v":1,"t":"<type>","d":{...}}`

## 3. Amount grammar

Canonical human input is `0.001` through the largest value whose milliunit representation is a JavaScript safe integer. No sign, whitespace, exponent, leading zero, more than three decimals, NaN, Infinity, zero, or negative value is accepted. Chain VIZ evidence must be exactly `<canonical three decimals> VIZ`.

## 4. Mint intent and proof binding

Liquid-transfer mint action data:

`{"intent":"<1..64 ASCII id>","method":"transfer","amount_milli":<integer>}`

Fixed-award mint action data:

`{"intent":"<1..64 ASCII id>","method":"fixed_award","requested_milli":<integer>,"max_energy":<1..10000>}`

For fixed award, `requested_milli` binds the signed request but never determines issuance. On a successful Core operation with empty beneficiaries it is the exact receiver allocation before VIZ→SHARES rounding; `max_energy` limits whether Core can fund that allocation, not the later realized null-account burn. The ledger issues only an authoritative positive `actualBurnMilli` and requires it not to exceed the request.

The required memo is `viz://vt/mint/v1/<intent>`. The mint action and burn operation must be in the same canonical transaction, have the same signer/initiator, receiver `null`, exact memo, VIZ symbol, exact eligible actual-burn milliunits, and unique intent. One burn can satisfy one mint only. A memo is never independently interpreted as mint, so memo plus custom action cannot double mint.

### Liquid transfer proof

A VIZ `transfer` from the VT signer to `null` provides exact per-operation burn contribution because Core moves the exact liquid amount and `clear_null_account_balance()` removes null liquid balance from `current_supply` at block end. It is eligible only after the block is irreversible.

### Fixed-award proof (fail closed)

Core `fixed_award` is enabled from HF11 and requires the initiator's regular authority. With no beneficiaries, the evaluator assigns exactly `reward_amount` to the receiver, but `create_vesting` records `floor(requested_milli * total_vesting_shares / total_vesting_fund)` SHARES. After all transactions and block maintenance (including funds processing and vesting withdrawals), `clear_null_account_balance` converts the null account's aggregate SHARES back with another integer floor and burns that aggregate VIZ amount from `current_supply`.

The public `operation_history.get_ops_in_block(block, true)` RPC exposes `receive_award` virtual operations and their created SHARES, but not the VIZ amount later removed by null cleanup. It also does not attribute the aggregate cleanup burn to an individual fixed award. Executable fixtures in `tests/vt-fixed-award-proof.test.js` demonstrate both one-milli rounding loss at current-scale vesting ratios and states where identical requested amount plus identical `receive_award.shares` produce different realized burns. Consequently requested amount, created SHARES, current post-block DGP, and a user-authored `canonical:true` field are each insufficient. A fixed-award intent remains `actual_burn_evidence_missing`; the browser never estimates or substitutes requested amount.

Enabling this path requires a consensus-derived per-operation burn receipt, or a consensus null-cleanup virtual operation plus an explicitly approved deterministic attribution rule for multiple same-block null inflows. Until one exists, `FIXED_AWARD_EVIDENCE` stays false. This is the remaining chain-evidence/product prerequisite, not an admin proof flag.

Beneficiaries must be empty. Ordinary percentage `award` is excluded.

## 5. Transfers

`transfer` data is `{"to":"account","amount_milli":<integer>,"nonce":"<id>"}`. The chain-authenticated VT signer is the sender. Consensus treats a syntactically valid VIZ account name as the MAGIC ledger namespace and does not make a non-replayable current-RPC existence lookup; an amount sent to a not-yet-created syntactically valid name remains assigned to that name. The UI additionally requires the recipient to exist at authoring time to prevent accidental sends, but that check is explicitly a safety policy rather than hidden consensus evidence. Debit and credit occur together or not at all. Insufficient balance, self-transfer, malformed amount/auth, or duplicate canonical identity changes nothing.

## 6. Bazaar

Post-activation listings reserve one exact item and carry `price_milli` plus positive `revision`. Reserved items cannot be consumed, reforged, directly transferred, or listed again.

Purchase is VT action `bazaar.buy` with `listing_ref`, exact `revision`, and exact `price_milli`. Reversible/head observations never reserve an item or mutate monetary state. Blocks enter the MAGIC/Bazaar replay only when the source node reports them irreversible. Inside one irreversible block a valid buyer with already available balance receives a short-lived synchronous reservation in exact transaction/operation order, so a later cancel, consume, or competing buy cannot overtake it; settlement and reservation release complete before the block call returns. Replay validates active listing, buyer != seller, exact price/revision, item ownership/reservation, and sufficient MAGIC before mutation. It then debits buyer, credits seller, moves the exact item, marks the listing sold, and records trade history in one deterministic transition. Any failed precondition leaves every balance, item and listing unchanged.

Pre-activation completed market history stays visible as `legacy_unpaid`; it creates no MAGIC and no retroactive payment. Active/pending legacy listings require relisting after activation and cannot be purchased as MAGIC listings.

## 7. Archive, pagination, reorg and recovery

The archive indexes VM/V/VE and marked award rows unchanged, plus VT custom, VT-marked VIZ transfer, fixed_award and any authoritative actual-burn proof. Block metadata and all events are committed in one SQLite transaction before cursor advance. API pages preserve block/transaction/operation order and expose completeness/cursor metadata. Missing blocks/evidence fail closed.

The daemon and browser consume economic operations only through the node-reported `last_irreversible_block_num`. Missing, malformed, or impossible LIB data fails closed; `head - depth` is never promoted to authoritative currency finality. A different block id at an indexed height invalidates that height and descendants before replay; a parent-id discontinuity fails closed. The ledger persists a monotonic finalized floor, refuses replay at or below it even after old identity records are pruned, bounds intent/nonce/proof caches, and stops later economic finalization behind an earlier unresolved proof. A finalized browser-ledger conflict or malformed conservation checkpoint sets `replayRequired`; a full canonical archive replay from the last valid checkpoint is required. Checkpoints add a versioned MAGIC state without deleting old game data. Browser history is bounded; the archive is complete history.

## 8. Wallet safety

The Wallet labels balances and prices MAGIC and mentions VT only as a technical protocol. Burn confirmation names exact VIZ amount, `null`, irreversible nature, 1:1 actual-burn rule, method authority and fixed-award energy cap. History is derived from verified canonical operations/trades, never profile metadata. Inputs and rendered chain fields are validated/escaped. Keys follow existing opt-in persistence only.
