import { Card, CardTitle, PlateBar } from "@/components/app/controls";
import { fmt, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StrengthGoal, StrengthStep } from "@shared/strength";
import { CheckCircle2, ChevronRight, Circle, XCircle } from "lucide-react";
import { Link } from "wouter";

function kg(v: number | null): string {
  return v == null ? "—" : fmt(v, v % 1 === 0 ? 0 : 1);
}

function StepIcon({ s }: { s: StrengthStep }) {
  if (s.status === "met") return <CheckCircle2 className="size-3.5 text-ok" />;
  if (s.status === "missed") return <XCircle className="size-3.5 text-bad" />;
  return <Circle className="size-3.5 text-dim" />;
}

/** Full card on the Progress page. */
export function StrengthGoalsCard({ goals }: { goals: StrengthGoal[] }) {
  const bw = goals[0]?.bodyweightKg;
  return (
    <Card>
      <CardTitle
        right={
          <Link href="/settings#strength" className="flex items-center text-sm text-dim">
            調整 <ChevronRight className="size-4" />
          </Link>
        }
      >
        力量目標
      </CardTitle>
      {goals.length === 0 ? (
        <p className="text-sm text-dim">
          還沒有設定力量目標。<Link href="/settings#strength" className="underline">到設定新增</Link>。
        </p>
      ) : (
        <ul className="space-y-4">
          {goals.map(g => (
            <GoalRow key={g.exerciseKey} g={g} />
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs leading-relaxed text-dim">
        數字都是 e1RM（用「重量×次數」推估的單次最大重量）。目前＝近 8 週最佳；目標＝倍數×目前體重
        {bw ? ` ${fmt(bw)} kg` : ""}。階段目標從你第一次的紀錄出發，依里程碑日期平均分配。引體向上的重量含體重。
      </p>
    </Card>
  );
}

function GoalRow({ g }: { g: StrengthGoal }) {
  const noData = g.startE1rm == null;
  return (
    <li className="rounded-lg bg-surface-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{g.name}</span>
        <span className="text-xs text-dim">
          目標 {fmt(g.ratio, 2)}× 體重
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn("num text-3xl font-semibold", g.achieved ? "text-brand" : "text-chalk")}>
          {kg(g.currentE1rm)}
        </span>
        <span className="text-sm text-dim">/ {kg(g.targetKg)} kg</span>
        {g.achieved && (
          <span className="ml-auto rounded bg-brand px-1.5 text-xs font-semibold text-brand-ink">已達標</span>
        )}
        {!g.achieved && g.currentRatio != null && (
          <span className="ml-auto text-xs text-dim">目前 {fmt(g.currentRatio, 2)}×</span>
        )}
      </div>
      <PlateBar className="mt-2" value={g.progress} />

      {noData ? (
        <p className="mt-2 text-sm text-dim">
          還沒有紀錄。照平常的重量做一次，就會算出階段目標。最終目標大約是
          <span className="num font-semibold text-chalk"> {g.targetSet.label}</span>
          {g.targetSet.alt ? `（或 ${g.targetSet.alt}）` : ""}。
        </p>
      ) : (
        <>
          {g.stale && (
            <p className="mt-2 text-xs text-warn">
              近 8 週沒練（最後一次 {g.lastDate ? shortDate(g.lastDate) : "—"}）。這個週期換動作的話，到設定換成現在練的動作。
            </p>
          )}
          {g.steps.length > 0 && (
            <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${g.steps.length}, minmax(0, 1fr))` }}>
              {g.steps.map(s => (
                <div
                  key={s.name}
                  className={cn(
                    "rounded-md border px-2 py-1.5",
                    g.next?.name === s.name ? "border-brand" : "border-line"
                  )}
                >
                  <div className="flex items-center gap-1 text-[11px] text-dim">
                    <StepIcon s={s} />
                    {s.name}・{shortDate(s.by)}
                  </div>
                  <div className="num text-lg font-semibold">{kg(s.kg)}</div>
                </div>
              ))}
            </div>
          )}
          {g.next ? (
            <p className="mt-2 text-sm">
              <span className="text-dim">下一步：</span>
              {g.next.name}（{shortDate(g.next.by)}）前做到
              <span className="num font-semibold text-brand"> {g.next.set.label}</span>
              {g.next.set.alt ? <span className="text-dim">（或 {g.next.set.alt}）</span> : null}
            </p>
          ) : g.achieved ? (
            <p className="mt-2 text-sm text-ok">已達標，可以到設定把倍數往上調。</p>
          ) : null}
          {g.perWeekKg != null && g.perWeekKg > 0 && (
            <p className="mt-1 text-xs text-dim">
              照目前進度，每週 e1RM 要進步約 {fmt(g.perWeekKg)} kg 才能在 {g.finalBy ? shortDate(g.finalBy) : "最終"} 前達標
              {g.bestE1rm != null && g.bestE1rm !== g.currentE1rm ? `・歷史最佳 ${kg(g.bestE1rm)}` : ""}
            </p>
          )}
        </>
      )}
    </li>
  );
}

/** Compact version for the Today page. */
export function StrengthMini({ goals }: { goals: StrengthGoal[] }) {
  if (goals.length === 0) return null;
  return (
    <Card>
      <CardTitle
        right={
          <Link href="/progress" className="flex items-center text-sm text-dim">
            詳細 <ChevronRight className="size-4" />
          </Link>
        }
      >
        力量目標
      </CardTitle>
      <ul className="space-y-2.5">
        {goals.map(g => (
          <li key={g.exerciseKey}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{g.name}</span>
              <span className="num shrink-0">
                <span className={cn("text-base font-semibold", g.achieved && "text-brand")}>{kg(g.currentE1rm)}</span>
                <span className="text-xs text-dim"> / {kg(g.targetKg)}</span>
              </span>
            </div>
            <PlateBar className="mt-1" value={g.progress} />
            <div className="mt-0.5 text-[11px] text-dim">
              {g.achieved
                ? "已達標"
                : g.next
                  ? `下一步 ${g.next.name}：${g.next.set.label}`
                  : g.startE1rm == null
                    ? `還沒紀錄・目標約 ${g.targetSet.label}`
                    : g.stale
                      ? "近 8 週沒練"
                      : `目標 ${g.targetSet.label}`}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
