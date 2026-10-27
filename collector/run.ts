// Daily collector: reads the source feeds, asks Claude to extract breach facts from new
// articles, and writes data/incidents/*.json. The workflow then opens a pull request for review.
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { Incident, Source } from "../schema/incident.ts";
import { fetchArticleText } from "./article.ts";
import { extract, knownIncidents } from "./extract.ts";
import { fetchFeed, toTokyoDate, type FeedItem } from "./feeds.ts";
import { SOURCES, looksLikeBreach, type FeedSource } from "./sources.ts";
import {
  addDays,
  createIncident,
  loadIncidents,
  loadSeen,
  mergeIncident,
  newIncidentId,
  saveSeen,
  writeIncident,
} from "./store.ts";

const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS ?? 7);
// Bounds daily API spend; anything left over is picked up by the next run.
const MAX_ARTICLES = Number(process.env.MAX_ARTICLES ?? 40);

interface Candidate {
  item: FeedItem;
  source: FeedSource;
}

async function main() {
  const today = toTokyoDate(new Date().toISOString())!;
  const since = addDays(today, -LOOKBACK_DAYS);
  const incidents = new Map(loadIncidents().map((i) => [i.id, i]));
  const seen = loadSeen();
  const report: string[] = [];
  const log = (line: string) => {
    console.log(line);
    report.push(line);
  };

  const candidates: Candidate[] = [];
  let feedFailures = 0;
  for (const source of SOURCES) {
    try {
      const items = await fetchFeed(source.feedUrl);
      const fresh = items.filter(
        (item) =>
          !seen[item.url] &&
          (item.published_on ?? today) >= since &&
          looksLikeBreach(item.title, item.categories, source),
      );
      // Items that fail the title filter are marked seen so they are not re-checked tomorrow.
      for (const item of items) if (!seen[item.url] && !fresh.includes(item)) seen[item.url] = today;
      candidates.push(...fresh.map((item) => ({ item, source })));
      console.log(`${source.publisher}: ${items.length} items, ${fresh.length} to read`);
    } catch (err) {
      feedFailures++;
      log(`- Feed failed: ${source.publisher}: ${(err as Error).message}`);
    }
  }
  if (feedFailures === SOURCES.length) throw new Error("every feed failed");

  const client = new Anthropic();
  const batch = candidates.slice(0, MAX_ARTICLES);
  if (candidates.length > batch.length) log(`- ${candidates.length - batch.length} articles deferred to the next run`);

  const counts = { created: 0, updated: 0, skipped: 0, failed: 0 };
  for (const { item, source } of batch) {
    try {
      let text: string;
      try {
        const article = await fetchArticleText(item.url);
        text = article.text;
        if (article.truncated) console.log(`  (article truncated for extraction: ${item.url})`);
      } catch (err) {
        console.log(`  could not fetch article, using feed summary: ${(err as Error).message}`);
        text = item.description;
      }

      const result = await extract(
        client,
        { url: item.url, title: item.title, publisher: source.publisher, published_on: item.published_on, text },
        knownIncidents([...incidents.values()]),
      );
      seen[item.url] = today;

      if (!result.relevant || !result.incident) {
        counts.skipped++;
        console.log(`  skip: ${item.title} (${result.reason})`);
        continue;
      }

      const src: Source = { url: item.url, title: item.title, publisher: source.publisher, published_on: item.published_on };
      const existing = result.matches_existing_id ? incidents.get(result.matches_existing_id) : undefined;
      let incident: Incident;
      if (existing) {
        incident = mergeIncident(existing, result.incident, src, today);
        counts.updated++;
        log(`- Updated [${incident.id}](data/incidents/${incident.id}.json): ${item.title} (${source.publisher})`);
      } else {
        const id = newIncidentId(result.incident, new Set(incidents.keys()));
        incident = createIncident(id, result.incident, src, today);
        counts.created++;
        log(`- **New** [${incident.id}](data/incidents/${incident.id}.json): ${item.title} (${source.publisher})`);
      }
      writeIncident(incident);
      incidents.set(incident.id, incident);
    } catch (err) {
      // Left unseen so the next run retries it.
      counts.failed++;
      log(`- Failed: ${item.title} (${item.url}): ${(err as Error).message}`);
      if (err instanceof Anthropic.AuthenticationError) throw err;
    }
  }

  saveSeen(seen, today);
  const summary = `${counts.created} new, ${counts.updated} updated, ${counts.skipped} not breach news, ${counts.failed} failed`;
  console.log(summary);
  if (process.env.RUN_REPORT) {
    fs.writeFileSync(
      process.env.RUN_REPORT,
      `Daily collection for ${today}: ${summary}.\n\n${report.join("\n")}\n\nCheck each change against its source before merging.\n`,
    );
  }
  if (counts.failed > 0 && counts.failed === batch.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
