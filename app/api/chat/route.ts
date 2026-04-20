import { NextRequest, NextResponse } from "next/server";
import { generateAIResponse, generateGroundedIntentResponse } from "../../../lib/ai";
import {
  ChatIntent,
  ConversationStage,
  ConversationState,
  ServiceRecord,
  createInitialConversation,
  detectCategory,
  extractApplyLink,
  extractIntent,
  findForcedServiceMatch,
  findExactServiceMatch,
  findBestServiceMatch,
  mapCategoryFromService,
  mapServiceFromCategoryAndIntent,
} from "../../../lib/chatbot";
import { COMPANY_INFO } from "../../../lib/company";
import { detectCompanyIntent } from "../../../lib/companyIntent";
import { fetchContentFromUrls } from "../../../lib/content";
import { detectLanguage } from "../../../lib/language";
import { normalizeUserText } from "../../../lib/normalize";
import { detectServiceWithAI } from "../../../lib/serviceAI";
import { getServices } from "../../../lib/services";

function isGreeting(text: string) {
  const normalized = text
    .toLowerCase()
    .trim()
    .replace(/[!?.,]+/g, " ")
    .replace(/\s+/g, " ");

  // Treat as greeting only when the entire message is a salutation.
  return /^(hi|hii|hai|hello|hey|namaste|good morning|good afternoon|good evening)(\s+(sir|madam|bhai|bro|team|ji))?$/.test(
    normalized
  );
}

function cleanServiceName(title: string) {
  return title
    .replace(/reprint/gi, "")
    .replace(/new/gi, "")
    .replace(/update/gi, "")
    .replace(/renewal/gi, "")
    .replace(/click here/gi, "")
    .replace(/online today/gi, "")
    .replace(/do it now/gi, "")
    .replace(/ready to/gi, "")
    .replace(/apply online for/gi, "")
    .replace(/need to get your/gi, "")
    .replace(/\breal\b/gi, "")
    .replace(/[!?]+/g, "")
    .replace(/\s*[-:]+\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanDisplayLabel(title: string) {
  return (title || "")
    .replace(/click here/gi, "")
    .replace(/online today/gi, "")
    .replace(/do it now/gi, "")
    .replace(/ready to/gi, "")
    .replace(/apply online for/gi, "")
    .replace(/need to get your/gi, "")
    .replace(/\breal\b/gi, "")
    .replace(/[!?]+/g, "")
    .replace(/\s*[-:]+\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function categoryLabel(category: ConversationState["currentCategory"]) {
  const labels: Record<string, string> = {
    PAN: "PAN Card",
    AADHAAR: "Aadhaar",
    PASSPORT: "Passport",
    VOTER_ID: "Voter ID",
    DRIVING_LICENSE: "Driving License",
    HSRP: "HSRP Number Plate",
    CERTIFICATES: "Certificate",
    GOVERNMENT_SCHEMES: "Government Scheme",
    BUSINESS_REGISTRATION: "Business Registration",
    TRAVEL_DARSHAN: "Travel Booking",
    LEGAL_DOCUMENTS: "Legal Document",
  };

  return category ? labels[category] || null : null;
}

function presentServiceName(service: ServiceRecord) {
  const fullText = `${service.title} ${service.displayName || ""} ${service.description || ""}`.toLowerCase();

  if (fullText.includes("voter") && (fullText.includes("aadhaar") || fullText.includes("aadhar")) && /link/.test(fullText)) {
    return "Voter Aadhaar Linking";
  }

  if (fullText.includes("vehicle") && (fullText.includes("aadhaar") || fullText.includes("aadhar")) && /link/.test(fullText)) {
    return "Vehicle RC Aadhaar Linking";
  }

  if ((fullText.includes("driving") || fullText.includes("dl")) && (fullText.includes("aadhaar") || fullText.includes("aadhar")) && /link/.test(fullText)) {
    return "Driving License Aadhaar Link";
  }

  if ((fullText.includes("aadhaar") || fullText.includes("aadhar")) && fullText.includes("pan") && /link/.test(fullText)) {
    return "Aadhaar PAN Link";
  }

  if ((fullText.includes("aadhaar") || fullText.includes("aadhar")) && fullText.includes("npci")) {
    return "Aadhaar NPCI Link";
  }

  if ((fullText.includes("aadhaar") || fullText.includes("aadhar")) && fullText.includes("pvc")) {
    return "Aadhaar PVC Card";
  }

  if (fullText.includes("fssai")) {
    if (/\brenew|renewal\b/.test(fullText)) {
      return "FSSAI Food License Renewal";
    }
    return "FSSAI Food License Registration";
  }

  if (fullText.includes("pan")) {
    if (/\b(reprint|duplicate)\b/.test(fullText)) return "PAN Card Reprint";
    if (/\b(update|correction|change)\b/.test(fullText)) return "PAN Card Correction";
    if (/\bnew|application\b/.test(fullText)) return "New PAN Card";
    return "PAN Card";
  }

  if (fullText.includes("aadhaar") || fullText.includes("aadhar")) {
    if (/\bpan\b/.test(fullText) && /\blink\b/.test(fullText)) return "Aadhaar PAN Link";
    if (/\bnpci\b/.test(fullText)) return "Aadhaar NPCI Link";
    if (/\bpvc\b/.test(fullText)) return "Aadhaar PVC Card";
    if (/\b(address|update|correction|change)\b/.test(fullText)) return "Aadhaar Update";
    return "Aadhaar";
  }

  if (fullText.includes("passport")) {
    if (/\brenew|renewal\b/.test(fullText)) return "Passport Renewal";
    if (/\bnew|application\b/.test(fullText)) return "New Passport Application";
    return "Passport";
  }

  if (fullText.includes("voter")) {
    if ((/aadhaar|aadhar/.test(fullText)) && /link/.test(fullText)) return "Voter Aadhaar Linking";
    if (/\b(update|correction)\b/.test(fullText) || /(name|address|dob) change/.test(fullText) || /change details/.test(fullText)) return "Voter ID Correction";
    if (fullText.includes("get your voter") || fullText.includes("new voter card")) return "New Voter ID";
    if (/\bnew|application\b/.test(fullText)) return "New Voter ID";
    return "Voter ID";
  }

  if (
    fullText.includes("driving") ||
    fullText.includes("licence") ||
    fullText.includes("driver license") ||
    fullText.includes("learner") ||
    fullText.includes("permanent driving") ||
    fullText.includes("international driving") ||
    /\bdl\b/.test(fullText)
  ) {
    if (/\blearner\b/.test(fullText)) return "Learner's Driving License";
    if (/\binternational\b/.test(fullText)) return "International Driving License";
    if (/\bpermanent\b/.test(fullText)) return "Permanent Driving License";
    if (/\bduplicate|reprint\b/.test(fullText)) return "Driving License Duplicate";
    if (/\brenew|renewal\b/.test(fullText)) return "Driving License Renewal";
    if (/\bupdate|address\b/.test(fullText)) return "Driving License Update";
    return "Driving License";
  }

  if (fullText.includes("fastag")) {
    if (/\b(one year|annual)\b/.test(fullText)) return "FASTag One Year Pass";
    if (/\bkyv\b/.test(fullText)) return "FASTag KYV";
  }

  if ((fullText.includes("hsrp") || fullText.includes("number plate")) && /fuel sticker/.test(fullText)) {
    return "Colour-Coded Fuel Stickers";
  }

  if (fullText.includes("vehicle") && (fullText.includes("aadhaar") || fullText.includes("aadhar")) && fullText.includes("link")) {
    return "Vehicle RC Aadhaar Linking";
  }

  const cleanDisplayName = cleanDisplayLabel(service.displayName || "");
  if (
    cleanDisplayName &&
    /update|correction|renewal|reprint|new/i.test(service.displayName || service.title)
  ) {
    return cleanDisplayName;
  }

  if (cleanDisplayName) {
    return cleanDisplayName;
  }

  const categoryName = categoryLabel(mapCategoryFromService(service));
  const cleanedTitle = cleanServiceName(service.title);
  const titleTokens = cleanedTitle.split(/\s+/).filter((word) => word.length > 2);
  const categoryTokens = (categoryName || "").split(/\s+/).filter((word) => word.length > 2);

  if (categoryName && titleTokens.length <= categoryTokens.length + 1) {
    return categoryName;
  }

  return cleanedTitle || "service";
}

function serviceAlreadyReflectsIntent(serviceName: string, intent: ChatIntent) {
  const normalized = serviceName.toLowerCase();
  if (intent === "UPDATE") return /\b(update|correction|change)\b/.test(normalized);
  if (intent === "RENEWAL") return /\b(renew|renewal)\b/.test(normalized);
  if (intent === "REPRINT") return /\b(reprint|duplicate)\b/.test(normalized);
  if (intent === "NEW") return /\bnew\b/.test(normalized);
  return false;
}

function isServiceDiscoveryQuestion(text: string) {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("services") ||
    normalized.includes("what do you provide") ||
    normalized.includes("what services") ||
    normalized.includes("which services") ||
    normalized.includes("available services")
  );
}

function resolveDetectedIntent(message: string, normalizedMessage: string): ChatIntent {
  const raw = `${message} ${normalizedMessage}`.toLowerCase();

  if (
    raw.includes("eligibility") ||
    raw.includes("eligible") ||
    raw.includes("criteria") ||
    raw.includes("who can apply")
  ) {
    return "ELIGIBILITY";
  }

  if (
    raw.includes("documents") ||
    raw.includes("document") ||
    raw.includes("required") ||
    raw.includes("proof")
  ) {
    return "DOCUMENTS";
  }

  if (
    raw.includes("process") ||
    raw.includes("procedure") ||
    raw.includes("steps") ||
    raw.includes("how do i apply") ||
    raw.includes("how to apply")
  ) {
    return "PROCESS";
  }

  if (
    raw.includes("fees") ||
    raw.includes("fee") ||
    raw.includes("charges") ||
    raw.includes("pricing") ||
    raw.includes("price") ||
    raw.includes("cost") ||
    raw.includes("rates") ||
    raw.includes("rate") ||
    raw.includes("how much") ||
    raw.includes("tariff") ||
    raw.includes("kitna")
  ) {
    return "FEES";
  }

  if (
    raw.includes("status") ||
    raw.includes("track") ||
    raw.includes("tracking") ||
    raw.includes("timeline") ||
    raw.includes("how long")
  ) {
    return "STATUS";
  }

  if (
    raw.includes("apply now") ||
    raw.includes("apply link") ||
    raw.includes("application link") ||
    raw.trim() === "apply" ||
    raw.trim() === "yes"
  ) {
    return "APPLY";
  }

  return extractIntent(normalizedMessage);
}

function isBareCategoryQuery(
  normalizedMessage: string,
  category: ConversationState["currentCategory"],
  intent: ChatIntent
) {
  if (!category || category === "GENERAL" || intent !== "GENERAL") return false;
  const tokens = normalizedMessage.split(/\s+/).filter(Boolean);
  const bareTokensByCategory: Record<string, string[]> = {
    PAN: ["pan", "pancard"],
    AADHAAR: ["aadhaar", "aadhar"],
    PASSPORT: ["passport"],
    VOTER_ID: ["voter", "epic", "id"],
    DRIVING_LICENSE: ["driving", "license", "licence", "dl"],
    HSRP: ["hsrp", "number", "plate"],
    CERTIFICATES: ["certificate", "certificates"],
    GOVERNMENT_SCHEMES: ["government", "scheme", "schemes", "yojana"],
    BUSINESS_REGISTRATION: ["business", "registration", "registrations"],
    TRAVEL_DARSHAN: ["travel", "darshan", "booking", "yatra"],
    LEGAL_DOCUMENTS: ["legal", "document", "documents"],
  };

  const bareTokens = new Set(bareTokensByCategory[category] || []);
  return tokens.length > 0 && tokens.every((token) => bareTokens.has(token));
}

function isGlobalServiceCatalogQuestion(text: string) {
  const normalized = text.toLowerCase();
  const asksServiceList =
    normalized.includes("service") || normalized.includes("services");
  const asksProvideCapability =
    normalized.includes("provide") ||
    normalized.includes("offer") ||
    normalized.includes("get") ||
    normalized.includes("help with") ||
    normalized.includes("can you do");
  const asksCatalog =
    normalized.includes("what") ||
    normalized.includes("which") ||
    normalized.includes("show") ||
    normalized.includes("all") ||
    normalized.includes("list");

  if (asksServiceList && asksProvideCapability && asksCatalog) {
    return true;
  }

  return (
    normalized.includes("what are the services you provide") ||
    normalized.includes("what services do you provide") ||
    normalized.includes("what services you can provide") ||
    normalized.includes("what services can you provide") ||
    normalized.includes("what services can you provide me") ||
    normalized.includes("what services you can provide me") ||
    normalized.includes("what services i get") ||
    normalized.includes("what services i get here") ||
    normalized.includes("what services can i get") ||
    normalized.includes("which services do you provide") ||
    normalized.includes("what are the services available") ||
    normalized.includes("show services") ||
    normalized.includes("all services")
  );
}

function listServicesForCategory(
  services: ServiceRecord[],
  category: ConversationState["currentCategory"]
) {
  const matches = services
    .filter((service) => mapCategoryFromService(service) === category)
    .map((service) => presentServiceName(service))
    .filter(Boolean);

  return [...new Set(matches)].slice(0, 6);
}

function listServiceCategories(services: ServiceRecord[]) {
  const ordered = services
    .map((service) => mapCategoryFromService(service))
    .filter((category) => category !== "GENERAL");

  const unique = [...new Set(ordered)];

  return unique
    .map((category) => categoryLabel(category))
    .filter(Boolean)
    .slice(0, 8) as string[];
}

function toMarkdownLink(url: string) {
  return `[Apply here](${url})`;
}

function shortText(text: string, fallback: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact ? compact : fallback;
}

function topLines(text: string, maxLines = 4) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join("\n");
}

function bulletLines(lines: string[]) {
  return lines.map((line) => `- ${line}`).join("\n");
}

function numberedLines(lines: string[]) {
  return lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
}

function bulletList(lines: string[]) {
  return lines.map((line) => `- ${line}`).join("\n");
}

function hasExplicitServiceMention(text: string) {
  const normalized = text.toLowerCase();
  return [
    "pan",
    "aadhaar",
    "aadhar",
    "passport",
    "voter",
    "driving license",
    "driving licence",
    "license",
    "licence",
    "hsrp",
    "number plate",
    "certificate",
    "scheme",
    "passport",
    "voter",
    "udid",
    "abha",
    "apaar",
    "fssai",
    "food license",
    "food licence",
    "gst",
    "labour",
    "birth",
    "mobile",
    "shop act",
  ].some((keyword) => normalized.includes(keyword));
}

function forceServiceFromMessage(services: ServiceRecord[], normalizedMessage: string) {
  const raw = normalizedMessage.toLowerCase();

  const findService = (match: (haystack: string) => boolean) =>
    services.find((service) => {
      const haystack = `${service.title} ${service.displayName || ""} ${service.description || ""} ${(service.aliases || []).join(" ")}`.toLowerCase();
      return match(haystack);
    }) || null;

  if (raw.includes("pan")) {
    if (raw.includes("reprint") || raw.includes("duplicate")) {
      return findService((haystack) => haystack.includes("pan") && (haystack.includes("reprint") || haystack.includes("duplicate")));
    }

    if (raw.includes("update") || raw.includes("correction")) {
      return findService((haystack) => haystack.includes("pan") && (haystack.includes("correction") || haystack.includes("update")));
    }

    if (raw.includes("new") || raw.includes("apply") || raw.includes("application")) {
      return findService((haystack) => haystack.includes("pan") && haystack.includes("new"));
    }
  }

  if (raw.includes("aadhaar") || raw.includes("aadhar")) {
    if (raw.includes("pvc")) {
      return findService((haystack) =>
        (haystack.includes("aadhaar") || haystack.includes("aadhar")) && haystack.includes("pvc")
      );
    }

    if (raw.includes("npci")) {
      return findService((haystack) =>
        (haystack.includes("aadhaar") || haystack.includes("aadhar")) && haystack.includes("npci")
      );
    }

    if (raw.includes("pan") && raw.includes("link")) {
      return findService((haystack) =>
        (haystack.includes("aadhaar") || haystack.includes("aadhar")) &&
        haystack.includes("pan") &&
        haystack.includes("link")
      );
    }

    if (raw.includes("update") || raw.includes("correction") || raw.includes("address") || raw.includes("change")) {
      return findService((haystack) =>
        (haystack.includes("aadhaar") || haystack.includes("aadhar")) &&
        (haystack.includes("update") || haystack.includes("address") || haystack.includes("correction") || haystack.includes("change"))
      );
    }

    if (raw.includes("new") || raw.includes("enrol")) {
      return findService((haystack) =>
        (haystack.includes("aadhaar") || haystack.includes("aadhar")) &&
        (haystack.includes("new") || haystack.includes("enrol"))
      );
    }
  }

  if (raw.includes("passport")) {
    if (raw.includes("renewal") || raw.includes("expired")) {
      return findService((haystack) => haystack.includes("passport") && (haystack.includes("renew") || haystack.includes("renewal")));
    }

    if (raw.includes("new") || raw.includes("apply") || raw.includes("application")) {
      return findService((haystack) => haystack.includes("passport") && (haystack.includes("new") || haystack.includes("application")));
    }

    return findService((haystack) => haystack.includes("passport"));
  }

  if (raw.includes("voter")) {
    if ((raw.includes("aadhaar") || raw.includes("aadhar")) && raw.includes("link")) {
      return findService((haystack) =>
        haystack.includes("voter") &&
        (haystack.includes("aadhaar") || haystack.includes("aadhar")) &&
        haystack.includes("link")
      );
    }

    if (raw.includes("update") || raw.includes("correction")) {
      return findService((haystack) => haystack.includes("voter") && (haystack.includes("correction") || haystack.includes("update")));
    }

    if (raw.includes("new") || raw.includes("apply") || raw.includes("application")) {
      return findService((haystack) => haystack.includes("voter") && haystack.includes("new"));
    }

    return findService((haystack) => haystack.includes("voter"));
  }

  if (raw.includes("driving") || raw.includes("license") || raw.includes("licence") || raw.includes("learner") || raw.includes("learners") || raw.includes("dl")) {
    if (raw.includes("international")) {
      return findService((haystack) => haystack.includes("international") && (haystack.includes("driving") || haystack.includes("license") || haystack.includes("licence")));
    }

    if (raw.includes("permanent")) {
      return findService((haystack) => haystack.includes("permanent") && (haystack.includes("driving") || haystack.includes("license") || haystack.includes("licence")));
    }

    if (raw.includes("reprint") || raw.includes("duplicate")) {
      return findService((haystack) =>
        (haystack.includes("driving") || haystack.includes("license") || haystack.includes("licence")) &&
        (haystack.includes("duplicate") || haystack.includes("reprint"))
      );
    }

    if (raw.includes("renewal")) {
      return findService((haystack) =>
        (haystack.includes("driving") || haystack.includes("license") || haystack.includes("licence")) &&
        (haystack.includes("renew") || haystack.includes("renewal"))
      );
    }

    if (raw.includes("update") || raw.includes("address")) {
      return findService((haystack) =>
        (haystack.includes("driving") || haystack.includes("license") || haystack.includes("licence")) &&
        (haystack.includes("update") || haystack.includes("address"))
      );
    }

    if (raw.includes("learner") || raw.includes("learners")) {
      return findService((haystack) => haystack.includes("learner") && (haystack.includes("driving") || haystack.includes("license") || haystack.includes("licence")));
    }

    return findService((haystack) =>
      (haystack.includes("driving") || haystack.includes("license") || haystack.includes("licence")) &&
      (haystack.includes("learner") || haystack.includes("new") || haystack.includes("application"))
    );
  }

  if (
    normalizedMessage.includes("fssai") ||
    normalizedMessage.includes("food license") ||
    normalizedMessage.includes("food licence")
  ) {
    if (normalizedMessage.includes("renew")) {
      return (
        services.find((service) => {
          const haystack = `${service.title} ${service.displayName || ""} ${service.description || ""}`.toLowerCase();
          return haystack.includes("fssai") && (haystack.includes("renew") || haystack.includes("renewal"));
        }) || null
      );
    }

    return (
      services.find((service) => {
        const haystack = `${service.title} ${service.displayName || ""} ${service.description || ""}`.toLowerCase();
        return haystack.includes("fssai") && (haystack.includes("register") || haystack.includes("registration") || haystack.includes("new"));
      }) || null
    );
  }

  if (raw.includes("fastag") && (raw.includes("one year") || raw.includes("annual"))) {
    return findService((haystack) => haystack.includes("fastag") && (haystack.includes("one year") || haystack.includes("annual")));
  }

  if (raw.includes("fastag") && raw.includes("kyv")) {
    return findService((haystack) => haystack.includes("fastag") && haystack.includes("kyv"));
  }

  if (raw.includes("vehicle") && (raw.includes("aadhaar") || raw.includes("aadhar")) && raw.includes("link")) {
    return findService((haystack) => haystack.includes("vehicle") && (haystack.includes("aadhaar") || haystack.includes("aadhar")) && haystack.includes("link"));
  }

  return null;
}

function shouldHandleAsCompanyQuestion(
  companyIntent: string | null,
  normalizedMessage: string,
  detectedIntent: ChatIntent,
  hasCurrentService: boolean
) {
  if (!companyIntent) return false;

  const companyReferenceQuestion =
    (normalizedMessage.includes("you") ||
      normalizedMessage.includes("your") ||
      normalizedMessage.includes("jaagruk") ||
      normalizedMessage.includes("portal") ||
      normalizedMessage.includes("platform")) &&
    (normalizedMessage.includes("why") ||
      normalizedMessage.includes("trust") ||
      normalizedMessage.includes("consider") ||
      normalizedMessage.includes("choose") ||
      normalizedMessage.includes("pay") ||
      normalizedMessage.includes("fee") ||
      normalizedMessage.includes("cost") ||
      normalizedMessage.includes("charge"));

  if (companyReferenceQuestion && ["TRUST", "COMPARISON"].includes(companyIntent)) return true;

  if (["DOCUMENTS", "PROCESS", "APPLY", "STATUS", "ELIGIBILITY"].includes(detectedIntent)) return false;
  // Allow FEES intent for comparison questions when there's context
  if (detectedIntent === "FEES" && companyIntent === "COMPARISON" && hasCurrentService) return true;
  if (detectedIntent === "FEES") return false;
  return !hasExplicitServiceMention(normalizedMessage) || companyIntent === "TRUST" || companyIntent === "COMPARISON";
}

function isEligibilityQuestion(raw: string) {
  const hasEligibilitySignal =
    raw.includes("eligibility") ||
    raw.includes("eligible") ||
    raw.includes("criteria") ||
    raw.includes("who can apply") ||
    raw.includes("can i apply") ||
    raw.includes("can i still apply") ||
    raw.includes("am i eligible") ||
    raw.includes("what if i") ||
    raw.includes("under 18") ||
    raw.includes("below 18") ||
    raw.includes("minor") ||
    raw.includes("less than 18") ||
    raw.includes("dont have 18") ||
    raw.includes("don't have 18");

  const hasQuestionContext =
    raw.includes("?") ||
    raw.includes("can i") ||
    raw.includes("am i") ||
    raw.includes("what if") ||
    raw.includes("is it allowed") ||
    raw.includes("allowed") ||
    raw.includes("possible");

  return hasEligibilitySignal && hasQuestionContext;
}

function isWeakProcessText(text: string) {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return true;
  if (normalized.length < 30) return true;
  return [
    "why should one choose",
    "why choose jaagruk bharat",
    "jaagruk bharat services",
    "assistance team",
    "consequences of not applying",
    "benefits",
    "start your process",
    "apply now",
    "click here",
    "start now",
    "applicationprocesstitle",
    "applicationprocessdescription",
  ].some((pattern) => normalized.includes(pattern));
}

function isWeakDocumentsText(text: string) {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return true;
  if (
    [
      "nsdl",
      "utiitsl",
      "uidai",
      "passport seva",
      "government website",
      "visit your nearest",
      "pan centre",
      "why should one choose",
      "why choose jaagruk bharat",
      "security features",
      "tamper-proof",
      "durable and tear-proof",
      "easy to keep in a wallet",
      "consequences of not applying",
      "benefits",
      "digitised process",
    ].some((pattern) => normalized.includes(pattern))
  ) {
    return true;
  }
  return ![
    "document",
    "documents",
    "proof",
    "id proof",
    "address proof",
    "required",
    "certificate",
    "copy",
    "photo",
    "photograph",
    "mobile number",
    "aadhaar number",
  ].some((pattern) => normalized.includes(pattern));
}

function isSpecificDocumentDetailQuestion(normalizedMessage: string) {
  return [
    "what kind",
    "which",
    "acceptable",
    "valid",
    "address proof",
    "id proof",
    "identity proof",
    "bank statement",
    "electricity bill",
    "ration card",
    "passport",
    "license",
    "licence",
  ].some((phrase) => normalizedMessage.includes(phrase));
}

function looksLikeUsefulProcessText(text: string) {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return false;
  if (isWeakProcessText(normalized)) return false;
  if (
    [
      "nsdl",
      "utiitsl",
      "uidai",
      "passport seva",
      "visit your nearest",
      "government website",
    ].some((pattern) => normalized.includes(pattern))
  ) {
    return false;
  }

  return [
    "step",
    "process",
    "submit",
    "upload",
    "verification",
    "verify",
    "application",
    "fill",
    "documents",
  ].some((pattern) => normalized.includes(pattern));
}

function safeDocumentsFallback(
  language: ConversationState["language"],
  serviceName: string
) {
  if (language === "Hindi") {
    return `${serviceName} ke liye aam taur par identity proof, address proof, aur service ke hisaab se supporting documents lag sakte hain. Jaise hi aap process start karenge, hamari team exact Jaagruk Bharat document list share karegi.`;
  }

  if (language === "Hinglish") {
    return `${serviceName} ke liye usually identity proof, address proof, aur service-specific supporting documents lag sakte hain. Jaise hi aap process start karenge, hamari team exact Jaagruk Bharat document list share karegi.`;
  }

  if (language === "Telugu") {
    return `${serviceName} కోసం సాధారణంగా identity proof, address proof, మరియు service-specific supporting documents కావచ్చు. మీరు process start చేసిన వెంటనే మా టీమ్ exact Jaagruk Bharat document list షేర్ చేస్తుంది.`;
  }

  return `For ${serviceName}, this may usually require identity proof, address proof, and service-specific supporting documents. Once you start the process, our team will share the exact Jaagruk Bharat document list.`;
}

function isDrivingAgeEligibilityQuestion(normalizedMessage: string) {
  const hasDrivingContext =
    normalizedMessage.includes("driving") ||
    normalizedMessage.includes("license") ||
    normalizedMessage.includes("licence") ||
    normalizedMessage.includes("dl");

  if (!hasDrivingContext) return false;

  const hasAgeSignal =
    normalizedMessage.includes("under 18") ||
    normalizedMessage.includes("below 18") ||
    normalizedMessage.includes("minor") ||
    normalizedMessage.includes("age") ||
    /\bi am\s*1[0-7]\b/.test(normalizedMessage) ||
    /\bim\s*1[0-7]\b/.test(normalizedMessage) ||
    /\b(?:16|17)\s*years?\b/.test(normalizedMessage);

  const hasEligibilitySignal =
    normalizedMessage.includes("can i") ||
    normalizedMessage.includes("eligible") ||
    normalizedMessage.includes("allowed") ||
    normalizedMessage.includes("get") ||
    normalizedMessage.includes("apply");

  return hasAgeSignal && hasEligibilitySignal;
}

function findLearnerDrivingService(services: ServiceRecord[]) {
  return (
    services.find((service) => {
      const haystack = `${service.title} ${service.displayName || ""} ${service.description || ""}`.toLowerCase();
      return (
        haystack.includes("learner") &&
        (haystack.includes("driving") || haystack.includes("license") || haystack.includes("licence"))
      );
    }) || null
  );
}

function extractVehicleRegistrationYear(normalizedMessage: string) {
  const match = normalizedMessage.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function isHsrpEligibilityQuestion(normalizedMessage: string) {
  const hasHsrpContext =
    normalizedMessage.includes("hsrp") ||
    normalizedMessage.includes("number plate") ||
    normalizedMessage.includes("high security number plate") ||
    normalizedMessage.includes("registration plate");

  if (!hasHsrpContext) return false;

  const hasEligibilitySignal =
    normalizedMessage.includes("can i") ||
    normalizedMessage.includes("apply") ||
    normalizedMessage.includes("eligible") ||
    normalizedMessage.includes("registration") ||
    normalizedMessage.includes("registered") ||
    normalizedMessage.includes("vehicle") ||
    normalizedMessage.includes("car") ||
    normalizedMessage.includes("bike");

  return hasEligibilitySignal && extractVehicleRegistrationYear(normalizedMessage) !== null;
}

function isVehicleYearEligibilityFollowUp(normalizedMessage: string) {
  const hasRegistrationYear = extractVehicleRegistrationYear(normalizedMessage) !== null;
  const hasEligibilitySignal =
    normalizedMessage.includes("can i") ||
    normalizedMessage.includes("eligible") ||
    normalizedMessage.includes("apply") ||
    normalizedMessage.includes("service") ||
    normalizedMessage.includes("registered") ||
    normalizedMessage.includes("registration") ||
    normalizedMessage.includes("vehicle") ||
    normalizedMessage.includes("car") ||
    normalizedMessage.includes("bike");

  return hasRegistrationYear && hasEligibilitySignal;
}

function isHsrpContextActive(
  currentService: ServiceRecord | null,
  currentCategory: ConversationState["currentCategory"]
) {
  if (currentCategory === "HSRP") return true;
  return mapCategoryFromService(currentService) === "HSRP";
}

/**
 * Returns true when the user's message looks like a genuine question rather
 * than a direct service-action request (apply / show docs / show fees etc.).
 * Used to route through AI instead of the generic "Would you like to apply?" prompt.
 */
function isConversationalQuestion(message: string): boolean {
  if (message.includes("?")) return true;

  const normalized = message.toLowerCase().trim();

  // Starts with a question word / auxiliary verb
  if (
    /^(what|when|where|why|how|can|could|should|would|is|are|do|does|will|am|may|might|shall|at what)\b/.test(
      normalized
    )
  )
    return true;

  // Question patterns anywhere in the message
  if (
    [
      /\bcan i\b/,
      /\bshould i\b/,
      /\bdo i\b/,
      /\bwill i\b/,
      /\bam i\b/,
      /\bis it\b/,
      /\bhow (do|can|should|long|much|many)\b/,
      /\bwhat (is|are|age|documents|happens|photo|proof)\b/,
      /\bwhen (should|can|do|is|are|will|to)\b/,
      /\bat what age\b/,
      /\bwithout (a |the )?\w+\b/,
      /\bdont have\b/,
      /\bdon't have\b/,
      /\bno \w+ (can|will|do|is)\b/,
    ].some((pattern) => pattern.test(normalized))
  )
    return true;

  // Statement-form questions: "X is mandatory", "X is required", "X is needed", etc.
  return /\b(mandatory|required|needed|necessary|compulsory|needed|acceptable|allowed|valid|eligible|minimum|maximum)\b/.test(
    normalized
  );
}

function findHsrpService(services: ServiceRecord[]) {
  return (
    services.find((service) => {
      const haystack = `${service.title} ${service.displayName || ""} ${service.description || ""}`.toLowerCase();
      return haystack.includes("hsrp") || haystack.includes("high security number plate");
    }) || null
  );
}

function buildHsrpEligibilityReply(
  language: ConversationState["language"],
  hsrpService: ServiceRecord | null,
  registrationYear: number
) {
  const serviceName = hsrpService ? presentServiceName(hsrpService) : "HSRP Number Plate Booking";

  if (registrationYear < 2019) {
    if (language === "Hindi") {
      return `${serviceName} के लिए आपका vehicle year eligible लगता है.

- April 2019 से पहले registered vehicles के लिए HSRP retrofit booking की जा सकती है.
- RC details share करके आप booking process शुरू कर सकते हैं.
- अगर आप चाहें तो मैं documents, process, fees या apply link अभी बता सकता हूँ.`;
    }

    if (language === "Hinglish") {
      return `${serviceName} ke liye aapka vehicle year eligible lagta hai.

- April 2019 se pehle registered vehicles ke liye HSRP retrofit booking ki ja sakti hai.
- RC details share karke aap booking process start kar sakte ho.
- Agar aap chaho to main documents, process, fees ya apply link abhi bata sakta hoon.`;
    }

    if (language === "Telugu") {
      return `${serviceName} కోసం మీ vehicle year eligible గా కనిపిస్తోంది.

- April 2019 కి ముందు registered అయిన vehicles కోసం HSRP retrofit booking చేయవచ్చు.
- RC details షేర్ చేసి మీరు booking process ప్రారంభించవచ్చు.
- మీరు కోరుకుంటే నేను documents, process, fees లేదా apply link ఇప్పుడే చెబుతాను.`;
    }

    return `Your vehicle year looks eligible for ${serviceName}.

- HSRP retrofit booking is mainly for vehicles registered before April 2019.
- You can start the booking by sharing your RC details.
- If you want, I can show the documents, process, fees, or apply link now.`;
  }

  if (registrationYear === 2019) {
    if (language === "Hindi") {
      return `${serviceName} के लिए 2019 cutoff important है.

- April 1, 2019 से पहले registered vehicle हो तो HSRP booking apply की जा सकती है.
- April 1, 2019 के बाद registered vehicle में HSRP आमतौर पर dealership से पहले से लगा होना चाहिए.
- अगर आप exact registration month बताएं, तो मैं next step सही बता दूंगा.`;
    }

    if (language === "Hinglish") {
      return `${serviceName} ke liye 2019 cutoff important hai.

- Agar vehicle April 1, 2019 se pehle registered hai to HSRP booking apply ki ja sakti hai.
- Agar vehicle April 1, 2019 ke baad registered hai to HSRP usually dealership se pehle se fitted hota hai.
- Aap exact registration month bata do, main sahi next step bata deta hoon.`;
    }

    if (language === "Telugu") {
      return `${serviceName} కోసం 2019 cutoff ముఖ్యమైనది.

- Vehicle April 1, 2019 కి ముందు registered అయితే HSRP booking apply చేయవచ్చు.
- Vehicle April 1, 2019 తర్వాత registered అయితే HSRP సాధారణంగా dealership నుంచే fitted అయి ఉండాలి.
- మీరు exact registration month చెబితే, నేను సరైన next step చెబుతాను.`;
    }

    return `The 2019 cutoff matters for ${serviceName}.

- If the vehicle was registered before April 1, 2019, HSRP booking can usually be applied for.
- If it was registered on or after April 1, 2019, HSRP should usually already be fitted by the dealership.
- Share the exact registration month and I can tell you the correct next step.`;
  }

  if (language === "Hindi") {
    return `${registrationYear} registered vehicle के लिए नई ${serviceName} booking आमतौर पर नहीं करनी होती.

- April 1, 2019 के बाद registered vehicles में HSRP dealership से ही लगी हुई होनी चाहिए.
- Jaagruk Bharat की HSRP booking आमतौर पर pre-April 2019 vehicles के लिए होती है.
- आप plate पर snap-lock और laser code check कर लें. अगर plate missing, damaged, या incorrect है तो मैं next step बताता हूँ.`;
  }

  if (language === "Hinglish") {
    return `${registrationYear} registered vehicle ke liye nayi ${serviceName} booking usually nahi karni hoti.

- April 1, 2019 ke baad registered vehicles mein HSRP dealership se hi fitted hona chahiye.
- Jaagruk Bharat ki HSRP booking mainly pre-April 2019 vehicles ke liye hoti hai.
- Aap plate par snap-lock aur laser code check kar lo. Agar plate missing, damaged, ya incorrect hai to main next step bata deta hoon.`;
  }

  if (language === "Telugu") {
    return `${registrationYear} registered vehicle కోసం కొత్త ${serviceName} booking సాధారణంగా అవసరం ఉండదు.

- April 1, 2019 తర్వాత registered అయిన vehicles కి HSRP dealership నుంచే fitted అయి ఉండాలి.
- Jaagruk Bharat HSRP booking ప్రధానంగా pre-April 2019 vehicles కోసం ఉంటుంది.
- మీ plate పై snap-lock మరియు laser code ఉన్నాయో check చేయండి. Plate missing, damaged, లేదా incorrect అయితే నేను next step చెబుతాను.`;
  }

  return `A newly registered ${registrationYear} vehicle usually should not need a fresh ${serviceName} booking.

- Vehicles registered on or after April 1, 2019 should usually already have HSRP fitted by the dealership.
- Jaagruk Bharat HSRP booking is mainly for pre-April 2019 vehicles.
- Please check whether your plate already has the snap-lock and laser code. If the plate is missing, damaged, or incorrect, I can guide the next step.`;
}

function buildDrivingAgeEligibilityReply(
  language: ConversationState["language"],
  learnerService: ServiceRecord | null
) {
  const learnerName = learnerService ? presentServiceName(learnerService) : "Learner's Driving License";

  if (language === "Hindi") {
    return `${learnerName} के लिए age rule समझ लीजिए:\n\n- 18 से कम उम्र में सामान्य/गेयर्ड Driving License नहीं बनता।\n- कई राज्यों में 16+ उम्र पर (parent/guardian consent के साथ) gearless two-wheeler (up to 50cc) के लिए Learner License मिल सकता है।\n- 18+ पर regular Learner और आगे Permanent License apply किया जाता है।\n\nअगर आप चाहें, मैं आपके लिए सही ${learnerName} path में documents, process या fees अभी बताता हूँ।`;
  }

  if (language === "Hinglish") {
    return `${learnerName} ke liye age rule simple hai:\n\n- Under 18, regular/geared Driving License usually allowed nahi hota.\n- Kai states mein 16+ age par (parent/guardian consent ke saath) gearless two-wheeler (up to 50cc) ke liye Learner License mil sakta hai.\n- 18+ par regular Learner aur phir Permanent License apply hota hai.\n\nAgar aap chaho, main abhi aapke case ke liye right ${learnerName} documents, process ya fees bata deta hoon.`;
  }

  if (language === "Telugu") {
    return `${learnerName} కి age rule ఇలా ఉంటుంది:\n\n- 18 కన్నా తక్కువ వయస్సులో regular/geared Driving License సాధారణంగా రాదు.\n- చాలా రాష్ట్రాల్లో 16+ వయస్సులో (parent/guardian consentతో) gearless two-wheeler (up to 50cc) కోసం Learner License రావచ్చు.\n- 18+ తర్వాత regular Learner మరియు Permanent License కోసం apply చేస్తారు.\n\nమీకు కావాలంటే, మీ caseకి సరిపోయే ${learnerName} documents, process లేదా fees ఇప్పుడే చెబుతాను.`;
  }

  return `For ${learnerName}, here is the age rule:\n\n- Under 18, a regular/geared Driving License is usually not allowed.\n- In many states, at age 16+ (with parent/guardian consent), you may get a Learner License for a gearless two-wheeler (up to 50cc).\n- At 18+, you can apply for regular Learner and then Permanent License.\n\nIf you want, I can now guide your exact ${learnerName} documents, process, or fees.`;
}

function isPanMinorEligibilityQuestion(
  normalizedMessage: string,
  currentService: ServiceRecord | null,
  currentCategory: ConversationState["currentCategory"]
) {
  const hasPanContext =
    currentCategory === "PAN" ||
    mapCategoryFromService(currentService) === "PAN" ||
    normalizedMessage.includes("pan");

  if (!hasPanContext) return false;

  const hasAgeSignal =
    normalizedMessage.includes("under 18") ||
    normalizedMessage.includes("below 18") ||
    normalizedMessage.includes("minor") ||
    normalizedMessage.includes("less than 18") ||
    normalizedMessage.includes("dont have 18") ||
    normalizedMessage.includes("don't have 18") ||
    /\b(?:16|17)\b/.test(normalizedMessage);

  const hasEligibilitySignal =
    normalizedMessage.includes("can i") ||
    normalizedMessage.includes("can still apply") ||
    normalizedMessage.includes("eligible") ||
    normalizedMessage.includes("apply");

  return hasAgeSignal && hasEligibilitySignal;
}

function buildPanMinorEligibilityReply(
  language: ConversationState["language"],
  service: ServiceRecord | null
) {
  const serviceName = service ? presentServiceName(service) : "New PAN Card";

  if (language === "Hindi") {
    return `हाँ, ${serviceName} के लिए 18 साल होना ज़रूरी नहीं है.\n\n- Minor भी PAN के लिए apply कर सकता है.\n- Minor application आमतौर पर parent या guardian के through की जाती है.\n- Parent/guardian details और supporting documents की ज़रूरत पड़ सकती है.\n- PAN issue होने के बाद, future में details update की जा सकती हैं अगर needed हो.\n\nअगर आप चाहें, मैं अभी minor PAN के documents, process, या apply steps बता सकता हूँ.`;
  }

  if (language === "Hinglish") {
    return `Haan, ${serviceName} ke liye 18 years hona mandatory nahi hai.\n\n- Minor bhi PAN ke liye apply kar sakta hai.\n- Minor application usually parent ya guardian ke through ki jaati hai.\n- Parent/guardian details aur supporting documents ki zarurat pad sakti hai.\n- PAN issue hone ke baad future mein details update ki ja sakti hain if needed.\n\nAgar aap chaho, main abhi minor PAN ke documents, process, ya apply steps bata deta hoon.`;
  }

  if (language === "Telugu") {
    return `అవును, ${serviceName} కోసం 18 సంవత్సరాలు పూర్తి కావాలి అనేది తప్పనిసరి కాదు.\n\n- Minor కూడా PAN కోసం apply చేయవచ్చు.\n- Minor application సాధారణంగా parent లేదా guardian ద్వారా చేస్తారు.\n- Parent/guardian details మరియు supporting documents అవసరం కావచ్చు.\n- PAN issue అయిన తర్వాత future లో details update చేయవచ్చు.\n\nమీకు కావాలంటే, నేను ఇప్పుడు minor PAN documents, process, లేదా apply steps చెబుతాను.`;
  }

  return `Yes, you can still apply for ${serviceName} even if you are under 18.\n\n- A minor can apply for a PAN card.\n- The application is usually made through a parent or legal guardian.\n- Parent or guardian details and supporting documents may be required.\n- If needed, the PAN details can be updated later.\n\nIf you want, I can now show the documents, process, or apply steps for a minor PAN application.`;
}

function buildQuestionGuardReply(
  language: ConversationState["language"],
  service: ServiceRecord,
  normalizedMessage: string,
  copy: CopyBlock
) {
  const category = mapCategoryFromService(service);
  const haystack = buildServiceMatchText(service);
  const serviceName = presentServiceName(service);
  const missingSignal =
    normalizedMessage.includes("dont have") ||
    normalizedMessage.includes("don't have") ||
    normalizedMessage.includes("without") ||
    normalizedMessage.includes("no ");

  const asksAboutAddressProof = normalizedMessage.includes("address proof");
  const asksAboutMandatory =
    normalizedMessage.includes("mandatory") ||
    normalizedMessage.includes("required") ||
    normalizedMessage.includes("necessary") ||
    normalizedMessage.includes("needed");
  const asksAboutVehicleGap =
    normalizedMessage.includes("vehicle") ||
    normalizedMessage.includes("car") ||
    normalizedMessage.includes("bike") ||
    normalizedMessage.includes("rc");

  if (category === "HSRP" && missingSignal && asksAboutVehicleGap) {
    if (language === "Hindi") {
      return `${serviceName} बिना registered vehicle और RC details के आगे नहीं बढ़ सकता. यह booking किसी existing vehicle के लिए होती है, खासकर pre-April 2019 registration cases में. अगर आपके पास vehicle number या RC नहीं है, तो HSRP booking अभी proceed नहीं होगी.\n\n${copy.askMore}`;
    }

    if (language === "Hinglish") {
      return `${serviceName} bina registered vehicle aur RC details ke proceed nahi ho sakta. Ye booking existing vehicle ke liye hoti hai, especially pre-April 2019 registration cases mein. Agar aapke paas vehicle number ya RC nahi hai, to HSRP booking abhi start nahi ho payegi.\n\n${copy.askMore}`;
    }

    if (language === "Telugu") {
      return `${serviceName} కోసం registered vehicle మరియు RC details లేకపోతే process ముందుకు వెళ్లదు. ఈ booking existing vehicle కోసం ఉంటుంది, ముఖ్యంగా pre-April 2019 registration cases కి. మీ వద్ద vehicle number లేదా RC లేకపోతే HSRP booking ఇప్పుడే proceed కాదు.\n\n${copy.askMore}`;
    }

    return `${serviceName} cannot proceed without a registered vehicle and RC details. This booking is for an existing vehicle, mainly for pre-April 2019 registration cases. If you do not have the vehicle number or RC details, the HSRP booking cannot be started yet.\n\n${copy.askMore}`;
  }

  if (
    category === "AADHAAR" &&
    /update|correction|change|address/.test(haystack) &&
    asksAboutAddressProof &&
    (asksAboutMandatory || missingSignal)
  ) {
    if (language === "Hindi") {
      return `Address-related ${serviceName} में address proof आमतौर पर जरूरी होता है. अगर आपके पास accepted address proof नहीं है, तो उस specific update को पहले proceed नहीं किया जा सकता. पहले valid address proof arrange करना होगा, फिर Jaagruk Bharat team exact accepted document list के साथ help करेगी.\n\n${copy.askMore}`;
    }

    if (language === "Hinglish") {
      return `Address-related ${serviceName} mein address proof usually mandatory hota hai. Agar aapke paas accepted address proof nahi hai, to ye specific update abhi proceed nahi hoga. Pehle valid address proof arrange karna padega, phir Jaagruk Bharat team exact accepted document list ke saath help karegi.\n\n${copy.askMore}`;
    }

    if (language === "Telugu") {
      return `Address-related ${serviceName} కోసం address proof సాధారణంగా అవసరం ఉంటుంది. మీ వద్ద accepted address proof లేకపోతే ఆ specific update ఇప్పుడే proceed కాదు. ముందుగా valid address proof arrange చేయాలి, తర్వాత Jaagruk Bharat team exact accepted document list తో help చేస్తుంది.\n\n${copy.askMore}`;
    }

    return `For an address-related ${serviceName}, address proof is usually mandatory. If you do not have an accepted address proof, that specific update cannot proceed yet. You would first need to arrange a valid address proof, and then the Jaagruk Bharat team can confirm the exact accepted document options.\n\n${copy.askMore}`;
  }

  return null;
}

function buildCompanyReply(
  intent: string,
  language: ConversationState["language"],
  activeService: ServiceRecord | null,
  copy: CopyBlock
) {
  const serviceName = activeService ? presentServiceName(activeService) : null;
  const applyLine = buildApplyLine(activeService);
  const trustPoints =
    activeService?.trustPoints?.length
      ? activeService.trustPoints
      : [
          "no travel and no waiting in lines",
          "expert-guided filing to avoid form errors",
          "real support team till completion",
          "secure, single-window process on Jaagruk Bharat",
        ];
  const comparisonPoints =
    activeService?.comparisonPoints?.length
      ? activeService.comparisonPoints
      : [
          "no office visits, no queue, no agent chasing",
          "guided end-to-end support in minutes, not hours of confusion",
          "document checks and application support till submission",
          "dedicated help if portal or OTP issues happen",
        ];

  if (intent === "TRUST") {
    if (language === "Hindi") {
      return `${serviceName ? `${serviceName} के लिए ` : ""}आप Jaagruk Bharat पर भरोसा कर सकते हैं क्योंकि हम सिर्फ जानकारी नहीं देते, आपका काम पूरा होने तक साथ रहते हैं.\n\n${bulletLines(trustPoints)}\n\nअगर आप चाहें तो मैं अभी apply link शेयर कर सकता हूँ.${applyLine}`;
    }

    if (language === "Hinglish") {
      return `${serviceName ? `${serviceName} ke liye ` : ""}aap Jaagruk Bharat par trust kar sakte hain kyunki hum sirf information nahi dete, hum aapka kaam complete karwane tak saath rehte hain.\n\n${bulletLines(trustPoints)}\n\nAgar aap chahen to main abhi ${serviceName || "service"} ka apply link share kar doon.${applyLine}`;
    }

    if (language === "Telugu") {
      return `${serviceName ? `${serviceName} కోసం ` : ""}Jaagruk Bharat ను నమ్మవచ్చు, ఎందుకంటే మేము కేవలం సమాచారం మాత్రమే కాదు, మీ పని పూర్తి అయ్యే వరకు సహాయం చేస్తాము.\n\n${bulletLines(trustPoints)}\n\nమీకు కావాలంటే నేను ఇప్పుడే apply link షేర్ చేస్తాను.${applyLine}`;
    }

    return `${serviceName ? `For your ${serviceName}, ` : ""}You can trust Jaagruk Bharat because we focus on completion, not just information. Your work is guided end-to-end by a real support team.\n\n${bulletLines(trustPoints)}\n\nIf you want, I can share the apply link right now.${applyLine}`;
  }

  if (intent === "COMPARISON") {
    if (language === "Hindi") {
      return `बहुत अच्छा सवाल। सरकारी पोर्टल पर शुल्क कम हो सकता है, लेकिन समय, गलती और दोबारा काम की लागत बहुत बढ़ जाती है। Jaagruk Bharat में आपको ${serviceName || "service"} के लिए fast और guided support मिलता है.\n\n${bulletLines(comparisonPoints)}\n\nसीधी बात: आपका काम जल्दी और सही तरीके से पूरा हो। इसी लिए लोग Jaagruk Bharat चुनते हैं। ${copy.askMore}${applyLine}`;
    }

    if (language === "Hinglish") {
      return `Great question. Government portal ka service free ho sakta hai, lekin time, confusion aur rework ka cost high hota hai. Jaagruk Bharat mein aapko ${serviceName || "service"} ke liye fast, guided aur stress-free support milta hai.\n\n${bulletLines(comparisonPoints)}\n\nAapka goal simple hai: kaam jaldi aur sahi ho. Isi liye log Jaagruk Bharat choose karte hain. ${copy.askMore}${applyLine}`;
    }

    if (language === "Telugu") {
      return `చాలా మంచి ప్రశ్న. ప్రభుత్వ పోర్టల్‌లో ఫీజు తక్కువగా ఉండొచ్చు, కానీ సమయం, తప్పులు, మళ్లీ చేయాల్సిన పని ఖర్చు ఎక్కువ అవుతుంది. Jaagruk Bharat‌లో మీకు ${serviceName || "service"} కోసం వేగంగా మరియు guided support లభిస్తుంది.\n\n${bulletLines(comparisonPoints)}\n\nసింపుల్‌గా చెప్పాలంటే: మీ పని త్వరగా, సరిగ్గా పూర్తవుతుంది. అందుకే ప్రజలు Jaagruk Bharat‌ని ఎంచుకుంటారు. ${copy.askMore}${applyLine}`;
    }

    return `Great question. The government path may look cheaper, but the real cost is time, retries, and mistakes. On Jaagruk Bharat, you get fast, guided, end-to-end support for ${serviceName || "your application"}.\n\n${bulletLines(comparisonPoints)}\n\nSimple outcome: your work gets done quickly and correctly. ${copy.askMore}${applyLine}`;
  }

  return null;
}

function buildBenefitsReply(
  language: ConversationState["language"],
  copy: CopyBlock
) {
  const benefits = [
    "no office visits — apply from anywhere, anytime",
    "expert-guided filing to avoid common form mistakes",
    "real support team to help from start to finish",
    "single window across PAN, Aadhaar, Passport, Driving License, Certificates, Government Schemes, Business Registration and more",
    "secure document handling with no unnecessary sharing",
    "dedicated help if OTP, portal, or verification issues come up",
  ];

  if (language === "Hindi") {
    return `Jaagruk Bharat पर आपको ये फायदे मिलते हैं:\n\n${bulletLines(benefits)}\n\n${copy.servicesPrompt}`;
  }
  if (language === "Hinglish") {
    return `Jaagruk Bharat par aapko ye faayde milte hain:\n\n${bulletLines(benefits)}\n\n${copy.servicesPrompt}`;
  }
  if (language === "Telugu") {
    return `Jaagruk Bharat వద్ద మీకు ఈ ప్రయోజనాలు ఉంటాయి:\n\n${bulletLines(benefits)}\n\n${copy.servicesPrompt}`;
  }
  return `Here's what you get with Jaagruk Bharat:\n\n${bulletLines(benefits)}\n\n${copy.servicesPrompt}`;
}

function buildScopeReply(
  language: ConversationState["language"],
  copy: CopyBlock
) {
  if (language === "Hindi") {
    return `नहीं, हम सिर्फ एक service तक सीमित नहीं हैं। Jaagruk Bharat पर हम PAN Card, Aadhaar, Passport, Driving License, Voter ID, Certificates, Government Schemes, Business Registration aur bahut saari services mein help karte hain.\n\n${copy.servicesPrompt}`;
  }
  if (language === "Hinglish") {
    return `Nahi, hum sirf ek service tak limited nahi hain. Jaagruk Bharat par hum PAN Card, Aadhaar, Passport, Driving License, Voter ID, Certificates, Government Schemes, Business Registration aur bahut saari services mein help karte hain.\n\n${copy.servicesPrompt}`;
  }
  if (language === "Telugu") {
    return `లేదు, మేము ఒక్క service కే పరిమితం కాదు. Jaagruk Bharat లో మేము PAN Card, Aadhaar, Passport, Driving License, Voter ID, Certificates, Government Schemes, Business Registration మరియు మరిన్ని services లో సహాయం చేస్తాం.\n\n${copy.servicesPrompt}`;
  }
  return `No, we are not limited to one service. Through Jaagruk Bharat, we help with PAN Card, Aadhaar, Passport, Driving License, Voter ID, Certificates, Government Schemes, Business Registration, and many more.\n\n${copy.servicesPrompt}`;
}

type CopyBlock = {
  intro: string;
  askChoice: string;
  askApply: string;
  askMore: string;
  eligibilityLabel: string;
  docsLabel: string;
  processLabel: string;
  feesLabel: string;
  statusLabel: string;
  genericHelp: string;
  servicesPrompt: string;
};

function getCopy(language: ConversationState["language"]): CopyBlock {
  if (language === "Hinglish") {
    return {
      intro:
        "Main aapki Jaagruk Bharat ke through service application mein help kar sakta hoon.",
      askChoice: "Kya aap abhi apply karna chahte hain, ya pehle documents, process ya fees dekhna chahenge?",
      askApply: "Kya aap abhi application start karna chahte hain?",
      askMore: "Kya aap documents, process, fees ya apply link mein se kuch dekhna chahenge?",
      eligibilityLabel: "Eligibility criteria",
      docsLabel: "Required documents",
      processLabel: "Process",
      feesLabel: "Fees information",
      statusLabel: "Status tracking jaldi available hogi.",
      genericHelp:
        "Main PAN, Aadhaar, Passport, Driving License, Voter ID, certificates aur kai aur services mein help kar sakta hoon.",
      servicesPrompt: "Please batayein aapko kaunsi service chahiye.",
    };
  }

  if (language === "Hindi") {
    return {
      intro:
        "मैं आपकी Jaagruk Bharat के माध्यम से सेवा आवेदन में मदद कर सकता हूँ।",
      askChoice: "क्या आप अभी आवेदन करना चाहते हैं, या पहले दस्तावेज़, प्रक्रिया या शुल्क जानना चाहेंगे?",
      askApply: "क्या आप अभी आवेदन शुरू करना चाहते हैं?",
      askMore: "क्या आप दस्तावेज़, प्रक्रिया, शुल्क या आवेदन लिंक में से कुछ देखना चाहेंगे?",
      eligibilityLabel: "पात्रता मानदंड",
      docsLabel: "जरूरी दस्तावेज़",
      processLabel: "प्रक्रिया",
      feesLabel: "शुल्क जानकारी",
      statusLabel: "स्टेटस ट्रैकिंग जल्द उपलब्ध होगी।",
      genericHelp:
        "मैं PAN, Aadhaar, Passport, Driving License, Voter ID, certificates और कई अन्य सेवाओं में मदद कर सकता हूँ।",
      servicesPrompt: "कृपया बताइए आपको कौन सी सेवा चाहिए।",
    };
  }

  if (language === "Telugu") {
    return {
      intro: "Jaagruk Bharat ద్వారా సేవకు అప్లై చేయడంలో నేను మీకు సహాయం చేస్తాను.",
      askChoice:
        "మీరు ఇప్పుడే అప్లై చేయాలనుకుంటున్నారా, లేక ముందుగా డాక్యుమెంట్లు, ప్రాసెస్ లేదా ఫీజులు చూడాలనుకుంటున్నారా?",
      askApply: "మీరు ఇప్పుడే అప్లికేషన్ ప్రారంభించాలనుకుంటున్నారా?",
      askMore: "డాక్యుమెంట్లు, ప్రాసెస్, ఫీజులు లేదా అప్లై లింక్‌లో ఏది చూడాలనుకుంటున్నారు?",
      eligibilityLabel: "Eligibility criteria",
      docsLabel: "అవసరమైన డాక్యుమెంట్లు",
      processLabel: "ప్రాసెస్",
      feesLabel: "ఫీజుల సమాచారం",
      statusLabel: "స్టేటస్ ట్రాకింగ్ త్వరలో అందుబాటులో ఉంటుంది.",
      genericHelp:
        "నేను PAN, Aadhaar, Passport, Driving License, Voter ID, certificates మరియు మరెన్నో సేవల్లో సహాయం చేయగలను.",
      servicesPrompt: "దయచేసి మీకు ఏ సేవ కావాలో చెప్పండి.",
    };
  }

  return {
    intro: "I can help you apply for services through Jaagruk Bharat.",
    askChoice:
      "Would you like to apply now, or would you prefer to see documents, process, or fees first?",
    askApply: "Would you like to start the application now?",
    askMore: "Would you like to see documents, process, fees, or the apply link next?",
    eligibilityLabel: "Eligibility criteria",
    docsLabel: "Required documents",
    processLabel: "Process",
    feesLabel: "Fees information",
    statusLabel: "Status tracking will be available soon.",
    genericHelp:
      "I can help with PAN, Aadhaar, Passport, Driving License, Voter ID, certificates, business services, and more.",
    servicesPrompt: "Please tell me which service you need help with.",
  };
}

function buildApplyLine(service: ServiceRecord | null) {
  return `\n\n${toMarkdownLink(extractApplyLink(service))}`;
}

function withOptionalApplyLink(text: string, service: ServiceRecord | null, includeApplyLink: boolean) {
  return includeApplyLink ? `${text}${buildApplyLine(service)}` : text;
}

function removeNonPlatformCharges(feesText: string, language: ReturnType<typeof detectLanguage>) {
  const lines = feesText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const keptLines = lines.filter((line) => {
    const normalized = line.toLowerCase();
    return !(
      normalized.includes("government") ||
      normalized.includes("govt") ||
      normalized.includes("operator charge") ||
      normalized.includes("portal charge") ||
      normalized.includes("third-party") ||
      normalized.includes("third party") ||
      normalized.includes("tax")
    );
  });

  if (keptLines.length) {
    return keptLines.join("\n");
  }

  if (language === "Hindi") {
    return "Jaagruk Bharat service charges service ke hisaab se vary karte hain. Application start hote hi hamari exact charges clear share ki jati hain.";
  }

  if (language === "Hinglish") {
    return "Jaagruk Bharat service charges service ke hisaab se vary kar sakti hain. Application start hote hi ham exact charges clear share karte hain.";
  }

  if (language === "Telugu") {
    return "Jaagruk Bharat service charges సేవను బట్టి మారవచ్చు. Application ప్రారంభించిన వెంటనే మా exact charges క్లియర్‌గా షేర్ చేస్తాము.";
  }

  return "Jaagruk Bharat service charges can vary by service. Once you start the application, we will share the exact charges clearly.";
}

function identifyStage(intent: ChatIntent, currentStage: ConversationStage) {
  if (intent === "DOCUMENTS") return "SHOW_DOCUMENTS";
  if (intent === "PROCESS") return "SHOW_PROCESS";
  if (intent === "FEES") return "SHOW_FEES";
  if (intent === "APPLY") return "APPLY_LINK";
  if (currentStage === "START") return "SERVICE_IDENTIFIED";
  return "ASK_USER_INTENT";
}

function getEligibilityDetails(service: ServiceRecord) {
  if (service.eligibilitySummary?.length) {
    return bulletList(service.eligibilitySummary);
  }

  const haystack = buildServiceMatchText(service);
  const category = mapCategoryFromService(service);

  if (category === "PAN") {
    if (/reprint|duplicate|correction|update/.test(haystack)) {
      return bulletList([
        "The applicant should already have an existing PAN record",
        "Supporting proof should be available for any change or correction request",
        "For reprint, PAN details should match the existing Income Tax database",
      ]);
    }

    return bulletList([
      "Individuals, minors through a parent or guardian, and eligible non-individual entities can apply",
      "Identity, date of birth, and address proof should be available as required",
      "The applicant should need PAN for tax, banking, or compliance purposes",
    ]);
  }

  if (category === "AADHAAR") {
    if (haystack.includes("pan") && haystack.includes("link")) {
      return bulletList([
        "The applicant should have both a valid Aadhaar and PAN",
        "Basic details like name, date of birth, and gender should substantially match across both records",
        "OTP verification or access to the linked mobile may be required during the process",
      ]);
    }

    if (haystack.includes("npci")) {
      return bulletList([
        "The applicant should have a valid Aadhaar number",
        "A bank account eligible for Aadhaar seeding should be available",
        "The bank should support NPCI mapper or DBT-based Aadhaar linking",
      ]);
    }

    if (haystack.includes("pvc")) {
      return bulletList([
        "The applicant should already have a valid Aadhaar number",
        "Aadhaar details should be active and correct in the UIDAI record",
        "OTP access through the registered mobile or the supported verification path may be required",
      ]);
    }

    if (/update|correction|change|address/.test(haystack)) {
      return bulletList([
        "The applicant should already have an Aadhaar number",
        "Supporting proof should be available for the field being updated",
        "The mobile number and Aadhaar details should be accessible for verification",
      ]);
    }
  }

  if (category === "PASSPORT") {
    if (/renew|renewal/.test(haystack)) {
      return bulletList([
        "The applicant should already have an existing passport",
        "The passport holder should be applying for renewal, reissue, or expiry-related continuation",
        "Current identity and address proof should be available as required",
      ]);
    }

    return bulletList([
      "The applicant should be an Indian citizen",
      "Date of birth, identity, and address proof should be available",
      "For minors, parent or guardian details and consent are usually required",
    ]);
  }

  if (category === "VOTER_ID") {
    if ((haystack.includes("aadhaar") || haystack.includes("aadhar")) && haystack.includes("link")) {
      return bulletList([
        "The applicant should already have a Voter ID or EPIC record",
        "A valid Aadhaar number should be available for linking",
        "Basic details should match closely across the voter and Aadhaar records",
      ]);
    }

    if (/update|correction|change/.test(haystack)) {
      return bulletList([
        "The applicant should already have a voter record or EPIC number",
        "Supporting proof should be available for the field being corrected",
        "The applicant should belong to the relevant constituency record being updated",
      ]);
    }

    return bulletList([
      "The applicant should be an Indian citizen",
      "The applicant should generally be 18 years or older on the qualifying date",
      "The applicant should ordinarily reside in the constituency where registration is requested",
    ]);
  }

  if (category === "DRIVING_LICENSE") {
    if (haystack.includes("learner")) {
      return bulletList([
        "For gearless two-wheelers up to 50cc, some states allow 16+ applicants with parent or guardian consent",
        "For regular motor vehicle categories, applicants are usually required to be 18+",
        "Identity, address proof, and basic verification requirements should be met as applicable",
      ]);
    }

    if (haystack.includes("international")) {
      return bulletList([
        "The applicant should already hold a valid Indian Driving License",
        "A valid passport and travel-related documents are usually required",
        "The Driving License should be valid for the vehicle class requested",
      ]);
    }

    if (/renew|renewal|duplicate|reprint|update|address/.test(haystack)) {
      return bulletList([
        "The applicant should already hold an existing Driving License",
        "The license details should be traceable in the transport authority records",
        "Supporting proof should be available if address or other details are being updated",
      ]);
    }

    return bulletList([
      "The applicant should hold a valid Learner License for the required class before applying for a Permanent License",
      "The minimum age should match the vehicle class rules, usually 18+ for regular motor vehicles",
      "The applicant should be ready for the required driving test or authority verification",
    ]);
  }

  if (category === "BUSINESS_REGISTRATION") {
    if (haystack.includes("gst")) {
      return bulletList([
        "Businesses crossing the applicable GST threshold or choosing voluntary registration can apply",
        "A PAN, business details, and principal place of business information should be available",
        "The authorised proprietor, partner, director, or signatory should complete the filing",
      ]);
    }

    if (haystack.includes("fssai")) {
      if (/renew|renewal/.test(haystack)) {
        return bulletList([
          "The applicant should already hold an existing FSSAI registration or licence",
          "The food business should continue to operate under the same or updated entity details",
          "Renewal should usually be initiated before expiry with the required business details",
        ]);
      }

      return bulletList([
        "Food business operators such as manufacturers, traders, transporters, restaurants, or home food businesses can apply",
        "Business details and the nature of food activity should be clearly available",
        "The category of registration or licence depends on turnover, scale, and food activity type",
      ]);
    }

    if (haystack.includes("shop act") || haystack.includes("shop establishment")) {
      return bulletList([
        "A physical shop, office, or commercial establishment in the relevant state can apply",
        "The proprietor or authorised representative should be available for the filing",
        "Business address and establishment details should be ready",
      ]);
    }

    if (haystack.includes("llp") || haystack.includes("company") || haystack.includes("dsc")) {
      return bulletList([
        "The applicant should be the authorised partner, director, owner, or signatory for the entity",
        "The proposed entity details and KYC documents should be available",
        "Compliance requirements vary by entity type and filing objective",
      ]);
    }
  }

  if (category === "CERTIFICATES") {
    if (haystack.includes("income certificate")) {
      return bulletList([
        "The applicant should usually be a resident of the relevant state or local jurisdiction",
        "Family income details and supporting proof should be available",
        "The certificate is issued subject to the state authority's verification rules",
      ]);
    }

    if (haystack.includes("caste certificate")) {
      return bulletList([
        "The applicant should belong to the caste or community recognised under the relevant state list",
        "Residence and caste-related supporting proof should be available",
        "Final eligibility depends on state-level verification by the issuing authority",
      ]);
    }

    if (haystack.includes("resident certificate") || haystack.includes("domicile certificate")) {
      return bulletList([
        "The applicant should be a resident of the relevant state or local area",
        "Residence proof should be available for the required period or address",
        "The issuing authority may apply state-specific domicile or residence rules",
      ]);
    }

    if (haystack.includes("ews certificate")) {
      return bulletList([
        "The applicant should belong to the economically weaker section under the relevant state or central rules",
        "The applicant should not fall under the reserved-category criteria where EWS is not applicable",
        "Income and asset limits should be within the prescribed threshold",
      ]);
    }

    if (haystack.includes("legal heir certificate")) {
      return bulletList([
        "The applicant should be a legal heir or immediate family member of the deceased person",
        "Death details and family relationship proof should be available",
        "The local authority will verify heirship before issuance",
      ]);
    }

    if (haystack.includes("birth certificate")) {
      return bulletList([
        "The applicant should be the person concerned, a parent, or a legal guardian",
        "Birth details should be traceable through the relevant registration authority or local body",
        "Supporting information such as date, place, and parent details should be available",
      ]);
    }
  }

  if (category === "GOVERNMENT_SCHEMES") {
    if (haystack.includes("pm kisan")) {
      return bulletList([
        "The beneficiary should satisfy the scheme rules for eligible farmer families",
        "Landholding and identity details should match the applicable records",
        "Aadhaar and bank account details are usually needed for benefit transfer",
      ]);
    }

    if (haystack.includes("pmsby")) {
      return bulletList([
        "The applicant should generally be between 18 and 70 years of age",
        "A savings bank account with auto-debit support is usually required",
        "The applicant should satisfy the insurer and scheme conditions at the time of enrolment",
      ]);
    }

    if (haystack.includes("pmjjby")) {
      return bulletList([
        "The applicant should generally be between 18 and 50 years of age for enrolment",
        "A savings bank account with auto-debit support is usually required",
        "Continuity of cover depends on yearly renewal and scheme conditions",
      ]);
    }

    if (haystack.includes("e shram") || haystack.includes("eshram")) {
      return bulletList([
        "The applicant should be an unorganised worker",
        "The age should generally fall within the supported range, commonly 16 to 59 years",
        "The applicant should not already be covered under excluded organised-sector conditions where not allowed",
      ]);
    }

    return bulletList([
      "Eligibility depends on the scheme's age, income, residence, occupation, or category rules",
      "Aadhaar, bank account, and scheme-specific supporting details are commonly required",
      "Final approval depends on the issuing department or scheme authority verification",
    ]);
  }

  return null;
}

function serviceHasEligibilityCriteria(service: ServiceRecord | null) {
  return Boolean(service && getEligibilityDetails(service));
}

function quickRepliesForStage(stage: ConversationStage, service: ServiceRecord | null = null) {
  const replies = serviceHasEligibilityCriteria(service)
    ? ["Apply now", "Eligibility", "Documents", "Process", "Fees"]
    : ["Apply now", "Documents", "Process", "Fees"];

  if (stage === "SERVICE_IDENTIFIED" || stage === "ASK_USER_INTENT") {
    return replies;
  }

  if (stage === "SHOW_DOCUMENTS" || stage === "SHOW_PROCESS" || stage === "SHOW_FEES") {
    return replies;
  }

  return serviceHasEligibilityCriteria(service) ? ["Eligibility", "Documents", "Process", "Fees"] : ["Apply now"];
}

function buildEligibilityReply(
  language: ConversationState["language"],
  service: ServiceRecord,
  copy: CopyBlock
) {
  const serviceName = presentServiceName(service);
  const details = getEligibilityDetails(service);

  if (!details) {
    if (language === "Hindi") {
      return `${serviceName} के लिए अलग eligibility criteria आमतौर पर लागू नहीं होती। अगर आप चाहें तो मैं documents, process, fees या apply link बता सकता हूँ।`;
    }

    if (language === "Hinglish") {
      return `${serviceName} ke liye separate eligibility criteria usually apply nahi hoti. Agar aap chaho to main documents, process, fees ya apply link bata sakta hoon.`;
    }

    if (language === "Telugu") {
      return `${serviceName} కోసం ప్రత్యేక eligibility criteria సాధారణంగా ఉండదు. మీరు కోరుకుంటే నేను documents, process, fees లేదా apply link చెబుతాను.`;
    }

    return `There is usually no separate eligibility criteria for ${serviceName}. If you want, I can share the documents, process, fees, or apply link.`;
  }

  return `${copy.eligibilityLabel} for ${serviceName}:\n\n${details}\n\n${copy.askApply}`;
}

function buildServiceMatchText(service: ServiceRecord) {
  return `${service.title} ${service.displayName || ""} ${service.description || ""}`.toLowerCase();
}

function mismatchesHighSignalRequest(message: string, service: ServiceRecord) {
  const haystack = buildServiceMatchText(service);

  if ((message.includes("aadhaar") || message.includes("aadhar")) && message.includes("pvc")) {
    return !haystack.includes("pvc");
  }

  if (
    message.includes("voter") &&
    (message.includes("aadhaar") || message.includes("aadhar")) &&
    message.includes("link")
  ) {
    return !(haystack.includes("voter") && (haystack.includes("aadhaar") || haystack.includes("aadhar")) && haystack.includes("link"));
  }

  if (message.includes("caste") && message.includes("certificate") && message.includes("haryana")) {
    return !(haystack.includes("caste") && haystack.includes("haryana"));
  }

  return false;
}

async function resolveService(
  message: string,
  normalizedMessage: string,
  services: ServiceRecord[],
  currentService: ServiceRecord | null,
  currentCategory: ConversationState["currentCategory"],
  detectedIntent: ChatIntent
) {
  const forcedServiceMatch = findForcedServiceMatch(services, normalizedMessage);
  if (forcedServiceMatch && !mismatchesHighSignalRequest(normalizedMessage, forcedServiceMatch)) {
    return forcedServiceMatch;
  }

  const exactServiceMatch = findExactServiceMatch(services, normalizedMessage);
  if (exactServiceMatch && !mismatchesHighSignalRequest(normalizedMessage, exactServiceMatch)) {
    return exactServiceMatch;
  }

  if (
    ((normalizedMessage.includes("aadhaar") || normalizedMessage.includes("aadhar")) && normalizedMessage.includes("pvc")) ||
    (normalizedMessage.includes("voter") && (normalizedMessage.includes("aadhaar") || normalizedMessage.includes("aadhar")) && normalizedMessage.includes("link")) ||
    (normalizedMessage.includes("caste") && normalizedMessage.includes("certificate") && normalizedMessage.includes("haryana"))
  ) {
    return null;
  }

  const detectedCategoryFromMessage = detectCategory(normalizedMessage);
  const followUpOnly =
    ["DOCUMENTS", "PROCESS", "FEES", "APPLY", "STATUS", "ELIGIBILITY"].includes(detectedIntent) &&
    !hasExplicitServiceMention(normalizedMessage) &&
    detectedCategoryFromMessage === "GENERAL";

  if (!currentService && followUpOnly) {
    return null;
  }

  const category =
    detectedCategoryFromMessage !== "GENERAL"
      ? detectedCategoryFromMessage
      : followUpOnly
        ? currentCategory
        : null;

  if (
    currentService &&
    ["DOCUMENTS", "PROCESS", "FEES", "APPLY", "STATUS", "ELIGIBILITY"].includes(detectedIntent) &&
    !hasExplicitServiceMention(normalizedMessage) &&
    detectedCategoryFromMessage === "GENERAL"
  ) {
    return currentService;
  }

  // If current service matches explicit mention, keep it
  if (currentService && hasExplicitServiceMention(normalizedMessage)) {
    const currentTitle = currentService.title.toLowerCase();
    const currentAliases = (currentService.aliases || []).map((alias) => alias.toLowerCase());
    const messageWords = normalizedMessage
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3);
    const matchesCurrent = [currentTitle, ...currentAliases].some((term) =>
      messageWords.some((word) => term.includes(word))
    );
    if (matchesCurrent) {
      return currentService;
    }
  }

  if (detectedCategoryFromMessage !== "GENERAL") {
    const strictCategoryIntentMatch = mapServiceFromCategoryAndIntent(
      services,
      detectedCategoryFromMessage,
      detectedIntent,
      normalizedMessage
    );
    if (strictCategoryIntentMatch) return strictCategoryIntentMatch;

    const categorySpecificMatch = findBestServiceMatch(
      services,
      normalizedMessage,
      detectedCategoryFromMessage
    );
    if (categorySpecificMatch) return categorySpecificMatch;
  }

  const globalServiceMatch = findBestServiceMatch(services, normalizedMessage, null);
  const explicitServiceMatch =
    findBestServiceMatch(services, normalizedMessage, category) || globalServiceMatch;

  if (explicitServiceMatch) return explicitServiceMatch;

  if (currentService) {
    const currentCategoryName = mapCategoryFromService(currentService);
    const mentionsDifferentService =
      hasExplicitServiceMention(normalizedMessage) &&
      !normalizedMessage.includes(currentService.title.toLowerCase()) &&
      !!globalServiceMatch &&
      globalServiceMatch.title !== currentService.title;
    const mentionsDifferentCategory =
      detectedCategoryFromMessage !== "GENERAL" &&
      currentCategoryName !== "GENERAL" &&
      detectedCategoryFromMessage !== currentCategoryName;

    if (!mentionsDifferentCategory && !mentionsDifferentService) {
      const currentTitleWords = (currentService.displayName || currentService.title)
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 2);
      const stillRefersToCurrent = currentTitleWords.some((word) =>
        normalizedMessage.includes(word)
      );

      const followUpIntentOnly =
        ["DOCUMENTS", "PROCESS", "FEES", "APPLY", "STATUS", "ELIGIBILITY"].includes(detectedIntent) &&
        detectedCategoryFromMessage === "GENERAL";

      if (stillRefersToCurrent || followUpIntentOnly) {
        return currentService;
      }
    }
  }

  const aiScopedServices =
    category && category !== "GENERAL"
      ? services.filter((service) => mapCategoryFromService(service) === category)
      : services;

  let service = await detectServiceWithAI(message, aiScopedServices, currentService);
  if (!service && aiScopedServices !== services) {
    service = await detectServiceWithAI(message, services, currentService);
  }
  if (service) return service;
  service = mapServiceFromCategoryAndIntent(
    services,
    category,
    detectedIntent,
    normalizedMessage
  );

  if (service) return service;

  return (
    findBestServiceMatch(services, normalizedMessage, null) || null
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const preferFastResponse = Boolean(body?.preferFastResponse);
    const message = `${body.message || ""}`.trim();
    const services = await getServices();

    if (!message) {
      return NextResponse.json({ reply: "Please enter a message." }, { status: 400 });
    }

    if (!services.length) {
      return NextResponse.json({ reply: "Services are unavailable right now." });
    }

    const language = detectLanguage(message);
    const copy = getCopy(language);
    const normalizedMessage = normalizeUserText(message);
    const companyIntent = detectCompanyIntent(normalizedMessage);
    const category = detectCategory(normalizedMessage);
    const detectedIntent = resolveDetectedIntent(message, normalizedMessage);
    const isGenericFollowUp =
      ["DOCUMENTS", "PROCESS", "FEES", "APPLY", "STATUS", "ELIGIBILITY"].includes(detectedIntent) &&
      !hasExplicitServiceMention(normalizedMessage) &&
      category === "GENERAL";
    const incomingConversation: ConversationState =
      body.conversation || createInitialConversation(language);

    const conversation: ConversationState = {
      ...incomingConversation,
      language,
      currentService: body.currentService || incomingConversation.currentService || null,
    };
    const hsrpContextActive = isHsrpContextActive(
      conversation.currentService,
      conversation.currentCategory
    );

    if (isBareCategoryQuery(normalizedMessage, category, detectedIntent)) {
      const categoryServices = listServicesForCategory(services, category);
      const categoryName = categoryLabel(category) || "this category";
      const serviceList = categoryServices.length
        ? categoryServices.map((item) => `- ${item}`).join("\n")
        : "- Apply now\n- Documents\n- Process\n- Fees";

      return NextResponse.json({
        reply:
          language === "Hindi"
            ? `${categoryName} ke liye ye services available hain:\n\n${serviceList}\n\nPlease exact service choose kijiye.`
            : language === "Telugu"
              ? `${categoryName} కి ఈ services available ఉన్నాయి:\n\n${serviceList}\n\nదయచేసి exact service ఎంచుకోండి.`
              : `We provide these ${categoryName} services through Jaagruk Bharat:\n\n${serviceList}\n\nPlease choose the exact service you need.`,
        conversation: {
          ...conversation,
          stage: "SERVICE_IDENTIFIED",
          currentIntent: "GENERAL",
          currentCategory: category,
          currentService: null,
        },
        quickReplies: categoryServices.slice(0, 4).length
          ? categoryServices.slice(0, 4)
          : ["Documents", "Process", "Fees", "Apply now"],
      });
    }

    if (isGreeting(message)) {
      const greeting = conversation.currentService
        ? language === "Hindi"
          ? `नमस्ते! हम अभी ${presentServiceName(conversation.currentService)} सेवा में आपकी मदद कर रहे हैं.\n\nक्या आप documents, process, fees देखना चाहते हैं या apply करना चाहते हैं?`
          : language === "Hinglish"
            ? `Namaste! Hum abhi ${presentServiceName(conversation.currentService)} service mein aapki help kar rahe hain.\n\nKya aap documents, process, fees dekhna chahte hain ya apply karna chahte hain?`
          : language === "Telugu"
            ? `నమస్తే! మనం ఇప్పుడే ${presentServiceName(conversation.currentService)} సేవలో కొనసాగుతున్నాం.\n\nమీరు documents, process, fees చూడాలనుకుంటున్నారా లేదా apply చేయాలనుకుంటున్నారా?`
            : `Hi! We’re currently helping you with ${presentServiceName(conversation.currentService)}.\n\nWould you like documents, process, fees, or do you want to apply?`
        : `${copy.intro}\n\n${copy.genericHelp}\n\n${copy.servicesPrompt}`;

      return NextResponse.json({
        reply: greeting,
        conversation: {
          ...conversation,
          stage: conversation.currentService ? "ASK_USER_INTENT" : "START",
          currentIntent: conversation.currentIntent,
        },
        quickReplies: conversation.currentService
          ? quickRepliesForStage("ASK_USER_INTENT", conversation.currentService)
          : ["PAN Card", "Aadhaar", "Passport", "Driving License"],
      });
    }

    if (shouldHandleAsCompanyQuestion(companyIntent, normalizedMessage, detectedIntent, !!conversation.currentService)) {
      if (companyIntent === "BENEFITS") {
        return NextResponse.json({
          reply: buildBenefitsReply(language, copy),
          conversation: { ...conversation, currentIntent: "GENERAL" },
          quickReplies: ["PAN Card", "Aadhaar", "Passport", "Driving License"],
        });
      }

      if (companyIntent === "SCOPE") {
        return NextResponse.json({
          reply: buildScopeReply(language, copy),
          conversation: { ...conversation, currentIntent: "GENERAL" },
          quickReplies: ["PAN Card", "Aadhaar", "Passport", "Driving License"],
        });
      }

      const directReply = buildCompanyReply(
        companyIntent!,
        language,
        conversation.currentService,
        copy
      );
      const reply =
        directReply ||
        (await generateAIResponse({
          message,
          service: null,
          intent: companyIntent,
          extraContent: COMPANY_INFO,
          language,
        }));

      return NextResponse.json({
        reply,
        conversation: {
          ...conversation,
          currentIntent: "GENERAL",
        },
        quickReplies: conversation.currentService
          ? quickRepliesForStage("ASK_USER_INTENT", conversation.currentService)
          : ["PAN Card", "Aadhaar", "Passport"],
      });
    }

    if (isDrivingAgeEligibilityQuestion(normalizedMessage)) {
      const learnerService = findLearnerDrivingService(services);
      return NextResponse.json({
        reply: buildDrivingAgeEligibilityReply(language, learnerService),
        service: learnerService,
        conversation: {
          ...conversation,
          stage: "ASK_USER_INTENT",
          currentIntent: "GENERAL",
          currentCategory: learnerService ? mapCategoryFromService(learnerService) : "DRIVING_LICENSE",
          currentService: learnerService,
        },
        quickReplies: quickRepliesForStage("ASK_USER_INTENT", learnerService),
      });
    }

    if (
      isPanMinorEligibilityQuestion(
        normalizedMessage,
        conversation.currentService,
        conversation.currentCategory
      )
    ) {
      const panService =
        conversation.currentService && mapCategoryFromService(conversation.currentService) === "PAN"
          ? conversation.currentService
          : await resolveService(
              message,
              normalizedMessage,
              services,
              conversation.currentService,
              conversation.currentCategory || category,
              "ELIGIBILITY"
            );

      return NextResponse.json({
        reply: buildPanMinorEligibilityReply(language, panService),
        service: panService,
        conversation: {
          ...conversation,
          stage: "ASK_USER_INTENT",
          currentIntent: "ELIGIBILITY",
          currentCategory: panService ? mapCategoryFromService(panService) : "PAN",
          currentService: panService,
        },
        quickReplies: quickRepliesForStage("ASK_USER_INTENT", panService),
      });
    }

    if (
      isHsrpEligibilityQuestion(normalizedMessage) ||
      (hsrpContextActive && isVehicleYearEligibilityFollowUp(normalizedMessage))
    ) {
      const hsrpService = findHsrpService(services);
      const registrationYear = extractVehicleRegistrationYear(normalizedMessage);

      if (registrationYear) {
        const isEligibleForBooking = registrationYear < 2019;

        return NextResponse.json({
          reply: buildHsrpEligibilityReply(language, hsrpService, registrationYear),
          service: hsrpService,
          conversation: {
            ...conversation,
            stage: "ASK_USER_INTENT",
            currentIntent: "GENERAL",
            currentCategory: hsrpService ? mapCategoryFromService(hsrpService) : "HSRP",
            currentService: hsrpService,
          },
          quickReplies: isEligibleForBooking
            ? quickRepliesForStage("ASK_USER_INTENT", hsrpService)
            : serviceHasEligibilityCriteria(hsrpService)
              ? ["Eligibility", "Documents", "Process", "Fees"]
              : ["Documents", "Process", "Fees"],
        });
      }
    }

    if (
      isGenericFollowUp &&
      !conversation.currentService &&
      conversation.currentCategory
    ) {
      const categoryServices = listServicesForCategory(services, conversation.currentCategory);
      const categoryName = categoryLabel(conversation.currentCategory) || "this category";
      const options = categoryServices.slice(0, 4);

      return NextResponse.json({
        reply:
          language === "Hindi"
            ? `${categoryName} के लिए कई services उपलब्ध हैं। कृपया पहले exact service चुनें, फिर मैं eligibility, documents, process, fees या apply link बताऊंगा.\n\n${options.map((item) => `- ${item}`).join("\n")}`
            : language === "Telugu"
              ? `${categoryName} కి చాలా services ఉన్నాయి. ముందు exact service ఎంచుకోండి, తర్వాత నేను eligibility, documents, process, fees లేదా apply link చెబుతాను.\n\n${options.map((item) => `- ${item}`).join("\n")}`
              : `${categoryName} has multiple services. Please choose the exact service first, and then I can help with eligibility, documents, process, fees, or apply link.\n\n${options.map((item) => `- ${item}`).join("\n")}`,
        conversation: {
          ...conversation,
        },
        quickReplies: options.length ? options : ["Aadhaar", "PAN Card", "Passport"],
      });
    }

    const forcedService = forceServiceFromMessage(services, normalizedMessage);

    const shouldKeepCurrentServiceForQuestion =
      !!conversation.currentService &&
      isConversationalQuestion(message) &&
      !hasExplicitServiceMention(normalizedMessage) &&
      category === "GENERAL";

    const service = forcedService
      ? forcedService
      : (isGenericFollowUp || shouldKeepCurrentServiceForQuestion) &&
          conversation.currentService
        ? conversation.currentService
        : await resolveService(
          message,
          normalizedMessage,
          services,
          conversation.currentService,
          conversation.currentCategory || category,
          detectedIntent
        );

    if (isGlobalServiceCatalogQuestion(normalizedMessage)) {
      const categories = listServiceCategories(services);
      const categoryList = categories.map((item) => `- ${item}`).join("\n");

      return NextResponse.json({
        reply:
          language === "Hindi"
            ? `हम Jaagruk Bharat पर कई सेवाएं प्रदान करते हैं, जैसे:\n\n${categoryList}\n\nकृपया बताइए आपको किस सेवा में मदद चाहिए।`
            : language === "Telugu"
              ? `Jaagruk Bharat లో మేము ఈ సేవలు అందిస్తున్నాము:\n\n${categoryList}\n\nమీకు ఏ సేవలో సహాయం కావాలో చెప్పండి.`
              : `We provide many services through Jaagruk Bharat, such as:\n\n${categoryList}\n\nTell me which service you want help with.`,
        conversation: {
          ...conversation,
        },
        quickReplies: categories.slice(0, 4).length
          ? categories.slice(0, 4)
          : ["PAN Card", "Aadhaar", "Passport", "Driving License"],
      });
    }

    if (isServiceDiscoveryQuestion(normalizedMessage) && category !== "GENERAL") {
      const categoryServices = listServicesForCategory(services, category);
      const categoryName = categoryLabel(category) || "this category";
      const serviceList = categoryServices.length
        ? categoryServices.map((item) => `- ${item}`).join("\n")
        : language === "Hindi"
          ? "- आवेदन सहायता\n- दस्तावेज़ मार्गदर्शन\n- अपडेट और correction सहायता"
          : language === "Telugu"
            ? "- అప్లికేషన్ సహాయం\n- డాక్యుమెంట్ గైడెన్స్\n- అప్‌డేట్ సేవలు"
            : "- Application support\n- Document guidance\n- Update-related services";

      return NextResponse.json({
        reply:
          language === "Hindi"
            ? `हम Jaagruk Bharat पर ${categoryName} से जुड़ी ये सेवाएं प्रदान करते हैं:\n\n${serviceList}\n\nक्या आप इनमें से किसी सेवा के documents, process, fees या apply link देखना चाहेंगे?`
            : language === "Telugu"
              ? `Jaagruk Bharat లో ${categoryName} కి సంబంధించిన ఈ సేవలు ఉన్నాయి:\n\n${serviceList}\n\nవీటిలో ఏ సేవకు documents, process, fees లేదా apply link చూడాలనుకుంటున్నారు?`
              : `We provide these ${categoryName} services through Jaagruk Bharat:\n\n${serviceList}\n\nWhich one would you like help with next: documents, process, fees, or apply link?`,
        conversation: {
          ...conversation,
          stage: "SERVICE_IDENTIFIED",
          currentIntent: "GENERAL",
          currentCategory: category,
          currentService: null,
        },
        quickReplies: categoryServices.slice(0, 4).length
          ? categoryServices.slice(0, 4)
          : ["Documents", "Process", "Fees", "Apply now"],
      });
    }

    if (
      !service &&
      conversation.currentCategory &&
      ["DOCUMENTS", "PROCESS", "FEES", "APPLY", "STATUS", "ELIGIBILITY"].includes(detectedIntent)
    ) {
      const categoryServices = listServicesForCategory(services, conversation.currentCategory);
      const categoryName = categoryLabel(conversation.currentCategory) || "this category";
      const options = categoryServices.slice(0, 4);

      return NextResponse.json({
        reply:
          language === "Hindi"
            ? `${categoryName} के लिए कई सेवाएं उपलब्ध हैं। कृपया पहले exact service चुनें, फिर मैं eligibility, documents, process, fees या apply link बताऊंगा.\n\n${options.map((item) => `- ${item}`).join("\n")}`
            : language === "Telugu"
              ? `${categoryName} కి చాలా services ఉన్నాయి. ముందు exact service ఎంచుకోండి, తర్వాత నేను eligibility, documents, process, fees లేదా apply link చెబుతాను.\n\n${options.map((item) => `- ${item}`).join("\n")}`
              : `${categoryName} has multiple services. Please choose the exact service first, and then I can help with eligibility, documents, process, fees, or apply link.\n\n${options.map((item) => `- ${item}`).join("\n")}`,
        conversation: {
          ...conversation,
        },
        quickReplies: options.length ? options : ["Aadhaar", "PAN Card", "Passport"],
      });
    }

    if (!service) {
      return NextResponse.json({
        reply: `${copy.genericHelp}\n\n${copy.servicesPrompt}`,
        conversation: {
          ...conversation,
          stage: "START",
          currentIntent: detectedIntent,
          currentCategory: category === "GENERAL" ? null : category,
        },
        quickReplies: ["PAN Card", "Aadhaar", "Passport", "Voter ID"],
      });
    }

    const nextStage = identifyStage(detectedIntent, conversation.stage);
    const resolvedCategory = mapCategoryFromService(service);
    const serviceName = presentServiceName(service);
    const nextConversation: ConversationState = {
      ...conversation,
      stage: nextStage,
      currentIntent: detectedIntent,
      currentCategory: resolvedCategory,
      currentService: service,
    };

    if (service.isActive === false) {
      return NextResponse.json({
        reply:
          language === "Hindi"
            ? `${serviceName} service abhi active nahi hai. Agar aap chahen to main related service suggest kar sakta hoon.`
            : language === "Hinglish"
              ? `${serviceName} service abhi active nahi hai. Agar aap chahen to main related service suggest kar sakta hoon.`
              : language === "Telugu"
                ? `${serviceName} service ప్రస్తుతం active లో లేదు. కావాలంటే నేను related service suggest చేయగలను.`
                : `${serviceName} is currently not active. If you want, I can suggest a related service.`,
        service,
        conversation: nextConversation,
        quickReplies: serviceHasEligibilityCriteria(service)
          ? ["Eligibility", "Documents", "Process", "Fees"]
          : ["Documents", "Process", "Fees"],
      });
    }

    const shouldUseStructuredIntentReply = [
      "ELIGIBILITY",
      "DOCUMENTS",
      "PROCESS",
      "FEES",
      "STATUS",
    ].includes(detectedIntent);

    // Route only open-ended questions through AI. Structured intents like fees and
    // documents should stay deterministic so the model does not override known data.
    if (
      isConversationalQuestion(message) &&
      detectedIntent !== "APPLY" &&
      !shouldUseStructuredIntentReply
    ) {
      const guardedReply = buildQuestionGuardReply(
        language,
        service,
        normalizedMessage,
        copy
      );

      if (guardedReply) {
        return NextResponse.json({
          reply: guardedReply,
          service,
          conversation: {
            ...nextConversation,
            stage: "ASK_USER_INTENT",
          },
          quickReplies: quickRepliesForStage("ASK_USER_INTENT", service),
        });
      }

      const serviceContext = [
        service.description || "",
        service.eligibilitySummary?.join("\n") || "",
        service.documentsSummary?.join("\n") || "",
        service.process || "",
      ]
        .filter(Boolean)
        .join("\n");

      const dynamicFaqContext =
        !preferFastResponse && service.faqUrl
          ? await fetchContentFromUrls(service.faqUrl, message)
          : "";
      const dynamicBodyContext =
        !preferFastResponse && service.bodyUrl
          ? await fetchContentFromUrls(service.bodyUrl, message)
          : "";
      const enrichedServiceContext = [
        serviceContext,
        dynamicFaqContext,
        dynamicBodyContext,
      ]
        .filter(Boolean)
        .join("\n");

      const aiReply = await generateAIResponse({
        message,
        service,
        intent: detectedIntent,
        extraContent: enrichedServiceContext,
        language,
      });

      return NextResponse.json({
        reply: aiReply,
        service,
        conversation: {
          ...nextConversation,
          stage: "ASK_USER_INTENT",
        },
        quickReplies: quickRepliesForStage("ASK_USER_INTENT", service),
      });
    }

    if (detectedIntent === "ELIGIBILITY") {
      return NextResponse.json({
        reply: buildEligibilityReply(language, service, copy),
        service,
        conversation: {
          ...nextConversation,
          stage: "ASK_USER_INTENT",
        },
        quickReplies: quickRepliesForStage("ASK_USER_INTENT", service),
      });
    }

    if (detectedIntent === "DOCUMENTS") {
      const faq =
        !preferFastResponse && service.faqUrl
          ? await fetchContentFromUrls(service.faqUrl, message)
          : "";
      const bodyDocs =
        !preferFastResponse && service.bodyUrl
          ? await fetchContentFromUrls(
              service.bodyUrl,
              `${message} documents required proof eligibility`
            )
          : "";
      const docsSource = topLines(`${faq}\n${bodyDocs}`);
      const structuredDetails = service.documentsSummary?.length
        ? bulletList(service.documentsSummary)
        : "";
      const sourceDetails = isWeakDocumentsText(docsSource) ? "" : docsSource;
      const includeSourceDetails =
        Boolean(sourceDetails) &&
        (isSpecificDocumentDetailQuestion(normalizedMessage) || !structuredDetails);
      const details = structuredDetails
        ? includeSourceDetails
          ? `${structuredDetails}\n\nAdditional details:\n${sourceDetails}`
          : structuredDetails
        : shortText(sourceDetails, safeDocumentsFallback(language, serviceName));
      const textFields =
        service.textFieldsSummary?.length
          ? language === "Hindi"
            ? `\n\nRequired details:\n\n${bulletList(service.textFieldsSummary)}`
            : language === "Hinglish"
              ? `\n\nRequired details:\n\n${bulletList(service.textFieldsSummary)}`
              : language === "Telugu"
                ? `\n\nRequired details:\n\n${bulletList(service.textFieldsSummary)}`
                : `\n\nRequired details:\n\n${bulletList(service.textFieldsSummary)}`
          : "";

      const groundedDocsReply = preferFastResponse
        ? ""
        : await generateGroundedIntentResponse({
            message,
            service,
            intent: "DOCUMENTS",
            language,
            structuredContent: `${details}${textFields}`,
            sourceContent: docsSource,
          });

      const docsReplyBody =
        groundedDocsReply || `${copy.docsLabel} for ${serviceName}:\n\n${details}${textFields}`;

      return NextResponse.json({
        reply: withOptionalApplyLink(
          `${docsReplyBody}\n\n${copy.askApply}`,
          service,
          false
        ),
        service,
        conversation: nextConversation,
        quickReplies: quickRepliesForStage(nextStage, service),
      });
    }

    if (detectedIntent === "PROCESS") {
      const rawProcess = topLines(
        service.processSteps?.length ? service.processSteps.join("\n") : service.process || ""
      );
      const bodyProcess =
        !preferFastResponse && service.bodyUrl
          ? await fetchContentFromUrls(
              service.bodyUrl,
              `${message} process procedure steps apply`
            )
          : "";
      const processSource = looksLikeUsefulProcessText(rawProcess)
        ? rawProcess
        : looksLikeUsefulProcessText(topLines(bodyProcess))
          ? topLines(bodyProcess)
          : "";
      const structuredProcess =
        service.processSteps?.length && !isWeakProcessText(service.processSteps.join("\n"))
          ? bulletList(service.processSteps)
          : "";
      const process = structuredProcess
        ? structuredProcess
        : !processSource
        ? language === "Hindi"
          ? "1. आप आवेदन शुरू करते हैं.\n2. जरूरी दस्तावेज़ साझा करते हैं.\n3. हमारी टीम विवरण verify करके आवेदन आगे बढ़ाती है."
          : language === "Hinglish"
            ? "1. Aap application start karte hain.\n2. Zaroori documents share karte hain.\n3. Hamari team details verify karke process aage badhati hai."
          : language === "Telugu"
            ? "1. మీరు అప్లికేషన్ ప్రారంభిస్తారు.\n2. అవసరమైన డాక్యుమెంట్లు షేర్ చేస్తారు.\n3. మా టీమ్ verify చేసి ప్రాసెస్‌ను ముందుకు తీసుకెళ్తుంది."
            : "1. Start the application through Jaagruk Bharat.\n2. Share the required documents.\n3. Our team verifies the details and moves the service forward."
        : shortText(
            processSource,
            language === "Hindi"
              ? "आप विवरण भरते हैं, दस्तावेज़ जमा करते हैं, और हमारी टीम आवेदन को आगे बढ़ाती है।"
              : language === "Hinglish"
                ? "Aap details share karte hain, documents submit karte hain, aur hamari team application ko aage badhati hai."
              : language === "Telugu"
                ? "మీరు వివరాలు ఇస్తారు, డాక్యుమెంట్లు సమర్పిస్తారు, మా టీమ్ అప్లికేషన్‌ను ముందుకు తీసుకెళ్తుంది."
                : "You share the details, upload documents, and our team helps move the application forward."
          );

      const groundedProcessReply = preferFastResponse
        ? ""
        : await generateGroundedIntentResponse({
            message,
            service,
            intent: "PROCESS",
            language,
            structuredContent: process,
            sourceContent: bodyProcess,
          });

      const processReplyBody =
        groundedProcessReply || `${copy.processLabel} for ${serviceName}:\n\n${process}`;

      return NextResponse.json({
        reply: withOptionalApplyLink(
          `${processReplyBody}\n\n${copy.askApply}`,
          service,
          false
        ),
        service,
        conversation: nextConversation,
        quickReplies: quickRepliesForStage(nextStage, service),
      });
    }

    if (detectedIntent === "FEES") {
      const feeText =
        service.feesSummary ||
        (language === "Hindi"
          ? "शुल्क सेवा के अनुसार बदल सकता है। आवेदन शुरू करते ही हमारी टीम आपको पूरा शुल्क विवरण साझा करेगी।"
          : language === "Hinglish"
            ? "Fees service ke hisaab se alag ho sakti hai. Jaise hi aap application start karenge, hamari team aapko complete fee details share karegi."
          : language === "Telugu"
            ? "ఫీజులు సేవను బట్టి మారవచ్చు. మీరు అప్లై ప్రారంభించిన వెంటనే మా టీమ్ పూర్తి ఫీజు వివరాలు షేర్ చేస్తుంది."
            : "Fees can vary by service. Once you start the application, our team will share the complete fee details.");

      const filteredFeeText = removeNonPlatformCharges(feeText, language);

      return NextResponse.json({
        reply: withOptionalApplyLink(
          `${copy.feesLabel} for ${serviceName}:\n\n${filteredFeeText}\n\n${copy.askApply}`,
          service,
          false
        ),
        service,
        conversation: nextConversation,
        quickReplies: quickRepliesForStage(nextStage, service),
      });
    }

    if (detectedIntent === "STATUS") {
      const statusReply = service.timelineSummary
        ? language === "Hindi"
          ? `${serviceName} के लिए expected timeline:\n\n${service.timelineSummary}\n\n${copy.askMore}`
          : language === "Hinglish"
            ? `${serviceName} ke liye expected timeline:\n\n${service.timelineSummary}\n\n${copy.askMore}`
            : language === "Telugu"
              ? `${serviceName} కోసం expected timeline:\n\n${service.timelineSummary}\n\n${copy.askMore}`
              : `Expected timeline for ${serviceName}:\n\n${service.timelineSummary}\n\n${copy.askMore}`
        : `${copy.statusLabel}\n\n${copy.askMore}`;

      return NextResponse.json({
        reply: statusReply,
        service,
        conversation: {
          ...nextConversation,
          stage: "ASK_USER_INTENT",
        },
        quickReplies: quickRepliesForStage("ASK_USER_INTENT", service),
      });
    }

    if (detectedIntent === "APPLY") {
      return NextResponse.json({
        reply: withOptionalApplyLink(
          `${
            language === "Hindi"
              ? `${serviceName} के लिए आप यहां से आवेदन शुरू कर सकते हैं।`
              : language === "Hinglish"
                ? `${serviceName} ke liye aap yahan se application start kar sakte hain.`
              : language === "Telugu"
                ? `${serviceName} కోసం మీరు ఇక్కడి నుంచి అప్లికేషన్ ప్రారంభించవచ్చు.`
                : `You can start your ${serviceName} application here.`
          }\n\n${copy.askMore}`,
          service,
          true
        ),
        service,
        conversation: {
          ...nextConversation,
          stage: "APPLY_LINK",
        },
        quickReplies: serviceHasEligibilityCriteria(service)
          ? ["Eligibility", "Documents", "Process", "Fees"]
          : ["Documents", "Process", "Fees"],
      });
    }

    const intro =
      detectedIntent === "REPRINT"
        ? language === "Hindi"
          ? `${serviceName} खो जाना परेशान करने वाला हो सकता है, लेकिन चिंता न करें. हम Jaagruk Bharat के माध्यम से इसका reprint कराने में आपकी मदद कर सकते हैं.`
          : language === "Hinglish"
            ? `${serviceName} kho jaana pareshan karne wala ho sakta hai, lekin tension mat lijiye. Hum Jaagruk Bharat ke through iske reprint mein aapki help kar sakte hain.`
          : language === "Telugu"
            ? `${serviceName} పోవడం ఇబ్బందిగా ఉంటుంది, కానీ చింతించకండి. Jaagruk Bharat ద్వారా రీప్రింట్‌లో మేము సహాయం చేస్తాము.`
            : serviceAlreadyReflectsIntent(serviceName, "REPRINT")
              ? `I'm sorry to hear that. We can help you with ${serviceName} through Jaagruk Bharat.`
              : `I'm sorry to hear that. We can help you with your ${serviceName} reprint through Jaagruk Bharat.`
        : detectedIntent === "UPDATE"
          ? language === "Hindi"
            ? serviceAlreadyReflectsIntent(serviceName, "UPDATE")
              ? `हम Jaagruk Bharat के माध्यम से आपके ${serviceName} में मदद कर सकते हैं.`
              : `हम Jaagruk Bharat के माध्यम से आपके ${serviceName} update में मदद कर सकते हैं.`
            : language === "Hinglish"
              ? serviceAlreadyReflectsIntent(serviceName, "UPDATE")
                ? `Hum Jaagruk Bharat ke through aapke ${serviceName} mein help kar sakte hain.`
                : `Hum Jaagruk Bharat ke through aapke ${serviceName} update mein help kar sakte hain.`
            : language === "Telugu"
              ? serviceAlreadyReflectsIntent(serviceName, "UPDATE")
                ? `Jaagruk Bharat ద్వారా మీ ${serviceName} లో మేము సహాయం చేస్తాము.`
                : `Jaagruk Bharat ద్వారా మీ ${serviceName} update లో మేము సహాయం చేస్తాము.`
              : serviceAlreadyReflectsIntent(serviceName, "UPDATE")
                ? `We can help you with your ${serviceName} through Jaagruk Bharat.`
                : `We can help you update your ${serviceName} through Jaagruk Bharat.`
          : detectedIntent === "RENEWAL"
            ? language === "Hindi"
              ? serviceAlreadyReflectsIntent(serviceName, "RENEWAL")
                ? `हम Jaagruk Bharat के माध्यम से आपके ${serviceName} में मदद कर सकते हैं.`
                : `हम Jaagruk Bharat के माध्यम से आपके ${serviceName} renewal में मदद कर सकते हैं.`
              : language === "Hinglish"
                ? serviceAlreadyReflectsIntent(serviceName, "RENEWAL")
                  ? `Hum Jaagruk Bharat ke through aapke ${serviceName} mein help kar sakte hain.`
                  : `Hum Jaagruk Bharat ke through aapke ${serviceName} renewal mein help kar sakte hain.`
              : language === "Telugu"
                ? serviceAlreadyReflectsIntent(serviceName, "RENEWAL")
                  ? `Jaagruk Bharat ద్వారా మీ ${serviceName} లో మేము సహాయం చేస్తాము.`
                  : `Jaagruk Bharat ద్వారా మీ ${serviceName} renewal లో మేము సహాయం చేస్తాము.`
                : serviceAlreadyReflectsIntent(serviceName, "RENEWAL")
                  ? `We can help you with your ${serviceName} through Jaagruk Bharat.`
                  : `We can help you renew your ${serviceName} through Jaagruk Bharat.`
            : detectedIntent === "NEW"
              ? language === "Hindi"
                ? `हम Jaagruk Bharat के माध्यम से आपके नए ${serviceName} आवेदन में मदद कर सकते हैं.`
                : language === "Hinglish"
                  ? `Hum Jaagruk Bharat ke through aapke naye ${serviceName} application mein help kar sakte hain.`
                : language === "Telugu"
                  ? `Jaagruk Bharat ద్వారా కొత్త ${serviceName} అప్లికేషన్‌లో మేము సహాయం చేస్తాము.`
                  : `We can help you apply for ${serviceName} through Jaagruk Bharat.`
              : language === "Hindi"
                ? `हम ${serviceName} सेवा में आपकी मदद कर सकते हैं.`
                : language === "Hinglish"
                  ? `Hum ${serviceName} service mein aapki help kar sakte hain.`
                : language === "Telugu"
                  ? `${serviceName} సేవలో మేము మీకు సహాయం చేస్తాము.`
                  : `We can help you with ${serviceName}.`;

    return NextResponse.json({
      reply: `${intro}\n\n${copy.askChoice}`,
      service,
      conversation: {
        ...nextConversation,
        stage: "ASK_USER_INTENT",
      },
      quickReplies: quickRepliesForStage("ASK_USER_INTENT", service),
    });
  } catch (error) {
    console.error("Chat route error:", error);
    return NextResponse.json(
      { reply: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
