import { AppShell } from "@/components/app/AppShell";
import { Card } from "@/components/app/controls";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { SessionMetaFields, SummaryView, type ExerciseCompare } from "@/components/workout/SessionMeta";
import { WorkoutEditor, draftToSets } from "@/components/workout/WorkoutEditor";
import { useDraft, type WorkoutDraft } from "@/lib/draft";
import { dateLabel, mdw, todayLocal, uid, usePastDateParam } from "@/lib/format";
import { useExerciseLibrary } from "@/lib/library";
import { TYPE_LABEL } from "@/lib/theme";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { setVolume, type PrRecord, type SessionSummary } from "@shared/analytics";
import type { SessionType } from "@shared/exercises";
import { CalendarDays, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

const WORKOUT_TYPES = ["leg", "back", "chest", "other"] as const;

type Ctx = RouterOutputs["training"]["context"];

/** Exercises and sets pre-filled from the template in a workout context. */
function templateExercises(c: Ctx): WorkoutDraft["exercises"] {
  return (c.template?.exercises ?? []).map(e => ({
    id: uid(),
    exerciseKey: e.exerciseKey,
    sets: e.sets.map(s => ({ id: uid(), weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, isWarmup: s.isWarmup, done: false })),
  }));
}

function autoDuration(startedAt: number): number {
  const min = Math.round((Date.now() - startedAt) / 60000 / 5) * 5;
  return Math.max(10, Math.min(240, min));
}

export default function Workout({ params }: { params: { type: string } }) {
  const type = (WORKOUT_TYPES as readonly string[]).includes(params.type) ? (params.type as SessionType) : null;
  const [, navigate] = useLocation();
  const [draft, setDraft] = useDraft();
  const today = todayLocal();
  // ?date=YYYY-MM-DD from the calendar's back-fill buttons.
  const dateParam = usePastDateParam();
  const recordDate = draft?.date ?? dateParam ?? today;
  const lib = useExerciseLibrary();
  const settings = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();
  const needContext = !!type && (!draft || draft.type !== type);
  const context = trpc.training.context.useQuery(
    { type: type ?? "other", today: dateParam ?? today },
    { enabled: needContext && !draft, staleTime: 0 }
  );
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [includeUndone, setIncludeUndone] = useState(false);
  const [result, setResult] = useState<{
    summary: SessionSummary;
    prs: PrRecord[];
    compare: ExerciseCompare[];
    id: number;
  } | null>(null);

  // Build a fresh draft from the previous workout of this type.
  useEffect(() => {
    if (!type || draft || result || !context.data) return;
    const c = context.data;
    const exercises = templateExercises(c);
    const next: WorkoutDraft = {
      clientId: uid(),
      type,
      startedAt: Date.now(),
      exercises,
      prev: c.lastPerf,
      bodyweightKg: c.bodyweightKg,
      templateDate: c.template?.date ?? null,
      date: dateParam ?? today,
      goals: c.goals,
    };
    setDraft(next);
  }, [type, draft, result, context.data, setDraft]);

  const create = trpc.training.create.useMutation();
  const [rebasing, setRebasing] = useState(false);

  /**
   * Move the draft to another date and reload everything that depends on it
   * ("last time", bodyweight, strength hints) as of that date. The exercise list
   * is replaced by that date's template only when nothing has been ticked yet
   * and the caller allows it.
   */
  const rebaseDate = async (d: string, opts: { keepExercises: boolean }) => {
    if (!draft) return;
    setRebasing(true);
    try {
      const c = await utils.training.context.fetch({ type: draft.type, today: d });
      const anyDone = draft.exercises.some(e => e.sets.some(st => st.done));
      const replaced = !opts.keepExercises && !anyDone;
      setDraft(x => {
        if (!x) return x;
        const base: WorkoutDraft = {
          ...x,
          date: d,
          prev: c.lastPerf,
          bodyweightKg: c.bodyweightKg,
          goals: c.goals,
          finishing: x.finishing ? { ...x.finishing, date: d } : undefined,
        };
        if (!replaced || x.exercises.some(e => e.sets.some(st => st.done))) return base;
        return { ...base, exercises: templateExercises(c), templateDate: c.template?.date ?? null };
      });
      toast.success(
        replaced
          ? `已改記到 ${mdw(d)}，並帶入那天之前最近一次的動作`
          : `已改記到 ${mdw(d)}（保留目前的動作，上次紀錄與目標改用那天之前的）`
      );
    } catch {
      toast.error("讀取那天之前的紀錄失敗，日期沒有改");
    } finally {
      setRebasing(false);
    }
  };

  const doneCount = draft ? draft.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0) : 0;
  const totalCount = draft ? draft.exercises.reduce((a, e) => a + e.sets.length, 0) : 0;

  const openFinish = () => {
    if (!draft) return;
    if (!draft.finishing) {
      setDraft({
        ...draft,
        finishing: {
          date: draft.date ?? today,
          // Back-filled workouts didn't just happen, so the elapsed time is meaningless.
          durationMin: draft.date && draft.date !== today ? 60 : autoDuration(draft.startedAt),
          srpe: null,
          notes: "",
        },
      });
    }
    setIncludeUndone(doneCount === 0);
    setFinishOpen(true);
  };

  const save = async () => {
    if (!draft || !draft.finishing) return;
    const sets = draftToSets(draft.exercises, includeUndone);
    if (!sets.length) {
      toast.error("沒有任何一組可以儲存");
      return;
    }
    const f = draft.finishing;
    try {
      const res = await create.mutateAsync({
        clientId: draft.clientId,
        date: f.date,
        type: draft.type,
        startedAt: draft.startedAt,
        endedAt: Date.now(),
        durationMin: f.durationMin,
        srpe: f.srpe,
        jumps: 0,
        vbKind: null,
        kneeStatus: null,
        notes: f.notes.trim() || null,
        sets,
      });
      const compare: ExerciseCompare[] = res.summary.exercises.map(e => {
        const p = draft.prev[e.key];
        const ex = lib.lookup(e.key);
        const prevVolume =
          p && ex
            ? p.sets
                .filter(s => !s.isWarmup)
                .reduce((a, s) => a + setVolume(ex, { ...s, exerciseKey: e.key, bodyweightKg: draft.bodyweightKg }, draft.bodyweightKg), 0)
            : null;
        return {
          key: e.key,
          name: e.name,
          volume: e.volume,
          prevVolume,
          bestE1rm: e.bestE1rm,
          prevE1rm: p?.bestE1rm ?? null,
        };
      });
      setResult({ summary: res.summary, prs: res.prs, compare, id: res.id });
      setFinishOpen(false);
      setDraft(null);
      void utils.dashboard.summary.invalidate();
      void utils.calendar.range.invalidate();
      void utils.training.list.invalidate();
      void utils.training.context.invalidate();
      toast.success(res.duplicate ? "這次訓練之前已經存過了" : "已儲存");
    } catch (e) {
      toast.error("上傳失敗，資料還在手機上，網路恢復後按「重試」", { duration: 6000 });
      console.error(e);
    }
  };

  const title = type ? TYPE_LABEL[type] : "重訓";

  if (!type) {
    return (
      <AppShell title="找不到" back="/">
        <p className="text-dim">沒有這種訓練類型。</p>
      </AppShell>
    );
  }

  if (result) {
    return (
      <AppShell
        title={`${title}完成`}
        hideNav
        bottom={
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/history/${result.id}`} className="press flex h-14 items-center justify-center rounded-xl border border-line font-semibold">
              看詳細
            </Link>
            <Link href="/" className="press flex h-14 items-center justify-center rounded-xl bg-brand font-semibold text-brand-ink">
              回到今天
            </Link>
          </div>
        }
      >
        <SummaryView
          summary={result.summary}
          prs={result.prs}
          compare={result.compare}
          targets={settings.data?.settings.weeklySetTargets ?? {}}
        />
      </AppShell>
    );
  }

  if (draft && draft.type !== type) {
    return (
      <AppShell title={title} back="/">
        <Card>
          <p className="font-semibold">還有一個進行中的{TYPE_LABEL[draft.type]}</p>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              className="press h-12 rounded-lg bg-brand font-semibold text-brand-ink"
              onClick={() => navigate(`/workout/${draft.type}`)}
            >
              繼續{TYPE_LABEL[draft.type]}
            </button>
            <button type="button" className="press h-12 rounded-lg border border-bad font-semibold text-bad" onClick={() => setDraft(null)}>
              捨棄並開始{title}
            </button>
          </div>
        </Card>
      </AppShell>
    );
  }

  if (draft && dateParam && (draft.date ?? today) !== dateParam) {
    return (
      <AppShell title={title} back="/">
        <Card>
          <p className="font-semibold">
            還有一個進行中的{TYPE_LABEL[draft.type]}（記在 {mdw(draft.date ?? today)}）
          </p>
          <p className="mt-1 text-sm text-dim">你要補記的是 {mdw(dateParam)}。</p>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              className="press h-12 rounded-lg bg-brand font-semibold text-brand-ink"
              onClick={() => navigate(`/workout/${draft.type}`, { replace: true })}
            >
              繼續進行中的那次
            </button>
            <button
              type="button"
              className="press h-12 rounded-lg border border-line font-semibold"
              disabled={rebasing}
              onClick={() => void rebaseDate(dateParam, { keepExercises: true })}
            >
              把進行中的改記到 {mdw(dateParam)}
            </button>
            <button type="button" className="press h-12 rounded-lg border border-bad font-semibold text-bad" onClick={() => setDraft(null)}>
              捨棄那次，重新補記 {mdw(dateParam)}
            </button>
          </div>
        </Card>
      </AppShell>
    );
  }

  const finishing = draft?.finishing;

  return (
    <AppShell
      title={title}
      back="/"
      right={
        draft ? (
          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            className="press -mr-2 flex size-11 items-center justify-center rounded-lg text-dim"
            aria-label="捨棄這次訓練"
          >
            <Trash2 className="size-5" />
          </button>
        ) : undefined
      }
      bottom={
        draft ? (
          <button
            type="button"
            onClick={openFinish}
            disabled={totalCount === 0}
            className="press flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand text-lg font-semibold text-brand-ink disabled:opacity-40"
          >
            {finishing ? "重試上傳" : "結束訓練"}
            <span className="num text-base font-normal">
              {doneCount}/{totalCount} 組
            </span>
          </button>
        ) : undefined
      }
    >
      {!draft ? (
        <div className="space-y-3">
          {context.isError ? (
            <Card>
              <p className="text-bad">讀取上次紀錄失敗。</p>
              <button type="button" className="press mt-3 h-11 rounded-lg border border-line px-4" onClick={() => context.refetch()}>
                重試
              </button>
            </Card>
          ) : (
            [0, 1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-xl bg-surface" />)
          )}
        </div>
      ) : (
        <>
          <RecordDateBar
            date={recordDate}
            today={today}
            busy={rebasing}
            onChange={d => void rebaseDate(d, { keepExercises: false })}
          />
          <p className="mb-3 text-sm text-dim">
            {draft.templateDate
              ? `已帶入上次${title}（${draft.templateDate.slice(5).replace("-", "/")}）的動作與重量，做完一組就打勾。`
              : "第一次記錄這個訓練日，先新增動作。之後會自動帶入。"}
          </p>
          <WorkoutEditor
            type={draft.type}
            exercises={draft.exercises}
            onChange={exercises => setDraft(d => (d ? { ...d, exercises } : d))}
            prev={draft.prev}
            lookup={lib.lookup}
            all={lib.all}
            bodyweightKg={draft.bodyweightKg}
            dumbbellStep={settings.data?.settings.dumbbellStep ?? 2}
            goals={draft.goals ?? {}}
          />
        </>
      )}

      <Sheet open={finishOpen} onOpenChange={setFinishOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto border-line bg-background px-4 pb-8">
          <SheetHeader className="px-0">
            <SheetTitle>結束{title}</SheetTitle>
          </SheetHeader>
          {draft && finishing && (
            <div className="space-y-4">
              <SessionMetaFields
                date={finishing.date}
                durationMin={finishing.durationMin}
                srpe={finishing.srpe}
                notes={finishing.notes}
                onChange={patch => {
                  const { date: newDate, ...rest } = patch;
                  if (Object.keys(rest).length)
                    setDraft(d => (d && d.finishing ? { ...d, finishing: { ...d.finishing, ...rest } } : d));
                  if (newDate && newDate !== draft.finishing?.date) void rebaseDate(newDate, { keepExercises: true });
                }}
              />
              {doneCount < totalCount && (
                <label className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 p-3">
                  <span className="text-sm">
                    還有 {totalCount - doneCount} 組沒打勾，
                    {includeUndone ? "也一起存" : "不會存"}
                  </span>
                  <Switch checked={includeUndone} onCheckedChange={setIncludeUndone} />
                </label>
              )}
              <button
                type="button"
                onClick={save}
                disabled={create.isPending}
                className="press h-14 w-full rounded-xl bg-brand text-lg font-semibold text-brand-ink disabled:opacity-50"
              >
                {create.isPending ? "儲存中…" : finishing.srpe == null ? "儲存（沒填 sRPE）" : "儲存"}
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>捨棄這次訓練？</AlertDialogTitle>
            <AlertDialogDescription>還沒儲存的組數會全部刪除，無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-bad text-brand-ink hover:bg-bad/90"
              onClick={() => {
                setDraft(null);
                navigate("/");
              }}
            >
              捨棄
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}


/** Which day this workout is recorded for; tap to change (today or earlier). */
function RecordDateBar({
  date,
  today,
  busy,
  onChange,
}: {
  date: string;
  today: string;
  busy: boolean;
  onChange: (d: string) => void;
}) {
  const back = date !== today;
  return (
    <label
      className={cn(
        "press relative mb-3 flex h-11 items-center gap-2 rounded-lg border px-3 text-sm",
        back ? "border-warn bg-warn/10 text-warn" : "border-line bg-surface text-chalk"
      )}
    >
      <CalendarDays className="size-4 shrink-0" />
      <span className="flex-1">
        記錄日期：<span className="font-semibold">{mdw(date)}</span>
        {back ? `・補記（${dateLabel(date, today)}）` : "・今天"}
      </span>
      <span className="text-xs text-dim">{busy ? "更新中…" : "點此修改"}</span>
      <input
        type="date"
        disabled={busy}
        aria-label="記錄日期"
        className="absolute inset-0 h-full w-full opacity-0"
        value={date}
        max={today}
        onChange={e => {
          const v = e.target.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= today) onChange(v);
        }}
      />
    </label>
  );
}
