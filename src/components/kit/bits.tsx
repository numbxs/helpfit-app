"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
  format = (v: number) => String(v),
  size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  format?: (v: number) => string;
  size?: "md" | "lg";
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v * 100) / 100));
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        aria-label={`Decrease${label ? ` ${label}` : ""}`}
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        className={cn("flex items-center justify-center rounded-full border bg-card transition active:scale-95 disabled:opacity-40", size === "lg" ? "size-14" : "size-11")}
      >
        <Minus className="size-5" />
      </button>
      <div className="min-w-0 text-center">
        <div className={cn("font-semibold tabular-nums tracking-tight", size === "lg" ? "text-5xl" : "text-2xl")} aria-live="polite">
          {format(value)}
        </div>
        {label && <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>}
      </div>
      <button
        type="button"
        aria-label={`Increase${label ? ` ${label}` : ""}`}
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        className={cn("flex items-center justify-center rounded-full border bg-card transition active:scale-95 disabled:opacity-40", size === "lg" ? "size-14" : "size-11")}
      >
        <Plus className="size-5" />
      </button>
    </div>
  );
}

/** Ring that fills toward a goal; marks the minimum. */
export function ProgressRing({
  value,
  max,
  marker,
  size = 56,
  stroke = 6,
  children,
  className,
}: {
  value: number;
  max: number;
  marker?: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const markerAngle = marker && max ? (Math.min(marker, max) / max) * 2 * Math.PI - Math.PI / 2 : null;
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-0" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={stroke} />
        {pct > 0 && <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.2,0.8,0.2,1)" }}
        />}
        {markerAngle !== null && (
          <circle cx={size / 2 + r * Math.cos(markerAngle)} cy={size / 2 + r * Math.sin(markerAngle)} r={stroke / 2.6} fill="currentColor" fillOpacity={0.55} />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function Pill({ children, className, tone = "muted" }: { children: React.ReactNode; className?: string; tone?: "muted" | "volt" | "warn" | "outline" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "volt" && "bg-volt text-volt-foreground",
        tone === "warn" && "bg-warning-soft text-warning-foreground",
        tone === "outline" && "border text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Surface({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-3xl border bg-card p-5", className)} {...rest}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children, className }: { title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-3xl border border-dashed p-6 text-center", className)}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
