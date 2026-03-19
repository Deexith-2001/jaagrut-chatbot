import { Service } from "./sheet";

// 🔥 Synonyms dictionary
const synonyms: Record<string, string[]> = {
  aadhaar: ["aadhar", "adhar", "uidai"],
  pan: ["pan card", "pancard"],
  passport: ["passport", "travel document"],
};

function normalizeWord(word: string) {
  word = word.toLowerCase();

  for (const key in synonyms) {
    if (synonyms[key].includes(word) || word === key) {
      return key;
    }
  }

  return word;
}

// 🔥 Simple typo tolerance
function isFuzzyMatch(word: string, text: string) {
  if (text.includes(word)) return true;

  // allow 1-2 char mistake
  return text.includes(word.slice(0, -1)) || text.includes(word.slice(1));
}

export function findRelevantServices(query: string, services: Service[]) {
  const cleaned = query
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();

  const words = cleaned
    .split(" ")
    .filter((w) => w.length > 2)
    .map(normalizeWord);

  const results = services.map((s) => {
    let score = 0;

    const name = String(s.name || "").toLowerCase();
    const desc = String(s.description || "").toLowerCase();
    const category = String(s.category || "").toLowerCase();
    const full = String(s.fullText || "").toLowerCase();

    words.forEach((word) => {
      if (isFuzzyMatch(word, name)) score += 8;
      if (isFuzzyMatch(word, desc)) score += 5;
      if (isFuzzyMatch(word, category)) score += 4;
      if (isFuzzyMatch(word, full)) score += 2;
    });

    return { ...s, score };
  });

  return results
    .filter((s) => s.score >= 10) // 🔥 strong filtering
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}