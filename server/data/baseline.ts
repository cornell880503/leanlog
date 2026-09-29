import { and, asc, eq, sql } from "drizzle-orm";
import { bodyScans, jumpTests, userSettings, users } from "../../drizzle/schema";
import type { Db } from "./common";

/** Bump when the baseline dataset changes; each version is imported at most once. */
export const BASELINE_VERSION = 1;

export const BASELINE_SCAN = {
  date: "2026-08-02",
  time: "09:22",
  device: "Boditrax",
  location: "Fitness First One Raffles Quay",
  weightKg: 68.6,
  fatMassKg: 9.5,
  ffmKg: 59.1,
  muscleMassKg: 56.0,
  waterKg: 40.7,
  ecwKg: 15.0,
  icwKg: 25.7,
  visceralFat: 5,
  cellularIntegrity: 6.6,
  metabolicAge: 18,
  physiqueScore: 8,
  legMuscleScore: 104,
  bmrScore: 14,
  boditraxScore: 802,
  muscleCore: 29.6,
  muscleLArm: 2.9,
  muscleRArm: 3.2,
  muscleLLeg: 10.1,
  muscleRLeg: 10.2,
  fatCore: 4.7,
  fatLArm: 0.3,
  fatRArm: 0.3,
  fatLLeg: 2.1,
  fatRLeg: 2.1,
  notes: "基準掃描；體重由去脂體重＋脂肪推算（自述空腹體重 70–71 kg）",
};

export const BASELINE_JUMP = {
  date: "2026-09-29",
  standingReachCm: null as number | null,
  approachReachCm: 305,
  notes: "自述：助跑剛好摸到籃框，約略值",
};

/** The site owner is the earliest account created in this personal app. */
export async function isFirstUser(db: Db, userId: number): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
  return rows[0]?.id === userId;
}

/**
 * Import the baseline once. The version column is claimed atomically so
 * concurrent requests or restarts never import twice.
 */
export async function importBaselineIfNeeded(db: Db, userId: number, force = false): Promise<boolean> {
  if (!force && !(await isFirstUser(db, userId))) return false;
  const [res] = await db
    .update(userSettings)
    .set({ baselineVersion: BASELINE_VERSION })
    .where(and(eq(userSettings.userId, userId), sql`${userSettings.baselineVersion} < ${BASELINE_VERSION}`));
  const affected = (res as unknown as { affectedRows?: number })?.affectedRows ?? 0;
  if (affected !== 1) return false;
  try {
    const existingScan = await db
      .select({ id: bodyScans.id })
      .from(bodyScans)
      .where(and(eq(bodyScans.userId, userId), eq(bodyScans.date, BASELINE_SCAN.date)))
      .limit(1);
    if (!existingScan.length) await db.insert(bodyScans).values({ userId, ...BASELINE_SCAN });
    const existingJump = await db
      .select({ id: jumpTests.id })
      .from(jumpTests)
      .where(and(eq(jumpTests.userId, userId), eq(jumpTests.date, BASELINE_JUMP.date)))
      .limit(1);
    if (!existingJump.length) await db.insert(jumpTests).values({ userId, ...BASELINE_JUMP });
    return true;
  } catch (err) {
    // Release the claim so a later request can retry.
    await db.update(userSettings).set({ baselineVersion: 0 }).where(eq(userSettings.userId, userId));
    throw err;
  }
}
