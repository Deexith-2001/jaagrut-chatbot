import Papa from "papaparse";
import { ServiceRecord } from "./chatbot";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1C8xZB5OZXhk4R3xJc4yShgLpJsBZkp6s0HRkmIGQj6U/export?format=csv&gid=599383802";

let servicesCache: ServiceRecord[] = [];

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

function stripPromotionalText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\b(apply now|get your|complete your|ready to|need to|do it now|today|instantly|online)\b/gi, "")
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
  for (const candidate of candidates) {
    const value = stripPromotionalText(candidate || "");
    if (!value) continue;

    if (value.length <= 80) {
      return titleCaseWords(value.replace(/\s+-\s+/g, " - "));
    }
  }

  return "Service";
}

function getField(row: Record<string, unknown>, name: string) {
  const key = Object.keys(row).find((item) =>
    item.toLowerCase().includes(name.toLowerCase())
  );
  return key ? normalizeValue(row[key]) : "";
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

function buildServiceRecord(row: Record<string, unknown>): ServiceRecord {
  const canonicalUrl = getField(row, "canonicalurl") || getField(row, "canonical");
  const title = getField(row, "title") || getField(row, "displaytitle") || getField(row, "urltitle");
  const displayName = cleanDisplayName(
    getField(row, "displaytitle"),
    getField(row, "urltitle"),
    title
  );
  const category = getField(row, "servicecategory") || getField(row, "category");
  const processSteps = buildProcessSteps(row);

  return {
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
}

export async function getServices() {
  try {
    if (servicesCache.length > 0) return servicesCache;

    const res = await fetch(SHEET_URL, { cache: "no-store" });
    const csv = await res.text();
    const parsed = Papa.parse<Record<string, unknown>>(csv, { header: true });

    servicesCache = parsed.data
      .map((row) => buildServiceRecord(row))
      .filter((service) => service.title);

    return servicesCache;
  } catch (err) {
    console.error("Sheet error:", err);
    return [];
  }
}
