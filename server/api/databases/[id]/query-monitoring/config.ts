import { db } from "@/db";
import { queryMonitoringConfigs } from "@/db/schema";
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
    
    // Get current configuration
    const config = await db.query.queryMonitoringConfigs.findFirst({
      where: eq(queryMonitoringConfigs.databaseId, databaseId)
    });
    
    if (!config) {
      return NextResponse.json({ 
        isActive: false, 
        intervalMinutes: 15,
        lastRunAt: null
      });
    }
    
    return NextResponse.json(config);
  } catch (error) {
    logger.error('Error fetching query monitoring config:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch configuration' }), 
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
    const { isActive, intervalMinutes } = await req.json();
    
    // Check if config exists
    const existingConfig = await db.query.queryMonitoringConfigs.findFirst({
      where: eq(queryMonitoringConfigs.databaseId, databaseId)
    });
    
    if (existingConfig) {
      // Update existing config
      await db.update(queryMonitoringConfigs)
        .set({ 
          isActive, 
          intervalMinutes,
          updatedAt: new Date()
        })
        .where(eq(queryMonitoringConfigs.id, existingConfig.id));
    } else {
      // Create new config
      await db.insert(queryMonitoringConfigs).values({
        databaseId,
        isActive,
        intervalMinutes,
        userId: auth.id,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating query monitoring config:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to update configuration' }), 
      { status: 500 }
    );
  }
} 