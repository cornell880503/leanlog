import {
  DAY_TYPES,
  TARGET_MUSCLES,
  type ExerciseDef,
  type SessionType,
  type StrengthDay,
} from "./exercises";
import type { RotationItem, Settings } from "./settings";

// ───────────────────────── dates (pure string math, UTC based) ─────────────────────────

export function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function fmtDate(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const dt = parseDate(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmtDate(dt);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(d: string): number {
  return parseDate(d).getUTCDay();
}

/** Monday of the ISO week containing d. */
export function weekStart(d: string): string {
  const wd = weekday(d);
  return addDays(d, wd === 0 ? -6 : 1 - wd);
}

export function isoWeek(d: string): string {
  const dt = parseDate(d);
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ───────────────────────── sets ─────────────────────────

export interface SetInput {
  exerciseKey: string;
  weightKg: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
  bodyweightKg: number | null;
}

export type Lookup = (key: string) => ExerciseDef | undefined;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Load actually moved in one rep (kg). */
export function effectiveLoad(ex: ExerciseDef, set: SetInput, fallbackBw: number): number {
  const bw = set.bodyweightKg ?? fallbackBw;
  const w = Number(set.weightKg) || 0;
  if (ex.bwFactor > 0) {
    if (ex.assisted) return Math.max(0, ex.bwFactor * bw - w);
    return ex.bwFactor * bw + w;
  }
  return w;
}

export function setVolume(ex: ExerciseDef, set: SetInput, fallbackBw: number): number {
  if (ex.category === "plyo" || ex.unit === "sec") return 0;
  return effectiveLoad(ex, set, fallbackBw) * set.reps;
}

export function e1rm(load: number, reps: number): number | null {
  if (reps < 1 || reps > 12 || load <= 0) return null;
  return load * (1 + reps / 30);
}

export function setE1rm(ex: ExerciseDef, set: SetInput, fallbackBw: number): number | null {
  if (set.isWarmup) return null;
  if (ex.unit === "sec") return null;
  if (ex.category !== "compound" && ex.category !== "isolation") return null;
  return e1rm(effectiveLoad(ex, set, fallbackBw), set.reps);
}

export function isHardSet(ex: ExerciseDef, set: SetInput, rpeMin: number): boolean {
  if (set.isWarmup) return false;
  if (!["compound", "isolation", "core"].includes(ex.category)) return false;
  return set.rpe == null || set.rpe >= rpeMin;
}

export function plyoContacts(ex: ExerciseDef, set: SetInput): number {
  if (ex.category !== "plyo" || ex.unit === "sec" || set.isWarmup) return 0;
  return set.reps;
}

export function addMuscleSets(target: Record<string, number>, ex: ExerciseDef): void {
  for (const m of ex.primary) target[m] = (target[m] ?? 0) + 1;
  for (const m of ex.secondary) target[m] = (target[m] ?? 0) + 0.5;
}

export function emptyMuscleMap(): Record<string, number> {
  return Object.fromEntries(TARGET_MUSCLES.map(m => [m, 0]));
}

// ───────────────────────── sessions ─────────────────────────

export interface SessionInput {
  id: number;
  date: string;
  type: SessionType;
  durationMin: number | null;
  srpe: number | null;
  jumps: number;
  sets: SetInput[];
}

export interface ExerciseSummary {
  key: string;
  name: string;
  sets: number;
  workSets: number;
  volume: number;
  bestE1rm: number | null;
  bestSet: { weightKg: number; reps: number } | null;
}

export interface SessionSummary {
  volume: number;
  hardSets: number;
  muscleSets: Record<string, number>;
  plyoJumps: number;
  totalJumps: number;
  load: number;
  exercises: ExerciseSummary[];
}

export function sessionLoad(s: Pick<SessionInput, "durationMin" | "srpe">): number {
  return (s.durationMin ?? 0) * (s.srpe ?? 0);
}

export function summarizeSession(
  s: SessionInput,
  lookup: Lookup,
  fallbackBw: number,
  rpeMin: number
): SessionSummary {
  const muscleSets = emptyMuscleMap();
  const byEx = new Map<string, ExerciseSummary>();
  let volume = 0;
  let hardSets = 0;
  let plyoJumps = 0;
  for (const set of s.sets) {
    const ex = lookup(set.exerciseKey);
    if (!ex) continue;
    let e = byEx.get(ex.key);
    if (!e) {
      e = { key: ex.key, name: ex.name, sets: 0, workSets: 0, volume: 0, bestE1rm: null, bestSet: null };
      byEx.set(ex.key, e);
    }
    e.sets += 1;
    if (!set.isWarmup) e.workSets += 1;
    const v = setVolume(ex, set, fallbackBw);
    e.volume += v;
    volume += v;
    const est = setE1rm(ex, set, fallbackBw);
    if (est != null && (e.bestE1rm == null || est > e.bestE1rm)) {
      e.bestE1rm = est;
      e.bestSet = { weightKg: set.weightKg, reps: set.reps };
    }
    if (!set.isWarmup && e.bestSet == null && est == null) {
      e.bestSet = { weightKg: set.weightKg, reps: set.reps };
    }
    if (isHardSet(ex, set, rpeMin)) {
      hardSets += 1;
      addMuscleSets(muscleSets, ex);
    }
    plyoJumps += plyoContacts(ex, set);
  }
  return {
    volume,
    hardSets,
    muscleSets,
    plyoJumps,
    totalJumps: (s.jumps ?? 0) + plyoJumps,
    load: sessionLoad(s),
    exercises: Array.from(byEx.values()),
  };
}

export interface PrRecord {
  key: string;
  name: string;
  e1rm: number;
  previousBest: number | null;
}

/** New e1RM records compared with the best of all earlier sessions. */
export function findPrs(
  current: SessionSummary,
  previousBestByKey: Record<string, number | undefined>
): PrRecord[] {
  const prs: PrRecord[] = [];
  for (const e of current.exercises) {
    if (e.bestE1rm == null) continue;
    const prev = previousBestByKey[e.key];
    if (prev == null || e.bestE1rm > prev + 1e-9) {
      prs.push({ key: e.key, name: e.name, e1rm: e.bestE1rm, previousBest: prev ?? null });
    }
  }
  return prs;
}

// ───────────────────────── weekly stats ─────────────────────────

export interface WeekStats {
  week: string;
  start: string;
  end: string;
  inProgress: boolean;
  sessions: number;
  strengthSessions: number;
  volleyballSessions: number;
  muscleSets: Record<string, number>;
  load: number;
  jumps: number;
  /** null = not enough history to judge. */
  loadSpike: boolean | null;
  jumpSpike: boolean | null;
  loadRatio: number | null;
  jumpRatio: number | null;
}

export function weeklyStats(
  sessions: SessionInput[],
  lookup: Lookup,
  fallbackBw: number,
  settings: Pick<Settings, "hardSetRpeMin" | "loadSpikeRatio">,
  today: string,
  weeks = 8
): WeekStats[] {
  const currentStart = weekStart(today);
  const firstDataStart = sessions.length
    ? sessions.map(s => weekStart(s.date)).sort()[0]
    : currentStart;
  // Include extra weeks before the window so spike checks have history.
  const starts: string[] = [];
  for (let i = weeks - 1 + 3; i >= 0; i--) starts.push(addDays(currentStart, -7 * i));
  const map = new Map<string, WeekStats>();
  for (const st of starts) {
    map.set(st, {
      week: isoWeek(st),
      start: st,
      end: addDays(st, 6),
      inProgress: st === currentStart,
      sessions: 0,
      strengthSessions: 0,
      volleyballSessions: 0,
      muscleSets: emptyMuscleMap(),
      load: 0,
      jumps: 0,
      loadSpike: null,
      jumpSpike: null,
      loadRatio: null,
      jumpRatio: null,
    });
  }
  for (const s of sessions) {
    const w = map.get(weekStart(s.date));
    if (!w) continue;
    const sum = summarizeSession(s, lookup, fallbackBw, settings.hardSetRpeMin);
    w.sessions += 1;
    if ((DAY_TYPES as readonly string[]).includes(s.type)) w.strengthSessions += 1;
    if (s.type === "volleyball") w.volleyballSessions += 1;
    for (const [m, v] of Object.entries(sum.muscleSets)) w.muscleSets[m] = (w.muscleSets[m] ?? 0) + v;
    w.load += sum.load;
    w.jumps += sum.totalJumps;
  }
  const list = starts.map(st => map.get(st)!);
  list.forEach((w, i) => {
    if (i < 3) return;
    const prev = list.slice(i - 3, i);
    // Need three full weeks of history since the first recorded week.
    if (prev[0].start < firstDataStart) return;
    const avgLoad = prev.reduce((a, p) => a + p.load, 0) / 3;
    const avgJumps = prev.reduce((a, p) => a + p.jumps, 0) / 3;
    if (avgLoad > 0) {
      w.loadRatio = w.load / avgLoad;
      w.loadSpike = w.loadRatio > settings.loadSpikeRatio;
    }
    if (avgJumps > 0) {
      w.jumpRatio = w.jumps / avgJumps;
      w.jumpSpike = w.jumpRatio > settings.loadSpikeRatio;
    }
  });
  return list.slice(3);
}

export type SetStatus = "low" | "ok" | "high";

export function setStatus(value: number, range: [number, number]): SetStatus {
  if (value < range[0]) return "low";
  if (value > range[1]) return "high";
  return "ok";
}

// ───────────────────────── body composition ─────────────────────────

export interface ScanInput {
  date: string;
  weightKg: number;
  fatMassKg: number;
  ffmKg: number;
}

export interface BodyComp {
  date: string;
  weightKg: number;
  fatMassKg: number;
  ffmKg: number;
  bfPct: number;
  ffmi: number;
  inTarget: boolean;
}

export function bodyComp(
  scan: ScanInput,
  s: Pick<Settings, "heightCm" | "bfMin" | "bfMax" | "ffmiMin" | "ffmiMax">
): BodyComp {
  const h = s.heightCm / 100;
  const bfPct = (scan.fatMassKg / scan.weightKg) * 100;
  const ffmi = scan.ffmKg / (h * h);
  return {
    date: scan.date,
    weightKg: scan.weightKg,
    fatMassKg: scan.fatMassKg,
    ffmKg: scan.ffmKg,
    bfPct,
    ffmi,
    inTarget: bfPct >= s.bfMin && bfPct <= s.bfMax && ffmi >= s.ffmiMin && ffmi <= s.ffmiMax,
  };
}

export type MilestoneStatus = "met" | "missed" | "pending";

export interface MilestoneResult {
  name: string;
  by: string;
  ffmMinKg: number;
  bfMax: number;
  status: MilestoneStatus;
  metOn: string | null;
  ffmGap: number | null;
  bfGap: number | null;
}

export interface BodyProgress {
  history: BodyComp[];
  baseline: BodyComp | null;
  latest: BodyComp | null;
  achieved: boolean;
  targetFfmKg: number;
  ffmGapKg: number | null;
  /** Fat to lose to reach bfMax at the target FFM. */
  fatToLoseAtGoalKg: number | null;
  goalWeightKg: number;
  goalFatKg: number;
  /** Fat to lose to reach bfMax at the current FFM. */
  fatToLoseNowKg: number | null;
  bfProgress: number | null;
  ffmProgress: number | null;
  milestones: MilestoneResult[];
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function bodyProgress(scans: ScanInput[], s: Settings, today: string): BodyProgress {
  const sorted = [...scans].sort((a, b) => a.date.localeCompare(b.date));
  const history = sorted.map(x => bodyComp(x, s));
  const h = s.heightCm / 100;
  const targetFfmKg = s.ffmiMin * h * h;
  const goalWeightKg = targetFfmKg / (1 - s.bfMax / 100);
  const goalFatKg = goalWeightKg - targetFfmKg;
  const baseline = history[0] ?? null;
  const latest = history[history.length - 1] ?? null;
  const achieved =
    history.length >= 2 && history[history.length - 1].inTarget && history[history.length - 2].inTarget;
  let bfProgress: number | null = null;
  let ffmProgress: number | null = null;
  if (baseline && latest) {
    bfProgress =
      baseline.bfPct <= s.bfMax ? 1 : clamp01((baseline.bfPct - latest.bfPct) / (baseline.bfPct - s.bfMax));
    ffmProgress =
      baseline.ffmKg >= targetFfmKg ? 1 : clamp01((latest.ffmKg - baseline.ffmKg) / (targetFfmKg - baseline.ffmKg));
  }
  const milestones: MilestoneResult[] = s.milestones.map(m => {
    const hit = history.find(c => c.date <= m.by && c.ffmKg >= m.ffmMinKg && c.bfPct <= m.bfMax);
    const status: MilestoneStatus = hit ? "met" : today > m.by ? "missed" : "pending";
    return {
      ...m,
      status,
      metOn: hit?.date ?? null,
      ffmGap: latest ? Math.max(0, m.ffmMinKg - latest.ffmKg) : null,
      bfGap: latest ? Math.max(0, latest.bfPct - m.bfMax) : null,
    };
  });
  return {
    history,
    baseline,
    latest,
    achieved,
    targetFfmKg,
    ffmGapKg: latest ? Math.max(0, targetFfmKg - latest.ffmKg) : null,
    fatToLoseAtGoalKg: latest ? Math.max(0, latest.fatMassKg - goalFatKg) : null,
    goalWeightKg,
    goalFatKg,
    fatToLoseNowKg: latest
      ? Math.max(0, latest.fatMassKg - (latest.ffmKg / (1 - s.bfMax / 100) - latest.ffmKg))
      : null,
    bfProgress,
    ffmProgress,
    milestones,
  };
}

// ───────────────────────── jump ─────────────────────────

export interface JumpInput {
  date: string;
  approachReachCm: number;
  standingReachCm: number | null;
}

export interface JumpProgress {
  history: { date: string; approachReachCm: number; jumpCm: number }[];
  baselineReachCm: number | null;
  latestReachCm: number | null;
  bestReachCm: number | null;
  standingReachCm: number;
  latestJumpCm: number | null;
  targetReachCm: number;
  targetJumpCm: number;
  remainingCm: number | null;
  progress: number | null;
}

export function jumpProgress(
  tests: JumpInput[],
  standingReachCm: number,
  targetReachCm: number
): JumpProgress {
  const sorted = [...tests].sort((a, b) => a.date.localeCompare(b.date));
  const history = sorted.map(t => {
    const sr = t.standingReachCm ?? standingReachCm;
    return { date: t.date, approachReachCm: t.approachReachCm, jumpCm: t.approachReachCm - sr };
  });
  const baseline = history[0]?.approachReachCm ?? null;
  const latest = history[history.length - 1]?.approachReachCm ?? null;
  const best = history.length ? Math.max(...history.map(x => x.approachReachCm)) : null;
  let progress: number | null = null;
  if (baseline != null && best != null) {
    progress = baseline >= targetReachCm ? 1 : clamp01((best - baseline) / (targetReachCm - baseline));
  }
  return {
    history,
    baselineReachCm: baseline,
    latestReachCm: latest,
    bestReachCm: best,
    standingReachCm,
    latestJumpCm: latest != null ? latest - standingReachCm : null,
    targetReachCm,
    targetJumpCm: targetReachCm - standingReachCm,
    remainingCm: best != null ? Math.max(0, targetReachCm - best) : null,
    progress,
  };
}

// ───────────────────────── today's suggestion ─────────────────────────

export interface SuggestionSession {
  date: string;
  type: SessionType;
}

/** Why the suggestion came out this way, so the UI can explain it. */
export interface SuggestionBasis {
  /** Date and type of the most recent strength session on or before today. */
  lastDate: string;
  lastType: StrengthDay;
  /** Rest days actually taken since then (days with no strength or volleyball). */
  restTaken: number;
  /** Rest days the rotation asks for (+1 per volleyball session in between). */
  restNeeded: number;
  /** Volleyball sessions between the last strength session and today. */
  vbCount: number;
}

export interface Suggestion {
  type: StrengthDay | "rest";
  reason: string;
  doneToday: SessionType[];
  nextStrength: StrengthDay;
  legWarning: boolean;
  basis: SuggestionBasis | null;
}

/** Friday or Saturday: volleyball usually happens on the weekend. */
export function isLegWarningDay(d: string): boolean {
  const wd = weekday(d);
  return wd === 5 || wd === 6;
}

const isStrength = (t: SessionType): t is StrengthDay =>
  (DAY_TYPES as readonly string[]).includes(t);

export function suggestToday(
  sessions: SuggestionSession[],
  today: string,
  rotation: RotationItem[]
): Suggestion {
  const rot = rotation.some(r => r !== "rest") ? rotation : (["leg", "back", "chest", "rest"] as RotationItem[]);
  const firstStrength = rot.find((r): r is StrengthDay => r !== "rest")!;
  const past = sessions.filter(s => s.date <= today);
  const doneToday = past.filter(s => s.date === today).map(s => s.type);
  const lastStrength = past
    .filter(s => isStrength(s.type))
    .sort((a, b) => a.date.localeCompare(b.date))
    .pop();

  let nextStrength: StrengthDay = firstStrength;
  let requiredRest = 0;
  if (lastStrength) {
    const idx = rot.indexOf(lastStrength.type as RotationItem);
    let i = idx < 0 ? -1 : idx;
    for (let step = 0; step < rot.length; step++) {
      i = (i + 1) % rot.length;
      if (rot[i] === "rest") requiredRest += 1;
      else {
        nextStrength = rot[i] as StrengthDay;
        break;
      }
    }
  }

  let basis: SuggestionBasis | null = null;
  let restTaken = 0;
  let vbCount = 0;
  let need = requiredRest;
  if (lastStrength) {
    const between = past.filter(s => s.date > lastStrength.date && s.date < today);
    vbCount = new Set(between.filter(s => s.type === "volleyball").map(s => s.date)).size;
    const busyDays = new Set(between.filter(s => s.type === "volleyball" || isStrength(s.type)).map(s => s.date));
    const gap = Math.max(0, daysBetween(lastStrength.date, today) - 1);
    restTaken = Math.max(0, gap - busyDays.size);
    need = requiredRest + vbCount;
    basis = {
      lastDate: lastStrength.date,
      lastType: lastStrength.type as StrengthDay,
      restTaken,
      restNeeded: need,
      vbCount,
    };
  }

  const build = (type: StrengthDay | "rest", reason: string): Suggestion => ({
    type,
    reason,
    doneToday,
    nextStrength,
    legWarning: type === "leg" && isLegWarningDay(today),
    basis,
  });

  const doneStrength = doneToday.find(isStrength);
  if (doneStrength) return build("rest", "今天已經練過了，好好吃、好好睡");
  if (doneToday.includes("volleyball")) return build("rest", "今天打過球了，好好恢復");
  if (!lastStrength) return build(nextStrength, "從循環的第一天開始");

  if (restTaken < need) {
    const reason = vbCount > 0 && restTaken >= requiredRest ? "打完球多休一天" : "循環的休息日";
    return build("rest", reason);
  }
  return build(nextStrength, "照循環輪到這一天");
}

// ───────────────────────── timeline & projected plan ─────────────────────────

export interface PlanDay {
  date: string;
  type: StrengthDay | "rest";
  /** Weekend days: volleyball usually happens then, which would add a rest day. */
  maybeVolleyball: boolean;
}

/**
 * Simulate the next `days` days (starting today) assuming each suggestion is
 * followed. Volleyball is not predicted; weekend days are only flagged.
 */
export function projectPlan(
  sessions: SuggestionSession[],
  today: string,
  rotation: RotationItem[],
  days: number
): PlanDay[] {
  const sim: SuggestionSession[] = sessions.filter(s => s.date <= today).map(s => ({ date: s.date, type: s.type }));
  const out: PlanDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    const sug = suggestToday(sim, d, rotation);
    const wd = weekday(d);
    out.push({ date: d, type: sug.type, maybeVolleyball: wd === 0 || wd === 6 });
    if (sug.type !== "rest") sim.push({ date: d, type: sug.type });
  }
  return out;
}

export interface TimelineDay {
  date: string;
  /** Session types done that day, in recording order, without duplicates. */
  types: SessionType[];
}

/** What was done on each of the `days` days ending today (oldest first). */
export function timeline(sessions: SuggestionSession[], today: string, days: number): TimelineDay[] {
  const out: TimelineDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const types: SessionType[] = [];
    for (const s of sessions) if (s.date === d && !types.includes(s.type)) types.push(s.type);
    out.push({ date: d, types });
  }
  return out;
}

// ───────────────────────── weight trend ─────────────────────────

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export function weightTrend(points: WeightPoint[], windowDays = 7): (WeightPoint & { avg7: number })[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map(p => {
    const from = addDays(p.date, -(windowDays - 1));
    const win = sorted.filter(q => q.date >= from && q.date <= p.date);
    const avg = win.reduce((a, q) => a + q.weightKg, 0) / win.length;
    return { ...p, avg7: round1(avg) };
  });
}

/** Latest bodyweight on or before the given date. */
export function bodyweightOn(points: WeightPoint[], d: string, fallback: number): number {
  let best: WeightPoint | null = null;
  for (const p of points) if (p.date <= d && (!best || p.date > best.date)) best = p;
  return best?.weightKg ?? fallback;
}
