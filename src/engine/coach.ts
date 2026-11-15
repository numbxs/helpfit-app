import { addDays, dayKey, timeOfDay } from "./dates";
import { EXERCISE_BY_ID } from "./exercises/library";
import { countsTowardWeek } from "./planner";
import { FOCUS_LABEL, type Recommendation } from "./recommender";
import { activePain, AREA_LABEL } from "./safety";
import type { StatsSummary } from "./stats";
import type { Barrier, EngineSnapshot, Focus, TimeOfDay, Variant } from "./types";

/**
 * Coaching layer. Deterministic code owns every decision about training; the coach
 * (rule-based here, optionally an LLM via /api/coach) can only explain and PROPOSE
 * one of these actions, which the user confirms and the engine applies.
 */
export type CoachAction =
  | { type: "set_variant"; variant: Variant }
  | { type: "adjust_intensity"; delta: -1 | 1 }
  | { type: "set_focus"; focus: Focus }
  | { type: "change_format" }
  | { type: "not_today"; reason: Barrier | "rest" }
  | { type: "report_pain" }
  | { type: "reset_today" };

export interface CoachProposal {
  label: string;
  actions: CoachAction[];
}

export interface CoachReply {
  text: string;
  proposals: CoachProposal[];
  source: "local" | "ai";
}

export interface CoachContext {
  date: string;
  timeOfDay: TimeOfDay;
  profile: {
    goals: string[];
    activityLevel: string;
    experience: string;
    daysPerWeek: number;
    sessionMinutes: number;
    locations: string[];
    equipment: string[];
    likes: string[];
    dislikes: string[];
    barriers: string[];
  };
  health?: {
    cautionAreas: string[];
    activePain: { area: string; severity: number; quality: string; since: string }[];
    readiness: string;
    ageYears?: number;
    heightCm?: number;
    weightKg?: number;
  };
  week: { start: string; end: string; done: number; minutes: number; minimum: number; target: number; stretch: number; strengthDone: number; cardioDone: number };
  today: { kind: string; focus: string; variant: string; minutes: number | null; title: string | null; rationale: string[]; exercises: string[] };
  recent: {
    daysSinceActivity: number;
    lastSessions: { date: string; focus: string; minutes: number; status: string; difficulty?: string; enjoyment?: string }[];
    repeatedExercises: { name: string; times: number }[];
  };
  progress: { adherence4Weeks: number | null; totalSessions: number; milestones: string[]; strength: { exercise: string; current: string }[] };
  learned: { statement: string; status: string }[];
}

export function buildCoachContext(
  snap: EngineSnapshot,
  rec: Recommendation,
  stats: StatsSummary,
  now: Date,
  opts: { includeHealth: boolean },
): CoachContext {
  const today = dayKey(now);
  const plan = snap.plan;
  const inWeek = plan ? snap.sessions.filter((s) => s.date >= plan.weekStart && s.date <= plan.weekEnd && countsTowardWeek(s)) : [];
  const since = addDays(today, -14);
  const repeated = new Map<string, number>();
  for (const s of snap.sessions.filter((x) => x.date >= since && countsTowardWeek(x))) {
    for (const e of s.exercises) {
      if (e.role !== "main" || e.skipped) continue;
      repeated.set(e.exerciseId, (repeated.get(e.exerciseId) ?? 0) + 1);
    }
  }
  const p = snap.profile;
  const ctx: CoachContext = {
    date: today,
    timeOfDay: timeOfDay(now),
    profile: {
      goals: p.goals,
      activityLevel: p.activityLevel,
      experience: p.experience,
      daysPerWeek: p.daysPerWeek,
      sessionMinutes: p.sessionMinutes,
      locations: p.locations,
      equipment: p.equipment,
      likes: p.likes,
      dislikes: p.dislikes,
      barriers: p.barriers,
    },
    week: {
      start: plan?.weekStart ?? today,
      end: plan?.weekEnd ?? today,
      done: rec.week.done,
      minutes: rec.week.minutes,
      minimum: rec.week.minimum,
      target: rec.week.target,
      stretch: rec.week.stretch,
      strengthDone: inWeek.filter((s) => s.focus === "strength").length,
      cardioDone: inWeek.filter((s) => s.focus === "cardio" || s.source === "external").length,
    },
    today: {
      kind: rec.kind,
      focus: rec.focus,
      variant: rec.variant,
      minutes: rec.workout?.estimatedMinutes ?? null,
      title: rec.workout?.title ?? null,
      rationale: rec.rationale,
      exercises: rec.workout ? [...new Set(rec.workout.blocks.flatMap((b) => b.items.map((i) => EXERCISE_BY_ID[i.exerciseId]?.name ?? i.exerciseId)))] : [],
    },
    recent: {
      daysSinceActivity: stats.daysSinceActivity,
      lastSessions: snap.sessions
        .filter((s) => s.status !== "in_progress")
        .slice(-6)
        .map((s) => ({
          date: s.date,
          focus: s.source === "external" ? (s.activity ?? "activity") : s.focus,
          minutes: Math.round(s.actualMinutes),
          status: s.status,
          difficulty: s.feedback?.difficulty,
          enjoyment: s.feedback?.enjoyment,
        })),
      repeatedExercises: [...repeated.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, n]) => ({ name: EXERCISE_BY_ID[id]?.name ?? id, times: n })),
    },
    progress: {
      adherence4Weeks: stats.adherence,
      totalSessions: stats.totalSessions,
      milestones: stats.milestones.slice(0, 5).map((m) => `${m.date}: ${m.to}`),
      strength: stats.strength.map((s) => ({ exercise: s.name, current: s.current })),
    },
    learned: snap.insights.filter((i) => i.status !== "rejected").map((i) => ({ statement: i.statement, status: i.status })),
  };
  if (opts.includeHealth) {
    ctx.health = {
      cautionAreas: p.cautionAreas,
      activePain: activePain(snap.pain).map((x) => ({ area: x.area, severity: x.severity, quality: x.quality, since: x.date })),
      readiness: p.readiness.status,
      ageYears: p.ageYears,
      heightCm: p.heightCm,
      weightKg: p.weightKg,
    };
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Rule-based coach (works offline, no API key)
// ---------------------------------------------------------------------------

const RED_FLAGS = /chest (pain|tight|pressure)|can'?t breathe|short(ness)? of breath|faint|passed out|dizz|palpitation|heart (racing|pounding)/i;
const PAIN = /\b(pain|hurts?|hurting|injur|tweak|twinge|strain|sprain|pinch|sharp)\b/i;
const SORE = /\b(sore|doms|stiff|aching|achy)\b/i;
const TIRED = /\b(tired|exhausted|drained|wiped|knackered|fatigued|sleepy|no energy|low energy|burn(ed|t)? out|shattered)\b/i;
const RESTART = /(haven'?t|have not|didn'?t|did not) (exercis|train|work(ed)? out|been active)|been a while|fell off|getting back|get back|restart|week off|missed (a|the|my|\d)|lost (my )?momentum/i;
const BORED = /\b(bored|boring|same (thing|routine|old)|repetitive|monoton|change (it|things) up|something (new|different)|variety)\b/i;
const HARDER = /\b(too easy|harder|more challeng|push me|step it up|not enough)\b/i;
const EASIER = /\b(too hard|easier|struggl|too much|can'?t keep up|overwhelm)\b/i;
const WHY = /\bwhy\b|reason|explain/i;
const PROGRESS = /progress|improv|how am i doing|stronger|fitter|results|working\??$/i;
const SKIP = /not today|skip (today|it)|can'?t (do it )?today|take (the|a) day off|day off/i;
const BUSY = /\b(busy|no time|short on time|swamped|slammed|only have|quick one)\b/i;
const MOTIVATION = /unmotivated|no motivation|don'?t feel like|can'?t be bothered|lazy|not in the mood|meh/i;
const PLAN = /this week|my plan|schedule|what'?s (next|planned)|week look/i;
const MINUTES = /(\d{1,2})\s*(?:min|mins|minutes|m\b)/i;

export function localCoachReply(message: string, ctx: CoachContext): CoachReply {
  const m = message.trim();
  const minutesMatch = m.match(MINUTES);
  const minutes = minutesMatch ? Number(minutesMatch[1]) : null;
  const variantFor = (mins: number): Variant => (mins <= 7 ? "minimum" : mins <= 18 ? "quick" : "full");
  const reply = (text: string, proposals: CoachProposal[] = []): CoachReply => ({ text, proposals, source: "local" });
  const { week } = ctx;

  if (RED_FLAGS.test(m)) {
    return reply(
      "Please stop exercising. Chest pain or pressure, unusual breathlessness, dizziness or fainting need medical attention — if it's severe or not settling, call your local emergency number. I won't suggest any workouts until you've seen a doctor.",
      [{ label: "Log a symptom", actions: [{ type: "report_pain" }] }],
    );
  }

  if (PAIN.test(m)) {
    return reply(
      "Let's not push through pain. Log where it is and how bad it is — I'll take out anything that loads that area and only suggest pain-free movement. If it's sharp, severe, or still there in a week, get it checked by a physio or doctor.",
      [
        { label: "Log discomfort", actions: [{ type: "report_pain" }] },
        { label: "Gentle recovery today", actions: [{ type: "set_focus", focus: "recovery" }, { type: "set_variant", variant: "quick" }] },
      ],
    );
  }

  if (SORE.test(m)) {
    return reply(
      "Muscle soreness a day or two after training is normal and usually eases with light movement. Today can be recovery: easy movement and mobility, nothing heavy. If it's sharp or in a joint, log it as discomfort instead.",
      [
        { label: "Recovery session", actions: [{ type: "set_focus", focus: "recovery" }] },
        { label: "Log discomfort", actions: [{ type: "report_pain" }] },
      ],
    );
  }

  if (SKIP.test(m)) {
    return reply(
      `That's fine — rest is part of training, and nothing piles up. If you've got 5 minutes, the short version still counts toward your week (${week.done} of ${week.minimum} minimum so far).`,
      [
        { label: "Do 5 minutes instead", actions: [{ type: "set_variant", variant: "minimum" }] },
        { label: "Take today off", actions: [{ type: "not_today", reason: "rest" }] },
      ],
    );
  }

  if (TIRED.test(m) || (minutes !== null && minutes <= 12 && (BUSY.test(m) || TIRED.test(m)))) {
    const v = minutes !== null ? variantFor(minutes) : "quick";
    const mins = minutes ?? 10;
    if (week.strengthDone >= 1 || ctx.today.focus === "recovery") {
      return reply(
        `You've already done ${week.strengthDone} strength session${week.strengthDone === 1 ? "" : "s"} this week. Let's make today a short recovery-focused session — ${mins} minutes is enough today.`,
        [{ label: `${mins}-min recovery session`, actions: [{ type: "set_focus", focus: "recovery" }, { type: "set_variant", variant: v }] }],
      );
    }
    return reply(
      `Tired is a reason to go lighter, not to stop. Here's a ${mins}-minute version of today's ${FOCUS_LABEL[ctx.today.focus as Focus] ?? "session"} at an easier intensity — it still counts.`,
      [
        { label: `Lighter ${mins}-min version`, actions: [{ type: "set_variant", variant: v }, { type: "adjust_intensity", delta: -1 }] },
        { label: "Recovery instead", actions: [{ type: "set_focus", focus: "recovery" }, { type: "set_variant", variant: v }] },
      ],
    );
  }

  if (RESTART.test(m)) {
    const d = ctx.recent.daysSinceActivity;
    const lead =
      d >= 4
        ? `It's been ${d} days since your last session — no problem.`
        : d === 0
          ? "You trained today, so you're not as far off as it feels."
          : `Your last session was ${d} day${d === 1 ? "" : "s"} ago — you're closer than it feels.`;
    return reply(`${lead} Let's restart with a simple 12-minute session. No need to make up the missed workouts.`, [
      { label: "Start a restart session", actions: [{ type: "set_focus", focus: "restart" }, { type: "set_variant", variant: "quick" }] },
      { label: "Just 5 minutes", actions: [{ type: "set_focus", focus: "restart" }, { type: "set_variant", variant: "minimum" }] },
    ]);
  }

  if (BORED.test(m)) {
    const top = ctx.recent.repeatedExercises[0];
    const lead = top ? `You've done ${top.name.toLowerCase()} ${top.times} times in the last two weeks.` : "Fair enough.";
    return reply(
      `${lead} I'll change the format and rotate the supporting exercises while keeping your strength progression intact. Or try a different kind of session today.`,
      [
        { label: "Change the format", actions: [{ type: "set_focus", focus: (ctx.today.focus as Focus) ?? "strength" }, { type: "change_format" }] },
        { label: "Cardio instead", actions: [{ type: "set_focus", focus: "cardio" }] },
        { label: "Mobility instead", actions: [{ type: "set_focus", focus: "mobility" }] },
      ],
    );
  }

  if (MOTIVATION.test(m)) {
    return reply("Motivation usually shows up after you start, not before. Commit to five minutes — if you want to stop after that, stop. That still counts.", [
      { label: "Just 5 minutes", actions: [{ type: "set_variant", variant: "minimum" }] },
    ]);
  }

  if (minutes !== null) {
    const v = variantFor(minutes);
    return reply(`Got it — ${minutes} minutes. Here's the ${v === "minimum" ? "5" : v === "quick" ? "15" : "30"}-minute version of today's session; it keeps the same training goal.`, [
      { label: `Use the ${v === "minimum" ? "5" : v === "quick" ? "15" : "30"}-min version`, actions: [{ type: "set_variant", variant: v }] },
    ]);
  }

  if (HARDER.test(m)) {
    return reply(
      "Good sign. Today gets a harder version. Your base targets also step up automatically after two solid sessions in a row — rating sessions \"too easy\" speeds that up.",
      [{ label: "Make today harder", actions: [{ type: "adjust_intensity", delta: 1 }] }],
    );
  }

  if (EASIER.test(m)) {
    return reply(
      "Let's dial it back. Today gets an easier version, and if sessions keep feeling too hard your targets step down automatically. Finishing comfortably beats grinding.",
      [{ label: "Make today easier", actions: [{ type: "adjust_intensity", delta: -1 }] }],
    );
  }

  if (WHY.test(m)) {
    const r = ctx.today.rationale.length ? ctx.today.rationale.join(" ") : "It's the next session in your plan.";
    return reply(`${ctx.today.title ? `Today is ${ctx.today.title.toLowerCase()}.` : ""} ${r}`.trim());
  }

  if (PROGRESS.test(m)) {
    if (!ctx.progress.totalSessions) return reply("No sessions logged yet, so there's nothing to measure. Your first one sets the baseline — then I can show real changes.");
    const adh = ctx.progress.adherence4Weeks !== null ? ` You've hit ${Math.round(ctx.progress.adherence4Weeks * 100)}% of your weekly targets over the last 4 weeks.` : "";
    const ms = ctx.progress.milestones.length ? ` Recent progress: ${ctx.progress.milestones.slice(0, 3).map((x) => x.split(": ").slice(1).join(": ")).join("; ")}.` : " No progressions yet — they kick in after two solid sessions at the same target.";
    return reply(`${ctx.progress.totalSessions} sessions so far.${adh}${ms}`);
  }

  if (PLAN.test(m) || BUSY.test(m)) {
    return reply(
      `This week: ${week.done} of ${week.target} sessions done (minimum ${week.minimum}). ${week.done >= week.target ? "Target reached — anything else is a bonus." : week.done >= week.minimum ? "Minimum covered. Each extra session is progress." : "Short on time? Every session has a 5-minute version."}`,
      BUSY.test(m) ? [{ label: "Use the 5-min version", actions: [{ type: "set_variant", variant: "minimum" }] }] : [],
    );
  }

  return reply(
    "I can adjust today's session (shorter, easier, harder, or a different type), explain why it was chosen, help you restart after a break, or summarise your progress. What would help?",
    [
      { label: "Only 5 minutes", actions: [{ type: "set_variant", variant: "minimum" }] },
      { label: "Something different", actions: [{ type: "set_focus", focus: ctx.today.focus === "cardio" ? "mobility" : "cardio" }] },
    ],
  );
}

export function painSummary(snap: EngineSnapshot): string[] {
  return activePain(snap.pain).map((p) => `${AREA_LABEL[p.area]} (${p.severity}/10)`);
}
