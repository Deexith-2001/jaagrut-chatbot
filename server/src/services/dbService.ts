import { SessionMode, SessionStatus, Sender } from "@prisma/client";
import { prisma } from "../../../lib/prisma";

function normalizeUserPhone(userPhone?: string) {
  const trimmed = userPhone?.trim();
  if (!trimmed) return null;

  const digitsOnly = trimmed.replace(/\D/g, "");
  if (!digitsOnly) return trimmed;

  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return digitsOnly.slice(2);
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    return digitsOnly.slice(1);
  }

  return digitsOnly;
}

export const dbService = {
  async ensureSession(
    sessionId: string | undefined,
    userId: string,
    userName?: string,
    userPhone?: string
  ) {
    const safeName = userName?.trim() || null;
    const safePhone = normalizeUserPhone(userPhone);

    if (sessionId) {
      const existing = await prisma.chatSession.findUnique({ where: { id: sessionId } });
      if (existing) {
        if (
          (safeName && safeName !== existing.userName) ||
          (safePhone && safePhone !== existing.userPhone)
        ) {
          return prisma.chatSession.update({
            where: { id: sessionId },
            data: {
              ...(safeName ? { userName: safeName } : {}),
              ...(safePhone ? { userPhone: safePhone } : {}),
            },
          });
        }
        return existing;
      }
    }

    if (safePhone) {
      const existingByPhone = await prisma.chatSession.findFirst({
        where: { userPhone: safePhone },
        orderBy: { createdAt: "desc" },
      });

      if (existingByPhone) {
        const shouldReopenClosedSession = existingByPhone.status === SessionStatus.closed;

        return prisma.chatSession.update({
          where: { id: existingByPhone.id },
          data: {
            ...(safeName && safeName !== existingByPhone.userName ? { userName: safeName } : {}),
            ...(safePhone !== existingByPhone.userPhone ? { userPhone: safePhone } : {}),
            ...(shouldReopenClosedSession ? { status: SessionStatus.active } : {}),
            ...(shouldReopenClosedSession ? { mode: SessionMode.bot } : {}),
          },
        });
      }
    }

    return prisma.chatSession.create({
      data: {
        ...(sessionId ? { id: sessionId } : {}),
        userId,
        userName: safeName,
        userPhone: safePhone,
        status: SessionStatus.active,
        mode: SessionMode.bot,
      },
    });
  },

  async getSessionById(sessionId: string) {
    return prisma.chatSession.findUnique({ where: { id: sessionId } });
  },

  async listActiveSessions() {
    return prisma.chatSession.findMany({
      where: { status: { in: [SessionStatus.active, SessionStatus.escalated, SessionStatus.closed] } },
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    });
  },

  async listMessages(sessionId: string) {
    return prisma.message.findMany({
      where: { sessionId },
      orderBy: { timestamp: "asc" },
    });
  },

  async saveMessage(sessionId: string, sender: Sender, message: string) {
    return prisma.message.create({
      data: {
        sessionId,
        sender,
        message,
      },
    });
  },

  async setMode(sessionId: string, mode: SessionMode) {
    return prisma.chatSession.update({
      where: { id: sessionId },
      data: { mode },
    });
  },

  async setStatus(sessionId: string, status: SessionStatus) {
    return prisma.chatSession.update({
      where: { id: sessionId },
      data: { status },
    });
  },

  async setModeAndStatus(sessionId: string, mode: SessionMode, status: SessionStatus) {
    return prisma.chatSession.update({
      where: { id: sessionId },
      data: { mode, status },
    });
  },
};
