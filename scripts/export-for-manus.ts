/**
 * Export one user's data from the database into the CSV layout used by the
 * offline analysis tool (analysis/data/*.csv).
 *
 * Usage:
 *   pnpm tsx scripts/export-for-manus.ts --out analysis/data
 *   pnpm tsx scripts/export-for-manus.ts --out /tmp/x --user 123
 *
 * Without --user, the site owner (earliest account) is exported.
 */
import "dotenv/config";
import { asc } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { users } from "../drizzle/schema";
import { buildLookup, requireDb } from "../server/data/common";
import { buildExport } from "../server/data/export";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const out = path.resolve(arg("out") ?? "export");
  const db = await requireDb();
  let userId = arg("user") ? Number(arg("user")) : NaN;
  if (!Number.isFinite(userId)) {
    const first = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
    if (!first.length) {
      console.error("No user has signed in yet — open the site and log in once first.");
      process.exit(2);
    }
    userId = first[0].id;
  }
  const { lookup, custom } = await buildLookup(db, userId);
  const files = await buildExport(db, userId, lookup, custom);
  fs.mkdirSync(out, { recursive: true });
  for (const f of files) {
    fs.writeFileSync(path.join(out, f.name), f.content, "utf8");
    const rows = Math.max(0, f.content.trim().split("\n").length - 1);
    console.log(`${f.name}\t${rows} rows`);
  }
  console.log(`Exported user ${userId} → ${out}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
