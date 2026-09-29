import { AppShell } from "@/components/app/AppShell";
import { Card, CardTitle, LoadError, Pick, numOptions, range, withValue } from "@/components/app/controls";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { DateChips } from "@/components/workout/SessionMeta";
import { dateLabel, fmt, todayLocal } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function Body() {
  return (
    <AppShell title="身體">
      <div className="space-y-4 fade-up">
        <WeightCard />
        <JumpCard />
        <ScanCard />
      </div>
    </AppShell>
  );
}

function WeightCard() {
  const utils = trpc.useUtils();
  const weights = trpc.body.weights.useQuery();
  const scans = trpc.body.scans.useQuery();
  const today = todayLocal();
  const [date, setDate] = useState(today);
  const [value, setValue] = useState<number | null>(null);
  const [fasted, setFasted] = useState(true);

  useEffect(() => {
    if (value != null || weights.isLoading || scans.isLoading) return;
    const last = weights.data?.[0]?.weightKg ?? scans.data?.[scans.data.length - 1]?.weightKg ?? 70;
    setValue(Math.round(last * 10) / 10);
  }, [weights.data, weights.isLoading, scans.data, scans.isLoading, value]);

  const save = trpc.body.saveWeight.useMutation({
    onSuccess: () => {
      toast.success("體重已記錄");
      void utils.body.weights.invalidate();
      void utils.dashboard.summary.invalidate();
    },
    onError: () => toast.error("儲存失敗，請再試一次"),
  });
  const del = trpc.body.deleteWeight.useMutation({
    onSuccess: () => {
      void utils.body.weights.invalidate();
      void utils.dashboard.summary.invalidate();
    },
  });

  const v = value ?? 70;
  const bump = (d: number) => setValue(Math.round((v + d) * 10) / 10);
  const existing = weights.data?.find(w => w.date === date);

  return (
    <Card>
      <CardTitle>體重</CardTitle>
      <DateChips value={date} onChange={setDate} />
      <div className="mt-4 flex items-center gap-2">
        <BumpBtn onClick={() => bump(-0.5)}>−0.5</BumpBtn>
        <BumpBtn onClick={() => bump(-0.1)}>−0.1</BumpBtn>
        <Pick
          big
          className="flex-1 justify-center"
          value={v}
          options={numOptions(withValue(range(45, 110, 0.1), v), x => x.toFixed(1))}
          onChange={setValue}
          suffix="kg"
          ariaLabel="體重"
        />
        <BumpBtn onClick={() => bump(0.1)}>+0.1</BumpBtn>
        <BumpBtn onClick={() => bump(0.5)}>+0.5</BumpBtn>
      </div>
      <label className="mt-3 flex items-center justify-between rounded-lg bg-surface-2 p-3">
        <span className="text-sm">空腹（早上起床、上完廁所）</span>
        <Switch checked={fasted} onCheckedChange={setFasted} />
      </label>
      <button
        type="button"
        disabled={save.isPending}
        onClick={() => save.mutate({ date, weightKg: v, fasted })}
        className="press mt-3 h-12 w-full rounded-lg bg-brand font-semibold text-brand-ink disabled:opacity-50"
      >
        {existing ? `更新${dateLabel(date, today)}的體重` : "記錄體重"}
      </button>
      {weights.data && weights.data.length > 0 && (
        <ul className="mt-4 divide-y divide-line text-sm">
          {weights.data.slice(0, 7).map(w => (
            <li key={w.id} className="flex items-center justify-between py-2">
              <span className="text-dim">{dateLabel(w.date, today)}</span>
              <span className="num text-lg">
                {w.weightKg.toFixed(1)} <span className="text-xs text-dim">{w.fasted ? "空腹" : "非空腹"}</span>
              </span>
              <DeleteBtn onClick={() => del.mutate({ id: w.id })} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function JumpCard() {
  const utils = trpc.useUtils();
  const jumps = trpc.body.jumps.useQuery();
  const settings = trpc.settings.get.useQuery();
  const today = todayLocal();
  const [date, setDate] = useState(today);
  const [reach, setReach] = useState<number | null>(null);
  useEffect(() => {
    if (reach != null || !jumps.data) return;
    const last = jumps.data[jumps.data.length - 1]?.approachReachCm ?? 305;
    setReach(Math.round(last));
  }, [jumps.data, reach]);
  const create = trpc.body.createJump.useMutation({
    onSuccess: () => {
      toast.success("摸高已記錄");
      void utils.body.jumps.invalidate();
      void utils.dashboard.summary.invalidate();
    },
    onError: () => toast.error("儲存失敗，請再試一次"),
  });
  const del = trpc.body.deleteJump.useMutation({
    onSuccess: () => {
      void utils.body.jumps.invalidate();
      void utils.dashboard.summary.invalidate();
    },
  });
  const standing = settings.data?.standingReachCm ?? 238;
  const r = reach ?? 305;

  return (
    <Card>
      <CardTitle>助跑摸高測試</CardTitle>
      <DateChips value={date} onChange={setDate} />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-xs text-dim">助跑摸高</div>
          <Pick big value={r} options={numOptions(withValue(range(280, 340, 1), r))} onChange={setReach} suffix="cm" ariaLabel="助跑摸高" />
        </div>
        <div className="rounded-lg bg-surface-2 p-3">
          <div className="text-xs text-dim">推估跳躍高度</div>
          <div className="num text-3xl font-semibold">
            {r - standing}
            <span className="ml-0.5 text-sm font-sans text-dim">cm</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-dim">
        站立摸高 {standing} cm{settings.data?.standingReachEstimated ? "（依身高估算）" : ""}，
        <Link href="/settings" className="underline">
          實測後可在設定修改
        </Link>
        。同一個地方、熱身後測 3 次取最高。
      </p>
      <button
        type="button"
        disabled={create.isPending}
        onClick={() => create.mutate({ date, approachReachCm: r, standingReachCm: standing, notes: null })}
        className="press mt-3 h-12 w-full rounded-lg bg-brand font-semibold text-brand-ink disabled:opacity-50"
      >
        記錄摸高
      </button>
      {jumps.data && jumps.data.length > 0 && (
        <ul className="mt-4 divide-y divide-line text-sm">
          {[...jumps.data].reverse().slice(0, 6).map(j => (
            <li key={j.id} className="flex items-center justify-between py-2">
              <span className="text-dim">{dateLabel(j.date, today)}</span>
              <span className="num text-lg">{fmt(j.approachReachCm, 0)} cm</span>
              <DeleteBtn onClick={() => del.mutate({ id: j.id })} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type ScanField = { key: string; label: string };
const SCAN_GROUPS: { title: string; fields: ScanField[] }[] = [
  {
    title: "主要數字",
    fields: [
      { key: "ffmKg", label: "去脂體重 Fat Free Mass" },
      { key: "fatMassKg", label: "脂肪 Fat Mass" },
      { key: "weightKg", label: "體重" },
      { key: "muscleMassKg", label: "肌肉量 Muscle Mass" },
    ],
  },
  {
    title: "水分",
    fields: [
      { key: "waterKg", label: "總水分 Water Mass" },
      { key: "ecwKg", label: "細胞外水 ECW" },
      { key: "icwKg", label: "細胞內水 ICW" },
    ],
  },
  {
    title: "分數",
    fields: [
      { key: "boditraxScore", label: "Boditrax Score" },
      { key: "visceralFat", label: "內臟脂肪 Visceral Fat" },
      { key: "cellularIntegrity", label: "Cellular Integrity" },
      { key: "metabolicAge", label: "代謝年齡 Metabolic Age" },
      { key: "physiqueScore", label: "Physique Score" },
      { key: "legMuscleScore", label: "Leg Muscle Score" },
      { key: "bmrScore", label: "BMR Score" },
    ],
  },
  {
    title: "分段肌肉（kg）",
    fields: [
      { key: "muscleCore", label: "軀幹 Core" },
      { key: "muscleLArm", label: "左手 Left Arm" },
      { key: "muscleRArm", label: "右手 Right Arm" },
      { key: "muscleLLeg", label: "左腿 Left Leg" },
      { key: "muscleRLeg", label: "右腿 Right Leg" },
    ],
  },
  {
    title: "分段脂肪（kg）",
    fields: [
      { key: "fatCore", label: "軀幹 Core" },
      { key: "fatLArm", label: "左手 Left Arm" },
      { key: "fatRArm", label: "右手 Right Arm" },
      { key: "fatLLeg", label: "左腿 Left Leg" },
      { key: "fatRLeg", label: "右腿 Right Leg" },
    ],
  },
];
const ALL_SCAN_KEYS = SCAN_GROUPS.flatMap(g => g.fields.map(f => f.key));

function ScanCard() {
  const utils = trpc.useUtils();
  const scans = trpc.body.scans.useQuery();
  const settings = trpc.settings.get.useQuery();
  const [open, setOpen] = useState(false);
  const del = trpc.body.deleteScan.useMutation({
    onSuccess: () => {
      void utils.body.scans.invalidate();
      void utils.dashboard.summary.invalidate();
    },
  });
  const h = (settings.data?.settings.heightCm ?? 179) / 100;
  const today = todayLocal();

  return (
    <Card>
      <CardTitle
        right={
          <button type="button" onClick={() => setOpen(true)} className="press flex h-10 items-center gap-1 rounded-lg bg-surface-2 px-3 text-sm">
            <Plus className="size-4" /> 新增掃描
          </button>
        }
      >
        Boditrax 掃描
      </CardTitle>
      {scans.isError ? (
        <LoadError what="掃描紀錄" onRetry={() => void scans.refetch()} />
      ) : scans.data && scans.data.length > 0 ? (
        <ul className="divide-y divide-line text-sm">
          {[...scans.data].reverse().map(s => (
            <li key={s.id} className="flex items-center gap-2 py-2">
              <span className="w-20 text-dim">{dateLabel(s.date, today)}</span>
              <span className="flex-1 num text-base">
                體脂 {fmt((s.fatMassKg / s.weightKg) * 100)}%・FFMI {fmt(s.ffmKg / (h * h))}・去脂 {fmt(s.ffmKg)}
              </span>
              <DeleteBtn onClick={() => del.mutate({ id: s.id })} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-dim">還沒有掃描紀錄。</p>
      )}
      <p className="mt-2 text-xs text-dim">建議每 4 週、同一台機器、同樣時間（早上空腹）量一次。</p>
      <ScanDialog open={open} onOpenChange={setOpen} last={scans.data?.[scans.data.length - 1] as Record<string, unknown> | undefined} />
    </Card>
  );
}

function ScanDialog({
  open,
  onOpenChange,
  last,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  last?: Record<string, unknown>;
}) {
  const utils = trpc.useUtils();
  const [date, setDate] = useState(todayLocal());
  const [time, setTime] = useState("09:00");
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    for (const k of ALL_SCAN_KEYS) {
      const v = last?.[k];
      init[k] = typeof v === "number" ? String(v) : "";
    }
    setVals(init);
    setDate(todayLocal());
  }, [open, last]);

  const create = trpc.body.createScan.useMutation({
    onSuccess: () => {
      toast.success("掃描已記錄");
      void utils.body.scans.invalidate();
      void utils.dashboard.summary.invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message || "儲存失敗"),
  });

  const num = (k: string): number | null => {
    const raw = (vals[k] ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const submit = () => {
    const ffm = num("ffmKg");
    const fat = num("fatMassKg");
    const weight = num("weightKg") ?? (ffm != null && fat != null ? Math.round((ffm + fat) * 10) / 10 : null);
    if (ffm == null || fat == null || weight == null) {
      toast.error("至少要填去脂體重和脂肪");
      return;
    }
    const payload: Record<string, unknown> = { date, time, location: (last?.location as string) ?? null, notes: null };
    for (const k of ALL_SCAN_KEYS) payload[k] = num(k);
    payload.weightKg = weight;
    payload.ffmKg = ffm;
    payload.fatMassKg = fat;
    create.mutate(payload as Parameters<typeof create.mutate>[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-line bg-background">
        <DialogHeader>
          <DialogTitle>新增 Boditrax 掃描</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-dim">已帶入上次的數字，只改有變的就好。體重可以留空，會用去脂＋脂肪計算。</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-dim">
            日期
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-surface-2 px-2 text-base text-chalk"
            />
          </label>
          <label className="text-xs text-dim">
            時間
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-surface-2 px-2 text-base text-chalk"
            />
          </label>
        </div>
        {SCAN_GROUPS.map(g => (
          <div key={g.title}>
            <div className="mb-1 mt-2 text-sm font-medium">{g.title}</div>
            <div className="grid grid-cols-2 gap-2">
              {g.fields.map(f => (
                <label key={f.key} className="text-xs text-dim">
                  {f.label}
                  <input
                    inputMode="decimal"
                    value={vals[f.key] ?? ""}
                    onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value.replace(/[^0-9.]/g, "") }))}
                    className="num mt-1 h-11 w-full rounded-lg border border-input bg-surface-2 px-3 text-lg text-chalk outline-none focus:border-brand"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled={create.isPending}
          onClick={submit}
          className="press mt-2 h-12 w-full rounded-lg bg-brand font-semibold text-brand-ink disabled:opacity-50"
        >
          {create.isPending ? "儲存中…" : "儲存掃描"}
        </button>
      </DialogContent>
    </Dialog>
  );
}

function BumpBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press num h-14 w-11 shrink-0 rounded-lg border border-line bg-surface-2 text-base">
      {children}
    </button>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);
  return (
    <button
      type="button"
      onClick={() => (confirm ? onClick() : setConfirm(true))}
      className={cn(
        "press flex h-9 items-center justify-center rounded-md px-2 text-xs",
        confirm ? "bg-bad text-brand-ink" : "text-dim"
      )}
      aria-label="刪除"
    >
      {confirm ? "確定刪除" : <X className="size-4" />}
    </button>
  );
}

