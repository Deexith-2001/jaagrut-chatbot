import { extractIntent } from "./chatbot";

export function detectIntent(text: string) {
  if (text.toLowerCase().includes("services")) return "GENERAL";
  return extractIntent(text);
}
