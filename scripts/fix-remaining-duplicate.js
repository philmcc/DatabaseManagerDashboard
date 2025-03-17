/**
 * Fix Remaining Duplicate Normalized Query
 * 
 * This script consolidates the last remaining duplicate normalized query.
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function fixRemainingDuplicate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('=== Fixing Remaining Duplicate Normalized Query ===\n');
    
    // Find the remaining duplicate
    const duplicateResult = await pool.query(`
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
      LIMIT 1
    `);
    
    if (duplicateResult.rows.length === 0) {
      console.log('No duplicates found. All normalized queries are already unique.');
      return;
    }
    
    const duplicate = duplicateResult.rows[0];
    console.log(`Found duplicate: "${duplicate.normalized_text.substring(0, 60)}..."`);
    console.log(`IDs: ${duplicate.ids.join(', ')}`);
    
    // Get more details about each duplicate query
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
    
    console.log(`\nKeeping: ID ${keepQuery.id} (${keepQuery.collected_count} instances, last seen: ${keepQuery.last_seen_at})`);
    console.log(`Deleting: IDs ${deleteIds.join(', ')}`);
    
    // Start a transaction
    await pool.query('BEGIN');
    
    // Update collected_queries to point to the kept normalized query
    const updateResult = await pool.query(`
      UPDATE collected_queries
      SET normalized_query_id = $1
      WHERE normalized_query_id = ANY($2)
      RETURNING id
    `, [keepQuery.id, deleteIds]);
    
    const updatedCount = updateResult.rowCount;
    console.log(`\nUpdated ${updatedCount} collected queries to point to ID ${keepQuery.id}`);
    
    // Delete the duplicate normalized queries
    const deleteResult = await pool.query(`
      DELETE FROM normalized_queries
      WHERE id = ANY($1)
      RETURNING id
    `, [deleteIds]);
    
    const deletedCount = deleteResult.rowCount;
    console.log(`Deleted ${deletedCount} duplicate normalized queries`);
    
    // Commit transaction
    await pool.query('COMMIT');
    
    console.log('\nRemaining duplicate has been fixed!');
    
  } catch (error) {
    // Rollback transaction on error
    await pool.query('ROLLBACK');
    console.error('\nError fixing remaining duplicate:', error);
  } finally {
    await pool.end();
  }
}

// Run the fix
fixRemainingDuplicate(); 