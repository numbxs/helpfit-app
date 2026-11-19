"use client";

import { useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { buildCues, PACER_LABEL, pacerAt, type MindPractice } from "@/engine";
import { chime, click, speak, stopSpeaking, vibrate } from "../audio";
import { fmtClock, TopBar, useInterval, useWakeLock, type PlayerProps } from "./common";

/** Guided meditations and paced breathing: timed cues, optional voice, bells, breathing circle. */
export function GuidedPlayer({ practice, minutes, voice, bells, onDone, onExit }: PlayerProps & { practice: MindPractice }) {
  const total = minutes * 60;
  const cues = useMemo(() => buildCues(practice, minutes), [practice, minutes]);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pausedMs, setPausedMs] = useState(0);
  const lastCue = useRef(-1);
  const lastPhase = useRef("");
  const finished = useRef(false);
  const started = useRef(false);
  useWakeLock(true);

  const elapsedAt = (t: number) => (t - startedAt - pausedMs) / 1000;
  const elapsed = elapsedAt(pausedAt ?? now);

  useInterval(
    () => {
      const t = Date.now();
      setNow(t);
      const e = elapsedAt(t);
      if (!started.current) {
        started.current = true;
        if (bells) chime("full");
      }
      const idx = cues.reduce((acc, c, i) => (c.at <= e ? i : acc), -1);
      if (idx !== lastCue.current && idx >= 0) {
        lastCue.current = idx;
        if (voice) speak(cues[idx].text);
        else if (bells && idx > 0) chime("soft");
      }
      if (practice.pacer) {
        const ps = pacerAt(practice.pacer, e);
        const key = `${ps.cycle}-${ps.phase}`;
        if (key !== lastPhase.current) {
          lastPhase.current = key;
          if (voice && ps.cycle < 2 && idx < 0) speak(PACER_LABEL[ps.phase]);
          else if (bells) click();
          vibrate(ps.phase === "inhale" ? 30 : 15);
        }
      }
      if (e >= total && !finished.current) {
        finished.current = true;
        stopSpeaking();
        if (bells) chime("full");
        onDone({ completed: true, actualMinutes: minutes, extra: {}, summary: [{ label: "Time", value: `${minutes} min` }] });
      }
    },
    200,
    pausedAt === null,
  );

  const cue = [...cues].reverse().find((c) => c.at <= elapsed);
  const pacer = practice.pacer ? pacerAt(practice.pacer, elapsed) : null;
  const scale = pacer ? 0.45 + pacer.scale * 0.55 : 0.75 + 0.05 * Math.sin(elapsed / 2);

  const end = () => {
    finished.current = true;
    stopSpeaking();
    const done = elapsed >= total * 0.8;
    onDone({ completed: done, actualMinutes: Math.round((elapsed / 60) * 10) / 10, extra: {}, summary: [{ label: "Time", value: fmtClock(elapsed) }] });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar title={practice.name} onExit={end} progress={elapsed / total} right={fmtClock(total - elapsed)} />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6 text-center">
        <div className="relative flex size-64 items-center justify-center" aria-hidden>
          <div className="absolute inset-0 rounded-full bg-mind/10" />
          <div
            className="absolute rounded-full bg-mind/25 blur-[2px]"
            style={{ inset: 0, transform: `scale(${scale})`, transition: "transform 220ms linear" }}
          />
          <div className="absolute rounded-full bg-mind" style={{ inset: "34%", transform: `scale(${0.6 + scale * 0.4})`, transition: "transform 220ms linear", opacity: 0.9 }} />
          {pacer && (
            <div className="relative z-10 text-center text-mind-foreground">
              <p className="text-lg font-semibold">{PACER_LABEL[pacer.phase]}</p>
              <p className="text-3xl font-semibold tabular-nums">{pacer.secondsLeft}</p>
            </div>
          )}
        </div>
        <p className="min-h-24 max-w-sm text-[20px] font-medium leading-relaxed" aria-live="polite">
          {cue?.text ?? (pacer ? "Follow the circle." : "")}
        </p>
      </div>
      <div className="pb-safe grid grid-cols-2 gap-2 pb-4">
        <button
          type="button"
          onClick={() => {
            if (pausedAt === null) {
              setPausedAt(Date.now());
              stopSpeaking();
            } else {
              setPausedMs((m) => m + (Date.now() - pausedAt));
              setPausedAt(null);
            }
          }}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl border bg-card font-semibold"
        >
          {pausedAt === null ? <Pause className="size-5" /> : <Play className="size-5" />}
          {pausedAt === null ? "Pause" : "Resume"}
        </button>
        <button type="button" onClick={onExit} className="h-14 rounded-2xl font-semibold text-muted-foreground">
          Leave without saving
        </button>
      </div>
    </div>
  );
}
