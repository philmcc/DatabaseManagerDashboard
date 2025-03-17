import { db } from "@/db";
import { normalizedQueries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getAuth } from "@/lib/auth";

// Added version for debugging
const API_VERSION = "1.0.2";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    logger.info(`POST request received for mark-query-known v${API_VERSION}`, { 
      databaseId: params.id,
      url: req.url
    });
    
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestBody = await req.json();
    logger.info('Request body parsed successfully', { body: requestBody });
    
    const { queryId, isKnown } = requestBody;
    
    if (!queryId) {
      return NextResponse.json({ error: 'Missing queryId parameter' }, { status: 400 });
    }
    
    logger.info(`Marking query ${queryId} as ${isKnown ? 'known' : 'unknown'}`);
    
    // Update the database - now using normalizedQueries table
    const result = await db.update(normalizedQueries)
      .set({
        isKnown: isKnown === true,
        updatedAt: new Date()
      })
      .where(eq(normalizedQueries.id, queryId))
      .returning();
    
    logger.info(`Successfully updated ${result.length} rows for query ${queryId}`);
    
    // Return success response with version
    return NextResponse.json({ 
      success: true,
      rowsUpdated: result.length,
      version: API_VERSION
    });
    
  } catch (error) {
    logger.error('Error marking query as known:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update query', 
        details: String(error),
        version: API_VERSION
      }, 
      { status: 500 }
    );
  }
} 