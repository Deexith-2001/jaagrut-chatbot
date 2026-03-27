import { NextRequest, NextResponse } from "next/server";
import { generateAIResponse } from "../../../lib/ai";
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
import { fetchContent } from "../../../lib/content";
import { detectLanguage } from "../../../lib/language";
import { normalizeUserText } from "../../../lib/normalize";
import { detectServiceWithAI } from "../../../lib/serviceAI";
import { getServices } from "../../../lib/services";

function isGreeting(text: string) {
  const normalized = text.toLowerCase().trim();
  return [
    /^hi\b/,
    /^hii\b/,
    /^hai\b/,
    /^hello\b/,
    /^hey\b/,
    /^namaste\b/,
    /^good morning\b/,
  ].some((pattern) => pattern.test(normalized));
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
    raw.includes("price") ||
    raw.includes("cost")
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
  return (
    normalized.includes("what are the services you provide") ||
    normalized.includes("what services do you provide") ||
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

  if (["DOCUMENTS", "PROCESS", "APPLY", "STATUS"].includes(detectedIntent)) return false;
  // Allow FEES intent for comparison questions when there's context
  if (detectedIntent === "FEES" && companyIntent === "COMPARISON" && hasCurrentService) return true;
  if (detectedIntent === "FEES") return false;
  return !hasExplicitServiceMention(normalizedMessage) || companyIntent === "TRUST" || companyIntent === "COMPARISON";
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

type CopyBlock = {
  intro: string;
  askChoice: string;
  askApply: string;
  askMore: string;
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

function identifyStage(intent: ChatIntent, currentStage: ConversationStage) {
  if (intent === "DOCUMENTS") return "SHOW_DOCUMENTS";
  if (intent === "PROCESS") return "SHOW_PROCESS";
  if (intent === "FEES") return "SHOW_FEES";
  if (intent === "APPLY") return "APPLY_LINK";
  if (currentStage === "START") return "SERVICE_IDENTIFIED";
  return "ASK_USER_INTENT";
}

function quickRepliesForStage(stage: ConversationStage) {
  if (stage === "SERVICE_IDENTIFIED" || stage === "ASK_USER_INTENT") {
    return ["Apply now", "Documents", "Process", "Fees"];
  }

  if (stage === "SHOW_DOCUMENTS" || stage === "SHOW_PROCESS" || stage === "SHOW_FEES") {
    return ["Apply now", "Documents", "Process", "Fees"];
  }

  return ["Apply now"];
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
    ["DOCUMENTS", "PROCESS", "FEES", "APPLY", "STATUS"].includes(detectedIntent) &&
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
    ["DOCUMENTS", "PROCESS", "FEES", "APPLY", "STATUS"].includes(detectedIntent) &&
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
        ["DOCUMENTS", "PROCESS", "FEES", "APPLY", "STATUS"].includes(detectedIntent) &&
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
      ["DOCUMENTS", "PROCESS", "FEES", "APPLY", "STATUS"].includes(detectedIntent) &&
      !hasExplicitServiceMention(normalizedMessage) &&
      category === "GENERAL";
    const incomingConversation: ConversationState =
      body.conversation || createInitialConversation(language);

    const conversation: ConversationState = {
      ...incomingConversation,
      language,
      currentService: body.currentService || incomingConversation.currentService || null,
    };

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
          ? ["Documents", "Process", "Fees", "Apply now"]
          : ["PAN Card", "Aadhaar", "Passport", "Driving License"],
      });
    }

    if (shouldHandleAsCompanyQuestion(companyIntent, normalizedMessage, detectedIntent, !!conversation.currentService)) {
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
          ? ["Documents", "Process", "Fees", "Apply now"]
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
        quickReplies: ["Documents", "Process", "Fees", "Apply now"],
      });
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
            ? `${categoryName} के लिए कई services उपलब्ध हैं। कृपया पहले exact service चुनें, फिर मैं documents, process, fees या apply link बताऊंगा.\n\n${options.map((item) => `- ${item}`).join("\n")}`
            : language === "Telugu"
              ? `${categoryName} కి చాలా services ఉన్నాయి. ముందు exact service ఎంచుకోండి, తర్వాత నేను documents, process, fees లేదా apply link చెబుతాను.\n\n${options.map((item) => `- ${item}`).join("\n")}`
              : `${categoryName} has multiple services. Please choose the exact service first, and then I can help with documents, process, fees, or apply link.\n\n${options.map((item) => `- ${item}`).join("\n")}`,
        conversation: {
          ...conversation,
        },
        quickReplies: options.length ? options : ["Aadhaar", "PAN Card", "Passport"],
      });
    }

    const forcedService = forceServiceFromMessage(services, normalizedMessage);

    const service = forcedService
      ? forcedService
      : isGenericFollowUp && conversation.currentService
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
      ["DOCUMENTS", "PROCESS", "FEES", "APPLY", "STATUS"].includes(detectedIntent)
    ) {
      const categoryServices = listServicesForCategory(services, conversation.currentCategory);
      const categoryName = categoryLabel(conversation.currentCategory) || "this category";
      const options = categoryServices.slice(0, 4);

      return NextResponse.json({
        reply:
          language === "Hindi"
            ? `${categoryName} के लिए कई सेवाएं उपलब्ध हैं। कृपया पहले exact service चुनें, फिर मैं documents, process, fees या apply link बताऊंगा.\n\n${options.map((item) => `- ${item}`).join("\n")}`
            : language === "Telugu"
              ? `${categoryName} కి చాలా services ఉన్నాయి. ముందు exact service ఎంచుకోండి, తర్వాత నేను documents, process, fees లేదా apply link చెబుతాను.\n\n${options.map((item) => `- ${item}`).join("\n")}`
              : `${categoryName} has multiple services. Please choose the exact service first, and then I can help with documents, process, fees, or apply link.\n\n${options.map((item) => `- ${item}`).join("\n")}`,
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
        quickReplies: ["Documents", "Process", "Fees"],
      });
    }

    if (detectedIntent === "DOCUMENTS") {
      const faq = service.faqUrl
        ? await fetchContent(service.faqUrl, message)
        : "";
      const bodyDocs = service.bodyUrl
        ? await fetchContent(service.bodyUrl, "documents required proof eligibility")
        : "";
      const docsSource = topLines(`${faq}\n${bodyDocs}`);
      const structuredDetails = service.documentsSummary?.length
        ? bulletList(service.documentsSummary)
        : "";
      const details = structuredDetails
        ? structuredDetails
        : shortText(
            isWeakDocumentsText(docsSource) ? "" : docsSource,
            safeDocumentsFallback(language, serviceName)
          );
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

      return NextResponse.json({
        reply: withOptionalApplyLink(
          `${copy.docsLabel} for ${serviceName}:\n\n${details}${textFields}\n\n${copy.askApply}`,
          service,
          false
        ),
        service,
        conversation: nextConversation,
        quickReplies: quickRepliesForStage(nextStage),
      });
    }

    if (detectedIntent === "PROCESS") {
      const rawProcess = topLines(
        service.processSteps?.length ? service.processSteps.join("\n") : service.process || ""
      );
      const bodyProcess = service.bodyUrl
        ? await fetchContent(service.bodyUrl, "process procedure steps apply")
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

      return NextResponse.json({
        reply: withOptionalApplyLink(
          `${copy.processLabel} for ${serviceName}:\n\n${process}\n\n${copy.askApply}`,
          service,
          false
        ),
        service,
        conversation: nextConversation,
        quickReplies: quickRepliesForStage(nextStage),
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

      return NextResponse.json({
        reply: withOptionalApplyLink(
          `${copy.feesLabel} for ${serviceName}:\n\n${feeText}\n\n${copy.askApply}`,
          service,
          false
        ),
        service,
        conversation: nextConversation,
        quickReplies: quickRepliesForStage(nextStage),
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
        quickReplies: ["Apply now", "Documents", "Process", "Fees"],
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
        quickReplies: ["Documents", "Process", "Fees"],
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
      quickReplies: quickRepliesForStage("ASK_USER_INTENT"),
    });
  } catch (error) {
    console.error("Chat route error:", error);
    return NextResponse.json(
      { reply: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
