export function detectLanguage(text: string) {
  if (/[\u0C00-\u0C7F]/.test(text)) return "Telugu";
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";

  const normalized = text.toLowerCase();
  const romanHindiPatterns = [
    "mera",
    "meri",
    "mujhe",
    "mujh",
    "karna hai",
    "karwana hai",
    "chahiye",
    "kya",
    "kaise",
    "kitna",
    "kab",
    "lagta hai",
    "galat hai",
    "banana hai",
    "banwana hai",
    "nahi",
    "haan",
    "ka",
    "ke liye",
    "krna",
    "krwana",
  ];

  const matchedPatterns = romanHindiPatterns.filter((pattern) =>
    normalized.includes(pattern)
  );

  if (matchedPatterns.length >= 2) return "Hinglish";

  return "English";
}
