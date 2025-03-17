/**
 * Fix Duplicate Normalized Queries
 * 
 * This script consolidates duplicate normalized queries by:
 * 1. Finding all duplicate normalized query groups
 * 2. For each group, keeping the record with the most recent last_seen_at date
 * 3. Updating all collected_queries to point to the kept record
 * 4. Deleting the duplicate normalized_queries records
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

async function fixDuplicateQueries() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('=== Fix Duplicate Normalized Queries ===\n');
    
    // Find all duplicate normalized query groups
    const duplicatesResult = await pool.query(`
      SELECT 
        normalized_text, 
        COUNT(*) as count,
        ARRAY_AGG(id) as ids,
        ARRAY_AGG(database_id) as database_ids
      FROM 
        normalized_queries
      GROUP BY 
        normalized_text
      HAVING 
        COUNT(*) > 1
      ORDER BY 
        COUNT(*) DESC
    `);
    
    const duplicates = duplicatesResult.rows;
    
    if (duplicates.length === 0) {
      console.log('No duplicates found. All normalized queries are unique.');
      return;
    }
    
    console.log(`Found ${duplicates.length} duplicated normalized query groups to consolidate.\n`);
    
    // Ask for backup confirmation
    console.log('⚠️ IMPORTANT: Make sure you have a current database backup before proceeding!');
    const backupConfirm = await promptUser('Do you have a current database backup? (yes/no): ');
    
    if (backupConfirm.toLowerCase() !== 'yes') {
      console.log('Operation cancelled. Please create a database backup first.');
      return;
    }
    
    // Ask for final confirmation
    console.log('\n⚠️ WARNING: This will permanently modify the database by consolidating duplicate queries.');
    console.log('This operation cannot be undone except by restoring from backup.');
    const finalConfirm = await promptUser('Are you sure you want to proceed? (type "CONSOLIDATE" to confirm): ');
    
    if (finalConfirm !== 'CONSOLIDATE') {
      console.log('Operation cancelled.');
      return;
    }
    
    console.log('\nProceeding with query consolidation...');
    
    // Start a transaction
    await pool.query('BEGIN');
    
    let consolidatedGroups = 0;
    let totalUpdatedCollectedQueries = 0;
    let totalDeletedDuplicates = 0;
    
    // Process each duplicate group
    for (const duplicate of duplicates) {
      try {
        // Get more details about each normalized query in this group
        const detailsResult = await pool.query(`
          SELECT 
            id, 
            normalized_text, 
            database_id, 
            is_known, 
            group_id, 
            first_seen_at, 
            last_seen_at,
            (SELECT COUNT(*) FROM collected_queries WHERE normalized_query_id = normalized_queries.id) as collected_count
          FROM 
            normalized_queries
          WHERE 
            id = ANY($1)
          ORDER BY 
            last_seen_at DESC, collected_count DESC
        `, [duplicate.ids]);
        
        const queries = detailsResult.rows;
        
        // Choose the "best" query to keep (most recent last_seen_at and most collected queries)
        const keepQuery = queries[0];
        const deleteQueries = queries.slice(1);
        const deleteIds = deleteQueries.map(q => q.id);
        
        // Log what we're about to do
        console.log(`Group for "${keepQuery.normalized_text.substring(0, 40)}..."`);
        console.log(`  Keeping: ID ${keepQuery.id} (${keepQuery.collected_count} instances, last seen: ${keepQuery.last_seen_at})`);
        console.log(`  Deleting: ${deleteIds.length} duplicates (IDs: ${deleteIds.join(', ')})`);
        
        // Update collected_queries to point to the kept normalized query
        if (deleteIds.length > 0) {
          const updateResult = await pool.query(`
            UPDATE collected_queries
            SET normalized_query_id = $1
            WHERE normalized_query_id = ANY($2)
            RETURNING id
          `, [keepQuery.id, deleteIds]);
          
          const updatedCount = updateResult.rowCount;
          console.log(`  Updated ${updatedCount} collected queries to point to ID ${keepQuery.id}`);
          totalUpdatedCollectedQueries += updatedCount;
          
          // Delete the duplicate normalized queries
          const deleteResult = await pool.query(`
            DELETE FROM normalized_queries
            WHERE id = ANY($1)
            RETURNING id
          `, [deleteIds]);
          
          const deletedCount = deleteResult.rowCount;
          console.log(`  Deleted ${deletedCount} duplicate normalized queries`);
          totalDeletedDuplicates += deletedCount;
          
          consolidatedGroups++;
        }
      } catch (error) {
        console.error(`Error processing group for "${duplicate.normalized_text.substring(0, 40)}...":`, error);
        // Continue with the next group even if this one failed
      }
    }
    
    // Commit transaction
    await pool.query('COMMIT');
    
    console.log('\n=== Consolidation Summary ===');
    console.log(`Processed: ${consolidatedGroups} duplicate groups`);
    console.log(`Updated: ${totalUpdatedCollectedQueries} collected queries`);
    console.log(`Deleted: ${totalDeletedDuplicates} duplicate normalized queries`);
    console.log('\nThe UI should now display each unique query only once!');
    
  } catch (error) {
    // Rollback transaction on error
    await pool.query('ROLLBACK');
    console.error('\nError during query consolidation. All changes have been rolled back:', error);
  } finally {
    await pool.end();
    rl.close();
  }
}

// Run the fix
fixDuplicateQueries(); 