import { GoogleGenerativeAI } from "@google/generative-ai";
import { loadServices } from "../../../lib/sheet";
import { findRelevantServices } from "../../../lib/search";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MAIN_WEBSITE = "https://www.jaagrukbharat.com";

export async function POST(req: Request) {
  try {
    const { message = "", history = [] } = await req.json();

    if (!message) {
      return Response.json({ reply: "Message is required" });
    }

    const cleanMessage = message.toLowerCase().trim();

    const allServices = await loadServices();
    const relevant = findRelevantServices(cleanMessage, allServices);

    console.log("🔍 Matches:", relevant.length);

    /* =====================================================
       ✅ IF SERVICES FOUND
    ===================================================== */
    if (relevant.length > 0) {

      const context = relevant.map((s, i) => `
Service ${i + 1}:
Name: ${s.name}
Description: ${s.description}

Process:
${s.process || ""}

FAQs:
${s.faq || ""}
`).join("\n");

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
        systemInstruction: `
You are a helpful assistant for Jaagruk Bharat services.

Rules:
- Use ONLY the provided data
- Do NOT generate or modify links
- Do NOT invent services
- Keep answers simple and helpful
`
      });

      let aiText = "";

      try {
        const result = await model.generateContent(`
User Query: ${cleanMessage}

Available Services:
${context}

Explain clearly which services are relevant and why.
Keep it short.
`);

        aiText = result.response.text();

      } catch (error) {
        console.error("⚠️ AI Failed, using fallback");

        // 🔥 fallback when AI fails
        aiText = "Here are the most relevant services for your request:";
      }

      const servicesBlock = relevant.map((s, i) => `
${i + 1}. **${s.name}**
🔗 ${s.link || MAIN_WEBSITE}
`).join("\n");

      return Response.json({
        reply: `${aiText}\n\n---\n\n### Available Services:\n${servicesBlock}`
      });
    }

    /* =====================================================
       ❌ NO MATCH
    ===================================================== */
    return Response.json({
      reply: `No services found. Please visit ${MAIN_WEBSITE}`
    });

  } catch (error: any) {
    console.error("❌ API Error:", error);
    return Response.json(
      { reply: "⚠️ Service busy. Try again in 10s." },
      { status: 500 }
    );
  }
}