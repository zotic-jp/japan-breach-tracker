import fs from "node:fs";
import path from "node:path";
import { IncidentSchema, type Incident, type Source } from "../schema/incident.ts";
import type { ExtractedIncident } from "./extract.ts";

export const INCIDENTS_DIR = "data/incidents";
export const SEEN_FILE = "data/state/seen.json";
const SEEN_RETENTION_DAYS = 120;

export function loadIncidents(dir = INCIDENTS_DIR): Incident[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const parsed = IncidentSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      if (!parsed.success) throw new Error(`${f}: ${parsed.error.message}`);
      if (`${parsed.data.id}.json` !== f) throw new Error(`${f}: id "${parsed.data.id}" does not match file name`);
      return parsed.data;
    });
}

export function writeIncident(incident: Incident, dir = INCIDENTS_DIR): void {
  const valid = IncidentSchema.parse(incident);
  fs.writeFileSync(path.join(dir, `${valid.id}.json`), JSON.stringify(valid, null, 2) + "\n");
}

// URL -> date first seen. Lets each daily run skip articles it already read.
export type Seen = Record<string, string>;

export function loadSeen(file = SEEN_FILE): Seen {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

export function saveSeen(seen: Seen, today: string, file = SEEN_FILE): void {
  const cutoff = addDays(today, -SEEN_RETENTION_DAYS);
  const kept = Object.fromEntries(
    Object.entries(seen)
      .filter(([, date]) => date >= cutoff)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(kept, null, 2) + "\n");
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "incident"
  );
}

export function newIncidentId(extracted: ExtractedIncident, taken: Set<string>): string {
  const year = ISO_DATE.test(extracted.disclosed_on) ? extracted.disclosed_on.slice(0, 4) : "0000";
  const base = `${year}-${slugify(extracted.slug)}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

const urlOrNull = (u: string | null): string | null => (u && /^https?:\/\//.test(u) ? u : null);
const domainOrNull = (d: string | null): string | null => {
  const host = d?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return host && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) ? host : null;
};
const dateOrNull = (d: string | null): string | null => (d && ISO_DATE.test(d) ? d : null);

export function createIncident(id: string, e: ExtractedIncident, source: Source, today: string): Incident {
  return {
    id,
    organization: {
      name_ja: e.organization_name_ja,
      name_en: e.organization_name_en,
      domain: domainOrNull(e.organization_domain),
    },
    industry: e.industry,
    disclosed_on: dateOrNull(e.disclosed_on) ?? source.published_on ?? today,
    discovered_on: dateOrNull(e.discovered_on),
    affected: {
      count: e.affected_count,
      unit: e.affected_unit,
      approximate: e.affected_approximate,
      note: e.affected_note,
    },
    data_types: [...new Set(e.data_types)],
    cause: e.cause,
    via_vendor: e.via_vendor,
    status: e.status,
    summary: { en: e.summary_en, ja: e.summary_ja },
    official_notice_url: urlOrNull(e.official_notice_url),
    sources: [source],
    updated_at: today,
  };
}

// A follow-up report on a known incident: newer counts win, everything else only fills gaps.
// The daily pull request shows each change for human review.
export function mergeIncident(existing: Incident, e: ExtractedIncident, source: Source, today: string): Incident {
  const alreadySourced = existing.sources.some((s) => s.url === source.url);
  const newerCount = e.affected_count != null && e.affected_count !== existing.affected.count;
  const disclosed = dateOrNull(e.disclosed_on);
  return {
    ...existing,
    organization: { ...existing.organization, domain: existing.organization.domain ?? domainOrNull(e.organization_domain) },
    disclosed_on: disclosed && disclosed < existing.disclosed_on ? disclosed : existing.disclosed_on,
    discovered_on: existing.discovered_on ?? dateOrNull(e.discovered_on),
    affected: newerCount
      ? { count: e.affected_count, unit: e.affected_unit, approximate: e.affected_approximate, note: e.affected_note }
      : existing.affected,
    data_types: [...new Set([...existing.data_types, ...e.data_types])],
    cause: existing.cause === "unknown" ? e.cause : existing.cause,
    via_vendor: existing.via_vendor ?? e.via_vendor,
    status: existing.status === "confirmed" || e.status === "confirmed" ? "confirmed" : "possible",
    official_notice_url: existing.official_notice_url ?? urlOrNull(e.official_notice_url),
    sources: alreadySourced ? existing.sources : [...existing.sources, source],
    updated_at: today,
  };
}
