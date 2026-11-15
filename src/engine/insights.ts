import { addDays, daysBetween, dayKey, timeOfDay } from "./dates";
import { EXERCISE_BY_ID } from "./exercises/library";
import { BARRIER_LABEL, completionByTime, completionByVariant, completedSessions, returnsAfterGaps } from "./stats";
import type { Barrier, DayState, Insight, InsightKey, Profile, SessionLog, SkipEvent, TimeOfDay } from "./types";

/**
 * Behavioural pattern detection. Each insight states its evidence and the concrete
 * effect it has on recommendations. Insights are "inferred" until the user confirms
 * or rejects them; rejected insights never influence recommendations.
 * Minimum sample sizes keep the app from over-claiming.
 */

export interface InsightInput {
  profile: Profile;
  sessions: SessionLog[];
  skips: SkipEvent[];
  dayStates: DayState[];
  existing: Insight[];
  now: Date;
}

type Draft = Omit<Insight, "status" | "createdAt" | "updatedAt">;

const OUTDOOR_EX = new Set(["brisk_walk", "power_walk_intervals", "hill_walk", "walk_jog_intervals", "easy_jog", "shuttle_runs", "outdoor_cycling"]);

const BARRIER_EFFECT: Partial<Record<Barrier, string>> = {
  no_time: "Busy weeks default to 15-minute sessions, and the 5-minute version stays one tap away.",
  low_energy: "On low-energy days you'll get lighter sessions instead of skipping.",
  mental_fatigue: "When you're drained, sessions get simpler and shorter — less to think about.",
  motivation: "Today leads with a 5-minute start. Starting is the hard part; you can always keep going.",
  forgot: "Turn on planned-day reminders or add the week to your calendar (Profile → Reminders).",
  boredom: "Workouts rotate formats and accessory exercises more often.",
  too_hard: "Sessions start a notch easier while your progressions catch up.",
  equipment_location: "More no-equipment options are prioritised.",
  pain_soreness: "More recovery sessions, and exercises that load sore areas are left out.",
  unpredictable_schedule: "Your plan reflows automatically when days change — nothing piles up.",
};

export function detectInsights(input: InsightInput): Insight[] {
  const today = dayKey(input.now);
  const since42 = addDays(today, -42);
  const since56 = addDays(today, -56);
  const recentSessions = input.sessions.filter((s) => s.date >= since56 && s.status !== "in_progress");
  const recentSkips = input.skips.filter((s) => s.date >= since42);
  const recentDays = input.dayStates.filter((d) => d.date >= since42);
  const drafts: Draft[] = [];

  // 1. Duration preference
  const byVariant = completionByVariant(recentSessions, recentDays, recentSkips, today);
  const full = byVariant.full;
  const shortN = byVariant.quick.attempts + byVariant.minimum.attempts;
  const shortDone = byVariant.quick.completed + byVariant.minimum.completed;
  const downgrades = recentDays.filter((d) => d.shown && d.variant && rank(d.variant) < rank(d.shown.variant)).length;
  if ((full.attempts >= 3 && (full.rate ?? 1) < 0.5 && shortN >= 3 && shortDone / shortN >= 0.7) || downgrades >= 3) {
    drafts.push({
      key: "prefers_shorter_sessions",
      statement: "Shorter sessions work better for you right now.",
      evidence:
        downgrades >= 3
          ? `You chose a shorter version ${downgrades} times in the last 6 weeks.`
          : `You completed ${full.completed} of ${full.attempts} 30-minute sessions but ${shortDone} of ${shortN} shorter ones.`,
      effect: "Sessions default to 15 minutes. The 30-minute version is still there when you want it.",
      confidence: full.attempts + shortN >= 8 ? "high" : "medium",
    });
  }
  const extended = recentSessions.filter((s) => s.extended).length;
  const upgrades = recentDays.filter((d) => d.shown && d.variant && rank(d.variant) > rank(d.shown.variant)).length;
  if (extended + upgrades >= 3 && !drafts.some((d) => d.key === "prefers_shorter_sessions")) {
    drafts.push({
      key: "handles_longer_sessions",
      statement: "You often have more in the tank than planned.",
      evidence: `You extended or upgraded a session ${extended + upgrades} times recently.`,
      effect: "On days you feel great, the full 30-minute version is suggested.",
      confidence: "medium",
    });
  }

  // 2. Evening energy
  const eveningSkips = recentSkips.filter((s) => (s.reason === "low_energy" || s.reason === "mental_fatigue") && timeOfDay(new Date(s.at)) === "evening");
  const eveningHard = recentSessions.filter(
    (s) => s.source === "guided" && timeOfDay(new Date(s.startedAt)) === "evening" && (s.feedback?.difficulty === "too_hard" || s.status === "abandoned"),
  );
  if (eveningSkips.length + eveningHard.length >= 3 || eveningSkips.length >= 2) {
    drafts.push({
      key: "evening_low_energy",
      statement: "Evenings are often low-energy for you.",
      evidence: `${eveningSkips.length} evening skips for low energy or mental fatigue${eveningHard.length ? ` and ${eveningHard.length} tough evening sessions` : ""} in the last 6 weeks.`,
      effect: "In the evening you'll get shorter, lighter sessions. If mornings are possible, they may work better.",
      confidence: eveningSkips.length + eveningHard.length >= 4 ? "high" : "medium",
    });
  }

  // 3. Best time window
  const byTime = completionByTime(recentSessions, recentSkips);
  const windows = (Object.entries(byTime) as [TimeOfDay, (typeof byTime)[TimeOfDay]][]).filter(([, r]) => r.completed >= 3 && r.rate !== null);
  if (windows.length) {
    const [bestT, best] = windows.reduce((a, b) => ((b[1].rate as number) > (a[1].rate as number) ? b : a));
    const others = (Object.entries(byTime) as [TimeOfDay, (typeof byTime)[TimeOfDay]][]).filter(([t, r]) => t !== bestT && r.attempts >= 2);
    const othersRate = others.length ? others.reduce((a, [, r]) => a + (r.rate ?? 0), 0) / others.length : null;
    if ((best.rate as number) >= 0.75 && (othersRate === null ? best.completed >= 4 : (best.rate as number) - othersRate >= 0.2)) {
      drafts.push({
        key: "best_time_window",
        statement: `You follow through best in the ${bestT}.`,
        evidence: `${best.completed} of ${best.attempts} ${bestT} sessions completed${othersRate !== null ? `, vs ${Math.round(othersRate * 100)}% at other times` : ""}.`,
        effect: `Reminders default to the ${bestT}.`,
        confidence: best.attempts >= 6 ? "high" : "medium",
        data: { window: bestT },
      });
    }
  }

  // 4. Outdoor vs indoor cardio enjoyment
  const cardio = recentSessions.filter((s) => (s.focus === "cardio" || s.source === "external") && s.feedback?.enjoyment);
  const isOutdoor = (s: SessionLog) =>
    s.source === "external" ? ["football", "hiking", "walking", "running", "cycling"].includes(s.activity ?? "") : s.exercises.some((e) => OUTDOOR_EX.has(e.exerciseId));
  const score = (list: SessionLog[]) => list.reduce((a, s) => a + (s.feedback?.enjoyment === "yes" ? 2 : s.feedback?.enjoyment === "ok" ? 1 : 0), 0) / (list.length || 1);
  const outdoor = cardio.filter(isOutdoor);
  const indoor = cardio.filter((s) => !isOutdoor(s));
  if (outdoor.length >= 2 && indoor.length >= 2) {
    const diff = score(outdoor) - score(indoor);
    if (diff >= 0.75) {
      drafts.push({
        key: "prefers_outdoor_cardio",
        statement: "You enjoy outdoor cardio more than indoor.",
        evidence: `Outdoor sessions rated higher (${outdoor.length} outdoor vs ${indoor.length} indoor).`,
        effect: "Cardio sessions default to outdoor options like walks, hills and runs.",
        confidence: outdoor.length + indoor.length >= 6 ? "high" : "medium",
      });
    } else if (diff <= -0.75) {
      drafts.push({
        key: "prefers_indoor_cardio",
        statement: "You enjoy indoor cardio more than outdoor.",
        evidence: `Indoor sessions rated higher (${indoor.length} indoor vs ${outdoor.length} outdoor).`,
        effect: "Cardio sessions default to indoor options.",
        confidence: "medium",
      });
    }
  }

  // 5. Restart friction
  const recentDone = completedSessions(input.sessions).filter((s) => s.date >= since56);
  const gaps = returnsAfterGaps(recentDone, 4);
  const lastDone = completedSessions(input.sessions).at(-1);
  const currentGap = lastDone ? daysBetween(lastDone.date, today) : 0;
  if (gaps.count + (currentGap >= 4 ? 1 : 0) >= 2) {
    const avg = gaps.gaps.length ? Math.round(gaps.gaps.reduce((a, b) => a + b, 0) / gaps.gaps.length) : currentGap;
    drafts.push({
      key: "restart_friction",
      statement: "Restarting after a break is a sticking point.",
      evidence: `${gaps.count + (currentGap >= 4 ? 1 : 0)} breaks of 4+ days in the last 8 weeks (about ${avg} days each).`,
      effect: "Restart mode kicks in after 3 quiet days and begins with a 5-minute session.",
      confidence: "medium",
    });
  }

  // 6. Session difficulty trend
  const lastGuided = recentSessions.filter((s) => s.source === "guided" && s.feedback?.difficulty).slice(-4);
  const hardCount = lastGuided.filter((s) => s.feedback?.difficulty === "hard" || s.feedback?.difficulty === "too_hard").length;
  const tooHard = lastGuided.filter((s) => s.feedback?.difficulty === "too_hard").length;
  if (lastGuided.length >= 3 && (tooHard >= 2 || hardCount >= 3)) {
    drafts.push({
      key: "sessions_too_hard",
      statement: "Recent sessions have felt too hard.",
      evidence: `${hardCount} of your last ${lastGuided.length} sessions felt hard or too hard.`,
      effect: "Sessions start one notch easier until they feel manageable again.",
      confidence: "medium",
    });
  }
  const last3 = lastGuided.slice(-3);
  if (last3.length === 3 && last3.every((s) => s.feedback?.difficulty === "too_easy")) {
    drafts.push({
      key: "sessions_too_easy",
      statement: "Sessions have been too easy.",
      evidence: "Your last 3 sessions were rated too easy.",
      effect: "Targets step up faster after successful sessions.",
      confidence: "medium",
    });
  }

  // 7. Variety
  const boredSkips = recentSkips.filter((s) => s.reason === "boredom").length;
  const lowEnjoy = lastGuided.filter((s) => s.feedback?.enjoyment === "no").length;
  const lastFourGuided = recentSessions.filter((s) => s.source === "guided" && s.feedback?.enjoyment).slice(-4);
  const lowEnjoyRecent = lastFourGuided.filter((s) => s.feedback?.enjoyment === "no").length;
  if (boredSkips >= 2 || lowEnjoyRecent >= 2 || lowEnjoy >= 2) {
    drafts.push({
      key: "needs_variety",
      statement: "You'd benefit from more variety.",
      evidence: boredSkips >= 2 ? `You skipped ${boredSkips} times because you were bored.` : `${lowEnjoyRecent || lowEnjoy} recent sessions weren't enjoyable.`,
      effect: "Workout formats and accessory exercises rotate more, while your main progressions stay intact.",
      confidence: "medium",
    });
  }

  // 8. Exercise replacements
  const replaced = new Map<string, Map<string, number>>();
  for (const s of recentSessions) {
    for (const e of s.exercises) {
      if (e.skipReason !== "replaced") continue;
      const m = replaced.get(e.exerciseId) ?? new Map<string, number>();
      if (e.replacedBy) m.set(e.replacedBy, (m.get(e.replacedBy) ?? 0) + 1);
      else m.set("", (m.get("") ?? 0) + 1);
      replaced.set(e.exerciseId, m);
    }
  }
  for (const [exId, m] of replaced) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    if (total < 2) continue;
    const [topId] = [...m.entries()].filter(([k]) => k).sort((a, b) => b[1] - a[1])[0] ?? [""];
    const ex = EXERCISE_BY_ID[exId];
    const to = topId ? EXERCISE_BY_ID[topId] : undefined;
    if (!ex) continue;
    drafts.push({
      key: `avoid_exercise:${exId}`,
      statement: `You'd rather not do ${ex.name.toLowerCase()}.`,
      evidence: `You replaced it ${total} times${to ? `, usually with ${to.name.toLowerCase()}` : ""}.`,
      effect: to ? `${to.name} is used instead.` : "It's left out and a similar exercise is used instead.",
      confidence: total >= 3 ? "high" : "medium",
      data: to ? { replacement: to.id } : undefined,
    });
  }

  // 9. Enjoyed focus
  const enjoyCounts = new Map<string, number>();
  for (const s of recentSessions) {
    if (s.feedback?.enjoyment === "yes" && s.source === "guided") enjoyCounts.set(s.focus, (enjoyCounts.get(s.focus) ?? 0) + 1);
  }
  for (const [focus, n] of enjoyCounts) {
    if (n >= 3 && focus !== "restart") {
      drafts.push({
        key: `enjoys_focus:${focus}`,
        statement: `You enjoy ${focus} sessions.`,
        evidence: `You rated ${n} ${focus} sessions as enjoyable.`,
        effect: `Optional extra sessions and "something different" favour ${focus}.`,
        confidence: n >= 5 ? "high" : "medium",
        data: { focus },
      });
    }
  }

  // 10. Frequent barriers
  const barrierMap = new Map<Barrier, number>();
  for (const s of recentSkips) {
    if (s.reason === "rest" || s.reason === "other") continue;
    barrierMap.set(s.reason, (barrierMap.get(s.reason) ?? 0) + 1);
  }
  for (const [b, n] of barrierMap) {
    if (n >= 3 && BARRIER_EFFECT[b]) {
      drafts.push({
        key: `frequent_barrier:${b}`,
        statement: `"${BARRIER_LABEL[b]}" keeps coming up as a reason to skip.`,
        evidence: `Reported ${n} times in the last 6 weeks.`,
        effect: BARRIER_EFFECT[b] as string,
        confidence: n >= 5 ? "high" : "medium",
      });
    }
  }

  return mergeInsights(input.existing, drafts, input.now);
}

/** Keeps user decisions (confirmed/rejected), refreshes evidence, retires stale inferred insights. */
export function mergeInsights(existing: Insight[], drafts: Draft[], now: Date): Insight[] {
  const nowIso = now.toISOString();
  const out: Insight[] = [];
  const draftKeys = new Set(drafts.map((d) => d.key));
  for (const d of drafts) {
    const prev = existing.find((e) => e.key === d.key);
    out.push({ ...d, status: prev?.status ?? "inferred", createdAt: prev?.createdAt ?? nowIso, updatedAt: nowIso });
  }
  for (const e of existing) {
    if (draftKeys.has(e.key)) continue;
    // Keep user decisions; drop inferred insights the data no longer supports.
    if (e.status === "confirmed" || e.status === "rejected") out.push(e);
  }
  return out;
}

export function activeInsight(insights: Insight[], key: InsightKey): Insight | undefined {
  return insights.find((i) => i.key === key && i.status !== "rejected");
}

function rank(v: string): number {
  return v === "minimum" ? 0 : v === "quick" ? 1 : 2;
}
