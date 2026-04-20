import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;

    const messages = await prisma.message.findMany({
      where: { sessionId: id },
      orderBy: { timestamp: "asc" },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("GET /api/sessions/:id/messages error:", error);
    return NextResponse.json(
      { error: "Unable to fetch messages" },
      { status: 500 }
    );
  }
}
