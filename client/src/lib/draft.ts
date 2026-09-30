import type { SessionType } from "@shared/exercises";
import type { GoalHint } from "@shared/strength";
import { useCallback, useEffect, useState } from "react";

export interface DraftSet {
  id: string;
  weightKg: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
  done: boolean;
}

export interface DraftExercise {
  id: string;
  exerciseKey: string;
  sets: DraftSet[];
}

export interface PrevPerf {
  date: string;
  sets: { weightKg: number; reps: number; rpe: number | null; isWarmup: boolean }[];
  bestE1rm: number | null;
  allTimeBestE1rm: number | null;
}

export interface WorkoutDraft {
  clientId: string;
  type: SessionType;
  startedAt: number;
  exercises: DraftExercise[];
  /** Snapshot of previous performance when the workout was started. */
  prev: Record<string, PrevPerf>;
  bodyweightKg: number;
  templateDate: string | null;
  /** The date this workout is recorded for (a past date when back-filling). */
  date?: string;
  /** Strength-target hints per exercise, snapshotted at start. */
  goals?: Record<string, GoalHint>;
  finishing?: {
    date: string;
    durationMin: number;
    srpe: number | null;
    notes: string;
  };
}

const KEY = "leanlog:draft:v1";

export function readDraft(): WorkoutDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as WorkoutDraft;
    if (!d || !d.clientId || !Array.isArray(d.exercises)) return null;
    return d;
  } catch {
    return null;
  }
}

export function writeDraft(d: WorkoutDraft | null): void {
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify(d));
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("leanlog:draft"));
  } catch {
    // storage full or unavailable; the in-memory state still works
  }
}

/** Draft state that is persisted to localStorage on every change. */
export function useDraft() {
  const [draft, setDraftState] = useState<WorkoutDraft | null>(() => readDraft());
  useEffect(() => {
    const onChange = () => setDraftState(readDraft());
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);
  const setDraft = useCallback((next: WorkoutDraft | null | ((d: WorkoutDraft | null) => WorkoutDraft | null)) => {
    setDraftState(prev => {
      const value = typeof next === "function" ? next(prev) : next;
      writeDraft(value);
      return value;
    });
  }, []);
  return [draft, setDraft] as const;
}

/** Read-only subscription used by the Today page banner. */
export function useDraftPeek(): WorkoutDraft | null {
  const [draft, setDraft] = useState<WorkoutDraft | null>(() => readDraft());
  useEffect(() => {
    const onChange = () => setDraft(readDraft());
    window.addEventListener("leanlog:draft", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("leanlog:draft", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return draft;
}
