import { buildWorkout, VARIANT_MINUTES } from "./builder";
import { addDays, dayKey, daysBetween, eachDay, timeOfDay, weekdayName } from "./dates";
import { activeInsight } from "./insights";
import { countsTowardWeek, weekProgress } from "./planner";
import { activePain, AREA_LABEL, canPrescribe, painAdvice, readinessFlags, type PainAdvice } from "./safety";
import { completedSessions, daysSinceActivity } from "./stats";
import type { DayState, EngineSnapshot, Focus, PainReport, PlannedSession, Variant, Workout } from "./types";

export type RecKind = "workout" | "rest_day" | "done_today" | "not_today" | "week_complete" | "needs_clearance";
export type RecMode = "first" | "normal" | "restart" | "recovery" | "lighter" | "busy";

export interface Recommendation {
  kind: RecKind;
  mode: RecMode;
  date: string;
  focus: Focus;
  variant: Variant;
  intensity: number;
  workout: Workout | null;
  headline: string;
  rationale: string[];
  plannedSessionId?: string;
  gapDays: number;
  week: ReturnType<typeof weekProgress>;
  variantMinutes: Record<Variant, number>;
  painNotices: { report: PainReport; advice: PainAdvice }[];
  alternatives: Focus[];
  upNext?: PlannedSession;
  /** True when the user should be nudged toward the 5-minute commitment. */
  leadWithMinimum: boolean;
}

export const FOCUS_LABEL: Record<Focus, string> = {
  strength: "strength",
  cardio: "cardio",
  mobility: "mobility & core",
  recovery: "recovery",
  restart: "restart",
};

const VARIANT_ORDER: Variant[] = ["minimum", "quick", "full"];
const capVariant = (v: Variant, cap: Variant): Variant => (VARIANT_ORDER.indexOf(v) > VARIANT_ORDER.indexOf(cap) ? cap : v);

export function alternativesFor(focus: Focus, snap: EngineSnapshot): Focus[] {
  const base: Record<Focus, Focus[]> = {
    strength: ["cardio", "mobility"],
    cardio: ["strength", "mobility"],
    mobility: ["cardio", "strength"],
    recovery: ["mobility", "cardio"],
    restart: ["recovery", "cardio"],
  };
  const enjoyed = snap.insights
    .filter((i) => i.key.startsWith("enjoys_focus:") && i.status !== "rejected")
    .map((i) => i.key.split(":")[1] as Focus);
  const list = base[focus];
  return [...list.filter((f) => enjoyed.includes(f)), ...list.filter((f) => !enjoyed.includes(f))];
}

export function recommendToday(snap: EngineSnapshot, now: Date): Recommendation {
  const today = dayKey(now);
  const yesterday = addDays(today, -1);
  const { profile, plan } = snap;
  const ds: DayState | undefined = snap.dayStates.find((d) => d.date === today);
  const week = weekProgress(plan, snap.sessions);
  const gap = daysSinceActivity(profile, snap.sessions, today);
  const everTrained = completedSessions(snap.sessions).length > 0;
  const painNotices = activePain(snap.pain).map((report) => ({ report, advice: painAdvice(report, snap.pain, today) }));
  const variantMinutes = { minimum: 5, quick: 15, full: 30 } as Record<Variant, number>;

  const base = {
    date: today,
    gapDays: gap,
    week,
    painNotices,
    variantMinutes,
  };

  if (!canPrescribe(profile.readiness.status)) {
    const flags = readinessFlags(profile.readiness);
    return {
      ...base,
      kind: "needs_clearance",
      mode: "normal",
      focus: "recovery",
      variant: "minimum",
      intensity: 0,
      workout: null,
      headline: "Let's check with a professional first",
      rationale: [
        `Your health answers (${flags.length} flagged) mean a doctor or qualified professional should clear you for exercise before structured workouts.`,
        "Once you're cleared, confirm it in Profile and your plan unlocks immediately.",
      ],
      alternatives: [],
      leadWithMinimum: false,
    };
  }

  const ins = (k: Parameters<typeof activeInsight>[1]) => Boolean(activeInsight(snap.insights, k));
  const doneToday = snap.sessions.filter((s) => s.date === today && countsTowardWeek(s));
  const restartThreshold = ins("restart_friction") ? 3 : 4;
  const isRestart = gap >= restartThreshold && (everTrained || gap >= restartThreshold + 1);
  const feeling = ds?.feeling;
  const pending = (plan?.sessions ?? []).filter((p) => p.status === "planned").sort((a, b) => a.day.localeCompare(b.day));
  const strengthYesterday = snap.sessions.some((s) => s.date === yesterday && s.focus === "strength" && countsTowardWeek(s));
  const recentTrainingDays = new Set(
    snap.sessions.filter((s) => s.date >= addDays(today, -3) && s.date < today && countsTowardWeek(s)).map((s) => s.date),
  ).size;
  const severePain = activePain(snap.pain).some((p) => p.severity >= 7);
  const painAreas = activePain(snap.pain).filter((p) => p.area !== "other").map((p) => AREA_LABEL[p.area]);

  let kind: RecKind = "workout";
  let mode: RecMode = everTrained ? "normal" : "first";
  let focus: Focus;
  let planned: PlannedSession | undefined;
  const why: string[] = [];

  // ---- Focus ---------------------------------------------------------------
  const next = pending.find((p) => p.day <= today) ?? pending[0];
  const plannedFocus = (): Focus => {
    if (!next) return "mobility";
    planned = next;
    if (next.focus === "strength" && strengthYesterday) {
      const alt = pending.find((p) => p.focus !== "strength");
      if (alt) {
        planned = alt;
        why.push(`You did strength yesterday, so today is ${FOCUS_LABEL[alt.focus]} while your muscles recover.`);
        return alt.focus;
      }
      why.push("You did strength yesterday — mobility today lets your muscles recover.");
      planned = undefined;
      return "mobility";
    }
    const doneN = week.done;
    if (next.day < today) why.push(`${capitalise(FOCUS_LABEL[next.focus])} is next in your plan — moved to today, nothing to make up.`);
    else why.push(`${capitalise(FOCUS_LABEL[next.focus])} is next in your plan — ${doneN} of ${week.target} sessions done this week.`);
    return next.focus;
  };

  if (ds?.focus) {
    focus = ds.focus;
    planned = pending.find((p) => p.focus === focus);
    why.push(`You picked ${FOCUS_LABEL[focus]} for today.`);
  } else if (severePain) {
    focus = "recovery";
    mode = "recovery";
    why.push(`Your ${painAreas.join(" and ") || "pain"} is high, so today is gentle, pain-free movement only.`);
  } else if (isRestart) {
    focus = "restart";
    mode = "restart";
    planned = pending[0];
    why.push(
      everTrained
        ? `It's been ${gap} days. A gentle restart — no catch-up, no backlog.`
        : "Let's start small. One easy session gets the ball rolling.",
    );
  } else if (feeling === "sore") {
    focus = pending[0]?.focus === "cardio" ? "cardio" : "recovery";
    mode = "recovery";
    planned = focus === "cardio" ? pending[0] : undefined;
    why.push(
      focus === "cardio"
        ? "You're sore, so today is easy cardio — moving helps soreness more than resting."
        : "You're sore, so today is recovery: gentle movement helps more than rest.",
    );
  } else if (feeling === "tired" && (recentTrainingDays >= 2 || strengthYesterday)) {
    focus = "recovery";
    mode = "recovery";
    why.push(`You're tired and trained ${recentTrainingDays} of the last 3 days — a recovery session keeps the habit without digging a hole.`);
  } else if (!pending.length) {
    focus = alternativesFor("strength", snap).includes("cardio") && profile.likes.some((l) => ["walking", "hiking", "football", "running", "cycling"].includes(l)) ? "cardio" : "mobility";
    const enjoyed = alternativesFor(focus, snap)[0];
    if (snap.insights.some((i) => i.key === `enjoys_focus:${enjoyed}` && i.status !== "rejected")) focus = enjoyed;
    kind = plan ? "week_complete" : "workout";
    if (plan) why.push(`You've hit this week's target (${week.done} of ${week.target}). Anything more is a bonus — rest is a fine choice too.`);
  } else {
    focus = plannedFocus();
    const remainingDays = plan ? eachDay(today, plan.weekEnd).length : 7;
    if (planned && planned.day > today && pending.length < remainingDays) {
      kind = "rest_day";
    } else if (planned && planned.day > today && pending.length >= remainingDays) {
      why[why.length - 1] = `${pending.length} sessions left and ${remainingDays} days in the week — today's a good day for one.`;
    }
  }

  // "Something different" cycles through other kinds of session.
  const shuffle = ds?.shuffle ?? 0;
  if (shuffle > 0 && !ds?.focus) {
    const options = [focus, ...alternativesFor(focus, snap)];
    const picked = options[shuffle % options.length];
    if (picked !== focus) {
      why.length = 0;
      why.push(`Something different: ${FOCUS_LABEL[picked]} instead of ${FOCUS_LABEL[focus]}.`);
      focus = picked;
      planned = pending.find((p) => p.focus === focus) ?? planned;
    }
    if (kind === "rest_day") kind = "workout";
  }

  if (ds?.notToday) kind = "not_today";
  else if (doneToday.length) kind = "done_today";

  // ---- Variant ---------------------------------------------------------------
  const evening = timeOfDay(now) === "evening";
  let variant: Variant = plan?.defaultVariant ?? "quick";
  const variantWhy: string[] = [];
  if ((ins("prefers_shorter_sessions") || ins("frequent_barrier:no_time")) && variant === "full") {
    variant = "quick";
    variantWhy.push("15 minutes — shorter sessions have been working better for you.");
  }
  if (mode === "first") variant = capVariant(variant, "quick");
  if (focus === "restart") {
    variant = ins("restart_friction") ? "minimum" : capVariant(variant, "quick");
  }
  if (evening && ins("evening_low_energy")) {
    const capped = capVariant(variant, feeling === "tired" ? "minimum" : "quick");
    if (capped !== variant) variantWhy.push("Evenings have been tough lately, so this one's shorter. Mornings may suit you better.");
    variant = capped;
  }
  if (feeling === "tired") variant = capVariant(variant, "quick");
  if (feeling === "great" && ins("handles_longer_sessions") && focus !== "restart") {
    variant = "full";
    variantWhy.push("You're feeling great and often have more in the tank — the full version today.");
  }
  if (feeling === "busy") {
    variant = "minimum";
    variantWhy.push("Busy day: the 5-minute version still counts toward your week.");
  }
  if (kind === "week_complete" || kind === "rest_day") variant = capVariant(variant, "quick");
  if (kind === "done_today" || kind === "not_today") variant = "minimum";
  if (ds?.variant) {
    variant = ds.variant;
    variantWhy.length = 0;
  }

  // ---- Intensity -------------------------------------------------------------
  let intensity = 0;
  if (feeling === "tired") intensity = -1;
  if (ins("sessions_too_hard")) {
    intensity = Math.min(intensity, -1);
    variantWhy.push("Starting a notch easier — recent sessions have felt hard.");
  }
  if (ds?.intensity !== undefined) intensity = ds.intensity;
  if (mode === "recovery" || focus === "recovery") mode = "recovery";
  else if (feeling === "busy" && mode === "normal") mode = "busy";
  else if (intensity < 0 && mode === "normal") mode = "lighter";

  const workout = buildWorkout(snap, {
    focus: kind === "done_today" ? "recovery" : focus,
    variant,
    intensity,
    date: today,
    shuffle,
    swaps: ds?.swaps,
    gapDays: gap,
  });

  // ---- Rationale ---------------------------------------------------------------
  const rationale: string[] = [];
  if (mode === "first") rationale.push("Your first session starts conservatively — how it feels will calibrate everything after.");
  rationale.push(...why.slice(0, 1));
  // Safety notes outrank everything except the main reason.
  if (painAreas.length && !severePain) rationale.push(`Exercises that load your ${painAreas.join(" and ")} are left out.`);
  if (!variantWhy.length && kind === "workout") {
    variantWhy.push(
      variant === "minimum"
        ? "5 minutes of the most important movements — short, but it counts."
        : `The ${VARIANT_MINUTES[variant]}-minute version, matching the time you said you usually have.`,
    );
  }
  rationale.push(...variantWhy.slice(0, 1));
  const lastEvents = recentProgressionNote(snap, today);
  if (lastEvents) rationale.push(lastEvents);

  const headline = {
    workout: workout.title,
    rest_day: "Rest day",
    done_today: "Done for today",
    not_today: "Taking today off",
    week_complete: "Week complete",
    needs_clearance: "Health check first",
  }[kind];

  const upNext = kind === "rest_day" || kind === "done_today" || kind === "not_today" ? pending.find((p) => p.day > today) : undefined;
  if (kind === "rest_day" && planned) {
    rationale.splice(0, rationale.length, `Next up: ${FOCUS_LABEL[planned.focus]} on ${weekdayName(planned.day)}. You're on track — rest is part of training.`, "Feel like moving anyway? Do it today and the plan adjusts.");
  }
  if (kind === "done_today") rationale.splice(0, rationale.length, "You've trained today. Recovery is when the adaptation happens.");
  if (kind === "not_today") rationale.splice(0, rationale.length, "No problem — the plan adjusts and nothing piles up.", "Changed your mind? The 5-minute version is right here.");

  const leadWithMinimum =
    kind === "workout" &&
    variant !== "minimum" &&
    (mode === "restart" || ins("frequent_barrier:motivation") || ins("restart_friction") || gap >= 2 || mode === "first");

  return {
    ...base,
    kind,
    mode,
    focus,
    variant,
    intensity,
    workout,
    headline,
    rationale: rationale.slice(0, 3),
    plannedSessionId: planned?.id,
    alternatives: alternativesFor(focus, snap),
    upNext,
    leadWithMinimum,
  };
}

function recentProgressionNote(snap: EngineSnapshot, today: string): string | null {
  const last = completedSessions(snap.sessions).filter((s) => s.source === "guided").at(-1);
  if (!last || daysBetween(last.date, today) > 10) return null;
  const ev = snap.events.filter((e) => e.date === last.date && e.kind !== "paused" && e.exerciseId !== "__cardio").at(-1);
  if (!ev) return null;
  if (ev.kind === "switch_harder") return `New level: ${ev.to}. You earned it.`;
  if (ev.kind === "progress" || ev.kind === "load_up") return `Progressed: ${ev.to}.`;
  return `Adjusted: ${ev.to}, so every rep stays solid.`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
