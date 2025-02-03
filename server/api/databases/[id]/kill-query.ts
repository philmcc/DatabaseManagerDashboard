import { getDatabaseConnection } from "@/lib/database";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    // Expect the body to include both the process id (pid) and the query text
    const { pid, queryText } = await req.json();
    if (!pid) {
      return NextResponse.json({ error: "Missing 'pid' in request body" }, { status: 400 });
    }
    if (!queryText) {
      return NextResponse.json({ error: "Missing 'queryText' in request body" }, { status: 400 });
    }

    logger.info(`Attempting to kill query with pid ${pid} on database ${params.id}`);
    
    // Get the connection pool for the given database
    const db = await getDatabaseConnection(params.id);
    if (!db) {
      logger.error(`No database connection found for ID ${params.id}`);
      return NextResponse.json({ error: "Database connection not found" }, { status: 404 });
    }

    // Use the provided query text from the request body (skipping a database query)
    // queryText is already validated above.

    // Kill the query using PostgreSQL's built in function
    await db.query("SELECT pg_terminate_backend($1)", [pid]);

    // Log the kill action including the query text
    logger.info(`Killed query (pid: ${pid}). Query text: ${queryText}`);

    return NextResponse.json({ success: true, killedQueryText: queryText });
  } catch (error: any) {
    logger.error("Error in kill-query endpoint:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
} 