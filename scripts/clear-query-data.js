/**
 * Clear Query Monitoring Data
 * 
 * This script safely removes all query monitoring data (normalized_queries and collected_queries)
 * to provide a fresh start for query collection.
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

async function clearQueryData() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('=== Clear Query Monitoring Data ===\n');
    
    // Check current data counts
    const countResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM normalized_queries) as normalized_count,
        (SELECT COUNT(*) FROM collected_queries) as collected_count
    `);
    
    const counts = countResult.rows[0];
    
    console.log('Current data in database:');
    console.log(`- Normalized Queries: ${counts.normalized_count}`);
    console.log(`- Collected Queries: ${counts.collected_count}`);
    
    // Ask for backup confirmation
    console.log('\n⚠️ IMPORTANT: Make sure you have a current database backup before proceeding!');
    const backupConfirm = await promptUser('Do you have a current database backup? (yes/no): ');
    
    if (backupConfirm.toLowerCase() !== 'yes') {
      console.log('Operation cancelled. Please create a database backup first.');
      return;
    }
    
    // Ask about keeping query groups
    const keepGroups = await promptUser('\nDo you want to keep the query groups? (yes/no): ');
    
    // Final confirmation with details about what will be deleted
    console.log('\n⚠️ WARNING: This will permanently delete:');
    console.log(`- ${counts.normalized_count} normalized queries`);
    console.log(`- ${counts.collected_queries} collected queries`);
    if (keepGroups.toLowerCase() !== 'yes') {
      console.log('- All query groups');
    }
    console.log('\nThis operation cannot be undone except by restoring from backup.');
    
    const finalConfirm = await promptUser('Type "CLEAR ALL DATA" to confirm: ');
    
    if (finalConfirm !== 'CLEAR ALL DATA') {
      console.log('Operation cancelled.');
      return;
    }
    
    console.log('\nClearing query monitoring data...');
    
    // Start transaction
    await pool.query('BEGIN');
    
    try {
      // Delete collected queries first (due to foreign key constraints)
      const { rowCount: collectedDeleted } = await pool.query('DELETE FROM collected_queries');
      console.log(`Deleted ${collectedDeleted} collected queries`);
      
      // Delete normalized queries
      const { rowCount: normalizedDeleted } = await pool.query('DELETE FROM normalized_queries');
      console.log(`Deleted ${normalizedDeleted} normalized queries`);
      
      // Delete query groups if requested
      if (keepGroups.toLowerCase() !== 'yes') {
        const { rowCount: groupsDeleted } = await pool.query('DELETE FROM query_groups');
        console.log(`Deleted ${groupsDeleted} query groups`);
      }
      
      // Commit transaction
      await pool.query('COMMIT');
      
      console.log('\n✅ Query data has been cleared successfully!');
      console.log('\nTo collect new query data:');
      console.log('1. Ensure query monitoring is enabled for your databases');
      console.log('2. Run queries against your database');
      console.log('3. Wait for the monitoring interval to collect the new queries');
      console.log('4. Refresh the query monitoring dashboard');
      
    } catch (error) {
      // Rollback on error
      await pool.query('ROLLBACK');
      console.error('Error clearing data:', error);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    rl.close();
  }
}

// Run the script
clearQueryData(); 