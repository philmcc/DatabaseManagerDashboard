/**
 * View Normalized Queries
 * 
 * This script allows viewing normalized queries and their statistics
 * in an interactive way, helping to verify the new query monitoring system.
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function viewNormalizedQueries() {
  console.log('=== View Normalized Queries ===\n');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    // Check if we have the new tables
    const { rows: tablesCheck } = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'normalized_queries'
      ) as normalized_exists,
      EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'collected_queries'
      ) as collected_exists;
    `);
    
    if (!tablesCheck[0].normalized_exists || !tablesCheck[0].collected_exists) {
      console.error('Error: The new query monitoring tables do not exist!');
      console.error('Please run the migration script to create them first.');
      return;
    }
    
    // Get databases
    const { rows: databases } = await pool.query(`
      SELECT id, name, host FROM database_connections ORDER BY name
    `);
    
    if (databases.length === 0) {
      console.log('No databases found.');
      return;
    }
    
    console.log('Available databases:');
    databases.forEach((db, i) => {
      console.log(`${i+1}. ${db.name} (${db.host})`);
    });
    
    const dbIndexPrompt = () => new Promise(resolve => {
      rl.question('\nSelect a database (number): ', answer => {
        const index = parseInt(answer) - 1;
        if (index >= 0 && index < databases.length) {
          resolve(databases[index]);
        } else {
          console.log('Invalid selection, please try again.');
          resolve(dbIndexPrompt());
        }
      });
    });
    
    const selectedDb = await dbIndexPrompt();
    console.log(`\nSelected database: ${selectedDb.name} (${selectedDb.host})\n`);
    
    // Get normalized queries for this database
    const { rows: stats } = await pool.query(`
      SELECT 
        nq.id,
        nq.normalized_text as normalized_query,
        nq.is_known,
        COUNT(cq.id) as instance_count,
        SUM(cq.calls) as total_calls,
        SUM(cq.total_time) as total_time,
        MIN(cq.min_time) as min_time,
        MAX(cq.max_time) as max_time,
        SUM(cq.total_time) / NULLIF(SUM(cq.calls), 0) as avg_time,
        MIN(cq.collected_at) as first_collected,
        MAX(cq.last_updated_at) as last_updated
      FROM 
        normalized_queries nq
      LEFT JOIN 
        collected_queries cq ON nq.id = cq.normalized_query_id
      WHERE 
        nq.database_id = $1
      GROUP BY 
        nq.id, nq.normalized_text, nq.is_known
      ORDER BY 
        SUM(cq.total_time) DESC NULLS LAST
      LIMIT 100
    `, [selectedDb.id]);
    
    if (stats.length === 0) {
      console.log('No normalized queries found for this database.');
      return;
    }
    
    console.log(`Found ${stats.length} normalized queries.\n`);
    
    // Display summary of normalized queries
    console.log('Top 10 normalized queries by execution time:');
    console.log('---------------------------------------------');
    stats.slice(0, 10).forEach((nq, i) => {
      console.log(`${i+1}. [${nq.id}] ${nq.normalized_query.substring(0, 80)}...`);
      console.log(`   Instances: ${nq.instance_count}, Calls: ${nq.total_calls}, Total Time: ${nq.total_time.toFixed(2)}ms`);
      console.log(`   Avg: ${nq.avg_time ? nq.avg_time.toFixed(2) : 'N/A'}ms, Min: ${nq.min_time || 'N/A'}ms, Max: ${nq.max_time || 'N/A'}ms`);
      console.log(`   Known: ${nq.is_known ? 'Yes' : 'No'}`);
      console.log('');
    });
    
    // View detailed info for a specific query
    const viewDetailedPrompt = () => new Promise(resolve => {
      rl.question('\nView details for query ID (or q to quit): ', async (answer) => {
        if (answer.toLowerCase() === 'q') {
          resolve(false);
          return;
        }
        
        const queryId = parseInt(answer);
        if (isNaN(queryId)) {
          console.log('Invalid query ID, please try again.');
          resolve(viewDetailedPrompt());
          return;
        }
        
        try {
          // Get normalized query details
          const { rows: normalizedQuery } = await pool.query(`
            SELECT * FROM normalized_queries WHERE id = $1
          `, [queryId]);
          
          if (normalizedQuery.length === 0) {
            console.log(`Query with ID ${queryId} not found.`);
            resolve(viewDetailedPrompt());
            return;
          }
          
          console.log('\nNormalized Query Details:');
          console.log('-------------------------');
          console.log(`ID: ${normalizedQuery[0].id}`);
          console.log(`Database ID: ${normalizedQuery[0].database_id}`);
          console.log(`Normalized Text: ${normalizedQuery[0].normalized_text}`);
          console.log(`Normalized Hash: ${normalizedQuery[0].normalized_hash}`);
          console.log(`First Seen: ${normalizedQuery[0].first_seen_at}`);
          console.log(`Last Seen: ${normalizedQuery[0].last_seen_at}`);
          console.log(`Is Known: ${normalizedQuery[0].is_known}`);
          console.log(`Group ID: ${normalizedQuery[0].group_id || 'None'}`);
          
          // Get collected queries
          const { rows: collectedQueries } = await pool.query(`
            SELECT * FROM collected_queries 
            WHERE normalized_query_id = $1 
            ORDER BY last_updated_at DESC
          `, [queryId]);
          
          console.log(`\nCollected Queries (${collectedQueries.length}):`);
          console.log('----------------');
          
          for (let i = 0; i < Math.min(5, collectedQueries.length); i++) {
            const cq = collectedQueries[i];
            console.log(`\n${i+1}. Query Text: ${cq.query_text.substring(0, 100)}...`);
            console.log(`   Calls: ${cq.calls}, Total Time: ${cq.total_time.toFixed(2)}ms`);
            console.log(`   Collected: ${cq.collected_at}, Last Updated: ${cq.last_updated_at}`);
          }
          
          if (collectedQueries.length > 5) {
            console.log(`\n... and ${collectedQueries.length - 5} more instances`);
          }
          
          resolve(viewDetailedPrompt());
        } catch (error) {
          console.error('Error fetching query details:', error);
          resolve(viewDetailedPrompt());
        }
      });
    });
    
    await viewDetailedPrompt();
    console.log('\nThank you for using the normalized query viewer!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    rl.close();
  }
}

// Run the script
viewNormalizedQueries(); 