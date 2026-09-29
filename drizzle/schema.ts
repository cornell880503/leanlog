import {
  boolean,
  date,
  double,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** One training occasion: a strength day, a volleyball session, or other. */
export const sessions = mysqlTable(
  "sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    /** Client-generated id so a retried upload never creates a duplicate. */
    clientId: varchar("clientId", { length: 64 }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    type: varchar("type", { length: 16 }).notNull(),
    startedAt: timestamp("startedAt"),
    endedAt: timestamp("endedAt"),
    durationMin: int("durationMin"),
    srpe: int("srpe"),
    /** Estimated jumps entered for volleyball (plyo reps are derived from sets). */
    jumps: int("jumps").default(0).notNull(),
    vbKind: varchar("vbKind", { length: 16 }),
    kneeStatus: varchar("kneeStatus", { length: 16 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    uniqueIndex("sessions_user_client").on(t.userId, t.clientId),
    index("sessions_user_date").on(t.userId, t.date),
  ]
);

export type SessionRow = typeof sessions.$inferSelect;

export const workoutSets = mysqlTable(
  "workout_sets",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("sessionId").notNull(),
    userId: int("userId").notNull(),
    exerciseKey: varchar("exerciseKey", { length: 64 }).notNull(),
    exerciseOrder: int("exerciseOrder").notNull(),
    setNo: int("setNo").notNull(),
    /** External load; for assisted machines this is the assistance amount. */
    weightKg: double("weightKg").default(0).notNull(),
    /** Repetitions, or seconds for timed exercises. */
    reps: int("reps").notNull(),
    rpe: double("rpe"),
    isWarmup: boolean("isWarmup").default(false).notNull(),
    bodyweightKg: double("bodyweightKg"),
  },
  t => [
    index("sets_session").on(t.sessionId),
    index("sets_user_exercise").on(t.userId, t.exerciseKey),
  ]
);

export type WorkoutSetRow = typeof workoutSets.$inferSelect;

export const customExercises = mysqlTable("custom_exercises", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  days: json("days").$type<string[]>().notNull(),
  primaryMuscles: json("primaryMuscles").$type<string[]>().notNull(),
  secondaryMuscles: json("secondaryMuscles").$type<string[]>().notNull(),
  equipment: varchar("equipment", { length: 16 }).notNull(),
  category: varchar("category", { length: 16 }).notNull(),
  unit: varchar("unit", { length: 8 }).default("reps").notNull(),
  bwFactor: double("bwFactor").default(0).notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CustomExerciseRow = typeof customExercises.$inferSelect;

export const bodyWeights = mysqlTable(
  "body_weights",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    weightKg: double("weightKg").notNull(),
    fasted: boolean("fasted").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [uniqueIndex("weights_user_date").on(t.userId, t.date)]
);

export type BodyWeightRow = typeof bodyWeights.$inferSelect;

export const bodyScans = mysqlTable(
  "body_scans",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    time: varchar("time", { length: 8 }),
    device: varchar("device", { length: 32 }).default("Boditrax").notNull(),
    location: varchar("location", { length: 128 }),
    weightKg: double("weightKg").notNull(),
    fatMassKg: double("fatMassKg").notNull(),
    ffmKg: double("ffmKg").notNull(),
    muscleMassKg: double("muscleMassKg"),
    waterKg: double("waterKg"),
    ecwKg: double("ecwKg"),
    icwKg: double("icwKg"),
    visceralFat: double("visceralFat"),
    cellularIntegrity: double("cellularIntegrity"),
    metabolicAge: double("metabolicAge"),
    physiqueScore: double("physiqueScore"),
    legMuscleScore: double("legMuscleScore"),
    bmrScore: double("bmrScore"),
    boditraxScore: double("boditraxScore"),
    muscleCore: double("muscleCore"),
    muscleLArm: double("muscleLArm"),
    muscleRArm: double("muscleRArm"),
    muscleLLeg: double("muscleLLeg"),
    muscleRLeg: double("muscleRLeg"),
    fatCore: double("fatCore"),
    fatLArm: double("fatLArm"),
    fatRArm: double("fatRArm"),
    fatLLeg: double("fatLLeg"),
    fatRLeg: double("fatRLeg"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("scans_user_date").on(t.userId, t.date)]
);

export type BodyScanRow = typeof bodyScans.$inferSelect;

export const jumpTests = mysqlTable(
  "jump_tests",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    standingReachCm: double("standingReachCm"),
    approachReachCm: double("approachReachCm").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("jumps_user_date").on(t.userId, t.date)]
);

export type JumpTestRow = typeof jumpTests.$inferSelect;

export const userSettings = mysqlTable("user_settings", {
  userId: int("userId").primaryKey(),
  standingReachCm: double("standingReachCm").default(238).notNull(),
  standingReachEstimated: boolean("standingReachEstimated").default(true).notNull(),
  /** JSON-encoded Settings (targets, weekly set targets, rotation, increments). */
  settings: json("settings").$type<Record<string, unknown>>().notNull(),
  /** Version of the baseline data import that has completed (0 = none). */
  baselineVersion: int("baselineVersion").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserSettingsRow = typeof userSettings.$inferSelect;
