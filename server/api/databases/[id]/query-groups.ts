import { db } from "@/db";
import { queryGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
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
    
    const groups = await db.query.queryGroups.findMany({
      where: eq(queryGroups.databaseId, databaseId)
    });
    
    return NextResponse.json(groups);
  } catch (error) {
    logger.error('Error fetching query groups:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch query groups' }), 
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return new Response("Unauthorized", { status: 401 });
    }

    const databaseId = parseInt(params.id);
    const { name, description, isKnown } = await req.json();
    
    if (!name) {
      return new Response(
        JSON.stringify({ error: 'Group name is required' }), 
        { status: 400 }
      );
    }
    
    const newGroup = await db.insert(queryGroups).values({
      databaseId,
      name,
      description: description || null,
      isKnown: isKnown || false,
      userId: auth.id,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    return NextResponse.json(newGroup[0]);
  } catch (error) {
    logger.error('Error creating query group:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create query group' }), 
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { groupId, name, description, isKnown } = await req.json();
    
    if (!groupId || !name) {
      return new Response(
        JSON.stringify({ error: 'Group ID and name are required' }), 
        { status: 400 }
      );
    }
    
    await db.update(queryGroups)
      .set({
        name,
        description: description || null,
        isKnown: isKnown || false,
        updatedAt: new Date()
      })
      .where(eq(queryGroups.id, groupId));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating query group:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to update query group' }), 
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(req.url);
    const groupId = url.searchParams.get("groupId");
    
    if (!groupId) {
      return new Response(
        JSON.stringify({ error: 'Group ID is required' }), 
        { status: 400 }
      );
    }
    
    await db.delete(queryGroups)
      .where(eq(queryGroups.id, parseInt(groupId)));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting query group:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to delete query group' }), 
      { status: 500 }
    );
  }
} 