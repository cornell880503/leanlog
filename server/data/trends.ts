import type { Lookup } from "../../shared/analytics";
import { trendSeries, type TrendPeriod, type TrendSeries } from "../../shared/trends";
import type { Db } from "./common";
import { FALLBACK_BW, loadAllSessions, loadWeightPoints, toSessionInput } from "./sessions";
import { ensureSettings } from "./settings";

/** Weekly / monthly totals and intensity for the signed-in user. */
export async function trendData(
  db: Db,
  userId: number,
  lookup: Lookup,
  period: TrendPeriod,
  count: number,
  today: string
): Promise<TrendSeries> {
  const { settings } = await ensureSettings(db, userId);
  const all = await loadAllSessions(db, userId);
  const weights = await loadWeightPoints(db, userId);
  return trendSeries({
    sessions: all.map(toSessionInput),
    lookup,
    weights,
    fallbackBw: FALLBACK_BW,
    rpeMin: settings.hardSetRpeMin,
    targetKeys: settings.strengthTargets.map(t => t.exerciseKey),
    today,
    period,
    count,
  });
}
