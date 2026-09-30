/**
 * Strength targets: turn "look lean and jump higher" into concrete numbers per
 * lift (e.g. bench press e1RM 70 kg), with dated steps and the next set to try.
 * Pure functions shared by the server (dashboard, workout context) and tests.
 */
import {
  addDays,
  bodyweightOn,
  daysBetween,
  round1,
  setE1rm,
  type Lookup,
  type SessionInput,
  type WeightPoint,
} from "./analytics";
import type { ExerciseDef } from "./exercises";
import type { Milestone, StrengthTarget } from "./settings";

/** "Current" strength = best e1RM within this many days. */
export const CURRENT_WINDOW_DAYS = 56;
const BARBELL_STEP = 2.5;
const DEFAULT_REPS = 5;

export type StepStatus = "met" | "missed" | "pending";

export interface StrengthStep {
  name: string;
  by: string;
  kg: number;
  status: StepStatus;
  /** First date the step was reached. */
  metOn: string | null;
  /** A concrete set that reaches this e1RM. */
  set: SetPrescription;
}

export interface SetPrescription {
  /** Main label, e.g. "62.5 kg × 5", "徒手 10 下", "+10 kg × 5". */
  label: string;
  /** Alternative for bodyweight lifts ("+5 kg × 5" next to "徒手 12 下"). */
  alt: string | null;
}

export interface StrengthPoint {
  date: string;
  e1rm: number;
}

export interface StrengthGoal {
  exerciseKey: string;
  name: string;
  ratio: number;
  bodyweightKg: number;
  /** Bodyweight lift: the e1RM includes bodyweight × bwFactor. */
  bodyweightLift: boolean;
  targetKg: number;
  targetSet: SetPrescription;
  /** Best e1RM in the last 8 weeks. */
  currentE1rm: number | null;
  currentDate: string | null;
  bestE1rm: number | null;
  bestDate: string | null;
  startE1rm: number | null;
  startDate: string | null;
  lastDate: string | null;
  /** Has older records but none in the last 8 weeks (probably swapped out this block). */
  stale: boolean;
  currentRatio: number | null;
  progress: number | null;
  achieved: boolean;
  steps: StrengthStep[];
  next: StrengthStep | null;
  /** e1RM gain per week needed to hit the target by the final milestone date. */
  perWeekKg: number | null;
  finalBy: string | null;
  history: StrengthPoint[];
}

function roundTo(v: number, step: number, mode: "nearest" | "up" = "nearest"): number {
  const f = mode === "up" ? Math.ceil(v / step - 1e-9) : Math.round(v / step);
  return Math.round(f * step * 100) / 100;
}

function fmtKg(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/** Weight step for loading this lift (dumbbells follow the user's dumbbell step). */
export function loadStep(ex: ExerciseDef, dumbbellStep: number): number {
  return ex.equipment === "dumbbell" || ex.equipment === "kettlebell" ? dumbbellStep : BARBELL_STEP;
}

/** A concrete set whose Epley e1RM reaches `targetE1rm`. */
export function prescribeSet(
  ex: ExerciseDef,
  targetE1rm: number,
  bodyweightKg: number,
  step: number,
  reps = DEFAULT_REPS
): SetPrescription {
  const perRep = 1 + reps / 30;
  if (ex.bwFactor > 0 && !ex.assisted) {
    const base = ex.bwFactor * bodyweightKg;
    const added = Math.max(0, roundTo(targetE1rm / perRep - base, step, "up"));
    const addedLabel = `+${fmtKg(added)} kg × ${reps}`;
    // Reps at bodyweight alone that reach the target (Epley is only used up to 12 reps).
    const repsNeeded = Math.max(1, Math.ceil(30 * (targetE1rm / base - 1) - 1e-9));
    if (repsNeeded <= 12) {
      return { label: `徒手 ${repsNeeded} 下`, alt: added > 0 ? addedLabel : null };
    }
    return { label: addedLabel, alt: null };
  }
  if (ex.bwFactor > 0 && ex.assisted) {
    const base = ex.bwFactor * bodyweightKg;
    const assist = Math.max(0, roundTo(base - targetE1rm / perRep, step, "nearest"));
    return { label: `輔助 ${fmtKg(assist)} kg × ${reps}`, alt: null };
  }
  const w = roundTo(targetE1rm / perRep, step, "up");
  return { label: `${fmtKg(w)} kg × ${reps}`, alt: null };
}

/** Best e1RM per session date for one exercise, oldest first. */
export function e1rmHistory(
  sessions: SessionInput[],
  ex: ExerciseDef,
  weights: WeightPoint[],
  fallbackBw: number
): StrengthPoint[] {
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    const bw = bodyweightOn(weights, s.date, fallbackBw);
    for (const set of s.sets) {
      if (set.exerciseKey !== ex.key) continue;
      const v = setE1rm(ex, set, bw);
      if (v == null) continue;
      const prev = byDate.get(s.date);
      if (prev == null || v > prev) byDate.set(s.date, v);
    }
  }
  return Array.from(byDate.entries())
    .map(([date, e1rm]) => ({ date, e1rm: round1(e1rm) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface StrengthGoalInput {
  targets: StrengthTarget[];
  milestones: Milestone[];
  dumbbellStep: number;
  sessions: SessionInput[];
  weights: WeightPoint[];
  lookup: Lookup;
  today: string;
  fallbackBw: number;
}

export function strengthGoal(
  t: StrengthTarget,
  ex: ExerciseDef,
  input: Omit<StrengthGoalInput, "targets" | "lookup">
): StrengthGoal {
  const { milestones, dumbbellStep, sessions, weights, today, fallbackBw } = input;
  const bw = bodyweightOn(weights, today, fallbackBw);
  const step = loadStep(ex, dumbbellStep);
  const targetKg = roundTo(t.ratio * bw, BARBELL_STEP);
  const history = e1rmHistory(
    sessions.filter(s => s.date <= today),
    ex,
    weights,
    fallbackBw
  );
  const windowStart = addDays(today, -(CURRENT_WINDOW_DAYS - 1));
  let current: StrengthPoint | null = null;
  let best: StrengthPoint | null = null;
  for (const p of history) {
    if (!best || p.e1rm > best.e1rm) best = p;
    if (p.date >= windowStart && (!current || p.e1rm > current.e1rm)) current = p;
  }
  const start = history[0] ?? null;
  const last = history[history.length - 1] ?? null;

  const sorted = [...milestones].sort((a, b) => a.by.localeCompare(b.by));
  const finalBy = sorted.length ? sorted[sorted.length - 1].by : null;

  // A step is met only if reached on or before its deadline; reaching it later
  // still leaves it "missed" (the deadline was not kept).
  const reachedBy = (kg: number, by: string): string | null =>
    history.find(p => p.date <= by && p.e1rm >= kg - 1e-9)?.date ?? null;
  const statusFor = (kg: number, by: string): { status: StepStatus; metOn: string | null } => {
    const metOn = reachedBy(kg, by);
    if (metOn) return { status: "met", metOn };
    return { status: today > by ? "missed" : "pending", metOn: null };
  };

  const steps: StrengthStep[] = [];
  if (start && finalBy) {
    const span = Math.max(1, daysBetween(start.date, finalBy));
    for (const m of sorted) {
      if (m.by <= start.date) continue;
      const isFinal = m.by === finalBy;
      const frac = Math.min(1, Math.max(0, daysBetween(start.date, m.by) / span));
      const raw = start.e1rm >= targetKg ? targetKg : start.e1rm + (targetKg - start.e1rm) * frac;
      const kg = isFinal ? targetKg : Math.min(targetKg, roundTo(raw, BARBELL_STEP));
      if (steps.length && steps[steps.length - 1].kg >= kg && !isFinal) continue;
      steps.push({
        name: m.name,
        by: m.by,
        kg,
        ...statusFor(kg, m.by),
        set: prescribeSet(ex, kg, bw, step),
      });
    }
  }

  const achieved = current != null && current.e1rm >= targetKg - 1e-9;
  // Next = the first step not met that the current e1RM hasn't already passed.
  const next = achieved
    ? null
    : (steps.find(s => s.status !== "met" && !(current && current.e1rm >= s.kg - 1e-9)) ?? null);
  const from = current?.e1rm ?? last?.e1rm ?? null;
  let perWeekKg: number | null = null;
  if (from != null && !achieved && finalBy && finalBy > today) {
    perWeekKg = round1((targetKg - from) / (daysBetween(today, finalBy) / 7));
  }

  return {
    exerciseKey: ex.key,
    name: ex.name,
    ratio: t.ratio,
    bodyweightKg: bw,
    bodyweightLift: ex.bwFactor > 0,
    targetKg,
    targetSet: prescribeSet(ex, targetKg, bw, step),
    currentE1rm: current?.e1rm ?? null,
    currentDate: current?.date ?? null,
    bestE1rm: best?.e1rm ?? null,
    bestDate: best?.date ?? null,
    startE1rm: start?.e1rm ?? null,
    startDate: start?.date ?? null,
    lastDate: last?.date ?? null,
    stale: history.length > 0 && current == null,
    currentRatio: current ? Math.round((current.e1rm / bw) * 100) / 100 : null,
    progress: current ? Math.min(1, current.e1rm / targetKg) : null,
    achieved,
    steps,
    next,
    perWeekKg,
    finalBy,
    history,
  };
}

/** Goals for every configured target whose exercise still exists. */
export function strengthGoals(input: StrengthGoalInput): StrengthGoal[] {
  const out: StrengthGoal[] = [];
  for (const t of input.targets) {
    const ex = input.lookup(t.exerciseKey);
    if (!ex) continue;
    out.push(strengthGoal(t, ex, input));
  }
  return out;
}

/** Compact per-exercise hint used on the workout screen. */
export interface GoalHint {
  targetKg: number;
  currentE1rm: number | null;
  achieved: boolean;
  nextName: string | null;
  nextKg: number | null;
  nextSet: string | null;
}

export function goalHints(goals: StrengthGoal[]): Record<string, GoalHint> {
  const out: Record<string, GoalHint> = {};
  for (const g of goals) {
    const n = g.next;
    out[g.exerciseKey] = {
      targetKg: g.targetKg,
      currentE1rm: g.currentE1rm,
      achieved: g.achieved,
      nextName: n?.name ?? null,
      nextKg: n?.kg ?? (g.achieved ? null : g.targetKg),
      nextSet: n ? n.set.label : g.achieved ? null : g.targetSet.label,
    };
  }
  return out;
}
