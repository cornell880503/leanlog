import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  ALL_MUSCLES,
  CATEGORY_LABEL,
  DAY_TYPES,
  EQUIPMENT_LABEL,
} from "../../shared/exercises";
import { findPrs, summarizeSession, bodyweightOn, setE1rm } from "../../shared/analytics";
import { buildLookup, requireDb } from "../data/common";
import {
  createCustomExercise,
  createJump,
  createScan,
  deleteJump,
  deleteScan,
  deleteWeight,
  listJumps,
  listScans,
  listWeights,
  setCustomArchived,
  upsertWeight,
} from "../data/body";
import { dashboardSummary, strengthTrend } from "../data/dashboard";
import { buildExport } from "../data/export";
import { ensureSettings, updateSettings } from "../data/settings";
import {
  FALLBACK_BW,
  createSession,
  deleteSession,
  getSessionWithSets,
  listSessions,
  loadAllSessions,
  loadWeightPoints,
  toSessionInput,
  updateSession,
  workoutContext,
} from "../data/sessions";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式錯誤");
const sessionType = z.enum(["leg", "back", "chest", "volleyball", "other"]);

const setSchema = z.object({
  exerciseKey: z.string().min(1).max(64),
  exerciseOrder: z.number().int().min(0).max(200),
  setNo: z.number().int().min(1).max(100),
  weightKg: z.number().min(-300).max(600),
  reps: z.number().int().min(0).max(1000),
  rpe: z.number().min(1).max(10).nullable(),
  isWarmup: z.boolean(),
});

const sessionPayload = z.object({
  date: dateStr,
  type: sessionType,
  startedAt: z.number().int().nullable().default(null),
  endedAt: z.number().int().nullable().default(null),
  durationMin: z.number().int().min(0).max(720).nullable(),
  srpe: z.number().int().min(1).max(10).nullable(),
  jumps: z.number().int().min(0).max(3000).default(0),
  vbKind: z.string().max(16).nullable().default(null),
  kneeStatus: z.string().max(16).nullable().default(null),
  notes: z.string().max(1000).nullable().default(null),
  sets: z.array(setSchema).max(400),
});

const nullableNum = z.number().min(0).max(2000).nullable();

const scanPayload = z.object({
  date: dateStr,
  time: z.string().max(8).nullable(),
  location: z.string().max(128).nullable(),
  weightKg: z.number().min(30).max(250),
  fatMassKg: z.number().min(0).max(150),
  ffmKg: z.number().min(20).max(200),
  muscleMassKg: nullableNum,
  waterKg: nullableNum,
  ecwKg: nullableNum,
  icwKg: nullableNum,
  visceralFat: nullableNum,
  cellularIntegrity: nullableNum,
  metabolicAge: nullableNum,
  physiqueScore: nullableNum,
  legMuscleScore: nullableNum,
  bmrScore: nullableNum,
  boditraxScore: nullableNum,
  muscleCore: nullableNum,
  muscleLArm: nullableNum,
  muscleRArm: nullableNum,
  muscleLLeg: nullableNum,
  muscleRLeg: nullableNum,
  fatCore: nullableNum,
  fatLArm: nullableNum,
  fatRArm: nullableNum,
  fatLLeg: nullableNum,
  fatRLeg: nullableNum,
  notes: z.string().max(500).nullable(),
});

const muscleEnum = z.enum(ALL_MUSCLES as unknown as [string, ...string[]]);

export const trainingRouter = router({
  context: protectedProcedure
    .input(z.object({ type: sessionType, today: dateStr }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const { lookup } = await buildLookup(db, ctx.user.id);
      return workoutContext(db, ctx.user.id, input.type, lookup, input.today);
    }),

  create: protectedProcedure
    .input(sessionPayload.extend({ clientId: z.string().min(8).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { clientId, ...payload } = input;
      const { id, duplicate } = await createSession(db, ctx.user.id, clientId, payload);
      const settings = (await ensureSettings(db, ctx.user.id)).settings;
      const { lookup } = await buildLookup(db, ctx.user.id);
      const all = await loadAllSessions(db, ctx.user.id);
      const weights = await loadWeightPoints(db, ctx.user.id);
      const current = all.find(s => s.id === id)!;
      const bw = bodyweightOn(weights, current.date, FALLBACK_BW);
      const summary = summarizeSession(toSessionInput(current), lookup, bw, settings.hardSetRpeMin);
      // Best e1RM from every other session recorded before this one.
      const prevBest: Record<string, number> = {};
      for (const s of all) {
        if (s.id === id) continue;
        if (s.date > current.date || (s.date === current.date && s.id > id)) continue;
        const sbw = bodyweightOn(weights, s.date, FALLBACK_BW);
        for (const set of s.sets) {
          const ex = lookup(set.exerciseKey);
          if (!ex) continue;
          const v = setE1rm(ex, set, sbw);
          if (v != null && (prevBest[ex.key] == null || v > prevBest[ex.key])) prevBest[ex.key] = v;
        }
      }
      return { id, duplicate, summary, prs: findPrs(summary, prevBest) };
    }),

  update: protectedProcedure
    .input(sessionPayload.extend({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { id, ...payload } = input;
      await updateSession(db, ctx.user.id, id, payload);
      return { id };
    }),

  delete: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await deleteSession(db, ctx.user.id, input.id);
    return { ok: true } as const;
  }),

  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(60) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const { lookup } = await buildLookup(db, ctx.user.id);
      const settings = (await ensureSettings(db, ctx.user.id)).settings;
      return listSessions(db, ctx.user.id, lookup, settings.hardSetRpeMin, input.limit);
    }),

  get: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const s = await getSessionWithSets(db, ctx.user.id, input.id);
    const { lookup } = await buildLookup(db, ctx.user.id);
    const settings = (await ensureSettings(db, ctx.user.id)).settings;
    const weights = await loadWeightPoints(db, ctx.user.id);
    const bw = bodyweightOn(weights, s.date, FALLBACK_BW);
    return {
      session: {
        ...s,
        startedAt: s.startedAt ? s.startedAt.getTime() : null,
        endedAt: s.endedAt ? s.endedAt.getTime() : null,
      },
      summary: summarizeSession(toSessionInput(s), lookup, bw, settings.hardSetRpeMin),
    };
  }),
});

export const exercisesRouter = router({
  custom: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const { custom } = await buildLookup(db, ctx.user.id);
    return custom;
  }),
  createCustom: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(40),
        days: z.array(z.enum(DAY_TYPES)).min(1),
        primaryMuscles: z.array(muscleEnum).max(4),
        secondaryMuscles: z.array(muscleEnum).max(6),
        equipment: z.enum(Object.keys(EQUIPMENT_LABEL) as [string, ...string[]]),
        category: z.enum(Object.keys(CATEGORY_LABEL) as [string, ...string[]]),
        unit: z.enum(["reps", "sec"]),
        bwFactor: z.number().min(0).max(1.5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const id = await createCustomExercise(db, ctx.user.id, input);
      return { id, key: `custom:${id}` };
    }),
  archiveCustom: protectedProcedure
    .input(z.object({ id: z.number().int(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await setCustomArchived(db, ctx.user.id, input.id, input.archived);
      return { ok: true } as const;
    }),
});

export const bodyRouter = router({
  weights: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return listWeights(db, ctx.user.id, 400);
  }),
  saveWeight: protectedProcedure
    .input(z.object({ date: dateStr, weightKg: z.number().min(30).max(250), fasted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await upsertWeight(db, ctx.user.id, input.date, Math.round(input.weightKg * 10) / 10, input.fasted);
      return { ok: true } as const;
    }),
  deleteWeight: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await deleteWeight(db, ctx.user.id, input.id);
    return { ok: true } as const;
  }),
  scans: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    await ensureSettings(db, ctx.user.id);
    return listScans(db, ctx.user.id);
  }),
  createScan: protectedProcedure.input(scanPayload).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    if (input.fatMassKg >= input.weightKg) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "脂肪重量不可能大於體重" });
    }
    const id = await createScan(db, ctx.user.id, input);
    return { id };
  }),
  deleteScan: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await deleteScan(db, ctx.user.id, input.id);
    return { ok: true } as const;
  }),
  jumps: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    await ensureSettings(db, ctx.user.id);
    return listJumps(db, ctx.user.id);
  }),
  createJump: protectedProcedure
    .input(
      z.object({
        date: dateStr,
        approachReachCm: z.number().min(150).max(420),
        standingReachCm: z.number().min(150).max(300).nullable(),
        notes: z.string().max(300).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await createJump(db, ctx.user.id, input);
      return { ok: true } as const;
    }),
  deleteJump: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await deleteJump(db, ctx.user.id, input.id);
    return { ok: true } as const;
  }),
});

const weeklyTargetsSchema = z.record(z.string(), z.tuple([z.number().min(0).max(40), z.number().min(0).max(40)]));

export const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return ensureSettings(db, ctx.user.id);
  }),
  update: protectedProcedure
    .input(
      z.object({
        standingReachCm: z.number().min(150).max(300).optional(),
        standingReachEstimated: z.boolean().optional(),
        settings: z
          .object({
            bfMin: z.number().min(3).max(30),
            bfMax: z.number().min(3).max(30),
            ffmiMin: z.number().min(14).max(28),
            ffmiMax: z.number().min(14).max(28),
            targetApproachReachCm: z.number().min(200).max(400),
            weeklySetTargets: weeklyTargetsSchema,
            rotation: z.array(z.enum(["leg", "back", "chest", "rest"])).min(1).max(10),
            dumbbellStep: z.union([z.literal(1), z.literal(2), z.literal(2.5)]),
          })
          .partial()
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      return updateSettings(db, ctx.user.id, input);
    }),
});

export const dashboardRouter = router({
  summary: protectedProcedure.input(z.object({ today: dateStr })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const { lookup } = await buildLookup(db, ctx.user.id);
    return dashboardSummary(db, ctx.user.id, lookup, input.today);
  }),
  strengthTrend: protectedProcedure
    .input(z.object({ exerciseKey: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const { lookup } = await buildLookup(db, ctx.user.id);
      return strengthTrend(db, ctx.user.id, lookup, input.exerciseKey);
    }),
});

export const exportRouter = router({
  csv: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const { lookup, custom } = await buildLookup(db, ctx.user.id);
    return buildExport(db, ctx.user.id, lookup, custom);
  }),
});
