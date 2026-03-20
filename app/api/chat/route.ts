import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1C8xZB5OZXhk4R3xJc4yShgLpJsBZkp6s0HRkmIGQj6U/gviz/tq?tqx=out:csv&gid=599383802";

// ✅ FETCH SERVICES
async function getServices() {
  try {
    const res = await fetch(SHEET_URL);
    const csv = await res.text();

    const parsed = Papa.parse(csv, { header: true });

    const services = parsed.data.map((row: any) => {
      const getField = (name: string) => {
        const key = Object.keys(row).find((k) =>
          k.toLowerCase().includes(name.toLowerCase())
        );
        return key ? row[key] : "";
      };

      const steps = [];

      const t1 = getField("applicationprocess title 1");
      const d1 = getField("applicationprocessdescription1");

      const t2 = getField("applicationprocess title 2");
      const d2 = getField("applicationprocessdescription2");

      const t3 = getField("applicationprocess title 3");
      const d3 = getField("applicationprocessdescription3");

      if (t1) steps.push(`${t1}: ${d1}`);
      if (t2) steps.push(`${t2}: ${d2}`);
      if (t3) steps.push(`${t3}: ${d3}`);

      return {
        title: getField("display"),
        description:
          getField("description") || "We can help you with this service.",
        process:
          steps.length > 0
            ? steps.join("\n")
            : "Fill form → Submit documents → Get result",
        link: getField("canonical"),
      };
    });

    return services.filter((s) => s.title);
  } catch {
    return [];
  }
}

// ✅ MATCHING
function matchService(message: string, services: any[]) {
  const input = message.toLowerCase();

  let bestService = null;
  let bestScore = 0;

  for (const s of services) {
    const text = (
      s.title +
      " " +
      (s.description || "") +
      " " +
      (s.process || "")
    ).toLowerCase();

    let score = 0;

    input.split(" ").forEach((word) => {
      if (word.length > 2 && text.includes(word)) {
        score++;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestService = s;
    }
  }

  return { service: bestService, score: bestScore };
}

// ✅ FOLLOW-UP DETECTOR
function isFollowUp(text: string) {
  return (
    text.includes("document") ||
    text.includes("documents") ||
    text.includes("proof") ||
    text.includes("steps") ||
    text.includes("process") ||
    text.includes("how") ||
    text.includes("time") ||
    text.includes("days") ||
    text.includes("link") ||
    text.includes("apply")
  );
}

// 🤖 AI FORMATTER (FINAL FIXED)
async function formatResponse({
  message,
  service,
  intent,
}: {
  message: string;
  service: any;
  intent: string;
}) {
  const prompt = `
You are a helpful support assistant.

STRICT RULES:
- ONLY talk about THIS service
- NEVER switch service
- Answer the user directly (DO NOT ask questions)
- Keep response SHORT (max 4–5 lines)

Service: ${service.title}

User: ${message}

Intent: ${intent}

Data:
Description: ${service.description}
Steps: ${service.process}

INSTRUCTIONS:

If intent = PROCESS:
- Show steps as bullet points

If intent = DOCUMENTS:
- Show required documents clearly

If intent = TIME:
- Give short time estimate

If intent = LINK:
- Only give link

If GENERAL:
- Give short helpful explanation

ALWAYS end with:
👉 [Apply here](${service.link})
`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [{ role: "user", content: prompt }],
  });

  return completion.choices[0]?.message?.content || "No response";
}

// 🚀 API
export async function POST(req: NextRequest) {
  try {
    const { message, currentService } = await req.json();
    const text = message.toLowerCase();

    const services = await getServices();

    if (!services.length) {
      return NextResponse.json({
        reply: "⚠️ Services unavailable",
      });
    }

    // 👋 GREETING
    if (text.includes("hi") || text.includes("hello")) {
      return NextResponse.json({
        reply:
          "Hi! 👋 We can help you with PAN, Aadhaar, certificates and more.\n\nWhat do you need help with?",
      });
    }

    // 🔍 MATCH SERVICE
    const { service: detectedService, score } = matchService(
      message,
      services
    );

    const followUp = isFollowUp(text);

    let selectedService = currentService;

    // ✅ SWITCH ONLY IF NEW TOPIC
    if (!followUp && detectedService && score >= 2) {
      selectedService = detectedService;
    }

    // ❌ NO SERVICE
    if (!selectedService) {
      return NextResponse.json({
        reply:
          "We provide PAN, Aadhaar, certificates and more.\n\nTell me which service you need 👍",
      });
    }

    // 🔗 LINK
    if (text.includes("link") || text.includes("apply")) {
      const reply = await formatResponse({
        message,
        service: selectedService,
        intent: "LINK",
      });
      return NextResponse.json({ reply, service: selectedService });
    }

    // 🧾 PROCESS
    if (
      text.includes("how") ||
      text.includes("steps") ||
      text.includes("process")
    ) {
      const reply = await formatResponse({
        message,
        service: selectedService,
        intent: "PROCESS",
      });
      return NextResponse.json({ reply, service: selectedService });
    }

    // 📄 DOCUMENTS
    if (
      text.includes("document") ||
      text.includes("documents") ||
      text.includes("proof")
    ) {
      const reply = await formatResponse({
        message,
        service: selectedService,
        intent: "DOCUMENTS",
      });
      return NextResponse.json({ reply, service: selectedService });
    }

    // ⏱ TIME
    if (text.includes("time") || text.includes("days")) {
      const reply = await formatResponse({
        message,
        service: selectedService,
        intent: "TIME",
      });
      return NextResponse.json({ reply, service: selectedService });
    }

    // 📘 DEFAULT
    const reply = await formatResponse({
      message,
      service: selectedService,
      intent: "GENERAL",
    });

    return NextResponse.json({ reply, service: selectedService });
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      reply: "⚠️ Server error",
    });
  }
}