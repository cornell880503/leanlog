import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bodyScans, bodyWeights, customExercises, jumpTests, sessions, userSettings, workoutSets } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { requireDb } from "./data/common";
import { appRouter } from "./routers";

// User ids with no row in `users` (never the owner, never auto-seeded).
const USER_A = 990_003;
const USER_B = 990_004;
const hasDb = !!process.env.DATABASE_URL;

function ctxFor(id: number | null): TrpcContext {
  return {
    user:
      id == null
        ? null
        : {
            id,
            openId: `calendar-itest-${id}`,
            email: null,
            name: "Calendar Test",
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

describe.skipIf(!hasDb)("calendar range and strength targets against the real database", () => {
  beforeAll(cleanup, 60_000);
  afterAll(cleanup, 60_000);

  it("returns only the requested dates for the signed-in user", async () => {
    const a = caller(USER_A);
    await a.training.create(benchWorkout("cal-itest-a1", "2026-09-01", 50));
    await a.training.create(benchWorkout("cal-itest-a2", "2026-09-20", 55));
    await a.training.create(benchWorkout("cal-itest-a3", "2026-09-10", 45));
    await a.body.saveWeight({ date: "2026-09-20", weightKg: 70.4, fasted: true });
    await a.body.createJump({ date: "2026-09-21", approachReachCm: 306, standingReachCm: null, notes: null });

    const r = await a.calendar.range({ from: "2026-09-15", to: "2026-09-30" });
    expect(r.sessions.map(s => s.date)).toEqual(["2026-09-20"]);
    expect(r.sessions[0].summary.hardSets).toBeGreaterThan(0);
    expect(r.weights.map(w => [w.date, w.weightKg])).toEqual([["2026-09-20", 70.4]]);
    expect(r.jumps.map(j => j.approachReachCm)).toEqual([306]);
    expect(r.firstSessionDate).toBe("2026-09-01");

    // Another user sees nothing of A's.
    const b = await caller(USER_B).calendar.range({ from: "2026-09-01", to: "2026-10-31" });
    expect(b.sessions).toHaveLength(0);
    expect(b.weights).toHaveLength(0);
    expect(b.firstSessionDate).toBeNull();

    // Signed-out callers are rejected; oversized or reversed ranges are rejected.
    await expect(caller(null).calendar.range({ from: "2026-09-01", to: "2026-09-30" })).rejects.toThrow();
    await expect(a.calendar.range({ from: "2026-01-01", to: "2026-06-30" })).rejects.toThrow();
    await expect(a.calendar.range({ from: "2026-09-30", to: "2026-09-01" })).rejects.toThrow();
  }, 60_000);

  it("saves strength targets and uses them in the dashboard and workout context", async () => {
    const a = caller(USER_A);
    const before = await a.settings.get();
    expect(before.settings.strengthTargets.map(t => t.exerciseKey)).toContain("bench_press");

    const saved = await a.settings.update({
      settings: { strengthTargets: [{ exerciseKey: "bench_press", ratio: 1.2 }] },
    });
    expect(saved.settings.strengthTargets).toEqual([{ exerciseKey: "bench_press", ratio: 1.2 }]);
    // Other settings are untouched by a partial update.
    expect(saved.settings.rotation).toEqual(before.settings.rotation);

    const summary = await a.dashboard.summary({ today: "2026-09-30" });
    expect(summary.strengthGoals).toHaveLength(1);
    const g = summary.strengthGoals[0];
    expect(g.exerciseKey).toBe("bench_press");
    // Latest weight 70.4 × 1.2 = 84.5 → nearest 2.5 = 85; best recent e1RM is the 9/20 session.
    expect(g.targetKg).toBe(85);
    expect(g.currentE1rm).toBeCloseTo(64.2, 1);
    expect(summary.upcoming).toHaveLength(7);
    expect(summary.timeline).toHaveLength(14);
    expect(summary.suggestion.basis?.lastDate).toBe("2026-09-20");

    // Back-filling 09/05: "last time" is the 09/01 session, not the later ones.
    const ctx = await a.training.context({ type: "chest", today: "2026-09-05" });
    expect(ctx.template?.date).toBe("2026-09-01");
    expect(ctx.goals.bench_press.targetKg).toBeGreaterThan(0);

    await expect(
      a.settings.update({ settings: { strengthTargets: [{ exerciseKey: "bench_press", ratio: 5 }] } })
    ).rejects.toThrow();

    const db = await requireDb();
    const rows = await db.select().from(sessions).where(eq(sessions.userId, USER_A));
    expect(rows).toHaveLength(3);
  }, 60_000);

  it("rejects future or impossible record dates and invalid strength-target lifts", async () => {
    const a = caller(USER_A);
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await expect(a.training.create(benchWorkout("cal-itest-future", future, 50))).rejects.toThrow(/未來/);
    await expect(a.training.create(benchWorkout("cal-itest-bad", "2026-02-30", 50))).rejects.toThrow(/不存在/);
    await expect(a.body.saveWeight({ date: future, weightKg: 70, fasted: true })).rejects.toThrow(/未來/);
    await expect(
      a.body.createJump({ date: future, approachReachCm: 300, standingReachCm: null, notes: null })
    ).rejects.toThrow(/未來/);
    // Yesterday (UTC) is always accepted.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await a.body.saveWeight({ date: yesterday, weightKg: 70.1, fasted: true });

    await expect(
      a.settings.update({ settings: { strengthTargets: [{ exerciseKey: "no_such_lift", ratio: 1 }] } })
    ).rejects.toThrow(/不存在或已封存/);
    await expect(
      a.settings.update({ settings: { strengthTargets: [{ exerciseKey: "plank", ratio: 1 }] } })
    ).rejects.toThrow(/不存在或已封存/);
    const ok = await a.settings.update({
      settings: { strengthTargets: [{ exerciseKey: "back_squat", ratio: 1.5 }] },
    });
    expect(ok.settings.strengthTargets).toEqual([{ exerciseKey: "back_squat", ratio: 1.5 }]);
  }, 60_000);
});
