import type { TimeOfDay } from "./types";

/** Local calendar-date helpers. All "day" strings are local YYYY-MM-DD. */

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0); // midday avoids DST edge cases
}

export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = parseDay(b).getTime() - parseDay(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function weekday(key: string): number {
  return parseDay(key).getDay();
}

/** Start of the training week containing `key`, given the weekday weeks start on. */
export function weekStartFor(key: string, weekStartsOn: number): string {
  const wd = weekday(key);
  const diff = (wd - weekStartsOn + 7) % 7;
  return addDays(key, -diff);
}

export function eachDay(start: string, endInclusive: string): string[] {
  const out: string[] = [];
  for (let k = start; k <= endInclusive; k = addDays(k, 1)) out.push(k);
  return out;
}

export function timeOfDay(d: Date): TimeOfDay {
  const h = d.getHours();
  if (h < 11) return "morning";
  if (h < 14) return "midday";
  if (h < 17) return "afternoon";
  return "evening";
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayName(key: string, short = false): string {
  return (short ? WEEKDAY_SHORT : WEEKDAY_LONG)[weekday(key)];
}

/** Deterministic 32-bit hash for seeded, reproducible choices (FNV-1a). */
export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pick<T>(items: readonly T[], seed: string): T {
  return items[hash(seed) % items.length];
}

/** Parses "HH:mm" to minutes after midnight. */
export function hm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}
