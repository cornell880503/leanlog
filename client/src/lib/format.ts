import { addDays, daysBetween, isoWeek, weekStart, weekday } from "@shared/analytics";
import { useSearch } from "wouter";

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

/** "9/30（週二）" always, never "今天". */
export function mdw(d: string): string {
  return `${shortDate(d)}（${weekdayLabel(d)}）`;
}

/** "2026 年 9 月" */
export function monthLabel(ym: string): string {
  return `${ym.slice(0, 4)} 年 ${Number(ym.slice(5, 7))} 月`;
}

/** Monday-based day number within its week: 週一 = 1 … 週日 = 7. */
export function dayOfWeek(d: string): number {
  return daysBetween(weekStart(d), d) + 1;
}

/** ISO week number, e.g. 40. */
export function weekNumber(d: string): number {
  return Number(isoWeek(d).slice(-2));
}

/** "3 天前" / "昨天" / "今天" relative wording. */
export function daysAgo(d: string, today = todayLocal()): string {
  const n = daysBetween(d, today);
  if (n === 0) return "今天";
  if (n === 1) return "昨天";
  if (n === 2) return "前天";
  if (n > 0) return `${n} 天前`;
  if (n === -1) return "明天";
  return `${-n} 天後`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateStr(v: string | null | undefined): v is string {
  if (!v || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** A `?date=YYYY-MM-DD` query parameter, only if valid and not in the future. */
export function usePastDateParam(name = "date"): string | null {
  const search = useSearch();
  const v = new URLSearchParams(search).get(name);
  return isDateStr(v) && v <= todayLocal() ? v : null;
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
