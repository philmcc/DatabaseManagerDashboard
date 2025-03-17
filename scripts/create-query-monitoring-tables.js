/**
 * Create Query Monitoring Tables
 * 
 * This script creates the new tables for query monitoring
 * using direct SQL statements.
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function createTables() {
  console.log('Creating tables for query monitoring v2...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    // Create normalized_queries table
    await pool.query(`
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
    await pool.query(`
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
    await pool.query(`
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
    await pool.query(`
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
    
    // Check if the old table exists and prompt for data migration
    const { rows: oldTableCheck } = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'discovered_queries'
      ) as exists;
    `);
    
    const oldTableExists = oldTableCheck[0]?.exists;
    
    if (oldTableExists) {
      console.log('\nThe old discovered_queries table exists.');
      console.log('Would you like to migrate data to the new tables? (y/n)');
      
      // Listen for user input
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      const migrateData = await new Promise(resolve => {
        process.stdin.once('data', function (data) {
          const input = data.toString().trim().toLowerCase();
          resolve(input === 'y' || input === 'yes');
        });
      });
      
      if (migrateData) {
        console.log('\nMigrating data from old tables...');
        
        // Insert normalized queries
        await pool.query(`
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
        await pool.query(`
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
        
        console.log('Migrated collected queries data');
      } else {
        console.log('Skipping data migration. New tables are empty.');
      }
    }
    
    console.log('\nQuery monitoring tables created successfully!');
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Run the function
createTables(); 