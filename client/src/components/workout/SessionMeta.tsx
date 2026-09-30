import { Card, Chips, Pick, numOptions, range, withValue } from "@/components/app/controls";
import { addDays } from "@shared/analytics";
import { dateLabel, fmt, todayLocal } from "@/lib/format";
import { TARGET_MUSCLES } from "@shared/exercises";
import type { PrRecord, SessionSummary } from "@shared/analytics";
import { CalendarDays, Trophy } from "lucide-react";

export const SRPE_HINT: Record<number, string> = {
  1: "非常輕鬆",
  2: "輕鬆",
  3: "偏輕",
  4: "普通",
  5: "有點累",
  6: "累",
  7: "很累",
  8: "非常累",
  9: "接近極限",
  10: "極限",
};

export function DateChips({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const today = todayLocal();
  const days = [today, addDays(today, -1), addDays(today, -2), addDays(today, -3)];
  const options = days.map(d => ({ value: d, label: dateLabel(d, today) }));
  if (!days.includes(value)) options.push({ value, label: dateLabel(value, today) });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chips value={value} onChange={onChange} options={options} size="sm" />
      {/* Native picker: the system date wheel on phones; future dates are blocked. */}
      <label className="press relative flex h-9 items-center gap-1 rounded-lg border border-dashed border-input px-2 text-sm text-dim">
        <CalendarDays className="size-4" />
        其他日期
        <input
          type="date"
          aria-label="選其他日期"
          className="absolute inset-0 h-full w-full opacity-0"
          value={value}
          max={today}
          onChange={e => {
            const v = e.target.value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= today) onChange(v);
          }}
        />
      </label>
    </div>
  );
}

export function SessionMetaFields({
  date,
  durationMin,
  srpe,
  notes,
  onChange,
}: {
  date: string;
  durationMin: number;
  srpe: number | null;
  notes: string;
  onChange: (patch: Partial<{ date: string; durationMin: number; srpe: number | null; notes: string }>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-sm text-dim">日期</div>
        <DateChips value={date} onChange={d => onChange({ date: d })} />
      </div>
      <div>
        <div className="mb-1.5 text-sm text-dim">訓練時長（自動計算，可改）</div>
        <Pick
          big
          value={durationMin}
          options={numOptions(withValue(range(10, 240, 5), durationMin))}
          onChange={v => onChange({ durationMin: v })}
          suffix="分鐘"
          ariaLabel="訓練時長"
        />
      </div>
      <div>
        <div className="mb-1.5 text-sm text-dim">整體有多累？（sRPE）</div>
        <Chips
          columns={5}
          value={srpe}
          onChange={v => onChange({ srpe: v })}
          options={range(1, 10, 1).map(v => ({ value: v, label: String(v), hint: SRPE_HINT[v] }))}
          size="lg"
        />
      </div>
      <div>
        <div className="mb-1.5 text-sm text-dim">備註（選填）</div>
        <textarea
          value={notes}
          onChange={e => onChange({ notes: e.target.value })}
          rows={2}
          maxLength={500}
          className="w-full rounded-lg border border-input bg-surface-2 p-3 text-base outline-none focus:border-brand"
          placeholder="例如：右膝有點緊"
        />
      </div>
    </div>
  );
}

export interface ExerciseCompare {
  key: string;
  name: string;
  volume: number;
  prevVolume: number | null;
  bestE1rm: number | null;
  prevE1rm: number | null;
}

export function SummaryView({
  summary,
  prs,
  compare,
  targets,
}: {
  summary: SessionSummary;
  prs: PrRecord[];
  compare: ExerciseCompare[];
  targets: Record<string, [number, number]>;
}) {
  const muscles = TARGET_MUSCLES.filter(m => (summary.muscleSets[m] ?? 0) > 0);
  return (
    <div className="space-y-4 fade-up">
      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Big label="總容量" value={fmt(summary.volume, 0)} unit="kg" />
          <Big label="有效組數" value={String(summary.hardSets)} unit="組" />
          <Big label="跳躍" value={String(summary.totalJumps)} unit="下" />
        </div>
      </Card>

      {prs.length > 0 && (
        <Card className="border-brand">
          <div className="mb-2 flex items-center gap-2 font-semibold text-brand">
            <Trophy className="size-5" /> 新紀錄
          </div>
          <ul className="space-y-1">
            {prs.map(p => (
              <li key={p.key} className="flex justify-between">
                <span>{p.name}</span>
                <span className="num text-lg">
                  e1RM {fmt(p.e1rm)}
                  {p.previousBest != null && <span className="ml-1 text-sm text-dim">（原 {fmt(p.previousBest)}）</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-2 font-semibold">各肌群有效組數</div>
        {muscles.length ? (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            {muscles.map(m => (
              <li key={m} className="flex justify-between text-sm">
                <span className="text-dim">{m}</span>
                <span className="num text-base">
                  {fmt(summary.muscleSets[m])} <span className="text-dim">/ 週目標 {targets[m]?.[0]}–{targets[m]?.[1]}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-dim">這次沒有計入肌肥大的有效組（熱身、增強式、爆發力不算）。</p>
        )}
        <p className="mt-2 text-xs text-dim">主要肌群算 1 組、次要算 0.5 組；RPE 低於 7 的組不算。</p>
      </Card>

      {compare.length > 0 && (
        <Card>
          <div className="mb-2 font-semibold">跟上次比</div>
          <ul className="divide-y divide-line">
            {compare.map(c => (
              <li key={c.key} className="flex items-center justify-between py-2 text-sm">
                <span className="flex-1 truncate">{c.name}</span>
                <Delta label="容量" now={c.volume} before={c.prevVolume} digits={0} />
                <Delta label="e1RM" now={c.bestE1rm} before={c.prevE1rm} digits={1} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Big({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="num text-3xl font-semibold">
        {value}
        <span className="ml-0.5 text-xs font-sans text-dim">{unit}</span>
      </div>
      <div className="text-xs text-dim">{label}</div>
    </div>
  );
}

function Delta({ label, now, before, digits }: { label: string; now: number | null; before: number | null; digits: number }) {
  if (now == null || now === 0) return <span className="w-24 text-right text-dim">—</span>;
  if (before == null || before === 0)
    return (
      <span className="w-24 text-right text-dim">
        {label} <span className="num text-chalk">{fmt(now, digits)}</span>
      </span>
    );
  const d = now - before;
  const color = d > 0.05 ? "text-ok" : d < -0.05 ? "text-bad" : "text-dim";
  return (
    <span className={`w-24 text-right ${color}`}>
      {label} <span className="num text-base">{d > 0 ? "+" : ""}{fmt(d, digits)}</span>
    </span>
  );
}
