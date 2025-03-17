/**
 * Verify No Duplicate Normalized Queries
 * 
 * This script checks that there are no more duplicate normalized queries in the database.
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function verifyNoDuplicates() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('=== Verifying No Duplicate Normalized Queries ===\n');
    
    // Find any duplicate normalized query groups
    const duplicatesResult = await pool.query(`
      SELECT 
        normalized_text, 
        COUNT(*) as count,
        ARRAY_AGG(id) as ids
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
      console.log('✅ No duplicates found! All normalized queries are unique.');
      
      // Get count of normalized queries and collected queries
      const countsResult = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM normalized_queries) as normalized_count,
          (SELECT COUNT(*) FROM collected_queries) as collected_count
      `);
      
      const counts = countsResult.rows[0];
      console.log(`\nDatabase Statistics:`);
      console.log(`- Normalized Queries: ${counts.normalized_count}`);
      console.log(`- Collected Queries: ${counts.collected_count}`);
      console.log(`- Average Instances Per Query: ${(counts.collected_count / counts.normalized_count).toFixed(2)}`);
      
      return true;
    } else {
      console.log(`❌ Found ${duplicates.length} duplicated normalized query groups that still need consolidation.`);
      console.log('\nExample duplicates:');
      
      // Show top 5 duplicates
      for (let i = 0; i < Math.min(5, duplicates.length); i++) {
        const duplicate = duplicates[i];
        console.log(`Group ${i+1}: "${duplicate.normalized_text.substring(0, 60)}..." (${duplicate.count} occurrences, IDs: ${duplicate.ids.join(', ')})`);
      }
      
      return false;
    }
  } catch (error) {
    console.error('Error verifying duplicates:', error);
    return false;
  } finally {
    await pool.end();
  }
}

// Run the verification
verifyNoDuplicates(); 