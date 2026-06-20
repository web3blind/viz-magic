-- Viz Magic archive-node SQLite schema.
-- This is the live storage layout used by tools/archive-node/storage.js.

CREATE TABLE IF NOT EXISTS blocks (
    block_num INTEGER PRIMARY KEY,
    block_id TEXT,
    previous TEXT,
    timestamp TEXT,
    source_node TEXT,
    indexed_at TEXT,
    event_count INTEGER NOT NULL DEFAULT 0,
    raw_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    block_num INTEGER NOT NULL,
    block_id TEXT,
    previous TEXT,
    timestamp TEXT,
    tx_index INTEGER NOT NULL,
    op_index INTEGER NOT NULL,
    op_type TEXT NOT NULL,
    protocol TEXT NOT NULL,
    type TEXT,
    sender TEXT,
    account TEXT,
    accounts_json TEXT,
    payload_json TEXT,
    raw_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_block ON events(block_num);
CREATE INDEX IF NOT EXISTS idx_events_protocol_block ON events(protocol, block_num);
CREATE INDEX IF NOT EXISTS idx_events_sender_protocol ON events(sender, protocol, block_num);
