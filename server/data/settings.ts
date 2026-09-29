import { eq } from "drizzle-orm";
import { userSettings } from "../../drizzle/schema";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STANDING_REACH_CM,
  normalizeSettings,
  type Settings,
} from "../../shared/settings";
import type { Db } from "./common";
import { importBaselineIfNeeded } from "./baseline";

export interface UserSettingsView {
  standingReachCm: number;
  standingReachEstimated: boolean;
  settings: Settings;
}

export async function ensureSettings(db: Db, userId: number): Promise<UserSettingsView> {
  let rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (!rows.length) {
    await db
      .insert(userSettings)
      .values({
        userId,
        standingReachCm: DEFAULT_STANDING_REACH_CM,
        standingReachEstimated: true,
        settings: DEFAULT_SETTINGS as unknown as Record<string, unknown>,
        baselineVersion: 0,
      })
      .onDuplicateKeyUpdate({ set: { userId } });
    rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  }
  const row = rows[0];
  if (row.baselineVersion < 1) await importBaselineIfNeeded(db, userId);
  return {
    standingReachCm: row.standingReachCm,
    standingReachEstimated: row.standingReachEstimated,
    settings: normalizeSettings(row.settings),
  };
}

export async function updateSettings(
  db: Db,
  userId: number,
  patch: {
    standingReachCm?: number;
    standingReachEstimated?: boolean;
    settings?: Partial<Settings>;
  }
): Promise<UserSettingsView> {
  const current = await ensureSettings(db, userId);
  const merged = normalizeSettings({ ...current.settings, ...(patch.settings ?? {}) });
  await db
    .update(userSettings)
    .set({
      standingReachCm: patch.standingReachCm ?? current.standingReachCm,
      standingReachEstimated: patch.standingReachEstimated ?? current.standingReachEstimated,
      settings: merged as unknown as Record<string, unknown>,
    })
    .where(eq(userSettings.userId, userId));
  return ensureSettings(db, userId);
}
