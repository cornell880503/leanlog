import { TRPCError } from "@trpc/server";
import { and, asc, between, desc, eq, inArray } from "drizzle-orm";
import {
  bodyScans,
  bodyWeights,
  sessions,
  workoutSets,
  type SessionRow,
  type WorkoutSetRow,
} from "../../drizzle/schema";
import {
  bodyweightOn,
  setE1rm,
  summarizeSession,
  type Lookup,
  type SessionInput,
  type SessionSummary,
  type WeightPoint,
} from "../../shared/analytics";
import type { SessionType } from "../../shared/exercises";
import type { Settings } from "../../shared/settings";
import { goalHints, strengthGoals, type GoalHint } from "../../shared/strength";
import type { Db } from "./common";

export const FALLBACK_BW = 70;

export interface SetPayload {
  exerciseKey: string;
  exerciseOrder: number;
  setNo: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
}

export interface SessionPayload {
  date: string;
  type: SessionType;
  startedAt: number | null;
  endedAt: number | null;
  durationMin: number | null;
  srpe: number | null;
  jumps: number;
  vbKind: string | null;
  kneeStatus: string | null;
  notes: string | null;
  sets: SetPayload[];
}

export interface SessionWithSets extends SessionRow {
  sets: WorkoutSetRow[];
}

export async function loadWeightPoints(db: Db, userId: number): Promise<WeightPoint[]> {
  const w = await db
    .select({ date: bodyWeights.date, weightKg: bodyWeights.weightKg })
    .from(bodyWeights)
    .where(eq(bodyWeights.userId, userId));
  // Scans also carry a weight; use them when no daily weight exists.
  const s = await db
    .select({ date: bodyScans.date, weightKg: bodyScans.weightKg })
    .from(bodyScans)
    .where(eq(bodyScans.userId, userId));
  const byDate = new Map<string, number>();
  for (const p of s) byDate.set(p.date, p.weightKg);
  for (const p of w) byDate.set(p.date, p.weightKg);
  return Array.from(byDate.entries()).map(([date, weightKg]) => ({ date, weightKg }));
}

function toTimestamp(ms: number | null): Date | null {
  return ms == null ? null : new Date(ms);
}

async function insertSets(db: Db, userId: number, sessionId: number, sets: SetPayload[], bw: number) {
  if (!sets.length) return;
  await db.insert(workoutSets).values(
    sets.map(s => ({
      sessionId,
      userId,
      exerciseKey: s.exerciseKey,
      exerciseOrder: s.exerciseOrder,
      setNo: s.setNo,
      weightKg: s.weightKg,
      reps: s.reps,
      rpe: s.rpe,
      isWarmup: s.isWarmup,
      bodyweightKg: bw,
    }))
  );
}

export async function createSession(
  db: Db,
  userId: number,
  clientId: string,
  p: SessionPayload
): Promise<{ id: number; duplicate: boolean }> {
  const existing = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.clientId, clientId)))
    .limit(1);
  if (existing.length) return { id: existing[0].id, duplicate: true };
  const bw = bodyweightOn(await loadWeightPoints(db, userId), p.date, FALLBACK_BW);
  return db.transaction(async tx => {
    const [res] = await tx.insert(sessions).values({
      userId,
      clientId,
      date: p.date,
      type: p.type,
      startedAt: toTimestamp(p.startedAt),
      endedAt: toTimestamp(p.endedAt),
      durationMin: p.durationMin,
      srpe: p.srpe,
      jumps: p.jumps,
      vbKind: p.vbKind,
      kneeStatus: p.kneeStatus,
      notes: p.notes,
    });
    const id = Number((res as unknown as { insertId: number }).insertId);
    await insertSets(tx as unknown as Db, userId, id, p.sets, bw);
    return { id, duplicate: false };
  });
}

export async function getOwnSession(db: Db, userId: number, id: number): Promise<SessionRow> {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這筆紀錄" });
  return rows[0];
}

export async function updateSession(db: Db, userId: number, id: number, p: SessionPayload): Promise<void> {
  const current = await getOwnSession(db, userId, id);
  const bw = bodyweightOn(await loadWeightPoints(db, userId), p.date, FALLBACK_BW);
  await db.transaction(async tx => {
    await tx
      .update(sessions)
      .set({
        date: p.date,
        type: p.type,
        startedAt: toTimestamp(p.startedAt) ?? current.startedAt,
        endedAt: toTimestamp(p.endedAt) ?? current.endedAt,
        durationMin: p.durationMin,
        srpe: p.srpe,
        jumps: p.jumps,
        vbKind: p.vbKind,
        kneeStatus: p.kneeStatus,
        notes: p.notes,
      })
      .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
    await tx.delete(workoutSets).where(and(eq(workoutSets.sessionId, id), eq(workoutSets.userId, userId)));
    await insertSets(tx as unknown as Db, userId, id, p.sets, bw);
  });
}

export async function deleteSession(db: Db, userId: number, id: number): Promise<void> {
  await getOwnSession(db, userId, id);
  await db.transaction(async tx => {
    await tx.delete(workoutSets).where(and(eq(workoutSets.sessionId, id), eq(workoutSets.userId, userId)));
    await tx.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
  });
}

function sortSets(sets: WorkoutSetRow[]): WorkoutSetRow[] {
  return [...sets].sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setNo - b.setNo);
}

/** All sessions with their sets, oldest first. */
export async function loadAllSessions(db: Db, userId: number): Promise<SessionWithSets[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(asc(sessions.date), asc(sessions.id));
  const sets = await db.select().from(workoutSets).where(eq(workoutSets.userId, userId));
  const bySession = new Map<number, WorkoutSetRow[]>();
  for (const s of sets) {
    const list = bySession.get(s.sessionId) ?? [];
    list.push(s);
    bySession.set(s.sessionId, list);
  }
  return rows.map(r => ({ ...r, sets: sortSets(bySession.get(r.id) ?? []) }));
}

export async function getSessionWithSets(db: Db, userId: number, id: number): Promise<SessionWithSets> {
  const s = await getOwnSession(db, userId, id);
  const sets = await db
    .select()
    .from(workoutSets)
    .where(and(eq(workoutSets.sessionId, id), eq(workoutSets.userId, userId)));
  return { ...s, sets: sortSets(sets) };
}

export function toSessionInput(s: SessionWithSets): SessionInput {
  return {
    id: s.id,
    date: s.date,
    type: s.type as SessionType,
    durationMin: s.durationMin,
    srpe: s.srpe,
    jumps: s.jumps,
    sets: s.sets.map(x => ({
      exerciseKey: x.exerciseKey,
      weightKg: x.weightKg,
      reps: x.reps,
      rpe: x.rpe,
      isWarmup: x.isWarmup,
      bodyweightKg: x.bodyweightKg,
    })),
  };
}

export interface SessionListItem {
  id: number;
  date: string;
  type: SessionType;
  durationMin: number | null;
  srpe: number | null;
  vbKind: string | null;
  kneeStatus: string | null;
  exerciseCount: number;
  setCount: number;
  summary: SessionSummary;
}

export async function listSessions(
  db: Db,
  userId: number,
  lookup: Lookup,
  rpeMin: number,
  limit: number
): Promise<SessionListItem[]> {
  const top = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.date), desc(sessions.id))
    .limit(limit);
  if (!top.length) return [];
  const ids = top.map(t => t.id);
  const rows = await db.select().from(sessions).where(and(eq(sessions.userId, userId), inArray(sessions.id, ids)));
  return toListItems(db, userId, rows, lookup, rpeMin);
}

/** Sessions dated from..to (inclusive), newest first. */
export async function listSessionsInRange(
  db: Db,
  userId: number,
  lookup: Lookup,
  rpeMin: number,
  from: string,
  to: string
): Promise<SessionListItem[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), between(sessions.date, from, to)));
  return toListItems(db, userId, rows, lookup, rpeMin);
}

async function toListItems(
  db: Db,
  userId: number,
  rows: SessionRow[],
  lookup: Lookup,
  rpeMin: number
): Promise<SessionListItem[]> {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const sets = await db
    .select()
    .from(workoutSets)
    .where(and(eq(workoutSets.userId, userId), inArray(workoutSets.sessionId, ids)));
  const weights = await loadWeightPoints(db, userId);
  return rows
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .map(r => {
      const own = sortSets(sets.filter(s => s.sessionId === r.id));
      const input = toSessionInput({ ...r, sets: own });
      const bw = bodyweightOn(weights, r.date, FALLBACK_BW);
      return {
        id: r.id,
        date: r.date,
        type: r.type as SessionType,
        durationMin: r.durationMin,
        srpe: r.srpe,
        vbKind: r.vbKind,
        kneeStatus: r.kneeStatus,
        exerciseCount: new Set(own.map(s => s.exerciseKey)).size,
        setCount: own.length,
        summary: summarizeSession(input, lookup, bw, rpeMin),
      };
    });
}

export interface LastPerformance {
  date: string;
  sets: { weightKg: number; reps: number; rpe: number | null; isWarmup: boolean }[];
  bestE1rm: number | null;
  allTimeBestE1rm: number | null;
}

export interface WorkoutContext {
  template: { date: string; exercises: { exerciseKey: string; sets: LastPerformance["sets"] }[] } | null;
  lastPerf: Record<string, LastPerformance>;
  bodyweightKg: number;
  /** Strength-target hints keyed by exercise (only exercises that have a target). */
  goals: Record<string, GoalHint>;
}

/** Data needed to pre-fill a new workout of the given type. */
export async function workoutContext(
  db: Db,
  userId: number,
  type: SessionType,
  lookup: Lookup,
  today: string,
  settings: Settings
): Promise<WorkoutContext> {
  // "today" is the date being recorded (a past date when back-filling), so only
  // sessions on or before it count as "last time".
  const all = (await loadAllSessions(db, userId)).filter(s => s.date <= today);
  const weights = await loadWeightPoints(db, userId);
  const bodyweightKg = bodyweightOn(weights, today, FALLBACK_BW);
  const lastOfType = [...all].reverse().find(s => s.type === type && s.sets.length > 0) ?? null;
  let template: WorkoutContext["template"] = null;
  if (lastOfType) {
    const order: string[] = [];
    const bucket = new Map<string, LastPerformance["sets"]>();
    for (const s of lastOfType.sets) {
      if (!bucket.has(s.exerciseKey)) {
        bucket.set(s.exerciseKey, []);
        order.push(s.exerciseKey);
      }
      bucket.get(s.exerciseKey)!.push({ weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, isWarmup: s.isWarmup });
    }
    template = { date: lastOfType.date, exercises: order.map(k => ({ exerciseKey: k, sets: bucket.get(k)! })) };
  }
  const lastPerf: Record<string, LastPerformance> = {};
  for (const s of all) {
    const bw = bodyweightOn(weights, s.date, FALLBACK_BW);
    const grouped = new Map<string, WorkoutSetRow[]>();
    for (const x of s.sets) {
      const list = grouped.get(x.exerciseKey) ?? [];
      list.push(x);
      grouped.set(x.exerciseKey, list);
    }
    for (const [key, list] of Array.from(grouped.entries())) {
      const ex = lookup(key);
      let best: number | null = null;
      if (ex) {
        for (const x of list) {
          const v = setE1rm(ex, { ...x, bodyweightKg: x.bodyweightKg ?? bw }, bw);
          if (v != null && (best == null || v > best)) best = v;
        }
      }
      const prevAll = lastPerf[key]?.allTimeBestE1rm ?? null;
      lastPerf[key] = {
        date: s.date,
        sets: list.map(x => ({ weightKg: x.weightKg, reps: x.reps, rpe: x.rpe, isWarmup: x.isWarmup })),
        bestE1rm: best,
        allTimeBestE1rm: best == null ? prevAll : prevAll == null ? best : Math.max(prevAll, best),
      };
    }
  }
  const goals = goalHints(
    strengthGoals({
      targets: settings.strengthTargets,
      milestones: settings.milestones,
      dumbbellStep: settings.dumbbellStep,
      sessions: all.map(toSessionInput),
      weights,
      lookup,
      today,
      fallbackBw: FALLBACK_BW,
    })
  );
  return { template, lastPerf, bodyweightKg, goals };
}
