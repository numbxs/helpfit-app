import { addDays, dayKey } from "../dates";
import type { Feeling } from "../types";
import { MIND_PRACTICE_BY_ID } from "./practices";
import type { MindProfile, MindSessionLog, MindState } from "./types";

export interface MindSuggestion {
  practiceId: string;
  minutes: number;
  reason: string;
}

export interface MindRecommendation {
  kind: "setup" | "practice" | "done";
  primary: MindSuggestion | null;
  focusBlock: MindSuggestion;
  alternatives: MindSuggestion[];
  week: { days: number; target: number; minutes: number };
}

export interface MindInput {
  profile: MindProfile | null;
  state: MindState | null;
  sessions: MindSessionLog[];
  now: Date;
  feeling?: Feeling;
  /** A physical session was completed today (exercise acutely helps attention). */
  trainedToday?: boolean;
}

export const MIND_WEEKLY_DAYS = 5;

const MINDFULNESS_ROTATION = ["breath_anchor", "breath_counting", "noting", "breathing_space"];
const DRILLS = ["sart", "flanker", "schulte", "nback"];

/** Largest offered duration that fits the budget (or the shortest one). */
export function fitMinutes(practiceId: string, budget: number): number {
  const p = MIND_PRACTICE_BY_ID[practiceId];
  if (!p) return budget;
  const fitting = p.durations.filter((d) => d <= budget);
  return fitting.length ? Math.max(...fitting) : Math.min(...p.durations);
}

function lastDone(sessions: MindSessionLog[], id: string): string {
  return sessions.filter((s) => s.practiceId === id).map((s) => s.date).sort().at(-1) ?? "";
}

function leastRecent(ids: string[], sessions: MindSessionLog[]): string {
  return [...ids].sort((a, b) => lastDone(sessions, a).localeCompare(lastDone(sessions, b)) || ids.indexOf(a) - ids.indexOf(b))[0];
}

export function recommendMind(input: MindInput): MindRecommendation {
  const { profile, state, sessions, now } = input;
  const today = dayKey(now);
  const since = addDays(today, -6);
  const recent = sessions.filter((s) => s.date >= since && s.date <= today);
  const week = {
    days: new Set(recent.filter((s) => s.kind !== "focus_block" || s.focus?.completed).map((s) => s.date)).size,
    target: MIND_WEEKLY_DAYS,
    minutes: Math.round(recent.reduce((a, s) => a + s.actualMinutes, 0)),
  };
  const focusMinutes = state?.focusTargetMinutes ?? 20;
  const focusBlock: MindSuggestion = {
    practiceId: "focus_block",
    minutes: focusMinutes,
    reason: input.trainedToday
      ? "You trained today — exercise sharpens attention for a while afterwards. Good time for deep work."
      : `Your current focus span is ${focusMinutes} minutes. Two clean blocks and it grows by 5.`,
  };

  if (!profile) return { kind: "setup", primary: null, focusBlock, alternatives: [], week };

  const hour = now.getHours();
  const part = hour < 11 ? "morning" : hour < 18 ? "midday" : "evening";
  const budget = profile.dailyMinutes;
  const goals = new Set(profile.goals);
  const doneToday = sessions.some((s) => s.date === today && s.kind !== "focus_block" && s.completed);

  const suggest = (practiceId: string, reason: string, minutes?: number): MindSuggestion => ({
    practiceId,
    minutes: minutes ?? (practiceId === "breath_counting" && state ? state.breathCountMinutes : fitMinutes(practiceId, budget)),
    reason,
  });

  let primary: MindSuggestion;
  if (input.feeling === "tired" || input.feeling === "busy") {
    primary = suggest("cyclic_sigh", "A 2-minute reset — on a drained or busy day, short beats skipped.", 2);
  } else if (part === "evening") {
    primary =
      goals.has("sleep") || goals.has("calm")
        ? suggest("body_scan", "Evening: a body scan helps your mind and body downshift after a demanding day.")
        : suggest("extended_exhale", "Evening: long exhales calm a busy mind before rest.");
  } else {
    const drillsThisWeek = recent.filter((s) => DRILLS.includes(s.practiceId)).length;
    const lastDrill = sessions.filter((s) => DRILLS.includes(s.practiceId)).map((s) => s.date).sort().at(-1);
    const wantsDrills = goals.has("focus") || goals.has("attention_span") || goals.has("memory");
    const drillDue = wantsDrills && drillsThisWeek < 3 && (!lastDrill || lastDrill < today) && (sessions.length > 0 ? (hash2(today) % 2 === 0 || drillsThisWeek === 0) : false);
    if (drillDue) {
      const pool = goals.has("memory") ? DRILLS : DRILLS.filter((d) => d !== "nback");
      const id = leastRecent(pool, sessions);
      primary = suggest(id, "A short attention drill — measurable, so you can watch it improve.", MIND_PRACTICE_BY_ID[id].defaultMinutes);
    } else {
      const pool = goals.has("attention_span") || goals.has("focus") ? MINDFULNESS_ROTATION : ["breath_anchor", "noting", "breathing_space", "body_scan"];
      const id = leastRecent(pool, sessions);
      const why =
        id === "breath_counting"
          ? "Breath counting trains — and measures — how long you can hold attention."
          : id === "noting"
            ? "Noting trains you to catch distraction early, before it costs you an hour."
            : id === "breathing_space"
              ? "A structured 3-minute reset you can reuse between meetings."
              : "Every return from a wandering mind is one rep of attention training.";
      primary = suggest(id, why);
    }
  }

  const alternatives: MindSuggestion[] = [
    suggest("cyclic_sigh", "Fastest reset: 2 minutes.", 2),
    suggest("urge_surfing", "When the pull to check your phone is strong.", 3),
    suggest(part === "evening" ? "breath_anchor" : "body_scan", part === "evening" ? "Quiet focus on the breath." : "Deep downshift."),
  ].filter((a) => a.practiceId !== primary.practiceId);

  return { kind: doneToday ? "done" : "practice", primary, focusBlock, alternatives, week };
}

// Small deterministic alternation so drills land on roughly every other day.
function hash2(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
