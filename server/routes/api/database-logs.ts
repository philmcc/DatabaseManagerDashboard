import express from 'express';
import { requireAuth } from '../../middleware/auth';
import { db } from '@db';
import { databaseOperationLogs } from '@db/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../../utils/logger';

const router = express.Router();

// Get database logs with filtering
router.get('/', requireAuth, async (req, res) => {
  // Authentication is handled by requireAuth middleware
  
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 100;
    const offset = (page - 1) * pageSize;
    const databaseId = req.query.databaseId ? parseInt(req.query.databaseId as string) : undefined;
    const tagId = req.query.tagId ? parseInt(req.query.tagId as string) : undefined;

    // Get database IDs accessible to the user
    const userDatabases = await db.select({
      id: databaseConnections.id
    })
      .from(databaseConnections)
      .where(
        req.user.role === 'ADMIN'
          ? undefined
          : eq(databaseConnections.userId, req.user.id)
      );

    const userDatabaseIds = userDatabases.map(db => db.id);

    // Build where conditions
    const conditions = [];

    // Always filter by accessible databases for non-admin users
    if (req.user.role !== 'ADMIN' && userDatabaseIds.length > 0) {
      conditions.push(sql`${databaseOperationLogs.databaseId} = ANY(${sql`ARRAY[${sql.join(userDatabaseIds, sql`, `)}]`})`);
    }

    // Add specific database filter if provided
    if (databaseId) {
      conditions.push(eq(databaseOperationLogs.databaseId, databaseId));
    }

    // Add tag filter if provided
    if (tagId) {
      conditions.push(eq(databaseOperationLogs.tagId, tagId));
    }

    // Combine conditions
    const whereClause = conditions.length > 0
      ? { where: sql.and(...conditions) }
      : {};

    // Query for total count
    const countResult = await db
      .select({ count: sql`COUNT(*)` })
      .from(databaseOperationLogs)
      .$dynamic(whereClause);

    const totalLogs = parseInt(countResult[0].count.toString());
    const totalPages = Math.ceil(totalLogs / pageSize);

    // Query for logs with pagination
    const logs = await db
      .select()
      .from(databaseOperationLogs)
      .$dynamic(whereClause)
      .orderBy(sql`${databaseOperationLogs.timestamp} DESC`)
      .limit(pageSize)
      .offset(offset);

    logger.debug(`Retrieved ${logs.length} database logs`);

    return res.json({
      logs,
      pagination: {
        page,
        pageSize,
        totalLogs,
        totalPages
      }
    });
  } catch (error) {
    logger.error(`Error fetching database logs: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch database logs'
    });
  }
});

export default router; 