import { AppShell } from "@/components/app/AppShell";
import { Card, Chips } from "@/components/app/controls";
import { DateChips } from "@/components/workout/SessionMeta";
import { todayLocal, uid, usePastDateParam } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export const VB_KINDS = ["練習", "比賽", "休閒"];
export const VB_DURATIONS = [60, 90, 120, 150, 180];
export const VB_INTENSITY = [
  { value: 4, label: "輕鬆" },
  { value: 6, label: "普通" },
  { value: 7, label: "累" },
  { value: 9, label: "很累" },
];
export const VB_JUMPS = [
  { value: 40, label: "少", hint: "約 40 下" },
  { value: 80, label: "中", hint: "約 80 下" },
  { value: 120, label: "多", hint: "約 120 下" },
  { value: 160, label: "很多", hint: "約 160 下" },
];
export const KNEE = ["沒事", "有點緊", "會痛"];

export interface VolleyballValues {
  date: string;
  vbKind: string;
  durationMin: number;
  srpe: number;
  jumps: number;
  kneeStatus: string;
}

export function VolleyballForm({
  value,
  onChange,
}: {
  value: VolleyballValues;
  onChange: (v: VolleyballValues) => void;
}) {
  const set = (patch: Partial<VolleyballValues>) => onChange({ ...value, ...patch });
  const nearest = <T extends { value: number }>(list: T[], v: number) =>
    list.reduce((a, b) => (Math.abs(b.value - v) < Math.abs(a.value - v) ? b : a)).value;
  return (
    <div className="space-y-5">
      <Group label="日期">
        <DateChips value={value.date} onChange={d => set({ date: d })} />
      </Group>
      <Group label="類型">
        <Chips columns={3} value={value.vbKind} onChange={v => set({ vbKind: v })} options={VB_KINDS.map(k => ({ value: k, label: k }))} />
      </Group>
      <Group label="時長（分鐘）">
        <Chips
          columns={5}
          value={value.durationMin}
          onChange={v => set({ durationMin: v })}
          options={VB_DURATIONS.map(d => ({ value: d, label: String(d) }))}
        />
      </Group>
      <Group label="強度">
        <Chips columns={4} value={nearest(VB_INTENSITY, value.srpe)} onChange={v => set({ srpe: v })} options={VB_INTENSITY} />
      </Group>
      <Group label="跳躍量">
        <Chips columns={4} value={nearest(VB_JUMPS, value.jumps)} onChange={v => set({ jumps: v })} options={VB_JUMPS} />
      </Group>
      <Group label="膝蓋">
        <Chips columns={3} value={value.kneeStatus} onChange={v => set({ kneeStatus: v })} options={KNEE.map(k => ({ value: k, label: k }))} />
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-sm text-dim">{label}</div>
      {children}
    </div>
  );
}

export default function Volleyball() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [clientId] = useState(() => uid());
  const dateParam = usePastDateParam();
  const [v, setV] = useState<VolleyballValues>({
    date: dateParam ?? todayLocal(),
    vbKind: "練習",
    durationMin: 120,
    srpe: 6,
    jumps: 80,
    kneeStatus: "沒事",
  });
  const create = trpc.training.create.useMutation({
    onSuccess: () => {
      toast.success("排球已記錄");
      void utils.dashboard.summary.invalidate();
      void utils.calendar.range.invalidate();
      void utils.training.list.invalidate();
      navigate("/");
    },
    onError: () => toast.error("上傳失敗，請再按一次儲存"),
  });

  return (
    <AppShell
      title="排球"
      back="/"
      bottom={
        <button
          type="button"
          disabled={create.isPending}
          onClick={() =>
            create.mutate({
              clientId,
              date: v.date,
              type: "volleyball",
              startedAt: null,
              endedAt: null,
              durationMin: v.durationMin,
              srpe: v.srpe,
              jumps: v.jumps,
              vbKind: v.vbKind,
              kneeStatus: v.kneeStatus,
              notes: null,
              sets: [],
            })
          }
          className="press h-14 w-full rounded-xl bg-brand text-lg font-semibold text-brand-ink disabled:opacity-50"
        >
          {create.isPending ? "儲存中…" : "儲存"}
        </button>
      }
    >
      <Card>
        <VolleyballForm value={v} onChange={setV} />
      </Card>
      <p className="mt-3 text-xs text-dim">
        跳躍量會計入每週跳躍次數；打完球的隔天，今天頁面會建議多休一天再練。
      </p>
    </AppShell>
  );
}
