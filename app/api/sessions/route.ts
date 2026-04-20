import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const sessions = await prisma.chatSession.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("GET /api/sessions error:", error);
    return NextResponse.json(
      { error: "Unable to fetch sessions" },
      { status: 500 }
    );
  }
}
