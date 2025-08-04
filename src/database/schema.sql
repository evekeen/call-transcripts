-- Client accounts table
CREATE TABLE IF NOT EXISTS client_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT,
    grouping_rule TEXT CHECK (grouping_rule IN ('domain', 'manual', 'title_pattern')) DEFAULT 'domain',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transcripts table
CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    fireflies_id TEXT UNIQUE NOT NULL,
    client_account_id TEXT,
    title TEXT NOT NULL,
    transcript_text TEXT NOT NULL,
    date DATETIME NOT NULL,
    duration INTEGER,
    attendees TEXT, -- JSON string
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_account_id) REFERENCES client_accounts (id)
);

-- Grouping rules table for custom client assignment
CREATE TABLE IF NOT EXISTS grouping_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT CHECK (type IN ('domain', 'manual', 'title_pattern')) NOT NULL,
    value TEXT NOT NULL,
    client_account_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_account_id) REFERENCES client_accounts (id),
    UNIQUE(type, value)
);

-- API usage tracking for rate limiting
CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

-- Processing queue for background jobs
CREATE TABLE IF NOT EXISTS processing_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL,
    payload TEXT, -- JSON string
    status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transcripts_client_account ON transcripts(client_account_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_date ON transcripts(date);
CREATE INDEX IF NOT EXISTS idx_transcripts_fireflies_id ON transcripts(fireflies_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON processing_queue(status);