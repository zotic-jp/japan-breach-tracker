import * as cheerio from "cheerio";
import { USER_AGENT } from "./feeds.ts";

// Long write-ups (piyolog) put the key facts first; the rest is timelines and links.
export const MAX_ARTICLE_CHARS = 30_000;

export function extractArticleText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, aside, form, iframe").remove();
  const main = [".entry-content", "article", "main", "#main", "body"]
    .map((sel) => $(sel).first())
    .find((el) => el.length > 0 && el.text().trim().length > 200);
  return (main ?? $("body")).text().replace(/\s+/g, " ").trim();
}

export async function fetchArticleText(url: string): Promise<{ text: string; truncated: boolean }> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  const text = extractArticleText(await res.text());
  return { text: text.slice(0, MAX_ARTICLE_CHARS), truncated: text.length > MAX_ARTICLE_CHARS };
}
