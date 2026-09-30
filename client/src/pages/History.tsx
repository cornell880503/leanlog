import { AppShell } from "@/components/app/AppShell";
import { Card, LoadError, Pick } from "@/components/app/controls";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDraftPeek, writeDraft } from "@/lib/draft";
import { dateLabel, fmt, isDateStr, mdw, monthLabel, shortDate, todayLocal, weekNumber, weekdayLabel } from "@/lib/format";
import { TYPE_COLOR, TYPE_LABEL, TYPE_SHORT } from "@/lib/theme";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { addDays, weekStart, type PlanDay } from "@shared/analytics";
import type { SessionType } from "@shared/exercises";
import { ChevronLeft, ChevronRight, Scale, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";

type View = "month" | "week" | "list";
type Range = RouterOutputs["calendar"]["range"];
type SessionItem = Range["sessions"][number];

const VIEWS: { value: View; label: string }[] = [
  { value: "month", label: "月" },
  { value: "week", label: "週" },
  { value: "list", label: "列表" },
];
const WD_HEAD = ["一", "二", "三", "四", "五", "六", "日"];
const BACKFILL: SessionType[] = ["leg", "back", "chest", "other", "volleyball"];

function monthOf(d: string): string {
  return d.slice(0, 7);
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

function sessionLine(s: SessionItem): string {
  if (s.type === "volleyball") {
    return [
      s.vbKind,
      s.durationMin ? `${s.durationMin} 分鐘` : null,
      `跳躍 ${s.summary.totalJumps}`,
      s.kneeStatus ? `膝蓋${s.kneeStatus}` : null,
    ]
      .filter(Boolean)
      .join("・");
  }
  return [
    `${s.exerciseCount} 個動作`,
    `${s.summary.hardSets} 有效組`,
    `${fmt(s.summary.volume, 0)} kg`,
    s.durationMin ? `${s.durationMin} 分` : null,
  ]
    .filter(Boolean)
    .join("・");
}

interface DayData {
  sessions: SessionItem[];
  weight: Range["weights"][number] | null;
  jumps: Range["jumps"];
  scans: Range["scans"];
}

function groupByDate(r: Range | undefined): Map<string, DayData> {
  const m = new Map<string, DayData>();
  if (!r) return m;
  const get = (d: string) => {
    let v = m.get(d);
    if (!v) {
      v = { sessions: [], weight: null, jumps: [], scans: [] };
      m.set(d, v);
    }
    return v;
  };
  for (const s of [...r.sessions].sort((a, b) => a.id - b.id)) get(s.date).sessions.push(s);
  for (const w of r.weights) get(w.date).weight = w;
  for (const j of r.jumps) get(j.date).jumps.push(j);
  for (const s of r.scans) get(s.date).scans.push(s);
  return m;
}

export default function History() {
  const today = todayLocal();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const rawView = params.get("view");
  const view: View = rawView === "week" || rawView === "list" ? rawView : "month";
  const rawD = params.get("d");
  const sel = isDateStr(rawD) ? rawD : today;

  const go = (v: View, d: string) => navigate(`/history?view=${v}&d=${d}`, { replace: true });

  const { from, to } = useMemo(() => {
    if (view === "week") {
      const ws = weekStart(sel);
      return { from: ws, to: addDays(ws, 6) };
    }
    const gridStart = weekStart(`${monthOf(sel)}-01`);
    return { from: gridStart, to: addDays(gridStart, 41) };
  }, [view, sel]);

  const cal = trpc.calendar.range.useQuery(
    { from, to },
    { enabled: view !== "list", placeholderData: prev => prev }
  );
  const summary = trpc.dashboard.summary.useQuery({ today });
  const byDate = useMemo(() => groupByDate(cal.data), [cal.data]);
  const plan = useMemo(() => {
    const m = new Map<string, PlanDay>();
    for (const p of summary.data?.upcoming ?? []) if (p.date > today) m.set(p.date, p);
    return m;
  }, [summary.data, today]);

  return (
    <AppShell title="日曆">
      <div className="space-y-4 fade-up">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
          {VIEWS.map(v => (
            <button
              key={v.value}
              type="button"
              onClick={() => go(v.value, sel)}
              className={cn(
                "press h-10 rounded-lg text-sm font-semibold",
                view === v.value ? "bg-brand text-brand-ink" : "text-dim"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        {view === "list" ? (
          <ListView today={today} />
        ) : (
          <>
            {view === "month" ? (
              <MonthView
                sel={sel}
                today={today}
                byDate={byDate}
                plan={plan}
                firstSessionDate={cal.data?.firstSessionDate ?? null}
                loading={cal.isLoading}
                onSelect={d => go("month", d)}
              />
            ) : (
              <WeekView sel={sel} today={today} byDate={byDate} plan={plan} onSelect={d => go("week", d)} />
            )}
            {cal.isError && <LoadError what="日曆" onRetry={() => void cal.refetch()} />}
            <DayDetail date={sel} today={today} data={byDate.get(sel)} plan={plan.get(sel)} loading={cal.isLoading} />
          </>
        )}
      </div>
    </AppShell>
  );
}

// ───────────────────────── month ─────────────────────────

function MonthView({
  sel,
  today,
  byDate,
  plan,
  firstSessionDate,
  loading,
  onSelect,
}: {
  sel: string;
  today: string;
  byDate: Map<string, DayData>;
  plan: Map<string, PlanDay>;
  firstSessionDate: string | null;
  loading: boolean;
  onSelect: (d: string) => void;
}) {
  const ym = monthOf(sel);
  const gridStart = weekStart(`${ym}-01`);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthOptions = useMemo(() => {
    const cur = monthOf(today);
    const out: { value: string; label: string }[] = [];
    for (let i = 1; i >= -24; i--) out.push({ value: addMonths(cur, i), label: monthLabel(addMonths(cur, i)) });
    if (!out.some(o => o.value === ym)) out.push({ value: ym, label: monthLabel(ym) });
    return out;
  }, [today, ym]);

  // Monthly summary (only days of this month).
  const inMonth = days.filter(d => monthOf(d) === ym);
  let strength = 0;
  let vb = 0;
  let trainedDays = 0;
  let restDays = 0;
  const countFrom = firstSessionDate ?? today;
  for (const d of inMonth) {
    const ss = byDate.get(d)?.sessions ?? [];
    strength += ss.filter(s => s.type !== "volleyball").length;
    vb += ss.filter(s => s.type === "volleyball").length;
    if (ss.length) trainedDays++;
    else if (d <= today && d >= countFrom) restDays++;
  }

  const jump = (ymNext: string) => {
    const day = Math.min(Number(sel.slice(8, 10)), 28);
    const target = monthOf(today) === ymNext ? today : `${ymNext}-${String(day).padStart(2, "0")}`;
    onSelect(target);
  };

  return (
    <Card className="p-3">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => jump(addMonths(ym, -1))}
          className="press flex size-11 items-center justify-center rounded-lg bg-surface-2"
          aria-label="上個月"
        >
          <ChevronLeft className="size-5" />
        </button>
        <Pick value={ym} options={monthOptions} onChange={v => jump(v)} className="flex-1" ariaLabel="選月份" />
        <button
          type="button"
          onClick={() => jump(addMonths(ym, 1))}
          className="press flex size-11 items-center justify-center rounded-lg bg-surface-2"
          aria-label="下個月"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      {sel !== today && (
        <button type="button" onClick={() => onSelect(today)} className="press mb-2 w-full rounded-lg border border-brand py-2 text-sm font-semibold text-brand">
          回到今天（{mdw(today)}）
        </button>
      )}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-dim">
        {WD_HEAD.map(w => (
          <div key={w} className={cn("pb-1", (w === "六" || w === "日") && "text-chalk/70")}>
            {w}
          </div>
        ))}
      </div>
      <div className={cn("grid grid-cols-7 gap-1", loading && "opacity-60")}>
        {days.map(d => {
          const data = byDate.get(d);
          const other = monthOf(d) !== ym;
          const isToday = d === today;
          const isSel = d === sel;
          const future = d > today;
          const p = plan.get(d);
          const types = data ? Array.from(new Set(data.sessions.map(s => s.type))) : [];
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              className={cn(
                "press relative flex h-16 flex-col items-stretch rounded-md border p-0.5 text-left",
                isSel ? "border-brand bg-brand/10" : "border-transparent bg-surface-2/60",
                isToday && !isSel && "border-chalk/60",
                other && "opacity-35"
              )}
              aria-label={mdw(d)}
            >
              <span className={cn("num px-0.5 text-xs", isToday ? "font-bold text-brand" : future ? "text-dim" : "text-chalk")}>
                {Number(d.slice(8, 10))}
              </span>
              <span className="mt-0.5 flex flex-1 flex-col gap-0.5">
                {types.slice(0, 2).map(t => (
                  <span
                    key={t}
                    className="flex h-4 items-center justify-center rounded-sm text-[10px] font-bold text-brand-ink"
                    style={{ background: TYPE_COLOR[t] }}
                  >
                    {TYPE_SHORT[t]}
                  </span>
                ))}
                {types.length === 0 && p && p.type !== "rest" && (
                  <span
                    className="flex h-4 items-center justify-center rounded-sm border border-dashed text-[10px]"
                    style={{ borderColor: TYPE_COLOR[p.type], color: TYPE_COLOR[p.type] }}
                  >
                    {TYPE_SHORT[p.type]}
                  </span>
                )}
              </span>
              {data && (data.weight || data.jumps.length > 0 || data.scans.length > 0) && (
                <span className="absolute right-1 top-1 flex gap-0.5">
                  {data.weight && <span className="size-1.5 rounded-full bg-chalk/80" />}
                  {data.jumps.length > 0 && <span className="size-1.5 rounded-full bg-brand" />}
                  {data.scans.length > 0 && <span className="size-1.5 rounded-full bg-back" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-dim">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-chalk/80" />體重
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-brand" />摸高
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-back" />掃描
        </span>
        <span>虛線＝照循環預排</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1 text-center">
        <MonthStat label="重訓" value={strength} unit="次" />
        <MonthStat label="排球" value={vb} unit="次" />
        <MonthStat label="有練" value={trainedDays} unit="天" />
        <MonthStat label="休息" value={restDays} unit="天" />
      </div>
    </Card>
  );
}

function MonthStat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-lg bg-surface-2 py-1.5">
      <div className="num text-lg font-semibold">
        {value}
        <span className="ml-0.5 text-[11px] font-sans text-dim">{unit}</span>
      </div>
      <div className="text-[11px] text-dim">{label}</div>
    </div>
  );
}

// ───────────────────────── week ─────────────────────────

function WeekView({
  sel,
  today,
  byDate,
  plan,
  onSelect,
}: {
  sel: string;
  today: string;
  byDate: Map<string, DayData>;
  plan: Map<string, PlanDay>;
  onSelect: (d: string) => void;
}) {
  const ws = weekStart(sel);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const thisWeek = weekStart(today) === ws;
  let strength = 0;
  let vb = 0;
  let hardSets = 0;
  let volume = 0;
  let minutes = 0;
  for (const d of days) {
    for (const s of byDate.get(d)?.sessions ?? []) {
      if (s.type === "volleyball") vb++;
      else strength++;
      hardSets += s.summary.hardSets;
      volume += s.summary.volume;
      minutes += s.durationMin ?? 0;
    }
  }
  const shift = (n: number) => onSelect(addDays(sel, n * 7));

  return (
    <Card className="p-3">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="press flex size-11 items-center justify-center rounded-lg bg-surface-2"
          aria-label="上一週"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex-1 text-center">
          <div className="font-semibold">
            {shortDate(ws)} – {shortDate(addDays(ws, 6))}
          </div>
          <div className="text-xs text-dim">
            第 {weekNumber(ws)} 週{thisWeek ? "・本週" : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          className="press flex size-11 items-center justify-center rounded-lg bg-surface-2"
          aria-label="下一週"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      {!thisWeek && (
        <button type="button" onClick={() => onSelect(today)} className="press mb-2 w-full rounded-lg border border-brand py-2 text-sm font-semibold text-brand">
          回到本週
        </button>
      )}
      <ul className="space-y-1.5">
        {days.map(d => {
          const data = byDate.get(d);
          const p = plan.get(d);
          const isToday = d === today;
          return (
            <li key={d}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                className={cn(
                  "press flex w-full items-start gap-3 rounded-lg border p-2.5 text-left",
                  d === sel ? "border-brand bg-brand/10" : "border-line bg-surface-2/60"
                )}
              >
                <div className={cn("w-12 shrink-0", isToday ? "text-brand" : "text-dim")}>
                  <div className="text-xs">{isToday ? "今天" : weekdayLabel(d)}</div>
                  <div className="num text-lg font-semibold leading-tight">{shortDate(d)}</div>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  {data?.sessions.length ? (
                    data.sessions.map(s => (
                      <div key={s.id} className="text-sm">
                        <span className="font-semibold" style={{ color: TYPE_COLOR[s.type] }}>
                          {TYPE_LABEL[s.type]}
                        </span>
                        <span className="ml-1.5 text-xs text-dim">{sessionLine(s)}</span>
                      </div>
                    ))
                  ) : d > today ? (
                    <div className="text-sm text-dim">
                      {p ? (p.type === "rest" ? "預計休息" : `預計${TYPE_LABEL[p.type]}`) : "—"}
                      {p?.maybeVolleyball && "・可能打球"}
                    </div>
                  ) : (
                    <div className="text-sm text-dim">休息</div>
                  )}
                  {data?.weight && <div className="text-xs text-dim">體重 {fmt(data.weight.weightKg)} kg</div>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 grid grid-cols-4 gap-1 text-center">
        <MonthStat label="重訓" value={strength} unit="次" />
        <MonthStat label="排球" value={vb} unit="次" />
        <MonthStat label="有效組" value={hardSets} unit="組" />
        <MonthStat label="時長" value={minutes} unit="分" />
      </div>
      <p className="mt-2 text-center text-xs text-dim">總容量 {fmt(volume, 0)} kg</p>
    </Card>
  );
}

// ───────────────────────── day detail ─────────────────────────

function DayDetail({
  date,
  today,
  data,
  plan,
  loading,
}: {
  date: string;
  today: string;
  data: DayData | undefined;
  plan: PlanDay | undefined;
  loading: boolean;
}) {
  const [, navigate] = useLocation();
  const draft = useDraftPeek();
  const [confirm, setConfirm] = useState<SessionType | null>(null);
  const future = date > today;

  const startBackfill = (t: SessionType, force = false) => {
    if (t === "volleyball") {
      navigate(`/volleyball?date=${date}`);
      return;
    }
    if (draft && !force) {
      setConfirm(t);
      return;
    }
    navigate(`/workout/${t}?date=${date}`);
  };

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{mdw(date)}</h2>
        <span className="text-sm text-dim">{dateLabel(date, today) === mdw(date) ? "" : dateLabel(date, today)}</span>
      </div>

      {loading && !data ? (
        <div className="mt-3 h-16 animate-pulse rounded bg-surface-2" />
      ) : (
        <div className="mt-3 space-y-2">
          {data?.sessions.map(s => (
            <Link
              key={s.id}
              href={`/history/${s.id}`}
              className="press relative flex items-center gap-3 overflow-hidden rounded-lg bg-surface-2 p-3 pl-4"
            >
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: TYPE_COLOR[s.type] }} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{TYPE_LABEL[s.type]}</div>
                <div className="truncate text-sm text-dim">{sessionLine(s)}</div>
              </div>
              {s.srpe != null && <span className="num text-sm text-dim">sRPE {s.srpe}</span>}
              <ChevronRight className="size-5 text-dim" />
            </Link>
          ))}
          {data?.weight && (
            <div className="flex items-center gap-2 rounded-lg bg-surface-2 p-3 text-sm">
              <Scale className="size-4 text-dim" />
              體重 <span className="num font-semibold">{fmt(data.weight.weightKg)} kg</span>
              {data.weight.fasted && <span className="text-dim">（空腹）</span>}
            </div>
          )}
          {data?.jumps.map(j => (
            <div key={j.id} className="flex items-center gap-2 rounded-lg bg-surface-2 p-3 text-sm">
              <Target className="size-4 text-brand" />
              助跑摸高 <span className="num font-semibold">{j.approachReachCm} cm</span>
            </div>
          ))}
          {data?.scans.map(sc => (
            <Link key={sc.id} href="/body" className="press flex items-center gap-2 rounded-lg bg-surface-2 p-3 text-sm">
              <span className="size-2 rounded-full bg-back" />
              Boditrax 掃描・體重 {fmt(sc.weightKg)}・體脂 {fmt((sc.fatMassKg / sc.weightKg) * 100)}%
            </Link>
          ))}
          {!data?.sessions.length && !data?.weight && !data?.jumps.length && !data?.scans.length && (
            <p className="text-sm text-dim">
              {future
                ? plan
                  ? `預計：${plan.type === "rest" ? "休息" : TYPE_LABEL[plan.type]}${plan.maybeVolleyball ? "（週末，可能打球）" : ""}`
                  : "還沒到"
                : "這天沒有紀錄（休息）"}
            </p>
          )}
        </div>
      )}

      {!future && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="mb-2 text-sm text-dim">{date === today ? "記錄今天" : `補記 ${shortDate(date)}`}</div>
          <div className="grid grid-cols-5 gap-1.5">
            {BACKFILL.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => startBackfill(t)}
                className="press flex h-11 items-center justify-center rounded-lg border text-sm font-semibold"
                style={{ borderColor: TYPE_COLOR[t], color: TYPE_COLOR[t] }}
              >
                {TYPE_SHORT[t] === "他" ? "其他" : TYPE_LABEL[t].replace("日", "")}
              </button>
            ))}
          </div>
          <Link
            href={`/body?date=${date}`}
            className="press mt-1.5 flex h-11 items-center justify-center gap-2 rounded-lg border border-line text-sm"
          >
            <Scale className="size-4" /> 體重／摸高
          </Link>
        </div>
      )}

      <AlertDialog open={confirm != null} onOpenChange={o => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>還有一個進行中的{draft ? TYPE_LABEL[draft.type] : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              要先繼續它，還是捨棄後補記 {shortDate(date)} 的{confirm ? TYPE_LABEL[confirm] : ""}？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <button
              type="button"
              className="press h-12 rounded-lg bg-brand font-semibold text-brand-ink"
              onClick={() => {
                const t = draft?.type;
                setConfirm(null);
                if (t) navigate(`/workout/${t}`);
              }}
            >
              繼續進行中的{draft ? TYPE_LABEL[draft.type] : ""}
            </button>
            <button
              type="button"
              className="press h-12 rounded-lg border border-bad font-semibold text-bad"
              onClick={() => {
                const t = confirm;
                writeDraft(null);
                setConfirm(null);
                if (t) startBackfill(t, true);
              }}
            >
              捨棄並補記
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ───────────────────────── list ─────────────────────────

function ListView({ today }: { today: string }) {
  const list = trpc.training.list.useQuery({ limit: 200 });
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof list.data>>();
    for (const s of list.data ?? []) {
      const k = s.date.slice(0, 7);
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    return Array.from(m.entries());
  }, [list.data]);

  if (list.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    );
  }
  if (list.isError) return <LoadError what="歷史紀錄" onRetry={() => void list.refetch()} />;
  if (groups.length === 0) {
    return (
      <div className="card-iron p-6 text-center">
        <p className="font-medium">還沒有任何訓練紀錄</p>
        <p className="mt-1 text-sm text-dim">回到「今天」點一下訓練日就能開始。</p>
        <Link href="/" className="press mt-4 inline-flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-brand-ink">
          去今天
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {groups.map(([month, items]) => (
        <section key={month}>
          <h2 className="mb-2 text-sm text-dim">
            {monthLabel(month)}・{items.length} 次
          </h2>
          <ul className="space-y-2">
            {items.map(s => (
              <li key={s.id}>
                <Link href={`/history/${s.id}`} className="press card-iron relative flex items-center gap-3 overflow-hidden p-4 pl-5">
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: TYPE_COLOR[s.type] }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold">{TYPE_LABEL[s.type]}</span>
                      <span className="text-sm text-dim">{dateLabel(s.date, today)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm text-dim">{sessionLine(s)}</div>
                  </div>
                  {s.srpe != null && <span className="num rounded bg-surface-2 px-2 py-0.5 text-sm text-dim">sRPE {s.srpe}</span>}
                  <ChevronRight className="size-5 text-dim" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
