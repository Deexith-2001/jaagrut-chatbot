// lib/normalize.ts

export function normalizeUserText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()

    // PAN
    .replace(/pancard/g, "pan")
    .replace(/pan card/g, "pan")
    .replace(/pancrd/g, "pan")

    // Aadhaar
    .replace(/aadhar/g, "aadhaar")
    .replace(/aadhr/g, "aadhaar")
    .replace(/adhar/g, "aadhaar")

    // Passport
    .replace(/passprot/g, "passport")
    .replace(/pasport/g, "passport")

    // Voter
    .replace(/voterid/g, "voter")

    // Driving License
    .replace(/drivng/g, "driving")
    .replace(/licence/g, "license")
    .replace(/driver license/g, "driving license")

    // Intent words
    .replace(/lost|missing|duplicate/g, "reprint")
    .replace(/correction|change|modify|galat|sudhar|sudhaar|wrong/g, "update")
    .replace(/renew/g, "renewal")
    .replace(/\bpricing\b|\brates\b|\brate\b|\bhow much\b|\btariff\b|\bkitna\b|fee|charge|price|cost/g, "fees")
    .replace(/track|tracking/g, "status")
    // Keep generic questions like "what services i get" intact.
    // Map only service-action phrases such as "get pan" -> "new pan".
    .replace(
      /\b(get|make)\s+(new\s+)?(pan|aadhaar|passport|voter|license|licence|hsrp|certificate|card)\b/g,
      "new $3"
    );
}
