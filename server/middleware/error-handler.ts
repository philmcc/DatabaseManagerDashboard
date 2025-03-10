import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Log error
  console.error('API Error:', err);
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      details: err.message
    });
  }
  
  // Handle database errors
  if (err.code && (err.code.startsWith('23') || err.code.startsWith('42'))) {
    return res.status(400).json({
      success: false,
      message: 'Database Error',
      details: err.message
    });
  }
  
  // Default error response
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  return res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
} 