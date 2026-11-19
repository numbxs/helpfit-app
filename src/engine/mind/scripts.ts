import type { BreathPacer, MindPractice } from "./types";

export interface Cue {
  at: number; // seconds from start
  text: string;
}

/**
 * Lays out a guided practice's cues over the chosen duration: intro cues at the
 * start, outro cues at the end, sections spread over the middle in proportion to
 * their weight, and gentle reminders filling long quiet stretches.
 */
export function buildCues(practice: MindPractice, minutes: number): Cue[] {
  const script = practice.script;
  if (!script) return [];
  const total = Math.max(30, Math.round(minutes * 60));
  const step = total <= 120 ? 10 : 14;
  const cues: Cue[] = [];
  script.intro.forEach((text, i) => cues.push({ at: i * step, text }));
  const introEnd = script.intro.length * step;
  const outroStart = Math.max(introEnd + 10, total - script.outro.length * step - 6);
  script.outro.forEach((text, i) => cues.push({ at: outroStart + i * step, text }));

  const middle = Math.max(0, outroStart - introEnd);
  const weightSum = script.sections.reduce((a, s) => a + s.weight, 0) || 1;
  let cursor = introEnd;
  for (const section of script.sections) {
    const span = (middle * section.weight) / weightSum;
    const start = cursor;
    const end = cursor + span;
    const gap = section.cues.length ? span / Math.max(section.cues.length, 1) : span;
    section.cues.forEach((text, i) => cues.push({ at: Math.round(start + Math.min(i * Math.min(gap, step * 1.5), span - 1)), text }));
    if (section.reminders?.length && section.reminderEvery) {
      const firstReminder = start + Math.max(section.cues.length * step, 20) + section.reminderEvery / 2;
      let k = 0;
      for (let t = firstReminder; t < end - 15; t += section.reminderEvery) {
        cues.push({ at: Math.round(t), text: section.reminders[k % section.reminders.length] });
        k++;
      }
    }
    cursor = end;
  }
  return dedupeClose(cues.filter((c) => c.at >= 0 && c.at < total).sort((a, b) => a.at - b.at), 8);
}

function dedupeClose(cues: Cue[], minGap: number): Cue[] {
  const out: Cue[] = [];
  for (const c of cues) {
    const prev = out.at(-1);
    if (prev && c.at - prev.at < minGap) {
      // Push this cue later rather than overlapping speech.
      out.push({ at: prev.at + minGap, text: c.text });
    } else out.push(c);
  }
  return out;
}

export type PacerPhase = "inhale" | "topUp" | "hold" | "exhale" | "hold2";

export interface PacerState {
  phase: PacerPhase;
  /** 0..1 progress through the phase. */
  progress: number;
  /** Circle scale 0..1 (0 = empty lungs, 1 = full). */
  scale: number;
  secondsLeft: number;
  cycle: number;
}

export function pacerCycleSeconds(p: BreathPacer): number {
  return p.inhale + (p.topUp ?? 0) + (p.hold ?? 0) + p.exhale + (p.hold2 ?? 0);
}

/** Where in the breathing cycle we are, `t` seconds after start. */
export function pacerAt(p: BreathPacer, t: number): PacerState {
  const cycleLen = pacerCycleSeconds(p);
  const cycle = Math.floor(Math.max(0, t) / cycleLen);
  let x = Math.max(0, t) % cycleLen;
  const phases: [PacerPhase, number][] = [
    ["inhale", p.inhale],
    ["topUp", p.topUp ?? 0],
    ["hold", p.hold ?? 0],
    ["exhale", p.exhale],
    ["hold2", p.hold2 ?? 0],
  ];
  const inhaleTo = p.topUp ? 0.85 : 1;
  for (const [phase, len] of phases) {
    if (len <= 0) continue;
    if (x < len) {
      const progress = x / len;
      const ease = 0.5 - Math.cos(progress * Math.PI) / 2;
      const scale =
        phase === "inhale" ? ease * inhaleTo : phase === "topUp" ? inhaleTo + ease * (1 - inhaleTo) : phase === "hold" ? 1 : phase === "exhale" ? 1 - ease : 0;
      return { phase, progress, scale, secondsLeft: Math.ceil(len - x), cycle };
    }
    x -= len;
  }
  return { phase: "inhale", progress: 0, scale: 0, secondsLeft: p.inhale, cycle: cycle + 1 };
}

export const PACER_LABEL: Record<PacerPhase, string> = {
  inhale: "Breathe in",
  topUp: "A little more",
  hold: "Hold",
  exhale: "Breathe out",
  hold2: "Hold",
};
