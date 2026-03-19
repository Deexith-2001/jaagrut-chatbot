export type Service = {
  name: string;
  description: string;
  link: string;
  category?: string;
  faq?: string;
  process?: string;
  fullText: string;
};

let cachedServices: Service[] = [];

const SHEET_ID = "1C8xZB5OZXhk4R3xJc4yShgLpJsBZkp6s0HRkmIGQj6U";

export async function loadServices(): Promise<Service[]> {
  if (cachedServices.length > 0) return cachedServices;

  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

    console.log("🔗 Fetching:", url);

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    // 🔥 Clean Google JSON
    const json = JSON.parse(text.substring(47).slice(0, -2));
    const rows = json.table.rows;

    // 🔍 DEBUG (run once, then you can remove)
    console.log("🧪 First row:", rows[0]?.c?.map((c: any) => c?.v));

    const services: Service[] = rows
      .map((row: any) => {
        if (!row.c) return null; // 🔥 important safety

        const get = (i: number) => row.c[i]?.v || "";

        // 🔥 Adjusted indexes (based on your sheet structure)
        const name = get(10) || get(9) || get(11);
        const description = get(11) || get(12);
        const link = get(3) || get(4);

        const faq = get(22);
        const category = get(23);

        const process = `
${get(25)}
${get(27)}
${get(29)}
        `;

        const fullText = `
${name}
${description}
${faq}
${category}
${process}
        `.toLowerCase();

        return {
          name,
          description,
          link,
          category,
          faq,
          process,
          fullText,
        };
      })
      .filter((s) => s && s.name && s.name.trim() !== "");

    cachedServices = services;

    console.log(`✅ Loaded ${services.length} services`);

    return services;
  } catch (error) {
    console.error("❌ Sheet Error:", error);
    return [];
  }
}