import Papa from "papaparse";
import { ServiceRecord } from "./chatbot";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1C8xZB5OZXhk4R3xJc4yShgLpJsBZkp6s0HRkmIGQj6U/export?format=csv&gid=599383802";
const DOCUMENTS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1-oJ1lDO8_yuRTN5-2JEGPVad56wnGh5mRY0Vx7XG8Sc/export?format=csv";
const SERVICES_NAMES_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1-oJ1lDO8_yuRTN5-2JEGPVad56wnGh5mRY0Vx7XG8Sc/gviz/tq?tqx=out:csv&sheet=services";

let servicesCache: ServiceRecord[] = [];

type DocumentsSheetRow = {
  serviceName: string;
  documents: string[];
  textFields: string[];
};

type ServiceNamesRow = {
  serviceName: string;
  category?: string;
};

function normalizeValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeMatchText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPromotionalText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\b(apply now|apply for|get your|complete your|ready to|need to|do it now|today|instantly|online)\b/gi, "")
    .replace(/\b(start here|click here|with ease|from home|zero hassle|hassle free|hassle-free)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseWords(text: string) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function cleanDisplayName(...candidates: string[]) {
  const scored = candidates
    .map((candidate) => stripPromotionalText(candidate || ""))
    .filter(Boolean)
    .map((value) => {
      const normalized = value.toLowerCase();
      let score = 0;

      if (value.length <= 60) score += 4;
      else if (value.length <= 80) score += 2;
      if (/\b(update|correction|renewal|reprint|new|registration|certificate|license|licence|card|passport|pan|aadhaar|voter|gst|fssai|udid|abha|apaar)\b/i.test(value)) {
        score += 6;
      }
      if (/\b(claim|benefit|secure|rewarding|travel with ease|input tax credit|expert-assisted|smooth|verified)\b/i.test(normalized)) {
        score -= 6;
      }

      return { value, score };
    })
    .sort((a, b) => b.score - a.score || a.value.length - b.value.length);

  const best = scored[0]?.value;
  return best ? titleCaseWords(best.replace(/\s+-\s+/g, " - ")) : "Service";
}

function getField(row: Record<string, unknown>, name: string) {
  const key = Object.keys(row).find((item) =>
    item.toLowerCase().includes(name.toLowerCase())
  );
  return key ? normalizeValue(row[key]) : "";
}

function splitCommaList(text: string) {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanServiceLookupName(text: string) {
  return normalizeMatchText(text)
    .replace(/\b(service|application|online|apply|registration|process|card)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildLookupVariants(...values: string[]) {
  const variants = new Set<string>();

  for (const value of values) {
    if (!value) continue;
    const normalized = normalizeMatchText(value);
    const cleaned = cleanServiceLookupName(value);
    if (normalized) variants.add(normalized);
    if (cleaned) variants.add(cleaned);
  }

  const combined = [...variants].join(" ");

  if (combined.includes("pan")) {
    variants.add("pan");
    variants.add("pan card");
  }
  if (combined.includes("aadhaar") || combined.includes("aadhar")) {
    variants.add("aadhaar");
    variants.add("aadhar");
  }
  if (combined.includes("abha")) variants.add("abha");
  if (combined.includes("apaar")) variants.add("apaar id");
  if (combined.includes("udid")) variants.add("udid");
  if (combined.includes("hsrp")) variants.add("hsrp");
  if (combined.includes("fssai")) {
    variants.add("fssai");
    variants.add("food license");
  }
  if (combined.includes("pmjjby")) variants.add("pmjjby");
  if (combined.includes("pmsby")) variants.add("pmsby");
  if (combined.includes("e shram") || combined.includes("eshram")) variants.add("e shram");
  if (combined.includes("vehicle rc aadhaar linking")) variants.add("rc aadhaar number link");
  if (combined.includes("driving license aadhaar link")) variants.add("dl aadhaar link");
  if (combined.includes("new passport application")) variants.add("passport application");
  if (combined.includes("passport renewal")) variants.add("passport renewal");
  if (combined.includes("pan card correction")) variants.add("pan correction");
  if (combined.includes("reprint pan")) variants.add("pan reprint");
  if (combined.includes("new pan")) variants.add("pan new");
  if (combined.includes("fssai") && combined.includes("renew")) {
    variants.add("fssai renewal");
    variants.add("food license renewal");
  }
  if (combined.includes("fssai") && combined.includes("register")) {
    variants.add("fssai registration");
    variants.add("food license registration");
  }

  return [...variants].filter(Boolean);
}

function parseDocumentsSheetRow(row: Record<string, unknown>): DocumentsSheetRow | null {
  const serviceName = getField(row, "service");
  if (!serviceName) return null;

  return {
    serviceName,
    documents: splitCommaList(getField(row, "documents required")),
    textFields: splitCommaList(getField(row, "text fields")),
  };
}

function parseServiceNamesRow(row: Record<string, unknown>): ServiceNamesRow | null {
  const serviceName = getField(row, "db service name") || getField(row, "service");
  if (!serviceName) return null;

  return {
    serviceName: serviceName.replace(/,+$/g, "").trim(),
    category: getField(row, "category"),
  };
}

function scoreDocumentMatch(service: ServiceRecord, docRow: DocumentsSheetRow) {
  const serviceVariants = buildLookupVariants(
    service.title,
    service.displayName || "",
    ...(service.aliases || [])
  );
  const documentVariants = buildLookupVariants(docRow.serviceName);

  let score = 0;

  for (const serviceVariant of serviceVariants) {
    for (const documentVariant of documentVariants) {
      if (!serviceVariant || !documentVariant) continue;
      if (serviceVariant === documentVariant) score += 10;
      else if (
        serviceVariant.includes(documentVariant) ||
        documentVariant.includes(serviceVariant)
      ) {
        score += 6;
      }
    }
  }

  const serviceTokens = new Set(
    cleanServiceLookupName(
      `${service.title} ${service.displayName || ""} ${(service.aliases || []).join(" ")}`
    )
      .split(" ")
      .filter((token) => token.length > 2)
  );
  const docTokens = new Set(
    cleanServiceLookupName(docRow.serviceName)
      .split(" ")
      .filter((token) => token.length > 2)
  );

  let overlap = 0;
  for (const token of docTokens) {
    if (serviceTokens.has(token)) overlap += 1;
  }
  score += overlap * 3;

  if (docRow.serviceName.toLowerCase().includes("renewal") && service.title.toLowerCase().includes("renew")) {
    score += 3;
  }
  if (docRow.serviceName.toLowerCase().includes("correction") && buildLookupVariants(service.title).some((item) => item.includes("correction") || item.includes("update"))) {
    score += 3;
  }
  if (docRow.serviceName.toLowerCase().includes("new pan") && service.title.toLowerCase().includes("new pan")) {
    score += 4;
  }

  return score;
}

function matchDocumentsRow(service: ServiceRecord, documentsRows: DocumentsSheetRow[]) {
  let bestRow: DocumentsSheetRow | null = null;
  let bestScore = 0;

  for (const row of documentsRows) {
    const score = scoreDocumentMatch(service, row);
    if (score > bestScore) {
      bestScore = score;
      bestRow = row;
    }
  }

  return bestScore >= 6 ? bestRow : null;
}

function matchServiceNamesRows(service: ServiceRecord, serviceRows: ServiceNamesRow[]) {
  let bestRow: ServiceNamesRow | null = null;
  let bestScore = 0;

  for (const row of serviceRows) {
    const score = scoreDocumentMatch(service, {
      serviceName: row.serviceName,
      documents: [],
      textFields: [],
    });
    if (score > bestScore) {
      bestScore = score;
      bestRow = row;
    }
  }

  return bestScore >= 6 ? bestRow : null;
}

function buildProcessSteps(row: Record<string, unknown>) {
  const steps: string[] = [];

  for (let index = 1; index <= 3; index += 1) {
    const title = getField(row, `applicationProcessTitle${index}`);
    const description = getField(row, `applicationProcessDescription${index}`);
    const step = [title, description].filter(Boolean).join(": ");

    if (step) steps.push(step);
  }

  return steps;
}

function buildAliases(row: Record<string, unknown>, displayName: string) {
  const aliases = new Set<string>();
  const candidateFields = [
    "title",
    "urltitle",
    "metatitle",
    "displaytitle",
    "shorturl",
    "description",
  ];

  aliases.add(displayName);

  for (const field of candidateFields) {
    const value = getField(row, field);
    if (!value) continue;

    aliases.add(value);
    aliases.add(value.replace(/[|:,!?()]/g, " "));
  }

  const normalized = displayName.toLowerCase();

  if (normalized.includes("pan")) {
    aliases.add("pan card");
  }
  if (normalized.includes("aadhaar") || normalized.includes("aadhar")) {
    aliases.add("aadhar");
  }
  if (normalized.includes("pmsby")) {
    aliases.add("pm suraksha bima yojana");
  }
  if (normalized.includes("pmjjby")) {
    aliases.add("pradhan mantri jeevan jyoti bima yojana");
  }
  if (normalized.includes("abha")) {
    aliases.add("abha card");
  }
  if (normalized.includes("apaar")) {
    aliases.add("apaar id");
  }
  if (normalized.includes("udid")) {
    aliases.add("udid card");
  }
  if (normalized.includes("hsrp")) {
    aliases.add("high security number plate");
  }

  return [...aliases].filter(Boolean);
}

function inferDocumentsSummary(displayName: string, category: string) {
  const normalized = `${displayName} ${category}`.toLowerCase();

  if (normalized.includes("pan")) {
    return [
      "Identity proof",
      "Date of birth proof if correction is needed",
      "Address proof if address update is needed",
      "Existing PAN details or PAN copy when available",
    ];
  }

  if (normalized.includes("passport")) {
    return [
      "Identity proof",
      "Address proof",
      "Passport-size photo if required",
      "Existing passport details for renewal or PCC-related cases",
    ];
  }

  if (normalized.includes("voter")) {
    return [
      "Identity proof",
      "Address proof",
      "Passport-size photo if required",
      "Existing voter details if available",
    ];
  }

  if (normalized.includes("driving")) {
    return [
      "Driving license details",
      "Identity proof",
      "Address proof if address change is needed",
      "Vehicle or license supporting details as applicable",
    ];
  }

  if (normalized.includes("aadhaar")) {
    return [
      "Aadhaar details",
      "Identity proof when applicable",
      "Address proof for address-related requests",
      "Supporting documents based on the selected Aadhaar service",
    ];
  }

  if (normalized.includes("gst") || normalized.includes("udyam") || normalized.includes("shop act") || normalized.includes("llp")) {
    return [
      "Identity proof",
      "Business proof or business details",
      "Address proof",
      "Business-specific supporting documents",
    ];
  }

  return [
    "Identity proof",
    "Address proof if applicable",
    "Service-specific supporting documents",
  ];
}

function inferFeesSummary(displayName: string) {
  return `Fees for ${displayName} can vary based on the selected service flow. Once the application starts, the exact Jaagruk Bharat fee details are shared clearly.`;
}

function buildServiceRecord(
  row: Record<string, unknown>,
  documentsRows: DocumentsSheetRow[],
  serviceNamesRows: ServiceNamesRow[]
): ServiceRecord {
  const canonicalUrl = getField(row, "canonicalurl") || getField(row, "canonical");
  const title = getField(row, "title") || getField(row, "displaytitle") || getField(row, "urltitle");
  const displayName = cleanDisplayName(
    getField(row, "urltitle"),
    getField(row, "metatitle"),
    title,
    getField(row, "displaytitle"),
    getField(row, "urltitle"),
    getField(row, "shorturl")
  );
  const category = getField(row, "servicecategory") || getField(row, "category");
  const processSteps = buildProcessSteps(row);
  const baseRecord: ServiceRecord = {
    id: getField(row, "id") || slugify(canonicalUrl || displayName || title),
    title,
    displayName,
    description: getField(row, "description"),
    category,
    process: processSteps.join("\n"),
    processSteps,
    documentsSummary: inferDocumentsSummary(displayName, category),
    feesSummary: inferFeesSummary(displayName),
    link: canonicalUrl,
    bodyUrl: getField(row, "bodyurl"),
    faqUrl: getField(row, "faqbody"),
    aliases: buildAliases(row, displayName),
    status: getField(row, "servicestatus") || "active",
    isActive: (getField(row, "servicestatus") || "active").toLowerCase() === "active",
  };
  const matchedDocuments = matchDocumentsRow(baseRecord, documentsRows);
  const matchedServiceName = matchServiceNamesRows(baseRecord, serviceNamesRows);
  const mergedAliases = new Set(baseRecord.aliases || []);
  if (matchedServiceName?.serviceName) {
    mergedAliases.add(matchedServiceName.serviceName);
    mergedAliases.add(matchedServiceName.serviceName.replace(/[|:,!?()]/g, " "));
  }

  return {
    ...baseRecord,
    aliases: [...mergedAliases].filter(Boolean),
    documentsSummary:
      matchedDocuments?.documents.length
        ? matchedDocuments.documents
        : baseRecord.documentsSummary,
    textFieldsSummary: matchedDocuments?.textFields.length
      ? matchedDocuments.textFields
      : [],
  };
}

export async function getServices() {
  try {
    if (servicesCache.length > 0) return servicesCache;

    const [servicesRes, documentsRes, serviceNamesRes] = await Promise.all([
      fetch(SHEET_URL, { cache: "no-store" }),
      fetch(DOCUMENTS_SHEET_URL, { cache: "no-store" }),
      fetch(SERVICES_NAMES_SHEET_URL, { cache: "no-store" }),
    ]);
    const [servicesCsv, documentsCsv, serviceNamesCsv] = await Promise.all([
      servicesRes.text(),
      documentsRes.text(),
      serviceNamesRes.text(),
    ]);
    const parsed = Papa.parse<Record<string, unknown>>(servicesCsv, { header: true });
    const parsedDocuments = Papa.parse<Record<string, unknown>>(documentsCsv, {
      header: true,
    });
    const documentsRows = parsedDocuments.data
      .map((row) => parseDocumentsSheetRow(row))
      .filter((row): row is DocumentsSheetRow => Boolean(row));
    const parsedServiceNames = Papa.parse<Record<string, unknown>>(serviceNamesCsv, {
      header: true,
    });
    const serviceNamesRows = parsedServiceNames.data
      .map((row) => parseServiceNamesRow(row))
      .filter((row): row is ServiceNamesRow => Boolean(row));

    servicesCache = parsed.data
      .map((row) => buildServiceRecord(row, documentsRows, serviceNamesRows))
      .filter((service) => service.title);

    return servicesCache;
  } catch (err) {
    console.error("Sheet error:", err);
    return [];
  }
}
