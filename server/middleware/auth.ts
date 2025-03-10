import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  
  return res.status(401).json({
    success: false,
    message: 'Authentication required'
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && req.user.role === 'ADMIN') {
    return next();
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
  
  return res.status(403).json({
    success: false,
    message: 'Writer access required'
  });
} 