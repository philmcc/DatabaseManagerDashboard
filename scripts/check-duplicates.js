/**
 * Check for Duplicate Normalized Queries
 * 
 * This script identifies potential duplicates in the normalized_queries table
 * that should be consolidated.
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkDuplicates() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('=== Checking for Duplicate Normalized Queries ===\n');
    
    // Find queries with the same normalized text (these should be consolidated)
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
    
    console.log(`Found ${duplicates.length} duplicated normalized query groups!\n`);
    
    // Display details of duplicates
    for (let i = 0; i < Math.min(duplicates.length, 10); i++) {
      const duplicate = duplicates[i];
      
      console.log(`Duplicate Group ${i+1}:`);
      console.log(`  Normalized Text: ${duplicate.normalized_text}`);
      console.log(`  Occurrences: ${duplicate.count}`);
      console.log(`  IDs: ${duplicate.ids.join(', ')}`);
      console.log(`  Database IDs: ${duplicate.database_ids.join(', ')}`);
      
      // For each duplicate group, check if there are collected queries for each normalized query
      for (const normalizedId of duplicate.ids) {
        const collectedResult = await pool.query(`
          SELECT COUNT(*) 
          FROM collected_queries 
          WHERE normalized_query_id = $1
        `, [normalizedId]);
        
        console.log(`  Collected queries for ID ${normalizedId}: ${collectedResult.rows[0].count}`);
      }
      
      console.log('');
    }
    
    if (duplicates.length > 10) {
      console.log(`... and ${duplicates.length - 10} more duplicate groups`);
    }
    
    // Provide a summary of the issue and what needs to be fixed
    console.log('\nSUMMARY:');
    console.log('The presence of duplicate normalized queries is causing the UI to display the same query multiple times.');
    console.log('To fix this issue, a consolidation process is needed that will:');
    console.log('1. Identify all duplicate normalized queries');
    console.log('2. Select one query from each group to keep');
    console.log('3. Reassign all collected_queries from the duplicates to the kept query');
    console.log('4. Delete the duplicate normalized_queries records');
    
  } catch (error) {
    console.error('Error checking for duplicates:', error);
  } finally {
    await pool.end();
  }
}

// Run the check
checkDuplicates(); 