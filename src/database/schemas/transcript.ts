-- Supabase SQL Schema for Transcript Intelligence

-- Create accounts table for client organization
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create index on domain for fast lookups
CREATE INDEX IF NOT EXISTS idx_accounts_domain ON accounts(domain);

-- Create transcripts table for storing call transcripts
CREATE TABLE IF NOT EXISTS transcripts (
  id VARCHAR(255) PRIMARY KEY, -- Platform-specific call ID
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('gong', 'clari', 'fireflies', 'fathom', 'otter')),
  title VARCHAR(500) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration INTEGER NOT NULL, -- Duration in seconds
  full_text TEXT NOT NULL,
  recording_url VARCHAR(1000),
  ai_content JSONB DEFAULT '{}'::jsonb, -- Platform-specific AI insights
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  source VARCHAR(50) NOT NULL CHECK (source IN ('webhook', 'batch', 'manual')),
  raw_metadata JSONB DEFAULT '{}'::jsonb, -- Raw platform data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_transcripts_account_id ON transcripts(account_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_platform ON transcripts(platform);
CREATE INDEX IF NOT EXISTS idx_transcripts_start_time ON transcripts(start_time);
CREATE INDEX IF NOT EXISTS idx_transcripts_processed_at ON transcripts(processed_at);

-- Create full-text search index on transcript content
CREATE INDEX IF NOT EXISTS idx_transcripts_fulltext ON transcripts USING gin(to_tsvector('english', full_text));

-- Create transcript_segments table for detailed transcript data
CREATE TABLE IF NOT EXISTS transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id VARCHAR(255) NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  speaker VARCHAR(255) NOT NULL,
  speaker_email VARCHAR(255),
  text TEXT NOT NULL,
  start_time INTEGER NOT NULL, -- Milliseconds from start of call
  end_time INTEGER NOT NULL, -- Milliseconds from start of call
  confidence DECIMAL(3,2), -- 0.00 to 1.00
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for transcript segments
CREATE INDEX IF NOT EXISTS idx_transcript_segments_transcript_id ON transcript_segments(transcript_id);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_sequence ON transcript_segments(transcript_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_speaker ON transcript_segments(speaker);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_time ON transcript_segments(start_time);

-- Create full-text search index on segment text
CREATE INDEX IF NOT EXISTS idx_transcript_segments_fulltext ON transcript_segments USING gin(to_tsvector('english', text));

-- Create users table for access control
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'manager', 'user')) DEFAULT 'user',
  account_access UUID[] DEFAULT '{}', -- Array of account IDs user can access
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- Create index on email for auth lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create query_logs table for tracking LLM usage
CREATE TABLE IF NOT EXISTS query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  response_text TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0, -- Cost in cents
  llm_provider VARCHAR(50) NOT NULL, -- 'openai', 'bedrock', etc.
  llm_model VARCHAR(100) NOT NULL,
  processing_time_ms INTEGER,
  transcripts_searched UUID[] DEFAULT '{}', -- Array of transcript IDs searched
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for query logs
CREATE INDEX IF NOT EXISTS idx_query_logs_user_id ON query_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_query_logs_account_id ON query_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_query_logs_created_at ON query_logs(created_at);

-- Create account_associations table for manual transcript reassignment
CREATE TABLE IF NOT EXISTS account_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id VARCHAR(255) NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  old_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  new_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reason VARCHAR(500),
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for account associations
CREATE INDEX IF NOT EXISTS idx_account_associations_transcript_id ON account_associations(transcript_id);

-- Create processing_jobs table for batch processing tracking
CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(50) NOT NULL,
  job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('bulk_sync', 'backfill', 'retry')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  parameters JSONB DEFAULT '{}'::jsonb, -- Job-specific parameters
  progress INTEGER DEFAULT 0, -- Percentage complete
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  error_details JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for processing jobs
CREATE INDEX IF NOT EXISTS idx_processing_jobs_platform ON processing_jobs(platform);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created_at ON processing_jobs(created_at);

-- Create updated_at triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at columns
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transcripts_updated_at BEFORE UPDATE ON transcripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processing_jobs_updated_at BEFORE UPDATE ON processing_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_logs ENABLE ROW LEVEL SECURITY;

-- Users can only access accounts they have permission for
CREATE POLICY "Users can access their assigned accounts" ON accounts
  FOR ALL USING (
    auth.uid()::text IN (
      SELECT u.id::text FROM users u 
      WHERE u.email = auth.email() 
      AND (accounts.id = ANY(u.account_access) OR u.role = 'admin')
    )
  );

-- Users can only access transcripts from their assigned accounts
CREATE POLICY "Users can access transcripts from their accounts" ON transcripts
  FOR ALL USING (
    account_id IN (
      SELECT unnest(u.account_access) FROM users u 
      WHERE u.email = auth.email()
      UNION
      SELECT a.id FROM accounts a, users u 
      WHERE u.email = auth.email() AND u.role = 'admin'
    )
  );

-- Users can only access segments from transcripts they can access  
CREATE POLICY "Users can access segments from accessible transcripts" ON transcript_segments
  FOR ALL USING (
    transcript_id IN (
      SELECT t.id FROM transcripts t
      WHERE t.account_id IN (
        SELECT unnest(u.account_access) FROM users u 
        WHERE u.email = auth.email()
        UNION
        SELECT a.id FROM accounts a, users u 
        WHERE u.email = auth.email() AND u.role = 'admin'
      )
    )
  );

-- Users can only see their own query logs (plus admin can see all)
CREATE POLICY "Users can access their own query logs" ON query_logs
  FOR ALL USING (
    user_id IN (
      SELECT u.id FROM users u WHERE u.email = auth.email()
    )
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.email = auth.email() AND u.role = 'admin'
    )
  );