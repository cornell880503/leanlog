import { Pick, numOptions, range, withValue } from "@/components/app/controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DraftExercise, DraftSet, PrevPerf } from "@/lib/draft";
import { fmt, shortDate, uid } from "@/lib/format";
import { TYPE_COLOR } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { e1rm as calcE1rm, effectiveLoad } from "@shared/analytics";
import {
  EQUIPMENT_LABEL,
  usesWeight,
  weightMax,
  weightStep,
  type ExerciseDef,
  type SessionType,
} from "@shared/exercises";
import { ArrowDown, ArrowUp, Check, MoreHorizontal, Repeat, Trash2 } from "lucide-react";
import { useMemo } from "react";

const RPES = [6, 7, 8, 9, 10];

export function defaultSetsFor(ex: ExerciseDef, prev?: PrevPerf): DraftSet[] {
  if (prev && prev.sets.length) {
    return prev.sets.map(s => ({ id: uid(), weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, isWarmup: s.isWarmup, done: false }));
  }
  let weight = 0;
  let reps = 10;
  if (ex.equipment === "barbell") weight = 20;
  else if (ex.equipment === "dumbbell") weight = 10;
  else if (ex.equipment === "machine" || ex.equipment === "cable") weight = 20;
  else if (ex.equipment === "kettlebell") weight = 16;
  if (ex.category === "plyo") reps = 5;
  if (ex.category === "power") reps = 3;
  if (ex.unit === "sec") reps = 30;
  if (ex.assisted) weight = 20;
  if (ex.equipment === "bodyweight" && ex.category !== "plyo") reps = 8;
  return [0, 1, 2].map(() => ({ id: uid(), weightKg: weight, reps, rpe: null, isWarmup: false, done: false }));
}

export function ExerciseCard({
  ex,
  item,
  prev,
  type,
  bodyweightKg,
  dumbbellStep,
  onChange,
  onReplace,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  ex: ExerciseDef | undefined;
  item: DraftExercise;
  prev?: PrevPerf;
  type: SessionType;
  bodyweightKg: number;
  dumbbellStep: number;
  onChange: (next: DraftExercise) => void;
  onReplace: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const step = ex ? weightStep(ex.equipment, dumbbellStep) : 2.5;
  const showWeight = ex ? usesWeight(ex) : true;
  const isSec = ex?.unit === "sec";

  const weightValues = useMemo(() => {
    if (!ex) return range(0, 200, 2.5);
    if (ex.assisted) return range(0, 80, 2.5);
    return range(0, weightMax(ex.equipment), step);
  }, [ex, step]);
  const repValues = useMemo(() => (isSec ? range(5, 300, 5) : range(1, 30, 1)), [isSec]);

  const weightLabel = (v: number) => {
    if (ex?.assisted) return `輔助 ${fmt(v)}`;
    if (ex?.bwFactor) return v === 0 ? "自身體重" : `+${fmt(v)}`;
    return fmt(v);
  };

  const prevBest = useMemo(() => {
    if (!prev || !ex) return null;
    let best: { weightKg: number; reps: number; e1rm: number | null } | null = null;
    for (const s of prev.sets) {
      if (s.isWarmup) continue;
      const load = effectiveLoad(ex, { ...s, exerciseKey: ex.key, bodyweightKg: bodyweightKg }, bodyweightKg);
      const v = ex.unit === "sec" ? null : calcE1rm(load, s.reps);
      if (!best || (v ?? 0) > (best.e1rm ?? 0) || (v == null && best.e1rm == null && s.reps > best.reps)) {
        best = { weightKg: s.weightKg, reps: s.reps, e1rm: v };
      }
    }
    return best;
  }, [prev, ex, bodyweightKg]);

  const setSets = (sets: DraftSet[]) => onChange({ ...item, sets });
  const updateSet = (id: string, patch: Partial<DraftSet>) =>
    setSets(item.sets.map(s => (s.id === id ? { ...s, ...patch } : s)));

  const shiftAll = (delta: number) =>
    setSets(
      item.sets.map(s =>
        s.done ? s : { ...s, weightKg: Math.max(0, Math.round((s.weightKg + delta) * 100) / 100) }
      )
    );

  const copyLast = () => {
    if (!prev || !prev.sets.length) return;
    const next = prev.sets.map((p, i) => ({
      id: item.sets[i]?.id ?? uid(),
      weightKg: p.weightKg,
      reps: p.reps,
      rpe: p.rpe,
      isWarmup: p.isWarmup,
      done: item.sets[i]?.done ?? false,
    }));
    setSets(next);
  };

  const addSet = () => {
    const last = item.sets[item.sets.length - 1];
    const base = last ?? defaultSetsFor(ex ?? ({} as ExerciseDef))[0];
    setSets([...item.sets, { ...base, id: uid(), done: false, isWarmup: false }]);
  };
  const removeSet = () => {
    if (!item.sets.length) return;
    setSets(item.sets.slice(0, -1));
  };

  return (
    <article className="card-iron relative overflow-hidden fade-up">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: TYPE_COLOR[type] }} />
      <div className="flex items-start gap-2 p-4 pb-2 pl-5">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold leading-tight">{ex?.name ?? "（已刪除的動作）"}</h3>
          <div className="mt-1 text-xs text-dim">
            {ex && EQUIPMENT_LABEL[ex.equipment]}
            {ex && ex.primary.length > 0 && `・${ex.primary.join("、")}`}
          </div>
          {prev && prevBest ? (
            <div className="mt-1 text-xs text-chalk/80">
              上次 {shortDate(prev.date)} 最佳{" "}
              <span className="num text-sm font-semibold">
                {showWeight ? `${weightLabel(prevBest.weightKg)}×` : ""}
                {prevBest.reps}
                {isSec ? "秒" : ""}
              </span>
              {prevBest.e1rm != null && (
                <>
                  ・e1RM <span className="num text-sm font-semibold">{fmt(prevBest.e1rm)}</span>
                </>
              )}
              {prev.allTimeBestE1rm != null && (
                <span className="text-dim">（紀錄 {fmt(prev.allTimeBestE1rm)}）</span>
              )}
            </div>
          ) : (
            <div className="mt-1 text-xs text-dim">第一次做這個動作</div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="press -mr-2 flex size-10 items-center justify-center rounded-lg text-dim" aria-label="更多">
              <MoreHorizontal className="size-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onReplace}>
              <Repeat className="size-4" /> 換動作
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveUp} onClick={() => onMove(-1)}>
              <ArrowUp className="size-4" /> 往上移
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveDown} onClick={() => onMove(1)}>
              <ArrowDown className="size-4" /> 往下移
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              <Trash2 className="size-4" /> 刪除這個動作
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 pl-5 text-sm">
        <QuickBtn onClick={copyLast} disabled={!prev}>照上次</QuickBtn>
        {showWeight && <QuickBtn onClick={() => shiftAll(step)}>全部 +{fmt(step)}</QuickBtn>}
        {showWeight && <QuickBtn onClick={() => shiftAll(-step)}>全部 −{fmt(step)}</QuickBtn>}
        <QuickBtn onClick={addSet}>+1 組</QuickBtn>
        <QuickBtn onClick={removeSet} disabled={!item.sets.length}>−1 組</QuickBtn>
      </div>

      <ol className="space-y-2 px-3 pb-3 pl-4">
        {item.sets.map((s, i) => (
          <li
            key={s.id}
            className={cn(
              "rounded-lg border p-2 transition-colors",
              s.done ? "border-brand/40 bg-brand/5" : "border-line bg-background/40"
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn("num w-6 text-center text-lg", s.isWarmup ? "text-warn" : "text-dim")}>
                {s.isWarmup ? "熱" : i + 1}
              </span>
              {showWeight && (
                <Pick
                  className="flex-[1.3]"
                  value={s.weightKg}
                  options={numOptions(withValue(weightValues, s.weightKg), weightLabel)}
                  onChange={v => updateSet(s.id, { weightKg: v })}
                  suffix={ex?.bwFactor && !ex.assisted && s.weightKg === 0 ? undefined : "kg"}
                  ariaLabel="重量"
                />
              )}
              <span className="text-dim">×</span>
              <Pick
                className="flex-1"
                value={s.reps}
                options={numOptions(withValue(repValues, s.reps))}
                onChange={v => updateSet(s.id, { reps: v })}
                suffix={isSec ? "秒" : "下"}
                ariaLabel={isSec ? "秒數" : "次數"}
              />
              <button
                type="button"
                onClick={() => updateSet(s.id, { done: !s.done })}
                className={cn(
                  "press flex size-11 shrink-0 items-center justify-center rounded-full border-2",
                  s.done ? "border-brand bg-brand text-brand-ink" : "border-input text-dim"
                )}
                aria-label={s.done ? "取消完成" : "完成這組"}
              >
                <Check className="size-6" strokeWidth={3} />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1 pl-8">
              <span className="mr-1 text-xs text-dim">RPE</span>
              {RPES.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => updateSet(s.id, { rpe: s.rpe === r ? null : r })}
                  className={cn(
                    "press num h-9 w-9 rounded-md border text-base",
                    s.rpe === r ? "border-chalk bg-chalk text-brand-ink" : "border-line text-dim"
                  )}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                onClick={() => updateSet(s.id, { isWarmup: !s.isWarmup })}
                className={cn(
                  "press ml-auto h-9 rounded-md border px-2 text-xs",
                  s.isWarmup ? "border-warn bg-warn/15 text-warn" : "border-line text-dim"
                )}
              >
                熱身
              </button>
            </div>
          </li>
        ))}
        {item.sets.length === 0 && <li className="py-3 text-center text-sm text-dim">還沒有組數，按「+1 組」</li>}
      </ol>
    </article>
  );
}

function QuickBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="press h-9 shrink-0 rounded-md border border-line bg-surface-2 px-3 text-chalk disabled:opacity-40"
    >
      {children}
    </button>
  );
}
