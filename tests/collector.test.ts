import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Incident, Source } from "../schema/incident.ts";
import type { ExtractedIncident } from "../collector/extraction.ts";
import { extractArticleText } from "../collector/article.ts";
import { parseFeed, toTokyoDate } from "../collector/feeds.ts";
import { UNSAFE_SVG, hostMatches, iconCandidates, imageWidth } from "../collector/logos.ts";
import { brandName, brandNameJa } from "../schema/names.ts";
import { SOURCES, looksLikeBreach } from "../collector/sources.ts";
import { createIncident, loadIncidents, mergeIncident, newIncidentId, saveSeen, writeIncident } from "../collector/store.ts";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8");
const source = (id: string) => SOURCES.find((s) => s.id === id)!;

describe("parseFeed", () => {
  it("reads RSS 2.0 with categories (Security NEXT)", () => {
    const items = parseFeed(fixture("security-next.xml"));
    expect(items.length).toBe(20);
    const sagawa = items.find((i) => i.title.includes("佐川急便"))!;
    expect(sagawa.url).toMatch(/^https:\/\/www\.security-next\.com\/\d+$/);
    expect(sagawa.published_on).toMatch(/^2026-10-\d{2}$/);
    expect(sagawa.categories.length).toBeGreaterThan(0);
  });

  it("reads RSS 1.0 / RDF with dc:date (ScanNetSecurity)", () => {
    const items = parseFeed(fixture("scannetsecurity.rdf"));
    expect(items.length).toBe(50);
    expect(items[0].url).toMatch(/^https:\/\/scan\.netsecurity\.ne\.jp\/article\//);
    expect(items[0].published_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("strips HTML from descriptions (piyolog)", () => {
    const items = parseFeed(fixture("piyolog.xml"));
    expect(items.length).toBe(3);
    expect(items[0].description).not.toMatch(/<[a-z]/);
  });
});

describe("toTokyoDate", () => {
  it("converts UTC timestamps to the Japan calendar date", () => {
    expect(toTokyoDate("Mon, 26 Oct 2026 23:15:02 +0000")).toBe("2026-10-27");
    expect(toTokyoDate("2026-10-26T14:59:00Z")).toBe("2026-10-26");
    expect(toTokyoDate("not a date")).toBeNull();
  });
});

describe("looksLikeBreach", () => {
  it("keeps breach stories and drops vulnerability news", () => {
    const sn = source("scannetsecurity");
    expect(looksLikeBreach("ミスターマックスに不正アクセス、最大 1,735,154人の個人情報が流出", [], sn)).toBe(true);
    expect(looksLikeBreach("口座解約に関する顧客情報が記録された記録媒体を紛失 - りそな銀", [], sn)).toBe(true);
    expect(looksLikeBreach("HPEの無線LAN向けOSに多数の脆弱性", [], sn)).toBe(false);
  });

  it("trusts Security NEXT's own breach categories", () => {
    expect(looksLikeBreach("小中学校がPTAに生徒の情報を提供", ["個人情報漏洩事件・事故"], source("security-next"))).toBe(true);
  });
});

describe("extractArticleText", () => {
  it("prefers the article body over navigation", () => {
    const body = "本文".repeat(200);
    const html = `<html><body><nav>メニュー</nav><article><p>${body}</p></article><footer>著作権</footer></body></html>`;
    expect(extractArticleText(html)).toBe(body);
  });
});

const extracted: ExtractedIncident = {
  slug: "Example Shop",
  organization_name_ja: "例ショップ",
  organization_name_en: "Example Shop",
  organization_domain: "https://www.Example-Shop.jp/about",
  industry: "retail",
  disclosed_on: "2026-10-20",
  discovered_on: null,
  affected_count: 1000,
  affected_unit: "people",
  affected_approximate: true,
  affected_note: null,
  data_types: ["name", "email"],
  cause: "unknown",
  via_vendor: null,
  status: "possible",
  summary_en: "Example Shop said customer data may have been accessed.",
  summary_ja: "例ショップは顧客情報が閲覧された可能性があると発表した。",
  official_notice_url: "not a url",
};
const src: Source = { url: "https://example.com/a", title: "A", publisher: "Example", published_on: "2026-10-20" };

describe("incident store", () => {
  it("creates a valid incident with a unique id and drops bad URLs", () => {
    const id = newIncidentId(extracted, new Set(["2026-example-shop"]));
    expect(id).toBe("2026-example-shop-2");
    const incident = createIncident(id, extracted, src, "2026-10-27");
    expect(incident.official_notice_url).toBeNull();
    expect(incident.organization.domain).toBe("example-shop.jp");
  });

  it("merges a follow-up report: new count, more data types, confirmed status, extra source", () => {
    const first = createIncident("2026-example-shop", extracted, src, "2026-10-21");
    const followUp: ExtractedIncident = {
      ...extracted,
      affected_count: 4200,
      affected_approximate: false,
      data_types: ["email", "credit_card"],
      cause: "unauthorized_access",
      status: "confirmed",
      official_notice_url: "https://example.com/notice",
    };
    const merged = mergeIncident(first, followUp, { ...src, url: "https://example.com/b" }, "2026-10-27");
    expect(merged.affected).toMatchObject({ count: 4200, approximate: false });
    expect(merged.data_types).toEqual(["name", "email", "credit_card"]);
    expect(merged.cause).toBe("unauthorized_access");
    expect(merged.status).toBe("confirmed");
    expect(merged.official_notice_url).toBe("https://example.com/notice");
    expect(merged.sources).toHaveLength(2);
    expect(merged.summary).toEqual(first.summary);
  });

  it("does not add the same source twice or lose a published count", () => {
    const first = createIncident("2026-example-shop", extracted, src, "2026-10-21");
    const merged = mergeIncident(first, { ...extracted, affected_count: null }, src, "2026-10-27");
    expect(merged.sources).toHaveLength(1);
    expect(merged.affected.count).toBe(1000);
  });

  it("round-trips through disk and rejects a file whose id does not match its name", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "incidents-"));
    const incident: Incident = createIncident("2026-example-shop", extracted, src, "2026-10-27");
    writeIncident(incident, dir);
    expect(loadIncidents(dir)).toEqual([incident]);
    fs.renameSync(path.join(dir, "2026-example-shop.json"), path.join(dir, "2026-other.json"));
    expect(() => loadIncidents(dir)).toThrow(/does not match/);
  });

  it("prunes seen URLs older than the retention window", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "seen-")), "seen.json");
    saveSeen({ "https://old": "2026-01-01", "https://new": "2026-10-20" }, "2026-10-27", file);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ "https://new": "2026-10-20" });
  });
});

describe("logos", () => {
  it("prefers the largest declared icon and skips tiny favicons", () => {
    const html = `<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/touch.png"><link rel="icon" sizes="512x512" href="https://cdn.example.jp/big.png">`;
    expect(iconCandidates(html, "https://www.example.jp/")).toEqual([
      "https://cdn.example.jp/big.png",
      "https://www.example.jp/touch.png",
      "https://www.example.jp/apple-touch-icon.png",
    ]);
  });

  it("accepts a Wikidata website only when it matches the domain", () => {
    expect(hostMatches("https://www.kddi.com/", "kddi.com")).toBe(true);
    expect(hostMatches("https://share.timescar.jp/", "timescar.jp")).toBe(true);
    expect(hostMatches("https://www.capcom.com/", "capcom.co.jp")).toBe(false);
  });

  it("rejects SVGs that could run script", () => {
    expect(UNSAFE_SVG.test('<svg><script>alert(1)</script></svg>')).toBe(true);
    expect(UNSAFE_SVG.test('<svg onload="x()"></svg>')).toBe(true);
    expect(UNSAFE_SVG.test("<svg><foreignObject/></svg>")).toBe(true);
    expect(UNSAFE_SVG.test('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>')).toBe(false);
  });

  it("reads PNG width", () => {
    const png = Buffer.alloc(24);
    png.write("\x89PNG", 0, "latin1");
    png.writeUInt32BE(180, 16);
    expect(imageWidth(png)).toBe(180);
  });
});

describe("brandName", () => {
  it("drops legal suffixes and parentheses", () => {
    expect(brandName("KDDI Corporation")).toBe("KDDI");
    expect(brandName("Kaikatsu Frontier Inc. (AOKI Holdings)")).toBe("Kaikatsu Frontier");
    expect(brandName("Capcom Co., Ltd.")).toBe("Capcom");
    expect(brandNameJa("株式会社快活フロンティア（AOKIホールディングス）")).toBe("快活フロンティア");
  });
});
