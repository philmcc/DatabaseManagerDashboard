import { Request } from 'express';
import { logger } from './logger';
import { safeLog } from './logger';

// Track auth failures to avoid spamming logs
const authFailures: Record<string, number> = {};

// Clear the cache every hour
setInterval(() => {
  Object.keys(authFailures).forEach(key => {
    delete authFailures[key];
  });
}, 60 * 60 * 1000);

/**
 * Use this instead of manual console.log for authentication debugging
 * Only logs failures with limited rate
 */
export function checkAuthentication(req: Request): boolean {
  const isAuthenticated = req.isAuthenticated();
  
  // Don't log successes at all
  if (isAuthenticated) {
    return true;
  }
  
  // Log failures with rate limiting
  const key = `auth-fail-${req.path}`;
  const now = Date.now();
  const lastLog = authFailures[key] || 0;
  
  if (now - lastLog > 60000) { // Only log once per minute per path
    logger.warn(`Authentication failed for ${req.path}`);
    authFailures[key] = now;
  }
  
  return false;
}

/**
 * Helper for routes that need authentication
 */
export function requireAuthAndContinue(req: Request, onFailure: () => any, onSuccess: () => any): any {
  if (!checkAuthentication(req)) {
    return onFailure();
  }
  return onSuccess();
} 