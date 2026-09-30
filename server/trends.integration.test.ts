import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bodyScans, bodyWeights, customExercises, jumpTests, sessions, userSettings, workoutSets } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { requireDb } from "./data/common";
import { DEFAULT_STRENGTH_TARGETS } from "../shared/settings";
import { appRouter } from "./routers";

// User ids with no row in `users` (never the owner, never auto-seeded).
const USER_A = 990_005;
const USER_B = 990_006;
const hasDb = !!process.env.DATABASE_URL;

function ctxFor(id: number | null): TrpcContext {
  return {
    user:
      id == null
        ? null
        : {
            id,
            openId: `trends-itest-${id}`,
            email: null,
            name: "Trends Test",
            loginMethod: "manus",
            role: "user",
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
          },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}
const caller = (id: number | null) => appRouter.createCaller(ctxFor(id));

async function cleanup() {
  const db = await requireDb();
  for (const t of [workoutSets, sessions, bodyScans, bodyWeights, jumpTests, customExercises, userSettings]) {
    await db.delete(t).where(inArray(t.userId, [USER_A, USER_B]));
  }
}

function benchWorkout(clientId: string, date: string, weightKg: number) {
  return {
    clientId,
    date,
    type: "chest" as const,
    startedAt: Date.parse(`${date}T10:00:00Z`),
    endedAt: Date.parse(`${date}T11:00:00Z`),
    durationMin: 60,
    srpe: 7,
    jumps: 0,
    vbKind: null,
    kneeStatus: null,
    notes: null,
    sets: [
      { exerciseKey: "bench_press", exerciseOrder: 0, setNo: 1, weightKg, reps: 5, rpe: 8, isWarmup: false },
      { exerciseKey: "bench_press", exerciseOrder: 0, setNo: 2, weightKg, reps: 5, rpe: 8.5, isWarmup: false },
    ],
  };
}

describe.skipIf(!hasDb)("trends.series against the real database", () => {
  beforeAll(async () => {
    await cleanup();
    const a = caller(USER_A);
    await a.training.create(benchWorkout("trend-itest-a0", "2026-08-15", 40));
    await a.training.create(benchWorkout("trend-itest-a1", "2026-09-01", 50));
    await a.training.create(benchWorkout("trend-itest-a2", "2026-09-10", 45));
    await a.training.create(benchWorkout("trend-itest-a3", "2026-09-20", 55));
    // Another user's heavier session in the same week must not leak in.
    await caller(USER_B).training.create(benchWorkout("trend-itest-b1", "2026-09-20", 100));
  }, 120_000);
  afterAll(cleanup, 60_000);

  it("aggregates weeks (Mon–Sun) for the signed-in user only", async () => {
    const r = await caller(USER_A).trends.series({ period: "week", count: 6, today: "2026-09-30" });
    expect(r.buckets.map(b => b.start)).toEqual(["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
    expect(r.buckets.map(b => b.sessions)).toEqual([0, 1, 1, 1, 0, 0]);
    expect(r.buckets.map(b => b.volume)).toEqual([0, 500, 450, 550, 0, 0]);
    expect(r.buckets.map(b => b.hardSets)).toEqual([0, 2, 2, 2, 0, 0]);
    expect(r.buckets.map(b => b.load)).toEqual([0, 420, 420, 420, 0, 0]);
    expect(r.buckets.map(b => b.e1rm.bench_press ?? null)).toEqual([null, 58.3, 52.5, 64.2, null, null]);
    expect(r.buckets[5].inProgress).toBe(true);
    expect(r.buckets[3].byType.chest.volume).toBe(550);
    expect(r.firstSessionDate).toBe("2026-08-15");
    expect(r.lifts[0]).toMatchObject({
      key: "bench_press",
      periods: 3,
      isTarget: DEFAULT_STRENGTH_TARGETS.some(t => t.exerciseKey === "bench_press"),
    });
  }, 60_000);

  it("aggregates calendar months", async () => {
    const r = await caller(USER_A).trends.series({ period: "month", count: 2, today: "2026-09-30" });
    expect(r.buckets.map(b => [b.start, b.sessions, b.volume, b.e1rm.bench_press, b.inProgress])).toEqual([
      ["2026-08-01", 1, 400, 46.7, false],
      ["2026-09-01", 3, 1500, 64.2, true],
    ]);
  }, 60_000);

  it("rejects ranges beyond the limits and anonymous callers", async () => {
    const a = caller(USER_A);
    await expect(a.trends.series({ period: "week", count: 105, today: "2026-09-30" })).rejects.toThrow();
    await expect(a.trends.series({ period: "month", count: 37, today: "2026-09-30" })).rejects.toThrow();
    await expect(a.trends.series({ period: "week", count: 0, today: "2026-09-30" })).rejects.toThrow();
    const ok = await a.trends.series({ period: "month", count: 36, today: "2026-09-30" });
    expect(ok.buckets).toHaveLength(36);
    expect(ok.buckets[0].start).toBe("2023-10-01");
    await expect(caller(null).trends.series({ period: "week", count: 4, today: "2026-09-30" })).rejects.toThrow();
  }, 60_000);
});
