import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic, log } from "./vite.js";
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { logger } from './utils/logger.js';
import { db } from "../db/index.js";
import { normalizedQueries } from "../db/schema.js";
import { eq } from "drizzle-orm";
import databaseRoutes from './routes/api/databases.js';
import { setupAuth } from './auth.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Set up authentication before routes
setupAuth(app);

app.use(requestLogger);

// Mount API routes
app.use('/api/databases', databaseRoutes);

// Add explicit route for marking queries as known/unknown
// This needs to be before any catch-all routes
app.post("/api/databases/:id/mark-query-known", async (req, res) => {
  try {
    const databaseId = req.params.id;
    const { queryId, isKnown } = req.body;
    
    logger.info(`API route: Marking query ${queryId} as ${isKnown ? 'known' : 'unknown'} for database ${databaseId}`);
    
    if (!queryId) {
      return res.status(400).json({ error: 'Missing queryId parameter' });
    }
    
    const updateTime = new Date();
    
    // Update only the normalizedQueries table (this is what the UI uses)
    const normalizedResult = await db.update(normalizedQueries)
      .set({
        isKnown: isKnown === true,
        updatedAt: updateTime
      })
      .where(eq(normalizedQueries.id, queryId))
      .returning();
      
    logger.info(`Updated normalized query table: ${normalizedResult.length} rows affected`);
    
    // If the update was successful, return success
    if (normalizedResult.length > 0) {
      logger.info(`Successfully updated query ${queryId}`);
      return res.json({ 
        success: true,
        normalizedUpdated: true,
      });
    } else {
      // If no rows were updated, return an error
      logger.warn(`Query ${queryId} not found in normalizedQueries table`);
      return res.status(404).json({ error: 'Query not found' });
    }
    
  } catch (error) {
    logger.error('Error marking query as known:', error);
    return res.status(500).json({ error: 'Failed to update query', details: String(error) });
  }
});

// Also add a direct endpoint as a fallback
app.post("/api/query-mark-known", async (req, res) => {
  try {
    const { queryId, isKnown, databaseId } = req.body;
    
    logger.info(`Direct API route: Marking query ${queryId} as ${isKnown ? 'known' : 'unknown'} for database ${databaseId}`);
    
    if (!queryId) {
      return res.status(400).json({ error: 'Missing queryId parameter' });
    }
    
    const updateTime = new Date();
    
    // Update only the normalizedQueries table (this is what the UI uses)
    const normalizedResult = await db.update(normalizedQueries)
      .set({
        isKnown: isKnown === true,
        updatedAt: updateTime
      })
      .where(eq(normalizedQueries.id, queryId))
      .returning();
      
    logger.info(`Updated normalized query table: ${normalizedResult.length} rows affected`);
    
    // If the update was successful, return success
    if (normalizedResult.length > 0) {
      logger.info(`Successfully updated query ${queryId}`);
      return res.json({ 
        success: true,
        normalizedUpdated: true,
      });
    } else {
      // If no rows were updated, return an error
      logger.warn(`Query ${queryId} not found in normalizedQueries table`);
      return res.status(404).json({ error: 'Query not found' });
    }
    
  } catch (error) {
    logger.error('Error marking query as known:', error);
    return res.status(500).json({ error: 'Failed to update query', details: String(error) });
  }
});

(async () => {
  const server = registerRoutes(app);

  app.use(errorHandler);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use the originally configured port, falling back to alternatives if needed
  const DEFAULT_PORT = process.env.PORT || 5001;
  const FALLBACK_PORTS = [5002, 5003, 5004, 5005];
  
  // Try the default port first, then fallbacks if needed
  function startServer(port: number, fallbacks: number[] = []) {
    server.listen(port, "0.0.0.0")
      .on("error", (err: any) => {
        if (err.code === 'EADDRINUSE') {
          // Port is in use
          logger.warn(`Port ${port} is already in use`);
          
          if (fallbacks.length > 0) {
            // Try the next port in the fallback list
            const nextPort = fallbacks[0];
            logger.info(`Trying port ${nextPort} instead...`);
            startServer(nextPort, fallbacks.slice(1));
          } else {
            // No more fallbacks available
            logger.error("All ports are in use. Please close other applications or specify a different port.");
            process.exit(1);
          }
        } else {
          // Some other error occurred
          logger.error(`Failed to start server: ${err.message}`);
          process.exit(1);
        }
      })
      .on("listening", () => {
        logger.info(`Server running on port ${port}`);
      });
  }
  
  // Start the server with fallback ports
  startServer(Number(DEFAULT_PORT), FALLBACK_PORTS);
})();
