import { describe, expect, it } from "vitest";
import {
  addDays,
  bodyProgress,
  e1rm,
  jumpProgress,
  setVolume,
  suggestToday,
  summarizeSession,
  weekStart,
  weeklyStats,
  type Lookup,
  type SessionInput,
} from "../shared/analytics";
import { EXERCISES, EXERCISE_MAP } from "../shared/exercises";
import { DEFAULT_SETTINGS, normalizeSettings } from "../shared/settings";

const lookup: Lookup = k => EXERCISE_MAP[k];
const find = (key: string) => {
  const ex = EXERCISE_MAP[key];
  if (!ex) throw new Error(`missing exercise ${key}`);
  return ex;
};

describe("exercise library", () => {
  it("has unique keys and names, and every strength-day exercise has muscles or is plyo/power", () => {
    const keys = new Set(EXERCISES.map(e => e.key));
    const names = new Set(EXERCISES.map(e => e.name));
    expect(keys.size).toBe(EXERCISES.length);
    expect(names.size).toBe(EXERCISES.length);
    expect(EXERCISES.length).toBeGreaterThan(120);
    for (const e of EXERCISES) {
      if (e.category === "compound" || e.category === "isolation") expect(e.primary.length).toBeGreaterThan(0);
      expect(e.days.length).toBeGreaterThan(0);
    }
  });
});

describe("load math", () => {
  it("uses Epley e1RM and ignores sets above 12 reps", () => {
    expect(e1rm(100, 1)).toBeCloseTo(103.33, 1);
    expect(e1rm(100, 5)).toBeCloseTo(116.67, 1);
    expect(e1rm(100, 13)).toBeNull();
  });

  it("counts bodyweight share for pull-ups and subtracts assistance", () => {
    const pullup = find("pull_up");
    const vol = setVolume(pullup, { exerciseKey: pullup.key, weightKg: 0, reps: 10, rpe: 8, isWarmup: false, bodyweightKg: 70 }, 70);
    expect(vol).toBeGreaterThan(0);
    const assisted = EXERCISES.find(e => e.assisted);
    if (assisted) {
      const a = setVolume(assisted, { exerciseKey: assisted.key, weightKg: 20, reps: 10, rpe: 8, isWarmup: false, bodyweightKg: 70 }, 70);
      expect(a).toBeLessThan(vol);
    }
  });
});

describe("session summary", () => {
  it("counts hard sets per muscle (primary 1, secondary 0.5), skips warmups and low RPE", () => {
    const bench = find("bench_press");
    const s: SessionInput = {
      id: 1,
      date: "2026-09-28",
      type: "chest",
      durationMin: 60,
      srpe: 7,
      jumps: 0,
      sets: [
        { exerciseKey: bench.key, weightKg: 40, reps: 10, rpe: 5, isWarmup: true, bodyweightKg: null },
        { exerciseKey: bench.key, weightKg: 60, reps: 8, rpe: 8, isWarmup: false, bodyweightKg: null },
        { exerciseKey: bench.key, weightKg: 60, reps: 8, rpe: 9, isWarmup: false, bodyweightKg: null },
        { exerciseKey: bench.key, weightKg: 60, reps: 8, rpe: 6, isWarmup: false, bodyweightKg: null },
      ],
    };
    const sum = summarizeSession(s, lookup, 70, 7);
    expect(sum.hardSets).toBe(2);
    expect(sum.muscleSets["胸"]).toBe(2);
    for (const m of bench.secondary) expect(sum.muscleSets[m]).toBe(1);
    expect(sum.load).toBe(420);
    expect(sum.exercises[0].bestE1rm).toBeCloseTo(76, 0);
  });

  it("treats unrated work sets as hard sets", () => {
    const row = find("barbell_row");
    const s: SessionInput = {
      id: 2,
      date: "2026-09-28",
      type: "back",
      durationMin: null,
      srpe: null,
      jumps: 0,
      sets: [{ exerciseKey: row.key, weightKg: 50, reps: 10, rpe: null, isWarmup: false, bodyweightKg: null }],
    };
    expect(summarizeSession(s, lookup, 70, 7).hardSets).toBe(1);
  });
});

describe("today suggestion (leg → back → chest → rest, +1 rest after volleyball)", () => {
  const rot = DEFAULT_SETTINGS.rotation;
  it("starts with leg day when nothing is logged", () => {
    expect(suggestToday([], "2026-09-28", rot).type).toBe("leg");
  });
  it("follows the rotation", () => {
    expect(suggestToday([{ date: "2026-09-28", type: "leg" }], "2026-09-29", rot).type).toBe("back");
    expect(suggestToday([{ date: "2026-09-29", type: "back" }], "2026-09-30", rot).type).toBe("chest");
  });
  it("rests one day after chest day, then legs", () => {
    const s = [{ date: "2026-09-30", type: "chest" as const }];
    expect(suggestToday(s, "2026-10-01", rot).type).toBe("rest");
    expect(suggestToday(s, "2026-10-02", rot).type).toBe("leg");
  });
  it("adds one extra rest day after volleyball", () => {
    const s = [
      { date: "2026-09-28", type: "leg" as const },
      { date: "2026-09-29", type: "volleyball" as const },
    ];
    const next = suggestToday(s, "2026-09-30", rot);
    expect(next.type).toBe("rest");
    expect(next.reason).toContain("打完球");
    expect(suggestToday(s, "2026-10-01", rot).type).toBe("back");
  });
  it("suggests rest when already trained today", () => {
    expect(suggestToday([{ date: "2026-09-28", type: "leg" }], "2026-09-28", rot).type).toBe("rest");
  });
  it("flags leg day on Friday/Saturday", () => {
    // 2026-10-02 is a Friday
    const s = [{ date: "2026-09-30", type: "chest" as const }];
    const r = suggestToday(s, "2026-10-02", rot);
    expect(r.type).toBe("leg");
    expect(r.legWarning).toBe(true);
  });
});

describe("weekly stats", () => {
  it("uses Monday weeks and marks the current week in progress", () => {
    expect(weekStart("2026-09-30")).toBe("2026-09-28");
    const squat = find("back_squat");
    const sessions: SessionInput[] = [0, 7, 14, 21].map((d, i) => ({
      id: i + 1,
      date: addDays("2026-09-07", d),
      type: "leg",
      durationMin: 60,
      srpe: 7,
      jumps: 0,
      sets: [{ exerciseKey: squat.key, weightKg: 80, reps: 5, rpe: 8, isWarmup: false, bodyweightKg: null }],
    }));
    sessions.push({ id: 99, date: "2026-09-29", type: "volleyball", durationMin: 120, srpe: 7, jumps: 160, sets: [] });
    const weeks = weeklyStats(sessions, lookup, 70, DEFAULT_SETTINGS, "2026-09-30", 4);
    const cur = weeks[weeks.length - 1];
    expect(cur.inProgress).toBe(true);
    expect(cur.volleyballSessions).toBe(1);
    expect(cur.jumps).toBe(160);
    // No jumps in the previous three weeks: not enough history to judge.
    expect(cur.jumpSpike).toBeNull();
    expect(weeks[weeks.length - 2].inProgress).toBe(false);

    // With some jump history, doubling it is flagged.
    const withHistory: SessionInput[] = [
      ...sessions,
      ...[1, 8, 15].map((d, i) => ({
        id: 200 + i,
        date: addDays("2026-09-07", d),
        type: "volleyball" as const,
        durationMin: 90,
        srpe: 6,
        jumps: 60,
        sets: [],
      })),
    ];
    const w2 = weeklyStats(withHistory, lookup, 70, DEFAULT_SETTINGS, "2026-09-30", 4);
    expect(w2[w2.length - 1].jumpSpike).toBe(true);
  });
});

describe("body composition progress", () => {
  it("computes the baseline gap to the lean-muscle target", () => {
    const p = bodyProgress(
      [{ date: "2026-08-02", weightKg: 68.6, fatMassKg: 9.5, ffmKg: 59.1 }],
      DEFAULT_SETTINGS,
      "2026-09-29"
    );
    expect(p.latest?.bfPct).toBeCloseTo(13.85, 1);
    expect(p.latest?.ffmi).toBeCloseTo(18.45, 1);
    expect(p.achieved).toBe(false);
    expect(p.ffmGapKg).toBeGreaterThan(3);
    expect(p.fatToLoseAtGoalKg).toBeGreaterThan(0);
    expect(p.milestones).toHaveLength(3);
  });
});

describe("jump progress", () => {
  it("measures remaining reach to the 320 cm goal", () => {
    const j = jumpProgress([{ date: "2026-09-29", approachReachCm: 305, standingReachCm: 238 }], 238, 320);
    expect(j.remainingCm).toBe(15);
    expect(j.latestJumpCm).toBe(67);
    expect(j.targetJumpCm).toBe(82);
  });
});

describe("settings normalization", () => {
  it("falls back to defaults for bad values and keeps valid overrides", () => {
    const s = normalizeSettings({ bfMin: 14, bfMax: 9, rotation: ["rest"], dumbbellStep: 3, weeklySetTargets: { 胸: [20, 12] } });
    expect(s.bfMin).toBe(9);
    expect(s.bfMax).toBe(14);
    expect(s.rotation).toEqual(DEFAULT_SETTINGS.rotation);
    expect(s.dumbbellStep).toBe(DEFAULT_SETTINGS.dumbbellStep);
    expect(s.weeklySetTargets["胸"]).toEqual([12, 20]);
  });
});
