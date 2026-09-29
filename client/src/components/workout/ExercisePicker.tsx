import { Chips } from "@/components/app/controls";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  ALL_MUSCLES,
  CATEGORY_LABEL,
  DAY_TYPES,
  EQUIPMENT_LABEL,
  SESSION_LABEL,
  exerciseMatches,
  type Category,
  type Equipment,
  type ExerciseDef,
  type SessionType,
  type StrengthDay,
} from "@shared/exercises";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export function ExercisePicker({
  open,
  onOpenChange,
  type,
  all,
  recentKeys,
  excludeKeys,
  title,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: SessionType;
  all: ExerciseDef[];
  recentKeys: string[];
  excludeKeys: string[];
  title: string;
  onPick: (key: string) => void;
}) {
  const [tab, setTab] = useState<"day" | "all">("day");
  const [muscle, setMuscle] = useState<string>("全部");
  const [q, setQ] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const isStrengthDay = (DAY_TYPES as readonly string[]).includes(type);

  const filtered = useMemo(() => {
    return all.filter(ex => {
      if (tab === "day" && isStrengthDay && !ex.days.includes(type as StrengthDay)) return false;
      if (muscle !== "全部" && !ex.primary.includes(muscle as never) && !ex.secondary.includes(muscle as never)) return false;
      return exerciseMatches(ex, q);
    });
  }, [all, tab, muscle, q, type, isStrengthDay]);

  const recent = useMemo(() => {
    const set = new Set(filtered.map(e => e.key));
    return recentKeys.filter(k => set.has(k)).map(k => filtered.find(e => e.key === k)!).slice(0, 8);
  }, [filtered, recentKeys]);

  const groups = useMemo(() => {
    const m = new Map<string, ExerciseDef[]>();
    for (const ex of filtered) {
      const list = m.get(ex.group) ?? [];
      list.push(ex);
      m.set(ex.group, list);
    }
    return Array.from(m.entries());
  }, [filtered]);

  const pick = (key: string) => {
    onPick(key);
    onOpenChange(false);
    setQ("");
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[88dvh] border-line bg-background">
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-2 px-4">
            <div className="grid grid-cols-2 gap-2">
              {(["day", "all"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "press h-10 rounded-lg border font-medium",
                    tab === t ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface-2"
                  )}
                >
                  {t === "day" ? (isStrengthDay ? `${SESSION_LABEL[type]}常用` : "全部動作") : "全部"}
                </button>
              ))}
            </div>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
              {["全部", ...ALL_MUSCLES].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMuscle(m)}
                  className={cn(
                    "press h-8 shrink-0 rounded-full border px-3 text-sm",
                    muscle === m ? "border-chalk bg-chalk text-brand-ink" : "border-line text-dim"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3">
              <Search className="size-4 text-dim" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="搜尋（選填）"
                className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-dim"
              />
            </label>
          </div>
          <div className="mt-2 flex-1 overflow-y-auto px-4 pb-6">
            {recent.length > 0 && (
              <Section title="最近做過">
                {recent.map(ex => (
                  <Row key={`r-${ex.key}`} ex={ex} added={excludeKeys.includes(ex.key)} onClick={() => pick(ex.key)} />
                ))}
              </Section>
            )}
            {groups.map(([g, list]) => (
              <Section key={g} title={g}>
                {list.map(ex => (
                  <Row key={ex.key} ex={ex} added={excludeKeys.includes(ex.key)} onClick={() => pick(ex.key)} />
                ))}
              </Section>
            ))}
            {filtered.length === 0 && <p className="py-8 text-center text-dim">沒有符合的動作</p>}
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className="press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-dim text-chalk"
            >
              <Plus className="size-4" /> 找不到？新增自訂動作
            </button>
          </div>
        </DrawerContent>
      </Drawer>
      <CustomExerciseDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        defaultDay={isStrengthDay ? (type as StrengthDay) : "leg"}
        onCreated={key => {
          setCustomOpen(false);
          pick(key);
        }}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-xs font-medium text-dim">{title}</div>
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">{children}</div>
    </div>
  );
}

function Row({ ex, added, onClick }: { ex: ExerciseDef; added: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press flex min-h-12 w-full items-center gap-3 bg-surface px-3 py-2 text-left">
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{ex.name}</div>
        <div className="truncate text-xs text-dim">
          {EQUIPMENT_LABEL[ex.equipment]}・{CATEGORY_LABEL[ex.category]}
          {ex.primary.length > 0 && `・${ex.primary.join("、")}`}
        </div>
      </div>
      {added ? <span className="text-xs text-brand">已加入</span> : <Plus className="size-5 text-dim" />}
    </button>
  );
}

const BW_FACTORS = [0, 0.3, 0.5, 0.65, 0.8, 0.9, 1];

function MultiChips({ values, options, onChange }: { values: string[]; options: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const on = values.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? values.filter(x => x !== o) : [...values, o])}
            className={cn(
              "press h-9 rounded-md border px-3 text-sm",
              on ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface-2"
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function CustomExerciseDialog({
  open,
  onOpenChange,
  defaultDay,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDay: StrengthDay;
  onCreated: (key: string) => void;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [days, setDays] = useState<string[]>([SESSION_LABEL[defaultDay]]);
  const [primary, setPrimary] = useState<string[]>([]);
  const [secondary, setSecondary] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<Equipment>("machine");
  const [category, setCategory] = useState<Category>("isolation");
  const [unit, setUnit] = useState<"reps" | "sec">("reps");
  const [bwFactor, setBwFactor] = useState(0);
  const create = trpc.exercises.createCustom.useMutation({
    onSuccess: async res => {
      await utils.exercises.custom.invalidate();
      toast.success("已新增動作");
      setName("");
      setPrimary([]);
      setSecondary([]);
      onCreated(res.key);
    },
    onError: e => toast.error(e.message || "新增失敗"),
  });
  const dayLabelToKey = (l: string) => DAY_TYPES.find(d => SESSION_LABEL[d] === l)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-line bg-background">
        <DialogHeader>
          <DialogTitle>新增自訂動作</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="名稱">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={40}
              placeholder="例如：單手纜繩划船"
              className="h-11 w-full rounded-lg border border-input bg-surface-2 px-3 text-base outline-none focus:border-brand"
            />
          </Field>
          <Field label="哪幾天會做">
            <MultiChips values={days} options={DAY_TYPES.map(d => SESSION_LABEL[d])} onChange={setDays} />
          </Field>
          <Field label="主要肌群（算 1 組）">
            <MultiChips values={primary} options={[...ALL_MUSCLES]} onChange={setPrimary} />
          </Field>
          <Field label="次要肌群（算 0.5 組）">
            <MultiChips values={secondary} options={[...ALL_MUSCLES]} onChange={setSecondary} />
          </Field>
          <Field label="器材">
            <Chips
              size="sm"
              value={equipment}
              onChange={setEquipment}
              options={(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map(k => ({ value: k, label: EQUIPMENT_LABEL[k] }))}
            />
          </Field>
          <Field label="類型">
            <Chips
              size="sm"
              value={category}
              onChange={setCategory}
              options={(Object.keys(CATEGORY_LABEL) as Category[]).map(k => ({ value: k, label: CATEGORY_LABEL[k] }))}
            />
          </Field>
          <Field label="記錄方式">
            <Chips
              size="sm"
              value={unit}
              onChange={setUnit}
              options={[
                { value: "reps", label: "次數" },
                { value: "sec", label: "秒數" },
              ]}
            />
          </Field>
          {equipment === "bodyweight" && (
            <Field label="自身體重算幾成（算容量用）">
              <Chips
                size="sm"
                value={bwFactor}
                onChange={setBwFactor}
                options={BW_FACTORS.map(v => ({ value: v, label: v === 0 ? "不算" : `${Math.round(v * 100)}%` }))}
              />
            </Field>
          )}
          <button
            type="button"
            disabled={!name.trim() || days.length === 0 || create.isPending}
            onClick={() =>
              create.mutate({
                name: name.trim(),
                days: days.map(dayLabelToKey),
                primaryMuscles: primary,
                secondaryMuscles: secondary.filter(m => !primary.includes(m)),
                equipment,
                category,
                unit,
                bwFactor: equipment === "bodyweight" ? bwFactor : 0,
              })
            }
            className="press h-12 w-full rounded-lg bg-brand font-semibold text-brand-ink disabled:opacity-40"
          >
            {create.isPending ? "儲存中…" : "新增並加入"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm text-dim">{label}</div>
      {children}
    </div>
  );
}
