import { Server, Socket } from "socket.io";
import { dbService } from "../services/dbService";
import { chatService } from "../services/chatService";
import {
  AdminReplyPayload,
  AgentHelpRequestPayload,
  CloseSessionPayload,
  TakeoverPayload,
  UserMessagePayload,
} from "../types/chat";

const ADMINS_ROOM = "admins";

function sessionRoom(sessionId: string) {
  return `session:${sessionId}`;
}

async function emitSessionSnapshot(io: Server) {
  const sessions = await dbService.listActiveSessions();
  io.to(ADMINS_ROOM).emit("session_list", sessions);
}

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    socket.on("admin_join", async () => {
      try {
        socket.join(ADMINS_ROOM);
        await emitSessionSnapshot(io);
      } catch (error) {
        socket.emit("socket_error", {
          message: "Failed to load admin session list",
          detail: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("join_session", async ({ sessionId }: { sessionId: string }) => {
      if (!sessionId) return;
      socket.join(sessionRoom(sessionId));
    });

    socket.on(
      "user_message",
      async (
        payload: UserMessagePayload,
        callback?: (response: {
          ok: boolean;
          sessionId?: string;
          status?: string;
          mode?: "bot" | "human";
          error?: string;
        }) => void
      ) => {
        try {
          const text = `${payload?.message || ""}`.trim();
          const userId = `${payload?.userId || "anonymous"}`.trim();
          const userName = `${payload?.userName || ""}`.trim();
          const userPhone = `${payload?.userPhone || ""}`.trim();
          if (!text) return;

          const session = await dbService.ensureSession(
            payload?.sessionId,
            userId,
            userName,
            userPhone
          );
          const currentSessionId = session.id;

          socket.join(sessionRoom(currentSessionId));

          const userRecord = await dbService.saveMessage(currentSessionId, "user", text);
          io.to(sessionRoom(currentSessionId)).emit("new_message", userRecord);
          io.to(ADMINS_ROOM).emit("new_message", userRecord);

          const updatedSession = await dbService.getSessionById(currentSessionId);
          socket.emit("user_message_processed", {
            sessionId: currentSessionId,
            status: updatedSession?.status || "active",
            mode: updatedSession?.mode || "bot",
          });
          callback?.({
            ok: true,
            sessionId: currentSessionId,
            status: updatedSession?.status || "active",
            mode: updatedSession?.mode || "bot",
          });
          io.to(sessionRoom(currentSessionId)).emit("session_updated", updatedSession);
          io.to(ADMINS_ROOM).emit("session_updated", updatedSession);
        } catch (error) {
          socket.emit("socket_error", {
            message: "Failed to process user message",
            detail: error instanceof Error ? error.message : "Unknown error",
          });
          callback?.({
            ok: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    );

    socket.on("bot_message", async (payload: { sessionId?: string; message?: string }) => {
      try {
        const sessionId = `${payload?.sessionId || ""}`.trim();
        const text = `${payload?.message || ""}`.trim();
        if (!sessionId || !text) return;

        const session = await dbService.getSessionById(sessionId);
        if (!session || session.mode === "human") return;

        const botRecord = await dbService.saveMessage(sessionId, "bot", text);
        io.to(sessionRoom(sessionId)).emit("new_message", botRecord);
        io.to(ADMINS_ROOM).emit("new_message", botRecord);

        const normalized = text.toLowerCase();
        const shouldEscalate = [
          "i don't understand",
          "i do not understand",
          "unable to process",
          "please rephrase",
        ].some((pattern) => normalized.includes(pattern));

        if (shouldEscalate) {
          await dbService.setStatus(sessionId, "escalated");
          io.to(ADMINS_ROOM).emit("session_escalated", { sessionId });
        }

        const updated = await dbService.getSessionById(sessionId);
        io.to(sessionRoom(sessionId)).emit("session_updated", updated);
        io.to(ADMINS_ROOM).emit("session_updated", updated);
      } catch (error) {
        socket.emit("socket_error", {
          message: "Failed to process bot message",
          detail: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("request_agent_help", async (payload: AgentHelpRequestPayload) => {
      try {
        const sessionId = `${payload?.sessionId || ""}`.trim();
        const reason = `${payload?.reason || "User requested more information"}`.trim();
        if (!sessionId) return;

        const session = await dbService.getSessionById(sessionId);
        if (!session) return;

        const noteRecord = await dbService.saveMessage(
          sessionId,
          "bot",
          `[Support requested] ${reason}`
        );
        io.to(ADMINS_ROOM).emit("new_message", noteRecord);

        const updated = await dbService.setStatus(sessionId, "escalated");
        io.to(sessionRoom(sessionId)).emit("session_updated", updated);
        io.to(ADMINS_ROOM).emit("session_updated", updated);
        io.to(ADMINS_ROOM).emit("session_escalated", { sessionId, reason });
      } catch (error) {
        socket.emit("socket_error", {
          message: "Failed to request agent help",
          detail: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("close_session", async (payload: CloseSessionPayload) => {
      try {
        const sessionId = `${payload?.sessionId || ""}`.trim();
        if (!sessionId) return;

        const session = await dbService.getSessionById(sessionId);
        if (!session) return;

        const updated = await dbService.setStatus(sessionId, "closed");
        io.to(sessionRoom(sessionId)).emit("session_updated", updated);
        io.to(ADMINS_ROOM).emit("session_updated", updated);
      } catch (error) {
        socket.emit("socket_error", {
          message: "Failed to close session",
          detail: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("takeover_chat", async (payload: TakeoverPayload) => {
      try {
        if (!payload?.sessionId) return;
        const updated = await dbService.setModeAndStatus(payload.sessionId, "human", "escalated");
        io.to(sessionRoom(payload.sessionId)).emit("session_updated", updated);
        io.to(ADMINS_ROOM).emit("session_updated", updated);
      } catch (error) {
        socket.emit("socket_error", {
          message: "Failed to take over chat",
          detail: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("admin_reply", async (payload: AdminReplyPayload) => {
      try {
        const text = `${payload?.message || ""}`.trim();
        if (!payload?.sessionId || !text) return;

        await chatService.saveAdminReply(payload.sessionId, text);
        const messages = await dbService.listMessages(payload.sessionId);
        const adminRecord = messages[messages.length - 1];

        if (adminRecord?.sender === "admin") {
          io.to(sessionRoom(payload.sessionId)).emit("new_message", adminRecord);
          io.to(ADMINS_ROOM).emit("new_message", adminRecord);
        }

        const updated = await dbService.getSessionById(payload.sessionId);
        io.to(sessionRoom(payload.sessionId)).emit("session_updated", updated);
        io.to(ADMINS_ROOM).emit("session_updated", updated);
      } catch (error) {
        socket.emit("socket_error", {
          message: "Failed to send admin reply",
          detail: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });
  });
}
