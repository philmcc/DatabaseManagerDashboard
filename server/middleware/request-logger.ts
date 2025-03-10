import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Middleware to filter and log important requests
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Skip logging for static files and development assets
  const path = req.path;
  
  // Add to the skipPaths list:
  const skipPaths = [
    '/@', 
    '/src/',
    '/node_modules/',
    // Add patterns for auth endpoints that log too much
    '/api/user',
    '/api/auth/check'
  ];
  
  // Skip common static files and Vite development assets
  if (
    skipPaths.some(pattern => path.startsWith(pattern)) ||
    path.includes('.js') ||
    path.includes('.css') ||
    path.includes('.ico') ||
    path.includes('.png') ||
    path.includes('.svg') ||
    path.includes('.woff') ||
    path.includes('favicon')
  ) {
    return next();
  }
  
  // Use our custom logger for API and important endpoints
  if (path.startsWith('/api/')) {
    logger.api(req);
    
    // Track response status
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
      logger.api(req, res.statusCode);
      return originalEnd.call(this, chunk, encoding);
    };
  } else {
    // For non-API routes, just log info without response tracking
    logger.info(`Request: ${req.method} ${path}`);
  }
  
  next();
} 