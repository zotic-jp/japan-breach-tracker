import fs from "node:fs";
import path from "node:path";

// Files saved by `npm run logos`, keyed by domain. Read at build time from the project root.
const dir = path.join(process.cwd(), "public/logos");
const files = new Map(
  (fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f.slice(0, f.lastIndexOf(".")), `/logos/${f}`]),
);

export function logoUrl(domain: string | null): string | null {
  return (domain && files.get(domain)) || null;
}
