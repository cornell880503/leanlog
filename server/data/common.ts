import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { customExercises } from "../../drizzle/schema";
import {
  EXERCISE_MAP,
  customToDef,
  type ExerciseDef,
} from "../../shared/exercises";
import type { Lookup } from "../../shared/analytics";
import { getDb } from "../db";

export type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "資料庫暫時無法連線" });
  }
  return db;
}

export async function loadCustomDefs(db: Db, userId: number): Promise<ExerciseDef[]> {
  const rows = await db
    .select()
    .from(customExercises)
    .where(eq(customExercises.userId, userId));
  return rows.map(r => customToDef(r));
}

export async function buildLookup(db: Db, userId: number): Promise<{ lookup: Lookup; custom: ExerciseDef[] }> {
  const custom = await loadCustomDefs(db, userId);
  const cmap = new Map(custom.map(c => [c.key, c]));
  const lookup: Lookup = key => EXERCISE_MAP[key] ?? cmap.get(key);
  return { lookup, custom };
}

export async function assertOwnCustom(db: Db, userId: number, id: number) {
  const rows = await db
    .select({ id: customExercises.id })
    .from(customExercises)
    .where(and(eq(customExercises.id, id), eq(customExercises.userId, userId)))
    .limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個動作" });
}
