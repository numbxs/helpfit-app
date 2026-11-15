import { addDays, dayKey, eachDay, hm, parseDay } from "./dates";
import { activeInsight } from "./insights";
import { countsTowardWeek, weekProgress } from "./planner";
import { FOCUS_LABEL } from "./recommender";
import { daysSinceActivity } from "./stats";
import type { EngineSnapshot, ReminderSettings, TimeOfDay, WeekPlan } from "./types";

export interface Reminder {
  fireAt: string; // ISO
  day: string;
  title: string;
  body: string;
  tag: string;
}

const WINDOW_TIME: Record<TimeOfDay, string> = { morning: "07:30", midday: "12:15", afternoon: "16:00", evening: "18:30" };

/** Shifts a time out of quiet hours (handles overnight ranges like 22:00–07:00). */
export function outsideQuietHours(time: string, quietStart: string, quietEnd: string): string {
  const t = hm(time);
  const qs = hm(quietStart);
  const qe = hm(quietEnd);
  const inQuiet = qs <= qe ? t >= qs && t < qe : t >= qs || t < qe;
  return inQuiet ? quietEnd : time;
}

function at(day: string, time: string): Date {
  const d = parseDay(day);
  const m = hm(time);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
}

/**
 * Upcoming reminders for the next `days` days. Never more than one a day, never
 * during quiet hours, never on a day you've already trained, and never guilt-based.
 */
export function upcomingReminders(snap: EngineSnapshot, settings: ReminderSettings, now: Date, days = 7): Reminder[] {
  if (!settings.enabled || !snap.plan) return [];
  const today = dayKey(now);
  const best = activeInsight(snap.insights, "best_time_window")?.data?.window as TimeOfDay | undefined;
  const baseTime = settings.time && settings.time !== "auto" ? settings.time : best ? WINDOW_TIME[best] : "18:00";
  const time = outsideQuietHours(baseTime, settings.quietStart, settings.quietEnd);
  const busy = Boolean(activeInsight(snap.insights, "frequent_barrier:no_time"));
  const out: Reminder[] = [];
  const plan = snap.plan;

  for (const day of eachDay(today, addDays(today, days - 1))) {
    const fire = at(day, time);
    if (fire <= now) continue;
    if (snap.sessions.some((s) => s.date === day && countsTowardWeek(s))) continue;
    if (snap.dayStates.some((d) => d.date === day && d.notToday)) continue;
    const inPlan = day >= plan.weekStart && day <= plan.weekEnd;
    const planned = inPlan ? plan.sessions.find((p) => p.day === day && p.status === "planned") : undefined;

    if (settings.frequency === "weekly_summary") {
      if (day === plan.weekEnd) {
        out.push({ fireAt: fire.toISOString(), day, title: "Your week in review is ready", body: "A quick look at what went well and what changes next week.", tag: `week-${day}` });
      }
      continue;
    }
    const msg = messageFor(snap, plan, day, Boolean(planned), busy, planned ? FOCUS_LABEL[planned.focus] : undefined);
    if (!msg) continue;
    if (settings.frequency === "planned_days" && !planned) continue;
    out.push({ fireAt: fire.toISOString(), day, tag: `day-${day}`, ...msg });
  }
  return out;
}

function messageFor(
  snap: EngineSnapshot,
  plan: WeekPlan,
  day: string,
  planned: boolean,
  busy: boolean,
  focusLabel?: string,
): { title: string; body: string } | null {
  const progress = weekProgress(plan, snap.sessions);
  const gap = daysSinceActivity(snap.profile, snap.sessions, day);
  const minutes = plan.defaultVariant === "minimum" ? 5 : plan.defaultVariant === "quick" ? 15 : 30;
  if (gap >= 4) {
    return { title: "Ready when you are", body: "A short restart session is waiting. No catch-up needed." };
  }
  if (progress.done === progress.minimum - 1 && progress.minimum > 0) {
    return {
      title: `${progress.done} session${progress.done === 1 ? "" : "s"} this week`,
      body: `One more reaches your minimum. The 5-minute version counts.`,
    };
  }
  if (planned) {
    if (busy) return { title: "Busy day?", body: `Your 5-minute version is ready — or do the full ${minutes}.` };
    return { title: `${minutes}-minute ${focusLabel ?? "workout"} today`, body: "Open the app and tap Start. Everything's set up." };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Calendar export (.ics) — reliable reminders on any phone, no push server needed.
// ---------------------------------------------------------------------------

function icsDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildICS(plan: WeekPlan, settings: Pick<ReminderSettings, "time" | "quietStart" | "quietEnd">, now: Date, appUrl = ""): string {
  const time = outsideQuietHours(settings.time && settings.time !== "auto" ? settings.time : "18:00", settings.quietStart, settings.quietEnd);
  const minutes = plan.defaultVariant === "minimum" ? 5 : plan.defaultVariant === "quick" ? 15 : 30;
  const stamp = icsDate(now);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HelpFit//Training plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const s of plan.sessions.filter((p) => p.status === "planned" && p.day >= dayKey(now))) {
    const start = at(s.day, time);
    const end = new Date(start.getTime() + minutes * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@helpfit`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${escapeIcs(`HelpFit · ${minutes}-min ${FOCUS_LABEL[s.focus]}`)}`,
      `DESCRIPTION:${escapeIcs(`Your ${FOCUS_LABEL[s.focus]} session. Short on time? The 5-minute version counts.${appUrl ? `\n${appUrl}` : ""}`)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Time to move",
      "TRIGGER:-PT0M",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
