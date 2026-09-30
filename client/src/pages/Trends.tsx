import { AppShell } from "@/components/app/AppShell";
import { Card, CardTitle, Chips, LoadError, Stat } from "@/components/app/controls";
import { fmt, monthLabel, shortDate, todayLocal } from "@/lib/format";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/theme";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { SessionType } from "@shared/exercises";
import {
  compareLastComplete,
  growth,
  pctChange,
  TREND_TYPES,
  type TrendBucket,
  type TrendPeriod,
} from "@shared/trends";
import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Link, useLocation, useSearch } from "wouter";

type Series = RouterOutputs["trends"]["series"];

const AXIS = { stroke: "#30353d", tick: { fill: "#8a9099", fontSize: 12 } };
const TOOLTIP = {
  contentStyle: { background: "#1c2025", border: "1px solid #30353d", borderRadius: 8, color: "#ededE8" },
  labelStyle: { color: "#8a9099" },
};
const LIFT_COLORS = ["#c6f432", "#5cc8ff", "#ff8a5c", "#f5d547", "#b8a4ff"];
const MAX_LIFTS = LIFT_COLORS.length;

const RANGES: Record<TrendPeriod, { value: number; label: string }[]> = {
  week: [
    { value: 8, label: "8 週" },
    { value: 12, label: "12 週" },
    { value: 26, label: "半年" },
    { value: 52, label: "1 年" },
  ],
  month: [
    { value: 6, label: "半年" },
    { value: 12, label: "1 年" },
    { value: 24, label: "2 年" },
  ],
};
const DEFAULT_COUNT: Record<TrendPeriod, number> = { week: 12, month: 12 };

// ───────────────────────── labels & formatting ─────────────────────────

function unitWord(p: TrendPeriod): string {
  return p === "week" ? "週" : "個月";
}

/** Axis tick: "9/22" for weeks, "9月" (or "27/1" in January / first tick) for months. */
function tickLabel(start: string, p: TrendPeriod, first = false): string {
  if (p === "week") return shortDate(start);
  const m = Number(start.slice(5, 7));
  return m === 1 || first ? `${start.slice(2, 4)}/${m}` : `${m}月`;
}

/** "9/22–9/28" or "2026 年 9 月", plus an in-progress marker. */
function periodLabel(b: TrendBucket, p: TrendPeriod): string {
  const base = p === "week" ? `${shortDate(b.start)}–${shortDate(b.end)}` : monthLabel(b.start.slice(0, 7));
  return b.inProgress ? `${base}（${p === "week" ? "本週" : "本月"}，進行中）` : base;
}

function kg(v: number): string {
  return Math.round(v).toLocaleString("zh-TW");
}

function compactKg(v: number): string {
  return v >= 1000 ? `${fmt(v / 1000, 1)}k` : String(Math.round(v));
}

function hours(min: number): string {
  return fmt(min / 60, 1);
}

function Delta({ pct, className }: { pct: number | null; className?: string }) {
  if (pct == null) return <span className={cn("text-dim", className)}>—</span>;
  if (pct === 0) return <span className={cn("num text-dim", className)}>±0%</span>;
  return (
    <span className={cn("num", pct > 0 ? "text-ok" : "text-warn", className)}>
      {pct > 0 ? "▲" : "▼"}
      {fmt(Math.abs(pct), 1)}%
    </span>
  );
}

// ───────────────────────── page ─────────────────────────

export default function Trends() {
  const today = todayLocal();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const period: TrendPeriod = params.get("p") === "month" ? "month" : "week";
  const rawCount = Number(params.get("n"));
  const count = RANGES[period].some(r => r.value === rawCount) ? rawCount : DEFAULT_COUNT[period];
  const setUrl = (p: TrendPeriod, n: number) => navigate(`/progress/trends?p=${p}&n=${n}`, { replace: true });

  const q = trpc.trends.series.useQuery({ period, count, today }, { placeholderData: prev => prev });
  const data = q.data;

  // Selected period (index into buckets); defaults to the latest.
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => setSel(null), [period, count]);
  const selIndex = data ? Math.min(sel ?? data.buckets.length - 1, data.buckets.length - 1) : 0;

  const empty = data ? data.buckets.every(b => b.sessions === 0) : false;

  return (
    <AppShell title="訓練趨勢" back="/progress">
      <div className="space-y-4 fade-up">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Chips
              size="sm"
              value={period}
              onChange={p => setUrl(p, DEFAULT_COUNT[p])}
              options={[
                { value: "week", label: "每週" },
                { value: "month", label: "每月" },
              ]}
            />
            <span className="h-5 w-px bg-line" />
            <Chips size="sm" value={count} onChange={n => setUrl(period, n)} options={RANGES[period]} />
          </div>
          <p className="mt-2 text-xs text-dim">
            {period === "week" ? "每格＝一週（週一到週日）" : "每格＝一個月"}，最後一格是
            {period === "week" ? "本週" : "本月"}（進行中，畫得較淡）。點圖上任一格看那期明細。
          </p>
        </Card>

        {!data && q.isError ? (
          <LoadError what="訓練趨勢" onRetry={() => void q.refetch()} />
        ) : !data ? (
          <div className="space-y-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-56 animate-pulse rounded-xl bg-surface" />
            ))}
          </div>
        ) : empty ? (
          <EmptyState data={data} period={period} count={count} onLonger={n => setUrl(period, n)} />
        ) : (
          <div className={cn("space-y-4", q.isFetching && "opacity-70 transition-opacity")}>
            <SummaryCard data={data} period={period} count={count} />
            <VolumeCard data={data} period={period} selIndex={selIndex} onSelect={setSel} />
            <PeriodDetail data={data} period={period} index={selIndex} />
            <IntensityCard data={data} period={period} selIndex={selIndex} onSelect={setSel} />
            <p className="px-1 text-xs leading-relaxed text-dim">
              總量＝重量×次數加總（跟每次訓練摘要的容量一樣，徒手動作用當時體重估算，跳躍與計時動作不算）。有效組＝RPE
              達設定門檻（沒填 RPE 也算）。負荷＝sRPE×分鐘，排球也算。e1RM 用 Epley 公式從工作組估算。
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ───────────────────────── empty ─────────────────────────

function EmptyState({
  data,
  period,
  count,
  onLonger,
}: {
  data: Series;
  period: TrendPeriod;
  count: number;
  onLonger: (n: number) => void;
}) {
  const longer = RANGES[period].find(r => r.value > count);
  return (
    <Card>
      <CardTitle>這段期間沒有訓練紀錄</CardTitle>
      {data.firstSessionDate ? (
        <p className="text-sm text-dim">
          你最早的紀錄在 {data.firstSessionDate.replaceAll("-", "/")}，近 {count} {unitWord(period)}內沒有資料。
          {longer && (
            <button type="button" className="ml-1 underline" onClick={() => onLonger(longer.value)}>
              改看{longer.label}
            </button>
          )}
        </p>
      ) : (
        <p className="text-sm text-dim">
          還沒有任何訓練紀錄。
          <Link href="/" className="underline">
            到今天頁開始第一次訓練
          </Link>
          ，或到
          <Link href="/history" className="underline">
            日曆
          </Link>
          補記之前的訓練。
        </p>
      )}
    </Card>
  );
}

// ───────────────────────── summary ─────────────────────────

function SummaryCard({ data, period, count }: { data: Series; period: TrendPeriod; count: number }) {
  const b = data.buckets;
  const sessions = b.reduce((a, x) => a + x.sessions, 0);
  const volume = b.reduce((a, x) => a + x.volume, 0);
  const hardSets = b.reduce((a, x) => a + x.hardSets, 0);
  const cmp = {
    volume: compareLastComplete(b, x => x.volume),
    hardSets: compareLastComplete(b, x => x.hardSets),
    load: compareLastComplete(b, x => x.load),
  };
  const last = period === "week" ? "上週" : "上個月";
  const before = period === "week" ? "前一週" : "前一個月";
  return (
    <Card>
      <CardTitle>
        近 {count} {unitWord(period)}重點
      </CardTitle>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="訓練" value={sessions} unit="次" />
        <Stat label="總量" value={fmt(volume / 1000, 1)} unit="噸" />
        <Stat label="有效組" value={fmt(hardSets, 0)} unit="組" />
      </div>
      {cmp.volume ? (
        <div className="mt-3 rounded-lg bg-surface-2 p-3">
          <div className="text-xs text-dim">
            {last}（{period === "week" ? shortDate(cmp.volume.current.start) + " 週" : monthLabel(cmp.volume.current.start.slice(0, 7))}）vs {before}
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2 text-sm">
            <CompareCell label="總量" value={`${kg(cmp.volume.value)} kg`} pct={cmp.volume.pct} />
            <CompareCell label="有效組" value={`${fmt(cmp.hardSets!.value)} 組`} pct={cmp.hardSets!.pct} />
            <CompareCell label="負荷" value={kg(cmp.load!.value)} pct={cmp.load!.pct} />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-dim">至少要有兩個完整的{period === "week" ? "週" : "月"}才比得出增減。</p>
      )}
    </Card>
  );
}

function CompareCell({ label, value, pct }: { label: string; value: string; pct: number | null }) {
  return (
    <div>
      <div className="text-xs text-dim">{label}</div>
      <div className="num text-base">{value}</div>
      <Delta pct={pct} className="text-xs" />
    </div>
  );
}

// ───────────────────────── volume chart ─────────────────────────

type VolumeMetric = "volume" | "hardSets" | "load" | "sessions";
type TypeFilter = "all" | SessionType;

const VOLUME_METRICS: { value: VolumeMetric; label: string; unit: string }[] = [
  { value: "volume", label: "總量", unit: "kg" },
  { value: "hardSets", label: "有效組", unit: "組" },
  { value: "load", label: "負荷", unit: "sRPE×分" },
  { value: "sessions", label: "次數", unit: "次" },
];

function typeValue(b: TrendBucket, t: SessionType, m: VolumeMetric): number {
  return b.byType[t][m];
}

/** recharts passes the hovered/clicked category index on chart clicks. */
type ChartClick = { activeTooltipIndex?: number } | null;

function VolumeCard({
  data,
  period,
  selIndex,
  onSelect,
}: {
  data: Series;
  period: TrendPeriod;
  selIndex: number;
  onSelect: (i: number) => void;
}) {
  const [metric, setMetric] = useState<VolumeMetric>("volume");
  const [filter, setFilter] = useState<TypeFilter>("all");
  const allowVolleyball = metric === "load" || metric === "sessions";
  useEffect(() => {
    if (!allowVolleyball && filter === "volleyball") setFilter("all");
  }, [allowVolleyball, filter]);

  const types = (filter === "all" ? TREND_TYPES : [filter]).filter(t =>
    data.buckets.some(b => typeValue(b, t, metric) > 0)
  );
  const rows = data.buckets.map(b => {
    const row: Record<string, number | string | boolean> = { start: b.start, inProgress: b.inProgress };
    let total = 0;
    for (const t of TREND_TYPES) {
      const v = typeValue(b, t, metric);
      row[t] = v;
      if (filter === "all" || filter === t) total += v;
    }
    row.total = total;
    return row;
  });
  const complete = rows.filter(r => !r.inProgress);
  const avg = complete.length ? complete.reduce((a, r) => a + (r.total as number), 0) / complete.length : null;
  const unit = VOLUME_METRICS.find(x => x.value === metric)!.unit;
  const fmtValue = (v: number) => (metric === "volume" ? `${kg(v)} kg` : metric === "load" ? kg(v) : `${fmt(v)} ${unit}`);
  const selStart = data.buckets[selIndex]?.start;

  const filters: { value: TypeFilter; label: string }[] = [
    { value: "all", label: "全部" },
    { value: "leg", label: "腿" },
    { value: "back", label: "背" },
    { value: "chest", label: "胸" },
    ...(allowVolleyball ? [{ value: "volleyball" as const, label: "排球" }] : []),
  ];

  return (
    <Card>
      <CardTitle>訓練總量</CardTitle>
      <Chips size="sm" value={metric} onChange={setMetric} options={VOLUME_METRICS} />
      <Chips size="sm" className="mt-2" value={filter} onChange={setFilter} options={filters} />
      <div className="mt-3 h-56">
        {types.length === 0 ? (
          <p className="pt-16 text-center text-sm text-dim">這個篩選在範圍內沒有數字</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
              onClick={(st: ChartClick) => {
                if (st?.activeTooltipIndex != null) onSelect(st.activeTooltipIndex);
              }}
            >
              <CartesianGrid stroke="#262a30" vertical={false} />
              <XAxis
                dataKey="start"
                tickFormatter={(v: string, i: number) => tickLabel(v, period, i === 0)}
                minTickGap={8}
                {...AXIS}
              />
              <YAxis
                tickFormatter={(v: number) => (metric === "volume" || metric === "load" ? compactKg(v) : String(v))}
                allowDecimals={metric !== "sessions"}
                {...AXIS}
              />
              <Tooltip
                {...TOOLTIP}
                cursor={{ fill: "#ffffff10" }}
                labelFormatter={l => periodLabel(data.buckets.find(b => b.start === l)!, period)}
                formatter={(v: number, n: string) => [fmtValue(v), TYPE_LABEL[n as SessionType] ?? n]}
              />
              {avg != null && avg > 0 && (
                <ReferenceLine
                  y={avg}
                  stroke="#ededE8"
                  strokeOpacity={0.5}
                  strokeDasharray="4 4"
                  label={{ value: "平均", position: "insideTopRight", fill: "#8a9099", fontSize: 11 }}
                />
              )}
              {selStart && <ReferenceLine x={selStart} stroke="#c6f432" strokeOpacity={0.35} strokeWidth={12} />}
              {types.map(t => (
                <Bar key={t} dataKey={t} stackId="s" fill={TYPE_COLOR[t]} isAnimationActive={false}>
                  {rows.map(r => (
                    <Cell key={String(r.start)} fillOpacity={r.inProgress ? 0.45 : 1} />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-dim">
        {types.map(t => (
          <span key={t} className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: TYPE_COLOR[t] }} />
            {TYPE_LABEL[t]}
          </span>
        ))}
        {avg != null && avg > 0 && (
          <span>
            虛線＝已完成{period === "week" ? "週" : "月"}平均 {fmtValue(avg)}
          </span>
        )}
      </div>
    </Card>
  );
}

// ───────────────────────── selected period ─────────────────────────

function PeriodDetail({ data, period, index }: { data: Series; period: TrendPeriod; index: number }) {
  const b = data.buckets[index];
  if (!b) return null;
  const prev = index > 0 ? data.buckets[index - 1] : null;
  const vs = (cur: number, p: number | undefined) => (prev && p != null ? pctChange(cur, p) : null);
  const prevWord = period === "week" ? "比前一週" : "比前一個月";
  const lifts = data.lifts.filter(l => b.e1rm[l.key] != null).slice(0, 5);
  return (
    <Card>
      <CardTitle
        right={
          b.inProgress && <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-dim">進行中</span>
        }
      >
        {periodLabel(b, period).replace(/（.*）$/, "")}
      </CardTitle>
      {b.sessions === 0 ? (
        <p className="text-sm text-dim">這{period === "week" ? "週" : "個月"}沒有訓練紀錄。</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat
              label="訓練"
              value={b.sessions}
              unit="次"
              sub={`重訓 ${b.strengthSessions}・排球 ${b.volleyballSessions}`}
            />
            <Stat label="時數" value={hours(b.durationMin)} unit="小時" sub={<Delta pct={vs(b.durationMin, prev?.durationMin)} />} />
            <Stat label="總量" value={kg(b.volume)} unit="kg" sub={<Delta pct={vs(b.volume, prev?.volume)} />} />
            <Stat label="有效組" value={fmt(b.hardSets)} unit="組" sub={<Delta pct={vs(b.hardSets, prev?.hardSets)} />} />
            <Stat label="負荷" value={kg(b.load)} sub={<Delta pct={vs(b.load, prev?.load)} />} />
            <Stat label="跳躍" value={b.jumps} unit="下" sub={<Delta pct={vs(b.jumps, prev?.jumps)} />} />
            <Stat
              label="平均 RPE"
              value={b.avgRpe != null ? fmt(b.avgRpe) : "—"}
              sub={b.avgRpe != null && prev?.avgRpe != null ? <Delta pct={pctChange(b.avgRpe, prev.avgRpe)} /> : undefined}
            />
            <Stat
              label="每下負重"
              value={b.avgLoadPerRep != null ? fmt(b.avgLoadPerRep) : "—"}
              unit={b.avgLoadPerRep != null ? "kg" : undefined}
              sub={
                b.avgLoadPerRep != null && prev?.avgLoadPerRep != null ? (
                  <Delta pct={pctChange(b.avgLoadPerRep, prev.avgLoadPerRep)} />
                ) : undefined
              }
            />
          </div>
          {prev && <p className="mt-2 text-[11px] text-dim">▲▼ 是{prevWord}的增減。</p>}
          {lifts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-xs">
              <span className="text-dim">本期最佳 e1RM</span>
              {lifts.map(l => (
                <span key={l.key}>
                  {l.name} <span className="num text-sm">{fmt(b.e1rm[l.key])}</span> kg
                </span>
              ))}
            </div>
          )}
        </>
      )}
      <Link
        href={`/history?view=${period === "week" ? "week" : "month"}&d=${b.start}`}
        className="press mt-3 flex h-11 items-center justify-center gap-2 rounded-lg border border-line text-sm"
      >
        <CalendarDays className="size-4" />
        在日曆看這{period === "week" ? "週" : "個月"}
      </Link>
    </Card>
  );
}

// ───────────────────────── intensity chart ─────────────────────────

type IntensityMetric = "e1rm" | "rpe" | "perRep";

function IntensityCard({
  data,
  period,
  selIndex,
  onSelect,
}: {
  data: Series;
  period: TrendPeriod;
  selIndex: number;
  onSelect: (i: number) => void;
}) {
  const [metric, setMetric] = useState<IntensityMetric>("e1rm");
  const [relative, setRelative] = useState(false);
  const [picked, setPicked] = useState<string[] | null>(null);

  const liftKeys = new Set(data.lifts.map(l => l.key));
  const defaults = useMemo(() => {
    const targets = data.lifts.filter(l => l.isTarget).map(l => l.key);
    return (targets.length ? targets : data.lifts.map(l => l.key).slice(0, 3)).slice(0, MAX_LIFTS);
  }, [data.lifts]);
  const shownRaw = (picked ?? defaults).filter(k => liftKeys.has(k));
  const shown = shownRaw.length ? shownRaw : defaults;
  const colorOf = (k: string) => LIFT_COLORS[shown.indexOf(k) % LIFT_COLORS.length];
  const nameOf = (k: string) => data.lifts.find(l => l.key === k)?.name ?? k;

  const toggle = (k: string) => {
    if (shown.includes(k)) {
      setPicked(shown.filter(x => x !== k));
      return;
    }
    if (shown.length >= MAX_LIFTS) {
      toast.message(`最多同時看 ${MAX_LIFTS} 個動作，先取消一個`);
      return;
    }
    setPicked([...shown, k]);
  };

  // First value per lift in range = 100% in relative mode.
  const base: Record<string, number> = {};
  for (const k of shown) {
    const first = data.buckets.find(b => b.e1rm[k] != null);
    if (first) base[k] = first.e1rm[k];
  }
  const rows = data.buckets.map(b => {
    const row: Record<string, number | string | null> = { start: b.start };
    if (metric === "e1rm") {
      for (const k of shown) {
        const v = b.e1rm[k];
        row[k] = v == null ? null : relative && base[k] ? Math.round((v / base[k]) * 1000) / 10 : v;
      }
    } else {
      row.value = metric === "rpe" ? b.avgRpe : b.avgLoadPerRep;
    }
    return row;
  });
  const hasData =
    metric === "e1rm"
      ? shown.some(k => data.buckets.some(b => b.e1rm[k] != null))
      : rows.some(r => r.value != null);
  const selStart = data.buckets[selIndex]?.start;
  const sel = data.buckets[selIndex];

  const singleGrowth =
    metric === "e1rm"
      ? null
      : growth(data.buckets.map(b => ({ start: b.start, value: metric === "rpe" ? b.avgRpe : b.avgLoadPerRep })));

  return (
    <Card>
      <CardTitle>強度成長</CardTitle>
      <Chips
        size="sm"
        value={metric}
        onChange={setMetric}
        options={[
          { value: "e1rm", label: "主項 e1RM" },
          { value: "rpe", label: "平均 RPE" },
          { value: "perRep", label: "每下負重" },
        ]}
      />
      {metric === "e1rm" && data.lifts.length > 0 && (
        <>
          <Chips
            size="sm"
            className="mt-2"
            value={relative ? "pct" : "kg"}
            onChange={v => setRelative(v === "pct")}
            options={[
              { value: "kg", label: "kg" },
              { value: "pct", label: "相對起點 %" },
            ]}
          />
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="選擇要顯示的動作">
            {data.lifts.map(l => {
              const on = shown.includes(l.key);
              return (
                <button
                  key={l.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(l.key)}
                  className={cn(
                    "press flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs",
                    on ? "border-chalk/40 bg-surface-2 text-chalk" : "border-line text-dim"
                  )}
                >
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ background: on ? colorOf(l.key) : "transparent", border: on ? "none" : "1px solid #8a9099" }}
                  />
                  {l.name}
                  {l.isTarget && <span className="text-[10px] text-dim">目標</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-3 h-56">
        {!hasData ? (
          <p className="pt-16 text-center text-sm text-dim">
            {metric === "e1rm"
              ? "範圍內還沒有可以估 e1RM 的工作組（複合或孤立動作、1–12 下）"
              : metric === "rpe"
                ? "範圍內的工作組都沒有填 RPE"
                : "範圍內沒有負重的工作組"}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows}
              margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
              onClick={(st: ChartClick) => {
                if (st?.activeTooltipIndex != null) onSelect(st.activeTooltipIndex);
              }}
            >
              <CartesianGrid stroke="#262a30" vertical={false} />
              <XAxis
                dataKey="start"
                tickFormatter={(v: string, i: number) => tickLabel(v, period, i === 0)}
                minTickGap={8}
                {...AXIS}
              />
              <YAxis
                domain={metric === "rpe" ? [5, 10] : ["dataMin - 5", "dataMax + 5"]}
                tickFormatter={(v: number) => (metric === "e1rm" && relative ? `${Math.round(v)}%` : String(Math.round(v)))}
                allowDecimals={false}
                {...AXIS}
              />
              {metric === "e1rm" && relative && <ReferenceLine y={100} stroke="#8a9099" strokeDasharray="4 4" />}
              {selStart && <ReferenceLine x={selStart} stroke="#c6f432" strokeOpacity={0.35} strokeWidth={12} />}
              <Tooltip
                {...TOOLTIP}
                labelFormatter={l => periodLabel(data.buckets.find(b => b.start === l)!, period)}
                formatter={(v: number, n: string) => {
                  if (metric === "e1rm") return [relative ? `${fmt(v)}%` : `${fmt(v)} kg`, nameOf(n)];
                  return [metric === "rpe" ? fmt(v) : `${fmt(v)} kg`, metric === "rpe" ? "平均 RPE" : "每下負重"];
                }}
              />
              {metric === "e1rm" ? (
                shown.map(k => (
                  <Line
                    key={k}
                    dataKey={k}
                    type="monotone"
                    stroke={colorOf(k)}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))
              ) : (
                <Line
                  dataKey="value"
                  type="monotone"
                  stroke="#c6f432"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {hasData && metric === "e1rm" && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {shown.map(k => {
            const g = growth(data.buckets.map(b => ({ start: b.start, value: b.e1rm[k] })));
            return (
              <li key={k} className="flex items-baseline gap-2">
                <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: colorOf(k) }} />
                <span className="w-24 shrink-0 truncate">{nameOf(k)}</span>
                {g ? (
                  <span className="flex-1">
                    <span className="num">{fmt(g.first)}</span> → <span className="num">{fmt(g.last)}</span> kg{" "}
                    <Delta pct={g.pct} className="text-xs" />
                    <span className="ml-1 text-[11px] text-dim">
                      （{tickLabel(g.firstStart, period, true)} → {tickLabel(g.lastStart, period, true)}）
                    </span>
                  </span>
                ) : (
                  <span className="flex-1 text-xs text-dim">範圍內只有 1 期有紀錄</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {hasData && metric !== "e1rm" && (
        <p className="mt-3 text-sm">
          {singleGrowth ? (
            <>
              範圍內 <span className="num">{fmt(singleGrowth.first)}</span> →{" "}
              <span className="num">{fmt(singleGrowth.last)}</span>
              {metric === "perRep" ? " kg" : ""} <Delta pct={singleGrowth.pct} className="text-xs" />
            </>
          ) : (
            <span className="text-xs text-dim">範圍內只有 1 期有數字</span>
          )}
        </p>
      )}
      {sel && hasData && (
        <p className="mt-2 text-xs text-dim">
          選取的期間 {periodLabel(sel, period).replace(/（.*）$/, "")}：
          {metric === "e1rm"
            ? shown
                .map(k => `${nameOf(k)} ${sel.e1rm[k] != null ? `${fmt(sel.e1rm[k])} kg` : "沒練"}`)
                .join("・")
            : metric === "rpe"
              ? `平均 RPE ${sel.avgRpe != null ? fmt(sel.avgRpe) : "—"}`
              : `每下負重 ${sel.avgLoadPerRep != null ? `${fmt(sel.avgLoadPerRep)} kg` : "—"}`}
        </p>
      )}
      <p className="mt-2 text-xs text-dim">
        {metric === "e1rm"
          ? "每期取最佳估算 1RM；徒手動作含體重。沒練到的期間用線連起來。其他動作的逐次紀錄在進度頁「力量趨勢」。"
          : metric === "rpe"
            ? "工作組（不含熱身）有填 RPE 的平均。"
            : "工作組總量 ÷ 總次數，只算有負重的複合／孤立動作；會受動作組合影響，適合看同一個訓練週期內的變化。"}
      </p>
    </Card>
  );
}
