"use client";

let ctx: AudioContext | null = null;

/** Short, soft beep for timer transitions. */
export function beep(kind: "tick" | "go" | "done" = "go") {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = kind === "tick" ? 660 : kind === "go" ? 880 : 1046;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === "done" ? 0.45 : 0.18));
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.5);
  } catch {
    // audio is optional
  }
}

export function buzz(pattern: number | number[] = 60) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // vibration is optional
  }
}

/** Keeps the screen awake during a workout where supported. */
export function useWakeLockEffect(active: boolean) {
  return { active };
}
