import { AppShell } from "@/components/app/AppShell";
import { Card, CardTitle, Chips, Pick, PlateBar, Stat } from "@/components/app/controls";
import { fmt, shortDate, todayLocal } from "@/lib/format";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { setStatus } from "@shared/analytics";
import { TARGET_MUSCLES } from "@shared/exercises";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

const AXIS = { stroke: "#30353d", tick: { fill: "#8a9099", fontSize: 12 } };
const TOOLTIP = {
  contentStyle: { background: "#1c2025", border: "1px solid #30353d", borderRadius: 8, color: "#ededE8" },
  labelStyle: { color: "#8a9099" },
};

export default function Progress() {
  const today = todayLocal();
  const q = trpc.dashboard.summary.useQuery({ today });
  const d = q.data;

  return (
    <AppShell title="進度">
      {!d ? (
        <div className="space-y-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-56 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : (
        <div className="space-y-4 fade-up">
          <BodyCard d={d} />
          <JumpCard d={d} />
          <WeeklyCard d={d} />
          <StrengthCard options={d.strengthOptions} />
          <WeightCard d={d} />
        </div>
      )}
    </AppShell>
  );
}

type Summary = RouterOutputs["dashboard"]["summary"];

function BodyCard({ d }: { d: Summary }) {
  const b = d.body;
  const t = d.targets;
  const latest = b.latest;
  const points = b.history.map(h => ({ x: Number(h.bfPct.toFixed(1)), y: Number(h.ffmi.toFixed(2)), date: h.date }));
  const xMin = Math.floor(Math.min(t.bfMin - 2, ...points.map(p => p.x)) - 1);
  const xMax = Math.ceil(Math.max(t.bfMax + 2, ...points.map(p => p.x)) + 1);
  const yMin = Math.floor((Math.min(t.ffmiMin - 1, ...points.map(p => p.y)) - 0.5) * 2) / 2;
  const yMax = Math.ceil((Math.max(t.ffmiMax + 0.5, ...points.map(p => p.y)) + 0.5) * 2) / 2;

  return (
    <Card>
      <CardTitle
        right={
          <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", b.achieved ? "bg-brand text-brand-ink" : "bg-surface-2 text-dim")}>
            {b.achieved ? "已達標" : "進行中"}
          </span>
        }
      >
        薄肌目標
      </CardTitle>
      {latest ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="體脂率" value={fmt(latest.bfPct)} unit="%" sub={`目標 ${t.bfMin}–${t.bfMax}%`} />
            <Stat label="FFMI" value={fmt(latest.ffmi, 1)} sub={`目標 ${t.ffmiMin}–${t.ffmiMax}`} />
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-dim">降體脂進度</span>
                <span className="num text-sm">{Math.round((b.bfProgress ?? 0) * 100)}%</span>
              </div>
              <PlateBar value={b.bfProgress} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-dim">增肌（去脂體重）進度</span>
                <span className="num text-sm">{Math.round((b.ffmProgress ?? 0) * 100)}%</span>
              </div>
              <PlateBar value={b.ffmProgress} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xs text-dim">去脂體重還差</div>
              <div className="num text-2xl font-semibold text-back">
                {b.ffmGapKg != null && b.ffmGapKg > 0 ? `+${fmt(b.ffmGapKg)}` : "達成"}
                {b.ffmGapKg != null && b.ffmGapKg > 0 && <span className="ml-0.5 text-xs font-sans text-dim">kg</span>}
              </div>
              <div className="text-xs text-dim">目標 {fmt(b.targetFfmKg)} kg</div>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xs text-dim">脂肪還要減</div>
              <div className="num text-2xl font-semibold text-chest">
                {b.fatToLoseAtGoalKg != null && b.fatToLoseAtGoalKg > 0 ? `−${fmt(b.fatToLoseAtGoalKg)}` : "達成"}
                {b.fatToLoseAtGoalKg != null && b.fatToLoseAtGoalKg > 0 && <span className="ml-0.5 text-xs font-sans text-dim">kg</span>}
              </div>
              <div className="text-xs text-dim">達標時體重約 {fmt(b.goalWeightKg)} kg</div>
            </div>
          </div>

          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 8, bottom: 16, left: -16 }}>
                <CartesianGrid stroke="#262a30" />
                <XAxis type="number" dataKey="x" name="體脂" unit="%" domain={[xMin, xMax]} reversed {...AXIS} />
                <YAxis type="number" dataKey="y" name="FFMI" domain={[yMin, yMax]} {...AXIS} />
                <ZAxis range={[80, 80]} />
                <ReferenceArea
                  x1={t.bfMin}
                  x2={t.bfMax}
                  y1={t.ffmiMin}
                  y2={t.ffmiMax}
                  fill="#c6f432"
                  fillOpacity={0.15}
                  stroke="#c6f432"
                  strokeDasharray="4 4"
                />
                <Tooltip
                  {...TOOLTIP}
                  formatter={(v: number, n: string) => [n === "體脂" ? `${v}%` : v, n]}
                  labelFormatter={() => ""}
                />
                <Scatter data={points} fill="#ededE8" line={{ stroke: "#8a9099" }} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center text-xs text-dim">往右＝體脂更低、往上＝肌肉更多；綠框是薄肌目標區。</p>

          {b.milestones.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium">里程碑</div>
              <ul className="space-y-2">
                {b.milestones.map(m => (
                  <li key={m.name} className="flex items-center gap-3 rounded-lg bg-surface-2 p-3 text-sm">
                    {m.status === "met" ? (
                      <CheckCircle2 className="size-5 text-ok" />
                    ) : m.status === "missed" ? (
                      <XCircle className="size-5 text-bad" />
                    ) : (
                      <Circle className="size-5 text-dim" />
                    )}
                    <div className="flex-1">
                      <div className="font-medium">
                        {m.name}・{m.by.slice(0, 7).replace("-", "/")} 前
                      </div>
                      <div className="text-xs text-dim">
                        去脂 ≥ {m.ffmMinKg} kg、體脂 ≤ {m.bfMax}%
                        {m.status !== "met" && m.ffmGap != null && m.bfGap != null && (
                          <>
                            ・還差 {m.ffmGap > 0 ? `去脂 +${fmt(m.ffmGap)} kg` : "去脂 OK"}、
                            {m.bfGap > 0 ? `體脂 −${fmt(m.bfGap)}%` : "體脂 OK"}
                          </>
                        )}
                        {m.status === "met" && m.metOn && `・${shortDate(m.metOn)} 達成`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-dim">
          還沒有體組成掃描。<Link href="/body" className="underline">到身體頁新增</Link>。
        </p>
      )}
    </Card>
  );
}

function JumpCard({ d }: { d: Summary }) {
  const j = d.jump;
  return (
    <Card>
      <CardTitle>助跑摸高</CardTitle>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="最近" value={j.latestReachCm != null ? fmt(j.latestReachCm, 0) : "—"} unit="cm" />
        <Stat label="目標" value={fmt(j.targetReachCm, 0)} unit="cm" />
        <Stat label="還差" value={j.remainingCm != null ? (j.remainingCm > 0 ? fmt(j.remainingCm, 0) : "0") : "—"} unit="cm" />
      </div>
      <PlateBar className="mt-3" value={j.progress} />
      <p className="mt-2 text-xs text-dim">
        站立摸高 {j.standingReachCm} cm{d.standingReachEstimated ? "（估算）" : ""}・目前跳躍高度約{" "}
        {j.latestJumpCm != null ? `${fmt(j.latestJumpCm, 0)} cm` : "—"}，目標 {fmt(j.targetJumpCm, 0)} cm
      </p>
      {j.history.length > 1 && (
        <div className="mt-3 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={j.history} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="#262a30" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} />
              <YAxis domain={["dataMin - 5", j.targetReachCm + 2]} {...AXIS} />
              <ReferenceLine y={j.targetReachCm} stroke="#c6f432" strokeDasharray="4 4" />
              <Tooltip {...TOOLTIP} labelFormatter={l => shortDate(String(l))} formatter={(v: number) => [`${v} cm`, "摸高"]} />
              <Line type="monotone" dataKey="approachReachCm" stroke="#f5d547" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 text-xs text-dim">每 2–4 週測一次就好，記得熱身、同一個地方、取 3 次最高。</p>
    </Card>
  );
}

function WeeklyCard({ d }: { d: Summary }) {
  const weeks = d.weeks;
  const [idx, setIdx] = useState(weeks.length - 1);
  const w = weeks[Math.min(idx, weeks.length - 1)];
  const lastInProgress = weeks[weeks.length - 1]?.inProgress ?? false;
  const recent = weeks
    .map((x, i) => ({
      value: i,
      label: x.inProgress
        ? "本週"
        : i === weeks.length - 2 && lastInProgress
          ? "上週"
          : `${shortDate(x.start)} 週`,
    }))
    .slice(-4);

  const loadData = weeks.map(x => ({ week: shortDate(x.start), load: Math.round(x.load), jumps: x.jumps, inProgress: x.inProgress }));

  if (!w) return null;
  return (
    <Card>
      <CardTitle>每週訓練量</CardTitle>
      <Chips size="sm" value={idx} onChange={setIdx} options={recent} />
      <div className="mt-1 text-xs text-dim">
        {shortDate(w.start)}–{shortDate(w.end)}
        {w.inProgress && "（進行中，組數還會增加）"}・重訓 {w.strengthSessions} 次・排球 {w.volleyballSessions} 次
      </div>
      <ul className="mt-3 space-y-2">
        {TARGET_MUSCLES.map(m => {
          const v = w.muscleSets[m] ?? 0;
          const [lo, hi] = d.weeklyTargets[m] ?? [0, 0];
          const scale = Math.max(hi * 1.25, v, 1);
          const st = setStatus(v, [lo, hi]);
          return (
            <li key={m} className="flex items-center gap-2 text-sm">
              <span className="w-10 shrink-0 text-dim">{m}</span>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-surface-2">
                <div
                  className="absolute inset-y-0 bg-brand/15 border-x border-brand/40"
                  style={{ left: `${(lo / scale) * 100}%`, width: `${((hi - lo) / scale) * 100}%` }}
                />
                <div
                  className={cn("absolute inset-y-1 left-0 rounded-sm", st === "ok" ? "bg-ok" : st === "high" ? "bg-bad" : "bg-warn")}
                  style={{ width: `${(v / scale) * 100}%` }}
                />
              </div>
              <span className="num w-16 shrink-0 text-right text-base">
                {fmt(v)}
                <span className="text-xs text-dim">/{lo}–{hi}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-dim">淡綠框＝目標範圍。主要肌群 1 組、次要 0.5 組，RPE 7 以上才算有效組。</p>

      <div className="mt-4 text-sm font-medium">訓練負荷（sRPE×分鐘）與跳躍量</div>
      <div className="mt-2 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={loadData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="#262a30" vertical={false} />
            <XAxis dataKey="week" {...AXIS} />
            <YAxis {...AXIS} />
            <Tooltip {...TOOLTIP} formatter={(v: number, n: string) => [v, n === "load" ? "負荷" : "跳躍"]} />
            <Bar dataKey="load" fill="#5cc8ff" radius={[3, 3, 0, 0]} />
            <Bar dataKey="jumps" fill="#f5d547" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {(w.loadSpike || w.jumpSpike) && (
        <p className="mt-2 rounded-lg bg-bad/10 p-3 text-sm text-bad">
          這週{w.loadSpike ? `負荷是前三週平均的 ${fmt(w.loadRatio)} 倍` : ""}
          {w.loadSpike && w.jumpSpike ? "，" : ""}
          {w.jumpSpike ? `跳躍量是前三週平均的 ${fmt(w.jumpRatio)} 倍` : ""}，增加太快，注意膝蓋。
        </p>
      )}
    </Card>
  );
}

function StrengthCard({ options }: { options: Summary["strengthOptions"] }) {
  const [key, setKey] = useState<string>(options[0]?.key ?? "");
  useEffect(() => {
    if (!key && options[0]) setKey(options[0].key);
  }, [options, key]);
  const trend = trpc.dashboard.strengthTrend.useQuery({ exerciseKey: key }, { enabled: !!key });
  const data = trend.data ?? [];
  const best = useMemo(() => data.reduce((a, x) => Math.max(a, x.e1rm), 0), [data]);

  return (
    <Card>
      <CardTitle>力量趨勢（e1RM）</CardTitle>
      {options.length === 0 ? (
        <p className="text-sm text-dim">記錄幾次重訓後就會出現。</p>
      ) : (
        <>
          <Pick
            value={key}
            options={options.map(o => ({ value: o.key, label: `${o.name}（${o.sessions} 次）` }))}
            onChange={setKey}
            ariaLabel="選擇動作"
            className="[&>span.num]:font-sans [&>span.num]:text-base"
          />
          {data.length > 0 && (
            <div className="mt-2 text-xs text-dim">
              最佳 <span className="num text-base text-chalk">{fmt(best)}</span> kg・最近{" "}
              <span className="num text-base text-chalk">
                {fmt(data[data.length - 1].weightKg)}×{data[data.length - 1].reps}
              </span>
            </div>
          )}
          <div className="mt-2 h-44">
            {data.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="#262a30" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} />
                  <YAxis domain={["dataMin - 5", "dataMax + 5"]} {...AXIS} />
                  <Tooltip
                    {...TOOLTIP}
                    labelFormatter={l => shortDate(String(l))}
                    formatter={(v: number) => [`${v} kg`, "e1RM"]}
                  />
                  <Line type="monotone" dataKey="e1rm" stroke="#c6f432" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="pt-8 text-center text-sm text-dim">至少要 2 次紀錄才畫得出趨勢</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function WeightCard({ d }: { d: Summary }) {
  const data = d.weight.trend;
  return (
    <Card>
      <CardTitle>體重（近 120 天）</CardTitle>
      {data.length > 1 ? (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="#262a30" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} {...AXIS} />
              <Tooltip
                {...TOOLTIP}
                labelFormatter={l => shortDate(String(l))}
                formatter={(v: number, n: string) => [`${v} kg`, n === "avg7" ? "7 日平均" : "當天"]}
              />
              <Line type="monotone" dataKey="weightKg" stroke="#8a9099" strokeWidth={1} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="avg7" stroke="#c6f432" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-dim">
          記錄 2 天以上就會出現趨勢線。看 7 日平均（綠線）比看單天準。
        </p>
      )}
    </Card>
  );
}
