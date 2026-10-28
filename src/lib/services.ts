import { brandName, brandNameJa } from "../../schema/names.ts";
import { CATEGORIES, ServiceSchema, domainMatches, type Service } from "../../schema/service.ts";
import type { Incident } from "../../schema/incident.ts";
import raw from "../../data/services.json";
import { incidents } from "./incidents.ts";

export const CATEGORY_LABELS: Record<Service["category"], string> = {
  shopping: "Shopping",
  money: "Banks, cards and payments",
  phone: "Phone, internet and messaging",
  delivery: "Delivery",
  travel: "Travel and transport",
  food: "Food and leisure",
  entertainment: "Games and entertainment",
  other: "Other",
};

const INDUSTRY_CATEGORY: Partial<Record<Incident["industry"], Service["category"]>> = {
  telecom: "phone",
  retail: "shopping",
  finance: "money",
  transport: "travel",
  travel: "travel",
  food: "food",
  entertainment: "entertainment",
  media: "entertainment",
};

const curated = raw.map((s) => ServiceSchema.parse(s));

// Every breached organization is watchable, even before someone adds it to data/services.json.
const generated: Service[] = [];
for (const i of incidents) {
  const d = i.organization.domain;
  if (!d || [...curated, ...generated].some((s) => s.domains.some((sd) => domainMatches(d, sd)))) continue;
  generated.push({
    id: d.replace(/\./g, "-"),
    name_en: brandName(i.organization.name_en),
    name_ja: brandNameJa(i.organization.name_ja),
    category: INDUSTRY_CATEGORY[i.industry] ?? "other",
    domains: [d],
  });
}

export const curatedIds = new Set(curated.map((s) => s.id));

export const services: Service[] = [...curated, ...generated].sort(
  (a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category),
);

export function servicesFor(i: Incident): Service[] {
  const d = i.organization.domain;
  return d ? services.filter((s) => s.domains.some((sd) => domainMatches(d, sd))) : [];
}

export function incidentsFor(s: Service): Incident[] {
  return incidents.filter((i) => servicesFor(i).includes(s));
}
