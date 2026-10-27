import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CAUSES, DATA_TYPES, INDUSTRIES, UNITS, type Incident } from "../schema/incident.ts";

export const MODEL = "claude-opus-5-5";

const ExtractedIncident = z.object({
  slug: z.string().describe("Short lowercase ASCII slug for the organization and incident, words joined by hyphens, e.g. 'kddi-mail'"),
  organization_name_ja: z.string(),
  organization_name_en: z.string(),
  organization_domain: z
    .string()
    .nullable()
    .describe("Bare domain of the website customers use for the affected service, e.g. 'capcom.co.jp', or null if unsure"),
  industry: z.enum(INDUSTRIES),
  disclosed_on: z.string().describe("YYYY-MM-DD the organization first announced it; the article date if not stated"),
  discovered_on: z.string().nullable().describe("YYYY-MM-DD the organization detected it, or null"),
  affected_count: z.number().int().nullable(),
  affected_unit: z.enum(UNITS),
  affected_approximate: z.boolean(),
  affected_note: z.string().nullable(),
  data_types: z.array(z.enum(DATA_TYPES)),
  cause: z.enum(CAUSES),
  via_vendor: z.string().nullable(),
  status: z.enum(["confirmed", "possible"]),
  summary_en: z.string(),
  summary_ja: z.string(),
  official_notice_url: z.string().nullable(),
});

export const Extraction = z.object({
  relevant: z.boolean(),
  reason: z.string(),
  matches_existing_id: z.string().nullable(),
  incident: ExtractedIncident.nullable(),
});

export type Extraction = z.infer<typeof Extraction>;
export type ExtractedIncident = z.infer<typeof ExtractedIncident>;

const SYSTEM = `You maintain a public tracker of data breaches affecting Japanese organizations and people in Japan. You read one news article and extract facts for the tracker.

The site is public and Japanese defamation law applies, so extract only what the article states. Never infer counts, causes or data types the article does not support. When a field is unknown, use null, "unknown" or an empty list.

relevant = true only when the article reports a specific incident in which personal data held by an organization in Japan (or about people in Japan) was leaked, stolen, exposed, sent to the wrong recipient, lost, or possibly accessed. Vulnerability advisories, statistics roundups, policy news, weekly digests, and incidents with no personal data involved are not relevant.

Matching: you get the tracker's existing incidents. If the article is about one of them (same organization and same event, including follow-up reports with revised counts), set matches_existing_id to its id and still fill incident with the facts as this article states them. Otherwise null.

Field rules:
- affected_count: the latest number the organization published. Choose affected_unit to match what was counted. affected_approximate = true for 約, 最大, or similar wording; put that nuance in affected_note.
- status: "confirmed" when the organization says data was leaked (漏えい, 流出); "possible" when it says 漏えいのおそれ, 可能性, or 閲覧された可能性.
- via_vendor: name of the supplier whose system was breached when the organization was affected through a vendor, else null.
- official_notice_url: only a URL to the organization's own notice that appears in the article text, else null.
- summary_en and summary_ja: one or two neutral, factual sentences each, in your own words. Do not use the em dash character.`;

export interface KnownIncident {
  id: string;
  name_ja: string;
  name_en: string;
  disclosed_on: string;
}

export function knownIncidents(incidents: Incident[]): KnownIncident[] {
  return incidents.map((i) => ({
    id: i.id,
    name_ja: i.organization.name_ja,
    name_en: i.organization.name_en,
    disclosed_on: i.disclosed_on,
  }));
}

export async function extract(
  client: Anthropic,
  article: { url: string; title: string; publisher: string; published_on: string | null; text: string },
  known: KnownIncident[],
): Promise<Extraction> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(Extraction) },
    system: [
      { type: "text", text: SYSTEM },
      // Stable between articles in one run, so it caches.
      {
        type: "text",
        text: `Existing incidents (id, name_ja, name_en, disclosed_on):\n${known
          .map((k) => `${k.id}\t${k.name_ja}\t${k.name_en}\t${k.disclosed_on}`)
          .join("\n")}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Publisher: ${article.publisher}\nPublished: ${article.published_on ?? "unknown"}\nURL: ${article.url}\nTitle: ${article.title}\n\n<article>\n${article.text}\n</article>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`model declined (${response.stop_details?.category ?? "no category"})`);
  }
  if (response.stop_reason === "max_tokens") throw new Error("hit max_tokens");
  if (!response.parsed_output) throw new Error("no parsed output");
  return response.parsed_output;
}
