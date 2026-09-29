import { addDays, weekday } from "@shared/analytics";

/** Today's date on this device (the phone's local time zone). */
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

export function weekdayLabel(d: string): string {
  return WEEKDAYS[weekday(d)];
}

/** "9/29（週二）" style label; "今天"/"昨天" for recent dates. */
export function dateLabel(d: string, today = todayLocal()): string {
  if (d === today) return "今天";
  if (d === addDays(today, -1)) return "昨天";
  if (d === addDays(today, -2)) return "前天";
  const [, m, day] = d.split("-").map(Number);
  return `${m}/${day}（${weekdayLabel(d)}）`;
}

export function shortDate(d: string): string {
  const [, m, day] = d.split("-").map(Number);
  return `${m}/${day}`;
}

export function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const f = Number(n.toFixed(digits));
  return f.toLocaleString("zh-TW", { maximumFractionDigits: digits });
}

export function fmtKg(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${fmt(n, n % 1 === 0 ? 0 : 1)}`;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
