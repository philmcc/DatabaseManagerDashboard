/**
 * Drop Old Tables Script
 * 
 * This script safely drops the old discovered_queries table
 * after verifying that all data has been migrated to the new schema.
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function promptUser(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function dropOldTables() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('=== Old Tables Cleanup ===\n');
    
    // 1. First verify migration was successful
    const unmigrated = await pool.query(`
      SELECT COUNT(*) 
      FROM discovered_queries dq
      WHERE NOT EXISTS (
        SELECT 1 
        FROM normalized_queries nq
        WHERE nq.normalized_text = dq.normalized_query
      )
    `);
    
    const numUnmigrated = parseInt(unmigrated.rows[0].count);
    
    if (numUnmigrated > 0) {
      console.log(`⚠️ WARNING: There are ${numUnmigrated} queries in the old table that do not exist in the new structure.`);
      console.log('It is NOT safe to drop the old table. Run the full verification script first.');
      return;
    }
    
    // 2. Check current table counts
    const oldCount = parseInt((await pool.query('SELECT COUNT(*) FROM discovered_queries')).rows[0].count);
    const normalizedCount = parseInt((await pool.query('SELECT COUNT(*) FROM normalized_queries')).rows[0].count);
    const collectedCount = parseInt((await pool.query('SELECT COUNT(*) FROM collected_queries')).rows[0].count);
    
    console.log('Current table record counts:');
    console.log(`- discovered_queries (Old table): ${oldCount}`);
    console.log(`- normalized_queries (New normalized forms): ${normalizedCount}`);
    console.log(`- collected_queries (New query instances): ${collectedCount}`);
    
    // 3. Ask for backup confirmation
    console.log('\n⚠️ IMPORTANT: Make sure you have a current database backup before proceeding!');
    const backupConfirm = await promptUser('Do you have a current database backup? (yes/no): ');
    
    if (backupConfirm.toLowerCase() !== 'yes') {
      console.log('Operation cancelled. Please create a database backup first.');
      return;
    }
    
    // 4. Ask for final confirmation
    console.log('\n⚠️ WARNING: This will permanently delete the discovered_queries table.');
    console.log('This operation cannot be undone except by restoring from backup.');
    const finalConfirm = await promptUser('Are you sure you want to proceed? (type "DROP TABLE" to confirm): ');
    
    if (finalConfirm !== 'DROP TABLE') {
      console.log('Operation cancelled.');
      return;
    }
    
    // 5. Proceed with dropping the table
    console.log('\nProceeding with table removal...');
    
    // First drop relations, then table
    await pool.query(`
      -- Remove the relationship between queryGroups and discoveredQueries
      ALTER TABLE query_groups DROP CONSTRAINT IF EXISTS query_groups_id_fkey;
      
      -- Remove any foreign keys pointing to discovered_queries
      DO $$ 
      DECLARE
          r RECORD;
      BEGIN
          FOR r IN SELECT conname, conrelid::regclass AS table_name
                  FROM pg_constraint
                  WHERE confrelid = 'discovered_queries'::regclass
          LOOP
              EXECUTE 'ALTER TABLE ' || r.table_name || ' DROP CONSTRAINT ' || r.conname;
          END LOOP;
      END $$;
    `);
    
    // Now drop the actual table
    await pool.query('DROP TABLE discovered_queries');
    
    console.log('✅ Successfully dropped the discovered_queries table.');
    console.log('The migration to the new query monitoring system is now complete!');
    
  } catch (error) {
    console.error('Error during table cleanup:', error);
  } finally {
    await pool.end();
    rl.close();
  }
}

dropOldTables(); 