# Viz Magic archive node

Read-only community archive for Viz Magic history.

It indexes public VIZ blocks, extracts only game-relevant operations, and serves them over HTTP. It never asks for private keys and never signs or broadcasts transactions.

## What it stores

- block number, `block_id`, `previous`, timestamp, source node;
- raw block JSON for indexed blocks;
- normalized public events for:
  - `custom` protocol `VM`;
  - `custom` protocol `V`;
  - `custom` protocol `VE`;
  - `award` operations used for blessings/rewards.

The current implementation is dependency-free and stores data under `data/archive-node/` as JSON/JSONL files. `sqlite-schema.sql` documents the intended SQLite schema for a future storage backend.

## Run locally

```bash
cd tools/archive-node
cp config.example.json config.json
node indexer.js --from 1 --to 1000 --once
node server.js
```

For a small catch-up run from the saved cursor:

```bash
node indexer.js --max-blocks 500
```

## HTTP API

```text
GET /health
GET /v1/status
GET /v1/block/:blockNum.json
GET /v1/range?start=123&end=456&protocol=VM,V,VE&limit=500
GET /v1/account/:account/protocol/:protocol/actions?limit=500
GET /v1/account/:account/protocol/:protocol/latest
```

When hosted behind Nginx at `/archive-mirror`, the same API is available under that prefix, for example:

```text
GET /archive-mirror/health
GET /archive-mirror/v1/status
GET /archive-mirror/v1/block/123.json
```

## Config

`config.json`:

```json
{
  "sourceNodes": ["https://api.viz.world/", "https://node.viz.cx/"],
  "dataDir": "./data/archive-node",
  "host": "127.0.0.1",
  "port": 3007,
  "startBlock": 1,
  "requestDelayMs": 120,
  "timeoutMs": 8000,
  "maxBlocksPerRun": 0
}
```

Environment overrides:

- `ARCHIVE_NODE_DATA_DIR`
- `ARCHIVE_NODE_NODES` — comma-separated RPC URLs
- `ARCHIVE_NODE_START_BLOCK`
- `ARCHIVE_NODE_MAX_BLOCKS`
- `ARCHIVE_NODE_HOST`
- `ARCHIVE_NODE_PORT`
- `ARCHIVE_NODE_CONFIG`

## PM2 example

```bash
pm2 start tools/archive-node/server.js --name vizmagic-game-archive --time --update-env
pm2 start tools/archive-node/indexer.js --name vizmagic-game-archive-indexer --time --update-env -- --max-blocks 1000
```

For continuous indexing, run the indexer repeatedly via cron/systemd timer, or keep a bounded PM2/cron job. The indexer reads `cursor.json` and resumes from the next block.

## Safety

- No private keys.
- No write/sign/broadcast endpoint.
- CORS is open because the static browser app must read public history.
- The browser must still feed returned blocks/events through `BlockProcessor -> StateEngine`; mirror data is a cache of public chain history, not authoritative game state.
