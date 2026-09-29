import { AppShell } from "@/components/app/AppShell";
import { Card, CardTitle, LoadError } from "@/components/app/controls";
import { fmt, shortDate, todayLocal } from "@/lib/format";
import { TYPE_LABEL } from "@/lib/theme";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { TARGET_MUSCLES } from "@shared/exercises";
import { bfComment, diagnosis, ffmiComment, nutritionPlan, sideBalance, weightPace } from "@shared/guide";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

type Summary = RouterOutputs["dashboard"]["summary"];
type SettingsView = RouterOutputs["settings"]["get"];

const SECTIONS = [
  { id: "how", label: "怎麼用" },
  { id: "baseline", label: "身體現況" },
  { id: "goals", label: "目標" },
  { id: "training", label: "訓練原則" },
  { id: "food", label: "飲食" },
  { id: "measure", label: "量測" },
  { id: "backup", label: "備用回報" },
] as const;

function Table({
  head,
  rows,
  className,
  numCols = [],
}: {
  head: string[];
  rows: ReactNode[][];
  className?: string;
  /** Column indexes rendered in the numeric font. */
  numCols?: number[];
}) {
  return (
    <div className={cn("-mx-1 overflow-x-auto", className)}>
      <table className="w-full min-w-[300px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-dim">
            {head.map(h => (
              <th key={h} className="px-1 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 align-top last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cn("px-1 py-2", j === 0 && "text-dim", numCols.includes(j) && "num")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card>
        <CardTitle>{title}</CardTitle>
        <div className="space-y-3 text-sm leading-relaxed">{children}</div>
      </Card>
    </section>
  );
}

function Note({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "good" }) {
  return (
    <p
      className={cn(
        "rounded-lg p-3 text-sm",
        tone === "warn" && "bg-warn/10 text-warn",
        tone === "good" && "bg-brand/10 text-brand",
        tone === "neutral" && "bg-surface-2 text-dim"
      )}
    >
      {children}
    </p>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[13px] leading-relaxed text-chalk">{children}</pre>
  );
}

function GoTo({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 font-semibold text-brand">
      {children}
      <ChevronRight className="size-3.5" />
    </Link>
  );
}

function HowTo() {
  return (
    <Section id="how" title="怎麼用">
      <Table
        head={["你做的事", "頻率", "會得到什麼"]}
        rows={[
          [<GoTo href="/">今天：點訓練日開始</GoTo>, "每次訓練", "逐組打勾、按結束，立即看到容量、有效組數、PR、跟上次比較"],
          [<GoTo href="/volleyball">今天：點排球</GoTo>, "每次打球", "自動算進跳躍量，隔天建議多休一天"],
          [<GoTo href="/body">身體：記體重</GoTo>, "越常越好", "7 日平均趨勢，判斷吃得夠不夠"],
          [<GoTo href="/body">身體：輸入掃描</GoTo>, "每 4 週", "身體組成地圖、里程碑進度"],
          [<GoTo href="/body">身體：摸高測試</GoTo>, "每 2–4 週", "摸高進度、推估跳躍高度"],
          ["跟 Manus 說「週報」", "每週一次", "匯出資料跑完整分析，給調整建議"],
        ]}
      />
      <p className="text-dim">
        需要備份或給 Manus 分析時，到 <GoTo href="/settings">設定</GoTo> 一鍵複製匯出資料。
      </p>
    </Section>
  );
}

function Baseline({ s }: { s: Summary }) {
  const b = s.body;
  const g = s.targets;
  const base = b.baseline;
  const latest = b.latest;
  const scan = s.latestScan;
  const h = g.heightCm / 100;
  if (!base || !latest) {
    return (
      <Section id="baseline" title="身體現況">
        <p className="text-dim">還沒有掃描資料。</p>
        <GoTo href="/body">去輸入 Boditrax 掃描</GoTo>
      </Section>
    );
  }
  const same = base.date === latest.date;
  const col = (label: string, pick: (c: NonNullable<typeof latest>) => string) =>
    same ? [label, pick(latest)] : [label, pick(base), pick(latest)];
  const arm = sideBalance(scan?.muscleLArm, scan?.muscleRArm, "arm");
  const leg = sideBalance(scan?.muscleLLeg, scan?.muscleRLeg, "leg");
  const side = (v: NonNullable<typeof arm>) =>
    Math.abs(v.diffPct) < 0.5 ? "左右一樣" : `${v.diffPct > 0 ? "右" : "左"}比${v.diffPct > 0 ? "左" : "右"}多 ${fmt(Math.abs(v.diffPct))}%`;
  return (
    <Section id="baseline" title="身體現況">
      <p className="text-dim">
        {same ? `Boditrax ${shortDate(latest.date)}` : `基準 ${shortDate(base.date)} → 最新 ${shortDate(latest.date)}`}
        （共 {b.history.length} 次掃描）
      </p>
      <Table
        head={same ? ["項目", "數值"] : ["項目", "基準", "最新"]}
        numCols={[1, 2]}
        rows={[
          col("體重", c => `${fmt(c.weightKg)} kg`),
          col("體脂率", c => `${fmt(c.bfPct)}%`),
          col("去脂體重", c => `${fmt(c.ffmKg)} kg`),
          col("FFMI", c => fmt(c.ffmi, 2)),
          col("脂肪量", c => `${fmt(c.fatMassKg)} kg`),
        ]}
      />
      <ul className="space-y-1.5">
        <li>
          <span className="font-semibold">體脂 {fmt(latest.bfPct)}%：</span>
          {bfComment(latest.bfPct, g)}（目標 {g.bfMin}–{g.bfMax}%）
        </li>
        <li>
          <span className="font-semibold">FFMI {fmt(latest.ffmi, 2)}：</span>
          {ffmiComment(latest.ffmi, g)}（目標 {g.ffmiMin}–{g.ffmiMax}）
        </li>
        {scan?.visceralFat != null && (
          <li>
            <span className="font-semibold">內臟脂肪 {scan.visceralFat}：</span>
            {scan.visceralFat <= 9 ? "健康範圍" : "偏高，值得注意"}
          </li>
        )}
        {arm && (
          <li>
            <span className="font-semibold">手臂 {side(arm)}：</span>
            {arm.comment}
          </li>
        )}
        {leg && (
          <li>
            <span className="font-semibold">腿 {side(leg)}：</span>
            {leg.comment}
          </li>
        )}
      </ul>
      <Note tone="good">{diagnosis(latest, g, b.achieved)}</Note>
      <p className="text-xs text-dim">
        FFMI ＝ 去脂體重 ÷ 身高²（{g.heightCm} cm → {fmt(h * h, 2)} m²）。Boditrax 的 Muscle Mass 跟 InBody
        的骨骼肌重定義不同，數字不能互比；之後請固定用同一台機器、相同條件量測。
      </p>
      <GoTo href="/progress">看身體組成地圖與歷次軌跡</GoTo>
    </Section>
  );
}

function Goals({ s }: { s: Summary }) {
  const b = s.body;
  const g = s.targets;
  const j = s.jump;
  const latest = b.latest;
  const h2 = (g.heightCm / 100) ** 2;
  return (
    <Section id="goals" title="目標">
      <h3 className="font-semibold">薄肌</h3>
      <Table
        head={["指標", "現在", "目標", "差距"]}
        numCols={[1, 2, 3]}
        rows={[
          [
            "體脂率",
            latest ? `${fmt(latest.bfPct)}%` : "—",
            `${g.bfMin}–${g.bfMax}%`,
            latest ? (latest.bfPct > g.bfMax ? `−${fmt(latest.bfPct - g.bfMax)} 點` : "達成") : "—",
          ],
          [
            "FFMI",
            latest ? fmt(latest.ffmi, 2) : "—",
            `${g.ffmiMin}–${g.ffmiMax}`,
            latest ? (latest.ffmi < g.ffmiMin ? `+${fmt(g.ffmiMin - latest.ffmi, 2)}` : "達成") : "—",
          ],
          [
            "去脂體重",
            latest ? `${fmt(latest.ffmKg)} kg` : "—",
            `≥ ${fmt(b.targetFfmKg)} kg`,
            b.ffmGapKg != null ? (b.ffmGapKg > 0 ? `+${fmt(b.ffmGapKg)} kg` : "達成") : "—",
          ],
          [
            "脂肪量",
            latest ? `${fmt(latest.fatMassKg)} kg` : "—",
            `約 ${fmt(b.goalFatKg)} kg`,
            b.fatToLoseAtGoalKg != null ? (b.fatToLoseAtGoalKg > 0 ? `−${fmt(b.fatToLoseAtGoalKg)} kg` : "達成") : "—",
          ],
          ["體重", latest ? `${fmt(latest.weightKg)} kg` : "—", `約 ${fmt(b.goalWeightKg)} kg`, ""],
        ]}
      />
      <p>
        目標去脂體重 {fmt(b.targetFfmKg)} kg 對應 FFMI {fmt(b.targetFfmKg / h2, 2)}；FFMI 上限設在 {g.ffmiMax}，是為了維持「薄」而不是往厚肌走。
      </p>
      <p>
        <span className="font-semibold">達標規則：</span>連續兩次掃描（同一台 Boditrax），體脂率和 FFMI 都落在目標區內。目前：
        {b.achieved ? <span className="font-semibold text-brand">已達標</span> : "進行中"}
      </p>
      <Table
        head={["里程碑", "期限", "去脂體重", "體脂率", "狀態"]}
        numCols={[1, 2, 3]}
        rows={b.milestones.map(m => [
          m.name,
          m.by,
          `≥ ${fmt(m.ffmMinKg)}`,
          `≤ ${fmt(m.bfMax)}%`,
          <span
            className={cn(
              "font-semibold",
              m.status === "met" && "text-brand",
              m.status === "missed" && "text-bad",
              m.status === "pending" && "text-dim"
            )}
          >
            {m.status === "met" ? "達成" : m.status === "missed" ? "未達成" : "進行中"}
          </span>,
        ])}
      />

      <h3 className="pt-2 font-semibold">助跑摸高 {j.targetReachCm} cm</h3>
      <p>
        站立摸高 <span className="num font-semibold">{j.standingReachCm} cm</span>
        {s.standingReachEstimated ? "（估算：身高 × 1.33，實測後到設定改掉）" : "（實測值）"}。
        {j.latestReachCm != null ? (
          <>
            目前助跑摸高 <span className="num font-semibold">{j.latestReachCm} cm</span>，推估跳躍高度約{" "}
            <span className="num font-semibold">{j.latestJumpCm} cm</span>；{j.targetReachCm} cm 需要約{" "}
            <span className="num font-semibold">{j.targetJumpCm} cm</span>
            {j.remainingCm != null && j.remainingCm > 0 ? `，還差 ${j.remainingCm} cm。` : "，已經達成！"}
          </>
        ) : (
          <>還沒有摸高紀錄。{j.targetReachCm} cm 需要約 {j.targetJumpCm} cm 的跳躍高度。</>
        )}
      </p>
      <p className="text-dim">一般業餘男生的助跑跳大多落在 55–70 cm。</p>

      <h3 className="pt-2 font-semibold">兩個目標的關係</h3>
      <p>
        大致是互相幫忙的：脂肪少一點，身體輕一點，相對爆發力更好；下肢力量增加，也直接幫助起跳。唯一要避免的是亂增重（大吃增肌），那樣兩個目標都會受傷。
      </p>
    </Section>
  );
}

function Training({ s, settings }: { s: Summary; settings: SettingsView | undefined }) {
  const st = settings?.settings;
  const rotation = st?.rotation.map(r => TYPE_LABEL[r]).join(" → ");
  const rpe = st?.hardSetRpeMin ?? 7;
  const spike = st ? Math.round((st.loadSpikeRatio - 1) * 100) : 30;
  return (
    <Section id="training" title="訓練原則">
      {rotation && (
        <p>
          <span className="font-semibold">循環：</span>
          {rotation}（有打排球就多休一天；週五、六練腿前會提醒你隔天是否要打球）
        </p>
      )}
      <p>排球已經給下肢很多跳躍刺激，所以上下半身的訓練目的分開：</p>
      <Table
        head={["部位", "主要目的", "做法"]}
        rows={[
          ["上半身", "肌肥大：薄肌線條主要來自這裡", "每肌群每週 10–16 有效組，6–15 下，RPE 7–9"],
          ["下半身", "力量＋爆發：提升起跳", "深蹲／六角槓硬舉／羅馬尼亞硬舉／分腿蹲 3–6 下偏重，加少量增強式"],
          ["核心", "穩定與線條", "每週 6–10 組"],
        ]}
      />
      <h3 className="pt-1 font-semibold">每週有效組數目標</h3>
      <div className="grid grid-cols-5 gap-2 text-center">
        {TARGET_MUSCLES.map(m => {
          const t = s.weeklyTargets[m];
          return (
            <div key={m} className="rounded-lg bg-surface-2 py-2">
              <div className="text-xs text-dim">{m}</div>
              <div className="num text-sm font-semibold">{t ? `${t[0]}–${t[1]}` : "—"}</div>
            </div>
          );
        })}
      </div>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <span className="font-semibold">有效組：</span>RPE {rpe} 以上（大約離力竭剩 3 下以內）的正式組。主要肌群算 1 組、次要肌群算 0.5 組；熱身組、增強式與爆發力動作不算。
        </li>
        <li>
          <span className="font-semibold">漸進超負荷：</span>同一個重量，每一組都達到目標次數上限時，下次就加重（動作卡片的「全部 +」一鍵加一級）。
        </li>
        <li>
          <span className="font-semibold">跳躍負荷管理：</span>追蹤每週跳躍次數（排球＋增強式）和訓練負荷（時長 × sRPE）。比前 3 週平均多 {spike}% 以上會提醒你，這是跳躍膝（髕骨肌腱）最常出問題的情況。
        </li>
      </ul>
      <GoTo href="/progress">看本週各肌群組數</GoTo>
    </Section>
  );
}

function Food({ s }: { s: Summary }) {
  const weight = s.weight.latest?.weightKg ?? s.latestScan?.weightKg ?? null;
  const ffm = s.body.latest?.ffmKg ?? null;
  const pace = weightPace(s.weight.trend);
  const plan = weight != null ? nutritionPlan(weight, ffm) : null;
  return (
    <Section id="food" title="飲食原則">
      <Table
        head={["項目", "建議", "說明"]}
        rows={[
          [
            "蛋白質",
            plan ? <span className="font-semibold">每天 {plan.proteinMinG}–{plan.proteinMaxG} g</span> : "1.8–2.2 g/kg",
            `長肌肉最重要的一項（1.8–2.2 g/kg${weight != null ? `，以 ${fmt(weight)} kg 計` : ""}）；只想記一項就記這個`,
          ],
          [
            "熱量",
            "維持，或多 200–300 kcal",
            plan?.maintenanceMin != null
              ? `用去脂體重推估，維持熱量約 ${plan.maintenanceMin.toLocaleString()}–${plan.maintenanceMax!.toLocaleString()} kcal（看排球量）`
              : "有掃描資料後會用去脂體重推估維持熱量",
          ],
          ["體重變化", "7 日平均每月 +0.25–0.5 kg", "太快代表吃太多；沒變但力量有進步也可以接受"],
        ]}
      />
      {pace ? (
        <Note tone={pace.tone}>
          最近 {pace.spanDays} 天的 7 日平均體重，換算每月 {pace.perMonthKg >= 0 ? "+" : "−"}
          {fmt(Math.abs(pace.perMonthKg), 2)} kg：{pace.verdict}。
        </Note>
      ) : (
        <p className="text-dim">
          連續記錄體重至少兩週後，這裡會自動判斷增重速度。<GoTo href="/body">去記體重</GoTo>
        </p>
      )}
    </Section>
  );
}

function Measure() {
  return (
    <Section id="measure" title="量測規範">
      <Table
        head={["項目", "頻率", "條件"]}
        rows={[
          ["Boditrax", "每 4 週", "同一台、早上空腹、上完廁所、訓練前；前一天不要大量練腿或喝酒"],
          ["空腹體重", "越常越好", "起床、上完廁所、進食前，同一台體重計"],
          ["站立摸高", "每 4–8 週", "鞋子每次一樣、雙腳平貼地面、單手伸直摸最高點"],
          ["助跑摸高", "每 2–4 週", "熱身後測 5 次取最佳；不要在練腿隔天測"],
        ]}
      />
    </Section>
  );
}

function Backup() {
  return (
    <Section id="backup" title="備用回報（網頁不方便時直接打給 Manus）">
      <p className="text-dim">重訓</p>
      <Code>{"10/1 重訓 70分 RPE8\n深蹲 80x5x3 @8\n引體 BWx8, x7, x6\n臥推 60x8x3\n側平舉 8kgx15x3"}</Code>
      <p className="text-dim">排球</p>
      <Code>{"10/2 排球 120分 RPE7 跳約 80 次 練習 膝蓋 OK"}</Code>
      <p className="text-dim">體重／跳躍測試</p>
      <Code>{"10/1 體重 70.4\n10/5 站立摸高 236 助跑摸高 305"}</Code>
      <p className="text-xs text-dim">
        80x5x3 ＝ 80 kg × 5 下 × 3 組，@8 ＝ RPE 8。徒手動作會自動把體重算進容量。掃描直接拍 Boditrax 畫面傳給 Manus 即可。
      </p>
    </Section>
  );
}

export default function Guide() {
  const today = todayLocal();
  const q = trpc.dashboard.summary.useQuery({ today });
  const settings = trpc.settings.get.useQuery();
  const s = q.data;
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <AppShell title="手冊">
      <div className="space-y-4 fade-up">
        <p className="text-sm text-dim">薄肌＋垂直跳躍的完整說明。數字都來自你的紀錄與設定，會自動更新。</p>
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="章節">
          {SECTIONS.map(x => (
            <button
              key={x.id}
              type="button"
              onClick={() => jump(x.id)}
              className="press h-10 shrink-0 rounded-full border border-line bg-surface px-4 text-sm"
            >
              {x.label}
            </button>
          ))}
        </nav>
        <HowTo />
        {!s && q.isError ? (
          <LoadError what="手冊資料" onRetry={() => void q.refetch()} />
        ) : !s ? (
          <div className="space-y-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-48 animate-pulse rounded-xl bg-surface" />
            ))}
          </div>
        ) : (
          <>
            <Baseline s={s} />
            <Goals s={s} />
            <Training s={s} settings={settings.data} />
            <Food s={s} />
          </>
        )}
        <Measure />
        <Backup />
      </div>
    </AppShell>
  );
}
