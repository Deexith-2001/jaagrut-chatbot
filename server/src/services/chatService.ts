import { Sender } from "@prisma/client";
import { dbService } from "./dbService";

const FALLBACK_PATTERNS = [
  "i don't understand",
  "i do not understand",
  "unable to process",
  "please rephrase",
];

function isEscalationWorthy(reply: string) {
  const normalized = reply.toLowerCase();
  return FALLBACK_PATTERNS.some((pattern) => normalized.includes(pattern));
}

async function generateBotReply(message: string) {
  const endpoint = process.env.CHATBOT_HTTP_ENDPOINT || "http://localhost:3000/api/chat";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const data = await response.json();
    const reply = typeof data?.reply === "string" ? data.reply.trim() : "";

    if (!response.ok || !reply) {
      return "I don't understand. Let me connect you to support.";
    }

    return reply;
  } catch {
    return "I don't understand. Let me connect you to support.";
  }
}

export const chatService = {
  async processUserMessage(sessionId: string, message: string) {
    const session = await dbService.getSessionById(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    if (session.mode === "human") {
      return {
        repliedByBot: false,
        botReply: null,
        botRecord: null,
        escalated: session.status === "escalated",
      };
    }

    const botReply = await generateBotReply(message);
    const botRecord = await dbService.saveMessage(sessionId, Sender.bot, botReply);

    const escalated = isEscalationWorthy(botReply);
    if (escalated) {
      await dbService.setStatus(sessionId, "escalated");
    }

    return {
      repliedByBot: true,
      botReply,
      botRecord,
      escalated,
    };
  },

  async saveAdminReply(sessionId: string, message: string) {
    await dbService.saveMessage(sessionId, Sender.admin, message);
    await dbService.setModeAndStatus(sessionId, "human", "escalated");
  },
};
