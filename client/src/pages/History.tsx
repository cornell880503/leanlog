import { AppShell } from "@/components/app/AppShell";
import { LoadError } from "@/components/app/controls";
import { dateLabel, fmt, todayLocal } from "@/lib/format";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Link } from "wouter";

export default function History() {
  const list = trpc.training.list.useQuery({ limit: 200 });
  const today = todayLocal();

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

  return (
    <AppShell title="歷史">
      {list.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : list.isError ? (
        <LoadError what="歷史紀錄" onRetry={() => void list.refetch()} />
      ) : groups.length === 0 ? (
        <div className="card-iron p-6 text-center">
          <p className="font-medium">還沒有任何訓練紀錄</p>
          <p className="mt-1 text-sm text-dim">回到「今天」點一下訓練日就能開始。</p>
          <Link href="/" className="press mt-4 inline-flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-brand-ink">
            去今天
          </Link>
        </div>
      ) : (
        <div className="space-y-5 fade-up">
          {groups.map(([month, items]) => (
            <section key={month}>
              <h2 className="mb-2 text-sm text-dim">
                {month.slice(0, 4)} 年 {Number(month.slice(5))} 月・{items.length} 次
              </h2>
              <ul className="space-y-2">
                {items.map(s => (
                  <li key={s.id}>
                    <Link href={`/history/${s.id}`} className="press card-iron relative flex items-center gap-3 overflow-hidden p-4 pl-5">
                      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: TYPE_COLOR[s.type] }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold">{TYPE_LABEL[s.type]}</span>
                          <span className="text-sm text-dim">{dateLabel(s.date, today)}</span>
                        </div>
                        <div className="mt-0.5 truncate text-sm text-dim">
                          {s.type === "volleyball"
                            ? [s.vbKind, s.durationMin ? `${s.durationMin} 分鐘` : null, `跳躍 ${s.summary.totalJumps}`, s.kneeStatus ? `膝蓋${s.kneeStatus}` : null]
                                .filter(Boolean)
                                .join("・")
                            : [
                                `${s.exerciseCount} 個動作`,
                                `${s.summary.hardSets} 有效組`,
                                `${fmt(s.summary.volume, 0)} kg`,
                                s.durationMin ? `${s.durationMin} 分` : null,
                              ]
                                .filter(Boolean)
                                .join("・")}
                        </div>
                      </div>
                      {s.srpe != null && (
                        <span className="num rounded bg-surface-2 px-2 py-0.5 text-sm text-dim">sRPE {s.srpe}</span>
                      )}
                      <ChevronRight className="size-5 text-dim" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
