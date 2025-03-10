import express from "express";
import { sql } from "drizzle-orm";
import databasesRouter from "./api/databases";
import authRouter from "./api/auth";
import usersRouter from "./api/users";
import clustersRouter from "./api/clusters";
import instancesRouter from "./api/instances";
import { logger } from "../utils/auth-logging";

export function registerRoutes(app: express.Express) {
  // We've moved request logging to the requestLogger middleware
  // No need for API logging middleware here anymore
  
  // Register API routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/databases', databasesRouter);
  app.use('/api/clusters', clustersRouter);
  app.use('/api/instances', instancesRouter);
  
  // Simple ping route for testing API connectivity
  app.get('/api/ping', (req, res) => {
    res.json({ message: 'pong' });
  });
  
  // Simple test endpoint to verify API functionality
  app.get('/api/test', (req, res) => {
    console.log('Test API endpoint called');
    res.json({ success: true, message: 'API is working correctly' });
  });
  
  // Add a debug endpoint to check table existence
  app.get('/api/debug/tables', async (req, res) => {
    try {
      const { db } = require('@/db');
      
      // Check if tables exist
      const tables = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      return res.json({ 
        tables: tables.rows.map(row => row.table_name),
        message: 'Tables retrieved successfully'
      });
    } catch (error) {
      console.error('Error checking tables:', error);
      return res.status(500).json({ 
        error: 'Failed to check tables',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Find and modify any authentication middleware
  const authMiddleware = (req, res, next) => {
    // Authentication check removed
    
    if (req.isAuthenticated()) {
      return next();
    }
    
    logger.warn(`Authentication failed for ${req.path}`);
    res.status(401).json({ message: 'Unauthorized' });
  };
  
  // Return the app for chaining
  return app;
} 