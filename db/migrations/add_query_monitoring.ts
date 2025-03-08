import { sql } from 'drizzle-orm';
import { db } from '../index';

export async function migrateQueryMonitoring() {
  console.log('Starting query monitoring tables migration with database connection:', !!db);
  
  try {
    // Create query monitoring configs table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS query_monitoring_configs (
        id SERIAL PRIMARY KEY,
        database_id INTEGER NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
        is_active BOOLEAN NOT NULL DEFAULT false,
        interval_minutes INTEGER NOT NULL DEFAULT 15,
        last_run_at TIMESTAMP,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log('Created query_monitoring_configs table');
    
    // Create query groups table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS query_groups (
        id SERIAL PRIMARY KEY,
        database_id INTEGER NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        is_known BOOLEAN NOT NULL DEFAULT FALSE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log('Created query_groups table');
    
    // Create discovered queries table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS discovered_queries (
        id SERIAL PRIMARY KEY,
        database_id INTEGER NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
        query_text TEXT NOT NULL,
        query_hash TEXT NOT NULL,
        normalized_query TEXT,
        first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
        call_count INTEGER NOT NULL DEFAULT 1,
        total_time NUMERIC NOT NULL DEFAULT 0,
        min_time NUMERIC,
        max_time NUMERIC,
        mean_time NUMERIC,
        is_known BOOLEAN NOT NULL DEFAULT FALSE,
        group_id INTEGER REFERENCES query_groups(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log('Created discovered_queries table');
    
    // Create index on query_hash for faster lookups
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS discovered_queries_hash_idx ON discovered_queries(query_hash);
    `);
    
    console.log('Created index on discovered_queries(query_hash)');
    
    console.log('Query monitoring migration completed successfully');
  } catch (error) {
    console.error('Error during query monitoring migration:', error);
    throw error;
  }
} 