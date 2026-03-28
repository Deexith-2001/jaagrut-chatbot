// lib/ai.ts

import Groq from "groq-sdk";
import { extractApplyLink } from "./chatbot";

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
    const isGeneral = !service;
    const applyLink = extractApplyLink(service || null);

    const prompt = isGeneral ? `
You are Jaagruk Bharat AI Assistant.

Answer the user's question helpfully and accurately based on general knowledge.
- Keep answers clear and concise.
- If the question is about government schemes or services, mention Jaagruk Bharat can help apply.
- Do not mention sources of information.
- Reply in ${language}.

User Question: ${message}
` : `
You are Jaagruk Bharat AI Assistant.

STRICT RULES:
- Answer only from the provided service context and broadly reliable government-service knowledge.
- Do not invent ages, timelines, prices, document alternatives, or eligibility rules that are not supported by the provided context.
- If the user says they do not have a required document, proof, vehicle, RC, or other prerequisite, clearly say the service cannot proceed until that requirement is available.
- If the context supports acceptable alternatives, mention them. Otherwise say the exact accepted alternatives will be confirmed by the support team.
- For HSRP: without a registered vehicle and RC details, the booking cannot proceed.
- For Aadhaar Update: address proof is needed for address-related updates; without it, that specific update cannot proceed until an accepted proof document is arranged.
- Keep the answer factual, direct, and short.
- Reply in ${language}.

User: ${message}
Service: ${service?.title || "General"}
Intent: ${intent}

Service Info:
${limitText(service?.description)}

Extra Info:
${limitText(extraContent)}

End with:
👉 Apply here: ${applyLink}
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