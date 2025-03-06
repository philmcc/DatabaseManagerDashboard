import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkPgStatStatements() {
  console.log('Checking for pg_stat_statements extension...');
  
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Check if extension exists
    const result = await pool.query(`
      SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements'
    `);

    if (result.rows.length === 0) {
      console.log('pg_stat_statements extension is not installed.');
      console.log('Installing extension...');
      
      // Try to create extension
      await pool.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
      
      console.log('Extension installed successfully. Please restart your PostgreSQL server if needed.');
    } else {
      console.log('pg_stat_statements extension is already installed.');
      
      // Test if it's working
      console.log('Testing pg_stat_statements...');
      
      try {
        const statsResult = await pool.query('SELECT * FROM pg_stat_statements LIMIT 1');
        console.log('pg_stat_statements is working correctly.');
      } catch (err) {
        console.error('Error querying pg_stat_statements:', err);
        console.log('You may need to add pg_stat_statements to shared_preload_libraries in postgresql.conf and restart PostgreSQL.');
      }
    }
  } catch (error) {
    console.error('Error checking/installing pg_stat_statements:', error);
  } finally {
    await pool.end();
  }
}

checkPgStatStatements(); 