import { generateAIResponse } from "./ai";

type AgentConversation = {
  language?: "English" | "Hindi" | "Telugu";
  currentIntent?: string | null;
  currentCategory?: string | null;
  currentService?: {
    title?: string;
    description?: string;
    link?: string;
  } | null;
};

type RealtimeAgentRequest = {
  agentId: string;
  message: string;
  conversation?: AgentConversation | null;
  currentService?: {
    title?: string;
    description?: string;
    link?: string;
  } | null;
};

type RealtimeAgentResult = {
  reply: string;
  conversation: AgentConversation | null;
  service: AgentConversation["currentService"] | null;
  quickReplies: string[];
};

export const DEFAULT_REALTIME_AGENT_ID = "direct-answer-agent";

export function getRealtimeAgentProfile(agentId: string) {
  if (agentId === DEFAULT_REALTIME_AGENT_ID) {
    return {
      id: DEFAULT_REALTIME_AGENT_ID,
      name: "Direct Answer Agent",
      description: "Answers user questions directly during realtime escalation.",
    };
  }

  return {
    id: DEFAULT_REALTIME_AGENT_ID,
    name: "Direct Answer Agent",
    description: "Answers user questions directly during realtime escalation.",
  };
}

export async function answerWithRealtimeAgent(
  req: RealtimeAgentRequest
): Promise<RealtimeAgentResult | null> {
  const trimmed = (req.message || "").trim();
  if (!trimmed) return null;

  const conversation = req.conversation || null;
  const service = req.currentService || conversation?.currentService || null;

  const reply = await generateAIResponse({
    message: trimmed,
    service,
    intent: conversation?.currentIntent || "GENERAL",
    language: conversation?.language || "English",
    extraContent: `Conversation category: ${conversation?.currentCategory || "GENERAL"}`,
  });

  const safeReply = (reply || "").trim();
  if (!safeReply || safeReply.startsWith("⚠️")) {
    return null;
  }

  return {
    reply: safeReply,
    conversation,
    service,
    quickReplies: ["Show process", "Required documents", "Apply now"],
  };
}
