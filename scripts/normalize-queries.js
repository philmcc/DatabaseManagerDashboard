/**
 * Normalize Existing Queries
 * 
 * JavaScript version of the query normalization script
 * that doesn't rely on TypeScript compilation
 */
import pkg from 'pg';
const { Pool } = pkg;
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Function to normalize a SQL query
function normalizeQuery(query) {
  try {
    if (!query || typeof query !== 'string') {
      return '';
    }

    let normalizedQuery = query.trim();

    // Replace quoted strings with a placeholder
    normalizedQuery = normalizedQuery.replace(/'[^']*'/g, "'?'");
    normalizedQuery = normalizedQuery.replace(/"[^"]*"/g, '"?"');

    // Replace numbers with a placeholder
    normalizedQuery = normalizedQuery.replace(/\b\d+\b/g, '?');

    // Replace IN clauses with a single parameter
    // This handles cases like "IN (1, 2, 3)" or "IN ('a', 'b', 'c')"
    normalizedQuery = normalizedQuery.replace(/\bIN\s*\([^)]+\)/gi, 'IN (?)');

    // Replace multiple whitespace with a single space
    normalizedQuery = normalizedQuery.replace(/\s+/g, ' ');

    return normalizedQuery;
  } catch (error) {
    console.error('Error normalizing query:', error);
    return query; // Return original query if normalization fails
  }
}

// Generate a hash for the normalized query
function generateNormalizedQueryHash(normalizedQuery) {
  return crypto.createHash('md5').update(normalizedQuery).digest('hex');
}

async function normalizeExistingQueries() {
  console.log('Starting normalization of existing queries...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    // Get all queries without normalization
    const { rows: queries } = await pool.query(
      "SELECT * FROM discovered_queries WHERE normalized_query IS NULL"
    );
    
    console.log(`Found ${queries.length} queries to normalize`);
    
    // Process queries in batches for better performance
    const batchSize = 20;
    let processedCount = 0;
    let updatedCount = 0;
    let mergedCount = 0;
    
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      
      for (const query of batch) {
        // Skip if already processed
        if (query.normalized_query) continue;
        
        // Normalize query
        const normalizedQuery = normalizeQuery(query.query_text);
        const normalizedHash = generateNormalizedQueryHash(normalizedQuery);
        
        // Check if a query with this normalized form already exists
        const { rows: existingQueries } = await pool.query(
          "SELECT * FROM discovered_queries WHERE normalized_query = $1 AND id != $2 LIMIT 1",
          [normalizedQuery, query.id]
        );
        
        const existingQuery = existingQueries[0];
        
        if (existingQuery) {
          // Merge statistics and delete the duplicate
          await pool.query(`
            UPDATE discovered_queries 
            SET 
              call_count = call_count + $1,
              total_time = total_time + $2,
              min_time = LEAST(min_time, $3),
              max_time = GREATEST(max_time, $4),
              first_seen_at = $5,
              last_seen_at = $6,
              updated_at = NOW()
            WHERE id = $7
          `, [
            query.call_count,
            query.total_time,
            query.min_time,
            query.max_time,
            new Date(Math.min(
              new Date(existingQuery.first_seen_at).getTime(), 
              new Date(query.first_seen_at).getTime()
            )),
            new Date(Math.max(
              new Date(existingQuery.last_seen_at).getTime(), 
              new Date(query.last_seen_at).getTime()
            )),
            existingQuery.id
          ]);
          
          // Delete the duplicate
          await pool.query("DELETE FROM discovered_queries WHERE id = $1", [query.id]);
          
          mergedCount++;
        } else {
          // Update the query with normalized form
          await pool.query(
            "UPDATE discovered_queries SET normalized_query = $1, updated_at = NOW() WHERE id = $2",
            [normalizedQuery, query.id]
          );
          
          updatedCount++;
        }
        
        processedCount++;
        
        // Log progress
        if (processedCount % 20 === 0 || processedCount === queries.length) {
          console.log(`Processed ${processedCount}/${queries.length} queries, Updated: ${updatedCount}, Merged: ${mergedCount}`);
        }
      }
    }
    
    console.log(`\nNormalization complete!`);
    console.log(`Total queries processed: ${processedCount}`);
    console.log(`Queries updated with normalization: ${updatedCount}`);
    console.log(`Duplicate queries merged: ${mergedCount}`);
    
  } catch (error) {
    console.error('Error normalizing queries:', error);
  } finally {
    // Close database connection
    await pool.end();
    process.exit(0);
  }
}

// Run the script
normalizeExistingQueries(); 