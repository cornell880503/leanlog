import { TARGET_MUSCLES, type StrengthDay } from "./exercises";

export type RotationItem = StrengthDay | "rest";

export interface Milestone {
  name: string;
  by: string;
  ffmMinKg: number;
  bfMax: number;
}

/** Target estimated 1RM for one lift, as a multiple of current bodyweight. */
export interface StrengthTarget {
  exerciseKey: string;
  /** e1RM ÷ bodyweight. For bodyweight lifts (pull-ups) the load includes bodyweight. */
  ratio: number;
}

export const MAX_STRENGTH_TARGETS = 8;

export const DEFAULT_STRENGTH_TARGETS: StrengthTarget[] = [
  { exerciseKey: "back_squat", ratio: 1.5 },
  { exerciseKey: "trap_bar_deadlift", ratio: 1.75 },
  { exerciseKey: "bench_press", ratio: 1.0 },
  { exerciseKey: "ohp", ratio: 0.65 },
  { exerciseKey: "pull_up", ratio: 1.4 },
];

export interface Settings {
  heightCm: number;
  bfMin: number;
  bfMax: number;
  ffmiMin: number;
  ffmiMax: number;
  targetApproachReachCm: number;
  weeklySetTargets: Record<string, [number, number]>;
  rotation: RotationItem[];
  dumbbellStep: number;
  hardSetRpeMin: number;
  loadSpikeRatio: number;
  milestones: Milestone[];
  strengthTargets: StrengthTarget[];
}

export const DEFAULT_WEEKLY_TARGETS: Record<string, [number, number]> = {
  胸: [10, 16],
  背: [12, 18],
  肩: [10, 16],
  二頭: [8, 14],
  三頭: [8, 14],
  核心: [6, 10],
  股四頭: [6, 10],
  腿後: [6, 10],
  臀: [6, 10],
  小腿: [0, 8],
};

export const DEFAULT_SETTINGS: Settings = {
  heightCm: 179,
  bfMin: 10,
  bfMax: 12,
  ffmiMin: 19.5,
  ffmiMax: 21,
  targetApproachReachCm: 320,
  weeklySetTargets: DEFAULT_WEEKLY_TARGETS,
  rotation: ["leg", "back", "chest", "rest"],
  dumbbellStep: 2,
  hardSetRpeMin: 7,
  loadSpikeRatio: 1.3,
  milestones: [
    { name: "M1", by: "2026-12-31", ffmMinKg: 60.5, bfMax: 13.5 },
    { name: "M2", by: "2027-03-31", ffmMinKg: 61.5, bfMax: 12.5 },
    { name: "最終", by: "2027-07-31", ffmMinKg: 62.5, bfMax: 12.0 },
  ],
  strengthTargets: DEFAULT_STRENGTH_TARGETS,
};

export const DEFAULT_STANDING_REACH_CM = 238;
export const BASELINE_APPROACH_REACH_CM = 305;

const ROTATION_VALUES: RotationItem[] = ["leg", "back", "chest", "rest"];

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Stored strength targets: valid keys, ratio 0.2–3 (0.05 steps), no duplicates, at most 8. */
export function normalizeStrengthTargets(raw: unknown): StrengthTarget[] {
  if (!Array.isArray(raw)) return DEFAULT_STRENGTH_TARGETS;
  const out: StrengthTarget[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const key = (t as StrengthTarget).exerciseKey;
    if (typeof key !== "string" || !key || key.length > 64) continue;
    if (out.some(o => o.exerciseKey === key)) continue;
    const ratio = Math.round(num((t as StrengthTarget).ratio, 1, 0.2, 3) * 20) / 20;
    out.push({ exerciseKey: key, ratio });
    if (out.length >= MAX_STRENGTH_TARGETS) break;
  }
  return out;
}

/** Merge stored (possibly partial or outdated) settings over defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const d = DEFAULT_SETTINGS;
  const weekly: Record<string, [number, number]> = { ...d.weeklySetTargets };
  if (r.weeklySetTargets && typeof r.weeklySetTargets === "object") {
    for (const m of TARGET_MUSCLES) {
      const v = (r.weeklySetTargets as Record<string, unknown>)[m];
      if (Array.isArray(v) && v.length === 2) {
        const lo = num(v[0], weekly[m][0], 0, 40);
        const hi = num(v[1], weekly[m][1], 0, 40);
        weekly[m] = [Math.min(lo, hi), Math.max(lo, hi)];
      }
    }
  }
  let rotation = d.rotation;
  if (Array.isArray(r.rotation)) {
    const rot = r.rotation.filter((x): x is RotationItem =>
      ROTATION_VALUES.includes(x as RotationItem)
    );
    if (rot.some(x => x !== "rest")) rotation = rot;
  }
  let milestones = d.milestones;
  if (Array.isArray(r.milestones) && r.milestones.length) {
    const ms = r.milestones
      .filter((m): m is Milestone =>
        !!m && typeof m === "object" && typeof (m as Milestone).by === "string"
      )
      .map(m => ({
        name: String(m.name),
        by: m.by,
        ffmMinKg: num(m.ffmMinKg, 60, 30, 120),
        bfMax: num(m.bfMax, 13, 3, 40),
      }));
    if (ms.length) milestones = ms;
  }
  const bfMin = num(r.bfMin, d.bfMin, 3, 30);
  const bfMax = num(r.bfMax, d.bfMax, 3, 30);
  const ffmiMin = num(r.ffmiMin, d.ffmiMin, 14, 28);
  const ffmiMax = num(r.ffmiMax, d.ffmiMax, 14, 28);
  return {
    heightCm: num(r.heightCm, d.heightCm, 120, 230),
    bfMin: Math.min(bfMin, bfMax),
    bfMax: Math.max(bfMin, bfMax),
    ffmiMin: Math.min(ffmiMin, ffmiMax),
    ffmiMax: Math.max(ffmiMin, ffmiMax),
    targetApproachReachCm: num(r.targetApproachReachCm, d.targetApproachReachCm, 200, 400),
    weeklySetTargets: weekly,
    rotation,
    dumbbellStep: [1, 2, 2.5].includes(Number(r.dumbbellStep)) ? Number(r.dumbbellStep) : d.dumbbellStep,
    hardSetRpeMin: num(r.hardSetRpeMin, d.hardSetRpeMin, 5, 10),
    loadSpikeRatio: num(r.loadSpikeRatio, d.loadSpikeRatio, 1.05, 3),
    milestones,
    strengthTargets: normalizeStrengthTargets(r.strengthTargets),
  };
}
