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

// ✅ INTENT DETECTOR (FIXED ORDER)
function detectIntent(text: string) {
  if (text.includes("time") || text.includes("days")) return "TIME";
  if (text.includes("document") || text.includes("proof")) return "DOCUMENTS";
  if (text.includes("link") || text.includes("apply")) return "LINK";
  if (text.includes("step") || text.includes("process") || text.includes("how"))
    return "PROCESS";
  return "GENERAL";
}

// ✅ RELEVANCE CHECK (NEW)
function isRelevant(message: string, service: any) {
  const msg = message.toLowerCase();
  const title = service.title.toLowerCase();

  return msg.split(" ").some(
    (word) => word.length > 2 && title.includes(word)
  );
}

// 🤖 AI SERVICE PICKER
async function pickServiceWithAI(message: string, services: any[]) {
  const serviceList = services.map((s) => s.title).join("\n");

  const prompt = `
User message: "${message}"

Available services:
${serviceList}

Select the most relevant service.

Rules:
- Return ONLY the service name
- No explanation
`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [{ role: "user", content: prompt }],
  });

  const picked =
    completion.choices[0]?.message?.content?.toLowerCase().trim();

  let bestService = null;
  let bestScore = 0;

  for (const s of services) {
    const title = s.title.toLowerCase();

    let score = 0;

    picked?.split(" ").forEach((word) => {
      if (word.length > 2 && title.includes(word)) {
        score++;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestService = s;
    }
  }

  return bestService;
}

// 🤖 AI FORMATTER
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
- Keep response SHORT (max 4–5 lines)

Service: ${service.title}

User: ${message}

Intent: ${intent}

Data:
Description: ${service.description}
Steps: ${service.process}

INSTRUCTIONS:

If intent = PROCESS:
- Show steps in bullet points

If intent = DOCUMENTS:
- Show required documents

If intent = TIME:
- Give short time estimate

If intent = LINK:
- Only give link

If GENERAL:
- Give short explanation

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

    // 🔥 STEP 1: AI picks service
    const aiService = await pickServiceWithAI(message, services);

    let selectedService = null;

    // 🔥 STEP 2: Validate AI result
    if (aiService && isRelevant(message, aiService)) {
      selectedService = aiService;
    } 
    // 🔥 STEP 3: fallback to previous (follow-up)
    else if (currentService) {
      selectedService = currentService;
    } 
    // 🔥 STEP 4: fallback to AI anyway
    else {
      selectedService = aiService;
    }

    // ❌ STILL NOTHING
    if (!selectedService) {
      return NextResponse.json({
        reply:
          "I couldn't find an exact match, but I can help. Try PAN, Aadhaar, or certificates 👍",
      });
    }

    const intent = detectIntent(text);

    const reply = await formatResponse({
      message,
      service: selectedService,
      intent,
    });

    return NextResponse.json({
      reply,
      service: selectedService,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      reply: "⚠️ Server error",
    });
  }
}