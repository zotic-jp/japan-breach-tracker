import { z } from "zod";

export const INDUSTRIES = [
  "telecom",
  "retail",
  "finance",
  "transport",
  "food",
  "government",
  "education",
  "healthcare",
  "it_services",
  "media",
  "travel",
  "entertainment",
  "manufacturing",
  "other",
] as const;

export const DATA_TYPES = [
  "name",
  "email",
  "phone",
  "address",
  "birthdate",
  "password",
  "credit_card",
  "bank_account",
  "my_number",
  "id_document",
  "health",
  "other",
] as const;

export const CAUSES = [
  "unauthorized_access",
  "ransomware",
  "misconfiguration",
  "misdelivery",
  "lost_device",
  "insider",
  "unknown",
] as const;

export const UNITS = ["people", "records", "accounts", "email_addresses"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const SourceSchema = z.object({
  url: z.url(),
  title: z.string().min(1),
  publisher: z.string().min(1),
  published_on: isoDate.nullable(),
});

export const IncidentSchema = z.object({
  id: z.string().regex(/^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected YYYY-slug"),
  organization: z.object({
    name_ja: z.string().min(1),
    name_en: z.string().min(1),
    // Website people know the service by (e.g. "capcom.co.jp"). Its icon is shown as the logo.
    domain: z
      .string()
      .regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/, "expected a bare domain like example.co.jp")
      .nullable(),
  }),
  industry: z.enum(INDUSTRIES),
  // First public disclosure by the organization (or first news report if none).
  disclosed_on: isoDate,
  discovered_on: isoDate.nullable(),
  affected: z.object({
    count: z.number().int().nonnegative().nullable(),
    unit: z.enum(UNITS),
    approximate: z.boolean(),
    note: z.string().nullable(),
  }),
  data_types: z.array(z.enum(DATA_TYPES)),
  cause: z.enum(CAUSES),
  // Supplier whose system was breached, when the organization was hit through a vendor.
  via_vendor: z.string().nullable(),
  // "confirmed" = 漏えい, "possible" = 漏えいのおそれ, as the organization worded it.
  status: z.enum(["confirmed", "possible"]),
  summary: z.object({
    en: z.string().min(1),
    ja: z.string().min(1),
  }),
  official_notice_url: z.url().nullable(),
  sources: z.array(SourceSchema).min(1),
  updated_at: isoDate,
});

export type Incident = z.infer<typeof IncidentSchema>;
export type Source = z.infer<typeof SourceSchema>;
