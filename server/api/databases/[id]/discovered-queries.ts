import { db } from "@/db";
import { normalizedQueries } from "@/db/schema";
import { eq, and, isNull, desc, gte, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getAuth } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return new Response("Unauthorized", { status: 401 });
    }

    const databaseId = parseInt(params.id);
    const url = new URL(req.url);
    
    // Get filter parameters
    const showKnown = url.searchParams.get("showKnown") === "true";
    const groupId = url.searchParams.get("groupId");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const search = url.searchParams.get("search");
    
    // Log the received parameters
    logger.info('Fetching discovered queries with filters:', {
      databaseId,
      showKnown,
      groupId,
      startDate,
      endDate,
      search
    });
    
    // Build the base query
    let whereConditions = eq(normalizedQueries.databaseId, databaseId);
    
    // Filter by known status
    if (!showKnown) {
      whereConditions = and(
        whereConditions,
        eq(normalizedQueries.isKnown, false)
      );
    }
    
    // Filter by group
    if (groupId === 'ungrouped') {
      whereConditions = and(
        whereConditions,
        isNull(normalizedQueries.groupId)
      );
    } else if (groupId && groupId !== 'all_queries') {
      whereConditions = and(
        whereConditions,
        eq(normalizedQueries.groupId, parseInt(groupId))
      );
    }
    
    // Filter by date range
    if (startDate) {
      try {
        const parsedStartDate = new Date(startDate);
        if (!isNaN(parsedStartDate.getTime())) {
          whereConditions = and(
            whereConditions,
            gte(normalizedQueries.lastSeenAt, parsedStartDate)
          );
          logger.info(`Applied start date filter: ${parsedStartDate.toISOString()}`);
        } else {
          logger.warn(`Invalid start date format: ${startDate}`);
        }
      } catch (error) {
        logger.error(`Error parsing start date '${startDate}':`, error);
      }
    }
    
    if (endDate) {
      try {
        const parsedEndDate = new Date(endDate);
        if (!isNaN(parsedEndDate.getTime())) {
          whereConditions = and(
            whereConditions,
            lte(normalizedQueries.lastSeenAt, parsedEndDate)
          );
          logger.info(`Applied end date filter: ${parsedEndDate.toISOString()}`);
        } else {
          logger.warn(`Invalid end date format: ${endDate}`);
        }
      } catch (error) {
        logger.error(`Error parsing end date '${endDate}':`, error);
      }
    }
    
    // Search query text - add more robust search handling
    if (search && search.trim()) {
      try {
        // Properly escape wildcards for ILIKE
        const searchPattern = `%${search.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
        
        // Make sure we're using the right SQL construction for text search
        whereConditions = and(
          whereConditions,
          // Option 1: Using raw SQL for more control
          sql`(${normalizedQueries.normalizedText}::text ILIKE ${searchPattern})`
        );
        
        logger.info(`Applied search filter with pattern: ${searchPattern}`);
      } catch (error) {
        logger.error(`Error applying search filter '${search}':`, error);
      }
    }
    
    // Execute the query with all filters
    const results = await db.select()
      .from(normalizedQueries)
      .where(whereConditions)
      .orderBy(desc(normalizedQueries.lastSeenAt))
      .limit(100);
    
    // Log the query results
    logger.info(`Found ${results.length} queries matching filters`);
    
    // At the top of the GET function, add this to prevent browser caching
    const headers = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
    
    // And when returning the response:
    return new Response(JSON.stringify(results), {
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });
  } catch (error) {
    logger.error('Error fetching discovered queries:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch queries' }), 
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    logger.info('PATCH request received for discovered-queries', { 
      databaseId: params.id,
      url: req.url,
      method: req.method
    });
    
    // Log headers for debugging
    const headersObj: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headersObj[key] = value;
    });
    logger.info('Request headers:', headersObj);
    
    const auth = await getAuth();
    if (!auth) {
      logger.warn('Unauthorized attempt to update discovered query');
      return new Response(
        JSON.stringify({ error: "Unauthorized" }), 
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    let requestBody;
    let rawBody = '';
    try {
      // Clone the request to get the raw body as text first
      const clonedReq = req.clone();
      rawBody = await clonedReq.text();
      logger.info('Raw request body:', rawBody);
      
      // Now parse the original request as JSON
      requestBody = await req.json();
      logger.info('Request body parsed successfully', { body: requestBody });
    } catch (parseError) {
      logger.error('Failed to parse request body', { error: parseError, rawBody });
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body', details: String(parseError) }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const { queryId, isKnown, groupId } = requestBody;
    
    if (!queryId) {
      logger.warn('Missing queryId parameter in PATCH request');
      return new Response(
        JSON.stringify({ error: 'Missing queryId parameter' }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (isKnown !== undefined) {
      updateData.isKnown = isKnown;
      logger.info(`Setting query ${queryId} isKnown to ${isKnown}`);
    }
    
    if (groupId !== undefined) {
      updateData.groupId = groupId === null ? null : groupId;
      logger.info(`Setting query ${queryId} groupId to ${groupId}`);
    }
    
    try {
      await db.update(normalizedQueries)
        .set(updateData)
        .where(eq(normalizedQueries.id, queryId));
      
      logger.info(`Successfully updated query ${queryId}`);
      
      // Always use this format for JSON responses
      const jsonResponse = JSON.stringify({ success: true });
      logger.info('Sending successful response:', jsonResponse);
      
      return new Response(jsonResponse, { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    } catch (dbError) {
      logger.error('Database error when updating discovered query', { error: dbError, queryId });
      return new Response(
        JSON.stringify({ 
          error: 'Database operation failed', 
          details: String(dbError) 
        }), 
        { 
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        }
      );
    }
  } catch (error) {
    logger.error('Unexpected error updating discovered query:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to update query', 
        details: String(error) 
      }), 
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  }
} 