import type { DraftExercise, PrevPerf } from "@/lib/draft";
import { uid } from "@/lib/format";
import type { ExerciseDef, SessionType } from "@shared/exercises";
import type { Lookup } from "@shared/analytics";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ExerciseCard, defaultSetsFor } from "./ExerciseCard";
import { ExercisePicker } from "./ExercisePicker";

export interface SetPayloadOut {
  exerciseKey: string;
  exerciseOrder: number;
  setNo: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
}

export function draftToSets(exercises: DraftExercise[], includeUndone: boolean): SetPayloadOut[] {
  const out: SetPayloadOut[] = [];
  let order = 0;
  for (const e of exercises) {
    const sets = e.sets.filter(s => includeUndone || s.done);
    if (!sets.length) continue;
    sets.forEach((s, i) =>
      out.push({
        exerciseKey: e.exerciseKey,
        exerciseOrder: order,
        setNo: i + 1,
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
        isWarmup: s.isWarmup,
      })
    );
    order += 1;
  }
  return out;
}

export function setsToDraftExercises(
  sets: { exerciseKey: string; exerciseOrder: number; setNo: number; weightKg: number; reps: number; rpe: number | null; isWarmup: boolean }[]
): DraftExercise[] {
  const out: DraftExercise[] = [];
  const byOrder = new Map<number, DraftExercise>();
  const sorted = [...sets].sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setNo - b.setNo);
  for (const s of sorted) {
    let e = byOrder.get(s.exerciseOrder);
    if (!e || e.exerciseKey !== s.exerciseKey) {
      e = { id: uid(), exerciseKey: s.exerciseKey, sets: [] };
      byOrder.set(s.exerciseOrder, e);
      out.push(e);
    }
    e.sets.push({ id: uid(), weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, isWarmup: s.isWarmup, done: true });
  }
  return out;
}

export function WorkoutEditor({
  type,
  exercises,
  onChange,
  prev,
  lookup,
  all,
  bodyweightKg,
  dumbbellStep,
}: {
  type: SessionType;
  exercises: DraftExercise[];
  onChange: (next: DraftExercise[]) => void;
  prev: Record<string, PrevPerf>;
  lookup: Lookup;
  all: ExerciseDef[];
  bodyweightKg: number;
  dumbbellStep: number;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceId, setReplaceId] = useState<string | null>(null);

  const recentKeys = Object.entries(prev)
    .sort((a, b) => b[1].date.localeCompare(a[1].date))
    .map(([k]) => k);

  const addExercise = (key: string) => {
    const ex = lookup(key);
    if (!ex) return;
    if (replaceId) {
      onChange(
        exercises.map(e =>
          e.id === replaceId
            ? { ...e, exerciseKey: key, sets: prev[key] ? defaultSetsFor(ex, prev[key]) : e.sets.map(s => ({ ...s, done: false })) }
            : e
        )
      );
      setReplaceId(null);
      return;
    }
    onChange([...exercises, { id: uid(), exerciseKey: key, sets: defaultSetsFor(ex, prev[key]) }]);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...exercises];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {exercises.map((item, idx) => (
        <ExerciseCard
          key={item.id}
          ex={lookup(item.exerciseKey)}
          item={item}
          prev={prev[item.exerciseKey]}
          type={type}
          bodyweightKg={bodyweightKg}
          dumbbellStep={dumbbellStep}
          onChange={next => onChange(exercises.map(e => (e.id === item.id ? next : e)))}
          onReplace={() => {
            setReplaceId(item.id);
            setPickerOpen(true);
          }}
          onRemove={() => onChange(exercises.filter(e => e.id !== item.id))}
          onMove={dir => move(idx, dir)}
          canMoveUp={idx > 0}
          canMoveDown={idx < exercises.length - 1}
        />
      ))}
      <button
        type="button"
        onClick={() => {
          setReplaceId(null);
          setPickerOpen(true);
        }}
        className="press flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-dim text-lg font-medium"
      >
        <Plus className="size-5" /> 新增動作
      </button>
      <ExercisePicker
        open={pickerOpen}
        onOpenChange={o => {
          setPickerOpen(o);
          if (!o) setReplaceId(null);
        }}
        type={type}
        all={all}
        recentKeys={recentKeys}
        excludeKeys={exercises.map(e => e.exerciseKey)}
        title={replaceId ? "換成哪個動作？" : "新增動作"}
        onPick={addExercise}
      />
    </div>
  );
}
