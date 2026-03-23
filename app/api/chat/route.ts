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
    .replace(/\breal\b/gi, "")
    .replace(/\s*[-:]+\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanDisplayLabel(title: string) {
  return (title || "")
    .replace(/\breal\b/gi, "")
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

  if (fullText.includes("fssai")) {
    if (/\brenew|renewal\b/.test(fullText)) {
      return "FSSAI Food License Renewal";
    }
    return "FSSAI Food License Registration";
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

  return null;
}

function shouldHandleAsCompanyQuestion(
  companyIntent: string | null,
  normalizedMessage: string,
  detectedIntent: ChatIntent
) {
  if (!companyIntent) return false;
  if (["DOCUMENTS", "PROCESS", "FEES", "APPLY", "STATUS"].includes(detectedIntent)) return false;
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

function buildCompanyReply(
  intent: string,
  language: ConversationState["language"],
  activeService: ServiceRecord | null,
  copy: CopyBlock
) {
  const serviceName = activeService ? presentServiceName(activeService) : null;
  const applyLine = buildApplyLine(activeService);

  if (intent === "TRUST") {
    if (language === "Hindi") {
      return `${serviceName ? `${serviceName} के लिए ` : ""}आप Jaagruk Bharat पर भरोसा कर सकते हैं क्योंकि हमारी टीम आपको सही सेवा चुनने, दस्तावेज़ समझने और आवेदन पूरा करने में step-by-step मदद करती है.\n\n${bulletLines([
        "guided support from start to application",
        "document verification support",
        "single platform experience without multiple portals",
      ])}\n\n${copy.askMore}${applyLine}`;
    }

    if (language === "Hinglish") {
      return `${serviceName ? `${serviceName} ke liye ` : ""}aap Jaagruk Bharat par trust kar sakte hain kyunki hamari team aapko sahi service choose karne, documents samajhne aur application complete karne mein step-by-step help karti hai.\n\n${bulletLines([
        "guided support from start to application",
        "document verification support",
        "single platform experience without multiple portals",
      ])}\n\n${copy.askMore}${applyLine}`;
    }

    if (language === "Telugu") {
      return `${serviceName ? `${serviceName} కోసం ` : ""}Jaagruk Bharat ను నమ్మవచ్చు, ఎందుకంటే మా టీమ్ సరైన సేవను ఎంచుకోవడం నుంచి అప్లికేషన్ పూర్తి చేసే వరకు step-by-step సహాయం చేస్తుంది.\n\n${bulletLines([
        "start నుంచి application వరకు guided support",
        "document verification support",
        "multiple portals అవసరం లేకుండా single platform experience",
      ])}\n\n${copy.askMore}${applyLine}`;
    }

    return `${serviceName ? `For your ${serviceName} service, ` : ""}you can trust Jaagruk Bharat because our team guides you from service selection to application submission.\n\n${bulletLines([
      "guided support from start to apply",
      "help with documents and next steps",
      "one platform instead of multiple confusing portals",
    ])}\n\n${copy.askMore}${applyLine}`;
  }

  if (intent === "COMPARISON") {
    if (language === "Hindi") {
      return `Jaagruk Bharat का फर्क यह है कि हम सिर्फ जानकारी नहीं देते, बल्कि आपको ${serviceName || "service"} application तक guide करते हैं.\n\n${bulletLines([
        "right service identification",
        "documents and process guidance",
        "apply journey on Jaagruk Bharat only",
      ])}\n\n${copy.askMore}${applyLine}`;
    }

    if (language === "Hinglish") {
      return `Jaagruk Bharat ka difference yeh hai ki hum sirf information nahi dete, balki aapko ${serviceName || "service"} application tak guide karte hain.\n\n${bulletLines([
        "right service identification",
        "documents and process guidance",
        "apply journey on Jaagruk Bharat only",
      ])}\n\n${copy.askMore}${applyLine}`;
    }

    if (language === "Telugu") {
      return `Jaagruk Bharat లో తేడా ఏమిటంటే, మేము కేవలం సమాచారం మాత్రమే కాదు, ${serviceName || "service"} application వరకు మీకు guide చేస్తాము.\n\n${bulletLines([
        "right service identification",
        "documents and process guidance",
        "Jaagruk Bharat లోనే apply journey",
      ])}\n\n${copy.askMore}${applyLine}`;
    }

    return `Jaagruk Bharat is different because we do not stop at giving information. We guide you all the way to the ${serviceName || "service"} application.\n\n${bulletLines([
      "right service identification",
      "clear document and process guidance",
      "focused apply journey through Jaagruk Bharat",
    ])}\n\n${copy.askMore}${applyLine}`;
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

async function resolveService(
  message: string,
  normalizedMessage: string,
  services: ServiceRecord[],
  currentService: ServiceRecord | null,
  currentCategory: ConversationState["currentCategory"],
  detectedIntent: ChatIntent
) {
  const forcedServiceMatch = findForcedServiceMatch(services, normalizedMessage);
  if (forcedServiceMatch) return forcedServiceMatch;

  const exactServiceMatch = findExactServiceMatch(services, normalizedMessage);
  if (exactServiceMatch) return exactServiceMatch;

  const detectedCategoryFromMessage = detectCategory(normalizedMessage);
  const followUpOnly =
    ["DOCUMENTS", "PROCESS", "FEES", "APPLY", "STATUS"].includes(detectedIntent) &&
    !hasExplicitServiceMention(normalizedMessage) &&
    detectedCategoryFromMessage === "GENERAL";
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
      const currentTitleWords = currentService.title
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

  let service = await detectServiceWithAI(message, aiScopedServices);
  if (!service && aiScopedServices !== services) {
    service = await detectServiceWithAI(message, services);
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
    const detectedIntent = extractIntent(normalizedMessage);
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

    if (shouldHandleAsCompanyQuestion(companyIntent, normalizedMessage, detectedIntent)) {
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
      const structuredProcess = service.processSteps?.length
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
      return NextResponse.json({
        reply: `${copy.statusLabel}\n\n${copy.askMore}`,
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
