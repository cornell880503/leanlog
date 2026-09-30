import { AppShell } from "@/components/app/AppShell";
import { Card, CardTitle } from "@/components/app/controls";
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
import { SRPE_HINT, SessionMetaFields } from "@/components/workout/SessionMeta";
import { WorkoutEditor, draftToSets, setsToDraftExercises } from "@/components/workout/WorkoutEditor";
import type { DraftExercise } from "@/lib/draft";
import { dateLabel, fmt, todayLocal } from "@/lib/format";
import { useExerciseLibrary } from "@/lib/library";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import { VolleyballForm, type VolleyballValues } from "@/pages/Volleyball";
import { usesWeight, type SessionType } from "@shared/exercises";
import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface Meta {
  date: string;
  durationMin: number;
  srpe: number | null;
  notes: string;
}

export default function HistoryDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const q = trpc.training.get.useQuery({ id }, { enabled: Number.isFinite(id), retry: false });
  const lib = useExerciseLibrary();
  const settings = trpc.settings.get.useQuery();
  const [editing, setEditing] = useState(false);
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [meta, setMeta] = useState<Meta>({ date: todayLocal(), durationMin: 60, srpe: null, notes: "" });
  const [vb, setVb] = useState<VolleyballValues | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const invalidate = () => {
    void utils.training.list.invalidate();
    void utils.training.get.invalidate({ id });
    void utils.dashboard.summary.invalidate();
    void utils.calendar.range.invalidate();
    void utils.training.context.invalidate();
  };
  const update = trpc.training.update.useMutation({
    onSuccess: () => {
      toast.success("已更新");
      setEditing(false);
      invalidate();
    },
    onError: () => toast.error("更新失敗，請再試一次"),
  });
  const del = trpc.training.delete.useMutation({
    onSuccess: () => {
      toast.success("已刪除");
      invalidate();
      navigate(s ? `/history?d=${s.date}` : "/history");
    },
    onError: () => toast.error("刪除失敗"),
  });

  const s = q.data?.session;
  const sType = (s?.type ?? "other") as SessionType;
  const summary = q.data?.summary;
  const today = todayLocal();

  const grouped = useMemo(() => (s ? setsToDraftExercises(s.sets) : []), [s]);

  const startEdit = () => {
    if (!s) return;
    if (sType === "volleyball") {
      setVb({
        date: s.date,
        vbKind: s.vbKind ?? "練習",
        durationMin: s.durationMin ?? 120,
        srpe: s.srpe ?? 6,
        jumps: s.jumps ?? 80,
        kneeStatus: s.kneeStatus ?? "沒事",
      });
    } else {
      setExercises(setsToDraftExercises(s.sets));
      setMeta({ date: s.date, durationMin: s.durationMin ?? 60, srpe: s.srpe, notes: s.notes ?? "" });
    }
    setEditing(true);
  };

  const saveEdit = () => {
    if (!s) return;
    if (sType === "volleyball" && vb) {
      update.mutate({
        id,
        date: vb.date,
        type: "volleyball",
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMin: vb.durationMin,
        srpe: vb.srpe,
        jumps: vb.jumps,
        vbKind: vb.vbKind,
        kneeStatus: vb.kneeStatus,
        notes: s.notes,
        sets: [],
      });
      return;
    }
    const sets = draftToSets(exercises, true);
    if (!sets.length) {
      toast.error("至少要留一組；想整筆刪除請用垃圾桶");
      return;
    }
    update.mutate({
      id,
      date: meta.date,
      type: sType,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationMin: meta.durationMin,
      srpe: meta.srpe,
      jumps: s.jumps ?? 0,
      vbKind: null,
      kneeStatus: null,
      notes: meta.notes.trim() || null,
      sets,
    });
  };

  if (q.isError || !Number.isFinite(id)) {
    return (
      <AppShell title="找不到紀錄" back="/history">
        <p className="text-dim">這筆紀錄不存在或已被刪除。</p>
      </AppShell>
    );
  }

  if (!s || !summary) {
    return (
      <AppShell title="訓練" back="/history">
        <div className="h-64 animate-pulse rounded-xl bg-surface" />
      </AppShell>
    );
  }

  const title = `${TYPE_LABEL[sType]}・${dateLabel(s.date, today)}`;

  if (editing) {
    return (
      <AppShell
        title={`修改${TYPE_LABEL[sType]}`}
        back="/history"
        right={
          <button type="button" onClick={() => setEditing(false)} className="press -mr-2 h-11 rounded-lg px-3 text-dim">
            取消
          </button>
        }
        bottom={
          <button
            type="button"
            disabled={update.isPending}
            onClick={saveEdit}
            className="press h-14 w-full rounded-xl bg-brand text-lg font-semibold text-brand-ink disabled:opacity-50"
          >
            {update.isPending ? "儲存中…" : "儲存修改"}
          </button>
        }
      >
        {sType === "volleyball" && vb ? (
          <Card>
            <VolleyballForm value={vb} onChange={setVb} />
          </Card>
        ) : (
          <div className="space-y-4">
            <WorkoutEditor
              type={sType}
              exercises={exercises}
              onChange={setExercises}
              prev={{}}
              lookup={lib.lookup}
              all={lib.all}
              bodyweightKg={70}
              dumbbellStep={settings.data?.settings.dumbbellStep ?? 2}
            />
            <Card>
              <SessionMetaFields {...meta} onChange={patch => setMeta(m => ({ ...m, ...patch }))} />
            </Card>
            <p className="text-xs text-dim">修改模式下，所有列出來的組都會存（不看打勾）。</p>
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      title={title}
      back="/history"
      right={
        <div className="-mr-2 flex">
          <button type="button" onClick={startEdit} className="press flex size-11 items-center justify-center rounded-lg text-dim" aria-label="修改">
            <Pencil className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="press flex size-11 items-center justify-center rounded-lg text-dim"
            aria-label="刪除"
          >
            <Trash2 className="size-5" />
          </button>
        </div>
      }
    >
      <div className="space-y-4 fade-up">
        <Card className="relative overflow-hidden pl-5">
          <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: TYPE_COLOR[sType] }} />
          <div className="grid grid-cols-3 gap-2 text-center">
            <Big label="時長" value={s.durationMin != null ? String(s.durationMin) : "—"} unit="分" />
            <Big label="sRPE" value={s.srpe != null ? String(s.srpe) : "—"} unit={s.srpe ? SRPE_HINT[s.srpe] : ""} />
            {sType === "volleyball" ? (
              <Big label="跳躍" value={String(summary.totalJumps)} unit="下" />
            ) : (
              <Big label="容量" value={fmt(summary.volume, 0)} unit="kg" />
            )}
          </div>
          {sType === "volleyball" && (
            <p className="mt-3 text-center text-sm text-dim">
              {[s.vbKind, s.kneeStatus ? `膝蓋${s.kneeStatus}` : null].filter(Boolean).join("・")}
            </p>
          )}
          {s.notes && <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">{s.notes}</p>}
        </Card>

        {grouped.map((e, i) => {
          const ex = lib.lookup(e.exerciseKey);
          const es = summary.exercises.find(x => x.key === e.exerciseKey);
          const isSec = ex?.unit === "sec";
          const showW = ex ? usesWeight(ex) : true;
          return (
            <Card key={`${e.exerciseKey}-${i}`}>
              <CardTitle
                right={
                  es?.bestE1rm != null ? <span className="num text-sm text-dim">e1RM {fmt(es.bestE1rm)}</span> : undefined
                }
              >
                {ex?.name ?? "（已刪除的動作）"}
              </CardTitle>
              <ol className="space-y-1">
                {e.sets.map((set, j) => (
                  <li key={set.id} className="flex items-center gap-3 text-sm">
                    <span className={`num w-6 text-center ${set.isWarmup ? "text-warn" : "text-dim"}`}>{set.isWarmup ? "熱" : j + 1}</span>
                    <span className="num text-lg">
                      {showW &&
                        (ex?.assisted ? `輔助 ${fmt(set.weightKg)} kg × ` : ex?.bwFactor ? (set.weightKg ? `+${fmt(set.weightKg)} kg × ` : "自身 × ") : `${fmt(set.weightKg)} kg × `)}
                      {set.reps}
                      {isSec ? " 秒" : " 下"}
                    </span>
                    {set.rpe != null && <span className="text-dim">RPE {set.rpe}</span>}
                  </li>
                ))}
              </ol>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除這筆{TYPE_LABEL[sType]}？</AlertDialogTitle>
            <AlertDialogDescription>刪除後無法復原，週統計和趨勢也會重新計算。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-bad text-brand-ink hover:bg-bad/90" onClick={() => del.mutate({ id })}>
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function Big({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="num text-3xl font-semibold">
        {value}
        {unit && <span className="ml-0.5 text-xs font-sans text-dim">{unit}</span>}
      </div>
      <div className="text-xs text-dim">{label}</div>
    </div>
  );
}
