import { NextResponse } from "next/server";

export async function GET(req: Request) {
  return NextResponse.json({ 
    status: "ok", 
    message: "Debug API endpoint is working",
    timestamp: new Date().toISOString()
  });
} 