import { db } from "@/db";
import { discoveredQueries } from "@/db/schema";
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
    let whereConditions = eq(discoveredQueries.databaseId, databaseId);
    
    // Filter by known status
    if (!showKnown) {
      whereConditions = and(
        whereConditions,
        eq(discoveredQueries.isKnown, false)
      );
    }
    
    // Filter by group
    if (groupId === 'ungrouped') {
      whereConditions = and(
        whereConditions,
        isNull(discoveredQueries.groupId)
      );
    } else if (groupId && groupId !== 'all_queries') {
      whereConditions = and(
        whereConditions,
        eq(discoveredQueries.groupId, parseInt(groupId))
      );
    }
    
    // Filter by date range
    if (startDate) {
      try {
        const parsedStartDate = new Date(startDate);
        if (!isNaN(parsedStartDate.getTime())) {
          whereConditions = and(
            whereConditions,
            gte(discoveredQueries.lastSeenAt, parsedStartDate)
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
            lte(discoveredQueries.lastSeenAt, parsedEndDate)
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
          sql`(${discoveredQueries.queryText}::text ILIKE ${searchPattern})`
        );
        
        logger.info(`Applied search filter with pattern: ${searchPattern}`);
      } catch (error) {
        logger.error(`Error applying search filter '${search}':`, error);
      }
    }
    
    // Execute the query with all filters
    const results = await db.select()
      .from(discoveredQueries)
      .where(whereConditions)
      .orderBy(desc(discoveredQueries.lastSeenAt))
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
    const auth = await getAuth();
    if (!auth) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { queryId, isKnown, groupId } = await req.json();
    
    if (!queryId) {
      return new Response(
        JSON.stringify({ error: 'Missing queryId parameter' }), 
        { status: 400 }
      );
    }
    
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (isKnown !== undefined) {
      updateData.isKnown = isKnown;
    }
    
    if (groupId !== undefined) {
      updateData.groupId = groupId === null ? null : groupId;
    }
    
    await db.update(discoveredQueries)
      .set(updateData)
      .where(eq(discoveredQueries.id, queryId));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating discovered query:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to update query' }), 
      { status: 500 }
    );
  }
} 