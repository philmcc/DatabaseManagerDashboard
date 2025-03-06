import express from "express";
import databasesRouter from "./api/databases";

export function registerRoutes(app: express.Express) {
  // Add this before registering the routes
  app.use('/api', (req, res, next) => {
    console.log(`[DEBUG] API REQUEST: ${req.method} ${req.path}`);
    
    // Track response
    const originalSend = res.send;
    res.send = function(body) {
      console.log(`[DEBUG] API RESPONSE: ${res.statusCode} for ${req.method} ${req.path}`);
      if (typeof body === 'string' && body.length < 500) {
        console.log(`[DEBUG] Response body: ${body}`);
      } else {
        console.log(`[DEBUG] Response body too large to log`);
      }
      return originalSend.call(this, body);
    };
    
    next();
  });
  
  // Register the databases API routes
  app.use('/api/databases', databasesRouter);
  
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
  
  // Return the app for chaining
  return app;
} 