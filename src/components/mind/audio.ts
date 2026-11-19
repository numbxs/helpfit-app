"use client";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/** A soft singing-bowl-like chime (three partials with a long decay). */
export function chime(strength: "soft" | "full" = "full") {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const peak = strength === "soft" ? 0.06 : 0.14;
  for (const [freq, mul] of [
    [528, 1],
    [792, 0.45],
    [1056, 0.2],
  ] as const) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * mul, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (strength === "soft" ? 1.6 : 3.2));
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 3.4);
  }
}

export function click() {
  const c = audio();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.value = 880;
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.08, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.1);
}

/** Calm voice guidance via the browser's built-in speech synthesis (works offline on most devices). */
export function speak(text: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.88;
    u.pitch = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find((v) => v.lang.startsWith("en") && v.localService) ?? voices.find((v) => v.lang.startsWith("en"));
    if (en) u.voice = en;
    window.speechSynthesis.speak(u);
  } catch {
    // voice is optional
  }
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // ignore
  }
}

export function vibrate(ms: number | number[] = 40) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // ignore
  }
}
