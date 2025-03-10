import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { rateLimitLog } from '../utils/log-limiter';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    // Rate limit authentication failure logs
    rateLimitLog(`auth-failed-${req.path}`, () => {
      logger.info(`Auth failed for ${req.path}`);
    });
    
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && req.user.role === 'ADMIN') {
    return next();
  }
  
  if (req.isAuthenticated() && req.user) {
    logger.warn(`Unauthorized admin access attempt by ${req.user.username}`);
  } else {
    logger.info(`Admin access denied (not authenticated)`);
  }
  
  return res.status(403).json({
    success: false,
    message: 'Admin access required'
  });
}

export function requireWriter(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && (req.user.role === 'ADMIN' || req.user.role === 'WRITER')) {
    return next();
  }
  
  if (req.isAuthenticated() && req.user) {
    logger.warn(`Unauthorized writer access attempt by ${req.user.username}`);
  }
  
  return res.status(403).json({
    success: false,
    message: 'Writer access required'
  });
} 