import type { MindChange, MindProfile, MindSessionLog, MindState } from "./types";

export const FOCUS_MIN = 5;
export const FOCUS_MAX = 90;
export const BREATH_COUNT_STEPS = [3, 5, 8, 10, 15];

export function initialMindState(profile: Pick<MindProfile, "focusBaselineMinutes" | "dailyMinutes" | "goals">, now: Date): MindState {
  // Start AT the self-reported span (rounded down) — consistency first, then grow.
  const focus = Math.min(60, Math.max(10, Math.floor(profile.focusBaselineMinutes / 5) * 5));
  return {
    id: "mind-state",
    focusTargetMinutes: focus,
    focusSuccessStreak: 0,
    focusStruggleStreak: 0,
    nbackLevel: 2,
    breathCountMinutes: profile.dailyMinutes <= 3 ? 3 : 5,
    schulteSize: 5,
    updatedAt: now.toISOString(),
  };
}

/**
 * Updates adaptive targets after a session. One variable per practice:
 * - Focus block: +5 min after two clean blocks (completed, ≤2 distractions);
 *   −5 min after two struggles (stopped before 70% or ≥5 distractions).
 * - Breath counting: next duration step at ≥80% accuracy; step back below 40%.
 * - N-back: level carries over from the adaptive in-session result.
 * - Number grid: bigger grid when fast and clean, smaller when very slow.
 */
export function applyMindSession(state: MindState, s: MindSessionLog, now: Date): { state: MindState; changes: MindChange[] } {
  const next: MindState = { ...state, updatedAt: now.toISOString() };
  const changes: MindChange[] = [];

  if (s.kind === "focus_block" && s.focus) {
    const f = s.focus;
    const clean = f.completed && f.distractions <= 2;
    const struggled = (!f.completed && f.focusedMinutes < f.targetMinutes * 0.7) || f.distractions >= 5;
    if (clean && f.targetMinutes >= state.focusTargetMinutes) {
      next.focusSuccessStreak += 1;
      next.focusStruggleStreak = 0;
      if (next.focusSuccessStreak >= 2 && next.focusTargetMinutes < FOCUS_MAX) {
        next.focusTargetMinutes = Math.min(FOCUS_MAX, state.focusTargetMinutes + 5);
        next.focusSuccessStreak = 0;
        changes.push({ label: "Focus span", from: `${state.focusTargetMinutes} min`, to: `${next.focusTargetMinutes} min`, reason: "Two clean focus blocks in a row — the next one is 5 minutes longer." });
      }
    } else if (struggled && f.targetMinutes <= state.focusTargetMinutes) {
      next.focusStruggleStreak += 1;
      next.focusSuccessStreak = 0;
      if (next.focusStruggleStreak >= 2 && next.focusTargetMinutes > FOCUS_MIN) {
        next.focusTargetMinutes = Math.max(FOCUS_MIN, state.focusTargetMinutes - 5);
        next.focusStruggleStreak = 0;
        changes.push({ label: "Focus span", from: `${state.focusTargetMinutes} min`, to: `${next.focusTargetMinutes} min`, reason: "The last blocks were hard to sustain — shorter blocks build the habit faster." });
      }
    } else if (!clean) {
      next.focusSuccessStreak = 0;
    }
  }

  if (s.kind === "breath_count" && s.breathCount && s.completed) {
    const m = s.breathCount;
    const attempts = m.correctRounds + m.errors + m.lostCount;
    const acc = attempts ? m.correctRounds / attempts : 0;
    const idx = BREATH_COUNT_STEPS.indexOf(state.breathCountMinutes);
    const i = idx < 0 ? 1 : idx;
    if (acc >= 0.8 && attempts >= 2 && s.plannedMinutes >= state.breathCountMinutes && i < BREATH_COUNT_STEPS.length - 1) {
      next.breathCountMinutes = BREATH_COUNT_STEPS[i + 1];
      changes.push({ label: "Breath counting", from: `${state.breathCountMinutes} min`, to: `${next.breathCountMinutes} min`, reason: `${Math.round(acc * 100)}% of rounds counted correctly — time to hold attention a little longer.` });
    } else if (acc < 0.4 && attempts >= 2 && i > 0) {
      next.breathCountMinutes = BREATH_COUNT_STEPS[i - 1];
      changes.push({ label: "Breath counting", from: `${state.breathCountMinutes} min`, to: `${next.breathCountMinutes} min`, reason: "Shorter sessions while the counting skill builds." });
    }
  }

  if (s.kind === "nback" && s.nback && s.nback.endLevel !== state.nbackLevel) {
    next.nbackLevel = s.nback.endLevel;
    changes.push({
      label: "Memory track",
      from: `${state.nbackLevel}-back`,
      to: `${next.nbackLevel}-back`,
      reason: next.nbackLevel > state.nbackLevel ? "Strong accuracy — the level goes up." : "That level was a stretch — easing back one step.",
    });
  }

  if (s.kind === "schulte" && s.schulte && s.completed) {
    const { size, timeMs, mistakes } = s.schulte;
    const perCell = timeMs / (size * size);
    if (size === state.schulteSize && perCell < 1000 && mistakes <= 1 && size < 6) {
      next.schulteSize = (size + 1) as 5 | 6;
      changes.push({ label: "Number grid", from: `${size}×${size}`, to: `${next.schulteSize}×${next.schulteSize}`, reason: "Fast and clean — a bigger grid next time." });
    } else if (size === state.schulteSize && perCell > 3500 && size > 4) {
      next.schulteSize = (size - 1) as 4 | 5;
      changes.push({ label: "Number grid", from: `${size}×${size}`, to: `${next.schulteSize}×${next.schulteSize}`, reason: "A smaller grid while you build speed." });
    }
  }

  return { state: next, changes };
}
