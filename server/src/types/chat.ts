export type SessionStatus = "active" | "escalated" | "closed";
export type SessionMode = "bot" | "human";
export type MessageSender = "user" | "bot" | "admin";

export type ChatSession = {
  id: string;
  userId: string;
  status: SessionStatus;
  mode: SessionMode;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  sender: MessageSender;
  message: string;
  timestamp: string;
};

export type UserMessagePayload = {
  sessionId?: string;
  userId: string;
  userName?: string;
  userPhone?: string;
  message: string;
};

export type AdminReplyPayload = {
  sessionId: string;
  message: string;
};

export type TakeoverPayload = {
  sessionId: string;
};

export type AgentHelpRequestPayload = {
  sessionId: string;
  reason?: string;
};

export type CloseSessionPayload = {
  sessionId: string;
};
