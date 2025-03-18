import express from 'express';
import { db } from '../../../db/index.js';
import { queryMonitoringConfigs, queryGroups, normalizedQueries, collectedQueries, databaseOperationLogs, databaseConnections, querySamples } from '../../../db/schema.js';
import { eq, and, isNull, desc, gte, lte, sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { getDatabaseConnection } from '../../lib/database.js';
import crypto from 'crypto';
import queryMonitoringRouter from './query-monitoring.js';
import { requireAuth } from '../../middleware/auth.js';
import { normalizeAndHashQuery } from '../../utils/query-normalizer.js';

const router = express.Router();

// Create a more robust auth middleware
const robustAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // For development, allow requests without authentication
  if (process.env.NODE_ENV === 'development') {
    // Add a mock user for development
    req.user = {
      id: 1,
      username: 'dev',
      role: 'ADMIN'
    } as any;
    return next();
  }
  
  // For production, use the real auth middleware
  return requireAuth(req, res, next);
};

// Create insert schemas
const insertCollectedQuerySchema = createInsertSchema(collectedQueries);

// Get query monitoring config
router.get('/:id/query-monitoring/config', async (req, res) => {
  try {
    const databaseId = parseInt(req.params.id);
    
    // Get current configuration
    const config = await db.query.queryMonitoringConfigs.findFirst({
      where: eq(queryMonitoringConfigs.databaseId, databaseId)
    });
    
    if (!config) {
      return res.json({ 
        isActive: false, 
        intervalMinutes: 15,
        lastRunAt: null
      });
    }
    
    return res.json(config);
  } catch (error) {
    console.error('Error fetching query monitoring config:', error);
    return res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// Update query monitoring config
router.post('/:id/query-monitoring/config', async (req, res) => {
  try {
    const databaseId = parseInt(req.params.id);
    const { isActive, intervalMinutes } = req.body;
    
    // Check if config exists
    const existingConfig = await db.query.queryMonitoringConfigs.findFirst({
      where: eq(queryMonitoringConfigs.databaseId, databaseId)
    });
    
    if (existingConfig) {
      // Update existing config
      await db.update(queryMonitoringConfigs)
        .set({ 
          isActive, 
          intervalMinutes,
          updatedAt: new Date()
        })
        .where(eq(queryMonitoringConfigs.id, existingConfig.id));
    } else {
      // Create new config
      await db.insert(queryMonitoringConfigs).values({
        databaseId,
        isActive,
        intervalMinutes,
        userId: req.user?.id || 1, // Default to user 1 if auth not implemented
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating query monitoring config:', error);
    return res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// Start monitoring
router.post('/:id/query-monitoring/start', async (req, res) => {
  try {
    const databaseId = parseInt(req.params.id);
    
    // Check if the database exists and user has access
    const database = await db.query.databaseConnections.findFirst({
      where: eq(databaseConnections.id, databaseId)
    });

    if (!database) {
      return res.status(404).json({ error: 'Database not found' });
    }

    // Check if there's already an active monitoring config
    const existingConfig = await db.query.queryMonitoringConfigs.findFirst({
      where: and(
        eq(queryMonitoringConfigs.databaseId, databaseId),
        eq(queryMonitoringConfigs.isActive, true)
      )
    });

    let configId;
    if (existingConfig) {
      configId = existingConfig.id;
      await db.update(queryMonitoringConfigs)
        .set({
          updatedAt: new Date()
        })
        .where(eq(queryMonitoringConfigs.id, configId));
    } else {
      // Create a new monitoring config
      const [newConfig] = await db.insert(queryMonitoringConfigs)
        .values({
          databaseId,
          isActive: true,
          intervalMinutes: 15,
          userId: 1, // Default system user for now
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      configId = newConfig.id;
    }

    // Start the monitoring process
    // This would normally be a background job, but for simplicity we'll do it synchronously
    try {
      const { connection: dbConnection, cleanup } = await getDatabaseConnection(databaseId);
      
      try {
        // Check if pg_stat_statements extension is available
        const extensionResult = await dbConnection.query(
          "SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements'"
        );
        
        if (extensionResult.rows.length === 0) {
          await cleanup();
          return res.status(400).json({ 
            error: 'pg_stat_statements extension is not installed',
            message: 'Please install pg_stat_statements extension in your database'
          });
        }
        
        // Get queries from pg_stat_statements
        const queriesResult = await dbConnection.query(`
          SELECT 
            query, 
            calls, 
            total_exec_time, 
            min_exec_time,
            max_exec_time,
            mean_exec_time
          FROM 
            pg_stat_statements 
          WHERE 
            query NOT LIKE '%pg_stat_statements%'
          ORDER BY 
            total_exec_time DESC 
          LIMIT 100
        `);

        // Process and store queries
        let processedCount = 0;
        const now = new Date();
        
        for (const row of queriesResult.rows) {
          const queryText = row.query;
          
          // Use the query normalization utility
          const { normalizedQuery: normalizedText, normalizedHash } = normalizeAndHashQuery(queryText);
          const queryHash = crypto.createHash('md5').update(queryText).digest('hex');
          
          // Check if this normalized query already exists
          let normalizedQueryId;
          const existingNormalized = await db.query.normalizedQueries.findFirst({
            where: and(
              eq(normalizedQueries.normalizedHash, normalizedHash),
              eq(normalizedQueries.databaseId, databaseId)
            )
          });
          
          if (existingNormalized) {
            // Update the last seen timestamp
            normalizedQueryId = existingNormalized.id;
            await db.update(normalizedQueries)
              .set({
                lastSeenAt: now,
                updatedAt: now
              })
              .where(eq(normalizedQueries.id, normalizedQueryId));
          } else {
            // Create a new normalized query record
            const [newNormalized] = await db.insert(normalizedQueries)
              .values({
                databaseId,
                normalizedText,
                normalizedHash,
                firstSeenAt: now,
                lastSeenAt: now,
                isKnown: false,
                groupId: null,
                distinctQueryCount: 0,
                instanceCount: 0,
                createdAt: now,
                updatedAt: now
              })
              .returning();
            
            normalizedQueryId = newNormalized.id;
          }
          
          // Check if this exact query was already collected (by query hash)
          const existingCollected = await db.query.collectedQueries.findFirst({
            where: and(
              eq(collectedQueries.queryHash, queryHash),
              eq(collectedQueries.databaseId, databaseId)
            )
          });
          
          if (existingCollected) {
            // Update the existing collected query with new stats
            await db.update(collectedQueries)
              .set({
                calls: row.calls,
                totalTime: row.total_exec_time,
                minTime: row.min_exec_time,
                maxTime: row.max_exec_time,
                meanTime: row.mean_exec_time,
                lastUpdatedAt: now
              })
              .where(eq(collectedQueries.id, existingCollected.id));
          } else {
            // Store a new collected query
            const insertData = insertCollectedQuerySchema.parse({
              normalizedQueryId: normalizedQueryId,
              databaseId,
              queryText,
              queryHash,
              calls: row.calls,
              totalTime: row.total_exec_time,
              minTime: row.min_exec_time,
              maxTime: row.max_exec_time,
              meanTime: row.mean_exec_time,
              collectedAt: now,
              lastUpdatedAt: now
            });
            
            await db.insert(collectedQueries).values(insertData);
            
            processedCount++;
          }
        }
        
        await cleanup();
        return res.json({ 
          success: true, 
          processedQueries: queriesResult.rows.length,
          newQueries: processedCount
        });
      } catch (error) {
        await cleanup();
        throw error;
      }
    } catch (error) {
      console.error(`Error accessing database ${databaseId}:`, error);
      return res.status(500).json({ 
        error: 'Failed to access database',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Error starting monitoring:', error);
    return res.status(500).json({ 
      error: 'Failed to start monitoring',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
    });
  }
});

// Get query groups
router.get('/:id/query-groups', async (req, res) => {
  try {
    const databaseId = parseInt(req.params.id);
    
    const groups = await db.query.queryGroups.findMany({
      where: eq(queryGroups.databaseId, databaseId)
    });
    
    return res.json(groups);
  } catch (error) {
    console.error('Error fetching query groups:', error);
    return res.status(500).json({ error: 'Failed to fetch query groups' });
  }
});

// Create query group
router.post('/:id/query-groups', async (req, res) => {
  try {
    const databaseId = parseInt(req.params.id);
    const { name, description, isKnown } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    const newGroup = await db.insert(queryGroups).values({
      databaseId,
      name,
      description: description || null,
      isKnown: isKnown || false,
      userId: req.user?.id || 1, // Default to user 1 if auth not implemented
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    return res.json(newGroup[0]);
  } catch (error) {
    console.error('Error creating query group:', error);
    return res.status(500).json({ error: 'Failed to create query group' });
  }
});

// Get discovered queries
router.get('/:id/discovered-queries', async (req, res) => {
  try {
    const databaseId = parseInt(req.params.id);
    const showKnown = req.query.showKnown === 'true';
    const groupId = req.query.groupId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const search = req.query.search as string;
    
    console.log(`API route: Fetching discovered queries with filters:`, {
      databaseId,
      showKnown,
      groupId,
      startDate,
      endDate,
      search
    });
    
    // Use the aggregated_query_stats view for better performance
    const query = sql`
      SELECT 
        nq.id,
        nq.database_id as "databaseId",
        nq.normalized_text as "normalizedText",
        nq.normalized_hash as "normalizedHash",
        nq.is_known as "isKnown",
        nq.group_id as "groupId",
        nq.first_seen_at as "firstSeenAt",
        nq.last_seen_at as "lastSeenAt",
        COUNT(cq.id) as "instanceCount",
        SUM(cq.calls) as "callCount",
        SUM(cq.total_time) as "totalTime",
        MIN(cq.min_time) as "minTime",
        MAX(cq.max_time) as "maxTime",
        CASE WHEN SUM(cq.calls) > 0 
          THEN SUM(cq.total_time) / SUM(cq.calls) 
          ELSE 0 
        END as "meanTime",
        MAX(cq.last_updated_at) as "lastUpdatedAt",
        (
          SELECT cq2.query_text
          FROM collected_queries cq2
          WHERE cq2.normalized_query_id = nq.id
          ORDER BY cq2.last_updated_at DESC
          LIMIT 1
        ) as "queryText"
      FROM 
        normalized_queries nq
      LEFT JOIN 
        collected_queries cq ON nq.id = cq.normalized_query_id
      WHERE 
        nq.database_id = ${databaseId}
    `;
    
    // Build the WHERE clause based on filters
    let conditions = [];
    
    // Filter by known status
    if (!showKnown) {
      conditions.push(sql`nq.is_known = false`);
    }
    
    // Filter by group
    if (groupId === 'ungrouped') {
      conditions.push(sql`nq.group_id IS NULL`);
    } else if (groupId && groupId !== 'all_queries') {
      conditions.push(sql`nq.group_id = ${parseInt(groupId)}`);
    }
    
    // Filter by date range
    if (startDate) {
      try {
        const parsedStartDate = new Date(startDate);
        if (!isNaN(parsedStartDate.getTime())) {
          conditions.push(sql`nq.last_seen_at >= ${parsedStartDate}`);
        }
      } catch (error) {
        console.error(`Error parsing start date: ${startDate}`, error);
      }
    }
    
    if (endDate) {
      try {
        const parsedEndDate = new Date(endDate);
        if (!isNaN(parsedEndDate.getTime())) {
          conditions.push(sql`nq.last_seen_at <= ${parsedEndDate}`);
        }
      } catch (error) {
        console.error(`Error parsing end date: ${endDate}`, error);
      }
    }
    
    // Add search filter
    if (search && search.trim()) {
      try {
        const searchPattern = `%${search.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
        conditions.push(sql`
          EXISTS (
            SELECT 1 FROM collected_queries cq_search 
            WHERE cq_search.normalized_query_id = nq.id 
            AND cq_search.query_text ILIKE ${searchPattern}
          )
        `);
      } catch (error) {
        console.error(`Error applying search filter: ${search}`, error);
      }
    }
    
    // Combine all conditions
    let whereClause = '';
    if (conditions.length > 0) {
      whereClause = ' AND ' + conditions.map(c => `(${c})`).join(' AND ');
    }
    
    // Complete the query
    const fullQuery = sql`
      ${query}${sql.raw(whereClause)}
      GROUP BY 
        nq.id, 
        nq.database_id,
        nq.normalized_text,
        nq.normalized_hash,
        nq.is_known,
        nq.group_id,
        nq.first_seen_at,
        nq.last_seen_at
      ORDER BY MAX(cq.last_updated_at) DESC
      LIMIT 100
    `;
    
    // Execute the query
    const results = await db.execute(fullQuery);
    
    console.log(`Found ${results.rows.length} queries matching filters`);
    
    // Set cache control headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.json(results.rows);
  } catch (error) {
    console.error('Error fetching discovered queries:', error);
    return res.status(500).json({ error: 'Failed to fetch queries' });
  }
});

// Update discovered query
router.patch('/:id/discovered-queries', async (req, res) => {
  try {
    const { queryId, isKnown, groupId } = req.body;
    
    if (!queryId) {
      return res.status(400).json({ error: 'Missing queryId parameter' });
    }
    
    const updateData: Partial<typeof normalizedQueries.$inferInsert> = {
      updatedAt: new Date()
    };
    
    if (isKnown !== undefined) {
      updateData.isKnown = isKnown;
    }
    
    if (groupId !== undefined) {
      updateData.groupId = groupId === null ? null : groupId;
    }
    
    await db.update(normalizedQueries)
      .set(updateData)
      .where(eq(normalizedQueries.id, queryId));
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating discovered query:', error);
    return res.status(500).json({ error: 'Failed to update query' });
  }
});

// Mount the query monitoring routes
router.use('/:id/query-monitoring', queryMonitoringRouter);

// Add these routes to the router
router.post('/:id/test', requireAuth, async (req, res) => {
  // Implementation from routes.ts
});

router.get('/:id/metrics', requireAuth, async (req, res) => {
  // Implementation from routes.ts
});

router.post('/:id/kill-query', requireAuth, async (req, res) => {
  // Implementation from routes.ts
});

// Save query sample
router.post('/:id/query-samples', robustAuth, async (req, res) => {
  try {
    const databaseId = parseInt(req.params.id);
    const { queryText, username, applicationName, clientAddr, queryStart, duration } = req.body;

    // Validate required fields
    if (!queryText || !username || !applicationName || !clientAddr || !queryStart || !duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Normalize and hash the query
    const { normalizedQuery: normalizedText, normalizedHash } = normalizeAndHashQuery(queryText);
    const queryHash = crypto.createHash('md5').update(queryText).digest('hex');

    // Find or create normalized query
    let normalizedQueryId;
    const existingNormalizedQuery = await db.query.normalizedQueries.findFirst({
      where: eq(normalizedQueries.normalizedHash, normalizedHash)
    });

    if (existingNormalizedQuery) {
      normalizedQueryId = existingNormalizedQuery.id;
    } else {
      const [newNormalizedQuery] = await db.insert(normalizedQueries)
        .values({
          databaseId,
          normalizedText,
          normalizedHash,
          isKnown: false,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      normalizedQueryId = newNormalizedQuery.id;
    }

    // Insert query sample
    const [querySample] = await db.insert(querySamples)
      .values({
        normalizedQueryId,
        databaseId,
        queryText,
        queryHash,
        username,
        applicationName,
        clientAddr,
        queryStart: new Date(queryStart),
        duration: duration.toString(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    // Log the operation
    await db.insert(databaseOperationLogs).values({
      databaseId,
      userId: req.user?.id,
      operationType: 'SAVE_QUERY_SAMPLE',
      operationResult: 'success',
      details: {
        querySampleId: querySample.id,
        normalizedQueryId
      }
    });

    res.json(querySample);
  } catch (error) {
    console.error('Error in saveQuerySample:', error);
    res.status(500).json({ error: 'Failed to save query sample' });
  }
});

export default router; 