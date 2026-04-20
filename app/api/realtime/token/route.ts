import { NextRequest, NextResponse } from "next/server";
import { createAblyTokenRequest } from "../../../../lib/ably";

function safeClientId(value: string | null) {
  if (!value) return "chat-user";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 64) : "chat-user";
}

export async function GET(req: NextRequest) {
  try {
    const clientId = safeClientId(req.nextUrl.searchParams.get("clientId"));
    const tokenRequest = await createAblyTokenRequest(clientId);
    return NextResponse.json(tokenRequest);
  } catch (error) {
    console.error("Ably token route error:", error);
    return NextResponse.json(
      { error: "Unable to create realtime token" },
      { status: 500 }
    );
  }
}
