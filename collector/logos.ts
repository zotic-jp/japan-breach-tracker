// Saves each organization's logo to public/logos/<domain>.<ext>, once, so the site never hotlinks.
// Sources, in order: the logo on the organization's Wikidata entry (a free file on Wikimedia Commons,
// accepted only when the entry's official website matches the domain), then the largest icon the
// organization's own site declares. Organizations with neither show their initials.
// Logos only identify the organization; delete the file and set domain to null if the owner asks.
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { USER_AGENT } from "./feeds.ts";
import { brandName, brandNameJa } from "../schema/names.ts";
import { loadIncidents } from "./store.ts";

export const LOGOS_DIR = path.resolve(import.meta.dirname, "../public/logos");
const MAX_BYTES = 512 * 1024;
const MIN_ICON_PX = 96;
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

type Logo = { body: Buffer; ext: string };

async function get(url: string, retries = 2): Promise<Response | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
    // Wikimedia rate-limits bursts; back off and try again rather than settling for initials.
    if (res.status === 429 && retries > 0) {
      await new Promise((r) => setTimeout(r, 5_000));
      return get(url, retries - 1);
    }
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function image(url: string): Promise<Logo | null> {
  const res = await get(url);
  const ext = EXTENSIONS[res?.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? ""];
  if (!res || !ext) return null;
  const body = Buffer.from(await res.arrayBuffer());
  return body.length > 0 && body.length <= MAX_BYTES ? { body, ext } : null;
}

export function hostMatches(site: string, domain: string): boolean {
  let host: string;
  try {
    host = new URL(site).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  return host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`);
}

async function fromWikidata(domain: string, names: string[]): Promise<Logo | null> {
  for (const [name, language] of names.map((n, i) => [n, i === 0 ? "en" : "ja"])) {
    const search = await get(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&limit=5&language=${language}&search=${encodeURIComponent(name)}`,
    );
    const ids: string[] = ((await search?.json())?.search ?? []).map((r: { id: string }) => r.id);
    if (!ids.length) continue;
    const entities = await get(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${ids.join("|")}`,
    );
    const data = (await entities?.json())?.entities ?? {};
    for (const id of ids) {
      const claims = data[id]?.claims ?? {};
      const values = (p: string): string[] => (claims[p] ?? []).map((c: any) => c.mainsnak?.datavalue?.value).filter(Boolean);
      const file = values("P154")[0];
      if (!file || !values("P856").some((site) => hostMatches(site, domain))) continue;
      const base = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;
      const logo = (await image(base)) ?? (await image(`${base}?width=400`));
      if (logo) return logo;
    }
  }
  return null;
}

// Pixel width of a PNG or JPEG, or null when the format doesn't say cheaply (SVG scales anyway).
export function imageWidth(body: Buffer): number | null {
  if (body.subarray(1, 4).toString() === "PNG") return body.readUInt32BE(16);
  if (body[0] === 0xff && body[1] === 0xd8) {
    for (let i = 2; i < body.length - 9; ) {
      if (body[i] !== 0xff) return null;
      const marker = body[i + 1];
      if (marker >= 0xc0 && marker <= 0xc3) return body.readUInt16BE(i + 7);
      i += 2 + body.readUInt16BE(i + 2);
    }
  }
  return null;
}

export function iconCandidates(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const found: { url: string; size: number }[] = [];
  $("link[rel][href]").each((_, el) => {
    const rel = ($(el).attr("rel") ?? "").toLowerCase().split(/\s+/);
    const touch = rel.some((r) => r.startsWith("apple-touch-icon"));
    if (!touch && !rel.includes("icon")) return;
    const href = $(el).attr("href")!;
    const svg = /\.svg(\?|$)/i.test(href) || $(el).attr("type") === "image/svg+xml";
    const declared = Math.max(0, ...($(el).attr("sizes") ?? "").split(/\s+/).map((s) => parseInt(s, 10) || 0));
    try {
      found.push({ url: new URL(href, pageUrl).href, size: svg ? 1024 : declared || (touch ? 180 : 16) });
    } catch {
      // Ignore malformed hrefs.
    }
  });
  return [
    ...found
      .filter((c) => c.size >= MIN_ICON_PX)
      .sort((a, b) => b.size - a.size)
      .map((c) => c.url),
    `${new URL(pageUrl).origin}/apple-touch-icon.png`,
  ];
}

async function fromSite(domain: string): Promise<Logo | null> {
  const page = (await get(`https://www.${domain}/`)) ?? (await get(`https://${domain}/`));
  if (!page) return null;
  for (const url of iconCandidates(await page.text(), page.url)) {
    const logo = await image(url);
    const width = logo && imageWidth(logo.body);
    if (logo && (width == null || width >= MIN_ICON_PX)) return logo;
  }
  return null;
}

export function hasLogo(domain: string, dir = LOGOS_DIR): boolean {
  return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.slice(0, f.lastIndexOf(".")) === domain);
}

export async function fetchLogo(domain: string, names: string[], dir = LOGOS_DIR): Promise<string | null> {
  const logo = (await fromWikidata(domain, names)) ?? (await fromSite(domain));
  if (!logo) return null;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${domain}.${logo.ext}`);
  fs.writeFileSync(file, logo.body);
  return file;
}

if (import.meta.main) {
  const byDomain = new Map<string, string[]>();
  for (const i of loadIncidents()) {
    const d = i.organization.domain;
    if (d && !byDomain.has(d)) byDomain.set(d, [brandName(i.organization.name_en), brandNameJa(i.organization.name_ja)]);
  }
  const services = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../data/services.json"), "utf8"));
  for (const s of services as { name_en: string; name_ja: string; domains: string[] }[]) {
    if (!byDomain.has(s.domains[0])) byDomain.set(s.domains[0], [s.name_en, s.name_ja]);
  }
  for (const [domain, names] of byDomain) {
    if (hasLogo(domain)) continue;
    const file = await fetchLogo(domain, names);
    console.log(file ? `${domain}: saved ${path.basename(file)}` : `${domain}: no logo found, initials shown instead`);
  }
}
