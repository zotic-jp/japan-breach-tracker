// CI check: every incident file parses, matches its file name, and has no em dash.
import fs from "node:fs";
import path from "node:path";
import { INCIDENTS_DIR, loadIncidents } from "./store.ts";

const incidents = loadIncidents();
const problems: string[] = [];
for (const f of fs.readdirSync(INCIDENTS_DIR)) {
  if (fs.readFileSync(path.join(INCIDENTS_DIR, f), "utf8").includes("\u2014")) problems.push(`${f}: contains an em dash`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${incidents.length} incidents valid`);
