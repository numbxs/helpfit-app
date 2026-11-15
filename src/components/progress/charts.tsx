"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Small single-series charts. One hue (--chart-1), thin marks with 4px rounded
 * data-ends, hairline baseline, a target tick in muted ink, tap/hover for values,
 * and a screen-reader table for every chart.
 */

export interface BarDatum {
  label: string;
  value: number;
  target?: number | null;
  detail?: string;
}

export function ColumnChart({ data, ariaLabel, unit, height = 132 }: { data: BarDatum[]; ariaLabel: string; unit: string; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.target ?? 0)));
  const w = 320;
  const pad = { top: 18, bottom: 22 };
  const plotH = height - pad.top - pad.bottom;
  const band = w / data.length;
  const barW = Math.min(24, band - 8);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const last = data.length - 1;
  const shown = active ?? last;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full overflow-visible" role="img" aria-label={ariaLabel} onMouseLeave={() => setActive(null)}>
        <line x1={0} x2={w} y1={pad.top + plotH} y2={pad.top + plotH} stroke="var(--border)" strokeWidth={1} />
        {data.map((d, i) => {
          const cx = band * i + band / 2;
          const h = Math.max(0, pad.top + plotH - y(d.value));
          const x = cx - barW / 2;
          const r = Math.min(4, h);
          const top = pad.top + plotH - h;
          const path =
            h > 0
              ? `M${x},${pad.top + plotH} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + barW - r},${top} Q${x + barW},${top} ${x + barW},${top + r} L${x + barW},${pad.top + plotH} Z`
              : "";
          return (
            <g key={i} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} style={{ cursor: "pointer" }}>
              <rect x={band * i} y={0} width={band} height={height} fill="transparent" />
              {path && <path d={path} fill="var(--chart-1)" opacity={active === null || active === i ? 1 : 0.45} />}
              {d.target ? <line x1={cx - barW / 2 - 3} x2={cx + barW / 2 + 3} y1={y(d.target)} y2={y(d.target)} stroke="var(--muted-foreground)" strokeWidth={2} strokeLinecap="round" opacity={0.55} /> : null}
              {i === shown && (
                <text x={cx} y={Math.min(y(d.value), d.target ? y(d.target) : Infinity) - 6} textAnchor="middle" className="fill-foreground text-[11px] font-semibold tabular-nums">
                  {d.value}
                </text>
              )}
              <text x={cx} y={height - 6} textAnchor="middle" className={cn("fill-muted-foreground text-[10px]", i === shown && "fill-foreground font-semibold")}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>
          {data[shown]?.label}: <span className="font-semibold text-foreground tabular-nums">{data[shown]?.value}</span> {unit}
          {data[shown]?.target ? ` · target ${data[shown]?.target}` : ""}
        </span>
        {data.some((d) => d.target) && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded bg-muted-foreground/60" /> target
          </span>
        )}
      </figcaption>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th>Week</th>
            <th>{unit}</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td>{d.value}</td>
              <td>{d.target ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function Sparkline({ points, ariaLabel, unit, width = 120, height = 40 }: { points: { label: string; value: number }[]; ariaLabel: string; unit: string; width?: number; height?: number }) {
  if (points.length === 0) return null;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pad = 5;
  const x = (i: number) => (points.length === 1 ? width / 2 : pad + (i / (points.length - 1)) * (width - pad * 2));
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${d} L${x(points.length - 1)},${height} L${x(0)},${height} Z`;
  const lx = x(points.length - 1);
  const ly = y(points[points.length - 1].value);
  return (
    <figure className="m-0 shrink-0">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="overflow-visible">
        {points.length > 1 && <path d={area} fill="var(--chart-1)" opacity={0.1} />}
        {points.length > 1 && <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        <circle cx={lx} cy={ly} r={4} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
      </svg>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{p.label}</td>
              <td>
                {p.value} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function RateRow({ label, completed, attempts }: { label: string; completed: number; attempts: number }) {
  const rate = attempts ? completed / attempts : 0;
  return (
    <div className="grid grid-cols-[72px_1fr_auto] items-center gap-3 text-sm">
      <span className="font-medium">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-chart-1" style={{ width: `${Math.round(rate * 100)}%` }} />
      </span>
      <span className="w-24 text-right tabular-nums text-muted-foreground">
        {attempts ? (
          <>
            <span className="font-semibold text-foreground">{Math.round(rate * 100)}%</span> · {completed}/{attempts}
          </>
        ) : (
          "no data"
        )}
      </span>
    </div>
  );
}
