import {
  bodyProgress,
  bodyweightOn,
  jumpProgress,
  projectPlan,
  round1,
  setE1rm,
  suggestToday,
  timeline,
  weeklyStats,
  weightTrend,
  addDays,
  type Lookup,
} from "../../shared/analytics";
import { DAY_TYPES, type SessionType } from "../../shared/exercises";
import { strengthGoals } from "../../shared/strength";
import type { Db } from "./common";
import { listJumps, listScans } from "./body";
import { ensureSettings } from "./settings";
import { FALLBACK_BW, loadAllSessions, loadWeightPoints, toSessionInput } from "./sessions";

export async function dashboardSummary(db: Db, userId: number, lookup: Lookup, today: string) {
  const view = await ensureSettings(db, userId);
  const s = view.settings;
  const all = await loadAllSessions(db, userId);
  const weights = await loadWeightPoints(db, userId);
  const scans = await listScans(db, userId);
  const jumps = await listJumps(db, userId);
  const bw = bodyweightOn(weights, today, FALLBACK_BW);

  const inputs = all.map(toSessionInput);
  const weeks = weeklyStats(inputs, lookup, bw, s, today, 8);
  const brief = all.map(x => ({ date: x.date, type: x.type as SessionType }));
  const suggestion = suggestToday(brief, today, s.rotation);
  // Today + next 6 days, assuming each suggestion is followed.
  const upcoming = projectPlan(brief, today, s.rotation, 7);
  const recent = timeline(brief, today, 14);
  const goals = strengthGoals({
    targets: s.strengthTargets,
    milestones: s.milestones,
    dumbbellStep: s.dumbbellStep,
    sessions: inputs,
    weights,
    lookup,
    today,
    fallbackBw: FALLBACK_BW,
  });

  const counts = new Map<string, number>();
  for (const x of all) {
    const seen = new Set<string>();
    for (const set of x.sets) {
      const ex = lookup(set.exerciseKey);
      if (!ex || seen.has(ex.key)) continue;
      if (ex.category !== "compound" && ex.category !== "isolation") continue;
      if (ex.unit === "sec") continue;
      seen.add(ex.key);
      counts.set(ex.key, (counts.get(ex.key) ?? 0) + 1);
    }
  }
  const strengthOptions = Array.from(counts.entries())
    .map(([key, n]) => ({ key, name: lookup(key)?.name ?? key, sessions: n }))
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));

  const from = addDays(today, -120);
  const trend = weightTrend(weights).filter(p => p.date >= from);
  const lastStrength = [...all].reverse().find(x => (DAY_TYPES as readonly string[]).includes(x.type));
  const lastAny = [...all].reverse().find(x => x.date <= today) ?? null;

  return {
    today,
    suggestion,
    upcoming,
    timeline: recent,
    lastSession: lastAny ? { date: lastAny.date, type: lastAny.type as SessionType } : null,
    lastStrengthDate: lastStrength?.date ?? null,
    weeks,
    weeklyTargets: s.weeklySetTargets,
    body: bodyProgress(
      scans.map(x => ({ date: x.date, weightKg: x.weightKg, fatMassKg: x.fatMassKg, ffmKg: x.ffmKg })),
      s,
      today
    ),
    targets: {
      bfMin: s.bfMin,
      bfMax: s.bfMax,
      ffmiMin: s.ffmiMin,
      ffmiMax: s.ffmiMax,
      heightCm: s.heightCm,
      targetApproachReachCm: s.targetApproachReachCm,
    },
    latestScan: scans[scans.length - 1] ?? null,
    jump: jumpProgress(
      jumps.map(j => ({ date: j.date, approachReachCm: j.approachReachCm, standingReachCm: j.standingReachCm })),
      view.standingReachCm,
      s.targetApproachReachCm
    ),
    standingReachEstimated: view.standingReachEstimated,
    weight: {
      latest: weights.length ? [...weights].sort((a, b) => a.date.localeCompare(b.date)).pop()! : null,
      trend,
    },
    strengthOptions,
    strengthGoals: goals,
    sessionCount: all.length,
  };
}

export async function strengthTrend(db: Db, userId: number, lookup: Lookup, exerciseKey: string) {
  const ex = lookup(exerciseKey);
  if (!ex) return [];
  const all = await loadAllSessions(db, userId);
  const weights = await loadWeightPoints(db, userId);
  const out: { date: string; e1rm: number; weightKg: number; reps: number }[] = [];
  for (const s of all) {
    const bw = bodyweightOn(weights, s.date, FALLBACK_BW);
    let best: { e1rm: number; weightKg: number; reps: number } | null = null;
    for (const set of s.sets) {
      if (set.exerciseKey !== exerciseKey) continue;
      const v = setE1rm(ex, set, bw);
      if (v != null && (!best || v > best.e1rm)) best = { e1rm: v, weightKg: set.weightKg, reps: set.reps };
    }
    if (best) out.push({ date: s.date, e1rm: round1(best.e1rm), weightKg: best.weightKg, reps: best.reps });
  }
  return out;
}
