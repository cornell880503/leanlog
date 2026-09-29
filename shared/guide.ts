/**
 * Pure helpers behind the in-app handbook (手冊). Everything is derived from
 * the user's own data and settings so the text stays true as numbers change.
 */

export interface CompLike {
  bfPct: number;
  ffmi: number;
  inTarget: boolean;
}

export interface GoalRanges {
  bfMin: number;
  bfMax: number;
  ffmiMin: number;
  ffmiMax: number;
}

/** One-sentence diagnosis of where the effort should go. */
export function diagnosis(latest: CompLike | null, g: GoalRanges, achieved: boolean): string {
  if (!latest) return "還沒有掃描資料，先到「身體」輸入一次 Boditrax 掃描。";
  if (achieved) return "已經連續兩次掃描落在目標區：薄肌達標，接下來以維持為主。";
  const bfOk = latest.bfPct <= g.bfMax;
  const bfNear = latest.bfPct <= g.bfMax + 2;
  const ffmiOk = latest.ffmi >= g.ffmiMin;
  if (latest.ffmi > g.ffmiMax) return "FFMI 已超過設定的上限，再往上會偏向厚肌；可以把重點放在體脂與線條。";
  if (bfOk && ffmiOk) return "這次已經落在目標區；下一次掃描也在區內，就算正式達標。";
  if (bfNear && !ffmiOk) return "你不需要減肥，你需要長肌肉。體脂已經接近目標，真正的差距在肌肉量。";
  if (ffmiOk) return "肌肉量已經夠了，重點是慢慢把體脂降下來。";
  return "先把肌肉練上來、蛋白質吃夠，體脂會跟著慢慢降；不要大幅節食。";
}

export function bfComment(bf: number, g: GoalRanges): string {
  if (bf < g.bfMin) return "比目標區還低，注意恢復與表現";
  if (bf <= g.bfMax) return "在目標區，腹肌線條通常已經看得到";
  if (bf <= g.bfMax + 3) return "寬鬆的薄肌範圍；要明顯腹肌線條通常要再低一點";
  return "偏高，線條會被脂肪蓋住";
}

export function ffmiComment(ffmi: number, g: GoalRanges): string {
  if (ffmi < 18) return "偏低，肌肉量是主要缺口";
  if (ffmi < 19) return "大約是沒有系統訓練的水準，這是目前最大的缺口";
  if (ffmi < g.ffmiMin) return "有訓練的水準，離目標還差一點";
  if (ffmi <= g.ffmiMax) return "在目標區";
  return "超過薄肌的上限，偏向厚肌";
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

export interface NutritionPlan {
  proteinMinG: number;
  proteinMaxG: number;
  /** Maintenance kcal range from FFM (Katch–McArdle × activity 1.55–1.73), null without FFM. */
  maintenanceMin: number | null;
  maintenanceMax: number | null;
}

export function nutritionPlan(weightKg: number, ffmKg: number | null): NutritionPlan {
  const bmr = ffmKg != null ? 370 + 21.6 * ffmKg : null;
  return {
    proteinMinG: roundTo(weightKg * 1.8, 5),
    proteinMaxG: roundTo(weightKg * 2.2, 5),
    maintenanceMin: bmr != null ? roundTo(bmr * 1.55, 50) : null,
    maintenanceMax: bmr != null ? roundTo(bmr * 1.73, 50) : null,
  };
}

export interface TrendPointLike {
  date: string;
  avg7: number;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export interface WeightPace {
  /** Change of the 7-day average, scaled to 28 days (kg). */
  perMonthKg: number;
  spanDays: number;
  verdict: string;
  tone: "good" | "warn" | "neutral";
}

/** Monthly pace of the 7-day average; needs at least 14 days of trend. */
export function weightPace(trend: TrendPointLike[]): WeightPace | null {
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1];
  let ref = trend[0];
  for (const p of trend) {
    if (daysBetween(p.date, last.date) >= 28) ref = p;
    else break;
  }
  const span = daysBetween(ref.date, last.date);
  if (span < 14) return null;
  const perMonthKg = ((last.avg7 - ref.avg7) / span) * 28;
  if (perMonthKg > 0.5) return { perMonthKg, spanDays: span, verdict: "偏快，可能吃太多，脂肪會跟著長", tone: "warn" };
  if (perMonthKg >= 0.25) return { perMonthKg, spanDays: span, verdict: "剛好，在增肌的理想速度", tone: "good" };
  if (perMonthKg >= 0) return { perMonthKg, spanDays: span, verdict: "偏慢；如果力量有進步也可以接受", tone: "neutral" };
  return { perMonthKg, spanDays: span, verdict: "在往下掉，增肌期建議多吃一點", tone: "warn" };
}

export interface SideBalance {
  /** Positive = right side larger, % of the two-side mean. */
  diffPct: number;
  comment: string;
}

export function sideBalance(left: number | null | undefined, right: number | null | undefined, part: "arm" | "leg"): SideBalance | null {
  if (left == null || right == null || left <= 0 || right <= 0) return null;
  const diffPct = ((right - left) / ((left + right) / 2)) * 100;
  const abs = Math.abs(diffPct);
  let comment: string;
  if (abs < 3) comment = part === "leg" ? "左右非常平均，對跳躍是好事" : "左右平均";
  else if (part === "arm" && diffPct > 0 && abs <= 12) comment = "右手較多，很可能是扣球手，排球員常見，不算問題";
  else if (abs <= 8) comment = "有一點差距，持續觀察";
  else comment = part === "leg" ? "差距偏大，可以加單腳動作平衡" : "差距偏大，可以多做單手動作平衡";
  return { diffPct, comment };
}
