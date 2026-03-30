const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1C8xZB5OZXhk4R3xJc4yShgLpJsBZkp6s0HRkmIGQj6U/export?format=csv&gid=599383802";

function normalizeValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getField(row, name) {
  const key = Object.keys(row).find((item) =>
    item.toLowerCase().includes(name.toLowerCase())
  );
  return key ? normalizeValue(row[key]) : "";
}

function splitLinks(raw) {
  return (raw || "")
    .split(/[\n,|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeCsv(value) {
  const safe = String(value ?? "");
  return `"${safe.replace(/"/g, '""')}"`;
}

async function main() {
  const csv = await (await fetch(SHEET_URL)).text();
  const parsed = Papa.parse(csv, { header: true });

  const rows = parsed.data
    .map((row, index) => {
      const title =
        getField(row, "title") ||
        getField(row, "displaytitle") ||
        getField(row, "urltitle");
      const representativeDisplayTitle =
        getField(row, "ctaname") ||
        getField(row, "urltitle") ||
        getField(row, "metatitle") ||
        getField(row, "displaytitle") ||
        title;
      const bodyLinks = splitLinks(getField(row, "bodyurl"));
      const faqLinks = splitLinks(getField(row, "faqbody"));

      return {
        sheetRow: index + 2,
        title,
        representativeDisplayTitle,
        bodyLinks,
        faqLinks,
      };
    })
    .filter(
      (row) =>
        row.title && (row.bodyLinks.length > 0 || row.faqLinks.length > 0)
    );

  const output = [
    "sheetRow,title,representativeDisplayTitle,linkType,link",
  ];

  for (const row of rows) {
    for (const link of row.bodyLinks) {
      output.push(
        [
          row.sheetRow,
          escapeCsv(row.title),
          escapeCsv(row.representativeDisplayTitle),
          "bodyUrl",
          escapeCsv(link),
        ].join(",")
      );
    }

    for (const link of row.faqLinks) {
      output.push(
        [
          row.sheetRow,
          escapeCsv(row.title),
          escapeCsv(row.representativeDisplayTitle),
          "faqBody",
          escapeCsv(link),
        ].join(",")
      );
    }
  }

  const outputPath = path.join(process.cwd(), "service-link-mapping.csv");
  fs.writeFileSync(outputPath, output.join("\n"), "utf8");

  console.log(`Rows with links: ${rows.length}`);
  console.log(`Total mapped links: ${output.length - 1}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((error) => {
  console.error("Failed to export mapping", error);
  process.exitCode = 1;
});
