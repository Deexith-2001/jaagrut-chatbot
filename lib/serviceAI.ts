// lib/serviceAI.ts

import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function detectServiceWithAI(message: string, services: any[]) {
  try {
    const serviceList = services
      .slice(0, 80)
      .map((s) => s.displayName || s.title)
      .join("\n");

    const prompt = `
User message: "${message}"

Which service is the user looking for?

Choose the best matching service from this list:

${serviceList}

Examples:
- lost pan → Reprint PAN Card
- new passport → Passport New
- passport expired → Passport Renewal
- aadhaar address change → Aadhaar Address Update
- voter id correction → Voter Card Correction
- duplicate driving licence → Duplicate Driving License
- hsrp → HSRP Registration

Reply ONLY with the exact service name from the list.
`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
    });

    const result =
      completion.choices?.[0]?.message?.content?.trim().toLowerCase();

    return services.find(
      (s) =>
        s.title.toLowerCase() === result ||
        (s.displayName || "").toLowerCase() === result
    );
  } catch (err) {
    console.error("AI service detection error:", err);
    return null;
  }
}
