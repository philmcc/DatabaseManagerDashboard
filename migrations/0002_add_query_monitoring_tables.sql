-- Create query monitoring sessions table
CREATE TABLE IF NOT EXISTS query_monitoring_sessions (
    id SERIAL PRIMARY KEY,
    database_id INTEGER NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    polling_interval_seconds INTEGER NOT NULL DEFAULT 60,
    scheduled_end_time TIMESTAMP,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    stopped_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create query examples table
CREATE TABLE IF NOT EXISTS query_examples (
    id SERIAL PRIMARY KEY,
    normalized_query_id INTEGER NOT NULL REFERENCES normalized_queries(id) ON DELETE CASCADE,
    database_id INTEGER NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES query_monitoring_sessions(id) ON DELETE CASCADE,
    query_text TEXT NOT NULL,
    query_hash TEXT NOT NULL,
    execution_time NUMERIC,
    collected_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_query_monitoring_sessions_database_id ON query_monitoring_sessions(database_id);
CREATE INDEX idx_query_monitoring_sessions_user_id ON query_monitoring_sessions(user_id);
CREATE INDEX idx_query_monitoring_sessions_status ON query_monitoring_sessions(status);
CREATE INDEX idx_query_examples_normalized_query_id ON query_examples(normalized_query_id);
CREATE INDEX idx_query_examples_database_id ON query_examples(database_id);
CREATE INDEX idx_query_examples_session_id ON query_examples(session_id);
CREATE INDEX idx_query_examples_collected_at ON query_examples(collected_at);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_query_monitoring_sessions_updated_at
    BEFORE UPDATE ON query_monitoring_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 