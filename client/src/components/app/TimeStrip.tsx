import { TYPE_COLOR, TYPE_SHORT } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { addDays, type PlanDay, type TimelineDay } from "@shared/analytics";
import type { SessionType } from "@shared/exercises";
import { Link } from "wouter";

const WD = ["日", "一", "二", "三", "四", "五", "六"];

function wd(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return WD[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
}

function dayNum(d: string): number {
  return Number(d.slice(8, 10));
}

/**
 * Past 6 days (what actually happened) + today + next 3 days (projected from
 * the rotation). Past and today link to that day in the calendar.
 */
export function TimeStrip({
  today,
  timeline,
  upcoming,
}: {
  today: string;
  timeline: TimelineDay[];
  upcoming: PlanDay[];
}) {
  const past = timeline.filter(t => t.date < today).slice(-6);
  const todayDone = timeline.find(t => t.date === today)?.types ?? [];
  const todayPlan = upcoming.find(u => u.date === today);
  const future = [1, 2, 3].map(i => {
    const d = addDays(today, i);
    return upcoming.find(u => u.date === d) ?? { date: d, type: "rest" as const, maybeVolleyball: false };
  });

  return (
    <div>
      <div className="grid grid-cols-10 gap-1">
        {past.map(t => (
          <Link key={t.date} href={`/history?d=${t.date}`} className="press flex flex-col items-center gap-1">
            <DayHead d={t.date} />
            <Cell types={t.types} />
          </Link>
        ))}
        <Link href={`/history?d=${today}`} className="press flex flex-col items-center gap-1">
          <DayHead d={today} today />
          {todayDone.length ? (
            <Cell types={todayDone} ring />
          ) : (
            <PlanCell type={todayPlan?.type ?? "rest"} ring />
          )}
        </Link>
        {future.map(u => (
          <div key={u.date} className="flex flex-col items-center gap-1 opacity-80">
            <DayHead d={u.date} />
            <PlanCell type={u.type} vb={u.maybeVolleyball} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-dim">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-chalk/80" />
          實際
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm border border-dashed border-dim" />
          預排（照循環）
        </span>
        <span>空白＝休息・點日期看當天</span>
      </div>
    </div>
  );
}

function DayHead({ d, today }: { d: string; today?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center leading-none", today ? "text-brand" : "text-dim")}>
      <span className="text-[10px]">{today ? "今天" : wd(d)}</span>
      <span className={cn("num mt-0.5 text-sm", today && "font-bold")}>{dayNum(d)}</span>
    </div>
  );
}

function Cell({ types, ring }: { types: SessionType[]; ring?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-11 w-full flex-col overflow-hidden rounded-md bg-surface-2",
        ring && "ring-2 ring-brand ring-offset-1 ring-offset-background"
      )}
    >
      {types.length === 0 ? (
        <span className="m-auto text-[10px] text-dim/60">休</span>
      ) : (
        types.slice(0, 2).map(t => (
          <span
            key={t}
            className="flex flex-1 items-center justify-center text-xs font-bold text-brand-ink"
            style={{ background: TYPE_COLOR[t] }}
          >
            {TYPE_SHORT[t]}
          </span>
        ))
      )}
    </div>
  );
}

function PlanCell({ type, vb, ring }: { type: SessionType | "rest"; vb?: boolean; ring?: boolean }) {
  const rest = type === "rest";
  return (
    <div
      className={cn(
        "relative flex h-11 w-full items-center justify-center rounded-md border border-dashed text-xs font-bold",
        ring && "ring-2 ring-brand ring-offset-1 ring-offset-background"
      )}
      style={{ borderColor: rest ? "#30353d" : TYPE_COLOR[type], color: rest ? "#8a9099" : TYPE_COLOR[type] }}
    >
      {TYPE_SHORT[type]}
      {vb && (
        <span className="absolute -bottom-0.5 text-[9px] font-normal" style={{ color: TYPE_COLOR.volleyball }}>
          球?
        </span>
      )}
    </div>
  );
}
