import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  url: string;
  title: string;
  published_on: string | null;
  description: string;
  categories: string[];
}

const parser = new XMLParser({
  ignoreAttributes: true,
  cdataPropName: false,
  processEntities: true,
  isArray: (name) => name === "item" || name === "category",
});

const asText = (v: unknown): string => (v == null ? "" : String(v)).trim();

export function toTokyoDate(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Parses RSS 2.0 (Security NEXT, piyolog) and RSS 1.0 / RDF (ScanNetSecurity).
export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml);
  const items: Record<string, unknown>[] = doc.rss?.channel?.item ?? doc["rdf:RDF"]?.item ?? [];
  return items
    .map((item) => ({
      url: asText(item.link),
      title: asText(item.title),
      published_on: toTokyoDate(asText(item.pubDate) || asText(item["dc:date"])),
      description: stripHtml(asText(item.description)).slice(0, 2000),
      categories: ((item.category as unknown[]) ?? []).map(asText),
    }))
    .filter((item) => item.url.startsWith("http") && item.title);
}

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return parseFeed(await res.text());
}

export const USER_AGENT = "japan-breach-tracker/0.1";
