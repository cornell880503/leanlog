/**
 * Weekly / monthly training trends: total volume and intensity per period.
 * Pure functions shared by the server (tRPC `trends.series`), the client and tests.
 *
 * Definitions intentionally reuse the rest of the app:
 * - volume / hardSets / load come from `summarizeSession` (same numbers as each
 *   session's summary and the weekly card);
 * - e1RM uses `setE1rm` with the bodyweight on that date (same as strength goals).
 */
import {
  addDays,
  bodyweightOn,
  round1,
  setE1rm,
  setVolume,
  summarizeSession,
  weekStart,
  type Lookup,
  type SessionInput,
  type WeightPoint,
} from "./analytics";
import { DAY_TYPES, type SessionType } from "./exercises";

export type TrendPeriod = "week" | "month";

/** Maximum number of periods per request. */
export const TREND_LIMITS: Record<TrendPeriod, number> = { week: 104, month: 36 };

/** Stacking order for charts (bottom → top). */
export const TREND_TYPES: SessionType[] = ["leg", "back", "chest", "volleyball", "other"];

// ───────────────────────── periods ─────────────────────────

/** First day of the period containing d (weeks start on Monday). */
export function periodStart(d: string, p: TrendPeriod): string {
  return p === "week" ? weekStart(d) : `${d.slice(0, 7)}-01`;
}

/** Start of the period n periods after (negative = before) `start`. */
export function shiftPeriod(start: string, p: TrendPeriod, n: number): string {
  if (p === "week") return addDays(start, 7 * n);
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
}

/** Last day of the period that starts on `start`. */
export function periodEnd(start: string, p: TrendPeriod): string {
  return addDays(shiftPeriod(start, p, 1), -1);
}

/** `count` period starts, oldest first; the last one contains `today`. */
export function periodStarts(today: string, p: TrendPeriod, count: number): string[] {
  const current = periodStart(today, p);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(shiftPeriod(current, p, -i));
  return out;
}

// ───────────────────────── series ─────────────────────────

export interface TypeTotals {
  sessions: number;
  volume: number;
  hardSets: number;
  load: number;
}

export interface TrendBucket {
  start: string;
  end: string;
  /** The current (unfinished) week / month. */
  inProgress: boolean;
  sessions: number;
  strengthSessions: number;
  volleyballSessions: number;
  durationMin: number;
  /** Σ weight × reps (kg), same as the session summary's 容量. */
  volume: number;
  hardSets: number;
  /** Σ sRPE × minutes. */
  load: number;
  jumps: number;
  byType: Record<SessionType, TypeTotals>;
  /** Working (non-warm-up) sets with an RPE entered, any category. */
  rpeSets: number;
  avgRpe: number | null;
  /** Reps of loaded working sets (compound / isolation, rep-based). */
  workReps: number;
  /** Loaded working-set volume ÷ workReps. */
  avgLoadPerRep: number | null;
  /** Best e1RM per exercise key in this period. */
  e1rm: Record<string, number>;
}

export interface TrendLift {
  key: string;
  name: string;
  /** One of the user's strength targets. */
  isTarget: boolean;
  /** Number of periods in range with an e1RM for this lift. */
  periods: number;
}

export interface TrendSeries {
  period: TrendPeriod;
  today: string;
  buckets: TrendBucket[];
  lifts: TrendLift[];
  /** First session on or before today, across all history (null = none yet). */
  firstSessionDate: string | null;
}

export interface TrendInput {
  sessions: SessionInput[];
  lookup: Lookup;
  weights: WeightPoint[];
  fallbackBw: number;
  rpeMin: number;
  /** Strength-target exercise keys, in settings order. */
  targetKeys: string[];
  today: string;
  period: TrendPeriod;
  count: number;
}

function emptyTypes(): Record<SessionType, TypeTotals> {
  const out = {} as Record<SessionType, TypeTotals>;
  for (const t of TREND_TYPES) out[t] = { sessions: 0, volume: 0, hardSets: 0, load: 0 };
  return out;
}

export function trendSeries(input: TrendInput): TrendSeries {
  const { sessions, lookup, weights, fallbackBw, rpeMin, targetKeys, today, period, count } = input;
  const starts = periodStarts(today, period, count);
  const current = starts[starts.length - 1];
  const index = new Map(starts.map((s, i) => [s, i]));
  const buckets: TrendBucket[] = starts.map(start => ({
    start,
    end: periodEnd(start, period),
    inProgress: start === current,
    sessions: 0,
    strengthSessions: 0,
    volleyballSessions: 0,
    durationMin: 0,
    volume: 0,
    hardSets: 0,
    load: 0,
    jumps: 0,
    byType: emptyTypes(),
    rpeSets: 0,
    avgRpe: null,
    workReps: 0,
    avgLoadPerRep: null,
    e1rm: {},
  }));
  const rpeSum = new Array<number>(buckets.length).fill(0);
  const loadedVolume = new Array<number>(buckets.length).fill(0);

  let firstSessionDate: string | null = null;
  for (const s of sessions) {
    if (s.date > today) continue;
    if (firstSessionDate == null || s.date < firstSessionDate) firstSessionDate = s.date;
    const i = index.get(periodStart(s.date, period));
    if (i == null) continue;
    const b = buckets[i];
    const bw = bodyweightOn(weights, s.date, fallbackBw);
    const sum = summarizeSession(s, lookup, bw, rpeMin);

    b.sessions += 1;
    if ((DAY_TYPES as readonly string[]).includes(s.type)) b.strengthSessions += 1;
    if (s.type === "volleyball") b.volleyballSessions += 1;
    b.durationMin += s.durationMin ?? 0;
    b.volume += sum.volume;
    b.hardSets += sum.hardSets;
    b.load += sum.load;
    b.jumps += sum.totalJumps;
    const t = b.byType[s.type] ?? b.byType.other;
    t.sessions += 1;
    t.volume += sum.volume;
    t.hardSets += sum.hardSets;
    t.load += sum.load;

    for (const set of s.sets) {
      const ex = lookup(set.exerciseKey);
      if (!ex || set.isWarmup) continue;
      // Every working set with an RPE entered counts (any category).
      if (set.rpe != null) {
        rpeSum[i] += set.rpe;
        b.rpeSets += 1;
      }
      if ((ex.category === "compound" || ex.category === "isolation") && ex.unit !== "sec") {
        const v = setVolume(ex, set, bw);
        if (v > 0) {
          loadedVolume[i] += v;
          b.workReps += set.reps;
        }
      }
      const est = setE1rm(ex, set, bw);
      if (est != null && (b.e1rm[ex.key] == null || est > b.e1rm[ex.key])) b.e1rm[ex.key] = est;
    }
  }

  const periodsByLift = new Map<string, number>();
  buckets.forEach((b, i) => {
    b.volume = round1(b.volume);
    b.load = round1(b.load);
    b.hardSets = round1(b.hardSets);
    for (const t of TREND_TYPES) {
      b.byType[t].volume = round1(b.byType[t].volume);
      b.byType[t].load = round1(b.byType[t].load);
      b.byType[t].hardSets = round1(b.byType[t].hardSets);
    }
    b.avgRpe = b.rpeSets ? round1(rpeSum[i] / b.rpeSets) : null;
    b.avgLoadPerRep = b.workReps ? round1(loadedVolume[i] / b.workReps) : null;
    for (const k of Object.keys(b.e1rm)) {
      b.e1rm[k] = round1(b.e1rm[k]);
      periodsByLift.set(k, (periodsByLift.get(k) ?? 0) + 1);
    }
  });

  const targetOrder = new Map(targetKeys.map((k, i) => [k, i]));
  const lifts: TrendLift[] = Array.from(periodsByLift.entries())
    .map(([key, periods]) => ({ key, name: lookup(key)?.name ?? key, isTarget: targetOrder.has(key), periods }))
    .sort((a, b) => {
      if (a.isTarget !== b.isTarget) return a.isTarget ? -1 : 1;
      if (a.isTarget && b.isTarget) return targetOrder.get(a.key)! - targetOrder.get(b.key)!;
      return b.periods - a.periods || a.name.localeCompare(b.name);
    });

  return { period, today, buckets, lifts, firstSessionDate };
}

// ───────────────────────── comparisons ─────────────────────────

/** Percentage change, or null when there is no base to compare with. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return round1(((current - previous) / previous) * 100);
}

export interface Growth {
  first: number;
  last: number;
  firstStart: string;
  lastStart: string;
  delta: number;
  pct: number | null;
}

/** First vs last non-null value (needs at least two periods with data). */
export function growth(points: { start: string; value: number | null | undefined }[]): Growth | null {
  const vals = points.filter((p): p is { start: string; value: number } => p.value != null);
  if (vals.length < 2) return null;
  const a = vals[0];
  const b = vals[vals.length - 1];
  return {
    first: a.value,
    last: b.value,
    firstStart: a.start,
    lastStart: b.start,
    delta: round1(b.value - a.value),
    pct: pctChange(b.value, a.value),
  };
}

export interface PeriodComparison {
  current: TrendBucket;
  previous: TrendBucket;
  value: number;
  previousValue: number;
  delta: number;
  pct: number | null;
}

/** Latest complete period vs the one before it (the in-progress period is skipped). */
export function compareLastComplete(
  buckets: TrendBucket[],
  pick: (b: TrendBucket) => number
): PeriodComparison | null {
  const complete = buckets.filter(b => !b.inProgress);
  if (complete.length < 2) return null;
  const current = complete[complete.length - 1];
  const previous = complete[complete.length - 2];
  const value = pick(current);
  const previousValue = pick(previous);
  return { current, previous, value, previousValue, delta: round1(value - previousValue), pct: pctChange(value, previousValue) };
}
