/**
 * Cleanup Stale Queries
 * 
 * This script removes collected queries that haven't been updated
 * for a specified amount of time, while preserving the normalized versions.
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Default retention period is 90 days (in milliseconds)
const DEFAULT_RETENTION_DAYS = 90;
const MS_PER_DAY = 86400000; // 24 * 60 * 60 * 1000

async function cleanupStaleQueries() {
  // Get retention days from command line or use default
  const retentionDays = process.argv[2] ? parseInt(process.argv[2]) : DEFAULT_RETENTION_DAYS;
  const cutoffDate = new Date(Date.now() - (retentionDays * MS_PER_DAY));
  
  console.log(`=== Stale Query Cleanup ===`);
  console.log(`Removing collected queries not updated since: ${cutoffDate.toISOString()}`);
  console.log(`Retention period: ${retentionDays} days`);
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    // First, identify how many queries will be affected
    const { rows: countResult } = await pool.query(
      "SELECT COUNT(*) as count FROM collected_queries WHERE last_updated_at < $1",
      [cutoffDate]
    );
    
    const staleQueryCount = parseInt(countResult[0].count);
    
    if (staleQueryCount === 0) {
      console.log(`No stale queries found to clean up.`);
      return;
    }
    
    console.log(`Found ${staleQueryCount} stale queries to remove.`);
    
    // Prompt for confirmation
    if (process.env.SKIP_CONFIRMATION !== 'true') {
      console.log(`\nWARNING: This will permanently delete ${staleQueryCount} queries.`);
      console.log(`To proceed, press any key. To abort, press Ctrl+C.`);
      
      // Wait for user input
      await new Promise(resolve => {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', () => {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve();
        });
      });
    }
    
    console.log(`\nDeleting stale queries...`);
    
    // Delete the stale queries
    const { rowCount } = await pool.query(
      "DELETE FROM collected_queries WHERE last_updated_at < $1",
      [cutoffDate]
    );
    
    console.log(`Successfully deleted ${rowCount} stale queries.`);
    
    // Now check for orphaned normalized queries (those with no collected queries)
    const { rows: orphanedResult } = await pool.query(`
      SELECT COUNT(*) as count 
      FROM normalized_queries nq
      WHERE NOT EXISTS (
        SELECT 1 
        FROM collected_queries cq 
        WHERE cq.normalized_query_id = nq.id
      )
    `);
    
    const orphanedCount = parseInt(orphanedResult[0].count);
    
    if (orphanedCount > 0) {
      console.log(`\nFound ${orphanedCount} orphaned normalized queries.`);
      console.log(`These are query structures with no recent examples.`);
      console.log(`NOTE: These normalized queries are kept for historical knowledge.`);
      console.log(`If you want to delete these too, run: DELETE FROM normalized_queries WHERE id NOT IN (SELECT DISTINCT normalized_query_id FROM collected_queries)`);
    }
    
    console.log(`\nCleanup completed successfully!`);
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Run the script
cleanupStaleQueries(); 