/**
 * Check Query Monitoring Status
 * 
 * This script checks the current status of query monitoring,
 * including table counts, configuration, and important statistics.
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkStatus() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('=== Query Monitoring Status Check ===\n');
    
    // Check table existence
    const { rows: tables } = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND 
      tablename IN ('normalized_queries', 'collected_queries', 'query_groups', 'discovered_queries')
      ORDER BY tablename;
    `);
    
    console.log('Detected tables:');
    tables.forEach(row => {
      console.log(`- ${row.tablename}`);
    });
    
    // Get table counts
    console.log('\nTable counts:');
    if (tables.some(t => t.tablename === 'normalized_queries')) {
      const { rows: normalizedCount } = await pool.query(
        "SELECT COUNT(*) as count FROM normalized_queries"
      );
      console.log(`- normalized_queries: ${normalizedCount[0].count}`);
    }
    
    if (tables.some(t => t.tablename === 'collected_queries')) {
      const { rows: collectedCount } = await pool.query(
        "SELECT COUNT(*) as count FROM collected_queries"
      );
      console.log(`- collected_queries: ${collectedCount[0].count}`);
    }
    
    if (tables.some(t => t.tablename === 'query_groups')) {
      const { rows: groupCount } = await pool.query(
        "SELECT COUNT(*) as count FROM query_groups"
      );
      console.log(`- query_groups: ${groupCount[0].count}`);
    }
    
    if (tables.some(t => t.tablename === 'discovered_queries')) {
      const { rows: discoveredCount } = await pool.query(
        "SELECT COUNT(*) as count FROM discovered_queries"
      );
      console.log(`- discovered_queries: ${discoveredCount[0].count} (legacy table)`);
    }
    
    // Check for active monitoring configurations
    console.log('\nActive monitoring configurations:');
    const { rows: configs } = await pool.query(`
      SELECT 
        database_id, 
        is_active, 
        interval_minutes,
        last_run_at
      FROM 
        query_monitoring_configs
      ORDER BY 
        database_id
    `);
    
    if (configs.length === 0) {
      console.log('No monitoring configurations found.');
    } else {
      configs.forEach(config => {
        console.log(`Database ID ${config.database_id}:`);
        console.log(`  - Status: ${config.is_active ? 'Active' : 'Inactive'}`);
        console.log(`  - Interval: ${config.interval_minutes} minutes`);
        console.log(`  - Last run: ${config.last_run_at || 'Never'}`);
      });
    }
    
    // If we have normalized queries, show some statistics
    if (tables.some(t => t.tablename === 'normalized_queries')) {
      console.log('\nQuery statistics:');
      
      // Get top 5 most frequent queries
      const { rows: topQueries } = await pool.query(`
        SELECT 
          nq.id,
          nq.normalized_text,
          COUNT(cq.id) as instance_count,
          MAX(cq.last_updated_at) as last_seen
        FROM 
          normalized_queries nq
        JOIN 
          collected_queries cq ON nq.id = cq.normalized_query_id
        GROUP BY 
          nq.id, nq.normalized_text
        ORDER BY 
          instance_count DESC
        LIMIT 5
      `);
      
      if (topQueries.length > 0) {
        console.log('Top 5 most frequent queries:');
        topQueries.forEach((query, index) => {
          console.log(`${index + 1}. ${query.normalized_text.substring(0, 60)}... (${query.instance_count} instances)`);
        });
      } else {
        console.log('No query statistics available yet.');
      }
    }
    
    console.log('\nStatus check completed.');
  } catch (error) {
    console.error('Error checking status:', error);
  } finally {
    await pool.end();
  }
}

// Run the check
checkStatus(); 