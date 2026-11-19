"use client";

import { useRef, useState } from "react";
import { breathCountAccuracy, scoreBreathCount, type BreathTap } from "@/engine";
import { chime, vibrate } from "../audio";
import { BigButton, fmtClock, TopBar, useInterval, useWakeLock, type PlayerProps } from "./common";

/** Breath counting: COUNT on exhales 1–9, TEN on the tenth. The count is never shown — that's the point. */
export function BreathCountPlayer({ minutes, bells, onDone, onExit }: PlayerProps) {
  const total = minutes * 60;
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [rounds, setRounds] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const taps = useRef<BreathTap[]>([]);
  const done = useRef(false);
  useWakeLock(true);
  const elapsed = (now - startedAt) / 1000;

  const finish = (completed: boolean) => {
    if (done.current) return;
    done.current = true;
    if (bells) chime("full");
    const m = scoreBreathCount(taps.current);
    const acc = breathCountAccuracy(m);
    onDone({
      completed,
      actualMinutes: Math.round(((Date.now() - startedAt) / 60000) * 10) / 10,
      extra: { breathCount: { correctRounds: m.correctRounds, errors: m.errors, lostCount: m.lostCount } },
      summary: [
        { label: "Rounds of 10", value: String(m.correctRounds) },
        { label: "Miscounts", value: String(m.errors) },
        { label: "Lost count", value: String(m.lostCount) },
        { label: "Accuracy", value: acc === null ? "–" : `${Math.round(acc * 100)}%` },
      ],
    });
  };

  useInterval(() => {
    const t = Date.now();
    setNow(t);
    if ((t - startedAt) / 1000 >= total) finish(true);
  }, 250);

  const tap = (t: BreathTap) => {
    taps.current.push(t);
    vibrate(t === "count" ? 15 : 40);
    const s = scoreBreathCount(taps.current);
    if (t === "ten") {
      setRounds(s.correctRounds);
      setFlash(s.correctRounds > rounds ? "Round complete" : "Miscount — start again at 1");
    } else if (t === "lost") setFlash("No problem — start again at 1");
    else setFlash(null);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar title="Breath counting" onExit={() => finish(elapsed >= total * 0.8)} progress={elapsed / total} right={fmtClock(total - elapsed)} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Rounds completed</p>
        <p className="text-7xl font-semibold tabular-nums">{rounds}</p>
        <p className="min-h-6 text-[15px] text-muted-foreground" aria-live="polite">
          {flash ?? "Count silently. Tap COUNT on each out-breath."}
        </p>
      </div>
      <div className="pb-safe space-y-2 pb-4">
        <BigButton className="min-h-28 w-full text-2xl" onClick={() => tap("count")} aria-label="Count — breaths 1 to 9">
          COUNT
        </BigButton>
        <div className="grid grid-cols-2 gap-2">
          <BigButton tone="outline" onClick={() => tap("ten")} aria-label="Ten — tenth breath">
            TEN
          </BigButton>
          <BigButton tone="outline" onClick={() => tap("lost")}>
            Lost count
          </BigButton>
        </div>
        <button type="button" onClick={onExit} className="h-11 w-full text-sm font-semibold text-muted-foreground">
          Leave without saving
        </button>
      </div>
    </div>
  );
}
