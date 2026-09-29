import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

/**
 * Native select: on phones this opens the system wheel picker, which is the
 * fastest way to choose a number with one hand.
 */
export function Pick<T extends string | number>({
  value,
  options,
  onChange,
  className,
  label,
  suffix,
  big,
  ariaLabel,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  className?: string;
  label?: string;
  suffix?: string;
  big?: boolean;
  ariaLabel?: string;
}) {
  const isNum = typeof value === "number";
  const current = options.find(o => o.value === value);
  return (
    <label
      className={cn(
        "press relative flex items-center justify-between gap-1 rounded-lg border border-input bg-surface-2 px-3",
        big ? "h-14" : "h-11",
        className
      )}
    >
      {label && <span className="text-xs text-dim shrink-0">{label}</span>}
      <span className={cn("num flex-1 text-right font-semibold", big ? "text-3xl" : "text-xl")}>
        {current?.label ?? String(value)}
        {suffix && <span className="ml-0.5 text-sm text-dim font-sans font-normal">{suffix}</span>}
      </span>
      <ChevronDown className="size-4 text-dim shrink-0" />
      <select
        aria-label={ariaLabel ?? label}
        className="absolute inset-0 opacity-0 w-full h-full"
        value={String(value)}
        onChange={e => {
          const raw = e.target.value;
          const found = options.find(o => String(o.value) === raw);
          if (found) onChange(found.value);
          else onChange((isNum ? Number(raw) : raw) as T);
        }}
      >
        {options.map(o => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Single-choice chips (large tap targets). */
export function Chips<T extends string | number>({
  value,
  options,
  onChange,
  className,
  size = "md",
  columns,
}: {
  value: T | null;
  options: (Option<T> & { hint?: string })[];
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  columns?: number;
}) {
  return (
    <div
      className={cn(columns ? "grid gap-2" : "flex flex-wrap gap-2", className)}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "press rounded-lg border text-center font-medium",
              size === "sm" && "h-9 min-w-9 px-2 text-sm",
              size === "md" && "h-11 min-w-11 px-3",
              size === "lg" && "h-14 px-3 text-lg",
              active
                ? "border-brand bg-brand text-brand-ink"
                : "border-input bg-surface-2 text-chalk hover:border-dim"
            )}
          >
            <span className={cn(typeof o.value === "number" && "num text-lg")}>{o.label}</span>
            {o.hint && (
              <span className={cn("block text-[11px] leading-tight", active ? "text-brand-ink/70" : "text-dim")}>
                {o.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("card-iron p-4", className)}>{children}</section>;
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-chalk">{children}</h2>
      {right}
    </div>
  );
}

export function PlateBar({ value, className }: { value: number | null; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100);
  return (
    <div className={cn("plate-track", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="plate-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-dim">{label}</div>
      <div className="num text-3xl font-semibold leading-tight text-chalk">
        {value}
        {unit && <span className="ml-1 text-sm font-sans font-normal text-dim">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-dim">{sub}</div>}
    </div>
  );
}

export function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  const n = Math.round((to - from) / step);
  for (let i = 0; i <= n; i++) out.push(Math.round((from + i * step) * 100) / 100);
  return out;
}

export function numOptions(values: number[], fmtLabel: (v: number) => string = v => String(v)): Option<number>[] {
  return values.map(v => ({ value: v, label: fmtLabel(v) }));
}

/** Options for a value that may fall outside the grid (keeps the current value selectable). */
export function withValue(values: number[], v: number): number[] {
  if (values.some(x => Math.abs(x - v) < 1e-9)) return values;
  return [...values, v].sort((a, b) => a - b);
}
