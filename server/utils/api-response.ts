import { Response } from 'express';

export function apiSuccess(res: Response, data: any, status = 200) {
  return res.status(status).json({
    success: true,
    data
  });
}

export function apiError(res: Response, message: string, status = 500, details?: any) {
  return res.status(status).json({
    success: false,
    message,
    details: details || undefined
  });
} 