import { getDatabaseConnection } from "@/lib/database";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Example endpoint implementation
export async function GET(req: Request, { params }: { params: { id: string } }) {
  logger.info(`Fetching running queries for database ${params.id}`);
  
  try {
    // Get the database connection
    logger.info('Getting database connection...');
    const db = await getDatabaseConnection(params.id);
    
    if (!db) {
      logger.error(`No database connection found for ID ${params.id}`);
      return new Response(
        JSON.stringify({ error: 'Database connection not found' }), 
        { status: 404 }
      );
    }

    logger.info('Executing query to fetch running queries...');
    const query = `
      SELECT 
        pid,
        usename as username,
        datname as database,
        state,
        query,
        EXTRACT(EPOCH FROM now() - query_start)::text || 's' as duration,
        query_start as started_at
      FROM pg_stat_activity 
      WHERE state != 'idle' 
        AND pid != pg_backend_pid()
      ORDER BY query_start DESC
    `;

    try {
      const result = await db.query(query);
      logger.info(`Found ${result.rows.length} running queries`);
      logger.debug('Query results:', result.rows);
      
      return new Response(JSON.stringify(result.rows), {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
    } catch (queryError) {
      logger.error('Error executing query:', queryError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to execute query',
          details: queryError.message 
        }), 
        { status: 500 }
      );
    }
    
  } catch (error) {
    logger.error('Error in running-queries endpoint:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch running queries',
        details: error.message 
      }), 
      { status: 500 }
    );
  }
} 