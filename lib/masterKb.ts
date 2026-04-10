// Unified Knowledge Base Loader for Jaagruk Bharat
// This module loads and merges all public Google Sheets into a single KB map

export async function loadMasterKbSheet() {
  // Fetch data from the three sheets as CSV
  const servicesSheet = await fetchSheetData('https://docs.google.com/spreadsheets/d/1C8xZB5OZXhk4R3xJc4yShgLpJsBZkp6s0HRkmIGQj6U/export?format=csv');
  const deliverablesSheet = await fetchSheetData('https://docs.google.com/spreadsheets/d/1pG2JDvFZ4IxgTYLqMb8ErwAmmM_vl5Rn4WUex-ZDDsM/export?format=csv');
  const feesSheet = await fetchSheetData('https://docs.google.com/spreadsheets/d/1d82GmqYHJOC3pLIyO8H4SKYYkkZ2gdQq/export?format=csv');

  // Process and merge into a unified KB structure
  const kb = new Map();

  // Example: From servicesSheet, map to {service: {...}}
  for (const row of servicesSheet) {
    const key = (row['display title'] || row['title'] || '').trim();
    if (!key) continue;
    kb.set(key, {
      title: row['title'],
      displayTitle: row['display title'],
      canonicalUrl: row['cannonical url'],
      body: row['body'],
      faq: row['faq'],
      description: row['description'],
      applicationTitle1: row['application title1'],
      applicationTitle2: row['application title2'],
      applicationTitle3: row['application title3'],
      applicationProcess1: row['application process 1'],
      applicationProcess2: row['application process 2'],
      applicationProcess3: row['application process 3'],
    });
  }

  // Example: Add deliverablesSheet and feesSheet similarly as needed
  // (You can extend this logic to merge by service name or other keys)

  return kb;
}

// Helper to fetch CSV from public sheet
async function fetchSheetData(url) {
  const response = await fetch(url);
  const csv = await response.text();
  return parseCsv(csv);
}

function parseCsv(csv) {
  const lines = csv.split('\n').filter(Boolean);
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return headers.reduce((obj, header, i) => {
      obj[header.trim()] = values[i]?.trim();
      return obj;
    }, {});
  });
}

// Utility: Get best link for a service by priority
// 1. Check newSheet, 2. deliverablesSheet, 3. servicesSheet
export async function getBestLink(serviceName) {
  // Load all sheets
  const newSheet = await fetchSheetData('https://docs.google.com/spreadsheets/d/1C8xZB5OZXhk4R3xJc4yShgLpJsBZkp6s0HRkmIGQj6U/export?format=csv');
  const deliverablesSheet = await fetchSheetData('https://docs.google.com/spreadsheets/d/1pG2JDvFZ4IxgTYLqMb8ErwAmmM_vl5Rn4WUex-ZDDsM/export?format=csv');
  const servicesSheet = await fetchSheetData('https://docs.google.com/spreadsheets/d/1C8xZB5OZXhk4R3xJc4yShgLpJsBZkp6s0HRkmIGQj6U/export?format=csv');

  // Try newSheet first
  let found = newSheet.find(row => (row['display title'] || row['title'] || '').trim().toLowerCase() === serviceName.trim().toLowerCase());
  if (found && found['cannonical url']) return found['cannonical url'];

  // Then deliverablesSheet
  found = deliverablesSheet.find(row => (row['service name'] || '').trim().toLowerCase() === serviceName.trim().toLowerCase());
  if (found && found['deliverable link']) return found['deliverable link'];

  // Then servicesSheet (fallback)
  found = servicesSheet.find(row => (row['display title'] || row['title'] || '').trim().toLowerCase() === serviceName.trim().toLowerCase());
  if (found && found['cannonical url']) return found['cannonical url'];

  return null;
}
