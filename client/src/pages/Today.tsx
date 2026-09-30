import { AppShell } from "@/components/app/AppShell";
import { StrengthMini } from "@/components/app/StrengthGoals";
import { TimeStrip } from "@/components/app/TimeStrip";
import { Card, CardTitle, LoadError } from "@/components/app/controls";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDraftPeek, writeDraft } from "@/lib/draft";
import { dateLabel, dayOfWeek, daysAgo, fmt, mdw, shortDate, todayLocal, weekNumber, weekdayLabel } from "@/lib/format";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { isLegWarningDay, setStatus, type Suggestion } from "@shared/analytics";
import { TARGET_MUSCLES, type SessionType } from "@shared/exercises";
import { AlertTriangle, ChevronRight, Scale, Timer } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const STRENGTH: SessionType[] = ["leg", "back", "chest"];

export default function Today() {
  const today = todayLocal();
  const [, navigate] = useLocation();
  const summary = trpc.dashboard.summary.useQuery({ today });
  const draft = useDraftPeek();
  const [legAsk, setLegAsk] = useState(false);
  const [switchTo, setSwitchTo] = useState<SessionType | null>(null);

  const start = (type: SessionType, skipLegCheck = false) => {
    if (type === "volleyball") {
      navigate("/volleyball");
      return;
    }
    if (type === "leg" && !skipLegCheck && isLegWarningDay(today)) {
      setLegAsk(true);
      return;
    }
    if (draft && draft.type !== type) {
      setSwitchTo(type);
      return;
    }
    navigate(`/workout/${type}`);
  };

  const s = summary.data;
  const suggestion = s?.suggestion;
  const week = s?.weeks[s.weeks.length - 1];
  const doneSets = draft ? draft.exercises.reduce((a, e) => a + e.sets.filter(x => x.done).length, 0) : 0;

  return (
    <AppShell title="今天">
      <div className="space-y-4 fade-up">
        {draft && (
          <Link
            href={`/workout/${draft.type}`}
            className="press flex items-center gap-3 rounded-xl border border-brand bg-brand/10 p-4"
          >
            <Timer className="size-6 text-brand" />
            <div className="flex-1">
              <div className="font-semibold">進行中：{TYPE_LABEL[draft.type]}</div>
              <div className="text-sm text-dim">
                已完成 {doneSets} 組{draft.finishing ? "・還沒上傳成功，點進去重試" : ""}
              </div>
            </div>
            <span className="font-semibold text-brand">繼續</span>
          </Link>
        )}

        <Card>
          <div className="flex items-end justify-between gap-2 border-b border-line pb-3">
            <div className="flex items-baseline gap-2">
              <span className="num text-3xl font-bold">{shortDate(today)}</span>
              <span className="text-lg font-semibold">{weekdayLabel(today)}</span>
            </div>
            <span className="text-xs text-dim">
              {today.slice(0, 4)} 第 {weekNumber(today)} 週・本週第 {dayOfWeek(today)} 天
            </span>
          </div>
          {s && <LastSessionLine last={s.lastSession} today={today} />}
          <div className="mt-3 text-xs text-dim">今天建議</div>
          {suggestion ? (
            <>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-bold" style={{ color: TYPE_COLOR[suggestion.type] }}>
                  {TYPE_LABEL[suggestion.type]}
                </span>
                {suggestion.type === "rest" && (
                  <span className="text-sm text-dim">下一次：{TYPE_LABEL[suggestion.nextStrength]}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-dim">{suggestion.reason}</p>
              <BasisLine suggestion={suggestion} today={today} />
              {suggestion.legWarning && (
                <p className="mt-3 flex gap-2 rounded-lg bg-warn/10 p-3 text-sm text-warn">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  如果明天要打球，建議今天不要練腿，可以跟背日或胸日對調。
                </p>
              )}
            </>
          ) : (
            summary.isError ? (
            <div className="mt-2">
              <LoadError what="今日建議" onRetry={() => void summary.refetch()} />
            </div>
          ) : (
            <div className="mt-2 h-10 w-32 animate-pulse rounded bg-surface-2" />
          )
          )}
          {s && (
            <div className="mt-4 border-t border-line pt-3">
              <TimeStrip today={today} timeline={s.timeline} upcoming={s.upcoming} />
            </div>
          )}
        </Card>

        <div>
          <div className="mb-2 text-sm text-dim">點一下就開始</div>
          <div className="grid grid-cols-3 gap-2">
            {STRENGTH.map(t => (
              <StartButton
                key={t}
                type={t}
                highlight={suggestion?.type === t}
                onClick={() => start(t)}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <StartButton type="volleyball" onClick={() => start("volleyball")} />
            <StartButton type="other" onClick={() => start("other")} />
          </div>
        </div>

        <Card>
          <CardTitle
            right={
              <Link href="/progress" className="flex items-center text-sm text-dim">
                詳細 <ChevronRight className="size-4" />
              </Link>
            }
          >
            本週（週一起算）
          </CardTitle>
          {week ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat label="重訓" value={week.strengthSessions} unit="次" />
                <MiniStat label="排球" value={week.volleyballSessions} unit="次" />
                <MiniStat label="跳躍" value={week.jumps} unit="下" />
              </div>
              <div className="mt-4 grid grid-cols-5 gap-y-3">
                {TARGET_MUSCLES.map(m => {
                  const v = week.muscleSets[m] ?? 0;
                  const target = s!.weeklyTargets[m] ?? [0, 0];
                  const st = setStatus(v, target);
                  return (
                    <div key={m} className="flex flex-col items-center gap-1">
                      <span
                        className={cn(
                          "size-3 rounded-full",
                          st === "ok" ? "bg-ok" : st === "low" ? (v > 0 ? "bg-warn" : "bg-line") : "bg-bad"
                        )}
                      />
                      <span className="text-xs text-dim">{m}</span>
                      <span className="num text-sm">
                        {fmt(v)}/{target[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-dim">
                圓點：綠＝達標、黃＝還不夠、紅＝超過上限。數字是「有效組數／目標下限」。
              </p>
              {(week.loadSpike || week.jumpSpike) && (
                <p className="mt-3 flex gap-2 rounded-lg bg-bad/10 p-3 text-sm text-bad">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {week.loadSpike && `本週訓練負荷是前三週平均的 ${fmt(week.loadRatio, 1)} 倍。`}
                  {week.jumpSpike && `跳躍量是前三週平均的 ${fmt(week.jumpRatio, 1)} 倍。`}
                  注意膝蓋和恢復。
                </p>
              )}
            </>
          ) : (
            summary.isError ? (
            <p className="text-sm text-dim">本週摘要暫時讀不到，按上方「重新載入」。</p>
          ) : (
            <div className="h-24 animate-pulse rounded bg-surface-2" />
          )
          )}
        </Card>

        {s && <StrengthMini goals={s.strengthGoals} />}

        <Link href="/body" className="press card-iron flex items-center gap-3 p-4">
          <Scale className="size-5 text-dim" />
          <div className="flex-1">
            <div className="font-medium">記體重</div>
            <div className="text-sm text-dim">
              {s?.weight.latest
                ? `上次 ${fmt(s.weight.latest.weightKg)} kg（${dateLabel(s.weight.latest.date, today)}）`
                : "早上空腹量最準"}
            </div>
          </div>
          <ChevronRight className="size-5 text-dim" />
        </Link>
      </div>

      <AlertDialog open={legAsk} onOpenChange={setLegAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>明天要打球嗎？</AlertDialogTitle>
            <AlertDialogDescription>
              如果明天要打球，建議今天不要練腿（會影響跳躍，也增加膝蓋負擔），可以跟背日或胸日對調。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <button
              type="button"
              className="press h-12 rounded-lg border border-back text-back font-semibold"
              onClick={() => {
                setLegAsk(false);
                start("back");
              }}
            >
              換成背日
            </button>
            <button
              type="button"
              className="press h-12 rounded-lg border border-chest text-chest font-semibold"
              onClick={() => {
                setLegAsk(false);
                start("chest");
              }}
            >
              換成胸日
            </button>
            <button
              type="button"
              className="press h-12 rounded-lg bg-surface-2 font-semibold"
              onClick={() => {
                setLegAsk(false);
                start("leg", true);
              }}
            >
              照樣練腿
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={switchTo != null} onOpenChange={o => !o && setSwitchTo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>還有一個進行中的{draft ? TYPE_LABEL[draft.type] : ""}</AlertDialogTitle>
            <AlertDialogDescription>要繼續它，還是捨棄後開始{switchTo ? TYPE_LABEL[switchTo] : ""}？</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <button
              type="button"
              className="press h-12 rounded-lg bg-brand font-semibold text-brand-ink"
              onClick={() => {
                const t = draft?.type;
                setSwitchTo(null);
                if (t) navigate(`/workout/${t}`);
              }}
            >
              繼續{draft ? TYPE_LABEL[draft.type] : ""}
            </button>
            <button
              type="button"
              className="press h-12 rounded-lg border border-bad font-semibold text-bad"
              onClick={() => {
                const t = switchTo;
                writeDraft(null);
                setSwitchTo(null);
                if (t) navigate(`/workout/${t}`);
              }}
            >
              捨棄並開始{switchTo ? TYPE_LABEL[switchTo] : ""}
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function StartButton({ type, highlight, onClick }: { type: SessionType; highlight?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "press relative flex h-20 flex-col items-start justify-end overflow-hidden rounded-xl border bg-surface p-3 text-left",
        highlight ? "border-brand" : "border-line"
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: TYPE_COLOR[type] }} />
      {highlight && <span className="absolute right-2 top-2 rounded bg-brand px-1.5 text-[11px] font-semibold text-brand-ink">建議</span>}
      <span className="text-xl font-bold">{TYPE_LABEL[type]}</span>
    </button>
  );
}

function MiniStat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-lg bg-surface-2 py-2">
      <div className="num text-2xl font-semibold">
        {value}
        <span className="ml-0.5 text-xs font-sans text-dim">{unit}</span>
      </div>
      <div className="text-xs text-dim">{label}</div>
    </div>
  );
}

/** Spell out what the suggestion is based on, so it doesn't feel like a guess. */
function BasisLine({ suggestion, today }: { suggestion: Suggestion; today: string }) {
  const b = suggestion.basis;
  if (!b) {
    return <p className="mt-2 text-xs text-dim">還沒有任何重訓紀錄，所以從循環第一天開始算。</p>;
  }
  if (b.lastDate === today) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-xs">
      <span className="text-dim">依據</span>
      <span>
        上次重訓 <span className="font-semibold">{mdw(b.lastDate)}</span>
        <span style={{ color: TYPE_COLOR[b.lastType] }}> {TYPE_LABEL[b.lastType]}</span>
        <span className="text-dim">（{daysAgo(b.lastDate, today)}）</span>
      </span>
      <span className="text-dim">→</span>
      <span>
        已休 <span className="num font-semibold">{b.restTaken}</span> 天／需休{" "}
        <span className="num font-semibold">{b.restNeeded}</span> 天
        {b.vbCount > 0 && <span className="text-dim">（期間打球 {b.vbCount} 次，各多休 1 天）</span>}
      </span>
      <span className="text-dim">→</span>
      <span className="font-semibold" style={{ color: TYPE_COLOR[suggestion.type] }}>
        {suggestion.type === "rest" ? `今天休息，下次${TYPE_LABEL[suggestion.nextStrength]}` : `今天${TYPE_LABEL[suggestion.type]}`}
      </span>
    </div>
  );
}

/** "上次訓練：9/28（一）背日・2 天前" — any session type, independent of the suggestion. */
function LastSessionLine({ last, today }: { last: { date: string; type: SessionType } | null; today: string }) {
  if (!last) return <p className="mt-2 text-xs text-dim">上次訓練：還沒有任何紀錄</p>;
  return (
    <p className="mt-2 text-xs">
      <span className="text-dim">{last.date === today ? "今天已練：" : "上次訓練："}</span>
      {last.date !== today && <span className="font-semibold">{mdw(last.date)} </span>}
      <span className="font-semibold" style={{ color: TYPE_COLOR[last.type] }}>
        {TYPE_LABEL[last.type]}
      </span>
      {last.date !== today && <span className="text-dim">・{daysAgo(last.date, today)}</span>}
    </p>
  );
}
