# VIZ Blockchain JS Library - Complete Technical Reference for Game Development

## TABLE OF CONTENTS
1. Operation IDs & Types
2. All Operations with Exact Field Types
3. Key Authority Roles
4. Custom Sequence Mechanism
5. Energy/Mana System
6. Award Calculation
7. Invite System Flow
8. Account Metadata
9. API Methods Reference
10. Transaction Lifecycle
11. Utility Functions (Voice Protocol)
12. Asset Format
13. Formatter Functions
14. Gotchas & Edge Cases

---

## 1. OPERATION IDS (ChainTypes.operations)

```
vote: 0                              content: 1
transfer: 2                          transfer_to_vesting: 3
withdraw_vesting: 4                  account_update: 5
witness_update: 6                    account_witness_vote: 7
account_witness_proxy: 8             delete_content: 9
custom: 10                           set_withdraw_vesting_route: 11
request_account_recovery: 12         recover_account: 13
change_recovery_account: 14          escrow_transfer: 15
escrow_dispute: 16                   escrow_release: 17
escrow_approve: 18                   delegate_vesting_shares: 19
account_create: 20                   account_metadata: 21
proposal_create: 22                  proposal_update: 23
proposal_delete: 24                  chain_properties_update: 25
author_reward: 26 (virtual)          curation_reward: 27 (virtual)
content_reward: 28 (virtual)         fill_vesting_withdraw: 29 (virtual)
shutdown_witness: 30 (virtual)       hardfork: 31 (virtual)
content_payout_update: 32 (virtual)  content_benefactor_reward: 33 (virtual)
return_vesting_delegation: 34 (virt) committee_worker_create_request: 35
committee_worker_cancel_request: 36  committee_vote_request: 37
committee_cancel_request: 38 (virt)  committee_approve_request: 39 (virt)
committee_payout_request: 40 (virt)  committee_pay_request: 41 (virtual)
witness_reward: 42 (virtual)         create_invite: 43
claim_invite_balance: 44             invite_registration: 45
versioned_chain_properties_update:46 award: 47
receive_award: 48 (virtual)          benefactor_award: 49 (virtual)
set_paid_subscription: 50            paid_subscribe: 51
paid_subscription_action: 52 (virt)  cancel_paid_subscription: 53
set_account_price: 54                set_subaccount_price: 55
buy_account: 56                      account_sale: 57 (virtual)
use_invite_balance: 58               expire_escrow_ratification: 59 (virt)
fixed_award: 60                      target_account_sale: 61
bid: 62 (virtual)                    outbid: 63 (virtual)
```

---

## 2. ALL OPERATIONS WITH EXACT FIELD TYPES

### GAME-CRITICAL OPERATIONS

#### award (op 47) - Role: regular
The main reward mechanism. Sends SHARES from initiator's social capital.
```
initiator:        string        // account sending award
receiver:         string        // account receiving award
energy:           uint16        // 0-10000 (0.00% - 100.00%), energy to spend
custom_sequence:  uint64        // custom protocol sequence number (0 = ignored)
memo:             string        // memo text (can be empty "")
beneficiaries:    set(beneficiaries)  // array of {account: string, weight: uint16}
                                      // weight is in basis points (10000 = 100%)
```
Broadcast: `viz.broadcast.award(wif, initiator, receiver, energy, custom_sequence, memo, beneficiaries, callback)`

#### fixed_award (op 60) - Role: regular
Award with a fixed target amount. Blockchain calculates how much energy needed.
```
initiator:        string        // account sending award
receiver:         string        // account receiving award
reward_amount:    asset         // target amount in "X.000000 SHARES"
max_energy:       uint16        // maximum energy willing to spend (0-10000)
custom_sequence:  uint64        // custom protocol sequence number
memo:             string        // memo text
beneficiaries:    set(beneficiaries)
```
Broadcast: `viz.broadcast.fixedAward(wif, initiator, receiver, reward_amount, max_energy, custom_sequence, memo, beneficiaries, callback)`

#### custom (op 10) - Role: regular or active
Arbitrary data storage on blockchain. Used for game state, protocols, etc.
```
required_active_auths:  set(string)  // array of accounts needing active auth
required_regular_auths: set(string)  // array of accounts needing regular auth
id:                     string       // protocol identifier (e.g. "V", "VE", "game1")
json:                   string       // arbitrary JSON payload
```
Broadcast: `viz.broadcast.custom(wif, required_active_auths, required_regular_auths, id, json, callback)`

Example: `viz.broadcast.custom(wif, [], ['myaccount'], 'mygame', JSON.stringify({action:'move', x:5}), cb)`

#### account_metadata (op 21) - Role: regular
Update account profile metadata (avatar, name, about, etc.)
```
account:        string    // account name
json_metadata:  string    // JSON string with metadata
```
Broadcast: `viz.broadcast.accountMetadata(wif, account, json_metadata, callback)`

### INVITE OPERATIONS

#### create_invite (op 43) - Role: active
Create an invite code funded with VIZ tokens.
```
creator:     string       // account creating the invite
balance:     asset        // amount like "10.000 VIZ"
invite_key:  public_key   // public key (VIZ...) for the invite
```

#### claim_invite_balance (op 44) - Role: active
Claim invite balance to an existing account (received as VIZ tokens).
```
initiator:     string    // any account (can be temp)
receiver:      string    // existing account to receive balance
invite_secret: string    // private key corresponding to invite_key (WIF format)
```

#### invite_registration (op 45) - Role: active
Use an invite to register a NEW account.
```
initiator:        string       // any account
new_account_name: string       // new account name (2-25 chars, a-z, 0-9, -)
invite_secret:    string       // private key (WIF) of the invite
new_account_key:  public_key   // public key for all auth levels of new account
```

#### use_invite_balance (op 58) - Role: active
Use invite balance to receive SHARES (vesting, not liquid VIZ).
```
initiator:     string    // any account
receiver:      string    // account to receive SHARES
invite_secret: string    // private key of invite
```

### ACCOUNT OPERATIONS

#### account_create (op 20) - Role: active/master
```
fee:              asset         // "1.000 VIZ" (creation fee, goes to new account as SHARES)
delegation:       asset         // "0.000000 SHARES" (initial delegation)
creator:          string        // creator account name
new_account_name: string        // new account name
master:           authority     // {weight_threshold: uint32, account_auths: map(string,uint16), key_auths: map(public_key,uint16)}
active:           authority
regular:          authority
memo_key:         public_key    // memo public key
json_metadata:    string        // initial metadata JSON
referrer:         string        // referrer account (can be "")
extensions:       set(future_extensions)  // usually []
```

#### account_update (op 5) - Role: master/active
```
account:        string                 // account to update
master:         optional(authority)     // null/undefined to keep unchanged
active:         optional(authority)     // null/undefined to keep unchanged
regular:        optional(authority)     // null/undefined to keep unchanged
memo_key:       public_key             // must always be provided
json_metadata:  string                 // must always be provided
```

#### authority structure:
```javascript
{
  weight_threshold: 1,          // uint32
  account_auths: [],            // array of [account_name, weight] pairs
  key_auths: [['VIZ...', 1]]   // array of [public_key, weight] pairs
}
```

### TRANSFER OPERATIONS

#### transfer (op 2) - Role: active/master
```
from:   string    // sender
to:     string    // receiver
amount: asset     // "1.000 VIZ"
memo:   string    // memo text
```

#### transfer_to_vesting (op 3) - Role: active
Convert VIZ tokens to SHARES (vesting/social capital).
```
from:   string    // sender
to:     string    // receiver (can be same as from)
amount: asset     // "1.000 VIZ"
```

#### withdraw_vesting (op 4) - Role: active
Power down - convert SHARES back to VIZ over time.
```
account:        string    // account
vesting_shares: asset     // "1.000000 SHARES" to start withdrawing
```

#### delegate_vesting_shares (op 19) - Role: active/master
Delegate social capital to another account.
```
delegator:      string    // account delegating
delegatee:      string    // account receiving delegation
vesting_shares: asset     // "1.000000 SHARES" (set to 0 to undelegate)
```

### ESCROW OPERATIONS

#### escrow_transfer (op 15) - Role: active
```
from:                   string          // sender
to:                     string          // receiver
token_amount:           asset           // "1.000 VIZ"
escrow_id:              uint32          // unique ID for this escrow
agent:                  string          // third-party agent account
fee:                    asset           // agent fee "0.100 VIZ"
json_metadata:          string          // metadata
ratification_deadline:  time_point_sec  // ISO date or unix timestamp
escrow_expiration:      time_point_sec  // when escrow expires
```

#### escrow_dispute (op 16) - Role: active
```
from: string, to: string, agent: string, who: string, escrow_id: uint32
```

#### escrow_release (op 17) - Role: active
```
from: string, to: string, agent: string, who: string, receiver: string, escrow_id: uint32, token_amount: asset
```

#### escrow_approve (op 18) - Role: active
```
from: string, to: string, agent: string, who: string, escrow_id: uint32, approve: bool
```

### ACCOUNT SALE OPERATIONS

#### set_account_price (op 54) - Role: master
```
account:             string    // account being sold
account_seller:      string    // seller account
account_offer_price: asset     // "100.000 VIZ"
account_on_sale:     bool      // true to list, false to delist
```

#### target_account_sale (op 61) - Role: master
```
account:             string    // account being sold
account_seller:      string    // seller
target_buyer:        string    // specific buyer
account_offer_price: asset     // price
account_on_sale:     bool
```

#### buy_account (op 56) - Role: active
```
buyer:                  string       // buyer account
account:                string       // account to buy
account_offer_price:    asset        // must match offer price
account_authorities_key: public_key  // new key for the account
tokens_to_shares:       asset        // min creation fee, converted to SHARES
```

#### set_subaccount_price (op 55) - Role: master
```
account:                string
subaccount_seller:      string
subaccount_offer_price: asset
subaccount_on_sale:     bool
```

### CONTENT OPERATIONS (deprecated but functional)

#### content (op 1) - Role: regular
```
parent_author:   string    // "" for top-level post
parent_permlink: string    // tag for top-level, parent permlink for reply
author:          string
permlink:        string
title:           string
body:            string
curation_percent: int16    // 0-10000 (basis points)
json_metadata:   string
extensions:      set(static_variant([content_payout_beneficiaries]))
```

#### vote (op 0) - Role: regular
```
voter:    string
author:   string
permlink: string
weight:   int16    // -10000 to 10000
```

### SUBSCRIPTION OPERATIONS

#### set_paid_subscription (op 50) - Role: active
```
account: string, url: string, levels: uint16, amount: asset, period: uint16 (days)
```

#### paid_subscribe (op 51) - Role: active
```
subscriber: string, account: string, level: uint16, amount: asset, period: uint16, auto_renewal: bool
```

---

## 3. KEY AUTHORITY ROLES

VIZ has 3 authority levels (NOT 4 like Steem/Hive):
- **master** - highest authority, can change all keys, account recovery
- **active** - financial operations (transfers, escrow, invites, delegations, account creation)
- **regular** - social operations (awards, custom, content, votes, metadata, witness voting)
- **memo** - NOT an authority, just used for encrypted memos

Each operation requires specific authority:
- award, fixed_award: **regular**
- custom: **regular** (or active if required_active_auths used)
- transfer: **active** (or master)
- account_create: **active** (or master)
- create_invite: **active**
- claim_invite_balance: **active**
- invite_registration: **active**
- use_invite_balance: **active**
- account_metadata: **regular**
- delegate_vesting_shares: **active** (or master)
- set_account_price: **master**
- buy_account: **active**

---

## 4. CUSTOM SEQUENCE MECHANISM

### How it works:
- `custom_sequence` is a `uint64` field in award and fixed_award operations
- It is NOT auto-incremented by the blockchain
- Setting it to **0 means "ignored"** - the blockchain doesn't track it
- When non-zero, it's used by **custom protocols** (like Voice protocol) to maintain ordering

### Custom Protocol API:
```javascript
viz.api.getAccount(account, custom_protocol_id, function(err, result) {
  // result contains:
  // - custom_sequence          (current sequence number)
  // - custom_sequence_block_num (block number of last custom op for this protocol)
});
```

### How Voice Protocol uses it:
The Voice protocol ("V" or "VE" id) uses the blockchain's custom_protocol_api to get the account's last custom_sequence_block_num for a given protocol id. This block number is then embedded in the next message as `'p': previous` (previous block reference), creating a linked chain of messages per account per protocol.

```javascript
// Step 1: Get previous block number
viz.api.getAccount('myaccount', 'V', function(err, result) {
  let previous = result.custom_sequence_block_num;
  
  // Step 2: Include it in custom operation JSON
  let object = {
    'p': previous,  // previous message block reference
    'd': { 't': 'Hello world' }
  };
  
  // Step 3: Broadcast
  viz.broadcast.custom(wif, [], ['myaccount'], 'V', JSON.stringify(object), callback);
});
```

### Key insight for games:
- custom_sequence in award ops is per-protocol, user-defined, NOT blockchain-enforced
- The "custom_protocol_api.get_account" tracks custom ops per protocol ID
- You can define your own protocol ID (e.g., "mygame") and the blockchain tracks sequence
- For simple awards, just use custom_sequence = 0

---

## 5. ENERGY/MANA SYSTEM

### Energy Basics:
- Each account has energy (0-10000 scale, representing 0% to 100%)
- Energy is consumed by award/vote operations
- Energy regenerates over time

### Regeneration Formula:
Based on blockchain constants (from C++ source, confirmed by patterns in JS lib):
```
ENERGY_REGENERATION_SECONDS = 432000 (5 days = 5 * 24 * 60 * 60)

current_energy = last_energy + 
  (10000 * seconds_since_last_update / ENERGY_REGENERATION_SECONDS)

// Capped at 10000 (100%)
if (current_energy > 10000) current_energy = 10000;
```

### In practical terms:
- Full regeneration from 0 to 100%: **5 days (432,000 seconds)**
- Regeneration rate: ~0.0023% per second, ~1.39% per minute, ~0.83% per hour, ~20% per day
- A 1% (100 basis points) award uses 100 energy units out of 10000

### Energy parameter in award:
- `energy` field is uint16: range 0-10000
- Value of 1 = 0.01%
- Value of 100 = 1%
- Value of 10000 = 100%
- Minimum useful value: 1 (0.01%)

---

## 6. AWARD AMOUNT CALCULATION

### How award amount is determined:
The award amount in SHARES depends on:
1. **Initiator's effective SHARES** (own vesting + delegated_to_them - delegated_from_them)
2. **Energy spent** (the energy parameter, 0-10000)
3. **Current network state** (total_vesting_shares, total_vesting_fund)

### Formula (from blockchain C++ logic):
```
effective_shares = account.vesting_shares 
                   + account.received_vesting_shares 
                   - account.delegated_vesting_shares

rshares = effective_shares * energy / 10000

// The actual SHARES awarded = rshares (approximately)
// Beneficiaries split: each beneficiary gets (rshares * weight / 10000) 
// Receiver gets remainder after beneficiaries
```

### Converting SHARES to VIZ (for display):
```javascript
// From formatter.js:
function sharesToVIZ(vestingShares, totalVestingShares, totalVestingFund) {
  return parseFloat(totalVestingFund) * (parseFloat(vestingShares) / parseFloat(totalVestingShares));
}
```

### fixed_award specifics:
- You specify exact `reward_amount` in SHARES you want to award
- `max_energy` is the maximum energy you're willing to spend
- Blockchain calculates exact energy needed; fails if it would exceed max_energy
- Useful when you want to give exactly "X SHARES" regardless of your balance

---

## 7. INVITE SYSTEM - STEP BY STEP

### Flow A: Create invite, then register new account

**Step 1: Generate invite keypair**
```javascript
let privateKey = viz.auth.generateKeys('', 'random-password-here', ['active']);
// Or generate a random key
let wif = viz.auth.wifToPublic(somePrivateWif);
```

**Step 2: Create invite (active key required)**
```javascript
viz.broadcast.createInvite(
  activeWif,
  'creator_account',      // creator
  '10.000 VIZ',           // balance (must meet minimum from chain properties)
  'VIZ7abc...',           // invite PUBLIC key
  callback
);
```

**Step 3: Register new account using invite**
```javascript
viz.broadcast.inviteRegistration(
  anyActiveWif,            // any account's active key (initiator)
  'any_account',           // initiator account
  'newaccountname',        // new account name
  '5Jxyz...',              // invite PRIVATE key (WIF)
  'VIZ8def...',            // public key for new account (all auth levels get this)
  callback
);
```

### Flow B: Create invite, claim to existing account as VIZ

**Step 1-2: Same as above**

**Step 3: Claim balance (as liquid VIZ)**
```javascript
viz.broadcast.claimInviteBalance(
  anyActiveWif,
  'any_account',           // initiator
  'receiving_account',     // who gets the VIZ
  '5Jxyz...',              // invite PRIVATE key
  callback
);
```

### Flow C: Create invite, claim as SHARES (vesting)

**Step 3: Use invite balance (converts to SHARES)**
```javascript
viz.broadcast.useInviteBalance(
  anyActiveWif,
  'any_account',
  'receiving_account',
  '5Jxyz...',              // invite PRIVATE key
  callback
);
```

### Invite API Queries:
```javascript
// List all invites by status (0 = active, 1 = used)
viz.api.getInvitesList(0, callback);

// Get invite by ID
viz.api.getInviteById(id, callback);

// Get invite by public key
viz.api.getInviteByKey('VIZ7abc...', callback);
```

### Important: Minimum invite balance
Chain property `create_invite_min_balance` sets minimum (e.g. "10.000 VIZ").

---

## 8. ACCOUNT METADATA STRUCTURE

### Setting metadata:
```javascript
viz.broadcast.accountMetadata(
  regularWif,
  'accountname',
  JSON.stringify({
    // Common fields used by VIZ ecosystem:
    profile: {
      nickname: 'Display Name',
      about: 'Bio text',
      avatar: 'https://example.com/avatar.jpg',
      website: 'https://example.com',
      location: 'City, Country',
      pinned: 'permlink-of-pinned-post'
    }
    // You can add any custom fields for your game:
    // game_data: { level: 5, class: 'mage' }
  }),
  callback
);
```

### Reading metadata:
```javascript
viz.api.getAccounts(['accountname'], function(err, result) {
  let meta = JSON.parse(result[0].json_metadata || '{}');
});
```

### Note: account_metadata (op 21) only requires **regular** key!
But account_update (op 5) which also sets json_metadata requires **master** or **active** key.

---

## 9. API METHODS REFERENCE

### Database API
| Method | Params | Description |
|--------|--------|-------------|
| getBlock | blockNum | Get full block |
| getBlockHeader | blockNum | Get block header |
| getIrreversibleBlock | blockNum | Get irreversible block |
| getConfig | - | Chain configuration |
| getDynamicGlobalProperties | - | Current chain state (head_block, time, totals) |
| getChainProperties | - | Witness-voted chain params |
| getHardforkVersion | - | Current hardfork |
| getAccounts | [names] | Full account objects |
| lookupAccountNames | [names] | Account objects (null if not found) |
| lookupAccounts | lowerBound, limit | Search accounts |
| getAccountCount | - | Total accounts |
| getMasterHistory | account | Key change history |
| getRecoveryRequest | account | Pending recovery |
| getEscrow | from, escrowId | Escrow details |
| getWithdrawRoutes | account, type | Vesting withdraw routes |
| getVestingDelegations | account, from, limit, type | Delegation list |
| getExpiringVestingDelegations | account, from, limit | Expiring delegations |
| getTransactionHex | trx | Transaction hex |
| getRequiredSignatures | trx, keys | Required sigs |
| getPotentialSignatures | trx | Potential sigs |
| verifyAuthority | trx | Verify auth |
| verifyAccountAuthority | name, signers | Verify account auth |
| getProposedTransactions | account, from, limit | Proposals for account |
| getAccountsOnSale | from, limit | Accounts for sale |
| getAccountsOnAuction | from, limit | Accounts on auction |
| getSubaccountsOnSale | from, limit | Subaccounts for sale |
| getDatabaseInfo | - | Database statistics |

### Custom Protocol API
| Method | Params | Description |
|--------|--------|-------------|
| getAccount | account, custom_protocol_id | Get custom protocol state for account |

Returns: `{ custom_sequence, custom_sequence_block_num }` for the given protocol ID.

### Invite API
| Method | Params | Description |
|--------|--------|-------------|
| getInvitesList | status | 0=active, 1=claimed |
| getInviteById | id | By numeric ID |
| getInviteByKey | invite_key | By public key string |

### Committee API
| Method | Params | Description |
|--------|--------|-------------|
| getCommitteeRequest | request_id, votes_count | Get request (-1 for all votes) |
| getCommitteeRequestVotes | request_id | All votes |
| getCommitteeRequestsList | status | List by status |

### Paid Subscription API
| Method | Params | Description |
|--------|--------|-------------|
| getPaidSubscriptions | from, limit | List subscriptions |
| getPaidSubscriptionOptions | account | Account's subscription settings |
| getPaidSubscriptionStatus | subscriber, account | Check subscription |
| getActivePaidSubscriptions | subscriber | Active subs |
| getInactivePaidSubscriptions | subscriber | Inactive subs |

### Account History
| Method | Params | Description |
|--------|--------|-------------|
| getAccountHistory | account, from, limit | Operation history |

### Operation History
| Method | Params | Description |
|--------|--------|-------------|
| getOpsInBlock | blockNum, onlyVirtual | Operations in block |
| getTransaction | trxId | Get transaction by ID |

### Network Broadcast API
| Method | Params | Description |
|--------|--------|-------------|
| broadcastTransaction | trx | Broadcast (async) |
| broadcastTransactionSynchronous | trx | Broadcast (wait for block) |
| broadcastTransactionWithCallback | callback, trx | With confirmation |
| broadcastBlock | block | Broadcast block |

### Streaming Methods (on api object):
```javascript
viz.api.streamBlockNumber(mode, callback, interval)   // mode: 'head' or 'irreversible'
viz.api.streamBlock(mode, callback)
viz.api.streamTransactions(mode, callback)
viz.api.streamOperations(mode, callback)
// All return a release() function to stop streaming
```

---

## 10. TRANSACTION LIFECYCLE

### How broadcast works (from broadcast/index.js):

1. **Get dynamic global properties** to determine chain time and reference block
2. **Build transaction envelope:**
   ```javascript
   {
     ref_block_num:    uint16,  // from head_block or irreversible
     ref_block_prefix: uint32,  // from block header
     expiration:       Date,    // chain_time + 60 seconds
     operations:       [...],   // array of [op_name, {params}]
     extensions:       []
   }
   ```
3. **Sign transaction** with appropriate private key(s)
4. **Broadcast** via `broadcastTransaction` or `broadcastTransactionWithCallback`

### Expiration: Transactions expire **60 seconds** after chain time.

### Reference block: Uses `head_block_number - 3` (or `last_irreversible_block_ref_num` if available).

### Config option:
```javascript
viz.config.set('broadcast_transaction_with_callback', true);  // use callback-style broadcast
```

---

## 11. UTILITY FUNCTIONS (Voice Protocol)

### Voice Protocol Types:
- **'V'** - Voice protocol (social posts)
- **'VE'** - Voice Events (edits, hides, appends)

### voiceText(wif, account, text, reply, share, beneficiaries, loop, callback)
Posts a text message using custom op with protocol "V".
```javascript
// JSON structure:
{
  'p': previous_block_num,   // links to previous message
  // 't': 't'               // type=text (default, omitted)
  'd': {
    't': text,               // text content
    'r': reply_ref,          // optional: reply reference
    's': share_ref,          // optional: share/repost (conflicts with reply)
    'b': beneficiaries       // optional: [{account, weight}]
  }
}
```

### voicePublication(wif, account, title, markdown, description, image, reply, share, beneficiaries, loop, callback)
Posts a publication (article) using custom op with protocol "V".
```javascript
{
  'p': previous_block_num,
  't': 'p',                  // type=publication
  'd': {
    't': title,
    'm': markdown,
    'd': description,        // optional
    'i': image,              // optional: cover image URL
    'r': reply_ref,          // optional
    's': share_ref,          // optional
    'b': beneficiaries       // optional
  }
}
```

### voiceEncodedText / voiceEncodedPublication
Same but with AES encryption:
```javascript
{
  'p': previous_block_num,
  't': 'e',                  // type=encoded
  'c': comment,              // human-readable hint/comment
  'd': encrypted_data        // AES-encrypted stringified JSON
}
```
Supports multi-layer encryption with array of passphrases.

### voiceEvent(wif, account, event_type, target_account, target_block, data, loop, callback)
Events for editing/hiding/appending to existing messages:
```javascript
{
  'p': previous_block_num,
  'e': event_type,           // 'h'=hide, 'e'=edit, 'a'=append
  'b': target_block,         // block number of target message
  'a': target_account,       // only if different from sender
  'd': data                  // optional: new data
}
```

### The `loop` parameter:
- `false` = auto-fetch previous block number from API
- A number = use this as the previous block number (for batch operations)

---

## 12. ASSET FORMAT

### VIZ tokens: 3 decimal places
```
"1.000 VIZ"
"100.500 VIZ"
"0.001 VIZ"    // minimum
```

### SHARES (vesting): 6 decimal places
```
"1.000000 SHARES"
"100.500000 SHARES"
"0.000001 SHARES"  // minimum
```

### Asset serialization format:
```
int64 amount (without decimal point)
uint8 precision (number of decimal places: 3 for VIZ, 6 for SHARES)
char[7] symbol (padded with null bytes)
```

### Regex validation: `/^[0-9]+\.?[0-9]* [A-Za-z0-9]+$/`

### Formatter helper:
```javascript
viz.formatter.amount(1.5, 'VIZ')  // returns "1.500 VIZ"
```

---

## 13. FORMATTER FUNCTIONS

```javascript
// Convert SHARES to VIZ value
viz.formatter.sharesToVIZ(vestingShares, totalVestingShares, totalVestingFund)
// Returns: float (VIZ equivalent)

// Generate reply permlink
viz.formatter.contentPermlink(parentAuthor, parentPermlink)
// Returns: "re-author-permlink-20170621t080403765z"

// Format asset string
viz.formatter.amount(1.5, 'VIZ')  // "1.500 VIZ"

// Estimate total account value in VIZ
viz.formatter.estimateAccountValue(account, { gprops, vesting_viz })
// Returns: Promise resolving to string like "123.456"

// Generate random password (32 chars from WIF)
viz.formatter.createSuggestedPassword()
// Returns: string like "GAz3GYFvvQvgm7t2fQmwMDuXEzDqTzn9"
```

---

## 14. GOTCHAS & EDGE CASES

### 1. Account name validation rules:
- Length: 2-25 characters
- Must start with a letter (a-z)
- Only lowercase letters, digits, and dashes
- No double dashes (--)
- Must end with letter or digit
- Dot-separated segments each follow these rules (subaccounts: "parent.child")

### 2. Asset precision matters:
- VIZ always 3 decimals: "1.000 VIZ" (not "1 VIZ")
- SHARES always 6 decimals: "1.000000 SHARES" (not "1 SHARES")
- Wrong precision = transaction fails

### 3. Beneficiaries in award:
- Weight is in basis points (10000 = 100%)
- Total beneficiary weights must not exceed 10000
- Beneficiaries are a `set` type - sorted, no duplicates
- Pass empty array `[]` for no beneficiaries

### 4. Custom operation auth:
- If you put account in `required_active_auths`, you need active key
- If you put account in `required_regular_auths`, regular key suffices
- At least one auth array must be non-empty
- The signing key must match the corresponding role

### 5. Transaction expiration:
- Fixed at 60 seconds from chain time
- If your clock is off, transactions may fail
- Chain time comes from getDynamicGlobalProperties

### 6. Energy edge cases:
- Can't award with more energy than you have
- Energy 0 in award = operation fails (meaningless award)
- After spending energy, must wait for regeneration
- Energy is tracked per-account, not per-operation-type

### 7. Delegation timing:
- Delegated SHARES have effect immediately for the delegatee
- Undelegation has a cooldown period (create_account_delegation_time chain property)
- During cooldown, SHARES are locked (neither party can use them)

### 8. Invite balance minimum:
- Chain property `create_invite_min_balance` enforces minimum (e.g. 10 VIZ)
- Below this, create_invite fails

### 9. json_metadata serialization:
- The broadcast helper auto-stringifies if you pass an object
- But the serializer expects a string, so always JSON.stringify first for safety
- Empty metadata should be '{}' not ''

### 10. Method naming conventions:
- API methods use snake_case in protocol, but camelCase in JS
- `get_dynamic_global_properties` -> `getDynamicGlobalProperties`
- `get_accounts` -> `getAccounts`
- All have both callback and Promise (Async suffix) variants:
  ```javascript
  viz.api.getAccounts(['name'], callback);
  viz.api.getAccountsAsync(['name']).then(result => ...);
  ```

### 11. Broadcast method naming:
- Operation `account_create` -> `viz.broadcast.accountCreate()`
- Operation `delegate_vesting_shares` -> `viz.broadcast.delegateVestingShares()`
- All have `With` variants: `viz.broadcast.awardWith(wif, optionsObject, callback)`

### 12. Award virtual operations:
- `receive_award` (op 48) is virtual - emitted when receiver gets award
- `benefactor_award` (op 49) is virtual - emitted for each beneficiary
- These appear in account history but can't be broadcast

### 13. The `custom_protocol_api.getAccount` method:
- Takes EXACTLY 2 params: account name and protocol ID string
- Returns protocol-specific tracking data
- Different protocol IDs track separately (e.g., "V" and "mygame" are independent)

### 14. Subaccount format:
- Format: "parent.child" (dot-separated)
- Each segment follows account name rules
- Created by buying a subaccount slot

### 15. Fixed Award edge case:
- If the account doesn't have enough SHARES to produce the desired reward_amount even at max_energy, the operation fails
- The blockchain CALCULATES the energy needed, not the user
