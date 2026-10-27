// Step 1 of the daily run: read the source feeds and save new breach-looking articles, with their
// text, to work/candidates.json for the routine to read. Nothing in data/incidents changes here.
import fs from "node:fs";
import { fetchArticleText } from "./article.ts";
import { fetchFeed, toTokyoDate } from "./feeds.ts";
import { SOURCES, looksLikeBreach } from "./sources.ts";
import { addDays, loadSeen, saveSeen } from "./store.ts";

export const WORK_DIR = "work";
export const CANDIDATES_FILE = `${WORK_DIR}/candidates.json`;
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS ?? 7);
// Keeps one run reviewable; anything left over is picked up the next day.
const MAX_ARTICLES = Number(process.env.MAX_ARTICLES ?? 40);

export interface Candidate {
  url: string;
  title: string;
  publisher: string;
  published_on: string | null;
  text: string;
}

async function main() {
  const today = toTokyoDate(new Date().toISOString())!;
  const since = addDays(today, -LOOKBACK_DAYS);
  const seen = loadSeen();
  const found: (Candidate & { description: string })[] = [];
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
      found.push(...fresh.map((i) => ({ ...i, publisher: source.publisher, text: "" })));
      console.log(`${source.publisher}: ${items.length} items, ${fresh.length} to read`);
    } catch (err) {
      feedFailures++;
      console.log(`Feed failed: ${source.publisher}: ${(err as Error).message}`);
    }
  }
  if (feedFailures === SOURCES.length) throw new Error("every feed failed");

  const batch = found.slice(0, MAX_ARTICLES);
  if (found.length > batch.length) console.log(`${found.length - batch.length} articles deferred to the next run`);
  const candidates: Candidate[] = [];
  for (const c of batch) {
    let text = c.description;
    try {
      text = (await fetchArticleText(c.url)).text;
    } catch (err) {
      console.log(`Could not fetch ${c.url}, using the feed summary: ${(err as Error).message}`);
    }
    candidates.push({ url: c.url, title: c.title, publisher: c.publisher, published_on: c.published_on, text });
  }

  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(CANDIDATES_FILE, JSON.stringify(candidates, null, 2) + "\n");
  saveSeen(seen, today);
  console.log(`${candidates.length} candidate articles written to ${CANDIDATES_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
