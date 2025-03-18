import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import { sql } from 'drizzle-orm';

// Check for environment variable
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

async function createQuerySamplesTable() {
  console.log('Creating query_samples table...');
  
  try {
    // Create the query_samples table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS query_samples (
        id SERIAL PRIMARY KEY,
        normalized_query_id INTEGER NOT NULL REFERENCES normalized_queries(id) ON DELETE CASCADE,
        database_id INTEGER NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
        query_text TEXT NOT NULL,
        query_hash TEXT NOT NULL,
        username TEXT,
        application_name TEXT,
        client_addr TEXT,
        query_start TIMESTAMP,
        duration TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_query_samples_normalized_query_id ON query_samples(normalized_query_id);
      CREATE INDEX IF NOT EXISTS idx_query_samples_database_id ON query_samples(database_id);
      CREATE INDEX IF NOT EXISTS idx_query_samples_query_hash ON query_samples(query_hash);

      -- Add instance_count to normalized_queries if it doesn't exist
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'normalized_queries' AND column_name = 'instance_count'
        ) THEN
          ALTER TABLE normalized_queries ADD COLUMN instance_count INTEGER NOT NULL DEFAULT 0;
        END IF;
      END $$;

      -- Create trigger function
      CREATE OR REPLACE FUNCTION update_instance_count()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Update instance_count in normalized_queries
        UPDATE normalized_queries
        SET instance_count = (
          SELECT COUNT(*)
          FROM query_samples
          WHERE normalized_query_id = COALESCE(NEW.normalized_query_id, OLD.normalized_query_id)
        )
        WHERE id = COALESCE(NEW.normalized_query_id, OLD.normalized_query_id);
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Create trigger
      DROP TRIGGER IF EXISTS maintain_instance_count ON query_samples;
      CREATE TRIGGER maintain_instance_count
      AFTER INSERT OR UPDATE OR DELETE ON query_samples
      FOR EACH ROW
      EXECUTE FUNCTION update_instance_count();
    `);

    console.log('Successfully created query_samples table and related objects');
  } catch (error) {
    console.error('Failed to create query_samples table:', error);
  } finally {
    await pool.end();
  }
}

createQuerySamplesTable(); 