import express, { Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { db } from '../../db/index.js';
import { logger } from '../../utils/logger.js';
import { startQueryMonitoring, stopQueryMonitoring, getMonitoringSessionStatus, getQueryExamples } from '../../services/queryMonitoring.js';
import { queryMonitoringSessions, queryExamples } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = express.Router({ mergeParams: true });

// Start query monitoring for a specific database
router.post('/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string }; // Database ID from the URL
    const { pollingIntervalSeconds, scheduledEndTime } = req.body;
    
    logger.info(`Starting query monitoring for database ${id}`, { 
      pollingIntervalSeconds, 
      scheduledEndTime,
      userId: (req as any).user?.id 
    });
    
    const session = await startQueryMonitoring(
      parseInt(id),
      (req as any).user!.id,
      pollingIntervalSeconds,
      scheduledEndTime ? new Date(scheduledEndTime) : undefined
    );
    
    return res.json({
      success: true,
      message: 'Query monitoring started',
      session
    });
  } catch (error: any) {
    logger.error(`Query monitoring error: ${error.message}`, { databaseId: req.params.id });
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to start query monitoring'
    });
  }
});

// Stop query monitoring
router.post('/stop/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params as { sessionId: string };
    
    logger.info(`Stopping query monitoring session ${sessionId}`);
    
    await stopQueryMonitoring(parseInt(sessionId));
    
    return res.json({
      success: true,
      message: 'Query monitoring stopped'
    });
  } catch (error: any) {
    logger.error(`Error stopping query monitoring: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to stop query monitoring'
    });
  }
});

// Get monitoring session status
router.get('/status/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params as { sessionId: string };
    
    const status = await getMonitoringSessionStatus(parseInt(sessionId));
    
    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Monitoring session not found'
      });
    }
    
    return res.json({
      success: true,
      status
    });
  } catch (error: any) {
    logger.error(`Error fetching monitoring status: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch monitoring status'
    });
  }
});

// Get query examples for a normalized query
router.get('/examples/:normalizedQueryId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { normalizedQueryId } = req.params as { normalizedQueryId: string };
    
    const examples = await getQueryExamples(parseInt(normalizedQueryId));
    
    return res.json({
      success: true,
      examples
    });
  } catch (error: any) {
    logger.error(`Error fetching query examples: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch query examples'
    });
  }
});

// Get all monitoring sessions for a database
router.get('/sessions/:databaseId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { databaseId } = req.params as { databaseId: string };
    
    const sessions = await db.query.queryMonitoringSessions.findMany({
      where: eq(queryMonitoringSessions.databaseId, parseInt(databaseId)),
      orderBy: [desc(queryMonitoringSessions.createdAt)]
    });
    
    return res.json({
      success: true,
      sessions
    });
  } catch (error: any) {
    logger.error(`Error fetching monitoring sessions: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch monitoring sessions'
    });
  }
});

export default router; 