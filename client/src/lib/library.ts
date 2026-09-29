import { trpc } from "@/lib/trpc";
import { EXERCISES, EXERCISE_MAP, type ExerciseDef } from "@shared/exercises";
import type { Lookup } from "@shared/analytics";
import { useMemo } from "react";

export function useExerciseLibrary() {
  const custom = trpc.exercises.custom.useQuery(undefined, { staleTime: 60_000 });
  return useMemo(() => {
    const customDefs: ExerciseDef[] = custom.data ?? [];
    const cmap = new Map(customDefs.map(c => [c.key, c]));
    const lookup: Lookup = key => EXERCISE_MAP[key] ?? cmap.get(key);
    const all: ExerciseDef[] = [...customDefs.filter(c => !c.archived), ...EXERCISES];
    return { lookup, all, custom: customDefs, loading: custom.isLoading };
  }, [custom.data, custom.isLoading]);
}

export function exerciseName(lookup: Lookup, key: string): string {
  return lookup(key)?.name ?? "（已刪除的動作）";
}
