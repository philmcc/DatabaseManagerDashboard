/**
 * Normalize Existing Queries
 * 
 * This script updates all existing queries in the database with normalized versions
 * using the query normalizer utility. It helps in consolidating structurally identical
 * queries with different parameter counts.
 */

import 'dotenv/config';
import { db } from '../db/index.js';
import { discoveredQueries } from '../db/schema.js';
import { normalizeAndHashQuery } from '../server/utils/query-normalizer.js';
import { eq, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

async function normalizeExistingQueries() {
  console.log('Starting normalization of existing queries...');
  
  try {
    // Get all queries without normalization
    const queries = await db.query.discoveredQueries.findMany({
      where: isNull(discoveredQueries.normalizedQuery)
    });
    
    console.log(`Found ${queries.length} queries to normalize`);
    
    // Process queries in batches for better performance
    const batchSize = 100;
    let processedCount = 0;
    let updatedCount = 0;
    let mergedCount = 0;
    
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      
      for (const query of batch) {
        // Skip if already processed
        if (query.normalizedQuery) continue;
        
        // Normalize query
        const { normalizedQuery, normalizedHash } = normalizeAndHashQuery(query.queryText);
        
        // Check if a query with this normalized form already exists
        const existingNormalizedQuery = await db.query.discoveredQueries.findFirst({
          where: eq(discoveredQueries.normalizedQuery, normalizedQuery)
        });
        
        if (existingNormalizedQuery && existingNormalizedQuery.id !== query.id) {
          // Merge statistics and delete the duplicate
          await db.update(discoveredQueries)
            .set({
              callCount: existingNormalizedQuery.callCount + query.callCount,
              totalTime: sql`${existingNormalizedQuery.totalTime} + ${query.totalTime}`,
              minTime: sql`LEAST(${existingNormalizedQuery.minTime || 'NULL'}, ${query.minTime || 'NULL'})`,
              maxTime: sql`GREATEST(${existingNormalizedQuery.maxTime || 'NULL'}, ${query.maxTime || 'NULL'})`,
              firstSeenAt: new Date(Math.min(
                new Date(existingNormalizedQuery.firstSeenAt).getTime(), 
                new Date(query.firstSeenAt).getTime()
              )),
              lastSeenAt: new Date(Math.max(
                new Date(existingNormalizedQuery.lastSeenAt).getTime(), 
                new Date(query.lastSeenAt).getTime()
              )),
              updatedAt: new Date()
            })
            .where(eq(discoveredQueries.id, existingNormalizedQuery.id));
          
          // Delete the duplicate
          await db.delete(discoveredQueries)
            .where(eq(discoveredQueries.id, query.id));
          
          mergedCount++;
        } else {
          // Update the query with normalized form
          await db.update(discoveredQueries)
            .set({
              normalizedQuery,
              updatedAt: new Date()
            })
            .where(eq(discoveredQueries.id, query.id));
          
          updatedCount++;
        }
        
        processedCount++;
        
        // Log progress
        if (processedCount % 100 === 0 || processedCount === queries.length) {
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
    process.exit(0);
  }
}

// Run the script
normalizeExistingQueries(); 