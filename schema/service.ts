import { z } from "zod";

export const CATEGORIES = ["shopping", "money", "phone", "delivery", "travel", "food", "entertainment", "other"] as const;

// A service people sign up for. Breaches match when the incident's domain is one of these domains
// or a subdomain of one.
export const ServiceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name_en: z.string().min(1),
  name_ja: z.string().min(1),
  category: z.enum(CATEGORIES),
  domains: z.array(z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/)).min(1),
});

export type Service = z.infer<typeof ServiceSchema>;

export function domainMatches(incidentDomain: string, serviceDomain: string): boolean {
  return incidentDomain === serviceDomain || incidentDomain.endsWith(`.${serviceDomain}`);
}
