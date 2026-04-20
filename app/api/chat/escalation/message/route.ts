import { NextRequest, NextResponse } from "next/server";
import { publishAblyEvent } from "../../../../../lib/ably";
import {
  DEFAULT_REALTIME_AGENT_ID,
  getRealtimeAgentProfile,
} from "@/lib/realtimeAgent";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = `${body?.message || ""}`.trim();
    const channelName = `${body?.channelName || ""}`.trim();
    const requestedAgentId =
      typeof body?.agentId === "string" && body.agentId.trim()
        ? body.agentId.trim()
        : DEFAULT_REALTIME_AGENT_ID;
    const agent = getRealtimeAgentProfile(requestedAgentId);
    const requestId =
      typeof body?.requestId === "string" && body.requestId.trim()
        ? body.requestId.trim()
        : crypto.randomUUID();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (!channelName) {
      return NextResponse.json({ error: "channelName is required" }, { status: 400 });
    }

    await publishAblyEvent(channelName, "user_message", {
      requestId,
      text: message,
      createdAt: new Date().toISOString(),
    });

    await publishAblyEvent(channelName, "agent_thinking", {
      requestId,
      status: `${agent.name} is preparing your answer...`,
      createdAt: new Date().toISOString(),
    });

    const chatRes = await fetch(new URL("/api/chat", req.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        conversation: body?.conversation,
        currentService: body?.currentService,
        preferFastResponse: true,
      }),
      cache: "no-store",
    });

    const chatData = await chatRes.json();

    if (!chatRes.ok) {
      const errorReply = `${chatData?.reply || "Unable to process message right now."}`;
      await publishAblyEvent(channelName, "agent_error", {
        requestId,
        error: errorReply,
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ reply: errorReply, requestId }, { status: chatRes.status });
    }

    await publishAblyEvent(channelName, "agent_final", {
      requestId,
      reply: chatData.reply,
      conversation: chatData.conversation || null,
      service: chatData.service || null,
      quickReplies: chatData.quickReplies || null,
      agentId: agent.id,
      agentName: agent.name,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      requestId,
      queued: true,
      reply: chatData.reply,
      conversation: chatData.conversation || null,
      service: chatData.service || null,
      quickReplies: chatData.quickReplies || null,
      agentId: agent.id,
      agentName: agent.name,
    });
  } catch (error) {
    console.error("Escalation message route error:", error);
    return NextResponse.json(
      { error: "Unable to process escalated message" },
      { status: 500 }
    );
  }
}
