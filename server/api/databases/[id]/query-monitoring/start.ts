import { db } from "@/db";
import { queryMonitoringConfigs, discoveredQueries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getAuth } from "@/lib/auth";
import { getDatabaseConnection } from "@/lib/database";
import { sql } from "drizzle-orm";
import crypto from 'crypto';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return new Response("Unauthorized", { status: 401 });
    }

    const databaseId = parseInt(params.id);
    
    // Get monitoring configuration
    const config = await db.query.queryMonitoringConfigs.findFirst({
      where: eq(queryMonitoringConfigs.databaseId, databaseId)
    });
    
    if (!config || !config.isActive) {
      return new Response(
        JSON.stringify({ error: 'Query monitoring is not enabled for this database' }), 
        { status: 400 }
      );
    }
    
    // Start background task to monitor queries
    setTimeout(() => monitorQueries(databaseId, config.id), 0);
    
    return NextResponse.json({ success: true, message: "Query monitoring started" });
  } catch (error) {
    logger.error('Error starting query monitoring:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to start query monitoring' }), 
      { status: 500 }
    );
  }
}

async function monitorQueries(databaseId: number, configId: number) {
  try {
    // Check if monitoring is still enabled
    const config = await db.query.queryMonitoringConfigs.findFirst({
      where: eq(queryMonitoringConfigs.id, configId)
    });
    
    if (!config || !config.isActive) {
      logger.info(`Query monitoring for database ${databaseId} is disabled, stopping`);
      return;
    }
    
    logger.info(`Running query monitoring for database ${databaseId}`);
    
    // Get database connection
    const { connection, cleanup } = await getDatabaseConnection(databaseId);
    
    try {
      await connection.connect();
      
      // Query pg_stat_statements for active queries
      const result = await connection.query(`
        SELECT 
          query,
          calls,
          total_exec_time,
          min_exec_time,
          max_exec_time,
          mean_exec_time
        FROM pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
        ORDER BY total_exec_time DESC
        LIMIT 1000;
      `);
      
      // Process each query
      for (const row of result.rows) {
        const queryText = row.query;
        
        // Generate a hash of the query for comparison
        const queryHash = crypto.createHash('md5').update(queryText).digest('hex');
        
        // Check if query already exists
        const existingQuery = await db.query.discoveredQueries.findFirst({
          where: eq(discoveredQueries.queryHash, queryHash)
        });
        
        if (existingQuery) {
          // Update existing query statistics
          await db.update(discoveredQueries)
            .set({
              lastSeenAt: new Date(),
              callCount: row.calls,
              totalTime: row.total_exec_time,
              minTime: row.min_exec_time,
              maxTime: row.max_exec_time,
              meanTime: row.mean_exec_time,
              updatedAt: new Date()
            })
            .where(eq(discoveredQueries.id, existingQuery.id));
        } else {
          // Insert new query
          await db.insert(discoveredQueries).values({
            databaseId,
            queryText,
            queryHash,
            normalizedQuery: null, // We'll implement query normalization later
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            callCount: row.calls,
            totalTime: row.total_exec_time,
            minTime: row.min_exec_time,
            maxTime: row.max_exec_time,
            meanTime: row.mean_exec_time,
            isKnown: false,
            groupId: null,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          logger.info(`Discovered new query: ${queryText.substring(0, 100)}...`);
        }
      }
      
      // Update last run time
      await db.update(queryMonitoringConfigs)
        .set({
          lastRunAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(queryMonitoringConfigs.id, configId));
      
      // Schedule next run
      setTimeout(() => monitorQueries(databaseId, configId), config.intervalMinutes * 60 * 1000);
      
    } finally {
      if (cleanup) {
        await cleanup();
      }
    }
  } catch (error) {
    logger.error(`Error monitoring queries for database ${databaseId}:`, error);
    
    // Try again in the configured interval
    const config = await db.query.queryMonitoringConfigs.findFirst({
      where: eq(queryMonitoringConfigs.id, configId)
    });
    
    if (config && config.isActive) {
      setTimeout(() => monitorQueries(databaseId, configId), config.intervalMinutes * 60 * 1000);
    }
  }
} 