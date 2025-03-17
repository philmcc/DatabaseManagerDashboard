import { NextResponse } from "next/server";

export async function GET(req: Request) {
  return NextResponse.json({ 
    success: true, 
    message: "Test endpoint working correctly",
    timestamp: new Date().toISOString()
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json({ 
      success: true, 
      message: "POST endpoint working correctly",
      receivedData: body,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "Failed to parse JSON",
      details: String(error)
    }, { status: 400 });
  }
} 