import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  bodyScans,
  bodyWeights,
  customExercises,
  jumpTests,
  type BodyScanRow,
} from "../../drizzle/schema";
import type { Db } from "./common";

// ───────── weights ─────────

export async function upsertWeight(db: Db, userId: number, date: string, weightKg: number, fasted: boolean) {
  await db
    .insert(bodyWeights)
    .values({ userId, date, weightKg, fasted })
    .onDuplicateKeyUpdate({ set: { weightKg, fasted } });
}

export async function listWeights(db: Db, userId: number, limit = 400) {
  return db
    .select()
    .from(bodyWeights)
    .where(eq(bodyWeights.userId, userId))
    .orderBy(desc(bodyWeights.date))
    .limit(limit);
}

export async function deleteWeight(db: Db, userId: number, id: number) {
  await db.delete(bodyWeights).where(and(eq(bodyWeights.id, id), eq(bodyWeights.userId, userId)));
}

// ───────── scans ─────────

export type ScanPayload = Omit<BodyScanRow, "id" | "userId" | "createdAt" | "device"> & { device?: string };

export async function createScan(db: Db, userId: number, p: ScanPayload): Promise<number> {
  const [res] = await db.insert(bodyScans).values({ ...p, userId, device: p.device ?? "Boditrax" });
  return Number((res as unknown as { insertId: number }).insertId);
}

export async function listScans(db: Db, userId: number) {
  return db.select().from(bodyScans).where(eq(bodyScans.userId, userId)).orderBy(asc(bodyScans.date), asc(bodyScans.id));
}

export async function deleteScan(db: Db, userId: number, id: number) {
  await db.delete(bodyScans).where(and(eq(bodyScans.id, id), eq(bodyScans.userId, userId)));
}

// ───────── jumps ─────────

export async function createJump(
  db: Db,
  userId: number,
  p: { date: string; approachReachCm: number; standingReachCm: number | null; notes: string | null }
) {
  await db.insert(jumpTests).values({ userId, ...p });
}

export async function listJumps(db: Db, userId: number) {
  return db.select().from(jumpTests).where(eq(jumpTests.userId, userId)).orderBy(asc(jumpTests.date), asc(jumpTests.id));
}

export async function deleteJump(db: Db, userId: number, id: number) {
  await db.delete(jumpTests).where(and(eq(jumpTests.id, id), eq(jumpTests.userId, userId)));
}

// ───────── custom exercises ─────────

export interface CustomPayload {
  name: string;
  days: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  category: string;
  unit: string;
  bwFactor: number;
}

export async function createCustomExercise(db: Db, userId: number, p: CustomPayload): Promise<number> {
  const [res] = await db.insert(customExercises).values({ ...p, userId });
  return Number((res as unknown as { insertId: number }).insertId);
}

export async function setCustomArchived(db: Db, userId: number, id: number, archived: boolean) {
  const rows = await db
    .select({ id: customExercises.id })
    .from(customExercises)
    .where(and(eq(customExercises.id, id), eq(customExercises.userId, userId)))
    .limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個動作" });
  await db
    .update(customExercises)
    .set({ archived })
    .where(and(eq(customExercises.id, id), eq(customExercises.userId, userId)));
}
