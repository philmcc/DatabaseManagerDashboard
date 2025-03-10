import express from 'express';
import { db } from '@/db';
import { queryMonitoringConfigs, queryGroups, discoveredQueries } from '@/db/schema';
import { eq, and, isNull, desc, gte, lte, sql } from 'drizzle-orm';
import { getDatabaseConnection } from '@/lib/database';
import crypto from 'crypto';
import queryMonitoringRouter from './query-monitoring';
import { requireAuth } from '@/lib/auth';

const router = express.Router();

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
    
    // Log the action
    console.log(`Starting query monitoring for database ${databaseId}`);
    
    // Get the monitoring config
    const config = await db.query.queryMonitoringConfigs.findFirst({
      where: eq(queryMonitoringConfigs.databaseId, databaseId)
    });
    
    // If config doesn't exist, create a default one
    if (!config) {
      console.log(`No monitoring config found for database ${databaseId}, creating default`);
      
      const result = await db.insert(queryMonitoringConfigs).values({
        databaseId,
        isActive: true,
        intervalMinutes: 15,
        userId: req.user?.id || 1, // Default to user 1 if auth not implemented
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      console.log('Created default monitoring config:', result);
    }
    
    if (!config.isActive) {
      return res.status(400).json({ error: 'Monitoring is not active for this database' });
    }
    
    // Update last run time
    await db.update(queryMonitoringConfigs)
      .set({ lastRunAt: new Date() })
      .where(eq(queryMonitoringConfigs.id, config.id));
    
    // Start the monitoring process
    // This would normally be a background job, but for simplicity we'll do it synchronously
    try {
      const dbConnection = await getDatabaseConnection(databaseId);
      
      // Check if pg_stat_statements extension is available
      const extensionResult = await dbConnection.query(
        "SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements'"
      );
      
      if (extensionResult.rows.length === 0) {
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
      
      for (const row of queriesResult.rows) {
        const queryText = row.query;
        
        // Generate a hash for the query
        const queryHash = crypto
          .createHash('md5')
          .update(queryText)
          .digest('hex');
        
        // Check if query exists
        const existingQuery = await db.query.discoveredQueries.findFirst({
          where: eq(discoveredQueries.queryHash, queryHash)
        });
        
        if (existingQuery) {
          // Update existing query
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
          // Create new query
          await db.insert(discoveredQueries).values({
            databaseId,
            queryText,
            queryHash,
            normalizedQuery: null, // We could implement query normalization here
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
          
          processedCount++;
        }
      }
      
      return res.json({ 
        success: true, 
        processedQueries: queriesResult.rows.length,
        newQueries: processedCount
      });
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
    
    let whereConditions = eq(discoveredQueries.databaseId, databaseId);
    
    // Filter by known status
    if (!showKnown) {
      whereConditions = and(
        whereConditions,
        eq(discoveredQueries.isKnown, false)
      );
    }
    
    // Filter by group
    if (groupId === 'ungrouped') {
      whereConditions = and(
        whereConditions,
        isNull(discoveredQueries.groupId)
      );
    } else if (groupId && groupId !== 'all_queries') {
      whereConditions = and(
        whereConditions,
        eq(discoveredQueries.groupId, parseInt(groupId))
      );
    }
    
    // Filter by date range
    if (startDate) {
      try {
        const parsedStartDate = new Date(startDate);
        if (!isNaN(parsedStartDate.getTime())) {
          whereConditions = and(
            whereConditions,
            gte(discoveredQueries.lastSeenAt, parsedStartDate)
          );
        }
      } catch (error) {
        console.error(`Error parsing start date: ${startDate}`, error);
      }
    }
    
    if (endDate) {
      try {
        const parsedEndDate = new Date(endDate);
        if (!isNaN(parsedEndDate.getTime())) {
          whereConditions = and(
            whereConditions,
            lte(discoveredQueries.lastSeenAt, parsedEndDate)
          );
        }
      } catch (error) {
        console.error(`Error parsing end date: ${endDate}`, error);
      }
    }
    
    // Add search filter
    if (search && search.trim()) {
      try {
        const searchPattern = `%${search.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
        whereConditions = and(
          whereConditions,
          sql`${discoveredQueries.queryText}::text ILIKE ${searchPattern}`
        );
        console.log(`Applied search filter with pattern: ${searchPattern}`);
      } catch (error) {
        console.error(`Error applying search filter: ${search}`, error);
      }
    }
    
    // Order by last seen
    const results = await db.select()
      .from(discoveredQueries)
      .where(whereConditions)
      .orderBy(desc(discoveredQueries.lastSeenAt))
      .limit(100);
    
    console.log(`Found ${results.length} queries matching filters`);
    
    // Set cache control headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.json(results);
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
    
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (isKnown !== undefined) {
      updateData.isKnown = isKnown;
    }
    
    if (groupId !== undefined) {
      updateData.groupId = groupId === null ? null : groupId;
    }
    
    await db.update(discoveredQueries)
      .set(updateData)
      .where(eq(discoveredQueries.id, queryId));
    
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

export default router; 