import { and, asc, between, eq, min } from "drizzle-orm";
import { bodyScans, bodyWeights, jumpTests, sessions as sessionsTable } from "../../drizzle/schema";
import type { Lookup } from "../../shared/analytics";
import type { Db } from "./common";
import { listSessionsInRange, type SessionListItem } from "./sessions";

export const MAX_CALENDAR_DAYS = 62;

export interface CalendarRange {
  from: string;
  to: string;
  /** Date of the very first recorded session (any date), or null if none. */
  firstSessionDate: string | null;
  sessions: SessionListItem[];
  weights: { id: number; date: string; weightKg: number; fasted: boolean }[];
  jumps: { id: number; date: string; approachReachCm: number }[];
  scans: { id: number; date: string; weightKg: number; fatMassKg: number; ffmKg: number }[];
}

/** Everything recorded between from and to (inclusive), for the calendar views. */
export async function calendarRange(
  db: Db,
  userId: number,
  lookup: Lookup,
  rpeMin: number,
  from: string,
  to: string
): Promise<CalendarRange> {
  const sessions = await listSessionsInRange(db, userId, lookup, rpeMin, from, to);
  const weights = await db
    .select({ id: bodyWeights.id, date: bodyWeights.date, weightKg: bodyWeights.weightKg, fasted: bodyWeights.fasted })
    .from(bodyWeights)
    .where(and(eq(bodyWeights.userId, userId), between(bodyWeights.date, from, to)))
    .orderBy(asc(bodyWeights.date));
  const jumps = await db
    .select({ id: jumpTests.id, date: jumpTests.date, approachReachCm: jumpTests.approachReachCm })
    .from(jumpTests)
    .where(and(eq(jumpTests.userId, userId), between(jumpTests.date, from, to)))
    .orderBy(asc(jumpTests.date), asc(jumpTests.id));
  const scans = await db
    .select({
      id: bodyScans.id,
      date: bodyScans.date,
      weightKg: bodyScans.weightKg,
      fatMassKg: bodyScans.fatMassKg,
      ffmKg: bodyScans.ffmKg,
    })
    .from(bodyScans)
    .where(and(eq(bodyScans.userId, userId), between(bodyScans.date, from, to)))
    .orderBy(asc(bodyScans.date), asc(bodyScans.id));
  const [first] = await db
    .select({ d: min(sessionsTable.date) })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId));
  return { from, to, firstSessionDate: first?.d ?? null, sessions, weights, jumps, scans };
}
