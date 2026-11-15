import { countsTowardWeek } from "./planner";
import { BARRIER_LABEL } from "./stats";
import type { Adaptation, PainReport, Profile, ProgressionEvent, SessionLog, SkipEvent, Variant, WeekPlan, WeeklyReflection } from "./types";
import { AREA_LABEL } from "./safety";

export interface ReflectionInput {
  profile: Profile;
  plan: WeekPlan;
  previous: WeeklyReflection[]; // earlier reflections, any order
  sessions: SessionLog[];
  skips: SkipEvent[];
  pain: PainReport[];
  events: ProgressionEvent[];
  adaptation: Adaptation | null;
  now: Date;
}

export interface ReflectionResult {
  reflection: WeeklyReflection;
  adaptation: Adaptation;
}

const STEP_DOWN: Record<Variant, Variant> = { full: "quick", quick: "minimum", minimum: "minimum" };

/**
 * End-of-week review: what happened, what improved, what got in the way, and what
 * changes next week. Decreases (less friction) apply automatically; increases are
 * only ever proposed, never imposed.
 */
export function buildReflection(input: ReflectionInput): ReflectionResult {
  const { plan, profile } = input;
  const nowIso = input.now.toISOString();
  const inWeek = (d: string) => d >= plan.weekStart && d <= plan.weekEnd;
  const done = input.sessions.filter((s) => inWeek(s.date) && countsTowardWeek(s));
  const minutes = Math.round(done.reduce((a, s) => a + s.actualMinutes, 0));
  const t = plan.targets;
  const outcome: WeeklyReflection["outcome"] =
    done.length >= t.stretch ? "stretch" : done.length >= t.target ? "target" : done.length >= t.minimum ? "minimum" : "below_minimum";

  const accomplished: string[] = [];
  if (done.length) {
    accomplished.push(`${done.length} session${done.length === 1 ? "" : "s"} · ${minutes} active minutes.`);
    const kinds = new Map<string, number>();
    for (const s of done) {
      const k = s.source === "external" ? (s.activity ?? "activity") : s.focus;
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    accomplished.push([...kinds.entries()].map(([k, n]) => `${n} ${k}`).join(", ") + ".");
    const short = done.filter((s) => s.variant === "minimum" && s.source === "guided").length;
    if (short) accomplished.push(`${short} five-minute session${short === 1 ? "" : "s"} — showing up on hard days is the skill.`);
    const restart = done.find((s) => s.restart);
    if (restart) accomplished.push("You restarted after a break. That's the hardest part.");
  } else {
    accomplished.push("No sessions logged this week. That happens — next week starts fresh.");
  }

  const improved = input.events
    .filter((e) => inWeek(e.date) && (e.kind === "progress" || e.kind === "load_up" || e.kind === "switch_harder"))
    .slice(-4)
    .map((e) => (e.kind === "switch_harder" ? `Moved up to ${e.to}` : `${e.to} (was ${e.from.split(": ")[1] ?? e.from})`));

  const weekSkips = input.skips.filter((s) => inWeek(s.date) && s.reason !== "rest");
  const reasonCounts = new Map<string, number>();
  for (const s of weekSkips) reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
  const barriers = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${BARRIER_LABEL[r as keyof typeof BARRIER_LABEL]}${n > 1 ? ` (${n}×)` : ""}`);
  const weekPain = input.pain.filter((p) => inWeek(p.date));
  for (const p of weekPain) barriers.push(`Discomfort: ${AREA_LABEL[p.area]}`);

  const adaptation: Adaptation = { ...(input.adaptation ?? { id: "adaptation", updatedAt: nowIso }), updatedAt: nowIso };
  const currentTarget = adaptation.targetSessions ?? t.target;
  const currentVariant = adaptation.defaultVariant ?? plan.defaultVariant;
  const recommendations: string[] = [];
  const changes: WeeklyReflection["changes"] = [];

  const prevOutcomes = [...input.previous].sort((a, b) => b.weekStart.localeCompare(a.weekStart)).map((r) => r.outcome);
  const topReason = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const guided = done.filter((s) => s.source === "guided" && s.feedback?.difficulty);
  const easyWeek = guided.length > 0 && guided.every((s) => s.feedback?.difficulty === "too_easy" || s.feedback?.difficulty === "just_right");

  if (outcome === "below_minimum") {
    const newTarget = Math.max(1, currentTarget - (done.length === 0 || prevOutcomes[0] === "below_minimum" ? 1 : 0));
    if (newTarget < currentTarget) {
      adaptation.targetSessions = newTarget;
      changes.push({ kind: "target", description: `Weekly target: ${currentTarget} → ${newTarget} sessions`, value: newTarget });
    }
    const nextVariant = STEP_DOWN[currentVariant];
    if (nextVariant !== currentVariant && (topReason === "no_time" || topReason === "low_energy" || topReason === "mental_fatigue" || done.length === 0)) {
      adaptation.defaultVariant = nextVariant;
      changes.push({ kind: "variant", description: `Default session: ${label(currentVariant)} → ${label(nextVariant)}`, value: nextVariant });
    }
    recommendations.push(
      newTarget < currentTarget
        ? `Next week: ${newTarget} session${newTarget === 1 ? "" : "s"}. Smaller is easier to restart — we'll build back up.`
        : "Next week: same plan, and remember the 5-minute version counts.",
    );
  } else if (outcome === "minimum") {
    if (topReason === "no_time" && currentVariant === "full") {
      adaptation.defaultVariant = "quick";
      changes.push({ kind: "variant", description: "Default session: 30 → 15 minutes", value: "quick" });
      recommendations.push("Time was the blocker, so sessions default to 15 minutes next week.");
    } else {
      recommendations.push("You held your minimum — that's the habit forming. Same plan next week.");
    }
  } else {
    const consecutive = 1 + prevOutcomes.slice(0, 1).filter((o) => o === "target" || o === "stretch").length;
    if (consecutive >= 2 && easyWeek && currentTarget < Math.min(6, profile.daysPerWeek)) {
      adaptation.pendingProposal = {
        kind: "increase_target",
        createdAt: nowIso,
        weekStart: plan.weekStart,
        description: `Go from ${currentTarget} to ${currentTarget + 1} sessions a week?`,
      };
      changes.push({ kind: "proposal", description: `Optional: ${currentTarget + 1} sessions next week`, value: currentTarget + 1 });
      recommendations.push(`Two strong weeks in a row. If life allows, try ${currentTarget + 1} sessions — or keep ${currentTarget}; both are fine.`);
    } else if (consecutive >= 2 && easyWeek && currentVariant !== "full") {
      adaptation.pendingProposal = {
        kind: "longer_sessions",
        createdAt: nowIso,
        weekStart: plan.weekStart,
        description: `Make ${label(STEP_UP[currentVariant])} your default session length?`,
      };
      changes.push({ kind: "proposal", description: `Optional: ${label(STEP_UP[currentVariant])} sessions`, value: STEP_UP[currentVariant] });
      recommendations.push("Sessions have felt manageable. Longer sessions are on offer if you want them.");
    } else if (adaptation.targetSessions !== undefined && adaptation.targetSessions < profile.daysPerWeek && consecutive >= 2) {
      adaptation.pendingProposal = {
        kind: "increase_target",
        createdAt: nowIso,
        weekStart: plan.weekStart,
        description: `Back to ${adaptation.targetSessions + 1} sessions a week?`,
      };
      changes.push({ kind: "proposal", description: `Optional: ${adaptation.targetSessions + 1} sessions next week`, value: adaptation.targetSessions + 1 });
      recommendations.push("You've rebuilt momentum. Want to step back up?");
    } else {
      recommendations.push(outcome === "stretch" ? "Brilliant week. Keep the same plan — recovery matters too." : "Target hit. Same plan next week; progressions keep it challenging.");
    }
  }
  if (topReason === "forgot") recommendations.push("Forgetting got in the way — turn on planned-day reminders or add sessions to your calendar.");
  if (topReason === "boredom") recommendations.push("Boredom came up — use “Something different” on Today, or ask the coach to change the format.");
  if (weekPain.some((p) => p.status !== "resolved")) recommendations.push("Discomfort is still open — workouts keep avoiding that area until you mark it better.");

  return {
    reflection: {
      weekStart: plan.weekStart,
      weekEnd: plan.weekEnd,
      createdAt: nowIso,
      sessionsDone: done.length,
      activeMinutes: minutes,
      targets: t,
      outcome,
      accomplished,
      improved,
      barriers,
      recommendations,
      changes,
    },
    adaptation,
  };
}

const STEP_UP: Record<Variant, Variant> = { minimum: "quick", quick: "full", full: "full" };

function label(v: Variant): string {
  return v === "minimum" ? "5 minutes" : v === "quick" ? "15 minutes" : "30 minutes";
}
