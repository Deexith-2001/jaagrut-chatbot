export type ChatIntent =
  | "NEW"
  | "UPDATE"
  | "REPRINT"
  | "RENEWAL"
  | "DOCUMENTS"
  | "PROCESS"
  | "FEES"
  | "STATUS"
  | "APPLY"
  | "GENERAL";

export type ServiceCategory =
  | "PAN"
  | "AADHAAR"
  | "PASSPORT"
  | "VOTER_ID"
  | "DRIVING_LICENSE"
  | "HSRP"
  | "CERTIFICATES"
  | "GOVERNMENT_SCHEMES"
  | "BUSINESS_REGISTRATION"
  | "TRAVEL_DARSHAN"
  | "LEGAL_DOCUMENTS"
  | "GENERAL";

export type ConversationStage =
  | "START"
  | "SERVICE_IDENTIFIED"
  | "ASK_USER_INTENT"
  | "SHOW_DOCUMENTS"
  | "SHOW_PROCESS"
  | "SHOW_FEES"
  | "APPLY_LINK"
  | "END";

export type ServiceRecord = {
  id?: string;
  title: string;
  displayName?: string;
  description?: string;
  category?: string;
  process?: string;
  processSteps?: string[];
  documentsSummary?: string[];
  feesSummary?: string;
  link?: string;
  bodyUrl?: string;
  faqUrl?: string;
  aliases?: string[];
  status?: string;
  isActive?: boolean;
};

export type ConversationState = {
  language: "English" | "Hindi" | "Hinglish" | "Telugu";
  stage: ConversationStage;
  currentIntent: ChatIntent | null;
  currentCategory: ServiceCategory | null;
  currentService: ServiceRecord | null;
};

export function createInitialConversation(
  language: ConversationState["language"] = "English"
): ConversationState {
  return {
    language,
    stage: "START",
    currentIntent: null,
    currentCategory: null,
    currentService: null,
  };
}

const categoryKeywords: Array<{
  category: ServiceCategory;
  keywords: string[];
}> = [
  { category: "PAN", keywords: ["pan", "pancard"] },
  {
    category: "AADHAAR",
    keywords: ["aadhaar", "aadhar", "uidai", "aadhaar card"],
  },
  { category: "PASSPORT", keywords: ["passport"] },
  {
    category: "VOTER_ID",
    keywords: ["voter", "epic", "voter id", "voter card"],
  },
  {
    category: "DRIVING_LICENSE",
    keywords: ["driving license", "driving licence", "license", "licence", "dl"],
  },
  {
    category: "HSRP",
    keywords: ["hsrp", "number plate", "high security number plate", "registration plate"],
  },
  {
    category: "CERTIFICATES",
    keywords: ["certificate", "income certificate", "caste", "birth certificate"],
  },
  {
    category: "GOVERNMENT_SCHEMES",
    keywords: ["scheme", "yojana", "subsidy", "benefit"],
  },
  {
    category: "BUSINESS_REGISTRATION",
    keywords: ["gst", "udyam", "msme", "company", "firm", "business"],
  },
  {
    category: "TRAVEL_DARSHAN",
    keywords: ["darshan", "travel", "booking", "temple", "yatra"],
  },
  {
    category: "LEGAL_DOCUMENTS",
    keywords: ["legal", "affidavit", "notary", "agreement"],
  },
];

const intentKeywordMap: Array<{ intent: ChatIntent; keywords: string[] }> = [
  { intent: "REPRINT", keywords: ["lost", "missing", "duplicate", "reprint"] },
  { intent: "RENEWAL", keywords: ["renewal", "renew", "expired", "expire"] },
  {
    intent: "UPDATE",
    keywords: ["update", "correction", "correct", "change", "modify", "galat", "sudhar", "wrong"],
  },
  { intent: "DOCUMENTS", keywords: ["document", "documents", "proof", "required"] },
  { intent: "PROCESS", keywords: ["process", "procedure", "steps", "how"] },
  { intent: "FEES", keywords: ["fees", "fee", "charges", "price", "cost"] },
  { intent: "STATUS", keywords: ["status", "track", "tracking", "progress"] },
  { intent: "APPLY", keywords: ["apply", "application", "link", "start", "yes"] },
  { intent: "NEW", keywords: ["new", "fresh", "first time"] },
];

export function detectCategory(text: string): ServiceCategory {
  const normalized = text.toLowerCase();

  for (const item of categoryKeywords) {
    if (item.keywords.some((keyword) => normalized.includes(keyword))) {
      return item.category;
    }
  }

  return "GENERAL";
}

export function mapCategoryFromService(service: ServiceRecord | null): ServiceCategory {
  if (!service) return "GENERAL";

  const haystack = `${service.title} ${service.category || ""}`.toLowerCase();
  return detectCategory(haystack);
}

export function extractIntent(text: string): ChatIntent {
  const normalized = text.toLowerCase();

  for (const item of intentKeywordMap) {
    if (item.keywords.some((keyword) => normalized.includes(keyword))) {
      return item.intent;
    }
  }

  return "GENERAL";
}

export function buildServiceKeywords(service: ServiceRecord) {
  return `${service.title} ${service.displayName || ""} ${(service.aliases || []).join(" ")} ${service.category || ""} ${service.description || ""}`.toLowerCase();
}

function normalizeMatchText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeServiceText(text: string) {
  return normalizeMatchText(text);
}

function cleanPromotionalTitle(text: string) {
  return normalizeMatchText(text)
    .replace(/\b(ready to|need to|do it now|click here|today|instantly|zero hassle|with zero hassle|at your doorstep|from home|in just few steps|in just a few steps|with just a few clicks|with just few clicks)\b/g, " ")
    .replace(/\b(apply now|apply online for|apply online|book your|get your|complete your|change your|make correction in your|report|activate your|renew your|generate your|create|secure your|pay online|enroll in|seed your|verify|book online|update the|register for)\b/g, " ")
    .replace(/\b(online application process|application process|online process|online)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string) {
  return normalizeMatchText(text)
    .split(" ")
    .filter((word) => word.length > 2);
}

function significantTokens(text: string) {
  const stopWords = new Set([
    "application",
    "apply",
    "service",
    "services",
    "online",
    "card",
    "registration",
    "certificate",
    "form",
    "process",
    "update",
    "new",
  ]);

  return tokenize(text).filter((word) => !stopWords.has(word));
}

function buildAcronym(text: string) {
  const words = significantTokens(text);
  if (words.length < 2) return "";
  return words.map((word) => word[0]).join("");
}

function serviceAliases(service: ServiceRecord) {
  const original = normalizeMatchText(service.title);
  const display = normalizeMatchText(service.displayName || "");
  const cleaned = cleanPromotionalTitle(service.title);
  const important = significantTokens(service.title).join(" ");
  const acronym = buildAcronym(service.title);

  const aliases = new Set<string>([
    original,
    display,
    cleaned,
    important,
    ...(service.aliases || []).map((alias) => normalizeMatchText(alias)),
  ]);

  if (acronym.length >= 3) {
    aliases.add(acronym);
  }

  const lowerTitle = original;

  if (lowerTitle.includes("swasthya sathi")) aliases.add("swasthiya sathi");
  if (lowerTitle.includes("udid")) aliases.add("udid card");
  if (lowerTitle.includes("apaar")) aliases.add("apaar id");
  if (lowerTitle.includes("abha")) aliases.add("abha card");
  if (lowerTitle.includes("high security registration plate")) aliases.add("hsrp");
  if (lowerTitle.includes("pm suraksha bima yojana")) aliases.add("pmsby");
  if (lowerTitle.includes("pradhan mantri jeevan jyoti bima yojana")) aliases.add("pmjjby");
  if (lowerTitle.includes("pm kisan samman nidhi")) aliases.add("pm kisan");
  if (lowerTitle.includes("fastag one year pass")) aliases.add("fastag annual pass");
  if (lowerTitle.includes("fssai food license")) aliases.add("fssai");
  if (lowerTitle.includes("learner s driving license")) aliases.add("learning license");
  if (lowerTitle.includes("duplicate driving license")) aliases.add("lost driving license");
  if (lowerTitle.includes("passport renewed")) aliases.add("passport renewal");
  if (lowerTitle.includes("pan aadhaar linking")) aliases.add("pan aadhaar link");
  if (lowerTitle.includes("aadhaar pvc")) aliases.add("aadhaar pvc card");
  if (lowerTitle.includes("voter aadhaar")) aliases.add("voter aadhaar link");
  if (lowerTitle.includes("uan")) aliases.add("uan activation");
  if (lowerTitle.includes("gst registration")) aliases.add("gst number");
  if (lowerTitle.includes("resident certificate haryana")) aliases.add("haryana domicile certificate");
  if (lowerTitle.includes("resident certificate mh")) aliases.add("maharashtra domicile certificate");
  if (lowerTitle.includes("character certificate")) aliases.add("charcater certificate");
  if (lowerTitle.includes("aadhar npci")) aliases.add("aadhaar npci");

  return [...aliases].filter(Boolean);
}

export function findExactServiceMatch(
  services: ServiceRecord[],
  message: string
) {
  const normalizedMessage = normalizeMatchText(message);
  if (!normalizedMessage) return null;

  return (
    services.find((service) => {
      const candidates = [
        service.title,
        service.displayName || "",
        ...(service.aliases || []),
      ]
        .map((value) => normalizeMatchText(value))
        .filter(Boolean);

      return candidates.some(
        (candidate) =>
          candidate === normalizedMessage ||
          normalizedMessage.includes(candidate) ||
          candidate.includes(normalizedMessage)
      );
    }) || null
  );
}

export function findBestServiceMatch(
  services: ServiceRecord[],
  message: string,
  category?: ServiceCategory | null
) {
  const scoped = services.filter((service) => {
    if (!category || category === "GENERAL") return true;
    return mapCategoryFromService(service) === category;
  });

  const messageText = normalizeMatchText(message);
  const messageTokens = tokenize(message);

  let bestService: ServiceRecord | null = null;
  let bestScore = 0;

  for (const service of scoped) {
    const title = normalizeMatchText(service.title);
    const titleTokens = significantTokens(service.title);
    const importantTitleTokens = significantTokens(service.title);
    const aliases = serviceAliases(service);
    let score = 0;

    const aliasHit = aliases.some((alias) => alias && messageText.includes(alias));

    if (messageText.includes(title)) {
      score += 10;
    }

    for (const alias of aliases) {
      if (!alias) continue;
      if (messageText.includes(alias)) {
        score += alias.split(" ").length > 1 ? 12 : 8;
      }
    }

    for (const token of titleTokens) {
      if (messageTokens.includes(token)) {
        score += 3;
      }
    }

    for (const token of importantTitleTokens) {
      if (messageTokens.includes(token)) {
        score += 3;
      }
    }

    if (mapCategoryFromService(service) === category) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestService = service;
    }
  }

  if (!bestService) return null;

  const bestImportantOverlap = significantTokens(bestService.title).some((token) =>
    messageTokens.includes(token)
  );
  const bestAliasHit = serviceAliases(bestService).some(
    (alias) => alias && messageText.includes(alias)
  );

  if (!bestImportantOverlap && !bestAliasHit) {
    return null;
  }

  return bestScore >= 3 ? bestService : null;
}

export function mapServiceFromCategoryAndIntent(
  services: ServiceRecord[],
  category: ServiceCategory,
  intent: ChatIntent,
  normalizedMessage: string
) {
  const narrowed = services.filter((service) => {
    if (category === "GENERAL") return true;
    return mapCategoryFromService(service) === category;
  });

  const strictIntentMatch = narrowed.find((service) => {
    const haystack = buildServiceKeywords(service);

    if (category === "PAN" && intent === "UPDATE") {
      return haystack.includes("correction") || haystack.includes("update");
    }

    if (category === "PAN" && intent === "REPRINT") {
      return haystack.includes("reprint");
    }

    if (category === "PAN" && intent === "NEW") {
      return haystack.includes("new");
    }

    if (category === "VOTER_ID" && intent === "UPDATE") {
      return haystack.includes("correction") || haystack.includes("update");
    }

    if (category === "PASSPORT" && intent === "RENEWAL") {
      return haystack.includes("renewal") || haystack.includes("renew");
    }

    if (category === "DRIVING_LICENSE" && intent === "UPDATE") {
      return haystack.includes("address change") || haystack.includes("update");
    }

    return false;
  });

  if (strictIntentMatch) return strictIntentMatch;

  const fuzzyMatch = findBestServiceMatch(services, normalizedMessage, category);
  if (fuzzyMatch) return fuzzyMatch;

  const intentHints: Record<ChatIntent, string[]> = {
    NEW: ["new", "fresh"],
    UPDATE: ["update", "correction", "change", "modify"],
    REPRINT: ["reprint", "duplicate", "lost"],
    RENEWAL: ["renewal", "renew", "expired"],
    DOCUMENTS: [],
    PROCESS: [],
    FEES: [],
    STATUS: [],
    APPLY: [],
    GENERAL: [],
  };

  const hintWords = intentHints[intent];

  const exactDisplayIntentMatch = narrowed.find((service) => {
    const haystack = buildServiceKeywords(service);
    return (
      hintWords.some((hint) => haystack.includes(hint)) &&
      (haystack.includes("correction") ||
        haystack.includes("update") ||
        haystack.includes("renewal") ||
        haystack.includes("reprint") ||
        haystack.includes("new"))
    );
  });

  if (exactDisplayIntentMatch) return exactDisplayIntentMatch;

  const exactIntentMatch = narrowed.find((service) => {
    const haystack = buildServiceKeywords(service);
    return hintWords.some((hint) => haystack.includes(hint));
  });

  if (exactIntentMatch) return exactIntentMatch;

  const titleMatch = narrowed.find((service) =>
    normalizedMessage.includes(service.title.toLowerCase())
  );

  if (titleMatch) return titleMatch;

  return narrowed[0] || null;
}

export function extractApplyLink(service: ServiceRecord | null) {
  return service?.link || "https://www.jaagrukbharat.com";
}
