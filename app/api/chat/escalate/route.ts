import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_REALTIME_AGENT_ID, getRealtimeAgentProfile } from "@/lib/realtimeAgent";

function fallbackSessionId() {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const sessionId =
      typeof body?.sessionId === "string" && body.sessionId.trim()
        ? body.sessionId.trim()
        : fallbackSessionId();

    const reason =
      typeof body?.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 280)
        : "User requested deeper assistance";

    const escalationId = crypto.randomUUID();
    const channelName = `chat.escalation.${sessionId}.${escalationId}`;
    const agent = getRealtimeAgentProfile(DEFAULT_REALTIME_AGENT_ID);

    return NextResponse.json({
      escalationId,
      sessionId,
      channelName,
      agentId: agent.id,
      agentName: agent.name,
      status: "escalated",
      mode: "agent-realtime-pending",
      reason,
      nextStep:
        "Connect this channelName to your managed realtime provider (Ably/Pusher/Supabase) and subscribe from the client.",
    });
  } catch (error) {
    console.error("Escalation route error:", error);
    return NextResponse.json(
      { error: "Unable to start escalation right now." },
      { status: 500 }
    );
  }
}
