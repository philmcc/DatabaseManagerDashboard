/**
 * Check Tables
 * 
 * This script checks if the new query monitoring tables exist
 * and reports on their contents.
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkTables() {
  console.log('Checking database tables...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    // Check if tables exist
    const { rows: tables } = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `);
    
    console.log('\nTables in the database:');
    tables.forEach(row => {
      console.log(`- ${row.tablename}`);
    });
    
    // Check if views exist
    const { rows: views } = await pool.query(`
      SELECT viewname FROM pg_views 
      WHERE schemaname = 'public' 
      ORDER BY viewname;
    `);
    
    console.log('\nViews in the database:');
    views.forEach(row => {
      console.log(`- ${row.viewname}`);
    });
    
    // Check count of normalized_queries
    if (tables.some(t => t.tablename === 'normalized_queries')) {
      const { rows: normalizedCount } = await pool.query(
        "SELECT COUNT(*) as count FROM normalized_queries"
      );
      console.log(`\nCount of normalized_queries: ${normalizedCount[0].count}`);
    }
    
    // Check count of collected_queries
    if (tables.some(t => t.tablename === 'collected_queries')) {
      const { rows: collectedCount } = await pool.query(
        "SELECT COUNT(*) as count FROM collected_queries"
      );
      console.log(`Count of collected_queries: ${collectedCount[0].count}`);
    }
    
    console.log('\nDatabase check completed.');
  } catch (error) {
    console.error('Error checking tables:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Run the script
checkTables(); 