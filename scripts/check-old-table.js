import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkOldTable() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query('SELECT COUNT(*) FROM discovered_queries');
    console.log('Count in discovered_queries:', result.rows[0].count);
    
    const columnsResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'discovered_queries'
    `);
    
    console.log('\nColumns in discovered_queries:');
    columnsResult.rows.forEach(row => {
      console.log(`- ${row.column_name}`);
    });
    
    // Check if there are any queries that might not have been migrated
    const nonMigratedResult = await pool.query(`
      SELECT COUNT(*) 
      FROM discovered_queries dq
      WHERE NOT EXISTS (
        SELECT 1 
        FROM normalized_queries nq
        WHERE nq.normalized_text = dq.normalized_query
      )
    `);
    
    console.log(`\nQueries in discovered_queries not found in normalized_queries: ${nonMigratedResult.rows[0].count}`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkOldTable(); 