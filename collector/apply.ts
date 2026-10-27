// Step 3 of the daily run: validate work/extractions.json and create or update incident files.
// Articles without an extraction stay unseen, so the next run retries them.
import fs from "node:fs";
import type { Incident, Source } from "../schema/incident.ts";
import type { Candidate } from "./candidates.ts";
import { ExtractionsFile } from "./extraction.ts";
import { toTokyoDate } from "./feeds.ts";
import { createIncident, loadIncidents, loadSeen, mergeIncident, newIncidentId, saveSeen, writeIncident } from "./store.ts";

const CANDIDATES_FILE = "work/candidates.json";
const EXTRACTIONS_FILE = "work/extractions.json";
const REPORT_FILE = "work/report.md";

const today = toTokyoDate(new Date().toISOString())!;
const candidates: Candidate[] = JSON.parse(fs.readFileSync(CANDIDATES_FILE, "utf8"));
const extractions = ExtractionsFile.parse(JSON.parse(fs.readFileSync(EXTRACTIONS_FILE, "utf8")));
const byUrl = new Map(candidates.map((c) => [c.url, c]));
const incidents = new Map(loadIncidents().map((i) => [i.id, i]));
const seen = loadSeen();
const report: string[] = [];
const counts = { created: 0, updated: 0, skipped: 0 };

for (const e of extractions) {
  const c = byUrl.get(e.url);
  if (!c) throw new Error(`extraction for ${e.url}, which is not in ${CANDIDATES_FILE}`);
  seen[c.url] = today;
  if (!e.relevant || !e.incident) {
    counts.skipped++;
    continue;
  }
  const src: Source = { url: c.url, title: c.title, publisher: c.publisher, published_on: c.published_on };
  const existing = e.matches_existing_id ? incidents.get(e.matches_existing_id) : undefined;
  if (e.matches_existing_id && !existing) throw new Error(`${e.url} matches unknown incident ${e.matches_existing_id}`);
  let incident: Incident;
  if (existing) {
    incident = mergeIncident(existing, e.incident, src, today);
    counts.updated++;
    report.push(`- Updated [${incident.id}](data/incidents/${incident.id}.json): ${c.title} (${c.publisher})`);
  } else {
    incident = createIncident(newIncidentId(e.incident, new Set(incidents.keys())), e.incident, src, today);
    counts.created++;
    report.push(`- **New** [${incident.id}](data/incidents/${incident.id}.json): ${c.title} (${c.publisher})`);
  }
  writeIncident(incident);
  incidents.set(incident.id, incident);
}

const missing = candidates.filter((c) => !extractions.some((e) => e.url === c.url));
for (const c of missing) report.push(`- Not processed, retried next run: ${c.title} (${c.url})`);
saveSeen(seen, today);

const summary = `${counts.created} new, ${counts.updated} updated, ${counts.skipped} not breach news, ${missing.length} not processed`;
fs.writeFileSync(
  REPORT_FILE,
  `Daily collection for ${today}: ${summary}.\n\n${report.join("\n")}\n\nCheck each change against its source before merging.\n`,
);
console.log(summary);
