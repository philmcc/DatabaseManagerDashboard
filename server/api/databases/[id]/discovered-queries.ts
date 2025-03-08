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
    
    // Search query text
    if (search && search.trim()) {
      const searchPattern = `%${search.trim().replace(/[%_]/g, char => `\\${char}`)}%`;
      whereConditions = and(
        whereConditions,
        sql`${discoveredQueries.queryText} ILIKE ${searchPattern}`
      );
      logger.info(`Applied search filter with pattern: ${searchPattern}`);
    }
    
    // Execute the query with all filters
    const results = await db.select()
      .from(discoveredQueries)
      .where(whereConditions)
      .orderBy(desc(discoveredQueries.lastSeenAt))
      .limit(100);
    
    // Log the query results
    logger.info(`Found ${results.length} queries matching filters`);
    
    return NextResponse.json(results);
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