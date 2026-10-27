import { IncidentSchema, type Incident } from "../../schema/incident.ts";

const files = import.meta.glob<{ default: unknown }>("../../data/incidents/*.json", { eager: true });

export const incidents: Incident[] = Object.entries(files)
  .map(([file, mod]) => {
    const parsed = IncidentSchema.safeParse(mod.default);
    if (!parsed.success) throw new Error(`${file}: ${parsed.error.message}`);
    return parsed.data;
  })
  .sort(byAffected);

export function byAffected(a: Incident, b: Incident): number {
  return (b.affected.count ?? -1) - (a.affected.count ?? -1) || b.disclosed_on.localeCompare(a.disclosed_on);
}

export function byRecent(a: Incident, b: Incident): number {
  return b.disclosed_on.localeCompare(a.disclosed_on) || byAffected(a, b);
}

export const INDUSTRY_LABELS: Record<Incident["industry"], string> = {
  telecom: "Telecoms",
  retail: "Retail",
  finance: "Finance",
  transport: "Transport and logistics",
  food: "Restaurants and food",
  government: "Government",
  education: "Education",
  healthcare: "Healthcare",
  it_services: "IT services",
  media: "Media",
  travel: "Travel",
  entertainment: "Entertainment and games",
  manufacturing: "Manufacturing",
  other: "Other",
};

export const CAUSE_LABELS: Record<Incident["cause"], string> = {
  unauthorized_access: "Hacked",
  ransomware: "Ransomware",
  misconfiguration: "Left exposed",
  misdelivery: "Sent to wrong people",
  lost_device: "Lost or thrown away",
  insider: "Insider",
  unknown: "Not yet known",
};

export const DATA_LABELS: Record<Incident["data_types"][number], string> = {
  name: "Names",
  email: "Email addresses",
  phone: "Phone numbers",
  address: "Home addresses",
  birthdate: "Dates of birth",
  password: "Passwords",
  credit_card: "Card numbers",
  bank_account: "Bank details",
  my_number: "My Number",
  id_document: "ID documents",
  health: "Health data",
  other: "Other data",
};

export const SENSITIVE: Incident["data_types"][number][] = [
  "password",
  "credit_card",
  "bank_account",
  "my_number",
  "id_document",
  "health",
];

const UNIT_LABELS: Record<Incident["affected"]["unit"], string> = {
  people: "people",
  records: "records",
  accounts: "accounts",
  email_addresses: "email addresses",
};

export function formatCount(i: Incident): string {
  if (i.affected.count == null) return "Not disclosed";
  const n = i.affected.count.toLocaleString("en-US");
  return `${i.affected.approximate ? "About " : ""}${n} ${UNIT_LABELS[i.affected.unit]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function hasSensitive(i: Incident): boolean {
  return i.data_types.some((d) => SENSITIVE.includes(d));
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 });

// "12.2M" for cards; the exact figure is on the incident page.
export function compactCount(i: Incident): string | null {
  return i.affected.count == null ? null : compact.format(i.affected.count);
}

export function unitLabel(i: Incident): string {
  return UNIT_LABELS[i.affected.unit];
}
