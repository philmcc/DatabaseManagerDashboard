/**
 * Clear Old Query Data
 * 
 * This script clears data from the legacy discovered_queries table
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

async function clearOldQueryData() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('=== Clear Old Query Data (discovered_queries) ===\n');
    
    // Check if the table exists
    const { rows: tables } = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = 'discovered_queries'
    `);
    
    if (tables.length === 0) {
      console.log('The old discovered_queries table does not exist. Nothing to do.');
      return;
    }
    
    // Check current data count
    const { rows: countResult } = await pool.query(`
      SELECT COUNT(*) as count FROM discovered_queries
    `);
    
    const count = parseInt(countResult[0].count);
    
    console.log(`Found ${count} queries in the legacy discovered_queries table.`);
    
    if (count === 0) {
      console.log('The table is already empty. Nothing to do.');
      return;
    }
    
    // Ask for backup confirmation
    console.log('\n⚠️ IMPORTANT: Make sure you have a current database backup before proceeding!');
    const backupConfirm = await promptUser('Do you have a current database backup? (yes/no): ');
    
    if (backupConfirm.toLowerCase() !== 'yes') {
      console.log('Operation cancelled. Please create a database backup first.');
      return;
    }
    
    // Final confirmation
    console.log(`\n⚠️ WARNING: This will permanently delete ${count} records from the legacy discovered_queries table.`);
    console.log('This operation cannot be undone except by restoring from backup.');
    
    const finalConfirm = await promptUser('Type "CLEAR OLD DATA" to confirm: ');
    
    if (finalConfirm !== 'CLEAR OLD DATA') {
      console.log('Operation cancelled.');
      return;
    }
    
    console.log('\nClearing old query data...');
    
    // Delete data
    const { rowCount } = await pool.query('DELETE FROM discovered_queries');
    
    console.log(`Deleted ${rowCount} records from discovered_queries table.`);
    console.log('\n✅ Old query data has been cleared successfully!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    rl.close();
  }
}

// Run the script
clearOldQueryData(); 