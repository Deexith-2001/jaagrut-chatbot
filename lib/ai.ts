// lib/ai.ts

import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function limitText(text: string, maxLength = 1000) {
  if (!text) return "";
  return text.length > maxLength ? text.substring(0, maxLength) : text;
}

export async function generateAIResponse({
  message,
  service,
  intent,
  extraContent,
  language,
}: any) {
  try {
    const prompt = `
You are Jaagruk Bharat AI Assistant.

STRICT RULES:
- ONLY promote Jaagruk Bharat services.
- DO NOT mention other websites.
- Keep answers short and conversational.
- Reply in ${language}.

User: ${message}
Service: ${service?.title || "General"}
Intent: ${intent}

Service Info:
${limitText(service?.description)}

Extra Info:
${limitText(extraContent)}

End with:
👉 Apply here: ${service?.link || "https://www.jaagrukbharat.com"}
`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
    });

    return completion.choices?.[0]?.message?.content || "No response";
  } catch (err) {
    console.error("AI error:", err);
    return "⚠️ Unable to generate response right now.";
  }
}