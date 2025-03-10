import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// This might be used in development to debug sessions
export function sessionDebug(req: Request, res: Response, next: NextFunction) {
  // In production or with LOG_LEVEL=info, this won't show up
  if (req.path.startsWith('/api/') && req.session) {
    logger.debug(`Session for ${req.path}: ${req.sessionID.substring(0, 8)}...`);
  }
  next();
} 