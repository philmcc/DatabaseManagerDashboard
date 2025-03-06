import { db } from "@/db";
import { discoveredQueries } from "@/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
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
    const showKnown = url.searchParams.get("showKnown") === "true";
    const groupId = url.searchParams.get("groupId");
    
    let query = db.select()
      .from(discoveredQueries)
      .where(eq(discoveredQueries.databaseId, databaseId));
    
    // Filter by known status
    if (!showKnown) {
      query = query.where(eq(discoveredQueries.isKnown, false));
    }
    
    // Filter by group
    if (groupId) {
      query = query.where(eq(discoveredQueries.groupId, parseInt(groupId)));
    } else if (groupId === 'ungrouped') {
      query = query.where(isNull(discoveredQueries.groupId));
    }
    
    // Order by last seen
    query = query.orderBy(desc(discoveredQueries.lastSeenAt));
    
    const results = await query;
    
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