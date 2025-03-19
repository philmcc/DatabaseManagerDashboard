import { db } from "@/db";
import { normalizedQueries, collectedQueries } from "@/db/schema";
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
    
    // Build a raw SQL query instead of using Drizzle's query builder
    let conditions = [];
    let parameters = [databaseId]; // First parameter is databaseId
    let parameterCounter = 1;
    
    // Database ID condition is always present
    conditions.push(`nq.database_id = $${parameterCounter++}`);
    
    // Filter by known status
    if (!showKnown) {
      parameters.push(false);
      conditions.push(`nq.is_known = $${parameterCounter++}`);
    }
    
    // Filter by group
    if (groupId === 'ungrouped') {
      conditions.push(`nq.group_id IS NULL`);
    } else if (groupId && groupId !== 'all_queries') {
      parameters.push(parseInt(groupId));
      conditions.push(`nq.group_id = $${parameterCounter++}`);
    }
    
    // Filter by date range
    if (startDate) {
      try {
        const parsedStartDate = new Date(startDate);
        if (!isNaN(parsedStartDate.getTime())) {
          parameters.push(parsedStartDate.toISOString());
          conditions.push(`nq.last_seen_at >= $${parameterCounter++}`);
          logger.info(`Applied start date filter: ${parsedStartDate.toISOString()}`);
        }
      } catch (error) {
        logger.error(`Error parsing start date '${startDate}':`, error);
      }
    }
    
    if (endDate) {
      try {
        const parsedEndDate = new Date(endDate);
        if (!isNaN(parsedEndDate.getTime())) {
          parameters.push(parsedEndDate.toISOString());
          conditions.push(`nq.last_seen_at <= $${parameterCounter++}`);
          logger.info(`Applied end date filter: ${parsedEndDate.toISOString()}`);
        }
      } catch (error) {
        logger.error(`Error parsing end date '${endDate}':`, error);
      }
    }
    
    // Search query text
    if (search && search.trim()) {
      try {
        const searchPattern = `%${search.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
        parameters.push(searchPattern);
        conditions.push(`nq.normalized_text ILIKE $${parameterCounter++}`);
        logger.info(`Applied search filter with pattern: ${searchPattern}`);
      } catch (error) {
        logger.error(`Error applying search filter '${search}':`, error);
      }
    }
    
    // Construct the WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Execute raw SQL query
    const query = `
      SELECT 
        nq.id,
        nq.database_id as "databaseId",
        nq.normalized_text as "normalizedText",
        nq.normalized_hash as "normalizedHash",
        nq.first_seen_at as "firstSeenAt",
        nq.last_seen_at as "lastSeenAt",
        COALESCE(COUNT(cq.id), 0) as "callCount",
        COALESCE(SUM(cq.total_time), 0) as "totalTime",
        MIN(cq.min_time) as "minTime",
        MAX(cq.max_time) as "maxTime",
        CASE 
          WHEN COUNT(cq.id) > 0 
          THEN SUM(cq.total_time)::float / COUNT(cq.id) 
          ELSE 0 
        END as "meanTime",
        nq.is_known as "isKnown",
        nq.group_id as "groupId",
        nq.instance_count as "instanceCount",
        nq.distinct_query_count as "distinctQueryCount",
        nq.updated_at as "lastUpdatedAt",
        MAX(cq.query_text) as "queryText"
      FROM 
        normalized_queries nq
      LEFT JOIN 
        collected_queries cq ON nq.id = cq.normalized_query_id
      ${whereClause}
      GROUP BY 
        nq.id
      ORDER BY 
        nq.last_seen_at DESC
      LIMIT 100
    `;
    
    logger.info('Executing query:', { query, parameters });
    
    const result = await db.execute(sql.raw(query, parameters));
    const { rows } = result;
    
    // Log the query results
    logger.info(`Found ${rows.length} queries matching filters`);
    
    // Set cache control headers
    const headers = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
    
    return new Response(JSON.stringify(rows), {
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
    
    await db.update(normalizedQueries)
      .set(updateData)
      .where(eq(normalizedQueries.id, queryId));
    
    return new Response(
      JSON.stringify({ success: true }), 
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  } catch (error) {
    logger.error('Error updating discovered query:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to update query' }), 
      { status: 500 }
    );
  }
} 