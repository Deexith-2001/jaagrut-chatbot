export function detectCompanyIntent(text: string) {
  text = text.toLowerCase();

  if (text.includes("about jaagruk") || text.includes("what is jaagruk"))
    return "ABOUT";

  if (
    text.includes("trust") ||
    text.includes("safe") ||
    text.includes("genuine") ||
    text.includes("reliable") ||
    text.includes("why should i trust")
  )
    return "TRUST";

  if (text.includes("how you work") || text.includes("how does this work"))
    return "WORKFLOW";

  if (
    text.includes("difference") ||
    text.includes("why jaagruk") ||
    text.includes("why should i choose") ||
    text.includes("why choose") ||
    text.includes("why pay") ||
    text.includes("why 299") ||
    text.includes("why rs") ||
    text.includes("why ₹") ||
    text.includes("other services") ||
    text.includes("other websites") ||
    text.includes("better than") ||
    text.includes("vs") ||
    text.includes("versus") ||
    (text.includes("why") && (text.includes("pay") || text.includes("fee") || text.includes("cost") || text.includes("charge")))
  )
    return "COMPARISON";

  if (text.includes("fees") || text.includes("charges") || text.includes("price"))
    return "FEES";

  if (text.includes("contact") || text.includes("support"))
    return "CONTACT";

  return null;
}
