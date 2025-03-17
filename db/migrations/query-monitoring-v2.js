/**
 * Query Monitoring Schema v2
 * 
 * This migration adds a new schema for improved query monitoring
 * with better handling of normalized queries and collection history.
 */

import { sql } from 'drizzle-orm';
import { db } from '../index.js';

export async function migrateQueryMonitoringV2() {
  console.log('Starting query monitoring v2 migration');
  
  try {
    // Create normalized_queries table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS normalized_queries (
        id SERIAL PRIMARY KEY,
        database_id INTEGER NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
        normalized_text TEXT NOT NULL,
        normalized_hash TEXT NOT NULL,
        first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
        is_known BOOLEAN NOT NULL DEFAULT FALSE,
        group_id INTEGER REFERENCES query_groups(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log('Created normalized_queries table');
    
    // Create collected_queries table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS collected_queries (
        id SERIAL PRIMARY KEY,
        normalized_query_id INTEGER NOT NULL REFERENCES normalized_queries(id) ON DELETE CASCADE,
        database_id INTEGER NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
        query_text TEXT NOT NULL,
        query_hash TEXT NOT NULL,
        calls INTEGER NOT NULL,
        total_time NUMERIC NOT NULL,
        min_time NUMERIC,
        max_time NUMERIC,
        mean_time NUMERIC,
        collected_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log('Created collected_queries table');
    
    // Create indexes for better query performance
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS normalized_queries_hash_idx 
      ON normalized_queries(normalized_hash);

      CREATE INDEX IF NOT EXISTS normalized_queries_database_idx 
      ON normalized_queries(database_id);

      CREATE INDEX IF NOT EXISTS collected_queries_normalized_idx 
      ON collected_queries(normalized_query_id);

      CREATE INDEX IF NOT EXISTS collected_queries_database_idx 
      ON collected_queries(database_id);

      CREATE INDEX IF NOT EXISTS collected_queries_updated_idx 
      ON collected_queries(last_updated_at);
    `);
    
    console.log('Created indexes for query monitoring tables');
    
    // Add a view for aggregate query statistics
    await db.execute(sql`
      CREATE OR REPLACE VIEW aggregated_query_stats AS
      SELECT 
        nq.id AS normalized_query_id,
        nq.database_id,
        nq.normalized_text,
        nq.is_known,
        nq.group_id,
        COUNT(cq.id) AS instance_count,
        SUM(cq.calls) AS total_calls,
        SUM(cq.total_time) AS total_execution_time,
        MIN(cq.min_time) AS min_execution_time,
        MAX(cq.max_time) AS max_execution_time,
        SUM(cq.total_time) / NULLIF(SUM(cq.calls), 0) AS avg_execution_time,
        MIN(cq.collected_at) AS first_collected_at,
        MAX(cq.last_updated_at) AS last_updated_at
      FROM 
        normalized_queries nq
      LEFT JOIN 
        collected_queries cq ON nq.id = cq.normalized_query_id
      GROUP BY 
        nq.id, nq.database_id, nq.normalized_text, nq.is_known, nq.group_id;
    `);
    
    console.log('Created aggregated_query_stats view');
    
    // Migrate data from old tables if they exist
    // Check if the old table exists first
    const oldTableCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'discovered_queries'
      ) as exists;
    `);
    
    const oldTableExists = oldTableCheck.rows[0]?.exists;
    
    if (oldTableExists) {
      console.log('Old discovered_queries table exists, migrating data...');
      
      // Insert normalized queries
      await db.execute(sql`
        INSERT INTO normalized_queries 
          (database_id, normalized_text, normalized_hash, first_seen_at, last_seen_at, 
           is_known, group_id, created_at, updated_at)
        SELECT 
          database_id, 
          COALESCE(normalized_query, query_text) as normalized_text, 
          query_hash as normalized_hash,
          first_seen_at, 
          last_seen_at, 
          is_known, 
          group_id, 
          created_at, 
          updated_at
        FROM 
          discovered_queries;
      `);
      
      console.log('Migrated normalized queries');
      
      // Insert collected queries
      await db.execute(sql`
        INSERT INTO collected_queries 
          (normalized_query_id, database_id, query_text, query_hash, calls, 
           total_time, min_time, max_time, mean_time, collected_at, last_updated_at)
        SELECT 
          nq.id as normalized_query_id,
          dq.database_id,
          dq.query_text,
          dq.query_hash,
          dq.call_count as calls,
          dq.total_time,
          dq.min_time,
          dq.max_time,
          dq.mean_time,
          dq.first_seen_at as collected_at,
          dq.last_seen_at as last_updated_at
        FROM 
          discovered_queries dq
        JOIN 
          normalized_queries nq ON 
            (nq.normalized_text = dq.normalized_query OR 
             (nq.normalized_text = dq.query_text AND dq.normalized_query IS NULL))
          AND nq.database_id = dq.database_id;
      `);
      
      console.log('Migrated collected queries');
    }
    
    console.log('Query monitoring v2 migration completed successfully');
  } catch (error) {
    console.error('Error during query monitoring v2 migration:', error);
    throw error;
  }
} 