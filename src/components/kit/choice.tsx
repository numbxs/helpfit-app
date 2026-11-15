"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

/** Large tappable choice chips — single or multi select. */
export function ChoiceGroup<T extends string | number>({
  options,
  value,
  onChange,
  multiple,
  layout = "wrap",
  max,
  className,
  ariaLabel,
}: {
  options: ChoiceOption<T>[];
  value: T[];
  onChange: (v: T[]) => void;
  multiple?: boolean;
  layout?: "wrap" | "list" | "grid";
  max?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const toggle = (v: T) => {
    if (!multiple) return onChange([v]);
    if (value.includes(v)) return onChange(value.filter((x) => x !== v));
    if (max && value.length >= max) return onChange([...value.slice(1), v]);
    onChange([...value, v]);
  };
  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={ariaLabel}
      className={cn(layout === "wrap" && "flex flex-wrap gap-2", layout === "list" && "grid gap-2", layout === "grid" && "grid grid-cols-2 gap-2", className)}
    >
      {options.map((o) => {
        const selected = value.includes(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={selected}
            onClick={() => toggle(o.value)}
            className={cn(
              "group relative flex min-h-11 items-center gap-3 rounded-2xl border px-4 text-left text-[15px] font-medium transition-all duration-150 active:scale-[0.98]",
              layout === "wrap" ? "py-2" : "py-3",
              selected
                ? "border-foreground bg-foreground text-background shadow-sm dark:border-primary dark:bg-primary dark:text-primary-foreground"
                : "border-border bg-card hover:border-foreground/30",
            )}
          >
            <span className="flex-1">
              <span className="block leading-tight">{o.label}</span>
              {o.hint && layout !== "wrap" && (
                <span className={cn("mt-0.5 block text-[13px] font-normal leading-snug", selected ? "opacity-75" : "text-muted-foreground")}>{o.hint}</span>
              )}
            </span>
            {layout !== "wrap" && (
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border transition",
                  selected ? "border-transparent bg-volt text-volt-foreground" : "border-border",
                )}
              >
                {selected && <Check className="size-3.5" strokeWidth={3} />}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Compact segmented control. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
  tone = "default",
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  tone?: "default" | "hero";
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "grid gap-1 rounded-2xl p-1",
        tone === "hero" ? "bg-white/8" : "bg-muted",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-10 rounded-xl px-3 text-sm font-semibold tabular-nums transition-all duration-150",
              tone === "hero"
                ? selected
                  ? "bg-hero-foreground text-hero shadow-sm"
                  : "text-hero-muted hover:text-hero-foreground"
                : selected
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
