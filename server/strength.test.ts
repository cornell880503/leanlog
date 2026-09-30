import { describe, expect, it } from "vitest";
import { projectPlan, suggestToday, timeline, type Lookup, type SessionInput } from "../shared/analytics";
import { EXERCISE_MAP } from "../shared/exercises";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STRENGTH_TARGETS,
  MAX_STRENGTH_TARGETS,
  normalizeSettings,
  normalizeStrengthTargets,
} from "../shared/settings";
import { goalHints, prescribeSet, strengthGoal, strengthGoals } from "../shared/strength";

const lookup: Lookup = k => EXERCISE_MAP[k];
const ex = (k: string) => {
  const e = EXERCISE_MAP[k];
  if (!e) throw new Error(`missing ${k}`);
  return e;
};
const rotation = DEFAULT_SETTINGS.rotation; // 腿 → 背 → 胸 → 休
const TODAY = "2026-09-30"; // Wednesday

const cycle = [
  { date: "2026-09-26", type: "leg" as const },
  { date: "2026-09-27", type: "back" as const },
  { date: "2026-09-28", type: "chest" as const },
];

describe("suggestion basis", () => {
  it("explains last session, rest taken and rest needed", () => {
    const s = suggestToday(cycle, TODAY, rotation);
    expect(s.type).toBe("leg");
    expect(s.basis).toEqual({ lastDate: "2026-09-28", lastType: "chest", restTaken: 1, restNeeded: 1, vbCount: 0 });
  });

  it("adds a rest day for each volleyball session in between", () => {
    const s = suggestToday([...cycle, { date: "2026-09-29", type: "volleyball" }], TODAY, rotation);
    expect(s.type).toBe("rest");
    expect(s.basis).toMatchObject({ restTaken: 0, restNeeded: 2, vbCount: 1 });
  });

  it("has no basis before any strength session", () => {
    expect(suggestToday([], TODAY, rotation).basis).toBeNull();
  });
});

describe("projected plan and timeline", () => {
  it("simulates the rotation forward and flags weekends", () => {
    const plan = projectPlan(cycle, TODAY, rotation, 5);
    expect(plan.map(p => p.type)).toEqual(["leg", "back", "chest", "rest", "leg"]);
    expect(plan.map(p => p.maybeVolleyball)).toEqual([false, false, false, true, true]);
  });

  it("does not project over a day already trained", () => {
    const plan = projectPlan([...cycle, { date: TODAY, type: "leg" }], TODAY, rotation, 2);
    expect(plan[0].type).toBe("rest");
    expect(plan[1].type).toBe("back");
  });

  it("lists what was done on each day, oldest first", () => {
    const t = timeline([...cycle, { date: "2026-09-28", type: "volleyball" }], TODAY, 7);
    expect(t).toHaveLength(7);
    expect(t[0].date).toBe("2026-09-24");
    expect(t[6].date).toBe(TODAY);
    expect(t.find(d => d.date === "2026-09-28")!.types).toEqual(["chest", "volleyball"]);
    expect(t.find(d => d.date === "2026-09-29")!.types).toEqual([]);
  });
});

describe("set prescription", () => {
  it("rounds barbell sets up so the e1RM is reached", () => {
    expect(prescribeSet(ex("bench_press"), 70, 70, 2.5).label).toBe("60 kg × 5");
    expect(prescribeSet(ex("bench_press"), 65, 70, 2.5).label).toBe("57.5 kg × 5");
  });

  it("gives bodyweight reps for pull-ups when reachable, plus a weighted alternative", () => {
    const p = prescribeSet(ex("pull_up"), 98, 70, 2.5);
    expect(p.label).toBe("徒手 12 下");
    expect(p.alt).toBe("+15 kg × 5");
    // Beyond 12 reps: weighted only.
    expect(prescribeSet(ex("pull_up"), 110, 70, 2.5)).toEqual({ label: "+25 kg × 5", alt: null });
  });
});

function benchSession(id: number, date: string, weightKg: number, reps: number): SessionInput {
  return {
    id,
    date,
    type: "chest",
    durationMin: 60,
    srpe: 7,
    jumps: 0,
    sets: [{ exerciseKey: "bench_press", weightKg, reps, rpe: 8, isWarmup: false, bodyweightKg: 70 }],
  };
}

const base = {
  milestones: DEFAULT_SETTINGS.milestones,
  dumbbellStep: 2,
  weights: [{ date: "2026-09-29", weightKg: 70 }],
  today: TODAY,
  fallbackBw: 70,
};

describe("strength goals", () => {
  it("interpolates dated steps from the first record and picks the next one", () => {
    const g = strengthGoal({ exerciseKey: "bench_press", ratio: 1 }, ex("bench_press"), {
      ...base,
      sessions: [benchSession(1, "2026-08-01", 50, 5), benchSession(2, "2026-09-20", 55, 5)],
    });
    expect(g.targetKg).toBe(70);
    expect(g.startE1rm).toBeCloseTo(58.3, 1);
    expect(g.currentE1rm).toBeCloseTo(64.2, 1);
    expect(g.steps.map(s => [s.name, s.kg, s.status])).toEqual([
      ["M1", 62.5, "met"],
      ["M2", 65, "pending"],
      ["最終", 70, "pending"],
    ]);
    expect(g.steps[0].metOn).toBe("2026-09-20");
    expect(g.next?.name).toBe("M2");
    expect(g.next?.set.label).toBe("57.5 kg × 5");
    expect(g.perWeekKg).toBeCloseTo(0.1, 1);
    expect(g.achieved).toBe(false);
    expect(g.stale).toBe(false);
    expect(g.progress).toBeCloseTo(64.2 / 70, 2);
  });

  it("treats a step reached only after its deadline as missed, and skips it for 'next'", () => {
    const g = strengthGoal({ exerciseKey: "bench_press", ratio: 1 }, ex("bench_press"), {
      ...base,
      milestones: [
        { name: "M1", by: "2026-09-10", ffmMinKg: 60, bfMax: 14 },
        { name: "M2", by: "2026-12-31", ffmMinKg: 61, bfMax: 13 },
        { name: "最終", by: "2027-03-31", ffmMinKg: 62, bfMax: 12 },
      ],
      sessions: [benchSession(1, "2026-08-01", 50, 5), benchSession(2, "2026-09-20", 55, 5)],
    });
    const m1 = g.steps[0];
    expect(m1.name).toBe("M1");
    // 64.2 e1RM on 9/20 passes M1's kg, but only after its 9/10 deadline.
    expect(g.currentE1rm!).toBeGreaterThan(m1.kg);
    expect(m1.status).toBe("missed");
    expect(m1.metOn).toBeNull();
    expect(g.next?.name).toBe("M2");
    expect(g.next!.kg).toBeGreaterThan(g.currentE1rm!);
  });

  it("marks stale when nothing in the last 8 weeks, and achieved when current ≥ target", () => {
    const stale = strengthGoal({ exerciseKey: "bench_press", ratio: 1 }, ex("bench_press"), {
      ...base,
      sessions: [benchSession(1, "2026-07-01", 50, 5)],
    });
    expect(stale.stale).toBe(true);
    expect(stale.currentE1rm).toBeNull();

    const done = strengthGoal({ exerciseKey: "bench_press", ratio: 1 }, ex("bench_press"), {
      ...base,
      sessions: [benchSession(1, "2026-09-25", 62.5, 5)],
    });
    expect(done.achieved).toBe(true);
    expect(done.next).toBeNull();
  });

  it("ignores sessions after 'today' (back-fill view) and unknown exercises", () => {
    const goals = strengthGoals({
      ...base,
      targets: [
        { exerciseKey: "bench_press", ratio: 1 },
        { exerciseKey: "does_not_exist", ratio: 1 },
      ],
      sessions: [benchSession(1, "2026-10-05", 80, 5)],
      lookup,
    });
    expect(goals).toHaveLength(1);
    expect(goals[0].startE1rm).toBeNull();
    expect(goals[0].steps).toEqual([]);
    const hints = goalHints(goals);
    expect(hints.bench_press.targetKg).toBe(70);
    expect(hints.bench_press.nextSet).toBe("60 kg × 5");
  });
});

describe("strength target settings", () => {
  it("defaults, dedupes, clamps and caps the list", () => {
    expect(normalizeSettings({}).strengthTargets).toEqual(DEFAULT_STRENGTH_TARGETS);
    expect(normalizeStrengthTargets("nope")).toEqual(DEFAULT_STRENGTH_TARGETS);
    expect(normalizeStrengthTargets([])).toEqual([]);
    const n = normalizeStrengthTargets([
      { exerciseKey: "bench_press", ratio: 1.03 },
      { exerciseKey: "bench_press", ratio: 2 },
      { exerciseKey: "ohp", ratio: 9 },
      { exerciseKey: "", ratio: 1 },
      null,
    ]);
    expect(n).toEqual([
      { exerciseKey: "bench_press", ratio: 1.05 },
      { exerciseKey: "ohp", ratio: 3 },
    ]);
    const many = Array.from({ length: 12 }, (_, i) => ({ exerciseKey: `k${i}`, ratio: 1 }));
    expect(normalizeStrengthTargets(many)).toHaveLength(MAX_STRENGTH_TARGETS);
  });
});
