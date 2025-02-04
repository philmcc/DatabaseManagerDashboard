import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/db';
import { databaseOperationLogs } from '@/db/schema';
import { requireAuth } from '@/server/middlewares/requireAuth';

// Helper function to create a completely plain object with only primitive values
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  if (typeof obj !== 'object') {
    // Return primitive values as-is
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === null || value === undefined) {
      result[key] = null;
    } else if (typeof value === 'object') {
      result[key] = sanitizeObject(value);
    } else {
      // For primitive values (string, number, boolean)
      result[key] = value;
    }
  }
  return result;
}

export default requireAuth(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    console.log('Received operation log request:', {
      databaseId: req.params.id,
      body: req.body
    });

    const { databaseId, operationType, operationResult, details } = req.body;
    
    // First parse if it's a string
    let parsedDetails = details;
    if (typeof details === 'string') {
      try {
        parsedDetails = JSON.parse(details);
      } catch (e) {
        console.error('Failed to parse details string:', e);
        parsedDetails = {};
      }
    }

    // Sanitize the details into a plain object
    const sanitized = sanitizeObject(parsedDetails);
    // IMPORTANT: Force a fully plain object with no circular or inherited props
    const safeDetails = JSON.parse(JSON.stringify(sanitized));
    
    console.log('Sanitized details:', safeDetails);

    // Create a new object for the insert
    const logEntry = {
      databaseId: Number(databaseId),
      userId: req.user.id,
      operationType: String(operationType),
      operationResult: String(operationResult),
      details: safeDetails
    };

    console.log('Attempting to insert log entry:', logEntry);

    const result = await db.insert(databaseOperationLogs).values(logEntry);
    
    console.log('Successfully inserted log entry');
    
    return res.status(200).json({ 
      success: true,
      result
    });
  } catch (error: any) {
    console.error('Error in operation-log endpoint:', error);
    // Log the full error object for debugging
    console.error('Full error:', {
      message: error.message,
      stack: error.stack,
      details: error
    });
    return res.status(500).json({ 
      error: 'Failed to create operation log',
      details: error.message 
    });
  }
}); 