import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return NextResponse.json({ 
    status: "ok", 
    message: `Test endpoint for database ${params.id}`,
    timestamp: new Date().toISOString()
  });
} 