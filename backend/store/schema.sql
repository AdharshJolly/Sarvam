-- Sarvam SQLite schema, version 2 (SSOT v2.0 section 8 + Auth).
-- Changing this file requires a change-log row (SSOT section 21) and a SCHEMA_VERSION bump in db.py.
-- Sources, passages and events are immutable once written. Claims, coverage and reports are
-- versioned by round. IDs are short readable strings (S3, P12, C41) except events.id (integer).

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT REFERENCES users(id),
    question           TEXT NOT NULL,
    scope_json         TEXT NOT NULL DEFAULT '{}',
    mode               TEXT NOT NULL CHECK (mode IN ('LIVE', 'REPLAY')),
    budget_json        TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'queued',
    stop_state         TEXT,
    termination_reason TEXT,
    started_at         TEXT NOT NULL,
    ended_at           TEXT
);

CREATE TABLE IF NOT EXISTS dimensions (
    id          TEXT NOT NULL,
    run_id      TEXT NOT NULL REFERENCES runs(id),
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    critical    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (run_id, id)
);

CREATE TABLE IF NOT EXISTS slots (
    id             TEXT NOT NULL,
    run_id         TEXT NOT NULL REFERENCES runs(id),
    dimension_id   TEXT NOT NULL,
    name           TEXT NOT NULL,
    description    TEXT NOT NULL,
    critical       INTEGER NOT NULL DEFAULT 0,
    attributes_json TEXT NOT NULL DEFAULT '[]',
    min_independent INTEGER NOT NULL DEFAULT 2,
    primary_ok     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (run_id, id)
);

CREATE TABLE IF NOT EXISTS tasks (
    id         TEXT NOT NULL,
    run_id     TEXT NOT NULL REFERENCES runs(id),
    slot_id    TEXT NOT NULL,
    query_text TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'initial' CHECK (kind IN ('initial', 'gap', 'challenge')),
    round      INTEGER NOT NULL DEFAULT 0,
    status     TEXT NOT NULL DEFAULT 'pending',
    PRIMARY KEY (run_id, id)
);

CREATE TABLE IF NOT EXISTS sources (
    id            TEXT PRIMARY KEY,  -- globally unique (S3); passages reference it without run_id
    run_id        TEXT NOT NULL REFERENCES runs(id),
    url           TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    domain        TEXT NOT NULL,
    publisher     TEXT,
    source_type   TEXT NOT NULL DEFAULT 'unknown',
    authority_tier INTEGER NOT NULL DEFAULT 3 CHECK (authority_tier BETWEEN 1 AND 3),
    published_at  TEXT,
    retrieved_at  TEXT,
    content_hash  TEXT,
    status        TEXT NOT NULL DEFAULT 'found',
    fail_reason   TEXT,
    origin_id     TEXT,
    task_id       TEXT,
    UNIQUE (run_id, canonical_url)
);

CREATE TABLE IF NOT EXISTS passages (
    id         TEXT PRIMARY KEY,
    source_id  TEXT NOT NULL REFERENCES sources(id),
    idx        INTEGER NOT NULL,
    text       TEXT NOT NULL,
    char_start INTEGER NOT NULL,
    char_end   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
    id             TEXT PRIMARY KEY,
    run_id         TEXT NOT NULL REFERENCES runs(id),
    slot_id        TEXT NOT NULL,
    round          INTEGER NOT NULL DEFAULT 0,
    text           TEXT NOT NULL,
    entity         TEXT,
    attribute      TEXT,
    value_num      REAL,
    unit           TEXT,
    period         TEXT,
    quote          TEXT NOT NULL,
    passage_id     TEXT NOT NULL REFERENCES passages(id),
    quote_verified INTEGER NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'supported', 'partial', 'contested', 'rejected'))
);

CREATE TABLE IF NOT EXISTS evidence_links (
    id                TEXT PRIMARY KEY,
    claim_id          TEXT NOT NULL REFERENCES claims(id),
    passage_id        TEXT NOT NULL REFERENCES passages(id),
    verdict           TEXT NOT NULL
        CHECK (verdict IN ('supports', 'partial', 'contradicts', 'irrelevant')),
    verdict_rationale TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS origins (
    id           TEXT NOT NULL,
    run_id       TEXT NOT NULL REFERENCES runs(id),
    label        TEXT NOT NULL,
    method       TEXT NOT NULL DEFAULT 'none'
        CHECK (method IN ('domain', 'near_duplicate', 'shared_number', 'attribution', 'none')),
    members_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (run_id, id)
);

CREATE TABLE IF NOT EXISTS conflicts (
    id          TEXT PRIMARY KEY,
    run_id      TEXT NOT NULL REFERENCES runs(id),
    slot_id     TEXT NOT NULL,
    claim_a     TEXT NOT NULL REFERENCES claims(id),
    claim_b     TEXT NOT NULL REFERENCES claims(id),
    delta_pct   REAL NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'genuine',
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'explained')),
    explanation TEXT
);

CREATE TABLE IF NOT EXISTS coverage (
    id                  TEXT PRIMARY KEY,
    run_id              TEXT NOT NULL REFERENCES runs(id),
    round               INTEGER NOT NULL,
    slot_id             TEXT NOT NULL,
    state               TEXT NOT NULL CHECK (state IN ('RED', 'AMBER', 'GREEN')),
    independent_origins INTEGER NOT NULL DEFAULT 0,
    supporting_claims   INTEGER NOT NULL DEFAULT 0,
    open_conflicts      INTEGER NOT NULL DEFAULT 0,
    reason              TEXT NOT NULL,
    UNIQUE (run_id, round, slot_id)
);

CREATE TABLE IF NOT EXISTS challenges (
    id                TEXT PRIMARY KEY,
    run_id            TEXT NOT NULL REFERENCES runs(id),
    round             INTEGER NOT NULL,
    attack            TEXT NOT NULL,
    target_slot       TEXT,
    target_claim      TEXT,
    required_evidence TEXT NOT NULL DEFAULT '',
    would_change_if   TEXT NOT NULL DEFAULT '',
    followup_task_ids TEXT NOT NULL DEFAULT '[]',
    outcome           TEXT CHECK (outcome IN ('strengthened', 'weakened', 'unresolved'))
);

CREATE TABLE IF NOT EXISTS reports (
    id                     TEXT PRIMARY KEY,
    run_id                 TEXT NOT NULL REFERENCES runs(id),
    version                INTEGER NOT NULL,
    markdown               TEXT NOT NULL,
    certainty_state        TEXT,
    dropped_sentences_json TEXT NOT NULL DEFAULT '[]',
    UNIQUE (run_id, version)
);

-- Append-only audit log and SSE source. Never UPDATE or DELETE rows here.
CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id       TEXT NOT NULL REFERENCES runs(id),
    ts           TEXT NOT NULL,
    round        INTEGER NOT NULL DEFAULT 0,
    type         TEXT NOT NULL,
    step_ms      INTEGER,
    tokens       INTEGER,
    cost_usd     REAL,
    payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_run ON events (run_id, id);
CREATE INDEX IF NOT EXISTS idx_sources_run ON sources (run_id);
CREATE INDEX IF NOT EXISTS idx_passages_source ON passages (source_id);
CREATE INDEX IF NOT EXISTS idx_claims_slot ON claims (run_id, slot_id);
CREATE INDEX IF NOT EXISTS idx_coverage_round ON coverage (run_id, round);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs (user_id);

