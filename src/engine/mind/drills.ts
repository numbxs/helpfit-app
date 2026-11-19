import { hash } from "../dates";
import type { BreathCountMetrics, FlankerMetrics, NBackBlock, NBackMetrics, SartMetrics } from "./types";

/** Small deterministic PRNG (mulberry32) so drills are reproducible and testable. */
export function rng(seed: string): () => number {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs: number[]) => {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

// ---------------------------------------------------------------------------
// SART — sustained attention to response task ("Steady tap")
// ---------------------------------------------------------------------------

export const SART_NO_GO = 3;
export const SART_DIGIT_MS = 250;
export const SART_MASK_MS = 900;
export const SART_TRIAL_MS = SART_DIGIT_MS + SART_MASK_MS;

/** Digits 1–9 in balanced random order; the no-go digit is ~1 in 9 trials. */
export function sartSequence(seed: string, minutes: number): number[] {
  const trials = Math.max(18, Math.round((minutes * 60_000) / SART_TRIAL_MS / 9) * 9);
  const rand = rng(seed);
  const out: number[] = [];
  while (out.length < trials) out.push(...shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand));
  return out.slice(0, trials);
}

export interface SartResponse {
  digit: number;
  rtMs: number | null; // null = no tap
}

export function scoreSart(responses: SartResponse[]): SartMetrics {
  const noGo = responses.filter((r) => r.digit === SART_NO_GO);
  const go = responses.filter((r) => r.digit !== SART_NO_GO);
  const goRts = go.filter((r) => r.rtMs !== null).map((r) => r.rtMs as number);
  const m = mean(goRts);
  const s = sd(goRts);
  return {
    trials: responses.length,
    noGoTrials: noGo.length,
    commissionErrors: noGo.filter((r) => r.rtMs !== null).length,
    omissionErrors: go.filter((r) => r.rtMs === null).length,
    meanRtMs: m === null ? null : Math.round(m),
    rtCv: m && s !== null ? Math.round((s / m) * 1000) / 1000 : null,
  };
}

/** Share of no-go digits correctly withheld (0–1). The headline sustained-attention number. */
export function sartNoGoAccuracy(m: SartMetrics): number | null {
  return m.noGoTrials ? (m.noGoTrials - m.commissionErrors) / m.noGoTrials : null;
}

// ---------------------------------------------------------------------------
// Flanker ("Arrow focus")
// ---------------------------------------------------------------------------

export interface FlankerTrial {
  direction: "left" | "right";
  congruent: boolean;
}

export function flankerSequence(seed: string, minutes: number): FlankerTrial[] {
  const n = Math.max(16, Math.round((minutes * 60) / 2.5 / 4) * 4);
  const rand = rng(seed);
  const base: FlankerTrial[] = [];
  for (let i = 0; i < n / 4; i++) {
    base.push({ direction: "left", congruent: true }, { direction: "left", congruent: false }, { direction: "right", congruent: true }, { direction: "right", congruent: false });
  }
  return shuffle(base, rand);
}

export function flankerArrows(t: FlankerTrial): string {
  const c = t.direction === "left" ? "←" : "→";
  const f = t.congruent ? c : t.direction === "left" ? "→" : "←";
  return `${f}${f}${c}${f}${f}`;
}

export interface FlankerResponse {
  trial: FlankerTrial;
  answer: "left" | "right" | null;
  rtMs: number;
}

export function scoreFlanker(responses: FlankerResponse[]): FlankerMetrics {
  const correct = responses.filter((r) => r.answer === r.trial.direction);
  const rtFor = (congruent: boolean) => mean(correct.filter((r) => r.trial.congruent === congruent).map((r) => r.rtMs));
  const c = rtFor(true);
  const i = rtFor(false);
  return {
    trials: responses.length,
    accuracy: responses.length ? Math.round((correct.length / responses.length) * 1000) / 1000 : 0,
    congruentRtMs: c === null ? null : Math.round(c),
    incongruentRtMs: i === null ? null : Math.round(i),
    interferenceMs: c !== null && i !== null ? Math.round(i - c) : null,
  };
}

// ---------------------------------------------------------------------------
// N-back ("Memory track")
// ---------------------------------------------------------------------------

export const NBACK_LETTERS = ["C", "H", "K", "L", "Q", "R", "S", "T"];
export const NBACK_STIMULUS_MS = 500;
export const NBACK_TRIAL_MS = 2500;

/** One block: 20 + n letters with ~30% targets, no accidental extra targets. */
export function nbackBlock(seed: string, level: number, length = 20): { letters: string[]; targets: boolean[] } {
  const rand = rng(`${seed}|${level}`);
  const total = length + level;
  const letters: string[] = [];
  const targets: boolean[] = [];
  const targetCount = Math.round(length * 0.3);
  const targetIdx = new Set(shuffle(Array.from({ length }, (_, i) => i + level), rand).slice(0, targetCount));
  for (let i = 0; i < total; i++) {
    if (targetIdx.has(i)) {
      letters.push(letters[i - level]);
      targets.push(true);
    } else {
      let l: string;
      do l = NBACK_LETTERS[Math.floor(rand() * NBACK_LETTERS.length)];
      while (i >= level && l === letters[i - level]);
      letters.push(l);
      targets.push(false);
    }
  }
  return { letters, targets };
}

export function scoreNBackBlock(level: number, targets: boolean[], responses: boolean[]): NBackBlock {
  let hits = 0;
  let falseAlarms = 0;
  let t = 0;
  for (let i = level; i < targets.length; i++) {
    if (targets[i]) {
      t++;
      if (responses[i]) hits++;
    } else if (responses[i]) falseAlarms++;
  }
  return { level, targets: t, hits, falseAlarms, trials: targets.length - level };
}

/** Standard adaptive rule: up a level for strong blocks, down for weak ones. */
export function nextNBackLevel(b: NBackBlock): number {
  const hitRate = b.targets ? b.hits / b.targets : 0;
  const nonTargets = b.trials - b.targets;
  const faRate = nonTargets ? b.falseAlarms / nonTargets : 0;
  if (hitRate >= 0.8 && faRate <= 0.15) return b.level + 1;
  if (hitRate < 0.5 || faRate > 0.35) return Math.max(1, b.level - 1);
  return b.level;
}

export function summariseNBack(blocks: NBackBlock[], startLevel: number): NBackMetrics {
  const correct = blocks.reduce((a, b) => a + b.hits + (b.trials - b.targets - b.falseAlarms), 0);
  const total = blocks.reduce((a, b) => a + b.trials, 0);
  const last = blocks.at(-1);
  return {
    blocks,
    startLevel,
    endLevel: last ? nextNBackLevel(last) : startLevel,
    accuracy: total ? Math.round((correct / total) * 1000) / 1000 : 0,
  };
}

// ---------------------------------------------------------------------------
// Schulte table ("Number grid")
// ---------------------------------------------------------------------------

export function schulteGrid(seed: string, size: number): number[] {
  return shuffle(
    Array.from({ length: size * size }, (_, i) => i + 1),
    rng(seed),
  );
}

// ---------------------------------------------------------------------------
// Breath counting
// ---------------------------------------------------------------------------

export type BreathTap = "count" | "ten" | "lost";

/** Replays taps: 9 COUNTs then TEN is a correct round; anything else is an error. */
export function scoreBreathCount(taps: BreathTap[]): BreathCountMetrics & { current: number } {
  let current = 0;
  let correctRounds = 0;
  let errors = 0;
  let lostCount = 0;
  for (const t of taps) {
    if (t === "count") {
      current += 1;
      if (current > 9) {
        errors += 1;
        current = 0;
      }
    } else if (t === "ten") {
      if (current === 9) correctRounds += 1;
      else errors += 1;
      current = 0;
    } else {
      lostCount += 1;
      current = 0;
    }
  }
  return { correctRounds, errors, lostCount, current };
}

export function breathCountAccuracy(m: BreathCountMetrics): number | null {
  const attempts = m.correctRounds + m.errors + m.lostCount;
  return attempts ? m.correctRounds / attempts : null;
}
