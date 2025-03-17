import { db } from "@/db";
import { normalizedQueries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getAuth } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    logger.info(`Direct query-mark-known endpoint called`, { url: req.url });
    
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let requestBody;
    try {
      requestBody = await req.json();
      logger.info('Request body parsed successfully', { body: requestBody });
    } catch (error) {
      logger.error('Failed to parse JSON body', { error });
      return NextResponse.json({ 
        error: "Invalid JSON", 
        details: String(error) 
      }, { status: 400 });
    }
    
    const { queryId, isKnown, databaseId } = requestBody;
    
    if (!queryId || databaseId === undefined) {
      return NextResponse.json({ 
        error: "Missing required parameters", 
        requiredParams: ['queryId', 'databaseId'] 
      }, { status: 400 });
    }
    
    logger.info(`Processing mark as known request`, { 
      queryId, 
      isKnown: Boolean(isKnown), 
      databaseId 
    });
    
    try {
      // Update the database using normalizedQueries table
      const result = await db.update(normalizedQueries)
        .set({
          isKnown: Boolean(isKnown),
          updatedAt: new Date()
        })
        .where(eq(normalizedQueries.id, queryId))
        .returning();
      
      logger.info(`Successfully updated ${result.length} rows for query ${queryId}`);
      
      return NextResponse.json({ 
        success: true,
        rowsUpdated: result.length,
        message: `Query ${queryId} has been marked as ${isKnown ? 'known' : 'unknown'}`,
        timestamp: new Date().toISOString()
      });
    } catch (dbError) {
      logger.error('Database error', { error: dbError });
      return NextResponse.json({ 
        error: "Database operation failed", 
        details: String(dbError) 
      }, { status: 500 });
    }
  } catch (error) {
    logger.error('Unexpected error', { error });
    return NextResponse.json({ 
      error: "Server error", 
      details: String(error) 
    }, { status: 500 });
  }
} 