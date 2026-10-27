// What the daily routine writes for each candidate article. The routine (see ROUTINE.md) reads the
// article, fills one of these, and `npm run apply` validates it before touching any incident file.
import { z } from "zod";
import { CAUSES, DATA_TYPES, INDUSTRIES, UNITS } from "../schema/incident.ts";

const ExtractedIncident = z.object({
  slug: z.string(),
  organization_name_ja: z.string(),
  organization_name_en: z.string(),
  organization_domain: z.string().nullable(),
  industry: z.enum(INDUSTRIES),
  disclosed_on: z.string(),
  discovered_on: z.string().nullable(),
  affected_count: z.number().int().nonnegative().nullable(),
  affected_unit: z.enum(UNITS),
  affected_approximate: z.boolean(),
  affected_note: z.string().nullable(),
  data_types: z.array(z.enum(DATA_TYPES)),
  cause: z.enum(CAUSES),
  via_vendor: z.string().nullable(),
  status: z.enum(["confirmed", "possible"]),
  summary_en: z.string().min(1),
  summary_ja: z.string().min(1),
  official_notice_url: z.string().nullable(),
});

export const Extraction = z.object({
  url: z.string(),
  relevant: z.boolean(),
  reason: z.string(),
  matches_existing_id: z.string().nullable(),
  incident: ExtractedIncident.nullable(),
});

export const ExtractionsFile = z.array(Extraction);

export type Extraction = z.infer<typeof Extraction>;
export type ExtractedIncident = z.infer<typeof ExtractedIncident>;
