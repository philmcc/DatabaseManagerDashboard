import { logger } from "@/lib/logger";
import { getAuth } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Forward to the Express implementation
    // Set a header to avoid creating an infinite loop if the Express route calls this API
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    
    // Use the Express endpoint
    const response = await fetch(`/api/databases/${params.id}/query-monitoring/start`, {
      method: "POST",
      headers,
      credentials: "include" // Include cookies for authentication
    });
    
    // Return whatever the Express route returned
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    logger.error("Error forwarding to Express route:", error);
    return new Response(
      JSON.stringify({ error: "Failed to start query monitoring" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
} 