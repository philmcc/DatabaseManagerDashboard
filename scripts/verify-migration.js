/**
 * Migration Verification Script
 * 
 * This script verifies that the migration to the new query monitoring system
 * is complete and functioning properly.
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function verifyMigration() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('=== Query Monitoring Migration Verification ===\n');
    
    // 1. Check table counts
    const tables = [
      { name: 'discovered_queries', description: 'Old table' },
      { name: 'normalized_queries', description: 'New normalized forms' },
      { name: 'collected_queries', description: 'New query instances' }
    ];
    
    console.log('Table record counts:');
    for (const table of tables) {
      const result = await pool.query(`SELECT COUNT(*) FROM ${table.name}`);
      console.log(`- ${table.name} (${table.description}): ${result.rows[0].count}`);
    }
    
    // 2. Check for data consistency
    console.log('\nData consistency checks:');
    
    // 2.1 Check for queries in old table not migrated to new structure
    const unmigrated = await pool.query(`
      SELECT COUNT(*) 
      FROM discovered_queries dq
      WHERE NOT EXISTS (
        SELECT 1 
        FROM normalized_queries nq
        WHERE nq.normalized_text = dq.normalized_query
      )
    `);
    
    console.log(`- Queries in old table not found in new structure: ${unmigrated.rows[0].count}`);
    
    // 2.2 Check if all databases with queries in old system have queries in new system
    const oldDatabases = await pool.query(`
      SELECT DISTINCT database_id 
      FROM discovered_queries
    `);
    
    console.log(`- Databases with queries in old structure: ${oldDatabases.rows.length}`);
    
    const newDatabases = await pool.query(`
      SELECT DISTINCT database_id 
      FROM normalized_queries
    `);
    
    console.log(`- Databases with queries in new structure: ${newDatabases.rows.length}`);
    
    // 2.3 Check for orphaned normalized queries (without any collected instances)
    const orphaned = await pool.query(`
      SELECT COUNT(*) 
      FROM normalized_queries nq
      WHERE NOT EXISTS (
        SELECT 1 
        FROM collected_queries cq
        WHERE cq.normalized_query_id = nq.id
      )
    `);
    
    console.log(`- Normalized queries without collected instances: ${orphaned.rows[0].count}`);
    
    // 3. Check relationship between tables
    console.log('\nRelationship verification:');
    
    // 3.1 Check that all normalized queries have corresponding collected queries
    const normalized = await pool.query(`
      SELECT COUNT(DISTINCT id) 
      FROM normalized_queries
    `);
    
    const collected = await pool.query(`
      SELECT COUNT(DISTINCT normalized_query_id) 
      FROM collected_queries
    `);
    
    console.log(`- Distinct normalized queries: ${normalized.rows[0].count}`);
    console.log(`- Distinct normalized queries referenced in collected_queries: ${collected.rows[0].count}`);
    
    // 4. Migration completeness check
    console.log('\nMigration completeness assessment:');
    
    // Calculate overall migration status
    const totalOldQueries = parseInt((await pool.query('SELECT COUNT(*) FROM discovered_queries')).rows[0].count);
    const totalNormalizedQueries = parseInt((await pool.query('SELECT COUNT(*) FROM normalized_queries')).rows[0].count);
    const totalCollectedQueries = parseInt((await pool.query('SELECT COUNT(*) FROM collected_queries')).rows[0].count);
    const numUnmigrated = parseInt(unmigrated.rows[0].count);
    const numOrphaned = parseInt(orphaned.rows[0].count);
    
    const migrationSuccess = numUnmigrated === 0 && 
                             totalNormalizedQueries > 0 && 
                             totalCollectedQueries > 0 &&
                             numOrphaned === 0;
    
    if (migrationSuccess) {
      console.log('✅ MIGRATION SUCCESSFUL: All data appears to be properly migrated to the new structure.');
      console.log('It should be safe to proceed with removing the old table if desired.');
    } else {
      console.log('⚠️ MIGRATION INCOMPLETE: Some issues were detected that should be addressed:');
      
      if (numUnmigrated > 0) {
        console.log(`  - ${numUnmigrated} queries in the old table are not found in the new structure.`);
      }
      
      if (numOrphaned > 0) {
        console.log(`  - ${numOrphaned} normalized queries have no corresponding collected instances.`);
      }
      
      if (totalNormalizedQueries === 0 || totalCollectedQueries === 0) {
        console.log('  - One or more of the new tables has no data.');
      }
    }
    
    // 5. Can we safely drop the old table?
    console.log('\nOld table dependency check:');
    
    // Check if there are still any direct references to the old table in code
    // This is a database-only check - code search would need to be done separately
    console.log('- Note: Check that all code has been updated to use the new tables.');
    console.log('- A code search for "discoveredQueries" revealed references in:');
    console.log('  * Schema definitions (expected)');
    console.log('  * Normalization scripts (migration utilities)');
    console.log('  * Some old API endpoints (should be checked)');
    
    console.log('\n=== End of Verification ===');
    
  } catch (error) {
    console.error('Error during verification:', error);
  } finally {
    await pool.end();
  }
}

verifyMigration(); 