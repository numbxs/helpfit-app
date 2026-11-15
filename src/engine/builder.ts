import { addDays, hash } from "./dates";
import { EXERCISES, EXERCISE_BY_ID } from "./exercises/library";
import {
  buildSelectionContext,
  chooseForPattern,
  easierAllowed,
  harderAllowed,
  isAllowed,
  startingTier,
  type SelectionContext,
} from "./exercises/select";
import { adjustTarget, baseTarget, workSecondsPerSet } from "./prescription";
import { AREA_LABEL } from "./safety";
import type {
  BlockRole,
  EngineSnapshot,
  Exercise,
  Focus,
  Format,
  Pattern,
  Variant,
  Workout,
  WorkoutBlock,
  WorkoutItem,
  WorkoutStep,
} from "./types";

export const CARDIO_STATE_ID = "__cardio";

export interface BuildOptions {
  focus: Focus;
  variant: Variant;
  intensity: number;
  date: string;
  shuffle?: number;
  /** exerciseId -> replacement exerciseId, chosen by the user for today. */
  swaps?: Record<string, string>;
  /** Days since the last session (restart sessions get easier after long gaps). */
  gapDays?: number;
}

/** Duration windows (seconds) each variant must land in. */
export const VARIANT_WINDOWS: Record<Variant, [number, number]> = {
  minimum: [4 * 60, 7 * 60],
  quick: [10 * 60, 16 * 60],
  full: [20 * 60, 32 * 60],
};

export const VARIANT_LABEL: Record<Variant, string> = { minimum: "5 min", quick: "15 min", full: "30 min" };
export const VARIANT_MINUTES: Record<Variant, number> = { minimum: 5, quick: 15, full: 30 };

interface DraftItem {
  ex: Exercise;
  item: WorkoutItem;
  optional?: number; // higher = dropped first when over time
}

interface DraftBlock {
  role: BlockRole;
  title: string;
  format: Format;
  rounds: number;
  items: DraftItem[];
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function cardioLevel(snap: EngineSnapshot): number {
  return snap.exerciseStates[CARDIO_STATE_ID]?.reps ?? startingTier(snap.profile);
}

/** Alternates full-body A/B templates by how many strength sessions have been done. */
export function strengthRotation(snap: EngineSnapshot, date: string): "A" | "B" {
  const n = snap.sessions.filter(
    (s) => s.source === "guided" && s.focus === "strength" && s.date < date && s.status !== "abandoned" && s.status !== "in_progress",
  ).length;
  return n % 2 === 0 ? "A" : "B";
}

export function estimateSeconds(blocks: Pick<WorkoutBlock, "format" | "rounds" | "items">[]): number {
  let total = 0;
  for (const b of blocks) {
    if (b.format === "straight") {
      for (const it of b.items) {
        const ex = EXERCISE_BY_ID[it.exerciseId];
        const work = workSecondsPerSet(ex, it);
        total += it.sets * work + (it.sets - 1) * it.restSeconds + 15;
      }
    } else {
      let round = 0;
      for (const it of b.items) {
        const ex = EXERCISE_BY_ID[it.exerciseId];
        round += workSecondsPerSet(ex, it) + it.restSeconds;
      }
      total += b.rounds * round;
    }
  }
  return Math.round(total);
}

export function flattenWorkout(w: Pick<Workout, "blocks">): WorkoutStep[] {
  const steps: WorkoutStep[] = [];
  w.blocks.forEach((b, blockIndex) => {
    const push = (itemIndex: number, set: number, totalSets: number, rest: number) => {
      const it = b.items[itemIndex];
      steps.push({
        index: steps.length,
        blockIndex,
        itemIndex,
        exerciseId: it.exerciseId,
        role: b.role,
        set,
        totalSets,
        reps: it.reps,
        seconds: it.seconds,
        loadKg: it.loadKg,
        intervals: it.intervals,
        restAfterSeconds: rest,
        note: it.note,
      });
    };
    if (b.format === "straight") {
      b.items.forEach((it, i) => {
        for (let s = 1; s <= it.sets; s++) push(i, s, it.sets, s < it.sets ? it.restSeconds : 10);
      });
    } else {
      for (let r = 1; r <= b.rounds; r++) {
        b.items.forEach((it, i) => push(i, r, b.rounds, it.restSeconds));
      }
    }
  });
  if (steps.length) steps[steps.length - 1].restAfterSeconds = 0;
  return steps;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildWorkout(snap: EngineSnapshot, opts: BuildOptions): Workout {
  const ctx = buildSelectionContext(snap);
  const shuffle = opts.shuffle ?? 0;
  const seed = `${opts.date}|${opts.focus}|${shuffle}`;
  const notes: string[] = [];
  let blocks: DraftBlock[];
  let title: string;
  let objective: string;

  switch (opts.focus) {
    case "strength": {
      const rot = strengthRotation(snap, opts.date);
      blocks = buildStrength(snap, ctx, opts, rot, seed);
      title = rot === "A" ? "Full-body strength A" : "Full-body strength B";
      objective = "Build strength in the big movement patterns — legs, push, hinge, pull — plus core control.";
      break;
    }
    case "restart": {
      blocks = buildRestart(snap, ctx, opts, seed);
      title = "Restart session";
      objective = "An easy full-body session to get moving again. No catch-up needed.";
      break;
    }
    case "cardio": {
      const res = buildCardio(snap, ctx, opts, seed);
      blocks = res.blocks;
      title = `Cardio · ${res.label}`;
      objective = "Improve heart and lung fitness at an effort you can sustain.";
      break;
    }
    case "mobility": {
      blocks = buildMobility(snap, ctx, opts, seed);
      title = "Mobility & core";
      objective = "Loosen hips, spine and shoulders, and build core control.";
      break;
    }
    case "recovery":
    default: {
      blocks = buildRecovery(snap, ctx, opts, seed);
      title = "Recovery";
      objective = "Gentle movement and breathing to help you recover and feel better.";
      break;
    }
  }

  applySwaps(blocks, ctx, opts.swaps);
  if (opts.focus !== "cardio") fitToWindow(blocks, opts.variant);

  // Notes the user should see before starting.
  const limited = Object.entries(ctx.limits).filter(([, v]) => (v as number) < 2);
  if (limited.length) {
    notes.push(`Working around your ${limited.map(([a]) => AREA_LABEL[a as keyof typeof AREA_LABEL]).join(" and ")} — exercises that load it are left out.`);
  }
  const firstLoaded = blocks.some((b) => b.items.some((d) => d.item.loadKg !== undefined && !snap.exerciseStates[d.ex.id]));
  if (firstLoaded) notes.push("Weights shown are starting suggestions. Pick a weight you could lift 3–4 more times, and log what you used.");

  const out: WorkoutBlock[] = blocks
    .filter((b) => b.items.length > 0)
    .map((b) => ({ role: b.role, title: b.title, format: b.format, rounds: b.rounds, items: b.items.map((d) => d.item) }));

  const swapsKey = opts.swaps ? Object.entries(opts.swaps).sort().map(([a, b]) => `${a}>${b}`).join(",") : "";
  return {
    key: `${opts.date}|${opts.focus}|${opts.variant}|${opts.intensity}|${shuffle}|${swapsKey}`,
    focus: opts.focus,
    variant: opts.variant,
    title,
    objective,
    estimatedMinutes: Math.max(1, Math.round(estimateSeconds(out) / 60)),
    intensity: opts.intensity,
    blocks: out,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

interface Slot {
  patterns: Pattern[];
  role: "main" | "core";
  variants: Variant[];
}

const ALL: Variant[] = ["minimum", "quick", "full"];

const STRENGTH_A: Slot[] = [
  { patterns: ["squat", "lunge"], role: "main", variants: ALL },
  { patterns: ["push", "overhead"], role: "main", variants: ALL },
  { patterns: ["hinge"], role: "main", variants: ALL },
  { patterns: ["pull"], role: "main", variants: ["quick", "full"] },
  { patterns: ["core_front", "core_rotation"], role: "core", variants: ["quick", "full"] },
  { patterns: ["core_side", "carry"], role: "core", variants: ["full"] },
];

const STRENGTH_B: Slot[] = [
  { patterns: ["lunge", "squat"], role: "main", variants: ALL },
  { patterns: ["overhead", "push"], role: "main", variants: ALL },
  { patterns: ["hinge"], role: "main", variants: ALL },
  { patterns: ["pull"], role: "main", variants: ["quick", "full"] },
  { patterns: ["core_side", "core_rotation"], role: "core", variants: ["quick", "full"] },
  { patterns: ["carry", "core_front"], role: "core", variants: ["full"] },
];

function fillSlots(
  snap: EngineSnapshot,
  ctx: SelectionContext,
  slots: Slot[],
  variant: Variant,
  used: Set<string>,
): { ex: Exercise; role: "main" | "core" }[] {
  const tier = startingTier(snap.profile);
  const out: { ex: Exercise; role: "main" | "core" }[] = [];
  for (const slot of slots) {
    if (!slot.variants.includes(variant)) continue;
    let filled = false;
    for (const pattern of slot.patterns) {
      const current = snap.patternChoices[pattern]?.exerciseId;
      const ex = chooseForPattern(pattern, ctx, tier, current);
      if (ex && !used.has(ex.id)) {
        used.add(ex.id);
        out.push({ ex, role: slot.role });
        filled = true;
        break;
      }
    }
    // If safety rules emptied a main slot (e.g. knee pain removes squats and lunges),
    // keep the session balanced with a safe core exercise instead.
    if (!filled && slot.role === "main") {
      for (const pattern of ["core_rotation", "core_front", "core_side"] as Pattern[]) {
        const ex = chooseForPattern(pattern, ctx, tier, snap.patternChoices[pattern]?.exerciseId);
        if (ex && !used.has(ex.id)) {
          used.add(ex.id);
          out.push({ ex, role: "main" });
          break;
        }
      }
    }
  }
  return out;
}

function strengthItem(snap: EngineSnapshot, ex: Exercise, sets: number, rest: number, intensity: number): WorkoutItem {
  const t = adjustTarget(ex, baseTarget(ex, snap.exerciseStates[ex.id], snap.profile), intensity);
  return { exerciseId: ex.id, sets, reps: t.reps, seconds: t.seconds, loadKg: t.loadKg, restSeconds: rest };
}

/** At intensity ±2, swap main exercises one step down/up the ladder for today only. */
function intensityVariant(ex: Exercise, ctx: SelectionContext, intensity: number): Exercise {
  if (intensity <= -2) return easierAllowed(ex, ctx) ?? ex;
  if (intensity >= 2) return harderAllowed(ex, ctx) ?? ex;
  return ex;
}

function buildStrength(snap: EngineSnapshot, ctx: SelectionContext, opts: BuildOptions, rot: "A" | "B", seed: string): DraftBlock[] {
  const { variant, intensity } = opts;
  const used = new Set<string>();
  const picks = fillSlots(snap, ctx, rot === "A" ? STRENGTH_A : STRENGTH_B, variant, used).map((p) => ({
    ...p,
    ex: intensityVariant(p.ex, ctx, intensity),
  }));
  const mains = picks.filter((p) => p.role === "main");
  const cores = picks.filter((p) => p.role === "core");
  const varietyFlip = snap.insights.some((i) => i.key === "needs_variety" && i.status !== "rejected") ? 1 : 0;
  const format: Format = variant === "full" && (opts.shuffle ?? 0) % 2 === varietyFlip ? "straight" : "circuit";
  const strengthGoal = snap.profile.goals.includes("strength") || snap.profile.goals.includes("muscle");
  const softer = intensity < 0 ? 1 : 0;

  const blocks: DraftBlock[] = [warmupBlock(ctx, variant === "minimum" ? 1 : variant === "quick" ? 2 : 3, seed)];

  if (variant === "minimum") {
    blocks.push({
      role: "main",
      title: "Circuit",
      format: "circuit",
      rounds: 2,
      items: mains.map((p) => ({ ex: p.ex, item: strengthItem(snap, p.ex, 2, 15, intensity) })),
    });
    return blocks;
  }

  if (variant === "quick" || format === "circuit") {
    const rounds = variant === "quick" ? 2 : 3 - softer;
    const rest = variant === "quick" ? 20 : 30;
    const circuitItems = [...mains, ...cores.slice(0, 1)];
    blocks.push({
      role: "main",
      title: "Circuit",
      format: "circuit",
      rounds,
      items: circuitItems.map((p, i) => ({
        ex: p.ex,
        item: strengthItem(snap, p.ex, rounds, rest, intensity),
        optional: p.role === "core" ? 2 : i >= 3 ? 1 : undefined,
      })),
    });
    if (variant === "full" && cores.length > 1) {
      blocks.push({
        role: "core",
        title: "Core finisher",
        format: "circuit",
        rounds: 2,
        items: cores.slice(1).map((p) => ({ ex: p.ex, item: strengthItem(snap, p.ex, 2, 20, intensity), optional: 3 })),
      });
    }
  } else {
    const sets = 3 - softer;
    const rest = strengthGoal ? 75 : 60;
    blocks.push({
      role: "main",
      title: "Strength",
      format: "straight",
      rounds: 1,
      items: mains.map((p, i) => ({ ex: p.ex, item: strengthItem(snap, p.ex, sets, rest, intensity), optional: i >= 3 ? 1 : undefined })),
    });
    if (cores.length) {
      blocks.push({
        role: "core",
        title: "Core",
        format: "circuit",
        rounds: 2,
        items: cores.map((p, i) => ({ ex: p.ex, item: strengthItem(snap, p.ex, 2, 20, intensity), optional: i > 0 ? 3 : 2 })),
      });
    }
  }
  blocks.push(cooldownBlock(ctx, variant === "full" ? 2 : 1, seed));
  return blocks;
}

// ---------------------------------------------------------------------------
// Restart
// ---------------------------------------------------------------------------

function buildRestart(snap: EngineSnapshot, ctx: SelectionContext, opts: BuildOptions, seed: string): DraftBlock[] {
  const { variant } = opts;
  const intensity = Math.min(opts.intensity, (opts.gapDays ?? 0) >= 14 ? -2 : -1);
  const used = new Set<string>();
  const slots: Slot[] = [
    { patterns: ["squat", "lunge"], role: "main", variants: ALL },
    { patterns: ["push"], role: "main", variants: ALL },
    { patterns: ["hinge"], role: "main", variants: ALL },
    { patterns: ["core_front", "core_rotation"], role: "core", variants: ["quick", "full"] },
  ];
  const picks = fillSlots(snap, ctx, slots, variant, used).map((p) => ({ ...p, ex: intensityVariant(p.ex, ctx, intensity) }));
  const items: DraftItem[] = picks.map((p) => ({
    ex: p.ex,
    item: strengthItem(snap, p.ex, variant === "full" ? 3 : 2, variant === "minimum" ? 15 : 25, intensity),
  }));
  if (variant !== "minimum") {
    const move = firstAllowed(["step_jack", "march_in_place"], ctx);
    if (move) items.splice(2, 0, { ex: move, item: timedItem(move, 40, variant === "full" ? 3 : 2, 20) });
  }
  const blocks: DraftBlock[] = [warmupBlock(ctx, variant === "minimum" ? 1 : 2, seed)];
  blocks.push({ role: "main", title: "Easy circuit", format: "circuit", rounds: variant === "full" ? 3 : 2, items });
  if (variant !== "minimum") blocks.push(cooldownBlock(ctx, variant === "full" ? 3 : 2, seed));
  return blocks;
}

// ---------------------------------------------------------------------------
// Cardio
// ---------------------------------------------------------------------------

type Modality = "outdoor" | "machine" | "stairs" | "home";

const OUTDOOR_CARDIO = ["brisk_walk", "power_walk_intervals", "hill_walk", "walk_jog_intervals", "easy_jog", "shuttle_runs", "outdoor_cycling"];
const MACHINE_CARDIO = ["treadmill_incline_walk", "stationary_bike", "elliptical", "rower"];
const HOME_MOVES = ["step_jack", "standing_knee_drive", "shadow_boxing", "low_skater", "high_knees", "fast_feet", "jumping_jack", "jump_rope", "burpee"];
const INTERVAL_IDS = new Set(["power_walk_intervals", "walk_jog_intervals", "shuttle_runs"]);

const INTERVALS_BY_LEVEL: [number, number][] = [
  [30, 30],
  [30, 30],
  [40, 30],
  [45, 30],
  [60, 60],
  [90, 60],
  [120, 60],
  [180, 60],
  [240, 60],
  [300, 60],
];
const HOME_INTERVALS_BY_LEVEL: [number, number][] = [
  [20, 40],
  [25, 35],
  [30, 30],
  [30, 25],
  [35, 25],
  [40, 20],
  [40, 20],
  [45, 15],
  [45, 15],
  [45, 15],
];

export function preferredModalities(snap: EngineSnapshot, ctx: SelectionContext): Modality[] {
  const locs = ctx.locations;
  const likesOutdoor = ["walking", "hiking", "running", "football", "cycling"].some((t) => ctx.likes.has(t as never));
  const prefOutdoor = snap.insights.some((i) => i.key === "prefers_outdoor_cardio" && i.status !== "rejected");
  const prefIndoor = snap.insights.some((i) => i.key === "prefers_indoor_cardio" && i.status !== "rejected");
  const order: Modality[] = [];
  const add = (m: Modality) => !order.includes(m) && order.push(m);
  if (locs.includes("outdoors") && (prefOutdoor || (likesOutdoor && !prefIndoor))) add("outdoor");
  if (locs.includes("gym")) add("machine");
  if (locs.includes("outdoors") && !prefIndoor) add("outdoor");
  if (ctx.equipment.has("step") && locs.includes("home")) add("stairs");
  add("home");
  if (locs.includes("outdoors")) add("outdoor");
  return order;
}

function pickSteadyCardio(ids: string[], ctx: SelectionContext, maxTier: number, seed: string): Exercise | null {
  const allowed = ids.map((id) => EXERCISE_BY_ID[id]).filter((e) => e && isAllowed(e, ctx) && e.tier <= maxTier);
  if (!allowed.length) return null;
  const liked = allowed.filter((e) => e.tags.some((t) => ctx.likes.has(t)));
  const pool = liked.length ? liked : allowed;
  const topTier = Math.max(...pool.map((e) => e.tier));
  const top = pool.filter((e) => e.tier >= topTier - 1).sort((a, b) => b.tier - a.tier || a.id.localeCompare(b.id));
  return top[hash(seed) % Math.min(2, top.length)];
}

function buildCardio(
  snap: EngineSnapshot,
  ctx: SelectionContext,
  opts: BuildOptions,
  seed: string,
): { blocks: DraftBlock[]; label: string } {
  const { variant, intensity } = opts;
  const level = Math.max(1, Math.min(10, cardioLevel(snap) + (intensity > 0 ? 1 : intensity < 0 ? -1 : 0)));
  const mainSeconds = { minimum: 4 * 60, quick: 10 * 60, full: 20 * 60 }[variant] * (intensity < 0 ? 0.85 : 1);
  const warmSeconds = { minimum: 60, quick: 120, full: 180 }[variant];
  const modalities = preferredModalities(snap, ctx);
  const modality = modalities[(opts.shuffle ?? 0) % modalities.length];
  const maxTier = Math.min(5, 1 + Math.ceil(level / 2));

  const blocks: DraftBlock[] = [];
  let label = "Intervals";

  const outdoorIds = variant === "minimum" ? ["brisk_walk", "power_walk_intervals", "outdoor_cycling"] : OUTDOOR_CARDIO;
  const steadyIds = modality === "outdoor" ? outdoorIds : modality === "machine" ? MACHINE_CARDIO : modality === "stairs" ? ["stair_climb"] : [];
  const main = steadyIds.length ? pickSteadyCardio(steadyIds, ctx, maxTier, seed) : null;

  if (main) {
    label = main.name;
    const easyWalk = EXERCISE_BY_ID.brisk_walk;
    const warmEx = main.outdoor && main.id !== "outdoor_cycling" && isAllowed(easyWalk, ctx) ? easyWalk : main;
    blocks.push({
      role: "warmup",
      title: "Warm-up",
      format: "straight",
      rounds: 1,
      items: [{ ex: warmEx, item: { exerciseId: warmEx.id, sets: 1, seconds: warmSeconds, restSeconds: 0, note: "Easy pace to warm up" } }],
    });
    const useIntervals = INTERVAL_IDS.has(main.id) || (level >= 4 && main.logging === "cardio" && main.id !== "hill_walk" && main.id !== "brisk_walk" && modality === "machine");
    if (useIntervals) {
      const [work, rest] = INTERVALS_BY_LEVEL[level - 1];
      const rounds = Math.max(2, Math.round(mainSeconds / (work + rest)));
      blocks.push({
        role: "conditioning",
        title: "Intervals",
        format: "straight",
        rounds: 1,
        items: [
          {
            ex: main,
            item: {
              exerciseId: main.id,
              sets: 1,
              intervals: { workSeconds: work, restSeconds: rest, rounds },
              restSeconds: 0,
              note: "Work: breathing hard but in control. Easy: recover fully.",
            },
          },
        ],
      });
    } else {
      blocks.push({
        role: "conditioning",
        title: "Steady effort",
        format: "straight",
        rounds: 1,
        items: [
          {
            ex: main,
            item: {
              exerciseId: main.id,
              sets: 1,
              seconds: Math.round(mainSeconds / 60) * 60,
              restSeconds: 0,
              note: level <= 2 ? "Brisk: you can talk, but not sing." : "Steady: talking takes some effort.",
            },
          },
        ],
      });
    }
  } else {
    // Home interval circuit using simple moves.
    const [work, rest] = HOME_INTERVALS_BY_LEVEL[level - 1];
    const allowedMoves = HOME_MOVES.map((id) => EXERCISE_BY_ID[id]).filter((e) => isAllowed(e, ctx) && e.tier <= maxTier);
    const ordered = rotate(allowedMoves.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id)), hash(seed));
    const count = variant === "minimum" ? 3 : 4;
    const moves = ordered.slice(0, count);
    const roundSeconds = moves.length * (work + rest);
    const rounds = Math.max(1, Math.round(mainSeconds / Math.max(roundSeconds, 1)));
    const warm = firstAllowed(["march_in_place", "step_jack"], ctx);
    if (warm) {
      blocks.push({
        role: "warmup",
        title: "Warm-up",
        format: "straight",
        rounds: 1,
        items: [{ ex: warm, item: { exerciseId: warm.id, sets: 1, seconds: warmSeconds, restSeconds: 10, note: "Easy pace" } }],
      });
    }
    blocks.push({
      role: "conditioning",
      title: "Intervals",
      format: "intervals",
      rounds,
      items: moves.map((m) => ({ ex: m, item: { exerciseId: m.id, sets: rounds, seconds: work, restSeconds: rest } })),
    });
    label = "Home intervals";
  }

  if (variant !== "minimum") {
    const cool = cooldownBlock(ctx, variant === "full" ? 2 : 1, seed, ["calf_stretch", "hip_flexor_stretch", "hamstring_stretch", "figure_four"]);
    blocks.push(cool);
  }
  return { blocks, label };
}

// ---------------------------------------------------------------------------
// Mobility & recovery
// ---------------------------------------------------------------------------

const MOBILITY_ORDER: Pattern[] = ["mobility_hip", "mobility_spine", "mobility_shoulder", "mobility_hamstring", "mobility_ankle", "mobility_full"];

function mobilityDrills(ctx: SelectionContext, count: number, seed: string, gentle = false): Exercise[] {
  const pool = EXERCISES.filter(
    (e) => (e.category === "mobility" || e.category === "recovery") && e.pattern !== "breathing" && (!gentle || e.tier === 1) && isAllowed(e, ctx),
  );
  const byPattern = MOBILITY_ORDER.map((p) => rotate(pool.filter((e) => e.pattern === p).sort((a, b) => a.id.localeCompare(b.id)), hash(seed + p)));
  const out: Exercise[] = [];
  for (let round = 0; out.length < count && round < 6; round++) {
    for (const list of byPattern) {
      if (out.length >= count) break;
      const e = list[round];
      if (e && !out.includes(e)) out.push(e);
    }
  }
  return out;
}

function buildMobility(snap: EngineSnapshot, ctx: SelectionContext, opts: BuildOptions, seed: string): DraftBlock[] {
  const { variant, intensity } = opts;
  const drillCount = { minimum: 5, quick: 6, full: 9 }[variant];
  const drillSeconds = variant === "minimum" ? 50 : 45;
  const drills = mobilityDrills(ctx, drillCount, seed);
  const blocks: DraftBlock[] = [
    {
      role: "main",
      title: "Mobility flow",
      format: "circuit",
      rounds: 1,
      items: drills.map((d, i) => ({ ex: d, item: drillItem(d, drillSeconds), optional: i >= drillCount - 2 ? 4 : undefined })),
    },
  ];
  if (variant !== "minimum") {
    const used = new Set<string>();
    const coreSlots: Slot[] = [
      { patterns: ["core_front"], role: "core", variants: ALL },
      { patterns: ["core_side", "core_rotation"], role: "core", variants: ALL },
      { patterns: ["core_rotation", "carry"], role: "core", variants: ["full"] },
    ];
    const cores = fillSlots(snap, ctx, coreSlots, variant, used);
    const rounds = variant === "full" ? 3 : 2;
    blocks.push({
      role: "core",
      title: "Core",
      format: "circuit",
      rounds,
      items: cores.map((p, i) => ({ ex: p.ex, item: strengthItem(snap, p.ex, rounds, 20, intensity), optional: i >= 2 ? 3 : undefined })),
    });
    const breath = EXERCISE_BY_ID.box_breathing;
    blocks.push({
      role: "cooldown",
      title: "Breathe",
      format: "straight",
      rounds: 1,
      items: [{ ex: breath, item: { exerciseId: breath.id, sets: 1, seconds: variant === "full" ? 90 : 60, restSeconds: 0 } }],
    });
  }
  return blocks;
}

function buildRecovery(snap: EngineSnapshot, ctx: SelectionContext, opts: BuildOptions, seed: string): DraftBlock[] {
  const { variant } = opts;
  const blocks: DraftBlock[] = [];
  const breath = EXERCISE_BY_ID.box_breathing;
  if (variant !== "minimum") {
    const walk = ctx.locations.includes("outdoors")
      ? EXERCISE_BY_ID.brisk_walk
      : ctx.locations.includes("gym") && isAllowed(EXERCISE_BY_ID.stationary_bike, ctx)
        ? EXERCISE_BY_ID.stationary_bike
        : EXERCISE_BY_ID.march_in_place;
    if (isAllowed(walk, ctx)) {
      blocks.push({
        role: "conditioning",
        title: "Easy movement",
        format: "straight",
        rounds: 1,
        items: [
          {
            ex: walk,
            item: { exerciseId: walk.id, sets: 1, seconds: variant === "full" ? 13 * 60 : 6 * 60, restSeconds: 10, note: "Easy, relaxed pace — this should feel restorative." },
          },
        ],
      });
    }
  }
  const drills = mobilityDrills(ctx, { minimum: 3, quick: 4, full: 6 }[variant], seed + "recovery", true);
  blocks.push({
    role: "main",
    title: "Gentle mobility",
    format: "circuit",
    rounds: 1,
    items: drills.map((d) => ({ ex: d, item: drillItem(d, variant === "minimum" ? 60 : 50) })),
  });
  blocks.push({
    role: "cooldown",
    title: "Breathe",
    format: "straight",
    rounds: 1,
    items: [{ ex: breath, item: { exerciseId: breath.id, sets: 1, seconds: variant === "full" ? 120 : 60, restSeconds: 0 } }],
  });
  return blocks;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const WARMUP_POOL = ["march_in_place", "arm_circles", "leg_swings", "hip_circles", "worlds_greatest_stretch", "inchworm", "standing_cat_cow"];
const COOLDOWN_POOL = ["hip_flexor_stretch", "figure_four", "childs_pose", "hamstring_stretch", "doorway_chest_stretch", "open_book", "calf_stretch"];

function warmupBlock(ctx: SelectionContext, count: number, seed: string): DraftBlock {
  const allowed = WARMUP_POOL.map((id) => EXERCISE_BY_ID[id]).filter((e) => isAllowed(e, ctx));
  const first = allowed.find((e) => e.id === "march_in_place");
  const rest = rotate(allowed.filter((e) => e !== first), hash(seed + "warm"));
  const chosen = (first ? [first, ...rest] : rest).slice(0, count);
  const seconds = count === 1 ? 30 : 40;
  return {
    role: "warmup",
    title: "Warm-up",
    format: "straight",
    rounds: 1,
    items: chosen.map((e, i) => ({ ex: e, item: drillItem(e, e.perSide ? 20 : seconds, 5), optional: i > 0 ? 5 : undefined })),
  };
}

function cooldownBlock(ctx: SelectionContext, count: number, seed: string, pool = COOLDOWN_POOL): DraftBlock {
  const allowed = rotate(pool.map((id) => EXERCISE_BY_ID[id]).filter((e) => isAllowed(e, ctx)), hash(seed + "cool"));
  return {
    role: "cooldown",
    title: "Cool-down",
    format: "straight",
    rounds: 1,
    items: allowed.slice(0, count).map((e) => ({ ex: e, item: drillItem(e, e.perSide ? 25 : 40, 5), optional: 6 })),
  };
}

function drillItem(e: Exercise, seconds: number, rest = 5): WorkoutItem {
  if (e.logging === "reps" || e.logging === "reps_load") {
    const [min] = e.defaults.repRange ?? [6, 10];
    return { exerciseId: e.id, sets: 1, reps: min, restSeconds: rest };
  }
  return { exerciseId: e.id, sets: 1, seconds, restSeconds: rest };
}

function timedItem(e: Exercise, seconds: number, sets: number, rest: number): WorkoutItem {
  return { exerciseId: e.id, sets, seconds, restSeconds: rest };
}

function firstAllowed(ids: string[], ctx: SelectionContext): Exercise | null {
  for (const id of ids) {
    const e = EXERCISE_BY_ID[id];
    if (e && isAllowed(e, ctx)) return e;
  }
  return null;
}

function rotate<T>(arr: T[], n: number): T[] {
  if (!arr.length) return arr;
  const k = n % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

function applySwaps(blocks: DraftBlock[], ctx: SelectionContext, swaps?: Record<string, string>) {
  if (!swaps) return;
  for (const b of blocks) {
    for (const d of b.items) {
      const to = swaps[d.ex.id];
      const ex = to ? EXERCISE_BY_ID[to] : undefined;
      if (!ex || !isAllowed(ex, ctx, { ignoreDislikes: true })) continue;
      d.ex = ex;
      const keepSets = d.item.sets;
      const rest = d.item.restSeconds;
      if (ex.logging === "reps" || ex.logging === "reps_load") {
        const [min, max] = ex.defaults.repRange ?? [8, 12];
        d.item = { exerciseId: ex.id, sets: keepSets, reps: Math.round((min + max) / 2 - (max - min) / 4), loadKg: ex.defaults.loadKg, restSeconds: rest };
      } else {
        d.item = { exerciseId: ex.id, sets: keepSets, seconds: d.item.seconds ?? ex.defaults.seconds ?? 30, restSeconds: rest };
      }
    }
  }
}

/** Nudges sets/rounds and optional items so the session lands in the variant's time window. */
function fitToWindow(blocks: DraftBlock[], variant: Variant) {
  const [min, max] = VARIANT_WINDOWS[variant];
  const est = () => estimateSeconds(blocks.map((b) => ({ format: b.format, rounds: b.rounds, items: b.items.map((d) => d.item) })));
  const main = blocks.find((b) => b.role === "main") ?? blocks.find((b) => b.role === "conditioning");
  for (let i = 0; i < 24; i++) {
    const t = est();
    if (t > max) {
      if (main && main.format !== "straight" && main.rounds > 2) {
        main.rounds -= 1;
        main.items.forEach((d) => (d.item.sets = main.rounds));
        continue;
      }
      if (main && main.format === "straight" && main.items.some((d) => d.item.sets > 2)) {
        main.items.forEach((d) => (d.item.sets = Math.max(2, d.item.sets - 1)));
        continue;
      }
      // drop the most optional item anywhere
      let worst: { b: DraftBlock; idx: number; opt: number } | null = null;
      for (const b of blocks) {
        b.items.forEach((d, idx) => {
          if (d.optional !== undefined && (!worst || d.optional > worst.opt)) worst = { b, idx, opt: d.optional };
        });
      }
      if (worst) {
        const w = worst as { b: DraftBlock; idx: number };
        w.b.items.splice(w.idx, 1);
        continue;
      }
      if (main && main.format !== "straight" && main.rounds > 1) {
        main.rounds -= 1;
        main.items.forEach((d) => (d.item.sets = main.rounds));
        continue;
      }
      break;
    } else if (t < min) {
      if (main && main.format !== "straight" && main.rounds > 1 && main.rounds < 4) {
        main.rounds += 1;
        main.items.forEach((d) => (d.item.sets = main.rounds));
        continue;
      }
      if (main && main.format === "straight" && main.items.every((d) => d.item.sets > 1 && d.item.sets < 4)) {
        main.items.forEach((d) => (d.item.sets += 1));
        continue;
      }
      let grew = false;
      main?.items.forEach((d) => {
        if (d.item.seconds !== undefined && !d.item.intervals && d.item.seconds < 120) {
          d.item.seconds += 10;
          grew = true;
        } else if (d.item.reps !== undefined && d.item.restSeconds < 90) {
          d.item.restSeconds += 10;
          grew = true;
        }
      });
      if (grew) continue;
      break;
    } else break;
  }
}

/** Day after `date` helper used by tests and callers. */
export const nextDay = (date: string) => addDays(date, 1);
