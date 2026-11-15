import { EXERCISES, EXERCISE_BY_ID } from "./library";
import { bansHighImpact, stressLimits, violatesLimits } from "../safety";
import type {
  ActivityPreference,
  BodyArea,
  Equipment,
  EngineSnapshot,
  Exercise,
  Location,
  Pattern,
  Profile,
} from "../types";

export const GYM_EQUIPMENT: Equipment[] = [
  "dumbbells",
  "kettlebell",
  "bands",
  "pullup_bar",
  "bench",
  "step",
  "cardio_machine",
  "cable_machine",
  "barbell",
];

export interface SelectionContext {
  equipment: Set<Equipment>;
  locations: Location[];
  limits: Partial<Record<BodyArea, number>>;
  noHighImpact: boolean;
  dislikes: Set<ActivityPreference>;
  likes: Set<ActivityPreference>;
  avoid: Set<string>;
  preferLoaded: boolean;
}

export function availableEquipment(profile: Pick<Profile, "equipment" | "locations">): Set<Equipment> {
  const set = new Set<Equipment>(profile.equipment);
  if (profile.locations.includes("gym")) GYM_EQUIPMENT.forEach((e) => set.add(e));
  return set;
}

export function buildSelectionContext(snap: EngineSnapshot): SelectionContext {
  const { profile } = snap;
  const limits = stressLimits(profile, snap.pain);
  const avoid = new Set<string>();
  for (const i of snap.insights) {
    if (i.status !== "rejected" && i.key.startsWith("avoid_exercise:")) avoid.add(i.key.slice("avoid_exercise:".length));
  }
  const dislikes = new Set(profile.dislikes);
  return {
    equipment: availableEquipment(profile),
    locations: profile.locations.length ? profile.locations : ["home"],
    limits,
    noHighImpact: bansHighImpact(limits) || dislikes.has("jumping"),
    dislikes,
    likes: new Set(profile.likes),
    avoid,
    preferLoaded:
      profile.experience !== "none" &&
      (profile.goals.includes("strength") || profile.goals.includes("muscle") || profile.locations.includes("gym")),
  };
}

export function hasEquipment(ex: Exercise, equipment: Set<Equipment>): boolean {
  if (ex.equipment.length === 0) return true;
  return ex.equipmentAny ? ex.equipment.some((e) => equipment.has(e)) : ex.equipment.every((e) => equipment.has(e));
}

export type BlockReason = "location" | "equipment" | "pain" | "impact" | "dislike" | "avoided";

export function blockReason(ex: Exercise, ctx: SelectionContext, opts: { ignoreDislikes?: boolean } = {}): BlockReason | null {
  if (!ex.where.some((w) => ctx.locations.includes(w))) return "location";
  if (!hasEquipment(ex, ctx.equipment)) return "equipment";
  if (violatesLimits(ex, ctx.limits)) return "pain";
  if (ex.impact === "high" && ctx.noHighImpact) return "impact";
  if (ctx.avoid.has(ex.id)) return "avoided";
  if (!opts.ignoreDislikes && ex.tags.some((t) => ctx.dislikes.has(t))) return "dislike";
  return null;
}

export function isAllowed(ex: Exercise, ctx: SelectionContext, opts: { ignoreDislikes?: boolean } = {}): boolean {
  return blockReason(ex, ctx, opts) === null;
}

const STRENGTH_CATEGORIES = new Set(["strength", "core"]);

function score(ex: Exercise, startTier: number, ctx: SelectionContext): number {
  let s = Math.abs(ex.tier - startTier) * 10 + (ex.tier > startTier ? 6 : 0) + ex.complexity;
  if (ctx.preferLoaded && ex.logging === "reps_load") s -= 18;
  if (ex.pattern === "pull" && ex.equipment.length > 0) s -= 4; // equipment makes pulling far more effective
  if (ex.tags.some((t) => ctx.likes.has(t))) s -= 2;
  return s;
}

/**
 * Picks the exercise that should fill a movement pattern.
 * Keeps the current choice when it's still allowed; otherwise steps down the
 * easier chain, then alternatives, then the best-scoring allowed exercise.
 */
export function chooseForPattern(
  pattern: Pattern,
  ctx: SelectionContext,
  startTier: number,
  currentId?: string,
): Exercise | null {
  const current = currentId ? EXERCISE_BY_ID[currentId] : undefined;
  if (current && isAllowed(current, ctx)) return current;
  if (current) {
    let e: Exercise | undefined = current;
    const seen = new Set<string>();
    while (e?.easier && !seen.has(e.id)) {
      seen.add(e.id);
      e = EXERCISE_BY_ID[e.easier];
      if (e && isAllowed(e, ctx)) return e;
    }
    for (const altId of current.alternatives) {
      const alt = EXERCISE_BY_ID[altId];
      if (alt && alt.pattern === pattern && alt.tier <= current.tier && isAllowed(alt, ctx)) return alt;
    }
    startTier = Math.min(startTier, current.tier);
  }
  // Never jump more than one tier above the starting level when choosing fresh.
  const maxTier = startTier + 1;
  for (const ignoreDislikes of [false, true]) {
    const candidates = EXERCISES.filter(
      (e) =>
        e.pattern === pattern &&
        STRENGTH_CATEGORIES.has(e.category) &&
        e.tier <= maxTier &&
        isAllowed(e, ctx, { ignoreDislikes }),
    );
    if (candidates.length) {
      return candidates.reduce((best, e) => (score(e, startTier, ctx) < score(best, startTier, ctx) ? e : best));
    }
  }
  return null;
}

/** Next harder exercise in the ladder that's allowed for this user. */
export function harderAllowed(ex: Exercise, ctx: SelectionContext): Exercise | null {
  let e: Exercise | undefined = ex;
  const seen = new Set<string>();
  while (e?.harder && !seen.has(e.id)) {
    seen.add(e.id);
    e = EXERCISE_BY_ID[e.harder];
    if (e && isAllowed(e, ctx)) return e;
  }
  return null;
}

export function easierAllowed(ex: Exercise, ctx: SelectionContext): Exercise | null {
  let e: Exercise | undefined = ex;
  const seen = new Set<string>();
  while (e?.easier && !seen.has(e.id)) {
    seen.add(e.id);
    e = EXERCISE_BY_ID[e.easier];
    if (e && isAllowed(e, ctx)) return e;
  }
  return null;
}

/** Replacement options for an exercise, best first. */
export function replacementsFor(exId: string, ctx: SelectionContext, limit = 5): Exercise[] {
  const ex = EXERCISE_BY_ID[exId];
  if (!ex) return [];
  const out: Exercise[] = [];
  const push = (e: Exercise | undefined) => {
    if (e && e.id !== exId && !out.some((o) => o.id === e.id) && isAllowed(e, ctx, { ignoreDislikes: false })) out.push(e);
  };
  ex.alternatives.forEach((id) => push(EXERCISE_BY_ID[id]));
  const samePattern = EXERCISES.filter((e) => e.pattern === ex.pattern && e.category === ex.category).sort(
    (a, b) => Math.abs(a.tier - ex.tier) - Math.abs(b.tier - ex.tier) || a.complexity - b.complexity,
  );
  samePattern.forEach(push);
  if (ex.easier) push(EXERCISE_BY_ID[ex.easier]);
  return out.slice(0, limit);
}

/** Starting difficulty tier from self-reported activity level and experience. */
export function startingTier(profile: Pick<Profile, "activityLevel" | "experience">): number {
  const activity = { sedentary: 0, light: 1, moderate: 2, active: 3 }[profile.activityLevel];
  const exp = { none: 0, some: 1, regular: 2 }[profile.experience];
  const s = activity + exp;
  if (s <= 1) return 1;
  if (s <= 3) return 2;
  return 3;
}
