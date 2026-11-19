"use client";

import { useRef, useState } from "react";
import { NBACK_STIMULUS_MS, NBACK_TRIAL_MS, nbackBlock, nextNBackLevel, scoreNBackBlock, summariseNBack, type NBackBlock } from "@/engine";
import { BigButton, Countdown, TopBar, useInterval, useWakeLock, type PlayerProps } from "./common";

const LEAD_MS = 3000;

/** Adaptive n-back: level rises after strong blocks and falls after weak ones. */
export function NBackPlayer({ minutes, seed, startLevel, onDone, onExit }: PlayerProps & { startLevel: number }) {
  const totalBlocks = minutes >= 5 ? 5 : 3;
  const [startedAt] = useState(() => Date.now());
  const [level, setLevel] = useState(Math.max(1, startLevel));
  const [blockIdx, setBlockIdx] = useState(0);
  const [block, setBlock] = useState(() => nbackBlock(`${seed}|0`, Math.max(1, startLevel)));
  const [blockStart, setBlockStart] = useState(startedAt + LEAD_MS);
  const [phase, setPhase] = useState<"run" | "between">("run");
  const [now, setNow] = useState(startedAt);
  const [pressed, setPressed] = useState(false);
  const [last, setLast] = useState<NBackBlock | null>(null);
  const responses = useRef<boolean[]>([]);
  const results = useRef<NBackBlock[]>([]);
  const done = useRef(false);
  useWakeLock(true);

  const trial = Math.floor((now - blockStart) / NBACK_TRIAL_MS);
  const inTrial = now - blockStart - trial * NBACK_TRIAL_MS;

  const finish = (completed: boolean) => {
    if (done.current) return;
    done.current = true;
    const m = summariseNBack(results.current, Math.max(1, startLevel));
    onDone({
      completed,
      actualMinutes: Math.round(((Date.now() - startedAt) / 60000) * 10) / 10,
      extra: { nback: m },
      summary: [
        { label: "Accuracy", value: `${Math.round(m.accuracy * 100)}%` },
        { label: "Level", value: `${m.startLevel}-back → ${m.endLevel}-back` },
        { label: "Blocks", value: String(m.blocks.length) },
      ],
    });
  };

  useInterval(
    () => {
      const t = Date.now();
      setNow(t);
      const tr = Math.floor((t - blockStart) / NBACK_TRIAL_MS);
      if (tr >= block.letters.length) {
        const r = scoreNBackBlock(level, block.targets, block.letters.map((_, i) => responses.current[i] ?? false));
        results.current.push(r);
        setLast(r);
        if (results.current.length >= totalBlocks) finish(true);
        else setPhase("between");
      }
    },
    40,
    phase === "run",
  );

  const match = () => {
    const t = Date.now();
    const i = Math.floor((t - blockStart) / NBACK_TRIAL_MS);
    if (phase !== "run" || i < 0 || i >= block.letters.length || responses.current[i]) return;
    responses.current[i] = true;
    setPressed(true);
    window.setTimeout(() => setPressed(false), 180);
  };

  const nextLevel = last ? nextNBackLevel(last) : level;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar title={`Memory track · ${level}-back`} onExit={() => finish(false)} progress={(blockIdx + (phase === "run" ? Math.max(0, trial) / block.letters.length : 1)) / totalBlocks} right={`${blockIdx + 1}/${totalBlocks}`} />
      {phase === "between" && last ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Block {blockIdx + 1} done</p>
          <p className="text-3xl font-semibold">
            {last.hits}/{last.targets} matches · {last.falseAlarms} false alarm{last.falseAlarms === 1 ? "" : "s"}
          </p>
          <p className="text-muted-foreground">Next block: {nextLevel}-back{nextLevel > level ? " — level up" : nextLevel < level ? " — easing off" : ""}</p>
          <BigButton
            className="mt-4 w-56"
            onClick={() => {
              const nb = blockIdx + 1;
              setBlockIdx(nb);
              setLevel(nextLevel);
              setBlock(nbackBlock(`${seed}|${nb}`, nextLevel));
              responses.current = [];
              setBlockStart(Date.now() + 2000);
              setPhase("run");
            }}
          >
            Continue
          </BigButton>
        </div>
      ) : now < blockStart ? (
        <Countdown msLeft={blockStart - now} />
      ) : (
        <div className="mb-4 flex flex-1 flex-col items-center justify-center rounded-[2rem] border bg-card">
          <p className="text-[9rem] font-semibold leading-none">{inTrial < NBACK_STIMULUS_MS && trial < block.letters.length ? block.letters[trial] : ""}</p>
          <p className="mt-6 text-sm text-muted-foreground">Same as {level} letter{level === 1 ? "" : "s"} back? Tap MATCH.</p>
        </div>
      )}
      {phase === "run" && (
        <div className="pb-safe pb-2">
          <BigButton className={`min-h-24 w-full text-2xl ${pressed ? "scale-[0.97] opacity-80" : ""}`} onPointerDown={match} onKeyDown={(e) => e.key === " " && match()}>
            MATCH
          </BigButton>
        </div>
      )}
      <button type="button" onClick={onExit} className="mb-4 h-11 text-sm font-semibold text-muted-foreground">
        Leave without saving
      </button>
    </div>
  );
}
