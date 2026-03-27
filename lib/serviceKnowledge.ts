import { ServiceRecord } from "./chatbot";

type ServiceKnowledge = {
  match: string[];
  displayName?: string;
  aliases?: string[];
  description?: string;
  documentsSummary?: string[];
  textFieldsSummary?: string[];
  eligibilitySummary?: string[];
  processSteps?: string[];
  feesSummary?: string;
  timelineSummary?: string;
  trustPoints?: string[];
  comparisonPoints?: string[];
};

const SERVICE_KNOWLEDGE: ServiceKnowledge[] = [
  {
    match: ["hsrp", "high security registration plate", "high security number plate", "number plate"],
    displayName: "HSRP Number Plate Booking",
    aliases: [
      "hsrp booking",
      "hsrp number plate",
      "high security number plate",
      "high security registration plate",
      "number plate booking",
    ],
    description:
      "Book your HSRP number plate through Jaagruk Bharat with guided support for eligible pre-April 2019 vehicle bookings, fitment, and colour-coded sticker requirements.",
    documentsSummary: [
      "RC photo or registration certificate details showing the registration date",
      "Basic vehicle details needed during booking",
    ],
    textFieldsSummary: ["Whatsapp Number"],
    eligibilitySummary: [
      "This HSRP retrofit booking flow is mainly for vehicles registered before April 1, 2019",
      "Vehicle details should match the RC or registration certificate",
      "Vehicles registered on or after April 1, 2019 usually already have HSRP fitted by the dealership",
    ],
    processSteps: [
      "Confirm that the vehicle was registered before April 1, 2019 and choose your state on Jaagruk Bharat.",
      "Complete the online booking and payment. Aadhaar, PAN, bank details, full chassis number, and full engine number are not required.",
      "Your HSRP plate booking moves forward with snap-lock fitment and colour-coded sticker support. Delivery or next-step support usually happens within 3 to 5 working days.",
    ],
    feesSummary:
      "HSRP fees vary by vehicle type and state. The payable amount is shown during booking, and payment can be completed by UPI, debit card, credit card, or net banking.",
    timelineSummary:
      "HSRP booking is usually confirmed quickly, and delivery or fitment support generally happens within 3 to 5 working days after booking confirmation.",
    trustPoints: [
      "DPIIT-recognised startup trusted by 500K+ users",
      "4.8 star Google rating",
      "SSL-secured payment flow",
      "100 percent refund if the booking cannot be completed",
      "WhatsApp support usually responds within 1 to 2 hours after payment",
    ],
    comparisonPoints: [
      "Jaagruk Bharat handles booking guidance, fitment support, and colour-coded sticker support in one flow",
      "HSRP booking through this flow is mainly for vehicles registered before April 1, 2019",
      "No Aadhaar, PAN, or bank details are needed for the booking",
      "Refund support is available if the booking cannot be completed",
    ],
  },
  {
    match: ["udyam", "msme", "udyam certificate", "msme certificate"],
    displayName: "Udyam Registration",
    aliases: [
      "udyam registration",
      "udyam certificate",
      "msme registration",
      "msme certificate",
      "udyam msme certificate",
    ],
    description:
      "Register your business under Udyam through Jaagruk Bharat with guided filing support and MSME certificate delivery.",
    documentsSummary: [
      "Aadhaar linked to the proprietor or authorised director",
      "PAN card for Private Limited, LLP, and Co-operative entities",
      "Business details needed for registration",
      "GST details only if already registered",
    ],
    textFieldsSummary: [
      "Whatsapp Number",
      "Business or trade name",
      "Entity type",
      "Aadhaar linked mobile number",
      "PAN number when applicable",
      "GST number if already available",
    ],
    eligibilitySummary: [
      "Micro, small, and medium businesses can apply under the Udyam registration framework",
      "The applicant should be the proprietor or an authorised partner, director, or signatory",
      "Aadhaar is required, and PAN is mandatory for entities like Private Limited, LLP, and Co-operative organisations",
    ],
    processSteps: [
      "Share your Aadhaar-linked details and business information with Jaagruk Bharat.",
      "Our team helps choose the right NIC code and prepares the Udyam registration correctly.",
      "The registration is filed and the MSME certificate is usually delivered within 48 hours.",
    ],
    feesSummary:
      "Jaagruk Bharat service fee for Udyam Registration is Rs 299. Government fee is Rs 0.",
    timelineSummary:
      "Udyam Registration is usually completed within 48 hours after successful submission.",
    trustPoints: [
      "DPIIT-recognised startup trusted by 500000+ users",
      "4.8 star Google rating",
      "Guided support for NIC code selection and correct filing",
      "Udyam certificate has lifetime validity with no renewal",
    ],
    comparisonPoints: [
      "Government fee is Rs 0, while Jaagruk Bharat charges Rs 299 for guided filing support",
      "Similar assisted filing often costs much more through consultants or CAs",
      "The service helps avoid mistakes in NIC code selection and application details",
    ],
  },
];

function serviceText(service: ServiceRecord) {
  return `${service.title} ${service.displayName || ""} ${(service.aliases || []).join(" ")}`.toLowerCase();
}

function isGenericFeesSummary(feesSummary?: string) {
  return Boolean(feesSummary && feesSummary.includes("can vary based on the selected service flow"));
}

export function applyServiceKnowledge(service: ServiceRecord): ServiceRecord {
  const haystack = serviceText(service);
  const knowledge = SERVICE_KNOWLEDGE.find((item) =>
    item.match.some((keyword) => haystack.includes(keyword))
  );

  if (!knowledge) return service;

  const mergedAliases = new Set([...(service.aliases || []), ...(knowledge.aliases || [])]);

  return {
    ...service,
    displayName: knowledge.displayName || service.displayName,
    description: knowledge.description || service.description,
    documentsSummary: knowledge.documentsSummary || service.documentsSummary,
    textFieldsSummary: knowledge.textFieldsSummary || service.textFieldsSummary,
    eligibilitySummary: knowledge.eligibilitySummary || service.eligibilitySummary,
    processSteps: knowledge.processSteps || service.processSteps,
    process:
      knowledge.processSteps?.length ? knowledge.processSteps.join("\n") : service.process,
    feesSummary:
      service.feesSummary && !isGenericFeesSummary(service.feesSummary)
        ? service.feesSummary
        : knowledge.feesSummary || service.feesSummary,
    timelineSummary: knowledge.timelineSummary || service.timelineSummary,
    trustPoints: knowledge.trustPoints || service.trustPoints,
    comparisonPoints: knowledge.comparisonPoints || service.comparisonPoints,
    aliases: [...mergedAliases],
  };
}
