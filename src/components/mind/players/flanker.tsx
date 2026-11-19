"use client";

import { useMemo, useRef, useState } from "react";
import { flankerArrows, flankerSequence, scoreFlanker, type FlankerResponse } from "@/engine";
import { cn } from "@/lib/utils";
import { BigButton, Countdown, TopBar, useInterval, useWakeLock, type PlayerProps } from "./common";

const LEAD_MS = 3000;
const FIX_MS = 450;
const TIMEOUT_MS = 2000;

/** Selective attention: respond to the middle arrow, ignore the flankers. */
export function FlankerPlayer({ minutes, seed, onDone, onExit }: PlayerProps) {
  const trials = useMemo(() => flankerSequence(seed, minutes), [seed, minutes]);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [index, setIndex] = useState(0);
  const [trialStart, setTrialStart] = useState(startedAt + LEAD_MS);
  const [feedback, setFeedback] = useState<"ok" | "bad" | null>(null);
  const responses = useRef<FlankerResponse[]>([]);
  const done = useRef(false);
  useWakeLock(true);
  const stimOn = trialStart + FIX_MS;

  const finish = (completed: boolean) => {
    if (done.current) return;
    done.current = true;
    const m = scoreFlanker(responses.current);
    onDone({
      completed,
      actualMinutes: Math.round(((Date.now() - startedAt) / 60000) * 10) / 10,
      extra: { flanker: m },
      summary: [
        { label: "Accuracy", value: `${Math.round(m.accuracy * 100)}%` },
        { label: "Distraction cost", value: m.interferenceMs !== null ? `${m.interferenceMs} ms` : "–" },
        { label: "Matching arrows", value: m.congruentRtMs ? `${m.congruentRtMs} ms` : "–" },
        { label: "Conflicting arrows", value: m.incongruentRtMs ? `${m.incongruentRtMs} ms` : "–" },
      ],
    });
  };

  const record = (answer: "left" | "right" | null, t: number) => {
    if (done.current || index >= trials.length || t < stimOn) return;
    const trial = trials[index];
    responses.current.push({ trial, answer, rtMs: answer ? t - stimOn : TIMEOUT_MS });
    setFeedback(answer === trial.direction ? "ok" : "bad");
    if (index + 1 >= trials.length) finish(true);
    else {
      setIndex(index + 1);
      setTrialStart(t + 250);
    }
  };

  useInterval(() => {
    const t = Date.now();
    setNow(t);
    if (t >= stimOn + TIMEOUT_MS) record(null, t);
    if (feedback && t > trialStart + 200) setFeedback(null);
  }, 30);

  const showStim = now >= stimOn && index < trials.length;
  return (
    <div className="flex min-h-dvh flex-col" onKeyDown={(e) => (e.key === "ArrowLeft" ? record("left", Date.now()) : e.key === "ArrowRight" ? record("right", Date.now()) : undefined)}>
      <TopBar title="Arrow focus · middle arrow only" onExit={() => finish(false)} progress={index / trials.length} right={`${index}/${trials.length}`} />
      {now < startedAt + LEAD_MS ? (
        <Countdown msLeft={startedAt + LEAD_MS - now} />
      ) : (
        <div
          className={cn(
            "mb-4 flex flex-1 select-none items-center justify-center rounded-[2rem] border bg-card font-mono text-6xl tracking-[0.15em] transition-colors sm:text-7xl",
            feedback === "bad" && "border-destructive",
            feedback === "ok" && "border-mind",
          )}
          aria-live="off"
        >
          {showStim ? flankerArrows(trials[index]) : <span className="text-4xl text-muted-foreground/50">+</span>}
        </div>
      )}
      <div className="pb-safe grid grid-cols-2 gap-2 pb-2">
        <BigButton className="min-h-24 text-4xl" onPointerDown={() => record("left", Date.now())} aria-label="Left">
          ←
        </BigButton>
        <BigButton className="min-h-24 text-4xl" onPointerDown={() => record("right", Date.now())} aria-label="Right">
          →
        </BigButton>
      </div>
      <button type="button" onClick={onExit} className="mb-4 h-11 text-sm font-semibold text-muted-foreground">
        Leave without saving
      </button>
    </div>
  );
}
