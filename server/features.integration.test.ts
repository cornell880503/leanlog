import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bodyScans,
  bodyWeights,
  customExercises,
  jumpTests,
  sessions,
  userSettings,
  workoutSets,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { requireDb } from "./data/common";
import { importBaselineIfNeeded } from "./data/baseline";
import { appRouter } from "./routers";

// A user id that has no row in `users`, so it can never be treated as the
// site owner and never receives the owner's baseline automatically.
const TEST_USER_ID = 990_001;
const hasDb = !!process.env.DATABASE_URL;

function caller() {
  const ctx: TrpcContext = {
    user: {
      id: TEST_USER_ID,
      openId: "integration-test",
      email: null,
      name: "Integration Test",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

async function cleanup() {
  const db = await requireDb();
  for (const t of [workoutSets, sessions, bodyScans, bodyWeights, jumpTests, customExercises, userSettings]) {
    await db.delete(t).where(eq(t.userId, TEST_USER_ID));
  }
}

describe.skipIf(!hasDb)("feature API against the real database", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("runs the full logging flow", async () => {
    const api = caller();
    const db = await requireDb();

    // Settings are created with defaults; no baseline for a non-owner.
    const settings = await api.settings.get();
    expect(settings.standingReachCm).toBe(238);
    expect(settings.settings.rotation).toEqual(["leg", "back", "chest", "rest"]);
    expect(await api.body.scans()).toHaveLength(0);

    // Baseline import (forced for the test user) is idempotent.
    expect(await importBaselineIfNeeded(db, TEST_USER_ID, true)).toBe(true);
    expect(await importBaselineIfNeeded(db, TEST_USER_ID, true)).toBe(false);
    const scans = await api.body.scans();
    expect(scans).toHaveLength(1);
    expect(scans[0].ffmKg).toBeCloseTo(59.1);
    const jumps = await api.body.jumps();
    expect(jumps).toHaveLength(1);
    expect(jumps[0].approachReachCm).toBe(305);

    // First leg day: no template yet.
    const ctx0 = await api.training.context({ type: "leg", today: "2026-09-28" });
    expect(ctx0.template).toBeNull();

    const payload = {
      clientId: "itest-client-0001",
      date: "2026-09-28",
      type: "leg" as const,
      startedAt: Date.parse("2026-09-28T10:00:00Z"),
      endedAt: Date.parse("2026-09-28T11:05:00Z"),
      durationMin: 65,
      srpe: 7,
      jumps: 0,
      vbKind: null,
      kneeStatus: null,
      notes: null,
      sets: [
        { exerciseKey: "back_squat", exerciseOrder: 0, setNo: 1, weightKg: 40, reps: 8, rpe: 5, isWarmup: true },
        { exerciseKey: "back_squat", exerciseOrder: 0, setNo: 2, weightKg: 80, reps: 6, rpe: 8, isWarmup: false },
        { exerciseKey: "back_squat", exerciseOrder: 0, setNo: 3, weightKg: 80, reps: 6, rpe: 9, isWarmup: false },
        { exerciseKey: "pull_up", exerciseOrder: 1, setNo: 1, weightKg: 0, reps: 8, rpe: null, isWarmup: false },
      ],
    };
    const created = await api.training.create(payload);
    expect(created.duplicate).toBe(false);
    expect(created.summary.hardSets).toBe(3);
    expect(created.summary.load).toBe(455);
    expect(created.prs.length).toBeGreaterThan(0);

    // Retrying the same upload does not create a second session.
    const again = await api.training.create(payload);
    expect(again.duplicate).toBe(true);
    expect(again.id).toBe(created.id);

    // Next leg day is pre-filled from the last one, in order.
    const ctx1 = await api.training.context({ type: "leg", today: "2026-10-02" });
    expect(ctx1.template?.date).toBe("2026-09-28");
    expect(ctx1.template?.exercises.map(e => e.exerciseKey)).toEqual(["back_squat", "pull_up"]);
    expect(ctx1.template?.exercises[0].sets).toHaveLength(3);
    expect(ctx1.lastPerf.back_squat.bestE1rm).toBeCloseTo(96, 0);

    // Detail and list views.
    const detail = await api.training.get({ id: created.id });
    expect(detail.session.sets).toHaveLength(4);
    expect(typeof detail.session.startedAt).toBe("number");
    const list = await api.training.list({ limit: 10 });
    expect(list[0].id).toBe(created.id);
    expect(list[0].exerciseCount).toBe(2);

    // Edit: drop the pull-ups and change sRPE.
    await api.training.update({
      id: created.id,
      ...payload,
      srpe: 8,
      sets: payload.sets.filter(s => s.exerciseKey !== "pull_up"),
    });
    const edited = await api.training.get({ id: created.id });
    expect(edited.session.srpe).toBe(8);
    expect(edited.session.sets).toHaveLength(3);

    // Volleyball the next day adds jumps and an extra rest day.
    await api.training.create({
      clientId: "itest-client-0002",
      date: "2026-09-29",
      type: "volleyball",
      startedAt: null,
      endedAt: null,
      durationMin: 120,
      srpe: 7,
      jumps: 120,
      vbKind: "練習",
      kneeStatus: "有點緊",
      notes: null,
      sets: [],
    });
    const dash = await api.dashboard.summary({ today: "2026-09-30" });
    expect(dash.suggestion.type).toBe("rest");
    const week = dash.weeks[dash.weeks.length - 1];
    expect(week.inProgress).toBe(true);
    expect(week.jumps).toBe(120);
    expect(week.muscleSets["股四頭"]).toBe(2);
    expect(dash.body.latest?.bfPct).toBeCloseTo(13.85, 1);
    expect(dash.jump.remainingCm).toBe(15);
    expect(dash.strengthOptions.map(o => o.key)).toContain("back_squat");
    const trend = await api.dashboard.strengthTrend({ exerciseKey: "back_squat" });
    expect(trend).toHaveLength(1);

    // Weights upsert per day.
    await api.body.saveWeight({ date: "2026-09-30", weightKg: 70.6, fasted: true });
    await api.body.saveWeight({ date: "2026-09-30", weightKg: 70.4, fasted: true });
    const weights = await api.body.weights();
    expect(weights).toHaveLength(1);
    expect(weights[0].weightKg).toBeCloseTo(70.4);

    // Jump test and scan creation.
    await api.body.createJump({ date: "2026-09-30", approachReachCm: 307, standingReachCm: 238, notes: null });
    const scan = await api.body.createScan({
      date: "2026-09-30",
      time: "09:00",
      location: null,
      weightKg: 70,
      fatMassKg: 9,
      ffmKg: 61,
      muscleMassKg: 57.5,
      waterKg: null,
      ecwKg: null,
      icwKg: null,
      visceralFat: 5,
      cellularIntegrity: null,
      metabolicAge: null,
      physiqueScore: null,
      legMuscleScore: null,
      bmrScore: null,
      boditraxScore: null,
      muscleCore: null,
      muscleLArm: null,
      muscleRArm: null,
      muscleLLeg: null,
      muscleRLeg: null,
      fatCore: null,
      fatLArm: null,
      fatRArm: null,
      fatLLeg: null,
      fatRLeg: null,
      notes: null,
    });
    expect(scan.id).toBeGreaterThan(0);

    // Custom exercise is usable in a session.
    const custom = await api.exercises.createCustom({
      name: "測試用單手纜繩划船",
      days: ["back"],
      primaryMuscles: ["背"],
      secondaryMuscles: ["二頭"],
      equipment: "cable",
      category: "isolation",
      unit: "reps",
      bwFactor: 0,
    });
    expect(custom.key).toBe(`custom:${custom.id}`);
    const customList = await api.exercises.custom();
    expect(customList.find(c => c.key === custom.key)?.primary).toEqual(["背"]);

    // Settings update round-trip.
    const updated = await api.settings.update({ standingReachCm: 240, standingReachEstimated: false, settings: { dumbbellStep: 2.5 } });
    expect(updated.standingReachCm).toBe(240);
    expect(updated.settings.dumbbellStep).toBe(2.5);

    // CSV export matches the offline tracker's file layout.
    const files = await api.export.csv();
    const byName = Object.fromEntries(files.map(f => [f.name, f.content]));
    expect(byName["sessions.csv"].split("\n")[0]).toBe("session_id,date,type,duration_min,srpe,jumps,notes");
    expect(byName["sets.csv"].split("\n")[0]).toBe("session_id,date,exercise,set_no,reps,weight_kg,rpe,is_warmup,notes");
    expect(byName["daily_weight.csv"]).toContain("2026-09-30,70.4");
    expect(byName["jump_tests.csv"]).toContain("307");
    expect(byName["body_scans.csv"]).toContain("2026-09-30");

    // Delete removes the session and its sets.
    await api.training.delete({ id: created.id });
    await expect(api.training.get({ id: created.id })).rejects.toThrow();
  }, 60_000);
});
