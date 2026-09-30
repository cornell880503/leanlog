import { describe, expect, it } from "vitest";
import { summarizeSession, type Lookup, type SessionInput, type SetInput } from "../shared/analytics";
import { EXERCISE_MAP } from "../shared/exercises";
import {
  compareLastComplete,
  growth,
  pctChange,
  periodEnd,
  periodStart,
  periodStarts,
  shiftPeriod,
  trendSeries,
  type TrendPeriod,
} from "../shared/trends";

const lookup: Lookup = k => EXERCISE_MAP[k];
const TODAY = "2026-09-30"; // Wednesday; week starts Mon 2026-09-28

const set = (exerciseKey: string, weightKg: number, reps: number, rpe: number | null, extra: Partial<SetInput> = {}): SetInput => ({
  exerciseKey,
  weightKg,
  reps,
  rpe,
  isWarmup: false,
  bodyweightKg: null,
  ...extra,
});

let nextId = 1;
const session = (date: string, type: SessionInput["type"], sets: SetInput[], extra: Partial<SessionInput> = {}): SessionInput => ({
  id: nextId++,
  date,
  type,
  durationMin: 60,
  srpe: 7,
  jumps: 0,
  sets,
  ...extra,
});

const legDay = session("2026-09-15", "leg", [
  set("back_squat", 60, 5, null, { isWarmup: true }),
  set("back_squat", 100, 5, 8),
  set("back_squat", 100, 5, 9),
  set("kb_swing", 24, 10, 8), // power: counts for RPE, not for hard sets / load per rep
]);
const chestDay = session("2026-09-22", "chest", [set("bench_press", 60, 8, 8), set("bench_press", 65, 5, 9)], {
  durationMin: 50,
  srpe: 8,
});
const volleyball = session("2026-09-26", "volleyball", [], { durationMin: 90, srpe: 6, jumps: 120 });
const backDay = session("2026-09-29", "back", [set("pull_up", 0, 8, 8, { bodyweightKg: 70 }), set("plank", 0, 60, 7), set("box_jump", 0, 5, 9)], {
  durationMin: 45,
});
const future = session("2026-10-02", "chest", [set("bench_press", 100, 5, 8)]);
const old = session("2026-08-10", "leg", [set("back_squat", 90, 5, 8)]);
const ALL = [old, legDay, chestDay, volleyball, backDay, future];

const series = (period: TrendPeriod, count: number, targetKeys = ["bench_press", "back_squat"]) =>
  trendSeries({ sessions: ALL, lookup, weights: [], fallbackBw: 70, rpeMin: 7, targetKeys, today: TODAY, period, count });

describe("periods", () => {
  it("weeks start on Monday", () => {
    expect(periodStart("2026-09-30", "week")).toBe("2026-09-28");
    expect(periodStart("2026-09-28", "week")).toBe("2026-09-28");
    expect(periodStart("2026-09-27", "week")).toBe("2026-09-21"); // Sunday belongs to the previous week
    expect(periodEnd("2026-09-28", "week")).toBe("2026-10-04");
  });

  it("months use calendar boundaries, including leap years and year rollover", () => {
    expect(periodStart("2026-09-30", "month")).toBe("2026-09-01");
    expect(shiftPeriod("2026-01-01", "month", -1)).toBe("2025-12-01");
    expect(shiftPeriod("2025-11-01", "month", 3)).toBe("2026-02-01");
    expect(shiftPeriod("2026-09-01", "month", -24)).toBe("2024-09-01");
    expect(periodEnd("2026-02-01", "month")).toBe("2026-02-28");
    expect(periodEnd("2024-02-01", "month")).toBe("2024-02-29");
    expect(periodEnd("2026-12-01", "month")).toBe("2026-12-31");
  });

  it("lists period starts oldest first, ending with the current period", () => {
    expect(periodStarts("2026-01-10", "week", 3)).toEqual(["2025-12-22", "2025-12-29", "2026-01-05"]);
    expect(periodStarts("2026-01-15", "month", 3)).toEqual(["2025-11-01", "2025-12-01", "2026-01-01"]);
  });
});

describe("trendSeries (weekly)", () => {
  const s = series("week", 4);
  const [w0, w1, w2, w3] = s.buckets;

  it("builds one bucket per week and marks only the current one in progress", () => {
    expect(s.buckets.map(b => b.start)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
    expect(s.buckets.map(b => b.end)).toEqual(["2026-09-13", "2026-09-20", "2026-09-27", "2026-10-04"]);
    expect(s.buckets.map(b => b.inProgress)).toEqual([false, false, false, true]);
    expect(w0.sessions).toBe(0);
    expect(w0.avgRpe).toBeNull();
    expect(w0.avgLoadPerRep).toBeNull();
  });

  it("uses the same volume and hard-set numbers as the session summary", () => {
    const sum = summarizeSession(legDay, lookup, 70, 7);
    expect(w1.volume).toBe(Math.round(sum.volume * 10) / 10);
    expect(w1.hardSets).toBe(2); // warm-up is not a hard set
    expect(w1.load).toBe(420); // 60 min × sRPE 7
  });

  it("splits totals by session type and counts volleyball load and jumps", () => {
    expect(w2.sessions).toBe(2);
    expect(w2.strengthSessions).toBe(1);
    expect(w2.volleyballSessions).toBe(1);
    expect(w2.durationMin).toBe(140);
    expect(w2.load).toBe(940); // 50×8 + 90×6
    expect(w2.byType.chest.load).toBe(400);
    expect(w2.byType.volleyball.load).toBe(540);
    expect(w2.byType.volleyball.volume).toBe(0);
    expect(w2.byType.chest.volume).toBe(805); // 60×8 + 65×5
    expect(w2.byType.leg.sessions).toBe(0);
    expect(w2.jumps).toBe(120);
  });

  it("averages RPE over working sets only and load per rep over loaded rep-based sets", () => {
    expect(w1.avgRpe).toBe(8.3); // (8 + 9 + 8) / 3; warm-up (no RPE) excluded, power set included
    expect(w1.avgLoadPerRep).toBe(100); // (100×5 + 100×5) / 10, warm-up excluded
    expect(w3.avgRpe).toBe(8); // pull-up 8 + plank 7 + box jump 9: every working set with RPE counts
    expect(w3.avgLoadPerRep).toBe(70); // bodyweight pull-up; timed plank and plyo box jump excluded
    expect(w3.e1rm.box_jump).toBeUndefined();
  });

  it("keeps the best e1RM per lift per period", () => {
    expect(w1.e1rm.back_squat).toBe(116.7); // 100 × (1 + 5/30)
    expect(w2.e1rm.bench_press).toBe(76); // 60×8 beats 65×5 (75.8)
    expect(w3.e1rm.pull_up).toBe(88.7); // bodyweight 70 × (1 + 8/30)
    expect(w3.e1rm.plank).toBeUndefined();
  });

  it("ignores sessions after today, even inside the current week", () => {
    expect(w3.sessions).toBe(1);
    expect(w3.e1rm.bench_press).toBeUndefined();
  });

  it("lists strength targets first in settings order, then other lifts", () => {
    expect(s.lifts.map(l => [l.key, l.isTarget, l.periods])).toEqual([
      ["bench_press", true, 1],
      ["back_squat", true, 1],
      ["pull_up", false, 1],
    ]);
  });

  it("reports the first session across all history", () => {
    expect(s.firstSessionDate).toBe("2026-08-10");
    const none = trendSeries({ sessions: [future], lookup, weights: [], fallbackBw: 70, rpeMin: 7, targetKeys: [], today: TODAY, period: "week", count: 2 });
    expect(none.firstSessionDate).toBeNull();
    expect(none.buckets.every(b => b.sessions === 0)).toBe(true);
  });
});

describe("trendSeries (monthly)", () => {
  it("groups by calendar month", () => {
    const s = series("month", 2);
    expect(s.buckets.map(b => [b.start, b.end, b.inProgress, b.sessions])).toEqual([
      ["2026-08-01", "2026-08-31", false, 1],
      ["2026-09-01", "2026-09-30", true, 4],
    ]);
    expect(s.buckets[0].e1rm.back_squat).toBe(105); // 90 × (1 + 5/30)
    expect(s.buckets[1].e1rm.back_squat).toBe(116.7);
    expect(s.lifts.find(l => l.key === "back_squat")?.periods).toBe(2);
  });
});

describe("comparisons", () => {
  it("pctChange needs a non-zero base", () => {
    expect(pctChange(110, 100)).toBe(10);
    expect(pctChange(90, 100)).toBe(-10);
    expect(pctChange(5, 0)).toBeNull();
  });

  it("growth compares the first and last periods that have data", () => {
    const g = growth([
      { start: "a", value: null },
      { start: "b", value: 100 },
      { start: "c", value: undefined },
      { start: "d", value: 110 },
    ]);
    expect(g).toEqual({ first: 100, last: 110, firstStart: "b", lastStart: "d", delta: 10, pct: 10 });
    expect(growth([{ start: "a", value: 100 }, { start: "b", value: null }])).toBeNull();
  });

  it("compareLastComplete skips the in-progress period", () => {
    const s = series("week", 4);
    const c = compareLastComplete(s.buckets, b => b.load)!;
    expect(c.current.start).toBe("2026-09-21");
    expect(c.previous.start).toBe("2026-09-14");
    expect(c.value).toBe(940);
    expect(c.previousValue).toBe(420);
    expect(c.pct).toBe(123.8);
    // Only one complete week → nothing to compare.
    expect(compareLastComplete(series("week", 2).buckets, b => b.load)).toBeNull();
  });
});
