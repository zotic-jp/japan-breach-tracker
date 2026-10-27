import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { byRecent, formatCount, incidents } from "../lib/incidents.ts";

export function GET(context: APIContext) {
  return rss({
    title: "Japan Breach Tracker",
    description: "New and updated data breaches at Japanese organisations.",
    site: context.site!,
    items: [...incidents].sort(byRecent).slice(0, 50).map((i) => ({
      title: `${i.organization.name_en}: ${formatCount(i)}`,
      link: `/incidents/${i.id}`,
      pubDate: new Date(`${i.disclosed_on}T00:00:00+09:00`),
      description: i.summary.en,
    })),
  });
}
