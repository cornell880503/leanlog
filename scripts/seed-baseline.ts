/**
 * Import the Boditrax baseline (2026-08-02) and the 305 cm reach test into
 * the owner's account. Normally this happens automatically on first login;
 * this script is a manual fallback. Safe to run repeatedly.
 *
 * Usage: pnpm tsx scripts/seed-baseline.ts [--user ID]
 */
import "dotenv/config";
import { asc } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { importBaselineIfNeeded } from "../server/data/baseline";
import { requireDb } from "../server/data/common";
import { ensureSettings } from "../server/data/settings";

async function main() {
  const db = await requireDb();
  const i = process.argv.indexOf("--user");
  let userId = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  if (!Number.isFinite(userId)) {
    const first = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
    if (!first.length) {
      console.error("No user has signed in yet — open the site and log in once first.");
      process.exit(2);
    }
    userId = first[0].id;
  }
  await ensureSettings(db, userId);
  const imported = await importBaselineIfNeeded(db, userId, true);
  console.log(imported ? `Baseline imported for user ${userId}` : `Baseline already present for user ${userId}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
