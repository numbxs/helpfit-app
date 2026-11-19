"use client";

import { useMemo, useRef, useState } from "react";
import { SART_DIGIT_MS, SART_NO_GO, SART_TRIAL_MS, sartNoGoAccuracy, sartSequence, scoreSart, type SartResponse } from "@/engine";
import { Countdown, TopBar, useInterval, useWakeLock, type PlayerProps } from "./common";

const LEAD_MS = 3000;

/** Sustained attention: tap for every digit except 3. */
export function SartPlayer({ minutes, seed, onDone, onExit }: PlayerProps) {
  const seq = useMemo(() => sartSequence(seed, minutes), [seed, minutes]);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const rts = useRef<(number | null)[]>(seq.map(() => null));
  const done = useRef(false);
  useWakeLock(true);
  const t0 = startedAt + LEAD_MS;
  const trial = Math.floor((now - t0) / SART_TRIAL_MS);
  const inTrial = now - t0 - trial * SART_TRIAL_MS;

  const finish = (completed: boolean) => {
    if (done.current) return;
    done.current = true;
    const upto = completed ? seq.length : Math.max(0, Math.min(seq.length, Math.floor((Date.now() - t0) / SART_TRIAL_MS)));
    const responses: SartResponse[] = seq.slice(0, upto).map((digit, i) => ({ digit, rtMs: rts.current[i] }));
    const m = scoreSart(responses);
    const acc = sartNoGoAccuracy(m);
    onDone({
      completed,
      actualMinutes: Math.round(((Date.now() - startedAt) / 60000) * 10) / 10,
      extra: { sart: m },
      summary: [
        { label: "Withheld on 3", value: acc === null ? "–" : `${Math.round(acc * 100)}%` },
        { label: "Missed taps", value: String(m.omissionErrors) },
        { label: "Avg reaction", value: m.meanRtMs ? `${m.meanRtMs} ms` : "–" },
        { label: "Steadiness (CV)", value: m.rtCv !== null ? m.rtCv.toFixed(2) : "–" },
      ],
    });
  };

  useInterval(() => {
    const t = Date.now();
    setNow(t);
    if (t - t0 >= seq.length * SART_TRIAL_MS) finish(true);
  }, 30);

  const tap = () => {
    const t = Date.now();
    const i = Math.floor((t - t0) / SART_TRIAL_MS);
    if (i < 0 || i >= seq.length || rts.current[i] !== null) return;
    rts.current[i] = t - (t0 + i * SART_TRIAL_MS);
  };

  const progress = Math.max(0, (now - t0) / (seq.length * SART_TRIAL_MS));

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar title={`Steady tap · don't tap on ${SART_NO_GO}`} onExit={() => finish(false)} progress={progress} />
      {now < t0 ? (
        <Countdown msLeft={t0 - now} />
      ) : (
        <button
          type="button"
          onPointerDown={tap}
          onKeyDown={(e) => (e.key === " " || e.key === "Enter") && tap()}
          aria-label="Tap for every digit except 3"
          className="mb-4 flex flex-1 select-none items-center justify-center rounded-[2rem] border bg-card text-[9rem] font-semibold tabular-nums leading-none"
        >
          {inTrial < SART_DIGIT_MS && trial < seq.length ? seq[trial] : <span className="text-6xl text-muted-foreground/50">⊗</span>}
        </button>
      )}
      <p className="pb-safe pb-4 text-center text-sm text-muted-foreground">Tap anywhere for each digit. Hold back on {SART_NO_GO}.</p>
      <button type="button" onClick={onExit} className="mb-4 h-11 text-sm font-semibold text-muted-foreground">
        Leave without saving
      </button>
    </div>
  );
}
