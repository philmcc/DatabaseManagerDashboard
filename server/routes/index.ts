import express from "express";
import databasesRouter from "./api/databases";

export function registerRoutes(app: express.Express) {
  // Other existing routes
  
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
  
  // Return the app for chaining
  return app;
} 