import { EXERCISES, type ExerciseDef } from "../../shared/exercises";
import { DAY_TYPES } from "../../shared/exercises";
import { plyoContacts, type Lookup } from "../../shared/analytics";
import { SESSION_LABEL, type SessionType } from "../../shared/exercises";
import type { Db } from "./common";
import { listJumps, listScans, listWeights } from "./body";
import { loadAllSessions } from "./sessions";

function cell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header.join(","), ...rows.map(r => r.map(cell).join(","))].join("\n") + "\n";
}

/** Category names understood by the Python tracker. */
function trackerCategory(ex: ExerciseDef): string {
  // Timed holds/carries count as hard sets but carry no volume or e1RM.
  if (ex.unit === "sec" && ex.category !== "plyo" && ex.category !== "power" && ex.category !== "prehab") return "timed";
  if (ex.category === "core") return "isolation";
  return ex.category;
}

export interface CsvFile {
  name: string;
  content: string;
}

export async function buildExport(db: Db, userId: number, lookup: Lookup, custom: ExerciseDef[]): Promise<CsvFile[]> {
  const all = await loadAllSessions(db, userId);
  const weights = await listWeights(db, userId, 100000);
  const scans = await listScans(db, userId);
  const jumps = await listJumps(db, userId);

  // Exercise names must be unique for the Python tracker's catalog index.
  const exercises = [...EXERCISES, ...custom];
  const exportName = new Map<string, string>();
  const used = new Set<string>();
  for (const ex of exercises) {
    let name = ex.name;
    let n = 2;
    while (used.has(name)) name = `${ex.name}（${n++}）`;
    used.add(name);
    exportName.set(ex.key, name);
  }

  const sessionsRows: unknown[][] = [];
  const setRows: unknown[][] = [];
  for (const s of all) {
    const sid = `S${s.id}`;
    const isStrength = (DAY_TYPES as readonly string[]).includes(s.type);
    let plyo = 0;
    const counters = new Map<string, number>();
    for (const set of s.sets) {
      const ex = lookup(set.exerciseKey);
      if (!ex) continue;
      plyo += plyoContacts(ex, set);
      const n = (counters.get(ex.key) ?? 0) + 1;
      counters.set(ex.key, n);
      setRows.push([
        sid,
        s.date,
        exportName.get(ex.key) ?? ex.name,
        n,
        set.reps,
        ex.assisted ? -set.weightKg : set.weightKg,
        set.rpe,
        set.isWarmup ? 1 : 0,
        ex.unit === "sec" ? "秒數" : "",
      ]);
    }
    const label = SESSION_LABEL[s.type as SessionType] ?? s.type;
    const noteParts = [label];
    if (s.vbKind) noteParts.push(s.vbKind);
    if (s.kneeStatus && s.kneeStatus !== "沒事") noteParts.push(`膝蓋：${s.kneeStatus}`);
    if (s.notes) noteParts.push(s.notes);
    sessionsRows.push([
      sid,
      s.date,
      isStrength ? "strength" : s.type,
      s.durationMin,
      s.srpe,
      (s.jumps ?? 0) + plyo,
      noteParts.join("；"),
    ]);
  }

  const exerciseRows = exercises.map(ex => [
    exportName.get(ex.key) ?? ex.name,
    [ex.key, ...(ex.aliases ?? [])].join("|"),
    ex.primary.join("|"),
    ex.secondary.join("|"),
    trackerCategory(ex),
    ex.bwFactor,
  ]);

  const scanHeader = [
    "date", "time", "device", "location", "weight_kg", "fat_mass_kg", "ffm_kg", "muscle_mass_kg", "water_kg",
    "ecw_kg", "icw_kg", "visceral_fat", "cellular_integrity", "metabolic_age", "physique_score",
    "leg_muscle_score", "bmr_score", "boditrax_score", "muscle_core", "muscle_larm", "muscle_rarm",
    "muscle_lleg", "muscle_rleg", "fat_core", "fat_larm", "fat_rarm", "fat_lleg", "fat_rleg", "fasted", "notes",
  ];
  const scanRows = scans.map(x => [
    x.date, x.time, x.device, x.location, x.weightKg, x.fatMassKg, x.ffmKg, x.muscleMassKg, x.waterKg,
    x.ecwKg, x.icwKg, x.visceralFat, x.cellularIntegrity, x.metabolicAge, x.physiqueScore,
    x.legMuscleScore, x.bmrScore, x.boditraxScore, x.muscleCore, x.muscleLArm, x.muscleRArm,
    x.muscleLLeg, x.muscleRLeg, x.fatCore, x.fatLArm, x.fatRArm, x.fatLLeg, x.fatRLeg, "unknown", x.notes,
  ]);

  const sortedWeights = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const bwOn = (d: string) => {
    let v: number | null = null;
    for (const w of sortedWeights) if (w.date <= d) v = w.weightKg;
    return v;
  };

  return [
    {
      name: "sessions.csv",
      content: toCsv(["session_id", "date", "type", "duration_min", "srpe", "jumps", "notes"], sessionsRows),
    },
    {
      name: "sets.csv",
      content: toCsv(
        ["session_id", "date", "exercise", "set_no", "reps", "weight_kg", "rpe", "is_warmup", "notes"],
        setRows
      ),
    },
    {
      name: "daily_weight.csv",
      content: toCsv(
        ["date", "weight_kg", "fasted", "notes"],
        sortedWeights.map(w => [w.date, w.weightKg, w.fasted ? 1 : 0, ""])
      ),
    },
    {
      name: "jump_tests.csv",
      content: toCsv(
        ["date", "standing_reach_cm", "approach_reach_cm", "cmj_cm", "bodyweight_kg", "notes"],
        jumps.map(j => [j.date, j.standingReachCm, j.approachReachCm, null, bwOn(j.date), j.notes])
      ),
    },
    { name: "body_scans.csv", content: toCsv(scanHeader, scanRows) },
    {
      name: "exercises.csv",
      content: toCsv(["exercise", "aliases", "primary", "secondary", "category", "bw_factor"], exerciseRows),
    },
  ];
}
