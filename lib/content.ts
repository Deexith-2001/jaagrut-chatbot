const contentCache: Record<string, string> = {};

function toDownloadableTextUrl(url: string) {
  if (!url) return url;

  const docMatch = url.match(/document\/d\/([^/]+)/);
  if (docMatch) {
    return `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`;
  }

  const driveFileMatch = url.match(/\/file\/d\/([^/]+)/);
  if (driveFileMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveFileMatch[1]}`;
  }

  const openIdMatch = url.match(/[?&]id=([^&]+)/);
  if (url.includes("drive.google.com") && openIdMatch) {
    return `https://drive.google.com/uc?export=download&id=${openIdMatch[1]}`;
  }

  return url;
}

function stripHtmlIfNeeded(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";

  if (/<!doctype html>|<html/i.test(trimmed)) {
    return "";
  }

  return trimmed;
}

function extractRelevantContent(content: string, query: string) {
  if (!content) return "";

  const paragraphs = content
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const keywords = query
    .toLowerCase()
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length > 2);

  const relevant = paragraphs.filter((para) =>
    keywords.some((word) => para.toLowerCase().includes(word))
  );

  if (!relevant.length) {
    return paragraphs.slice(0, 5).join("\n");
  }

  return relevant.slice(0, 5).join("\n");
}

export async function fetchContent(url: string, query: string) {
  try {
    if (!url) return "";

    if (!contentCache[url]) {
      const cleanUrl = toDownloadableTextUrl(url);

      const res = await fetch(cleanUrl, { cache: "no-store" });
      const text = stripHtmlIfNeeded(await res.text());

      contentCache[url] = text;
    }

    return extractRelevantContent(contentCache[url], query);
  } catch (err) {
    console.error("Content fetch error:", err);
    return "";
  }
}
