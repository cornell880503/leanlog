import { AppShell } from "@/components/app/AppShell";
import { Card, CardTitle, Chips, LoadError, Pick, numOptions, range, withValue } from "@/components/app/controls";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/_core/hooks/useAuth";
import { todayLocal } from "@/lib/format";
import { TYPE_LABEL } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import { TARGET_MUSCLES } from "@shared/exercises";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STRENGTH_TARGETS,
  MAX_STRENGTH_TARGETS,
  type RotationItem,
  type Settings as S,
  type StrengthTarget,
} from "@shared/settings";
import { useExerciseLibrary } from "@/lib/library";
import { Copy, Download, LogOut, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Form = {
  standingReachCm: number;
  standingReachEstimated: boolean;
  bfMin: number;
  bfMax: number;
  ffmiMin: number;
  ffmiMax: number;
  targetApproachReachCm: number;
  weeklySetTargets: Record<string, [number, number]>;
  rotation: RotationItem[];
  dumbbellStep: number;
  strengthTargets: StrengthTarget[];
};

const ROT_OPTIONS: { value: RotationItem; label: string }[] = [
  { value: "leg", label: TYPE_LABEL.leg },
  { value: "back", label: TYPE_LABEL.back },
  { value: "chest", label: TYPE_LABEL.chest },
  { value: "rest", label: TYPE_LABEL.rest },
];

function toForm(v: { standingReachCm: number; standingReachEstimated: boolean; settings: S }): Form {
  return {
    standingReachCm: v.standingReachCm,
    standingReachEstimated: v.standingReachEstimated,
    bfMin: v.settings.bfMin,
    bfMax: v.settings.bfMax,
    ffmiMin: v.settings.ffmiMin,
    ffmiMax: v.settings.ffmiMax,
    targetApproachReachCm: v.settings.targetApproachReachCm,
    weeklySetTargets: v.settings.weeklySetTargets,
    rotation: v.settings.rotation,
    dumbbellStep: v.settings.dumbbellStep,
    strengthTargets: v.settings.strengthTargets,
  };
}

export default function Settings() {
  const utils = trpc.useUtils();
  const q = trpc.settings.get.useQuery();
  const { user, logout } = useAuth();
  const [form, setForm] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.data && !dirty) setForm(toForm(q.data));
  }, [q.data, dirty]);

  const save = trpc.settings.update.useMutation({
    onSuccess: data => {
      utils.settings.get.setData(undefined, data);
      void utils.dashboard.summary.invalidate();
      void utils.calendar.range.invalidate();
      setDirty(false);
      toast.success("設定已儲存");
    },
    onError: e => toast.error(e.message || "儲存失敗"),
  });

  const set = (patch: Partial<Form>) => {
    setForm(f => (f ? { ...f, ...patch } : f));
    setDirty(true);
  };

  const submit = () => {
    if (!form) return;
    if (!form.rotation.some(r => r !== "rest")) {
      toast.error("輪替裡至少要有一個訓練日");
      return;
    }
    save.mutate({
      standingReachCm: form.standingReachCm,
      standingReachEstimated: form.standingReachEstimated,
      settings: {
        bfMin: Math.min(form.bfMin, form.bfMax),
        bfMax: Math.max(form.bfMin, form.bfMax),
        ffmiMin: Math.min(form.ffmiMin, form.ffmiMax),
        ffmiMax: Math.max(form.ffmiMin, form.ffmiMax),
        targetApproachReachCm: form.targetApproachReachCm,
        weeklySetTargets: form.weeklySetTargets,
        rotation: form.rotation,
        dumbbellStep: form.dumbbellStep as 1 | 2 | 2.5,
        strengthTargets: form.strengthTargets,
      },
    });
  };

  return (
    <AppShell
      title="設定"
      back="/"
      bottom={
        dirty ? (
          <button
            type="button"
            disabled={save.isPending}
            onClick={submit}
            className="press h-14 w-full rounded-xl bg-brand text-lg font-semibold text-brand-ink disabled:opacity-50"
          >
            {save.isPending ? "儲存中…" : "儲存設定"}
          </button>
        ) : undefined
      }
    >
      {!form && q.isError ? (
        <LoadError what="設定" onRetry={() => void q.refetch()} />
      ) : !form ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface" />
      ) : (
        <div className="space-y-4 fade-up">
          <Card>
            <CardTitle>摸高</CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-xs text-dim">站立摸高</div>
                <Pick
                  value={form.standingReachCm}
                  options={numOptions(withValue(range(200, 260, 1), form.standingReachCm))}
                  onChange={v => set({ standingReachCm: v, standingReachEstimated: false })}
                  suffix="cm"
                  ariaLabel="站立摸高"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-dim">目標助跑摸高</div>
                <Pick
                  value={form.targetApproachReachCm}
                  options={numOptions(withValue(range(290, 350, 1), form.targetApproachReachCm))}
                  onChange={v => set({ targetApproachReachCm: v })}
                  suffix="cm"
                  ariaLabel="目標助跑摸高"
                />
              </div>
            </div>
            <label className="mt-3 flex items-center justify-between rounded-lg bg-surface-2 p-3">
              <span className="text-sm">站立摸高是估算值（還沒實測）</span>
              <Switch checked={form.standingReachEstimated} onCheckedChange={v => set({ standingReachEstimated: v })} />
            </label>
            <p className="mt-2 text-xs text-dim">
              站立摸高＝腳跟貼地、單手往上伸直能摸到的高度。預設 238 cm 是依身高 179 cm 的一般比例估算。
            </p>
          </Card>

          <Card>
            <CardTitle>薄肌目標</CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <RangePick
                label="體脂率 %"
                lo={form.bfMin}
                hi={form.bfMax}
                values={range(6, 20, 0.5)}
                onChange={(lo, hi) => set({ bfMin: lo, bfMax: hi })}
              />
              <RangePick
                label="FFMI"
                lo={form.ffmiMin}
                hi={form.ffmiMax}
                values={range(17, 25, 0.1)}
                onChange={(lo, hi) => set({ ffmiMin: lo, ffmiMax: hi })}
                digits={1}
              />
            </div>
            <p className="mt-2 text-xs text-dim">
              預設：體脂 {DEFAULT_SETTINGS.bfMin}–{DEFAULT_SETTINGS.bfMax}%、FFMI {DEFAULT_SETTINGS.ffmiMin}–{DEFAULT_SETTINGS.ffmiMax}
              （身高 {DEFAULT_SETTINGS.heightCm} cm）。
            </p>
          </Card>

          <StrengthTargetsEditor value={form.strengthTargets} onChange={strengthTargets => set({ strengthTargets })} />
          <Card>
            <CardTitle>每週有效組數目標</CardTitle>
            <ul className="space-y-2">
              {TARGET_MUSCLES.map(m => {
                const [lo, hi] = form.weeklySetTargets[m] ?? [0, 0];
                return (
                  <li key={m} className="flex items-center gap-2">
                    <span className="w-12 text-sm text-dim">{m}</span>
                    <Pick
                      className="flex-1"
                      value={lo}
                      options={numOptions(range(0, 30, 1))}
                      onChange={v => set({ weeklySetTargets: { ...form.weeklySetTargets, [m]: [v, Math.max(v, hi)] } })}
                      ariaLabel={`${m} 下限`}
                    />
                    <span className="text-dim">–</span>
                    <Pick
                      className="flex-1"
                      value={hi}
                      options={numOptions(range(0, 30, 1))}
                      onChange={v => set({ weeklySetTargets: { ...form.weeklySetTargets, [m]: [Math.min(lo, v), v] } })}
                      ariaLabel={`${m} 上限`}
                      suffix="組"
                    />
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardTitle
              right={
                <button
                  type="button"
                  onClick={() => set({ rotation: [...DEFAULT_SETTINGS.rotation] })}
                  className="press h-9 rounded-md bg-surface-2 px-3 text-sm"
                >
                  練三休一
                </button>
              }
            >
              訓練輪替
            </CardTitle>
            <ol className="space-y-2">
              {form.rotation.map((r, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="num w-6 text-center text-dim">{i + 1}</span>
                  <Pick
                    className="flex-1 [&>span.num]:font-sans [&>span.num]:text-base"
                    value={r}
                    options={ROT_OPTIONS}
                    onChange={v => set({ rotation: form.rotation.map((x, j) => (j === i ? v : x)) })}
                    ariaLabel={`第 ${i + 1} 天`}
                  />
                  <button
                    type="button"
                    disabled={form.rotation.length <= 1}
                    onClick={() => set({ rotation: form.rotation.filter((_, j) => j !== i) })}
                    className="press flex size-11 items-center justify-center rounded-lg text-dim disabled:opacity-30"
                    aria-label="移除"
                  >
                    <X className="size-5" />
                  </button>
                </li>
              ))}
            </ol>
            {form.rotation.length < 10 && (
              <button
                type="button"
                onClick={() => set({ rotation: [...form.rotation, "rest"] })}
                className="press mt-2 flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-dim text-sm"
              >
                <Plus className="size-4" /> 加一天
              </button>
            )}
            <p className="mt-2 text-xs text-dim">打完排球的隔天會自動建議多休一天，不用放進輪替。</p>
          </Card>

          <Card>
            <CardTitle>啞鈴重量級距</CardTitle>
            <Chips
              columns={3}
              value={form.dumbbellStep}
              onChange={v => set({ dumbbellStep: v })}
              options={[1, 2, 2.5].map(v => ({ value: v, label: `${v} kg` }))}
            />
          </Card>

          <ExportCard />

          <Card>
            <CardTitle>帳號</CardTitle>
            <p className="text-sm text-dim">{user?.name ?? user?.email ?? "已登入"}</p>
            <button
              type="button"
              onClick={() => void logout()}
              className="press mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line text-sm"
            >
              <LogOut className="size-4" /> 登出
            </button>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function RangePick({
  label,
  lo,
  hi,
  values,
  onChange,
  digits = 1,
}: {
  label: string;
  lo: number;
  hi: number;
  values: number[];
  onChange: (lo: number, hi: number) => void;
  digits?: number;
}) {
  const f = (v: number) => v.toFixed(digits).replace(/\.0$/, "");
  return (
    <div>
      <div className="mb-1 text-xs text-dim">{label}</div>
      <div className="space-y-2">
        <Pick label="下限" value={lo} options={numOptions(withValue(values, lo), f)} onChange={v => onChange(v, Math.max(v, hi))} />
        <Pick label="上限" value={hi} options={numOptions(withValue(values, hi), f)} onChange={v => onChange(Math.min(lo, v), v)} />
      </div>
    </div>
  );
}

function ExportCard() {
  const exp = trpc.export.csv.useMutation();

  const copyAll = async () => {
    const build = exp.mutateAsync().then(files => files.map(f => `=== ${f.name} ===\n${f.content.trim()}\n`).join("\n"));
    try {
      // Safari only allows clipboard writes started synchronously inside the tap,
      // so hand it a promise instead of awaiting the data first.
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const blob = build.then(t => new Blob([t], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      } else {
        await navigator.clipboard.writeText(await build);
      }
      toast.success("已複製，直接貼到跟 Manus 的對話就行");
    } catch {
      toast.error("複製失敗，改用下載試試");
    }
  };

  const download = async () => {
    try {
      const files = await exp.mutateAsync();
      const stamp = todayLocal();
      const text = files.map(f => `=== ${f.name} ===\n${f.content.trim()}\n`).join("\n");
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leanlog-export-${stamp}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("匯出失敗");
    }
  };

  return (
    <Card>
      <CardTitle>匯出給 Manus 分析</CardTitle>
      <p className="text-sm text-dim">
        想要更深入的分析或調整課表時，按「複製」然後貼到跟 Manus 的對話裡。內容是 CSV 格式（訓練、組數、體重、掃描、摸高）。
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={exp.isPending}
          onClick={copyAll}
          className="press flex h-12 items-center justify-center gap-2 rounded-lg bg-brand font-semibold text-brand-ink disabled:opacity-50"
        >
          <Copy className="size-4" /> 複製
        </button>
        <button
          type="button"
          disabled={exp.isPending}
          onClick={download}
          className="press flex h-12 items-center justify-center gap-2 rounded-lg border border-line font-semibold disabled:opacity-50"
        >
          <Download className="size-4" /> 下載
        </button>
      </div>
    </Card>
  );
}

const RATIO_VALUES = range(0.3, 2.5, 0.05);

/** Pick lifts and their target e1RM as a multiple of bodyweight. */
function StrengthTargetsEditor({ value, onChange }: { value: StrengthTarget[]; onChange: (v: StrengthTarget[]) => void }) {
  const lib = useExerciseLibrary();
  const summary = trpc.dashboard.summary.useQuery({ today: todayLocal() });
  const bw = summary.data?.strengthGoals[0]?.bodyweightKg ?? summary.data?.weight.latest?.weightKg ?? null;
  // Rep-based lifts that can carry load (skip timed holds and jumps).
  const candidates = lib.all
    .filter(e => !e.archived && e.unit !== "sec" && e.category !== "plyo" && e.category !== "power")
    .sort((a, b) => (a.category === b.category ? 0 : a.category === "compound" ? -1 : 1));
  const used = new Set(value.map(v => v.exerciseKey));
  const optionsFor = (current: string) => {
    const opts = candidates.filter(e => e.key === current || !used.has(e.key)).map(e => ({ value: e.key, label: e.name }));
    if (!opts.some(o => o.value === current)) opts.unshift({ value: current, label: lib.lookup(current)?.name ?? "（已刪除的動作）" });
    return opts;
  };
  const update = (i: number, patch: Partial<StrengthTarget>) => onChange(value.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const add = () => {
    const next = candidates.find(e => !used.has(e.key));
    if (next) onChange([...value, { exerciseKey: next.key, ratio: 1 }]);
  };
  return (
    <Card>
      <div id="strength" className="scroll-mt-20" />
      <CardTitle>力量目標</CardTitle>
      <p className="mb-3 text-xs leading-relaxed text-dim">
        目標＝e1RM 是體重的幾倍{bw ? `（目前體重 ${bw} kg）` : ""}。引體向上、雙槓等徒手動作的重量含體重。換週期換動作時，在這裡換成現在練的動作。
      </p>
      <ul className="space-y-2">
        {value.map((t, i) => {
          const kg = bw ? Math.round((t.ratio * bw) / 2.5) * 2.5 : null;
          return (
            <li key={t.exerciseKey} className="flex items-center gap-2">
              <Pick
                value={t.exerciseKey}
                options={optionsFor(t.exerciseKey)}
                onChange={k => update(i, { exerciseKey: k })}
                className="min-w-0 flex-1 [&_span.num]:font-sans [&_span.num]:text-base [&_span.num]:text-left [&_span.num]:truncate"
                ariaLabel="動作"
              />
              <Pick
                value={t.ratio}
                options={numOptions(withValue(RATIO_VALUES, t.ratio), v => `${v.toFixed(2)}×`)}
                onChange={r => update(i, { ratio: r })}
                className="w-24"
                ariaLabel="倍數"
              />
              <span className="num w-14 text-right text-sm text-dim">{kg != null ? `${kg} kg` : ""}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="press flex size-10 shrink-0 items-center justify-center rounded-lg text-dim"
                aria-label="移除"
              >
                <X className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex gap-2">
        {value.length < MAX_STRENGTH_TARGETS && (
          <button type="button" onClick={add} className="press flex h-10 items-center gap-1 rounded-lg border border-line px-3 text-sm">
            <Plus className="size-4" /> 新增動作
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange(DEFAULT_STRENGTH_TARGETS)}
          className="press h-10 rounded-lg px-3 text-sm text-dim"
        >
          恢復預設
        </button>
      </div>
    </Card>
  );
}
